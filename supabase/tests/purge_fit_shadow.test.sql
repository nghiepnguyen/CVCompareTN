-- M3-B OD-M2: run against a disposable database after migration
-- 20261123000000. Synthetic rows only; rolls back fixtures.
BEGIN;
DO $$
DECLARE
  u uuid := gen_random_uuid();
  fs jsonb := '{"v":"fit-score-v1","eligible":true,"canonical":72,"shadow":55,"absDiff":17}';
  sg jsonb := '{"suggestionsIn":3,"droppedTotal":1,"skills":0,"numeric":1,"rawJd":0,"factualChecks":true}';
  rv jsonb := '{"rows":4,"met":2,"unmet":0,"unknown":2}';
  before_other text;
  after_other text;
  n integer;
BEGIN
  INSERT INTO auth.users(id) VALUES (u);
  INSERT INTO public.analysis_log(id, user_id, status, kind, created_at, input_tokens, output_tokens, model, latency_ms, error_message, guard_metrics) VALUES
   -- age boundaries (now() is fixed inside this transaction)
   ('00000000-0000-4000-8000-000000000029', u, 'success', 'analyze', now() - interval '29 days', 10, 5, 'm', 100, NULL,
      jsonb_build_object('v',1,'suggestionGuard',sg,'requirementVerification',rv,'fitShadow',fs)),
   ('00000000-0000-4000-8000-000000000030', u, 'success', 'analyze', now() - interval '30 days', 10, 5, 'm', 100, NULL,
      jsonb_build_object('v',1,'suggestionGuard',sg,'requirementVerification',rv,'fitShadow',fs)),
   ('00000000-0000-4000-8000-000000000031', u, 'success', 'analyze', now() - interval '31 days', 11, 6, 'm', 200, NULL,
      jsonb_build_object('v',1,'suggestionGuard',sg,'requirementVerification',rv,'fitShadow',fs)),
   ('00000000-0000-4000-8000-000000000032', u, 'success', 'analyze', now() - interval '400 days', 11, 6, 'm', 200, NULL,
      jsonb_build_object('fitShadow', jsonb_build_object('v','fit-score-v1','eligible',false,'reason','error'))),
   -- old rows without fitShadow
   ('00000000-0000-4000-8000-000000000041', u, 'success', 'analyze', now() - interval '90 days', 1, 1, 'm', 1, NULL,
      jsonb_build_object('v',1,'suggestionGuard',sg)),
   ('00000000-0000-4000-8000-000000000042', u, 'error', 'analyze', now() - interval '90 days', 0, 0, NULL, NULL, '[quota_settlement_unknown]', NULL),
   -- other kinds (document-cap markers must survive)
   ('00000000-0000-4000-8000-000000000051', u, 'success', 'rewrite', now() - interval '90 days', 2, 2, 'm', 1, NULL,
      '{"v":1,"coverLetter":{"generated":true}}'),
   ('00000000-0000-4000-8000-000000000052', u, 'success', 'rewrite', now() - interval '90 days', 2, 2, 'm', 1, NULL,
      '{"v":1,"fullCv":{"geminiCalls":1}}'),
   ('00000000-0000-4000-8000-000000000053', u, 'success', 'parse_cv', now() - interval '90 days', 2, 2, 'm', 1, NULL, NULL);

  -- Everything except the fitShadow key, for every fixture row.
  SELECT string_agg(id::text||'|'||user_id::text||'|'||status||'|'||kind||'|'||created_at::text||'|'||coalesce(input_tokens,-1)||'|'||coalesce(output_tokens,-1)||'|'||coalesce(total_tokens,-1)||'|'||coalesce(model,'')||'|'||coalesce(latency_ms,-1)||'|'||coalesce(error_message,'')||'|'||coalesce((guard_metrics - 'fitShadow')::text,'null'), ',' ORDER BY id)
    INTO before_other FROM public.analysis_log WHERE user_id = u;

  -- Permissions: only service_role (and the owner) may run it; it is DEFINER with a fixed search_path.
  ASSERT NOT has_function_privilege('anon', 'public.purge_expired_fit_shadow()', 'EXECUTE'), 'anon can purge';
  ASSERT NOT has_function_privilege('authenticated', 'public.purge_expired_fit_shadow()', 'EXECUTE'), 'authenticated can purge';
  ASSERT has_function_privilege('service_role', 'public.purge_expired_fit_shadow()', 'EXECUTE'), 'service_role cannot purge';
  ASSERT (SELECT prosecdef AND proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'public.purge_expired_fit_shadow()'::regprocedure),
    'not SECURITY DEFINER with fixed empty search_path';

  n := public.purge_expired_fit_shadow();
  ASSERT n = 2, 'expected 2 rows stripped (31d, 400d), got '||n;

  ASSERT (SELECT guard_metrics ? 'fitShadow' FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000029'), '29-day fitShadow removed';
  ASSERT (SELECT guard_metrics ? 'fitShadow' FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000030'), 'exactly-30-day fitShadow removed (rule is strictly older than 30 days)';
  ASSERT NOT (SELECT guard_metrics ? 'fitShadow' FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000031'), '31-day fitShadow kept';
  ASSERT (SELECT guard_metrics = '{}'::jsonb FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000032'), 'fitShadow-only row not reduced to {}';
  ASSERT (SELECT guard_metrics = jsonb_build_object('v',1,'suggestionGuard',sg,'requirementVerification',rv) FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000031'),
    'other guard_metrics keys changed';

  -- No row deleted; every non-fitShadow field (tokens, status, kind, user, time, error, other keys) identical.
  SELECT count(*) INTO n FROM public.analysis_log WHERE user_id = u;
  ASSERT n = 9, 'rows deleted: '||n;
  SELECT string_agg(id::text||'|'||user_id::text||'|'||status||'|'||kind||'|'||created_at::text||'|'||coalesce(input_tokens,-1)||'|'||coalesce(output_tokens,-1)||'|'||coalesce(total_tokens,-1)||'|'||coalesce(model,'')||'|'||coalesce(latency_ms,-1)||'|'||coalesce(error_message,'')||'|'||coalesce((guard_metrics - 'fitShadow')::text,'null'), ',' ORDER BY id)
    INTO after_other FROM public.analysis_log WHERE user_id = u;
  ASSERT after_other = before_other, 'non-fitShadow data changed';

  -- Idempotent: a second run strips nothing.
  n := public.purge_expired_fit_shadow();
  ASSERT n = 0, 'second run changed '||n||' rows';

  -- Exactly one cron job of this name, alongside the existing jobs.
  SELECT count(*) INTO n FROM cron.job WHERE jobname = 'purge-fit-shadow';
  ASSERT n = 1, 'purge-fit-shadow jobs: '||n;
  ASSERT (SELECT schedule = '20 20 * * *' AND command = 'SELECT public.purge_expired_fit_shadow()' FROM cron.job WHERE jobname = 'purge-fit-shadow'), 'cron job definition';
  SELECT count(*) INTO n FROM cron.job WHERE jobname IN ('purge-free-history', 'purge-api-rate-limits', 'storage-cleanup');
  ASSERT n = 3, 'existing cron jobs missing: '||n;
  -- Re-scheduling (migration replay) keeps one job.
  PERFORM cron.schedule('purge-fit-shadow', '20 20 * * *', 'SELECT public.purge_expired_fit_shadow()');
  SELECT count(*) INTO n FROM cron.job WHERE jobname = 'purge-fit-shadow';
  ASSERT n = 1, 'duplicate cron job after re-schedule: '||n;
END $$;

-- RLS, as a signed-in non-admin (role switched at top level, the way PostgREST does).
-- Execute on the purge is already covered by has_function_privilege above.
DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', (SELECT user_id::text FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000029'), true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.analysis_log;
  ASSERT n = 0, 'non-admin reads analysis_log: '||n;
  UPDATE public.analysis_log SET guard_metrics = guard_metrics - 'fitShadow';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'non-admin updated analysis_log: '||n;
  DELETE FROM public.analysis_log;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'non-admin deleted analysis_log rows: '||n;
END $$;
RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT guard_metrics ? 'fitShadow' FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000029'), 'non-admin UPDATE reached a row';
END $$;
ROLLBACK;
