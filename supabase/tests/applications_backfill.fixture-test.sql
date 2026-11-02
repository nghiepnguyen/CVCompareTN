-- P2B backfill against pre-P2B data. Needs the fixture loaded before the migration:
-- FIXTURE_BEFORE=20261104000000:/repo/tests/fixtures/pre_p2b_applications.sql \
--   supabase/tests/local/run.sh "$PWD" /repo/tests/applications_backfill.fixture-test.sql
-- (Not named *.test.sql: the plain suite runs without the fixture.)
BEGIN;
DO $$
DECLARE n integer;
BEGIN
 ASSERT to_regclass('public.zz_pre_p2b_snapshot') IS NOT NULL, 'fixture missing: run with FIXTURE_BEFORE';
 ASSERT (SELECT count(*) FROM public.zz_pre_p2b_snapshot) = 25, 'fixture size';
 -- Existing rows preserved: ids, status, timestamps, documents.
 ASSERT NOT EXISTS (
   SELECT 1 FROM public.zz_pre_p2b_snapshot s LEFT JOIN public.applications a ON a.id = s.id
   WHERE a.id IS NULL OR a.status <> s.status OR a.status <> 'drafted' OR a.updated_at <> s.updated_at OR a.created_at <> s.created_at
     OR a.applied_at IS NOT NULL OR a.deadline IS NOT NULL
     OR (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.document_type) FROM public.application_documents d WHERE d.application_id = a.id) IS DISTINCT FROM s.docs),
   'backfill changed an existing application or its documents';
 -- Exactly one created event per application, at the original time, same owner.
 ASSERT NOT EXISTS (
   SELECT 1 FROM public.applications a
   WHERE (SELECT count(*) FROM public.application_events e WHERE e.application_id = a.id) <> 1
      OR NOT EXISTS (SELECT 1 FROM public.application_events e WHERE e.application_id = a.id AND e.event_type = 'created'
                     AND e.occurred_at = a.created_at AND e.created_at = a.created_at AND e.user_id = a.user_id)),
   'backfill did not create exactly one created event per application';
 -- Replay of the backfill statement is a no-op.
 INSERT INTO public.application_events (application_id, user_id, event_type, occurred_at, idempotency_key, created_at)
 SELECT a.id, a.user_id, 'created', a.created_at, a.idempotency_key, a.created_at
 FROM public.applications AS a
 ON CONFLICT (application_id) WHERE event_type = 'created' DO NOTHING;
 GET DIAGNOSTICS n = ROW_COUNT;
 ASSERT n = 0, format('backfill replay inserted %s events', n);
 ASSERT (SELECT count(*) FROM public.application_events) = 25, 'event count after replay';
END $$;
ROLLBACK;
