#!/usr/bin/env bash
# PROPOSED (P1-B) pg_cron INTEGRATION test — real job execution, not just
# definitions. DISPOSABLE LOCAL STACK ONLY: it commits synthetic rows, applies
# 01/02/04 itself, re-times the jobs to run every 2 seconds, and finally drops
# the P1 functions (rollback drill). Never point it at production.
#
#   scripts/ci/db-stack.sh "$W"                      # fresh stack
#   supabase/proposed/p1-log-retention/cron_integration.sh "$W"
#   (cd "$W" && supabase db reset)                   # before db-tests.sh again
#
# Covers: (1) cron extension + API-role privileges, (2) actual scrub/purge
# execution, (3) job owner and execution role, (4) invalid settings fail the
# run, (5) with no partial change, (6) coexistence with purge-fit-shadow,
# (7) idempotent repeated runs, (8) billing/quota/history untouched,
# (9) failure visible in cron.job_run_details without row content,
# (10) disable (active=false), unschedule and drop-functions rollback.
set -euo pipefail

WORK="${1:?usage: cron_integration.sh <scratch dir from scripts/ci/db-stack.sh>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. "$WORK/db.env"
case "$SUPABASE_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "Refusing: SUPABASE_URL is not a local stack" >&2; exit 2 ;;
esac
psql_q() { docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
val() { docker exec -i "$DB_CONTAINER" psql -U postgres -X -At -v ON_ERROR_STOP=1 -c "$1"; }

# Fresh-stack guard: no real-looking data may be touched.
[ "$(val "select count(*) from public.analysis_log where id::text not like '00000000-0000-4000-8000-0000000c%'")" = "0" ] \
  || { echo "Refusing: analysis_log has rows not created by this test (reset the stack)" >&2; exit 1; }

pass=0
ok() { pass=$((pass + 1)); echo "PASS  $1"; }

# Re-runnable: remove this script's own synthetic rows from an earlier run.
psql_q -c "DELETE FROM public.analysis_log WHERE id::text LIKE '00000000-0000-4000-8000-0000000c%'" \
       -c "DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000c1'" >/dev/null

psql_q < "$HERE/01_purge_expired_analysis_log.sql" >/dev/null 2>&1
psql_q < "$HERE/02_scrub_analysis_log_detail_pg_cron.sql" >/dev/null
psql_q < "$HERE/04_purge_expired_analysis_log_pg_cron.sql" >/dev/null

# Helpers in a scratch schema (dropped at the end).
psql_q <<'SQL'
DROP SCHEMA IF EXISTS p1b_it CASCADE;
CREATE SCHEMA p1b_it;
CREATE TABLE p1b_it.orig AS SELECT jobname, schedule, command, database, username, active FROM cron.job;
CREATE TABLE p1b_it.mark(k text PRIMARY KEY, at timestamptz NOT NULL);
-- Waits (outside any long transaction: each poll is a fresh snapshot under
-- READ COMMITTED) until job `j` has `n` runs with `st` since mark `m`.
CREATE FUNCTION p1b_it.wait(j text, m text, n int, st text, secs int DEFAULT 30) RETURNS int LANGUAGE plpgsql AS $$
DECLARE c int; t0 timestamptz := clock_timestamp();
BEGIN
  LOOP
    SELECT count(*) INTO c FROM cron.job_run_details d JOIN cron.job x USING (jobid)
     WHERE x.jobname = j AND d.status = st AND d.start_time >= (SELECT at FROM p1b_it.mark WHERE k = m);
    EXIT WHEN c >= n OR clock_timestamp() - t0 > make_interval(secs => secs);
    PERFORM pg_sleep(0.25);
  END LOOP;
  RETURN c;
END $$;
CREATE FUNCTION p1b_it.runs(j text, m text) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM cron.job_run_details d JOIN cron.job x USING (jobid)
   WHERE x.jobname = j AND d.start_time >= (SELECT at FROM p1b_it.mark WHERE k = m);
$$;
CREATE FUNCTION p1b_it.set_mark(m text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO p1b_it.mark VALUES (m, clock_timestamp()) ON CONFLICT (k) DO UPDATE SET at = EXCLUDED.at;
$$;
CREATE FUNCTION p1b_it.retime(j text, s text) RETURNS void LANGUAGE sql AS $$
  SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = j), schedule := s);
