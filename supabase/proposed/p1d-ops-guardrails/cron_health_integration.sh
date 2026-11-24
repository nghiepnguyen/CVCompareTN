#!/usr/bin/env bash
# PROPOSED (P1-D) integration test — DISPOSABLE LOCAL STACK ONLY (commits
# synthetic cron jobs, applies 01 + 02 itself, re-times the prune job). Never
# point it at production.
#   scripts/ci/db-stack.sh "$W"
#   supabase/proposed/p1d-ops-guardrails/cron_health_integration.sh "$W"
# Proves with REAL pg_cron runs: the health states from actual executions, the
# HTTP permission boundary (/rpc), the server handler end to end against the
# local DB, no run text in any response, and the prune job deleting only
# finished runs older than 30 days.
set -euo pipefail
WORK="${1:?usage: cron_health_integration.sh <scratch dir from scripts/ci/db-stack.sh>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
# shellcheck disable=SC1091
. "$WORK/db.env"
case "$SUPABASE_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "Refusing: not a local stack" >&2; exit 2 ;; esac
q() { docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
val() { docker exec -i "$DB_CONTAINER" psql -U postgres -X -At -v ON_ERROR_STOP=1 -c "$1"; }
pass=0; ok() { pass=$((pass + 1)); echo "PASS  $1"; }
fail() { echo "FAIL  $1" >&2; exit 1; }

q -c "SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'p1d-%'" >/dev/null
q < "$HERE/01_cron_job_health.sql" >/dev/null
q < "$HERE/02_purge_cron_job_run_details_pg_cron.sql" >/dev/null
ORIG_PRUNE="$(val "select schedule||'|'||command||'|'||active from cron.job where jobname = 'purge-cron-run-details'")"

# Wait (each poll a fresh snapshot) until job j has n runs with status st.
wait_runs() { # wait_runs <job> <n> <status>
  docker exec -i "$DB_CONTAINER" psql -U postgres -X -At -v ON_ERROR_STOP=1 <<SQL
DO \$\$ DECLARE c int; t0 timestamptz := clock_timestamp(); BEGIN
  LOOP
    SELECT count(*) INTO c FROM cron.job_run_details d JOIN cron.job j USING (jobid) WHERE j.jobname = '$1' AND d.status = '$3';
    EXIT WHEN c >= $2 OR clock_timestamp() - t0 > interval '40 seconds';
    PERFORM pg_sleep(0.25);
  END LOOP;
  IF c < $2 THEN RAISE EXCEPTION 'job $1: only % $3 runs', c; END IF;
END \$\$;
SQL
}

# Real runs: one job that succeeds, one that always fails (with canary text in
# its error), one that succeeds and is then deactivated.
q <<'SQL' >/dev/null
SELECT cron.schedule('p1d-ok', '2 seconds', 'SELECT 1');
SELECT cron.schedule('p1d-fail', '2 seconds', $$SELECT 1/0 AS "P1D-CANARY"$$);
SELECT cron.schedule('p1d-off', '2 seconds', 'SELECT 1');
SQL
wait_runs p1d-ok 2 succeeded; wait_runs p1d-fail 2 failed; wait_runs p1d-off 1 succeeded
q -c "SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'p1d-off'), active := false)" \
  -c "SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'p1d-ok'), schedule := '0 0 1 1 *')" \
  -c "SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'p1d-fail'), schedule := '0 0 1 1 *')" >/dev/null
GOT="$(val "select string_agg(job||':'||state||':'||(consecutive_failures >= 2)::text, ' ' order by job) from public.cron_job_health(array['p1d-ok','p1d-fail','p1d-off','p1d-none'])")"
[ "$GOT" = "p1d-fail:failing:true p1d-none:missing:false p1d-off:inactive:false p1d-ok:ok:false" ] || fail "states from real runs: $GOT"
ok "states from real pg_cron runs: ok / failing (>=2 real failures) / inactive / missing"

# HTTP boundary: service key allowed, anon key refused; no run text returned.
body=$(curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/cron_job_health" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H 'Content-Type: application/json' -d '{"p_jobs":["p1d-ok","p1d-fail"]}')
echo "$body" | grep -q '"state":"failing"' || fail "service_role /rpc body: $body"
echo "$body" | grep -qiE 'canary|division|SELECT' && fail "run text leaked over /rpc"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SUPABASE_URL/rest/v1/rpc/cron_job_health" -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" -H 'Content-Type: application/json' -d '{"p_jobs":["p1d-ok"]}')
case "$code" in 401|403) ;; *) fail "anon /rpc returned $code" ;; esac
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SUPABASE_URL/rest/v1/rpc/cron_job_health" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H 'Content-Type: application/json' -d '{"p_jobs":["Bad;name"]}')
[ "$code" = "400" ] || fail "invalid job name over /rpc returned $code"
ok "/rpc: service_role reads enums only (no run text); anon 401/403; invalid name 400"

