-- P2C follow_up_sent / contact_received events + log_application_contact. Disposable DB only; fixtures roll back.
-- Run: supabase/tests/local/run.sh "$PWD" /repo/tests/application_follow_up.test.sql
BEGIN;
CREATE FUNCTION pg_temp.set_user(u uuid, jwt_role text DEFAULT 'authenticated') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role',jwt_role)::text, true);
 PERFORM set_config('request.jwt.claim.sub', coalesce(u::text,''), true);
 PERFORM set_config('request.jwt.claim.role', jwt_role, true);
END $$;
CREATE FUNCTION pg_temp.fails(stmt text, state text, msg text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE stmt;
 RAISE EXCEPTION 'expected % from: %', state, stmt;
EXCEPTION WHEN OTHERS THEN
 IF SQLSTATE <> state OR SQLERRM IS DISTINCT FROM coalesce(msg, SQLERRM) THEN
  RAISE EXCEPTION 'expected % % got % (%) from: %', state, msg, SQLSTATE, SQLERRM, stmt;
 END IF;
END $$;
-- `intent` names a user intent: it maps to a stable idempotency key.
CREATE FUNCTION pg_temp.tr(app uuid, expected text, to_status text, intent text, at timestamptz DEFAULT NULL, note text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.transition_application_status(app, expected, to_status, at, note, md5(intent)::uuid);
$$;
CREATE FUNCTION pg_temp.note(app uuid, note text, intent text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.add_application_note(app, note, md5(intent)::uuid);
$$;
CREATE FUNCTION pg_temp.contact(app uuid, type text, intent text, at timestamptz DEFAULT NULL, note text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.log_application_contact(app, type, at, note, md5(intent)::uuid);
$$;
CREATE FUNCTION pg_temp.save(intent text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.save_application(md5(intent)::uuid, NULL, 'vi', 'Backend Engineer', NULL,
  '{"personal_information":{"full_name":"A"}}'::jsonb, 'cv.pdf', 'We need Go.', '{"matchScore":72,"requirements":[]}'::jsonb);
$$;
CREATE FUNCTION pg_temp.events(app uuid, t text DEFAULT NULL) RETURNS integer LANGUAGE sql AS $$
 SELECT count(*)::int FROM public.application_events WHERE application_id=app AND (t IS NULL OR event_type=t);
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- CATALOG: privileges, definer settings, constraint names.
DO $$
DECLARE sig text := 'public.log_application_contact(uuid,text,timestamptz,text,uuid)';
BEGIN
 ASSERT NOT has_function_privilege('anon', sig, 'EXECUTE'), 'anon can execute log_application_contact';
 ASSERT NOT has_function_privilege('public', sig, 'EXECUTE'), 'PUBLIC can execute log_application_contact';
 ASSERT has_function_privilege('authenticated', sig, 'EXECUTE'), 'authenticated cannot execute log_application_contact';
 ASSERT (SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid=sig::regprocedure), 'log_application_contact must be DEFINER with empty search_path';
 ASSERT (SELECT pg_get_function_result(sig::regprocedure))='jsonb', 'log_application_contact must return jsonb';
 ASSERT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='application_events_event_type_check' AND conrelid='public.application_events'::regclass), 'event_type CHECK name changed';
 ASSERT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='application_events_shape' AND conrelid='public.application_events'::regclass), 'shape CHECK name changed';
 ASSERT (SELECT count(*) FROM pg_constraint WHERE conrelid='public.application_events'::regclass AND contype='c'
   AND pg_get_constraintdef(oid) ILIKE '%event_type = ANY%')=1, 'more than one event_type list CHECK';
 -- P2B client grants unchanged.
 ASSERT NOT has_table_privilege('authenticated','public.application_events','INSERT,UPDATE,DELETE'), 'authenticated can write events';
 ASSERT NOT has_table_privilege('authenticated','public.applications','UPDATE,INSERT'), 'authenticated can write applications';
 -- No new columns on applications (follow-up state is derived later, not stored).
 ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='applications'
   AND column_name ILIKE ANY (ARRAY['%follow%','%contact%'])), 'follow-up column on applications';
END $$;

DO $$
DECLARE
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); locked uuid:=gen_random_uuid();
 m jsonb := pg_read_file('/repo/application_status_transitions.json')::jsonb;
 s text; typ text; app uuid; app_s uuid; app_locked uuid; r jsonb; r2 jsonb; n integer;
 before_app public.applications%ROWTYPE; ev public.application_events%ROWTYPE;
BEGIN
 PERFORM pg_temp.set_user(NULL,'service_role');
 INSERT INTO auth.users(id) VALUES(a),(b),(locked);
 INSERT INTO public.profiles(id,role,has_permission,plan) VALUES(a,'user',true,'free'),(b,'user',true,'free'),(locked,'user',false,'free');
 INSERT INTO public.applications(user_id,idempotency_key,language,status) VALUES(locked,gen_random_uuid(),'vi','applied') RETURNING id INTO app_locked;

 SET LOCAL ROLE authenticated;

 -- AUTH: no JWT subject -> not_authenticated.
 PERFORM pg_temp.set_user(NULL);
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,'follow_up_sent','anon')$q$, app_locked), '42501', 'not_authenticated');

 -- STATUS GATE (every JSON status): drafted + JSON final -> contact_not_allowed, nothing written;
 -- applied / interview / offer -> exactly one event per type, status unchanged.
 PERFORM pg_temp.set_user(a);
 ASSERT (SELECT array_agg(x ORDER BY x) FROM jsonb_array_elements_text(m->'final') x)
   = ARRAY['hired','no_response','offer_declined','rejected','withdrawn'], 'final list drift vs test expectation';
 FOR s IN SELECT jsonb_array_elements_text(m->'statuses') LOOP
  FOREACH typ IN ARRAY ARRAY['follow_up_sent','contact_received'] LOOP
   RESET ROLE;
   INSERT INTO public.applications(user_id,idempotency_key,language,status,updated_at) VALUES(a,gen_random_uuid(),'vi',s,'2020-01-01') RETURNING id INTO app_s;
   SET LOCAL ROLE authenticated;
   IF s = 'drafted' OR (m->'final') ? s THEN
    PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,%L,%L)$q$, app_s, typ, format('gate-%s-%s', s, typ)), 'P0001', 'contact_not_allowed');
    ASSERT pg_temp.events(app_s)=0, format('%s %s rejected but event written', s, typ);
    ASSERT (SELECT updated_at FROM public.applications WHERE id=app_s)='2020-01-01', format('%s %s rejected but updated_at bumped', s, typ);
   ELSE
    ASSERT s IN ('applied','interview','offer'), format('unexpected allowed status %s', s);
    r := pg_temp.contact(app_s, typ, format('gate-%s-%s', s, typ));
    ASSERT NOT (r->>'replayed')::boolean AND r ? 'event_id', format('%s %s result %s', s, typ, r);
    ASSERT pg_temp.events(app_s)=1 AND pg_temp.events(app_s, typ)=1, format('%s %s wrote %s events', s, typ, pg_temp.events(app_s));
    SELECT * INTO ev FROM public.application_events WHERE id=(r->>'event_id')::uuid;
    ASSERT ev.from_status IS NULL AND ev.to_status IS NULL AND ev.user_id=a AND ev.application_id=app_s
      AND ev.occurred_at=now() AND ev.note IS NULL AND ev.metadata='{}'::jsonb, format('%s %s event shape', s, typ);
    ASSERT (SELECT status FROM public.applications WHERE id=app_s)=s, format('%s %s changed status', s, typ);
    ASSERT (SELECT updated_at FROM public.applications WHERE id=app_s)=now(), format('%s %s did not bump updated_at', s, typ);
   END IF;
  END LOOP;
 END LOOP;

 -- Main fixture: save -> applied.
 r := pg_temp.save('save-1');
 app := (r->>'id')::uuid;
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,'follow_up_sent','drafted-1')$q$, app), 'P0001', 'contact_not_allowed');
 PERFORM pg_temp.tr(app, 'drafted', 'applied', 'apply', now() - interval '40 days');
 RESET ROLE; UPDATE public.applications SET updated_at='2020-01-01', company_name='Acme', deadline='2026-12-01' WHERE id=app; SET LOCAL ROLE authenticated;
 SELECT * INTO before_app FROM public.applications WHERE id=app;

 -- ONLY updated_at changes on applications.
 r := pg_temp.contact(app, 'follow_up_sent', 'fu-1', now() - interval '30 days', '  Emailed the recruiter  ');
 SELECT * INTO ev FROM public.application_events WHERE id=(r->>'event_id')::uuid;
 ASSERT ev.event_type='follow_up_sent' AND ev.note='Emailed the recruiter' AND ev.occurred_at=now() - interval '30 days', 'backdated follow-up fields';
 ASSERT (SELECT a2.updated_at=now() AND a2.status=before_app.status AND a2.applied_at=before_app.applied_at
   AND a2.company_name IS NOT DISTINCT FROM before_app.company_name AND a2.role_title IS NOT DISTINCT FROM before_app.role_title
   AND a2.deadline IS NOT DISTINCT FROM before_app.deadline AND a2.language=before_app.language
   AND a2.idempotency_key=before_app.idempotency_key AND a2.created_at=before_app.created_at
   AND a2.source_analysis_id IS NOT DISTINCT FROM before_app.source_analysis_id
   FROM public.applications a2 WHERE id=app), 'contact touched columns other than updated_at';

 -- INPUT: type, note, occurred_at.
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,'note','bad-type-1')$q$, app), '22023', 'invalid_contact');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,'status_changed','bad-type-2')$q$, app), '22023', 'invalid_contact');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,'FOLLOW_UP_SENT','bad-type-3')$q$, app), '22023', 'invalid_contact');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,NULL,'bad-type-4')$q$, app), '22023', 'invalid_contact');
 PERFORM pg_temp.fails(format($q$SELECT public.log_application_contact(NULL,'follow_up_sent',NULL,NULL,gen_random_uuid())$q$), '22023', 'invalid_contact');
 PERFORM pg_temp.fails(format($q$SELECT public.log_application_contact(%L,'follow_up_sent',NULL,NULL,NULL)$q$, app), '22023', 'invalid_contact');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,'follow_up_sent','long-note',NULL,repeat('x',2001))$q$, app), '22023', 'invalid_note');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,'follow_up_sent','fut',now()+interval '6 minutes')$q$, app), '22023', 'invalid_occurred_at');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,'contact_received','old',now()-interval '10 years'-interval '1 day')$q$, app), '22023', 'invalid_occurred_at');
 ASSERT pg_temp.events(app)=3, 'invalid input wrote events'; -- created + applied + fu-1
 r := pg_temp.contact(app, 'contact_received', 'blank-note', NULL, '   ');
 ASSERT (SELECT note IS NULL AND occurred_at=now() FROM public.application_events WHERE id=(r->>'event_id')::uuid), 'blank note not NULL / NULL occurred_at not now()';
 r := pg_temp.contact(app, 'contact_received', 'max-note', now() + interval '4 minutes', repeat('y',2000));
 ASSERT (SELECT char_length(note)=2000 FROM public.application_events WHERE id=(r->>'event_id')::uuid), '2000-char note rejected';

 -- REPLAY: same key, different type / note / time -> original result, still one event.
 r := pg_temp.contact(app, 'follow_up_sent', 'fu-2', NULL, 'first');
 r2 := pg_temp.contact(app, 'contact_received', 'fu-2', now() - interval '1 day', 'second');
 ASSERT (r2->>'replayed')::boolean AND r2->>'event_id'=r->>'event_id', 'contact replay not idempotent';
 ASSERT (SELECT event_type='follow_up_sent' AND note='first' FROM public.application_events WHERE id=(r->>'event_id')::uuid), 'replay rewrote event';
 ASSERT (SELECT count(*) FROM public.application_events WHERE user_id=a AND idempotency_key=md5('fu-2')::uuid)=1, 'replay duplicated event';
 -- Shared key space with P2B: a key used by a note intent replays, inserts nothing.
 r := pg_temp.note(app, 'P2B note', 'shared-key');
 n := pg_temp.events(app);
 r2 := pg_temp.contact(app, 'follow_up_sent', 'shared-key');
 ASSERT (r2->>'replayed')::boolean AND r2->>'event_id'=r->>'event_id' AND pg_temp.events(app)=n, 'note key did not replay';

 -- SOFT LIMIT IS NOT VALIDATION: 3rd and 4th follow_up_sent on one applied app accepted.
 PERFORM pg_temp.contact(app, 'follow_up_sent', 'fu-3');
 PERFORM pg_temp.contact(app, 'follow_up_sent', 'fu-4');
 ASSERT pg_temp.events(app,'follow_up_sent')=4, format('follow_up_sent count %s', pg_temp.events(app,'follow_up_sent'));

 -- Status machinery still works after contact events; final status then blocks contacts.
 r := pg_temp.tr(app, 'applied', 'interview', 'to-interview');
 ASSERT NOT (r->>'replayed')::boolean AND (SELECT status FROM public.applications WHERE id=app)='interview', 'transition after contact failed';
 PERFORM pg_temp.contact(app, 'contact_received', 'in-interview');
 PERFORM pg_temp.tr(app, 'interview', 'rejected', 'to-rejected');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,'contact_received','after-final')$q$, app), 'P0001', 'contact_not_allowed');
 -- A committed intent replays even after the app went final (replay precedes the gate).
 r2 := pg_temp.contact(app, 'contact_received', 'in-interview');
 ASSERT (r2->>'replayed')::boolean, 'replay after final not replayed';

 -- APPEND-ONLY for clients: direct INSERT of a contact event denied.
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_events(application_id,user_id,event_type,occurred_at,idempotency_key) VALUES(%L,%L,'follow_up_sent',now(),gen_random_uuid())$q$, app, a), '42501');

 -- CROSS-USER: B gets application_not_found on A's app (same as a missing id), 0 events.
 PERFORM pg_temp.set_user(b);
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,'follow_up_sent','b-1')$q$, app), 'P0002', 'application_not_found');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,'follow_up_sent','b-2')$q$, gen_random_uuid()), 'P0002', 'application_not_found');
 ASSERT (SELECT count(*) FROM public.application_events WHERE user_id=b)=0, 'B failed calls left events';
 -- B reusing A's key on B's own app is a fresh intent (keys are per user).
 r := pg_temp.save('b-save');
 PERFORM pg_temp.tr((r->>'id')::uuid, 'drafted', 'applied', 'b-apply');
 r2 := pg_temp.contact((r->>'id')::uuid, 'follow_up_sent', 'fu-2');
 ASSERT NOT (r2->>'replayed')::boolean, 'B contact collided with A key';

 -- LOCKED: account_locked before any lookup (existing and missing ids alike).
 PERFORM pg_temp.set_user(locked);
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,'follow_up_sent','l-1')$q$, app_locked), '42501', 'account_locked');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,'follow_up_sent','l-2')$q$, gen_random_uuid()), '42501', 'account_locked');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,'bogus','l-3')$q$, app_locked), '42501', 'account_locked');
 RESET ROLE;
 PERFORM pg_temp.set_user(NULL,'service_role');
 ASSERT pg_temp.events(app_locked)=0, 'locked contact wrote event';

 -- SHAPE CHECK (as table owner): new types forbid from/to, note optional.
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_events(application_id,user_id,event_type,to_status,occurred_at,idempotency_key) VALUES(%L,%L,'follow_up_sent','applied',now(),gen_random_uuid())$q$, app, a), '23514');
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_events(application_id,user_id,event_type,from_status,occurred_at,idempotency_key) VALUES(%L,%L,'contact_received','applied',now(),gen_random_uuid())$q$, app, a), '23514');
 INSERT INTO public.application_events(application_id,user_id,event_type,note,occurred_at,idempotency_key) VALUES(app,a,'contact_received','owner note',now(),gen_random_uuid());
 -- Unknown types still rejected by the event_type CHECK.
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_events(application_id,user_id,event_type,occurred_at,idempotency_key) VALUES(%L,%L,'follow_up_due',now(),gen_random_uuid())$q$, app, a), '23514');
 -- P2B shapes unchanged (fresh app so the created-uniqueness index does not interfere).
 INSERT INTO public.applications(user_id,idempotency_key,language) VALUES(a,gen_random_uuid(),'vi') RETURNING id INTO app_s;
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_events(application_id,user_id,event_type,note,occurred_at,idempotency_key) VALUES(%L,%L,'created','x',now(),gen_random_uuid())$q$, app_s, a), '23514');
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_events(application_id,user_id,event_type,to_status,occurred_at,idempotency_key) VALUES(%L,%L,'created','applied',now(),gen_random_uuid())$q$, app_s, a), '23514');
 INSERT INTO public.application_events(application_id,user_id,event_type,metadata,occurred_at,idempotency_key) VALUES(app_s,a,'created','{"k":1}',now(),gen_random_uuid());
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_events(application_id,user_id,event_type,from_status,to_status,occurred_at,idempotency_key) VALUES(%L,%L,'status_changed','applied','applied',now(),gen_random_uuid())$q$, app_s, a), '23514');
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_events(application_id,user_id,event_type,to_status,occurred_at,idempotency_key) VALUES(%L,%L,'status_changed','applied',now(),gen_random_uuid())$q$, app_s, a), '23514');
 INSERT INTO public.application_events(application_id,user_id,event_type,from_status,to_status,note,occurred_at,idempotency_key) VALUES(app_s,a,'status_changed','drafted','applied','n',now(),gen_random_uuid());
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_events(application_id,user_id,event_type,occurred_at,idempotency_key) VALUES(%L,%L,'note',now(),gen_random_uuid())$q$, app_s, a), '23514');
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_events(application_id,user_id,event_type,note,to_status,occurred_at,idempotency_key) VALUES(%L,%L,'note','x','applied',now(),gen_random_uuid())$q$, app_s, a), '23514');
 INSERT INTO public.application_events(application_id,user_id,event_type,note,occurred_at,idempotency_key) VALUES(app_s,a,'note','x',now(),gen_random_uuid());
 -- Pre-existing P2B semantics, kept as-is: missing changedFields makes the predicate NULL, which a CHECK accepts.
 INSERT INTO public.application_events(application_id,user_id,event_type,occurred_at,idempotency_key) VALUES(app_s,a,'details_updated',now(),gen_random_uuid());
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_events(application_id,user_id,event_type,metadata,occurred_at,idempotency_key) VALUES(%L,%L,'details_updated','{"changedFields":"x"}',now(),gen_random_uuid())$q$, app_s, a), '23514');
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_events(application_id,user_id,event_type,note,metadata,occurred_at,idempotency_key) VALUES(%L,%L,'details_updated','x','{"changedFields":[]}',now(),gen_random_uuid())$q$, app_s, a), '23514');
 INSERT INTO public.application_events(application_id,user_id,event_type,metadata,occurred_at,idempotency_key) VALUES(app_s,a,'details_updated','{"changedFields":[]}',now(),gen_random_uuid());