$$;
-- Fingerprint of every column of the synthetic rows.
CREATE FUNCTION p1b_it.fp() RETURNS text LANGUAGE sql AS $$
  SELECT md5(coalesce(string_agg(concat_ws('|', id, user_id, kind, status, created_at, input_tokens, output_tokens, model, latency_ms, error_message, guard_metrics::text), ',' ORDER BY id), ''))
    FROM public.analysis_log;
$$;
CREATE FUNCTION p1b_it.unrelated() RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws('|', (SELECT count(*) FROM public.analytics_quota_reservations), (SELECT count(*) FROM public.history),
                   (SELECT count(*) FROM public.payments), (SELECT count(*) FROM public.admin_audit_log),
                   (SELECT count(*) FROM public.profiles), (SELECT coalesce(sum(usage_count), 0) FROM public.profiles));
$$;
CREATE TABLE p1b_it.probe(who text, sess text, at timestamptz DEFAULT clock_timestamp());
SQL

# Synthetic rows, COMMITTED (pg_cron runs in its own sessions). 'PII-CANARY'
# must never surface in any cron diagnostic.
psql_q <<'SQL'
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-0000000000c1');
INSERT INTO public.profiles(id, email, plan, role, usage_count)
  VALUES ('00000000-0000-4000-8000-0000000000c1', 'p1b-cron@example.test', 'free', 'user', 4);
INSERT INTO public.history(user_id, analysis_id, timestamp)
  VALUES ('00000000-0000-4000-8000-0000000000c1', 'p1b-cron-history', now() - interval '500 days');
INSERT INTO public.analysis_log(id, user_id, status, kind, created_at, input_tokens, output_tokens, model, latency_ms, error_message, guard_metrics) VALUES
  ('00000000-0000-4000-8000-0000000c0031', '00000000-0000-4000-8000-0000000000c1', 'success', 'analyze', now() - interval '31 days',  1, 1, 'm', 1, NULL, '{"v":1,"fitShadow":{"v":1}}'),
  ('00000000-0000-4000-8000-0000000c0089', '00000000-0000-4000-8000-0000000000c1', 'error',   'analyze', now() - interval '89 days',  0, 0, NULL, NULL, 'PII-CANARY 89', NULL),
  ('00000000-0000-4000-8000-0000000c0091', '00000000-0000-4000-8000-0000000000c1', 'error',   'analyze', now() - interval '91 days',  0, 0, NULL, NULL, 'PII-CANARY 91', NULL),
  ('00000000-0000-4000-8000-0000000c0092', '00000000-0000-4000-8000-0000000000c1', 'success', 'analyze', now() - interval '92 days',  2, 2, 'm', 2, NULL, '{"v":1,"fitShadow":{"v":1}}'),
  ('00000000-0000-4000-8000-0000000c0399', '00000000-0000-4000-8000-0000000000c1', 'success', 'rewrite', now() - interval '399 days', 3, 3, 'm', 3, NULL, '{"v":1,"coverLetter":{}}'),
  ('00000000-0000-4000-8000-0000000c0401', '00000000-0000-4000-8000-0000000000c1', 'success', 'rewrite', now() - interval '401 days', 4, 4, 'm', 4, NULL, '{"v":1}'),
  ('00000000-0000-4000-8000-0000000c0402', NULL,                                   'error',   'parse_cv', now() - interval '402 days', 0, 0, NULL, NULL, 'PII-CANARY 402', NULL);
SELECT p1b_it.set_mark('start');
SQL
UNRELATED0="$(val "select p1b_it.unrelated()")"

# (1) Extension, schema privileges, API roles cannot schedule or call.
[ "$(val "select count(*) from pg_extension where extname = 'pg_cron'")" = "1" ] || { echo "FAIL pg_cron missing"; exit 1; }
[ "$(val "select bool_or(has_schema_privilege(r, 'cron', 'USAGE')) from unnest(array['anon','authenticated','service_role']) r")" = "f" ] \
  || { echo "FAIL an API role has USAGE on schema cron"; exit 1; }
