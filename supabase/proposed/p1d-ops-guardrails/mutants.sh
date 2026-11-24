#!/usr/bin/env bash
# PROPOSED (P1-D) mutation test — DISPOSABLE LOCAL STACK ONLY. Each mutant is a
# copy of 01/02 with one defect, applied to a P1-D-clean stack; it must make
# cron_job_health.test.sql FAIL. The unmutated files must pass first (baseline).
# Run from a copy if you edit this file meanwhile (bash reads scripts lazily).
#   supabase/proposed/p1d-ops-guardrails/mutants.sh "<dir from scripts/ci/db-stack.sh>"
set -uo pipefail
WORK="${1:?usage: mutants.sh <scratch dir>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. "$WORK/db.env"
case "$SUPABASE_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "Refusing: not a local stack" >&2; exit 2 ;; esac
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
q() { docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 "$@" >/dev/null 2>&1; }
clean() {
  q -c "SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'purge-cron-run-details'" \
    -c "DROP FUNCTION IF EXISTS public.cron_job_health(text[])"
}
run_test() { docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 < "$HERE/cron_job_health.test.sql" >/dev/null 2>&1; }
killed=0; survived=0; names=()
m() { # m <name> <file> <old> <new>
  local name="$1" file="$2"
  cp "$HERE"/0*.sql "$TMP"/
  python3 - "$HERE/$file" "$TMP/$file" "$3" "$4" <<'PY' || { echo "ANCHOR    $name"; survived=$((survived + 1)); names+=("$name (anchor)"); return; }
import sys
src, dst, old, new = sys.argv[1:5]; s = open(src).read()
if old not in s: sys.exit(1)
open(dst, "w").write(s.replace(old, new, 1))
PY
  clean
  if ! q < "$TMP/01_cron_job_health.sql" || ! q < "$TMP/02_purge_cron_job_run_details_pg_cron.sql"; then
    echo "APPLY-ERR $name"; survived=$((survived + 1)); names+=("$name (apply error)"); return
  fi
  if run_test; then survived=$((survived + 1)); names+=("$name"); echo "SURVIVED  $name"; else killed=$((killed + 1)); echo "KILLED    $name"; fi
}

clean; q < "$HERE/01_cron_job_health.sql"; q < "$HERE/02_purge_cron_job_run_details_pg_cron.sql"
run_test || { echo "BASELINE FAIL: unmutated test fails" >&2; exit 2; }
echo "BASELINE  unmutated test passes"

F1=01_cron_job_health.sql; F2=02_purge_cron_job_run_details_pg_cron.sql
m "stale 26h -> 25h"            $F1 "a.last_ok < now() - interval '26 hours'" "a.last_ok < now() - interval '25 hours'"
m "stale 26h -> 27h"            $F1 "a.last_ok < now() - interval '26 hours'" "a.last_ok < now() - interval '27 hours'"
m "never-run counted ok"        $F1 "WHEN a.last_ok IS NULL OR a.last_ok" "WHEN a.last_ok"
m "failing threshold 2 -> 1"    $F1 "WHEN f.fails >= 2" "WHEN f.fails >= 1"
m "failing threshold 2 -> 3"    $F1 "WHEN f.fails >= 2" "WHEN f.fails >= 3"
m "running counted as failure"  $F1 "AND d.status = 'failed' AND d.start_time > coalesce" "AND d.status <> 'succeeded' AND d.start_time > coalesce"
m "failures counted all time"   $F1 "AND d.status = 'failed' AND d.start_time > coalesce(a.last_ok_start, '-infinity'::timestamptz)" "AND d.status = 'failed'"
m "inactive check dropped"      $F1 "           WHEN NOT a.active THEN 'inactive'
" ""
m "missing check dropped"       $F1 "           WHEN a.jobid IS NULL THEN 'missing'
" ""
m "runs window 7d -> 8d"        $F1 "d.start_time > now() - interval '7 days'" "d.start_time > now() - interval '8 days'"
m "hours floor -> ceil"         $F1 "floor(extract(epoch FROM now() - a.last_ok) / 3600)" "ceil(extract(epoch FROM now() - a.last_ok) / 3600)"
m "last success uses start"     $F1 "(SELECT max(d.end_time) FROM cron.job_run_details AS d WHERE d.jobid = j.jobid AND d.status = 'succeeded') AS last_ok," "(SELECT max(d.start_time) - interval '3 hours' FROM cron.job_run_details AS d WHERE d.jobid = j.jobid AND d.status = 'succeeded') AS last_ok,"
m "name validation dropped"     $F1 "     OR EXISTS (SELECT 1 FROM unnest(p_jobs) AS u(n) WHERE u.n IS NULL OR u.n !~ '^[a-z0-9][a-z0-9-]{0,62}\$') THEN" " THEN"
m "list cap 20 -> 100"          $F1 "cardinality(p_jobs) NOT BETWEEN 1 AND 20" "cardinality(p_jobs) NOT BETWEEN 1 AND 100"
m "duplicates not collapsed"    $F1 "WITH want AS (SELECT DISTINCT u.n AS name" "WITH want AS (SELECT u.n AS name"
m "EXECUTE to anon"             $F1 "GRANT EXECUTE ON FUNCTION public.cron_job_health(text[]) TO service_role;" "GRANT EXECUTE ON FUNCTION public.cron_job_health(text[]) TO service_role, anon;"
m "EXECUTE to authenticated"    $F1 "REVOKE ALL ON FUNCTION public.cron_job_health(text[]) FROM PUBLIC, anon, authenticated;" "REVOKE ALL ON FUNCTION public.cron_job_health(text[]) FROM PUBLIC, anon;"
m "REVOKE dropped (PUBLIC)"     $F1 "REVOKE ALL ON FUNCTION public.cron_job_health(text[]) FROM PUBLIC, anon, authenticated;" ""
# (Dropping the GRANT alone is an equivalent mutant: Supabase default privileges
#  already give service_role EXECUTE on new public functions.)
m "service_role revoked"        $F1 "GRANT EXECUTE ON FUNCTION public.cron_job_health(text[]) TO service_role;" "REVOKE EXECUTE ON FUNCTION public.cron_job_health(text[]) FROM service_role;"
m "not SECURITY DEFINER"        $F1 "STABLE
SECURITY DEFINER" "STABLE"
m "search_path unset"           $F1 "SET search_path = ''
AS \$\$" "AS \$\$"
m "VOLATILE"                    $F1 "LANGUAGE plpgsql
STABLE" "LANGUAGE plpgsql
VOLATILE"
m "run text column added"       $F1 "consecutive_failures integer, runs_7d integer)" "consecutive_failures integer, runs_7d integer, last_message text)"
m "prune 30d -> 7d"             $F2 "end_time < now() - interval '30 days'" "end_time < now() - interval '7 days'"
m "prune deletes in-progress"   $F2 "WHERE end_time < now() - interval '30 days'" "WHERE start_time < now() - interval '30 days'"
m "prune schedule changed"      $F2 "'50 20 * * *'" "'50 19 * * *'"
m "prune 30d -> 31d"            $F2 "end_time < now() - interval '30 days'" "end_time < now() - interval '31 days'"

clean; q < "$HERE/01_cron_job_health.sql"; q < "$HERE/02_purge_cron_job_run_details_pg_cron.sql"
echo "mutants: $killed killed, $survived survived"
[ "$survived" -eq 0 ] || { printf 'survived: %s\n' "${names[@]}"; exit 1; }
