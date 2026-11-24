-- PROPOSED (P1-D) test — disposable local stack only, AFTER applying 01 (02
-- optional: the prune assertions use the job when present, else the same
-- literal). Not in supabase/tests, so CI does not run it until adopted.
-- Every block rolls back. Synthetic cron jobs/runs only.
-- Do NOT test API-role denial by calling the function after SET ROLE in psql:
-- that segfaults supabase/postgres 17.6.1.106 (aarch64). Denial is asserted
-- with has_function_privilege here and over HTTP in cron_health_integration.sh.

-- 1. Shape and permissions.
DO $$
BEGIN
  ASSERT (SELECT prosecdef AND proconfig IS NOT DISTINCT FROM ARRAY['search_path=""'] AND pg_get_userbyid(proowner) = 'postgres' AND provolatile = 's'
            FROM pg_proc WHERE oid = 'public.cron_job_health(text[])'::regprocedure), 'not DEFINER/fixed search_path/postgres-owned/STABLE';
  ASSERT has_function_privilege('service_role', 'public.cron_job_health(text[])', 'EXECUTE'), 'service_role cannot execute';
  ASSERT NOT has_function_privilege('anon', 'public.cron_job_health(text[])', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.cron_job_health(text[])', 'EXECUTE')
     AND NOT has_function_privilege('public', 'public.cron_job_health(text[])', 'EXECUTE'), 'API role can execute';
  -- Exactly the five non-text columns: no return_message / command can leak.
  ASSERT pg_get_function_result('public.cron_job_health(text[])'::regprocedure)
         = 'TABLE(job text, state text, hours_since_success integer, consecutive_failures integer, runs_7d integer)', 'result shape changed';
END $$;

-- Helper (session-scoped): one synthetic run of job j.
-- (postgres has no USAGE on cron.runid_seq: a temp sequence above every existing id.)
CREATE TEMP SEQUENCE p1d_runid;
SELECT setval('pg_temp.p1d_runid', (SELECT coalesce(max(runid), 0) FROM cron.job_run_details) + 1000000);
CREATE FUNCTION pg_temp.run(j text, st text, started interval, ended interval) RETURNS void LANGUAGE sql AS $$
  INSERT INTO cron.job_run_details(jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time)
  SELECT jobid, nextval('pg_temp.p1d_runid'), 1, 'postgres', 'postgres', command, st, 'P1D-CANARY row text', now() - started, CASE WHEN ended IS NULL THEN NULL ELSE now() - ended END
    FROM cron.job WHERE jobname = j;
$$;

-- 2. State matrix on synthetic jobs and runs.
BEGIN;
SELECT cron.schedule(n, '0 0 1 1 *', 'SELECT 1')
  FROM unnest(ARRAY['h-ok','h-edgeok','h-edgestale','h-stale','h-never','h-fail1','h-fail2','h-running','h-inactive','h-oldfails','h-onlyfail']) AS n;
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'h-inactive'), active := false);
SELECT pg_temp.run('h-ok', 'succeeded', '7 days 12 hours', '7 days 12 hours'); -- outside runs_7d, inside 8 d
SELECT pg_temp.run('h-ok', 'succeeded', '61 minutes', '1 hour');
SELECT pg_temp.run('h-stale', 'succeeded', '30 hours 31 minutes', '30 hours 30 minutes');  -- floor -> 30
SELECT pg_temp.run('h-edgeok', 'succeeded', '26 hours', '25 hours 59 minutes');
SELECT pg_temp.run('h-edgestale', 'succeeded', '26 hours 2 minutes', '26 hours 1 minute');
SELECT pg_temp.run('h-fail1', 'succeeded', '2 hours 1 minute', '2 hours');
SELECT pg_temp.run('h-fail1', 'failed', '1 hour', '1 hour');
SELECT pg_temp.run('h-fail2', 'succeeded', '3 hours 1 minute', '3 hours');
SELECT pg_temp.run('h-fail2', 'failed', '2 hours', '2 hours');
SELECT pg_temp.run('h-fail2', 'failed', '1 hour', '1 hour');
SELECT pg_temp.run('h-running', 'succeeded', '61 minutes', '1 hour');
SELECT pg_temp.run('h-running', 'running', '1 minute', NULL);
SELECT pg_temp.run('h-running', 'starting', '30 seconds', NULL);
SELECT pg_temp.run('h-inactive', 'succeeded', '61 minutes', '1 hour');
SELECT pg_temp.run('h-oldfails', 'failed', '5 hours', '5 hours');
SELECT pg_temp.run('h-oldfails', 'failed', '4 hours', '4 hours');
SELECT pg_temp.run('h-oldfails', 'succeeded', '61 minutes', '1 hour');
SELECT pg_temp.run('h-onlyfail', 'failed', '2 hours', '2 hours');
DO $$
DECLARE got text;
BEGIN
  SELECT string_agg(concat_ws(':', job, state, coalesce(hours_since_success::text, '-'), consecutive_failures, runs_7d), ' ' ORDER BY job) INTO got
    FROM public.cron_job_health(ARRAY['h-ok','h-edgeok','h-edgestale','h-stale','h-never','h-fail1','h-fail2','h-running','h-inactive','h-missing','h-oldfails','h-onlyfail','h-ok']);
  ASSERT got = 'h-edgeok:ok:25:0:1 h-edgestale:stale:26:0:1 h-fail1:ok:2:1:2 h-fail2:failing:3:2:3 h-inactive:inactive:1:0:1 h-missing:missing:-:0:0 h-never:stale:-:0:0 '
            || 'h-ok:ok:1:0:1 h-oldfails:ok:1:0:3 h-onlyfail:stale:-:1:1 h-running:ok:1:0:3 h-stale:stale:30:0:1',
    'state matrix: '||coalesce(got, 'NULL');
