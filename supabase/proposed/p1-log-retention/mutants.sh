#!/usr/bin/env bash
# PROPOSED (P1-B) mutation test — DISPOSABLE LOCAL STACK ONLY. Each mutant is a
# copy of 01/02/03/04 with one deliberate defect; it must make
# purge_expired_analysis_log.test.sql (or, for "cron:" mutants,
# cron_integration.sh) FAIL. Prints KILLED/SURVIVED per mutant; exit 1 if any
# survives. Restores the unmutated 01 + 02 + 04 at the end.
#   supabase/proposed/p1-log-retention/mutants.sh "<dir from scripts/ci/db-stack.sh>" [--no-cron]
set -uo pipefail
WORK="${1:?usage: mutants.sh <scratch dir> [--no-cron]}"; NO_CRON="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. "$WORK/db.env"
case "$SUPABASE_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "Refusing: not a local stack" >&2; exit 2 ;; esac
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
q() { docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 "$@" >/dev/null 2>&1; }
clean_p1() { # nothing of P1 left: as on production before any apply
  q -c "SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('scrub-analysis-log-detail','purge-analysis-log')" \
    -c "DROP TABLE IF EXISTS public.analysis_log_daily" \
    -c "DROP FUNCTION IF EXISTS public.scrub_expired_analysis_log_detail(), public.purge_expired_analysis_log(), public.analysis_log_retention_cutoffs()" \
    -c "DELETE FROM public.app_settings WHERE key IN ('analysis_log_retention_days','analysis_log_detail_retention_days')" \
    -c "DROP SCHEMA IF EXISTS p1b_it CASCADE" \
    -c "DELETE FROM public.analysis_log WHERE id::text LIKE '00000000-0000-4000-8000-0000000c%'" \
    -c "DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000c1'" \
    -c "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'p1b_mut') THEN REVOKE CREATE ON SCHEMA public FROM p1b_mut; DROP ROLE p1b_mut; END IF; END \$\$"
}
reset_p1() { # unmutated state: 01 + 02 + 04, no rollup table, settings at seed
  clean_p1
  q < "$HERE/01_purge_expired_analysis_log.sql"; q < "$HERE/02_scrub_analysis_log_detail_pg_cron.sql"; q < "$HERE/04_purge_expired_analysis_log_pg_cron.sql"
}
# mutate <file> <python-literal old> <python-literal new> : writes $TMP/<file>
mutate() {
  python3 - "$HERE/$1" "$TMP/$1" "$2" "$3" <<'PY'
import sys
src, dst, old, new = sys.argv[1:5]
s = open(src).read()
if old not in s: sys.exit("mutation anchor not found: " + old)
open(dst, "w").write(s.replace(old, new, 1))
PY
}
killed=0; survived=0; names=()
judge() { # judge <name> <rc of the test (0 = test passed = mutant survived)>
  if [ "$2" -ne 0 ]; then killed=$((killed + 1)); echo "KILLED    $1"; else survived=$((survived + 1)); names+=("$1"); echo "SURVIVED  $1"; fi
}
# sql mutant: <name> <file> <old> <new> [also-apply-03]
m() {
  local name="$1" file="$2" old="$3" new="$4" rollup="${5:-}"
  rm -f "$TMP"/*.sql; cp "$HERE"/0*.sql "$TMP"/
  mutate "$file" "$old" "$new" || { echo "ANCHOR    $name"; survived=$((survived + 1)); names+=("$name (anchor)"); return; }
  clean_p1
  local applied=0
  # Apply exactly as production would: 01, then 02 and 04; 03 only for rollup mutants.
  q < "$TMP/01_purge_expired_analysis_log.sql" || applied=1
  q < "$TMP/02_scrub_analysis_log_detail_pg_cron.sql" || applied=1
  q < "$TMP/04_purge_expired_analysis_log_pg_cron.sql" || applied=1
  [ -n "$rollup" ] && { q < "$TMP/03_optional_daily_rollup.sql" || applied=1; }
  if [ $applied -ne 0 ]; then echo "APPLY-ERR $name"; survived=$((survived + 1)); names+=("$name (apply error)"); return; fi
  docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 < "$HERE/purge_expired_analysis_log.test.sql" >/dev/null 2>&1
  judge "$name" $?
}
# Baseline: the unmutated files must PASS, or every "kill" below is meaningless.
reset_p1
docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 < "$HERE/purge_expired_analysis_log.test.sql" >/dev/null 2>&1 \
  || { echo "BASELINE FAIL: purge_expired_analysis_log.test.sql fails unmutated (stack not fresh?)" >&2; exit 2; }
echo "BASELINE  rollback test passes unmutated"
F1=01_purge_expired_analysis_log.sql; F2=02_scrub_analysis_log_detail_pg_cron.sql; F3=03_optional_daily_rollup.sql; F4=04_purge_expired_analysis_log_pg_cron.sql
SCRUB_WHERE="   WHERE created_at < c
     AND (error_message"
m "scrub < to <="               $F1 "$SCRUB_WHERE" "   WHERE created_at <= c
     AND (error_message"
m "purge < to <="               $F1 "DELETE FROM public.analysis_log WHERE created_at < c" "DELETE FROM public.analysis_log WHERE created_at <= c"
m "row floor 366 -> 365"        $F1 "IF dr < 366" "IF dr < 365"
m "row ceiling 3650 -> 3651"    $F1 "OR dr > 3650" "OR dr > 3651"
m "detail floor 90 -> 89"       $F1 "IF dd < 90" "IF dd < 89"
m "detail <= rows dropped"      $F1 "OR dd > dr THEN" "THEN"
m "row JSON type check dropped" $F1 "IF vr IS NULL OR jsonb_typeof(vr) <> 'number' OR" "IF vr IS NULL OR"
m "detail JSON type check dropped" $F1 "IF vd IS NULL OR jsonb_typeof(vd) <> 'number' OR" "IF vd IS NULL OR"
m "row 4-digit bound dropped (22003)" $F1 "(vr #>> '{}') !~ '^[0-9]{1,4}\$'" "(vr #>> '{}') !~ '^[0-9]+\$'"
m "detail 4-digit bound dropped (22003)" $F1 "(vd #>> '{}') !~ '^[0-9]{1,4}\$'" "(vd #>> '{}') !~ '^[0-9]+\$'"
m "error_message left"          $F1 "SET error_message = NULL, guard_metrics = NULL" "SET guard_metrics = NULL"
m "guard_metrics left"          $F1 "SET error_message = NULL, guard_metrics = NULL" "SET error_message = NULL"
m "model also cleared"          $F1 "SET error_message = NULL, guard_metrics = NULL" "SET error_message = NULL, guard_metrics = NULL, model = NULL"
m "has-detail filter dropped"   $F1 "     AND (error_message IS NOT NULL OR guard_metrics IS NOT NULL);" ";"
m "scrub uses row cutoff"       $F1 "SELECT detail_cutoff INTO c" "SELECT row_cutoff INTO c"
m "purge uses detail cutoff"    $F1 "SELECT row_cutoff INTO c" "SELECT detail_cutoff INTO c"
m "seed detail 90 -> 120"       $F1 "('analysis_log_detail_retention_days', '90'::jsonb)" "('analysis_log_detail_retention_days', '120'::jsonb)"
m "seed rows 400 -> 500"        $F1 "('analysis_log_retention_days', '400'::jsonb)" "('analysis_log_retention_days', '500'::jsonb)"
m "scrub EXECUTE to service_role" $F1 "REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, authenticated, service_role;" "REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.scrub_expired_analysis_log_detail() TO service_role;"
m "purge EXECUTE to service_role" $F1 "REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, authenticated, service_role;" "REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, authenticated;"
m "purge EXECUTE to authenticated" $F1 "REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, authenticated, service_role;" "REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, service_role;"
m "helper EXECUTE to service_role" $F1 "REVOKE ALL ON FUNCTION public.analysis_log_retention_cutoffs() FROM PUBLIC, anon, authenticated, service_role;" "REVOKE ALL ON FUNCTION public.analysis_log_retention_cutoffs() FROM PUBLIC, anon, authenticated;"
m "helper REVOKE dropped (PUBLIC)" $F1 "REVOKE ALL ON FUNCTION public.analysis_log_retention_cutoffs() FROM PUBLIC, anon, authenticated, service_role;" ""
m "scrub not SECURITY DEFINER"  $F1 "RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS \$\$
DECLARE n integer; c timestamptz;
BEGIN
  SELECT detail_cutoff" "RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS \$\$
DECLARE n integer; c timestamptz;
BEGIN
  SELECT detail_cutoff"
m "purge search_path unset"     $F1 "SET search_path = ''
AS \$\$
DECLARE n integer; c timestamptz;
BEGIN
  SELECT row_cutoff" "AS \$\$
DECLARE n integer; c timestamptz;
BEGIN
  SELECT row_cutoff"
m "scrub owner not postgres"    $F1 "COMMENT ON FUNCTION public.analysis_log_retention_cutoffs() IS" "CREATE ROLE p1b_mut NOLOGIN; GRANT p1b_mut TO postgres; GRANT CREATE ON SCHEMA public TO p1b_mut; ALTER FUNCTION public.scrub_expired_analysis_log_detail() OWNER TO p1b_mut;
COMMENT ON FUNCTION public.analysis_log_retention_cutoffs() IS"
m "scrub cron schedule changed" $F2 "'30 20 * * *'" "'30 21 * * *'"
m "scrub cron command changed"  $F2 "'SELECT public.scrub_expired_analysis_log_detail()'" "'SELECT public.purge_expired_analysis_log()'"
m "purge cron schedule changed" $F4 "'40 20 * * *'" "'40 19 * * *'"
m "purge cron command changed"  $F4 "'SELECT public.purge_expired_analysis_log()'" "'SELECT public.scrub_expired_analysis_log_detail()'"
m "rollup: non-additive merge"  $F3 "SET rows = d.rows + EXCLUDED.rows" "SET rows = EXCLUDED.rows" rollup
m "rollup: tokens dropped"      $F3 "coalesce(sum(input_tokens), 0)" "0" rollup
m "rollup: extra grant"         $F3 "GRANT SELECT ON public.analysis_log_daily TO authenticated;" "GRANT SELECT, INSERT ON public.analysis_log_daily TO authenticated;" rollup
m "rollup: purge EXECUTE to service_role" $F3 "REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, authenticated, service_role;" "GRANT EXECUTE ON FUNCTION public.purge_expired_analysis_log() TO service_role;" rollup

if [ "$NO_CRON" != "--no-cron" ]; then
  # cron: mutants run the real-execution suite against a mutated copy.
  cm() { # cm <name> <file> <old> <new>
    local name="$1"; rm -rf "$TMP/c"; mkdir -p "$TMP/c"; cp "$HERE"/0*.sql "$HERE/cron_integration.sh" "$TMP/c/"
    python3 - "$HERE/$2" "$TMP/c/$2" "$3" "$4" <<'PY' || { echo "ANCHOR    $name"; survived=$((survived + 1)); return; }
import sys
src, dst, old, new = sys.argv[1:5]; s = open(src).read()
if old not in s: sys.exit(1)
open(dst, "w").write(s.replace(old, new, 1))
PY
    clean_p1
    bash "$TMP/c/cron_integration.sh" "$WORK" >/dev/null 2>&1
    judge "cron: $name" $?
  }
  clean_p1; bash "$HERE/cron_integration.sh" "$WORK" >/dev/null 2>&1 || { echo "BASELINE FAIL: cron_integration.sh fails unmutated" >&2; exit 2; }
  echo "BASELINE  cron integration passes unmutated"
  cm "range check fails open (WARNING)" $F1 "RAISE EXCEPTION 'analysis_log_retention_days % outside [366, 3650]', dr USING ERRCODE = '22023';" "RAISE WARNING 'analysis_log_retention_days % outside [366, 3650]', dr; RETURN;"
  cm "scrub job calls a missing function" $F2 "'SELECT public.scrub_expired_analysis_log_detail()'" "'SELECT public.scrub_expired_analysis_log_details()'"
  cm "scrub job inactive from the start" $F2 "SELECT cron.schedule('scrub-analysis-log-detail', '30 20 * * *', 'SELECT public.scrub_expired_analysis_log_detail()');" "SELECT cron.schedule('scrub-analysis-log-detail', '30 20 * * *', 'SELECT public.scrub_expired_analysis_log_detail()'); SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'scrub-analysis-log-detail'), active := false);"
  cm "scrub also deletes rows past detail cutoff" $F1 "  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
\$\$;

CREATE OR REPLACE FUNCTION public.purge_expired_analysis_log()" "  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.history WHERE timestamp < c;
  RETURN n;
END;
\$\$;

CREATE OR REPLACE FUNCTION public.purge_expired_analysis_log()"
fi

reset_p1
echo "mutants: $killed killed, $survived survived"
[ "$survived" -eq 0 ] || { printf 'survived: %s\n' "${names[@]}"; exit 1; }
