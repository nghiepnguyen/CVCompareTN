-- P2A applications + immutable snapshots. Disposable DB only; fixtures roll back.
-- Run: supabase/tests/local/run.sh "$PWD" /repo/tests/applications.test.sql
BEGIN;
CREATE FUNCTION pg_temp.set_user(u uuid, jwt_role text DEFAULT 'authenticated') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role',jwt_role)::text, true);
 PERFORM set_config('request.jwt.claim.sub', coalesce(u::text,''), true);
 PERFORM set_config('request.jwt.claim.role', jwt_role, true);
END $$;
-- Calls save_application with valid defaults; override one argument via jsonb.
CREATE FUNCTION pg_temp.save(analysis_id text, o jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.save_application(
  analysis_id,
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
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

DO $$
BEGIN
 ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.applications'::regclass), 'applications RLS off';
 ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.application_documents'::regclass), 'documents RLS off';
 ASSERT NOT has_table_privilege('authenticated','public.applications','INSERT'), 'authenticated can INSERT applications';
 ASSERT NOT has_table_privilege('authenticated','public.applications','UPDATE'), 'authenticated can UPDATE applications';
 ASSERT NOT has_table_privilege('authenticated','public.application_documents','INSERT'), 'authenticated can INSERT documents';
 ASSERT NOT has_table_privilege('authenticated','public.application_documents','UPDATE'), 'authenticated can UPDATE documents';
 ASSERT NOT has_table_privilege('authenticated','public.application_documents','DELETE'), 'authenticated can DELETE documents';
 ASSERT NOT has_table_privilege('anon','public.applications','SELECT'), 'anon can read applications';
 ASSERT NOT has_table_privilege('anon','public.application_documents','SELECT'), 'anon can read documents';
 ASSERT NOT has_function_privilege('anon','public.save_application(text,text,text,text,jsonb,text,text,jsonb,text,text)','EXECUTE'), 'anon can save';
 ASSERT has_function_privilege('authenticated','public.save_application(text,text,text,text,jsonb,text,text,jsonb,text,text)','EXECUTE'), 'authenticated cannot save';
 ASSERT (SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE proname='save_application'), 'save_application must be DEFINER with empty search_path';
END $$;

DO $$
DECLARE
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); locked uuid:=gen_random_uuid();
 r jsonb; r2 jsonb; app uuid; n integer;
BEGIN
 PERFORM pg_temp.set_user(NULL,'service_role');
 INSERT INTO auth.users(id) VALUES(a),(b),(locked);
 INSERT INTO public.profiles(id,role,has_permission) VALUES(a,'user',true),(b,'user',true),(locked,'user',false);
 INSERT INTO public.history(user_id,analysis_id) VALUES(b,'b-run'),(a,'a-hist');
 INSERT INTO public.applications(id,user_id,source_analysis_id,language) VALUES(gen_random_uuid(),locked,'locked-old','vi');
 INSERT INTO public.application_documents(application_id,user_id,document_type,content)
  SELECT id,locked,'jd','{"text":"x"}' FROM public.applications WHERE user_id=locked;

 SET LOCAL ROLE authenticated;

 -- AUTH: no JWT subject -> rejected, nothing written.
 PERFORM pg_temp.set_user(NULL);
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('anon-run')$q$, '42501', 'not_authenticated');

 -- Owner save: CV + JD, no letter.
 PERFORM pg_temp.set_user(a);
 r := pg_temp.save('a-1');
 ASSERT (r->>'created')::boolean, 'first save not created';
 app := (r->>'id')::uuid;
 SELECT count(*) INTO n FROM public.application_documents WHERE application_id=app;
 ASSERT n=2, format('cv+jd expected 2 documents, got %s', n);
 ASSERT (SELECT user_id FROM public.applications WHERE id=app)=a, 'owner not auth.uid()';
 ASSERT (SELECT status FROM public.applications WHERE id=app)='drafted', 'save must not mean applied';
 ASSERT (SELECT content->>'text' FROM public.application_documents WHERE application_id=app AND document_type='jd')='We need Go and Postgres.', 'jd text not snapshotted';
 ASSERT (SELECT (metadata->'analysis'->>'matchScore')::int FROM public.application_documents WHERE application_id=app AND document_type='jd')=72, 'score not frozen';
 ASSERT (SELECT metadata->>'snapshotVersion' FROM public.application_documents WHERE application_id=app AND document_type='cv')='1', 'snapshotVersion missing';

 -- IDEMPOTENCY: same analysis again (even with a new letter) -> same id, no new rows.
 r2 := pg_temp.save('a-1', '{"letter":"Letter B","letter_language":"en"}');
 ASSERT r2->>'id' = r->>'id' AND NOT (r2->>'created')::boolean, 'duplicate save not idempotent';
 ASSERT (SELECT count(*) FROM public.applications WHERE user_id=a)=1, 'duplicate application row';
 ASSERT (SELECT count(*) FROM public.application_documents WHERE application_id=app)=2, 'duplicate save changed snapshots';

 -- CV + JD + cover letter.
 r := pg_temp.save('a-2', '{"letter":"Kính gửi ...","letter_language":"vi","company":"Acme"}');
 ASSERT (SELECT count(*) FROM public.application_documents WHERE application_id=(r->>'id')::uuid)=3, 'letter not snapshotted';
 ASSERT (SELECT company_name FROM public.applications WHERE id=(r->>'id')::uuid)='Acme', 'company missing';

 -- VALIDATION / ATOMICITY: every rejection leaves no rows behind.
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-1','{"cv":{}}')$q$, '22023');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-2','{"cv":"text"}')$q$, '22023');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-3','{"jd":"   "}')$q$, '22023');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-4', jsonb_build_object('jd', repeat('x',50001)))$q$, '22023');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-5','{"language":"fr"}')$q$, '22023');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-6','{"analysis":{"matchScore":"72","requirements":[]}}')$q$, '22023');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-7','{"analysis":{"matchScore":72}}')$q$, '22023');
 -- Valid CV/JD but invalid optional letter -> whole save rejected.
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-8', jsonb_build_object('letter', repeat('x',10001), 'letter_language','vi'))$q$, '22023');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-9','{"letter":"Hi","letter_language":"de"}')$q$, '22023');
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('bad-10', jsonb_build_object('cv', jsonb_build_object('blob', repeat('x',200001))))$q$, '22023');
 ASSERT NOT EXISTS (SELECT 1 FROM public.applications WHERE source_analysis_id LIKE 'bad-%'), 'rejected save left an application row';

 -- Foreign analysis id (in user B's history) -> rejected, nothing created.
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('b-run')$q$, '42501', 'not_allowed');
 ASSERT NOT EXISTS (SELECT 1 FROM public.applications WHERE source_analysis_id='b-run'), 'foreign analysis created a row';
 -- Own history row is fine.
 r := pg_temp.save('a-hist');
 ASSERT (r->>'created')::boolean, 'own history analysis rejected';

 -- IMMUTABILITY: the owner cannot change content, type or parent.
 PERFORM pg_temp.fails(format($q$UPDATE public.application_documents SET content='{"text":"x"}' WHERE application_id=%L$q$, app), '42501');
 PERFORM pg_temp.fails(format($q$UPDATE public.application_documents SET document_type='cover_letter' WHERE application_id=%L$q$, app), '42501');
 PERFORM pg_temp.fails(format($q$UPDATE public.application_documents SET application_id=%L WHERE application_id=%L$q$, (r->>'id'), app), '42501');
 PERFORM pg_temp.fails(format($q$UPDATE public.applications SET status='drafted' WHERE id=%L$q$, app), '42501');
 -- No direct INSERT path (spoofed user_id or own) and no document DELETE.
 PERFORM pg_temp.fails(format($q$INSERT INTO public.applications(user_id,source_analysis_id,language) VALUES(%L,'direct','vi')$q$, b), '42501');
 PERFORM pg_temp.fails(format($q$INSERT INTO public.applications(user_id,source_analysis_id,language) VALUES(%L,'direct','vi')$q$, a), '42501');
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
 -- B saving the same analysis id creates B's own row, never touches A's.
 r2 := pg_temp.save('a-1');
 ASSERT (r2->>'id')::uuid <> app AND (r2->>'created')::boolean, 'B save collided with A';

 -- Locked account cannot save or read.
 PERFORM pg_temp.set_user(locked);
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('locked-run')$q$, '42501', 'account_locked');
 ASSERT (SELECT count(*) FROM public.applications)=0, 'locked user reads applications';
 ASSERT (SELECT count(*) FROM public.application_documents)=0, 'locked user reads documents';

 -- History deletion does not touch applications.
 PERFORM pg_temp.set_user(a);
 DELETE FROM public.history WHERE user_id=a;
 ASSERT (SELECT count(*) FROM public.applications WHERE user_id=a)=3, 'history delete removed applications';

 -- Owner delete cascades to documents.
 DELETE FROM public.applications WHERE id=app;
 GET DIAGNOSTICS n = ROW_COUNT;
 ASSERT n=1, 'owner cannot delete own application';
 RESET ROLE;
 PERFORM pg_temp.set_user(NULL,'service_role'); -- admin hard delete runs as service_role
 ASSERT NOT EXISTS (SELECT 1 FROM public.application_documents WHERE application_id=app), 'orphan documents after delete';
 -- Service role also cannot rewrite a snapshot.
 PERFORM pg_temp.fails($q$UPDATE public.application_documents SET metadata='{}'$q$, '42501', 'application_document_immutable');
 -- documents.user_id must match the application owner.
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_documents(application_id,user_id,document_type,content) SELECT id,%L,'cover_letter','{"text":"x"}' FROM public.applications WHERE user_id=%L AND source_analysis_id='a-hist'$q$, b, a), '23503');

 -- Account deletion removes applications and documents.
 DELETE FROM auth.users WHERE id=a;
 ASSERT NOT EXISTS (SELECT 1 FROM public.applications WHERE user_id=a), 'account delete left applications';
 ASSERT NOT EXISTS (SELECT 1 FROM public.application_documents WHERE user_id=a), 'account delete left documents';
