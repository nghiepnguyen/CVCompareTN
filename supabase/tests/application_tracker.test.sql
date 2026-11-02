-- P2B application tracker + append-only application_events. Disposable DB only; fixtures roll back.
-- Run: supabase/tests/local/run.sh "$PWD" /repo/tests/application_tracker.test.sql
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
-- `expected` defaults to the row version the caller can see (now() when invisible).
CREATE FUNCTION pg_temp.details(app uuid, company text, role text, deadline date, intent text, expected timestamptz DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.update_application_details(app, coalesce(expected, (SELECT a.updated_at FROM public.applications a WHERE a.id=app), now()),
   company, role, deadline, md5(intent)::uuid);
$$;
CREATE FUNCTION pg_temp.save(intent text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.save_application(md5(intent)::uuid, NULL, 'vi', 'Backend Engineer', NULL,
  '{"personal_information":{"full_name":"A"}}'::jsonb, 'cv.pdf', 'We need Go.', '{"matchScore":72,"requirements":[]}'::jsonb);
$$;
CREATE FUNCTION pg_temp.events(app uuid, t text DEFAULT NULL) RETURNS integer LANGUAGE sql AS $$
 SELECT count(*)::int FROM public.application_events WHERE application_id=app AND (t IS NULL OR event_type=t);
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- CATALOG: privileges, definer settings, triggers, policies.
DO $$
DECLARE
 sig text;
 rpcs text[] := ARRAY[
  'public.transition_application_status(uuid,text,text,timestamptz,text,uuid)',
  'public.add_application_note(uuid,text,uuid)',
  'public.update_application_details(uuid,timestamptz,text,text,date,uuid)',
  'public.save_application(uuid,text,text,text,text,jsonb,text,text,jsonb,text,text)'];
BEGIN
 ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.application_events'::regclass), 'events RLS off';
 ASSERT has_table_privilege('authenticated','public.application_events','SELECT'), 'authenticated cannot read events';
 ASSERT NOT has_table_privilege('authenticated','public.application_events','INSERT'), 'authenticated can INSERT events';
 ASSERT NOT has_table_privilege('authenticated','public.application_events','UPDATE'), 'authenticated can UPDATE events';
 ASSERT NOT has_table_privilege('authenticated','public.application_events','DELETE'), 'authenticated can DELETE events';
 ASSERT NOT has_table_privilege('anon','public.application_events','SELECT,INSERT,UPDATE,DELETE'), 'anon has events privileges';
 -- P2A grants unchanged: no direct UPDATE of applications.
 ASSERT NOT has_table_privilege('authenticated','public.applications','UPDATE'), 'authenticated can UPDATE applications';
 ASSERT NOT has_table_privilege('authenticated','public.applications','INSERT'), 'authenticated can INSERT applications';
 ASSERT has_table_privilege('authenticated','public.applications','SELECT,DELETE'), 'P2A owner grants changed';
 FOREACH sig IN ARRAY rpcs LOOP
  ASSERT NOT has_function_privilege('anon', sig, 'EXECUTE'), format('anon can execute %s', sig);
  ASSERT has_function_privilege('authenticated', sig, 'EXECUTE'), format('authenticated cannot execute %s', sig);
  ASSERT (SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid=sig::regprocedure), format('%s must be DEFINER with empty search_path', sig);
 END LOOP;
 -- Internal helpers are not client-callable.
 ASSERT NOT has_function_privilege('authenticated','public.application_status_transition_allowed(text,text)','EXECUTE'), 'matrix fn exposed';
 ASSERT NOT has_function_privilege('authenticated','public.application_tracker_caller()','EXECUTE'), 'caller guard exposed';
 ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.application_tracker_caller()'::regprocedure), 'caller guard must be invoker';
 ASSERT (SELECT prosrc NOT ILIKE '%history%' FROM pg_proc WHERE oid='public.save_application(uuid,text,text,text,text,jsonb,text,text,jsonb,text,text)'::regprocedure), 'save_application depends on history';
 ASSERT (SELECT tgenabled FROM pg_trigger WHERE tgname='application_events_immutable')='O', 'events immutability trigger not enabled';
 ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='account_unlocked' AND tgrelid='public.application_events'::regclass), 'events lacks account lock trigger';
 ASSERT EXISTS (SELECT 1 FROM pg_policy WHERE polname='account_unlocked_read' AND polrelid='public.application_events'::regclass AND NOT polpermissive), 'events lacks restrictive lock policy';
 ASSERT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='applications_status_check' AND conrelid='public.applications'::regclass), 'status CHECK name changed';
 -- No score columns on applications (score stays in the immutable JD snapshot metadata).
 ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='applications' AND column_name ILIKE '%score%'), 'score column on applications';
