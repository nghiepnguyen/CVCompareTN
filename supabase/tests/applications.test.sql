-- P2A applications + immutable snapshots. Disposable DB only; fixtures roll back.
-- Run: supabase/tests/local/run.sh "$PWD" /repo/tests/applications.test.sql
BEGIN;
CREATE FUNCTION pg_temp.set_user(u uuid, jwt_role text DEFAULT 'authenticated') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role',jwt_role)::text, true);
 PERFORM set_config('request.jwt.claim.sub', coalesce(u::text,''), true);
 PERFORM set_config('request.jwt.claim.role', jwt_role, true);
END $$;
-- save_application with valid defaults. `intent` names the Save intent: it maps
-- to a stable idempotency key. Override arguments via jsonb.
CREATE FUNCTION pg_temp.save(intent text, o jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.save_application(
  md5(intent)::uuid,
  o->>'source',
  coalesce(o->>'language','vi'),
  coalesce(o->>'role','Backend Engineer'),
  o->>'company',
  CASE WHEN o ? 'cv' THEN o->'cv' ELSE '{"personal_information":{"full_name":"A"}}'::jsonb END,
  'cv.pdf',
  CASE WHEN o ? 'jd' THEN o->>'jd' ELSE 'We need Go and Postgres.' END,
  CASE WHEN o ? 'analysis' THEN o->'analysis' ELSE '{"matchScore":72,"requirements":[{"requirement":"Go","status":"matched"}]}'::jsonb END,
  o->>'letter',
  o->>'letter_language');
$$;
-- Expects the statement to fail with the given SQLSTATE (and message, when given).
CREATE FUNCTION pg_temp.fails(stmt text, state text, msg text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE stmt;
 RAISE EXCEPTION 'expected % from: %', state, stmt;
EXCEPTION WHEN OTHERS THEN
 IF SQLSTATE <> state OR SQLERRM IS DISTINCT FROM coalesce(msg, SQLERRM) THEN
  RAISE EXCEPTION 'expected % % got % (%) from: %', state, msg, SQLSTATE, SQLERRM, stmt;
 END IF;
END $$;
CREATE FUNCTION pg_temp.doc(app uuid, t text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('content', content, 'metadata', metadata) FROM public.application_documents WHERE application_id=app AND document_type=t;
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

DO $$
DECLARE sig text := 'public.save_application(uuid,text,text,text,text,jsonb,text,text,jsonb,text,text)';
BEGIN
 ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.applications'::regclass), 'applications RLS off';
 ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.application_documents'::regclass), 'documents RLS off';
 ASSERT NOT has_table_privilege('authenticated','public.applications','INSERT'), 'authenticated can INSERT applications';
 ASSERT NOT has_table_privilege('authenticated','public.applications','UPDATE'), 'authenticated can UPDATE applications';
 ASSERT NOT has_table_privilege('authenticated','public.application_documents','INSERT'), 'authenticated can INSERT documents';
 ASSERT NOT has_table_privilege('authenticated','public.application_documents','UPDATE'), 'authenticated can UPDATE documents';
 ASSERT NOT has_table_privilege('authenticated','public.application_documents','DELETE'), 'authenticated can DELETE documents';
 ASSERT NOT has_table_privilege('anon','public.applications','SELECT,INSERT,UPDATE,DELETE'), 'anon has applications privileges';
 ASSERT NOT has_table_privilege('anon','public.application_documents','SELECT,INSERT,UPDATE,DELETE'), 'anon has documents privileges';
 ASSERT NOT has_function_privilege('anon', sig, 'EXECUTE'), 'anon can save';
 ASSERT has_function_privilege('authenticated', sig, 'EXECUTE'), 'authenticated cannot save';
 ASSERT (SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid=sig::regprocedure), 'save_application must be DEFINER with empty search_path';
 -- History is not P2A authority: the RPC must not read it.
 ASSERT (SELECT prosrc NOT ILIKE '%history%' FROM pg_proc WHERE oid=sig::regprocedure), 'save_application depends on history';
 -- Provenance is not identity: no uniqueness / index on source_analysis_id.
 ASSERT NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum = ANY(i.indkey)
   WHERE i.indrelid='public.applications'::regclass AND a.attname='source_analysis_id'), 'source_analysis_id is indexed/unique';
 ASSERT (SELECT tgenabled FROM pg_trigger WHERE tgname='application_documents_immutable')='O', 'immutability trigger not enabled';
END $$;

DO $$
DECLARE
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); locked uuid:=gen_random_uuid();
 r jsonb; r2 jsonb; app uuid; app_letter uuid; n integer; cv_before jsonb; jd_before jsonb;
BEGIN
 PERFORM pg_temp.set_user(NULL,'service_role');
 INSERT INTO auth.users(id) VALUES(a),(b),(locked);
 INSERT INTO public.profiles(id,role,has_permission,plan) VALUES(a,'user',true,'free'),(b,'user',true,'free'),(locked,'user',false,'free');
 INSERT INTO public.applications(user_id,idempotency_key,language) VALUES(locked,gen_random_uuid(),'vi');
 INSERT INTO public.application_documents(application_id,user_id,document_type,content)
  SELECT id,locked,'jd','{"text":"x"}' FROM public.applications WHERE user_id=locked;

 SET LOCAL ROLE authenticated;

 -- AUTH: no JWT subject -> rejected.
 PERFORM pg_temp.set_user(NULL);
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('anon')$q$, '42501', 'not_authenticated');

 -- Owner save without any history row and without provenance: CV + JD.
 PERFORM pg_temp.set_user(a);
 ASSERT NOT EXISTS (SELECT 1 FROM public.history), 'fixture expects empty history';
 r := pg_temp.save('a-1', '{"source":"analysis-1"}');
 ASSERT (r->>'created')::boolean, 'first save not created';
 app := (r->>'id')::uuid;
 SELECT count(*) INTO n FROM public.application_documents WHERE application_id=app;
 ASSERT n=2, format('cv+jd expected 2 documents, got %s', n);
 ASSERT (SELECT user_id FROM public.applications WHERE id=app)=a, 'owner not auth.uid()';
 ASSERT (SELECT status FROM public.applications WHERE id=app)='drafted', 'save must not mean applied';
 ASSERT (SELECT source_analysis_id FROM public.applications WHERE id=app)='analysis-1', 'provenance not kept';
 ASSERT pg_temp.doc(app,'jd')->'content'->>'text'='We need Go and Postgres.', 'jd text not snapshotted';
 ASSERT (pg_temp.doc(app,'jd')->'metadata'->'analysis'->>'matchScore')::int=72, 'score not frozen';
 ASSERT pg_temp.doc(app,'cv')->'metadata'->>'snapshotVersion'='1', 'snapshotVersion missing';
 cv_before := pg_temp.doc(app,'cv'); jd_before := pg_temp.doc(app,'jd');
 r := pg_temp.save('a-noprov');
 ASSERT (r->>'created')::boolean AND (SELECT source_analysis_id FROM public.applications WHERE id=(r->>'id')::uuid) IS NULL, 'provenance must be optional';

 -- REPLAY (same key): same id, created=false, nothing written, original A kept
 -- even when the replayed CV/JD/letter differ (no late letter attaches itself).
 r2 := pg_temp.save('a-1', '{"source":"analysis-1","cv":{"personal_information":{"full_name":"B"}},"jd":"JD B","letter":"Letter B","letter_language":"en"}');
 ASSERT (r2->>'id')::uuid = app AND NOT (r2->>'created')::boolean, 'replay not idempotent';
 SELECT count(*) INTO n FROM public.application_documents WHERE application_id=app;
 ASSERT n=2, format('replay changed document count: %s', n);
 ASSERT pg_temp.doc(app,'cv')=cv_before AND pg_temp.doc(app,'jd')=jd_before, 'replay mutated snapshots';

 -- SEPARATE explicit Save (new key) from the same analysis -> a new application.
 r2 := pg_temp.save('a-1-again', '{"source":"analysis-1"}');
 ASSERT (r2->>'created')::boolean AND (r2->>'id')::uuid <> app, 'equal provenance deduplicated a separate save';

 -- CV + JD + cover letter.
 r := pg_temp.save('a-2', '{"letter":"Kính gửi ...","letter_language":"vi","company":"Acme"}');
 app_letter := (r->>'id')::uuid;
 ASSERT (SELECT count(*) FROM public.application_documents WHERE application_id=app_letter)=3, 'letter not snapshotted';
 ASSERT (SELECT company_name FROM public.applications WHERE id=app_letter)='Acme', 'company missing';

 -- VALIDATION: every rejection leaves no rows behind.
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-1','{"cv":{}}')$q$, '22023', 'invalid_application');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-2','{"cv":"text"}')$q$, '22023', 'invalid_application');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-3','{"jd":"   "}')$q$, '22023', 'invalid_application');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-4', jsonb_build_object('jd', repeat('x',50001)))$q$, '22023', 'invalid_application');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-5','{"language":"fr"}')$q$, '22023', 'invalid_application');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-6','{"analysis":{"matchScore":"72","requirements":[]}}')$q$, '22023', 'invalid_application');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-7','{"analysis":{"matchScore":72}}')$q$, '22023', 'invalid_application');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-8', jsonb_build_object('letter', repeat('x',10001), 'letter_language','vi'))$q$, '22023', 'invalid_application');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-9','{"letter":"Hi","letter_language":"de"}')$q$, '22023', 'invalid_application');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-10', jsonb_build_object('cv', jsonb_build_object('blob', repeat('x',200001))))$q$, '22023', 'invalid_application');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-11','{"source":""}')$q$, '22023', 'invalid_application');
 PERFORM pg_temp.fails($q$SELECT public.save_application(NULL,NULL,'vi',NULL,NULL,'{"x":1}','cv','JD','{"matchScore":1,"requirements":[]}')$q$, '22023', 'invalid_application');
 ASSERT (SELECT count(*) FROM public.applications WHERE user_id=a)=4, 'rejected save left an application row';

 -- IMMUTABILITY: the owner cannot change content, type or parent.
 PERFORM pg_temp.fails(format($q$UPDATE public.application_documents SET content='{"text":"x"}' WHERE application_id=%L$q$, app), '42501');
 PERFORM pg_temp.fails(format($q$UPDATE public.application_documents SET document_type='cover_letter' WHERE application_id=%L$q$, app), '42501');
 PERFORM pg_temp.fails(format($q$UPDATE public.application_documents SET application_id=%L WHERE application_id=%L$q$, app_letter, app), '42501');
 PERFORM pg_temp.fails(format($q$UPDATE public.applications SET status='drafted' WHERE id=%L$q$, app), '42501');
 -- No direct INSERT path (spoofed or own user_id) and no document DELETE.
 PERFORM pg_temp.fails(format($q$INSERT INTO public.applications(user_id,idempotency_key,language) VALUES(%L,gen_random_uuid(),'vi')$q$, b), '42501');
 PERFORM pg_temp.fails(format($q$INSERT INTO public.applications(user_id,idempotency_key,language) VALUES(%L,gen_random_uuid(),'vi')$q$, a), '42501');
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_documents(application_id,user_id,document_type,content) VALUES(%L,%L,'cover_letter','{"text":"x"}')$q$, app, a), '42501');
 PERFORM pg_temp.fails(format($q$DELETE FROM public.application_documents WHERE application_id=%L$q$, app), '42501');

 -- CROSS-USER: B sees nothing of A, cannot delete it, cannot add to it.
 PERFORM pg_temp.set_user(b);
 ASSERT (SELECT count(*) FROM public.applications)=0, 'B reads A applications';
 ASSERT (SELECT count(*) FROM public.application_documents)=0, 'B reads A documents';
 DELETE FROM public.applications WHERE id=app;
 GET DIAGNOSTICS n = ROW_COUNT;
 ASSERT n=0, 'B deleted A application';
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_documents(application_id,user_id,document_type,content) VALUES(%L,%L,'cover_letter','{"text":"x"}')$q$, app, b), '42501');
 -- Same key and same provenance as A: B gets its own row; keys are scoped per user.
 r2 := pg_temp.save('a-1', '{"source":"analysis-1"}');
 ASSERT (r2->>'id')::uuid <> app AND (r2->>'created')::boolean, 'B save collided with A';

 -- Locked account cannot save or read.
 PERFORM pg_temp.set_user(locked);
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('locked-run')$q$, '42501', 'account_locked');
 ASSERT (SELECT count(*) FROM public.applications)=0, 'locked user reads applications';
 ASSERT (SELECT count(*) FROM public.application_documents)=0, 'locked user reads documents';

 -- HISTORY DECOUPLING: deleting history has no effect on saving or reading.
 PERFORM pg_temp.set_user(a);
 INSERT INTO public.history(user_id,analysis_id) VALUES(a,'analysis-1');
 DELETE FROM public.history WHERE user_id=a;
 ASSERT (SELECT count(*) FROM public.applications)=4, 'history delete affected applications';
 ASSERT pg_temp.doc(app,'cv')=cv_before AND pg_temp.doc(app,'jd')=jd_before, 'history delete affected snapshots';
 ASSERT (pg_temp.save('a-after-history')->>'created')::boolean, 'save after history delete failed';

 -- Owner delete cascades to documents.
 DELETE FROM public.applications WHERE id=app;
 GET DIAGNOSTICS n = ROW_COUNT;
 ASSERT n=1, 'owner cannot delete own application';
 RESET ROLE;
 PERFORM pg_temp.set_user(NULL,'service_role'); -- admin hard delete runs as service_role
 ASSERT NOT EXISTS (SELECT 1 FROM public.application_documents WHERE application_id=app), 'orphan documents after delete';
 -- Strict invariant: service_role also cannot rewrite a snapshot.
 SET LOCAL ROLE service_role;
 PERFORM pg_temp.fails($q$UPDATE public.application_documents SET metadata='{}'$q$, '42501', 'application_document_immutable');
 RESET ROLE;
 -- documents.user_id must match the application owner.
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_documents(application_id,user_id,document_type,content) VALUES(%L,%L,'cover_letter','{"x":1}')$q$, (SELECT id FROM public.applications WHERE user_id=a AND idempotency_key=md5('a-noprov')::uuid), b), '23503');

 -- Account deletion removes applications and documents.
 DELETE FROM auth.users WHERE id=a;
 ASSERT NOT EXISTS (SELECT 1 FROM public.applications WHERE user_id=a), 'account delete left applications';
 ASSERT NOT EXISTS (SELECT 1 FROM public.application_documents WHERE user_id=a), 'account delete left documents';