# pg_cron grants SELECT on cron.job/job_run_details to PUBLIC (row-filtered by
# username); unreachable while schema USAGE is denied, and cron is not an
# exposed PostgREST schema. Assert the schema ACL is exactly that.
[ "$(val "select nspacl::text from pg_namespace where nspname = 'cron'")" = "{supabase_admin=UC/supabase_admin,postgres=U*/supabase_admin}" ] \
  || { echo "FAIL schema cron ACL changed: $(val "select nspacl::text from pg_namespace where nspname = 'cron'")"; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' "$SUPABASE_URL/rest/v1/job?select=jobname" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H 'Accept-Profile: cron')
case "$code" in 404|406) ;; *) echo "FAIL cron schema reachable over PostgREST ($code)"; exit 1 ;; esac
for f in scrub_expired_analysis_log_detail purge_expired_analysis_log analysis_log_retention_cutoffs; do
  for key in "$SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_ANON_KEY"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SUPABASE_URL/rest/v1/rpc/$f" \
      -H "apikey: $key" -H "Authorization: Bearer $key" -H 'Content-Type: application/json' -d '{}')
    case "$code" in 401|403) ;; *) echo "FAIL /rpc/$f returned $code"; exit 1 ;; esac
  done
done
[ "$(val "select p1b_it.fp()")" = "$(val "select p1b_it.fp()")" ] && ok "1 pg_cron present; API roles: no cron USAGE, /rpc on all 3 P1 functions refused (401/403)"

# Scheduler sanity + (3) execution role: a probe job records current_user.
psql_q -c "SELECT cron.schedule('p1b-probe', '2 seconds', \$\$INSERT INTO p1b_it.probe(who, sess) SELECT current_user, session_user\$\$)" >/dev/null
[ "$(val "select p1b_it.wait('p1b-probe', 'start', 1, 'succeeded')")" -ge 1 ] || { echo "FAIL scheduler did not run probe"; exit 1; }
psql_q -c "SELECT cron.unschedule('p1b-probe')" >/dev/null
[ "$(val "select bool_and(who = 'postgres' and sess = 'postgres') from p1b_it.probe")" = "t" ] || { echo "FAIL probe ran as $(val "select who from p1b_it.probe limit 1")"; exit 1; }
[ "$(val "select count(*) from cron.job where jobname in ('scrub-analysis-log-detail','purge-analysis-log') and username = 'postgres' and database = 'postgres' and active")" = "2" ] \
  || { echo "FAIL P1 job owner/database"; exit 1; }
[ "$(val "select count(*) from pg_proc where proname in ('scrub_expired_analysis_log_detail','purge_expired_analysis_log','analysis_log_retention_cutoffs') and pronamespace = 'public'::regnamespace and pg_get_userbyid(proowner) = 'postgres'")" = "3" ] \
  || { echo "FAIL P1 function owner"; exit 1; }
ok "3 jobs owned by postgres in db postgres, run as current_user=session_user=postgres; functions owned by postgres"

# (2)+(7) Scrub job actually runs, twice: second run changes nothing.
psql_q -c "SELECT p1b_it.set_mark('scrub'); SELECT p1b_it.retime('scrub-analysis-log-detail', '2 seconds')" >/dev/null
[ "$(val "select p1b_it.wait('scrub-analysis-log-detail', 'scrub', 1, 'succeeded')")" -ge 1 ] || { echo "FAIL scrub job did not succeed"; exit 1; }
FP1="$(val "select p1b_it.fp()")"
[ "$(val "select p1b_it.wait('scrub-analysis-log-detail', 'scrub', 3, 'succeeded')")" -ge 3 ] || { echo "FAIL scrub job did not repeat"; exit 1; }
psql_q -c "SELECT p1b_it.retime('scrub-analysis-log-detail', '30 20 * * *')" >/dev/null
[ "$(val "select p1b_it.fp()")" = "$FP1" ] || { echo "FAIL repeated scrub changed rows"; exit 1; }
[ "$(val "select count(*) from cron.job_run_details d join cron.job j using (jobid) where j.jobname = 'scrub-analysis-log-detail' and d.status <> 'succeeded'")" = "0" ] || { echo "FAIL scrub run not succeeded"; exit 1; }
R="$(val "select string_agg(id::text || '=' || (error_message is null and guard_metrics is null)::text, ',' order by id) from public.analysis_log")"
[ "$R" = "00000000-0000-4000-8000-0000000c0031=false,00000000-0000-4000-8000-0000000c0089=false,00000000-0000-4000-8000-0000000c0091=true,00000000-0000-4000-8000-0000000c0092=true,00000000-0000-4000-8000-0000000c0399=true,00000000-0000-4000-8000-0000000c0401=true,00000000-0000-4000-8000-0000000c0402=true" ] \
  || { echo "FAIL scrub result $R"; exit 1; }