END $$;

-- ATOMICITY: failing the event insert rolls back the updated_at bump.
CREATE FUNCTION pg_temp.boom() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'injected_failure' USING ERRCODE = 'XX001'; END $$;
CREATE TRIGGER zz_boom BEFORE INSERT ON public.application_events FOR EACH ROW EXECUTE FUNCTION pg_temp.boom();
DO $$
DECLARE c uuid:=gen_random_uuid(); app uuid;
BEGIN
 PERFORM pg_temp.set_user(NULL,'service_role');
 INSERT INTO auth.users(id) VALUES(c);
 INSERT INTO public.profiles(id,role,has_permission,plan) VALUES(c,'user',true,'free');
 INSERT INTO public.applications(user_id,idempotency_key,language,status,updated_at) VALUES(c,gen_random_uuid(),'vi','applied','2020-01-01') RETURNING id INTO app;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.set_user(c);
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.contact(%L,'follow_up_sent','boom')$q$, app), 'XX001', 'injected_failure');
 RESET ROLE;
 ASSERT (SELECT updated_at='2020-01-01' FROM public.applications WHERE id=app), 'failed event insert left updated_at bump';
 ASSERT (SELECT count(*) FROM public.application_events WHERE user_id=c)=0, 'failed call left events';
END $$;
ROLLBACK;