END $$;

-- ATOMICITY: a failure after the application row (and after documents) rolls everything back.
CREATE FUNCTION pg_temp.boom() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.document_type = current_setting('test.fail_type') THEN RAISE EXCEPTION 'injected_failure' USING ERRCODE = 'XX001'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_boom BEFORE INSERT ON public.application_documents FOR EACH ROW EXECUTE FUNCTION pg_temp.boom();
DO $$
DECLARE c uuid:=gen_random_uuid(); n integer;
BEGIN
 PERFORM pg_temp.set_user(NULL,'service_role');
 INSERT INTO auth.users(id) VALUES(c);
 INSERT INTO public.profiles(id,role,has_permission) VALUES(c,'user',true);
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.set_user(c);
 -- jd is the second document: fails after the application row and the cv row.
 PERFORM set_config('test.fail_type','jd',true);
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('rb-1')$q$, 'XX001', 'injected_failure');
 -- cover_letter is the third: fails after cv + jd.
 PERFORM set_config('test.fail_type','cover_letter',true);
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('rb-2','{"letter":"Hi","letter_language":"en"}')$q$, 'XX001', 'injected_failure');
 PERFORM set_config('test.fail_type','none',true);
 RESET ROLE;
 SELECT count(*) INTO n FROM public.applications WHERE user_id=c;
 ASSERT n=0, format('rolled-back save left %s application rows', n);
 SELECT count(*) INTO n FROM public.application_documents WHERE user_id=c;
 ASSERT n=0, format('rolled-back save left %s documents', n);

 -- CAP: at the ceiling a new analysis is refused; an existing one still answers idempotently.
 PERFORM pg_temp.set_user(NULL,'service_role');
 INSERT INTO public.applications(user_id,source_analysis_id,language)
  SELECT c,'cap-'||g,'vi' FROM generate_series(1,500) g;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.set_user(c);
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('cap-new')$q$, '42501', 'application_limit_reached');
 ASSERT NOT (pg_temp.save('cap-1')->>'created')::boolean, 'existing save blocked by cap';
END $$;
ROLLBACK;