END $$;

-- MATRIX: the SQL authority equals the shared JSON (the client's copy) for all 81 pairs,
-- and the status CHECK accepts exactly the JSON statuses.
DO $$
DECLARE
 m jsonb := pg_read_file('/repo/application_status_transitions.json')::jsonb;
 f text; t text; n integer := 0;
BEGIN
 ASSERT jsonb_array_length(m->'statuses') = 9, 'expected nine statuses';
 FOR f IN SELECT jsonb_array_elements_text(m->'statuses') LOOP
  FOR t IN SELECT jsonb_array_elements_text(m->'statuses') LOOP
   ASSERT public.application_status_transition_allowed(f, t) = coalesce((m->'transitions'->f) ? t, false),
    format('matrix drift %s -> %s', f, t);
   n := n + 1;
  END LOOP;
 END LOOP;
 ASSERT n = 81, 'not all pairs compared';
 ASSERT NOT EXISTS (SELECT 1 FROM jsonb_object_keys(m->'transitions') k WHERE NOT (m->'statuses') ? k), 'unknown status in transitions';
 ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(m->'final') s WHERE NOT (m->'statuses') ? s), 'unknown final status';
 ASSERT NOT public.application_status_transition_allowed('drafted','hired') AND NOT public.application_status_transition_allowed('drafted','offer')
   AND NOT public.application_status_transition_allowed('no_response','hired'), 'meaningless transition allowed';
END $$;

DO $$
DECLARE
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); locked uuid:=gen_random_uuid();
 m jsonb := pg_read_file('/repo/application_status_transitions.json')::jsonb;
 f text; t text; app uuid; app_b uuid; app_locked uuid; r jsonb; r2 jsonb; n integer; ok boolean; i integer := 0;
 before_doc jsonb; before_app public.applications%ROWTYPE; ev public.application_events%ROWTYPE;