ok "2/7 scrub job ran ≥3 times via cron: 31/89-day rows keep detail, 91+ scrubbed, repeat runs change nothing"

# (2)+(7) Purge job: 401/402 deleted, 399 kept; repeat runs delete nothing.
psql_q -c "SELECT p1b_it.set_mark('purge'); SELECT p1b_it.retime('purge-analysis-log', '2 seconds')" >/dev/null
[ "$(val "select p1b_it.wait('purge-analysis-log', 'purge', 3, 'succeeded')")" -ge 3 ] || { echo "FAIL purge job did not run 3 times"; exit 1; }
psql_q -c "SELECT p1b_it.retime('purge-analysis-log', '40 20 * * *')" >/dev/null
[ "$(val "select string_agg(right(id::text, 4), ',' order by id) from public.analysis_log")" = "0031,0089,0091,0092,0399" ] || { echo "FAIL purge result"; exit 1; }
ok "2/7 purge job ran ≥3 times via cron: 401/402-day rows deleted, 399 kept"

# (4)(5)(9) Invalid settings: the run FAILS, is visible, changes nothing, and
# its diagnostic carries no row content. Fresh scrubbable/expired rows first.
psql_q <<'SQL'
INSERT INTO public.analysis_log(id, user_id, status, kind, created_at, input_tokens, output_tokens, error_message) VALUES
  ('00000000-0000-4000-8000-0000000c0500', NULL, 'error', 'analyze', now() - interval '120 days', 0, 0, 'PII-CANARY 120'),
  ('00000000-0000-4000-8000-0000000c0501', NULL, 'error', 'analyze', now() - interval '450 days', 0, 0, 'PII-CANARY 450');
SQL
FP2="$(val "select p1b_it.fp()")"
for bad in "UPDATE public.app_settings SET value = '365' WHERE key = 'analysis_log_retention_days'|outside [366, 3650]" \
           "UPDATE public.app_settings SET value = '99999999999' WHERE key = 'analysis_log_retention_days'|not an integer" \
           "DELETE FROM public.app_settings WHERE key = 'analysis_log_detail_retention_days'|analysis_log_detail_retention_days missing"; do
  sql="${bad%%|*}"; msg="${bad#*|}"
  psql_q -c "$sql" -c "SELECT p1b_it.set_mark('bad'); SELECT p1b_it.retime('scrub-analysis-log-detail', '2 seconds'); SELECT p1b_it.retime('purge-analysis-log', '2 seconds')" >/dev/null
  s=$(val "select p1b_it.wait('scrub-analysis-log-detail', 'bad', 2, 'failed')"); p=$(val "select p1b_it.wait('purge-analysis-log', 'bad', 2, 'failed')")
  psql_q -c "SELECT p1b_it.retime('scrub-analysis-log-detail', '30 20 * * *'); SELECT p1b_it.retime('purge-analysis-log', '40 20 * * *')" >/dev/null
  [ "$s" -ge 2 ] && [ "$p" -ge 2 ] || { echo "FAIL [$sql]: failed runs scrub=$s purge=$p"; exit 1; }
  [ "$(val "select count(*) from cron.job_run_details d join cron.job j using (jobid) where j.jobname in ('scrub-analysis-log-detail','purge-analysis-log') and d.start_time >= (select at from p1b_it.mark where k = 'bad') and d.status = 'succeeded'")" = "0" ] \
    || { echo "FAIL [$sql]: a run succeeded"; exit 1; }
  [ "$(val "select bool_and(position('$msg' in d.return_message) > 0) from cron.job_run_details d join cron.job j using (jobid) where j.jobname in ('scrub-analysis-log-detail','purge-analysis-log') and d.start_time >= (select at from p1b_it.mark where k = 'bad')")" = "t" ] \
    || { echo "FAIL [$sql]: return_message lacks '$msg'"; exit 1; }
  [ "$(val "select p1b_it.fp()")" = "$FP2" ] || { echo "FAIL [$sql]: rows changed"; exit 1; }
  [ "$(val "select count(*) from cron.job where jobname in ('scrub-analysis-log-detail','purge-analysis-log') and active")" = "2" ] || { echo "FAIL jobs deactivated by failure"; exit 1; }
  psql_q -c "INSERT INTO public.app_settings(key, value) VALUES ('analysis_log_detail_retention_days', '90'), ('analysis_log_retention_days', '400') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value" >/dev/null