# Server handler end to end against the local DB (no Vercel env => guard allows).
out=$(cd "$REPO" && SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" npx --yes tsx -e '
import { handleCronHealth } from "./_server-lib/admin/cronHealth.ts";
import { getSupabaseAdmin } from "./_server-lib/payment/supabaseAdmin.ts";
(async () => {
  const a = await handleCronHealth("p1d-ok", getSupabaseAdmin());
  const b = await handleCronHealth("p1d-ok,p1d-fail,p1d-none", getSupabaseAdmin());
  const c = await handleCronHealth("p1d-ok,DROP TABLE", getSupabaseAdmin());
  console.log(JSON.stringify([a, b, c]));
})();
' 2>&1)
echo "$out" | python3 -c '
import json,sys
a,b,c=json.loads(sys.stdin.read().strip().splitlines()[-1])
assert a["status"]==200 and a["body"]["healthy"] is True, a
assert b["status"]==503 and b["body"]["healthy"] is False and [j["state"] for j in b["body"]["jobs"]]==["ok","failing","missing"], b
assert c["status"]==400 and c["body"]=={"error":"invalid_jobs"}, c
for j in b["body"]["jobs"]: assert set(j)=={"job","state","hours_since_success","consecutive_failures","runs_7d"}, j
' || fail "handler end to end: $out"
echo "$out" | grep -qiE 'canary|division' && fail "run text leaked through handler"
ok "handler end to end: healthy 200 / unhealthy 503 with exact keys / invalid list 400, no run text"

# Missing function degrades to 503 health_function_missing.
q -c "ALTER FUNCTION public.cron_job_health(text[]) RENAME TO cron_job_health_hidden" -c "NOTIFY pgrst, 'reload schema'" >/dev/null
for _ in 1 2 3 4 5 6 7 8; do
  out=$(cd "$REPO" && SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" npx --yes tsx -e '
import { handleCronHealth } from "./_server-lib/admin/cronHealth.ts";
import { getSupabaseAdmin } from "./_server-lib/payment/supabaseAdmin.ts";
(async () => console.log(JSON.stringify(await handleCronHealth("p1d-ok", getSupabaseAdmin()))))();' 2>&1 | tail -1)
  echo "$out" | grep -q health_function_missing && break
  docker exec "$DB_CONTAINER" psql -U postgres -At -c "select pg_sleep(0.5)" >/dev/null
done
q -c "ALTER FUNCTION public.cron_job_health_hidden(text[]) RENAME TO cron_job_health" -c "NOTIFY pgrst, 'reload schema'" >/dev/null
[ "$out" = '{"status":503,"body":{"healthy":false,"error":"health_function_missing"}}' ] || fail "missing function: $out"
ok "function not applied => 503 {healthy:false, error:health_function_missing}"

# Prune job (02) for real: re-timed to 2 s, then restored.
q <<'SQL' >/dev/null
INSERT INTO cron.job_run_details(jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time)
SELECT jobid, (SELECT max(runid) FROM cron.job_run_details) + 1000000 + row_number() OVER (), 1, 'postgres', 'postgres', 'SELECT 1', s, 'x', now() - st, CASE WHEN en IS NULL THEN NULL ELSE now() - en END
  FROM cron.job, (VALUES ('succeeded', interval '31 days 1 minute', interval '31 days'),
                         ('succeeded', interval '29 days 1 minute', interval '29 days'),
                         ('running',   interval '40 days', NULL::interval)) AS v(s, st, en)
 WHERE jobname = 'p1d-ok';
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'purge-cron-run-details'), schedule := '2 seconds');
SQL
wait_runs purge-cron-run-details 1 succeeded
q -c "SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'purge-cron-run-details'), schedule := '50 20 * * *')" >/dev/null
[ "$(val "select count(*) from cron.job_run_details where end_time < now() - interval '30 days'")" = "0" ] || fail "old finished run survived prune"
[ "$(val "select count(*) from cron.job_run_details d join cron.job j using (jobid) where j.jobname = 'p1d-ok' and (d.end_time is null or d.end_time < now() - interval '28 days')")" = "2" ] || fail "prune removed a kept row"
[ "$(val "select schedule||'|'||command||'|'||active from cron.job where jobname = 'purge-cron-run-details'")" = "$ORIG_PRUNE" ] || fail "prune job not restored"
ok "prune job ran via pg_cron: >30-day finished run deleted, 29-day and in-progress kept; definition restored"

q -c "SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'p1d-%'" >/dev/null
echo "cron health integration: $pass checks passed"