BEGIN
 PERFORM pg_temp.set_user(NULL,'service_role');
 INSERT INTO auth.users(id) VALUES(a),(b),(locked);
 INSERT INTO public.profiles(id,role,has_permission,plan) VALUES(a,'user',true,'free'),(b,'user',true,'free'),(locked,'user',false,'free');
 INSERT INTO public.applications(user_id,idempotency_key,language) VALUES(locked,gen_random_uuid(),'vi') RETURNING id INTO app_locked;
 INSERT INTO public.application_events(application_id,user_id,event_type,occurred_at,idempotency_key) VALUES(app_locked,locked,'created',now(),gen_random_uuid());

 SET LOCAL ROLE authenticated;

 -- AUTH: no JWT subject -> rejected by every RPC.
 PERFORM pg_temp.set_user(NULL);
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.tr(%L,'drafted','applied','anon')$q$, app_locked), '42501', 'not_authenticated');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.note(%L,'x','anon')$q$, app_locked), '42501', 'not_authenticated');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.details(%L,'x',NULL,NULL,'anon')$q$, app_locked), '42501', 'not_authenticated');

 -- SAVE: exactly one created event, replay adds none.
 PERFORM pg_temp.set_user(a);
 r := pg_temp.save('save-1');
 app := (r->>'id')::uuid;
 ASSERT pg_temp.events(app)=1 AND pg_temp.events(app,'created')=1, 'save must create exactly one created event';
 SELECT * INTO ev FROM public.application_events WHERE application_id=app;
 ASSERT ev.occurred_at = (SELECT created_at FROM public.applications WHERE id=app) AND ev.user_id=a, 'created event time/owner';
 ASSERT ev.from_status IS NULL AND ev.to_status IS NULL AND ev.note IS NULL, 'created event shape';
 r2 := pg_temp.save('save-1');
 ASSERT NOT (r2->>'created')::boolean AND pg_temp.events(app)=1, 'save replay duplicated created event';
 ASSERT (SELECT status FROM public.applications WHERE id=app)='drafted' AND (SELECT applied_at FROM public.applications WHERE id=app) IS NULL
   AND (SELECT deadline FROM public.applications WHERE id=app) IS NULL, 'save defaults changed';

 -- EVERY PAIR (81): allowed -> succeeds + exactly one status_changed event;
 -- rejected (incl. same-state) -> invalid_transition, status unchanged, no event.
 FOR f IN SELECT jsonb_array_elements_text(m->'statuses') LOOP
  FOR t IN SELECT jsonb_array_elements_text(m->'statuses') LOOP
   i := i + 1;
   RESET ROLE;
   INSERT INTO public.applications(user_id,idempotency_key,language,status) VALUES(a,gen_random_uuid(),'vi',f) RETURNING id INTO app_b;
   SET LOCAL ROLE authenticated;
   ok := coalesce((m->'transitions'->f) ? t, false);
   IF ok THEN
    r := pg_temp.tr(app_b, f, t, format('pair-%s-%s', f, t));
    ASSERT NOT (r->>'replayed')::boolean, format('%s->%s replayed', f, t);
    ASSERT (SELECT status FROM public.applications WHERE id=app_b)=t, format('%s->%s not applied', f, t);
    ASSERT pg_temp.events(app_b)=1, format('%s->%s wrote %s events', f, t, pg_temp.events(app_b));
    SELECT * INTO ev FROM public.application_events WHERE application_id=app_b;
    ASSERT ev.event_type='status_changed' AND ev.from_status=f AND ev.to_status=t AND ev.user_id=a, format('%s->%s event wrong', f, t);
   ELSE
    PERFORM pg_temp.fails(format($q$SELECT pg_temp.tr(%L,%L,%L,%L)$q$, app_b, f, t, format('pair-%s-%s', f, t)), 'P0001', 'invalid_transition');
    ASSERT (SELECT status FROM public.applications WHERE id=app_b)=f, format('%s->%s rejected but status changed', f, t);
    ASSERT pg_temp.events(app_b)=0, format('%s->%s rejected but event written', f, t);
   END IF;
  END LOOP;
 END LOOP;
 ASSERT i=81, 'not every pair exercised';
 -- Unknown / alias statuses are invalid input, not new states.
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.tr(%L,'drafted','interviewing','alias')$q$, app), '22023', 'invalid_transition');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.tr(%L,'drafted',NULL,'nullto')$q$, app), '22023', 'invalid_transition');
 RESET ROLE;
 PERFORM pg_temp.fails(format($q$UPDATE public.applications SET status='archived' WHERE id=%L$q$, app), '23514');
 SET LOCAL ROLE authenticated;

 -- COMPARE-AND-SET: stale expected_status -> stale_status, nothing written.
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.tr(%L,'applied','interview','stale-1')$q$, app), 'P0001', 'stale_status');
 ASSERT (SELECT status FROM public.applications WHERE id=app)='drafted' AND pg_temp.events(app)=1, 'stale transition wrote';

 -- APPLIED_AT: first transition to applied sets it to occurred_at; corrections never rewrite it.
 r := pg_temp.tr(app, 'drafted', 'applied', 'app-applied', now() - interval '3 days', 'Sent via portal');
 ASSERT (SELECT applied_at FROM public.applications WHERE id=app) = now() - interval '3 days', 'applied_at not occurred_at';
 SELECT * INTO ev FROM public.application_events WHERE id=(r->>'event_id')::uuid;
 ASSERT ev.occurred_at = now() - interval '3 days' AND ev.note='Sent via portal' AND ev.from_status='drafted', 'status event fields';
 -- CAS success path + sequential replay: same key -> one mutation, original result.
 r := pg_temp.tr(app, 'applied', 'rejected', 'app-reject');
 r2 := pg_temp.tr(app, 'applied', 'rejected', 'app-reject');
 ASSERT (r2->>'replayed')::boolean AND r2->>'event_id' = r->>'event_id', 'replay after commit must not hit stale_status';
 -- Changed-payload replay keeps the original result.
 r2 := pg_temp.tr(app, 'applied', 'no_response', 'app-reject', NULL, 'different');
 ASSERT (r2->>'replayed')::boolean AND (SELECT status FROM public.applications WHERE id=app)='rejected', 'changed-payload replay mutated';
 ASSERT pg_temp.events(app,'status_changed')=2, 'replay duplicated event';
 -- FINAL-STATE CORRECTION: new event, earlier event unchanged.
 SELECT * INTO ev FROM public.application_events WHERE id=(r->>'event_id')::uuid;
 PERFORM pg_temp.tr(app, 'rejected', 'interview', 'app-correct');
 ASSERT (SELECT status FROM public.applications WHERE id=app)='interview', 'correction failed';
 ASSERT (SELECT to_jsonb(e) FROM public.application_events e WHERE id=ev.id) = to_jsonb(ev), 'correction rewrote history';
 PERFORM pg_temp.tr(app, 'interview', 'applied', 'app-back');
 ASSERT (SELECT applied_at FROM public.applications WHERE id=app) = now() - interval '3 days', 'applied_at overwritten by correction';
 PERFORM pg_temp.tr(app, 'applied', 'withdrawn', 'app-wd');
 PERFORM pg_temp.tr(app, 'withdrawn', 'drafted', 'app-wd-undo');
 ASSERT (SELECT applied_at FROM public.applications WHERE id=app) IS NOT NULL, 'applied_at is historical and must survive drafted';

 -- OCCURRED_AT: future beyond 5 min tolerance or > 10 years ago -> rejected; skew and past ok.
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.tr(%L,'drafted','applied','fut',now()+interval '1 hour')$q$, app), '22023', 'invalid_occurred_at');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.tr(%L,'drafted','applied','old',now()-interval '11 years')$q$, app), '22023', 'invalid_occurred_at');
 ASSERT (SELECT status FROM public.applications WHERE id=app)='drafted', 'invalid occurred_at changed status';
 PERFORM pg_temp.tr(app, 'drafted', 'applied', 'skew', now() + interval '1 minute');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.tr(%L,'applied','interview','long-note',NULL,repeat('x',2001))$q$, app), '22023', 'invalid_note');

 -- NOTE: trimmed, bounded, status untouched, bumps last activity, replay-safe.
 RESET ROLE; UPDATE public.applications SET updated_at='2020-01-01' WHERE id=app; SET LOCAL ROLE authenticated;
 r := pg_temp.note(app, '  Called the recruiter  ', 'note-1');
 ASSERT (SELECT note FROM public.application_events WHERE id=(r->>'event_id')::uuid)='Called the recruiter', 'note not trimmed';
 ASSERT (SELECT status FROM public.applications WHERE id=app)='applied', 'note changed status';
 ASSERT (SELECT updated_at FROM public.applications WHERE id=app)=now(), 'note did not bump last activity';
 r2 := pg_temp.note(app, 'other text', 'note-1');
 ASSERT (r2->>'replayed')::boolean AND r2->>'event_id'=r->>'event_id' AND pg_temp.events(app,'note')=1, 'note replay duplicated';
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.note(%L,'   ','note-2')$q$, app), '22023', 'invalid_note');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.note(%L,NULL,'note-3')$q$, app), '22023', 'invalid_note');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.note(%L,repeat('x',2001),'note-4')$q$, app), '22023', 'invalid_note');
 PERFORM pg_temp.note(app, repeat('y',2000), 'note-5');
 PERFORM pg_temp.note(app, '<script>alert(1)</script>', 'note-html'); -- stored as text; rendered as text
 ASSERT pg_temp.events(app,'note')=3, 'note count';

 -- DETAILS: only changed fields recorded; immutable evidence untouched.
 SELECT * INTO before_app FROM public.applications WHERE id=app;
 SELECT jsonb_agg(to_jsonb(d) ORDER BY document_type) INTO before_doc FROM public.application_documents d WHERE application_id=app;
 r := pg_temp.details(app, NULL, 'Backend Engineer', '2026-11-15', 'det-deadline');
 SELECT * INTO ev FROM public.application_events WHERE id=(r->>'event_id')::uuid;
 ASSERT ev.event_type='details_updated' AND ev.metadata = '{"changedFields":["deadline"],"deadline":{"from":null,"to":"2026-11-15"}}'::jsonb,
   format('deadline metadata %s', ev.metadata);
 r := pg_temp.details(app, '  Acme  ', 'Platform Engineer', '2026-11-15', 'det-multi');
 SELECT * INTO ev FROM public.application_events WHERE id=(r->>'event_id')::uuid;
 ASSERT ev.metadata->'changedFields' = '["company_name","role_title"]'::jsonb AND ev.metadata->'company_name'->>'to'='Acme'
   AND ev.metadata->'role_title'->>'from'='Backend Engineer' AND NOT ev.metadata ? 'deadline', format('multi metadata %s', ev.metadata);
 n := pg_temp.events(app);
 r := pg_temp.details(app, 'Acme', 'Platform Engineer', '2026-11-15', 'det-noop');
 ASSERT NOT (r->>'changed')::boolean AND pg_temp.events(app)=n, 'no-op details wrote an event';
 r := pg_temp.details(app, 'Acme', 'Platform Engineer', NULL, 'det-clear');
 ASSERT (SELECT deadline FROM public.applications WHERE id=app) IS NULL, 'deadline not cleared';
 r2 := pg_temp.details(app, 'Other', NULL, '2027-01-01', 'det-clear');
 ASSERT (r2->>'replayed')::boolean AND (SELECT company_name FROM public.applications WHERE id=app)='Acme', 'details replay mutated';
 r := pg_temp.details(app, '   ', '', NULL, 'det-blank');
 ASSERT (SELECT company_name IS NULL AND role_title IS NULL FROM public.applications WHERE id=app), 'blank details not cleared to NULL';
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.details(%L,repeat('x',201),NULL,NULL,'det-long')$q$, app), '22023', 'invalid_details');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.details(%L,NULL,repeat('x',201),NULL,'det-long2')$q$, app), '22023', 'invalid_details');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.details(%L,NULL,NULL,'1999-12-31','det-old')$q$, app), '22023', 'invalid_details');
 ASSERT (SELECT a2.status=before_app.status AND a2.applied_at=before_app.applied_at AND a2.language=before_app.language
   AND a2.idempotency_key=before_app.idempotency_key AND a2.created_at=before_app.created_at
   AND a2.source_analysis_id IS NOT DISTINCT FROM before_app.source_analysis_id FROM public.applications a2 WHERE id=app), 'details touched non-detail columns';
 ASSERT (SELECT jsonb_agg(to_jsonb(d) ORDER BY document_type) FROM public.application_documents d WHERE application_id=app)=before_doc, 'details touched snapshots';

 -- DETAILS OPTIMISTIC CONCURRENCY (expected_updated_at = row version the edit was based on).
 RESET ROLE; UPDATE public.applications SET updated_at='2020-01-01' WHERE id=app; SET LOCAL ROLE authenticated;
 n := pg_temp.events(app);
 r := pg_temp.details(app, 'Gamma', NULL, NULL, 'cas-ok', '2020-01-01');
 ASSERT (r->>'changed')::boolean AND NOT (r->>'replayed')::boolean AND pg_temp.events(app)=n+1, 'matching version must update with one event';
 ASSERT r->'application'->>'company_name'='Gamma' AND (r->'application'->>'updated_at')::timestamptz=now(), format('returned row %s', r);
 -- Stale version: stale_application, no update, no event.
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.details(%L,'Delta',NULL,NULL,'cas-stale','2020-01-01')$q$, app), 'P0001', 'stale_application');
 ASSERT (SELECT company_name FROM public.applications WHERE id=app)='Gamma' AND pg_temp.events(app)=n+1, 'stale edit mutated';
 -- Retry of the committed intent (its version is now stale) replays, never stale_application.
 r2 := pg_temp.details(app, 'Zeta', 'Changed', '2027-01-01', 'cas-ok', '2020-01-01');
 ASSERT (r2->>'replayed')::boolean AND r2->>'event_id'=r->>'event_id', 'committed retry must replay';
 ASSERT (SELECT company_name FROM public.applications WHERE id=app)='Gamma' AND pg_temp.events(app)=n+1, 'replay mutated';
 -- Any other mutation (a note) moves the row version too.
 RESET ROLE; UPDATE public.applications SET updated_at='2020-01-02' WHERE id=app; SET LOCAL ROLE authenticated;
 PERFORM pg_temp.note(app, 'other tab', 'cas-note');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.details(%L,'Eta',NULL,NULL,'cas-after-note','2020-01-02')$q$, app), 'P0001', 'stale_application');
 -- Version is required.
 PERFORM pg_temp.fails(format($q$SELECT public.update_application_details(%L,NULL,'x',NULL,NULL,gen_random_uuid())$q$, app), '22023', 'invalid_details');

 -- APPEND-ONLY for clients: no INSERT / UPDATE / DELETE on events.
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_events(application_id,user_id,event_type,note,occurred_at,idempotency_key) VALUES(%L,%L,'note','x',now(),gen_random_uuid())$q$, app, a), '42501');
 PERFORM pg_temp.fails(format($q$UPDATE public.application_events SET note='rewritten' WHERE application_id=%L$q$, app), '42501');
 PERFORM pg_temp.fails(format($q$DELETE FROM public.application_events WHERE application_id=%L$q$, app), '42501');
 PERFORM pg_temp.fails(format($q$UPDATE public.applications SET status='hired' WHERE id=%L$q$, app), '42501');

 -- CROSS-USER: B sees nothing and cannot mutate A's application through any RPC.
 PERFORM pg_temp.set_user(b);
 ASSERT (SELECT count(*) FROM public.application_events)=0, 'B reads A events';
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.tr(%L,'applied','interview','b-1')$q$, app), 'P0002', 'application_not_found');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.note(%L,'hi','b-2')$q$, app), 'P0002', 'application_not_found');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.details(%L,'Evil',NULL,NULL,'b-3')$q$, app), 'P0002', 'application_not_found');
 ASSERT (SELECT count(*) FROM public.application_events WHERE user_id=b)=0, 'B failed calls left events';
 -- Keys are scoped per user: B may reuse a key A used.
 r := pg_temp.save('b-save');
 r2 := pg_temp.note((r->>'id')::uuid, 'mine', 'note-1');
 ASSERT NOT (r2->>'replayed')::boolean, 'B note collided with A key';

 -- LOCKED: no reads, no RPCs (even for an id that exists).
 PERFORM pg_temp.set_user(locked);
 ASSERT (SELECT count(*) FROM public.application_events)=0, 'locked user reads events';
 ASSERT (SELECT count(*) FROM public.applications)=0, 'locked user reads applications';
 ASSERT (SELECT count(*) FROM public.application_documents)=0, 'locked user reads documents';
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.tr(%L,'drafted','applied','l-1')$q$, app_locked), '42501', 'account_locked');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.note(%L,'x','l-2')$q$, app_locked), '42501', 'account_locked');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.details(%L,'x',NULL,NULL,'l-3')$q$, app_locked), '42501', 'account_locked');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.tr(%L,'drafted','applied','l-4')$q$, gen_random_uuid()), '42501', 'account_locked');
 RESET ROLE;
 ASSERT (SELECT status FROM public.applications WHERE id=app_locked)='drafted', 'locked transition applied';

 -- STRICT IMMUTABILITY: service_role cannot rewrite events either.
 SET LOCAL ROLE service_role;
 PERFORM pg_temp.set_user(NULL,'service_role');
 PERFORM pg_temp.fails($q$UPDATE public.application_events SET note='x'$q$, '42501', 'application_event_immutable');
 RESET ROLE;
 -- Composite ownership: an event cannot point at another user's application.
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_events(application_id,user_id,event_type,note,occurred_at,idempotency_key) VALUES(%L,%L,'note','x',now(),gen_random_uuid())$q$, app, b), '23503');
 -- One created event per application.
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_events(application_id,user_id,event_type,occurred_at,idempotency_key) VALUES(%L,%L,'created',now(),gen_random_uuid())$q$, app, a), '23505');
 -- Shape: status_changed needs from/to and no same-state.
 PERFORM pg_temp.fails(format($q$INSERT INTO public.application_events(application_id,user_id,event_type,from_status,to_status,occurred_at,idempotency_key) VALUES(%L,%L,'status_changed','applied','applied',now(),gen_random_uuid())$q$, app, a), '23514');

 -- DELETE CASCADE: owner deletes application -> its events go too.
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.set_user(a);
 DELETE FROM public.applications WHERE id=app;
 RESET ROLE;
 ASSERT NOT EXISTS (SELECT 1 FROM public.application_events WHERE application_id=app), 'events orphaned after delete';
 -- Account deletion (admin hard delete runs as service_role) removes events.
 PERFORM pg_temp.set_user(NULL,'service_role');
 DELETE FROM auth.users WHERE id=a;
 ASSERT NOT EXISTS (SELECT 1 FROM public.application_events WHERE user_id=a), 'account delete left events';
