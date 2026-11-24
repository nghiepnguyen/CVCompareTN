-- PROPOSED (P1-D) — NOT A MIGRATION. Lives outside supabase/migrations so
-- `supabase db push` and CI never apply it. Adopt with separate owner approval:
-- copy into supabase/migrations with a fresh timestamp, move the test into
-- supabase/tests/. Until then GET /api/admin/cron-health answers 503
-- {error: 'health_function_missing'}.
--
-- Read-only health of named pg_cron jobs for the GitHub Actions watcher
-- (.github/workflows/cron-health.yml, OFF by default). Returns enums, ages and
-- counts only — never return_message or command — so alerts carry no row data.
--   missing   no job with that name
--   inactive  job exists but active = false
--   failing   >= 2 failed runs since the last success (one failure is reported
--             in consecutive_failures but does not page)
--   stale     no successful run in retained history, or the last one ended
--             more than 26 hours ago (daily schedule + 2 h grace)
--   ok        otherwise
-- Only 'failed' counts as a failure ('running'/'starting' do not). Add a job to
-- the watcher's expected list only after its first success.
CREATE OR REPLACE FUNCTION public.cron_job_health(p_jobs text[])
RETURNS TABLE (job text, state text, hours_since_success integer, consecutive_failures integer, runs_7d integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_jobs IS NULL OR cardinality(p_jobs) NOT BETWEEN 1 AND 20
     OR EXISTS (SELECT 1 FROM unnest(p_jobs) AS u(n) WHERE u.n IS NULL OR u.n !~ '^[a-z0-9][a-z0-9-]{0,62}$') THEN
    RAISE EXCEPTION 'invalid job list' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH want AS (SELECT DISTINCT u.n AS name FROM unnest(p_jobs) AS u(n)),
  j AS (
    SELECT w.name, c.jobid, c.active
      FROM want AS w
      LEFT JOIN LATERAL (SELECT x.jobid, x.active FROM cron.job AS x WHERE x.jobname = w.name ORDER BY x.jobid LIMIT 1) AS c ON true
  ),
  a AS (
    SELECT j.name, j.jobid, j.active,
           (SELECT max(d.end_time) FROM cron.job_run_details AS d WHERE d.jobid = j.jobid AND d.status = 'succeeded') AS last_ok,
           (SELECT max(d.start_time) FROM cron.job_run_details AS d WHERE d.jobid = j.jobid AND d.status = 'succeeded') AS last_ok_start,
           (SELECT count(*) FROM cron.job_run_details AS d WHERE d.jobid = j.jobid AND d.start_time > now() - interval '7 days') AS runs7
      FROM j
  )
  SELECT a.name,
         CASE
           WHEN a.jobid IS NULL THEN 'missing'
           WHEN NOT a.active THEN 'inactive'
           WHEN f.fails >= 2 THEN 'failing'
           WHEN a.last_ok IS NULL OR a.last_ok < now() - interval '26 hours' THEN 'stale'
           ELSE 'ok'
         END,
         CASE WHEN a.last_ok IS NULL THEN NULL ELSE floor(extract(epoch FROM now() - a.last_ok) / 3600)::integer END,
         f.fails::integer,
         a.runs7::integer
    FROM a
    CROSS JOIN LATERAL (
      SELECT count(*) AS fails FROM cron.job_run_details AS d
       WHERE d.jobid = a.jobid AND d.status = 'failed' AND d.start_time > coalesce(a.last_ok_start, '-infinity'::timestamptz)
    ) AS f
   ORDER BY a.name;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_job_health(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_job_health(text[]) TO service_role;
COMMENT ON FUNCTION public.cron_job_health(text[]) IS
  'P1-D: per-job state (ok/missing/inactive/stale/failing), hours since last success, consecutive failures, runs in 7 days. No run text.';