done
[ "$(val "select count(*) from cron.job_run_details where return_message ilike '%PII-CANARY%' or command ilike '%PII-CANARY%'")" = "0" ] || { echo "FAIL row content in cron diagnostics"; exit 1; }
[ "$(docker logs --since 10m "$DB_CONTAINER" 2>&1 | grep -c 'PII-CANARY' || true)" = "0" ] || { echo "FAIL row content in postgres log"; exit 1; }
ok "4/5/9 invalid settings (365, 99999999999, missing key): every cron run 'failed' with the 22023 message, 0 rows changed, jobs stay active, no row content in job_run_details or postgres log"

# (6) Coexistence with purge-fit-shadow: both jobs every 2 s at once.
psql_q <<'SQL' >/dev/null
INSERT INTO public.analysis_log(id, user_id, status, kind, created_at, input_tokens, output_tokens, guard_metrics) VALUES
  ('00000000-0000-4000-8000-0000000c0600', NULL, 'success', 'analyze', now() - interval '40 days', 1, 1, '{"v":1,"fitShadow":{"v":1}}'),
  ('00000000-0000-4000-8000-0000000c0601', NULL, 'success', 'analyze', now() - interval '95 days', 1, 1, '{"v":1,"fitShadow":{"v":1}}');
SELECT p1b_it.set_mark('fit');
SELECT p1b_it.retime('purge-fit-shadow', '2 seconds');
SELECT p1b_it.retime('scrub-analysis-log-detail', '2 seconds');
SQL
f=$(val "select p1b_it.wait('purge-fit-shadow', 'fit', 3, 'succeeded')"); s=$(val "select p1b_it.wait('scrub-analysis-log-detail', 'fit', 3, 'succeeded')")
psql_q -c "SELECT p1b_it.retime('purge-fit-shadow', '20 20 * * *'); SELECT p1b_it.retime('scrub-analysis-log-detail', '30 20 * * *')" >/dev/null
[ "$f" -ge 3 ] && [ "$s" -ge 3 ] || { echo "FAIL fit=$f scrub=$s"; exit 1; }
[ "$(val "select count(*) from cron.job_run_details d join cron.job j using (jobid) where j.jobname in ('purge-fit-shadow','scrub-analysis-log-detail') and d.start_time >= (select at from p1b_it.mark where k = 'fit') and d.status <> 'succeeded'")" = "0" ] || { echo "FAIL a concurrent run failed"; exit 1; }
[ "$(val "select guard_metrics::text from public.analysis_log where id = '00000000-0000-4000-8000-0000000c0600'")" = '{"v": 1}' ] || { echo "FAIL 40-day fitShadow not stripped"; exit 1; }
[ "$(val "select (guard_metrics is null)::text from public.analysis_log where id = '00000000-0000-4000-8000-0000000c0601'")" = "true" ] || { echo "FAIL 95-day row not scrubbed"; exit 1; }
[ "$(val "select (guard_metrics->>'v') from public.analysis_log where id = '00000000-0000-4000-8000-0000000c0031'")" = "1" ] || { echo "FAIL 31-day row"; exit 1; }
ok "6 purge-fit-shadow + scrub fired together ≥3 times each, no failed run; fitShadow stripped at 40d, full scrub at 95d"

# (8) Billing / quota / history untouched across every run above.
[ "$(val "select p1b_it.unrelated()")" = "$UNRELATED0" ] || { echo "FAIL unrelated tables changed"; exit 1; }
[ "$(val "select count(*) from public.history where analysis_id = 'p1b-cron-history'")" = "1" ] || { echo "FAIL old history deleted"; exit 1; }
ok "8 ledger, history (incl. 500-day row), payments, admin_audit_log, profiles, usage_count unchanged"