END $$;
ROLLBACK;

-- 3. Invalid input raises 22023 (no injection surface: names are validated and
--    only compared, never executed).
DO $$
DECLARE bad text[];
BEGIN
  FOREACH bad SLICE 1 IN ARRAY ARRAY[[NULL::text, 'x'], ['A', 'x'], ['x;drop', 'x'], ['', 'x'], ['-x', 'x'], [repeat('a', 64), 'x']] LOOP
    BEGIN PERFORM public.cron_job_health(bad); RAISE EXCEPTION 'accepted %', bad;
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  BEGIN PERFORM public.cron_job_health(NULL); RAISE EXCEPTION 'accepted NULL';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.cron_job_health(ARRAY[]::text[]); RAISE EXCEPTION 'accepted empty';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.cron_job_health(array_fill('a'::text, ARRAY[21])); RAISE EXCEPTION 'accepted 21 names';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  ASSERT (SELECT count(*) FROM public.cron_job_health(array_fill('a'::text, ARRAY[20]))) = 1, '20 duplicate names not collapsed';
END $$;

-- 4. Prune (02): job definition when applied; the command deletes only finished
--    runs older than 30 days; retention exceeds the health lookback.
BEGIN;
SELECT cron.schedule('h-prune', '0 0 1 1 *', 'SELECT 1');
SELECT pg_temp.run('h-prune', 'succeeded', '31 days 1 minute', '31 days');   -- deleted
SELECT pg_temp.run('h-prune', 'failed', '45 days', '44 days 23 hours');      -- deleted
SELECT pg_temp.run('h-prune', 'succeeded', '29 days 1 minute', '29 days');   -- kept
SELECT pg_temp.run('h-prune', 'running', '40 days', NULL);                   -- kept (in progress)
DO $$
DECLARE
  want text := 'DELETE FROM cron.job_run_details WHERE end_time < now() - interval ''30 days''';
  cmd text; before bigint; after bigint; j bigint := (SELECT jobid FROM cron.job WHERE jobname = 'h-prune');
BEGIN
  ASSERT (SELECT count(*) FROM cron.job WHERE jobname = 'purge-cron-run-details') <= 1, 'prune job duplicated';
  SELECT command INTO cmd FROM cron.job WHERE jobname = 'purge-cron-run-details';
  IF cmd IS NOT NULL THEN
    ASSERT cmd = want AND (SELECT schedule = '50 20 * * *' AND active AND username = 'postgres' FROM cron.job WHERE jobname = 'purge-cron-run-details'), 'prune job definition';
  END IF;
  ASSERT interval '30 days' > interval '7 days' AND interval '30 days' > interval '26 hours', 'retention not above health lookback';
  SELECT count(*) INTO before FROM cron.job_run_details;
  EXECUTE coalesce(cmd, want);
  SELECT count(*) INTO after FROM cron.job_run_details;
  ASSERT (SELECT count(*) FROM cron.job_run_details WHERE jobid = j) = 2, 'prune kept wrong rows for synthetic job';
  ASSERT NOT EXISTS (SELECT 1 FROM cron.job_run_details WHERE end_time < now() - interval '30 days'), 'old finished run left';
  ASSERT EXISTS (SELECT 1 FROM cron.job_run_details WHERE jobid = j AND end_time IS NULL), 'in-progress run deleted';
  ASSERT before - after >= 2, 'prune deleted '||(before - after);
  -- Existing jobs untouched.
  ASSERT (SELECT count(*) FROM cron.job WHERE jobname IN ('purge-free-history','purge-api-rate-limits','storage-cleanup','purge-fit-shadow')) = 4, 'existing jobs changed';
END $$;
ROLLBACK;