END $$;

-- OPERATIONAL RECOVERY: only an explicit owner-run schema change can lift the invariant.
DO $$
DECLARE d uuid;
BEGIN
 SELECT id INTO d FROM public.application_documents LIMIT 1;
 ALTER TABLE public.application_documents DISABLE TRIGGER application_documents_immutable;
 UPDATE public.application_documents SET metadata = metadata || '{"repaired":true}' WHERE id=d;
 ALTER TABLE public.application_documents ENABLE TRIGGER application_documents_immutable;
 ASSERT (SELECT metadata->>'repaired' FROM public.application_documents WHERE id=d)='true', 'migration repair path failed';
 PERFORM pg_temp.fails($q$UPDATE public.application_documents SET metadata='{}'$q$, '42501', 'application_document_immutable');
END $$;

-- ATOMICITY: a failure at any document (cv, jd, cover_letter) rolls everything back.
CREATE FUNCTION pg_temp.boom() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.document_type = current_setting('test.fail_type') THEN RAISE EXCEPTION 'injected_failure' USING ERRCODE = 'XX001'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_boom BEFORE INSERT ON public.application_documents FOR EACH ROW EXECUTE FUNCTION pg_temp.boom();
DO $$
DECLARE c uuid:=gen_random_uuid(); n integer; t text;
BEGIN
 PERFORM pg_temp.set_user(NULL,'service_role');
 INSERT INTO auth.users(id) VALUES(c);
 INSERT INTO public.profiles(id,role,has_permission,plan) VALUES(c,'user',true,'free');
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.set_user(c);
 FOREACH t IN ARRAY ARRAY['cv','jd','cover_letter'] LOOP
  PERFORM set_config('test.fail_type', t, true);
  PERFORM pg_temp.fails(format($q$SELECT pg_temp.save(%L,'{"letter":"Hi","letter_language":"en"}')$q$, 'rb-'||t), 'XX001', 'injected_failure');
 END LOOP;
 PERFORM set_config('test.fail_type','none',true);
 RESET ROLE;
 SELECT count(*) INTO n FROM public.applications WHERE user_id=c;
 ASSERT n=0, format('rolled-back save left %s application rows', n);
 SELECT count(*) INTO n FROM public.application_documents WHERE user_id=c;
 ASSERT n=0, format('rolled-back save left %s documents', n);

 -- NO HIDDEN CAP: a free user past History's paid retention (500) still saves.
 PERFORM pg_temp.set_user(NULL,'service_role');
 INSERT INTO public.applications(user_id,idempotency_key,language)
  SELECT c,gen_random_uuid(),'vi' FROM generate_series(1,600);
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.set_user(c);
 ASSERT (pg_temp.save('beyond-history-limit')->>'created')::boolean, 'applications coupled to a history-style cap';
 -- And the failed intents above can be retried with the same key once healthy.
 ASSERT (pg_temp.save('rb-jd')->>'created')::boolean, 'rolled-back key cannot be retried';
 RESET ROLE;
END $$;
ROLLBACK;