# Every job's definition restored exactly after the re-timing.
[ "$(val "select count(*) from (select jobname, schedule, command, database, username, active from cron.job except select * from p1b_it.orig) x")" = "0" ] \
  && [ "$(val "select count(*) from (select * from p1b_it.orig except select jobname, schedule, command, database, username, active from cron.job) x")" = "0" ] \
  || { echo "FAIL a job definition differs from the original"; exit 1; }
ok "all 6 job definitions restored byte-for-byte after re-timing"

# (10) Disable: active=false at a 2-second schedule => no runs, no change.
psql_q <<'SQL' >/dev/null
INSERT INTO public.analysis_log(id, user_id, status, kind, created_at, input_tokens, output_tokens, error_message) VALUES
  ('00000000-0000-4000-8000-0000000c0700', NULL, 'error', 'analyze', now() - interval '130 days', 0, 0, 'PII-CANARY 130'),
  ('00000000-0000-4000-8000-0000000c0701', NULL, 'error', 'analyze', now() - interval '460 days', 0, 0, 'PII-CANARY 460');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'scrub-analysis-log-detail'), schedule := '2 seconds', active := false);
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'purge-analysis-log'), schedule := '2 seconds', active := false);
SELECT p1b_it.set_mark('off');
SELECT pg_sleep(7);
SQL
[ "$(val "select p1b_it.runs('scrub-analysis-log-detail', 'off') + p1b_it.runs('purge-analysis-log', 'off')")" = "0" ] || { echo "FAIL disabled job ran"; exit 1; }
[ "$(val "select count(*) from public.analysis_log where right(id::text, 4) in ('0700','0701') and error_message is not null")" = "2" ] || { echo "FAIL disabled job changed rows"; exit 1; }
ok "10a active=false: 0 runs in 7 s at a 2-second schedule, rows untouched"

# (10) Rollback order: unschedule BEFORE dropping functions. Wrong order is
# shown to fail loudly (not silently): drop while the scrub job is live.
psql_q <<'SQL' >/dev/null
SELECT cron.unschedule('purge-analysis-log');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'scrub-analysis-log-detail'), active := true);
SELECT p1b_it.set_mark('drop');
DROP FUNCTION public.scrub_expired_analysis_log_detail();
DROP FUNCTION public.purge_expired_analysis_log();
DROP FUNCTION public.analysis_log_retention_cutoffs();
SQL
[ "$(val "select p1b_it.wait('scrub-analysis-log-detail', 'drop', 2, 'failed')")" -ge 2 ] || { echo "FAIL dropped-function job did not fail visibly"; exit 1; }
[ "$(val "select bool_and(return_message ilike '%does not exist%') from cron.job_run_details d join cron.job j using (jobid) where j.jobname = 'scrub-analysis-log-detail' and d.start_time >= (select at from p1b_it.mark where k = 'drop')")" = "t" ] || { echo "FAIL wrong failure message"; exit 1; }
psql_q -c "SELECT cron.unschedule('scrub-analysis-log-detail')" >/dev/null
[ "$(val "select count(*) from cron.job where jobname in ('scrub-analysis-log-detail','purge-analysis-log')")" = "0" ] || { echo "FAIL P1 jobs still scheduled"; exit 1; }
[ "$(val "select count(*) from (select * from p1b_it.orig where jobname not in ('scrub-analysis-log-detail','purge-analysis-log') except select jobname, schedule, command, database, username, active from cron.job) x")" = "0" ] \
  || { echo "FAIL existing jobs changed by rollback"; exit 1; }
[ "$(val "select count(*) from public.analysis_log where right(id::text, 4) in ('0700','0701') and error_message is not null")" = "2" ] || { echo "FAIL rollback changed rows"; exit 1; }
ok "10b rollback: unschedule + DROP leaves 4 existing jobs intact; dropping before unscheduling makes each run fail visibly ('does not exist'), never silently"

psql_q -c "DROP SCHEMA p1b_it CASCADE" >/dev/null
echo "cron integration: $pass checks passed (stack now has P1 functions dropped and synthetic rows; reset it before db-tests.sh)"