END $$;

-- ATOMICITY: failing the created-event insert rolls back application + documents + event.
CREATE FUNCTION pg_temp.boom() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'injected_failure' USING ERRCODE = 'XX001'; END $$;
CREATE TRIGGER zz_boom BEFORE INSERT ON public.application_events FOR EACH ROW EXECUTE FUNCTION pg_temp.boom();
DO $$
DECLARE c uuid:=gen_random_uuid(); app uuid;
BEGIN
 PERFORM pg_temp.set_user(NULL,'service_role');
 INSERT INTO auth.users(id) VALUES(c);
 INSERT INTO public.profiles(id,role,has_permission,plan) VALUES(c,'user',true,'free');
 INSERT INTO public.applications(user_id,idempotency_key,language) VALUES(c,gen_random_uuid(),'vi') RETURNING id INTO app;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.set_user(c);
 PERFORM pg_temp.fails($q$SELECT pg_temp.save('boom-save')$q$, 'XX001', 'injected_failure');
 -- Status + event are atomic too.
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.tr(%L,'drafted','applied','boom-tr')$q$, app), 'XX001', 'injected_failure');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.details(%L,'Acme',NULL,'2026-12-01','boom-det')$q$, app), 'XX001', 'injected_failure');
 PERFORM pg_temp.fails(format($q$SELECT pg_temp.note(%L,'x','boom-note')$q$, app), 'XX001', 'injected_failure');
 RESET ROLE;
 ASSERT (SELECT count(*) FROM public.applications WHERE user_id=c)=1, 'failed save left an application';
 ASSERT (SELECT count(*) FROM public.application_documents WHERE user_id=c)=0, 'failed save left documents';
 ASSERT (SELECT count(*) FROM public.application_events WHERE user_id=c)=0, 'failed calls left events';
 ASSERT (SELECT status='drafted' AND company_name IS NULL AND deadline IS NULL AND applied_at IS NULL FROM public.applications WHERE id=app),
   'failed event insert left application changes';
END $$;
ROLLBACK;
