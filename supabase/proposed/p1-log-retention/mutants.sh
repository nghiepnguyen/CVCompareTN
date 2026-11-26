#!/usr/bin/env bash
# P1-D1 mutation test — DISPOSABLE LOCAL STACK ONLY. Each mutant is a copy of
# the Phase A migration (staged as 01), 02 or 03 with one deliberate defect; it
# must make supabase/tests/analysis_log_retention.test.sql (or, for "cron:"
# mutants, cron_integration.sh) FAIL. Prints KILLED/SURVIVED per mutant; exit 1
# if any survives. Restores the unmutated migrations at the end.
# The daily jobs are migration 20261127000000 (staged as 02).
#   supabase/proposed/p1-log-retention/mutants.sh "<dir from scripts/ci/db-stack.sh>" [--no-cron]
set -uo pipefail
WORK="${1:?usage: mutants.sh <scratch dir> [--no-cron]}"; NO_CRON="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. "$WORK/db.env"
case "$SUPABASE_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "Refusing: not a local stack" >&2; exit 2 ;; esac
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
REPO_SB="$(cd "$HERE/../.." && pwd)"
TEST="$REPO_SB/tests/analysis_log_retention.test.sql"
SRC="$TMP/src"; mkdir -p "$SRC"
cp "$REPO_SB/migrations/20261126000000_analysis_log_retention_disabled.sql" "$SRC/01_purge_expired_analysis_log.sql"
cp "$REPO_SB/migrations/20261127000000_analysis_log_retention_pg_cron.sql" "$SRC/02_purge_expired_analysis_log_pg_cron.sql"
cp "$HERE/03_optional_daily_rollup.sql" "$HERE/cron_integration.sh" "$SRC/"
q() { docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 "$@" >/dev/null 2>&1; }
clean_p1() { # nothing of P1 left: as on production before any apply
  q -c "SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('scrub-analysis-log-detail','purge-analysis-log','purge-cron-run-details','purge-cron-history','zz-extra')" \
    -c "DROP TABLE IF EXISTS public.analysis_log_daily" \
    -c "DROP FUNCTION IF EXISTS public.scrub_expired_analysis_log_detail(), public.purge_expired_analysis_log(), public.preview_expired_analysis_log(), public.analysis_log_retention_cutoffs(), public.analysis_log_retention_cutoff()" \
    -c "DELETE FROM public.app_settings WHERE key IN ('analysis_log_retention_days','analysis_log_retention_enabled','analysis_log_detail_retention_days')" \
    -c "DROP SCHEMA IF EXISTS p1b_it CASCADE" \
    -c "DELETE FROM public.analysis_log WHERE id::text LIKE '00000000-0000-4000-8000-0000000c%'" \
    -c "DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000c1'" \
    -c "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'p1b_mut') THEN REVOKE CREATE ON SCHEMA public FROM p1b_mut; DROP ROLE p1b_mut; END IF; END \$\$"
}
reset_p1() { # unmutated state: both migrations (functions + jobs), no rollup table, settings at seed
  clean_p1
  q < "$SRC/01_purge_expired_analysis_log.sql"; q < "$SRC/02_purge_expired_analysis_log_pg_cron.sql"
}
# mutate <file> <python-literal old> <python-literal new> : writes $TMP/<file>
mutate() {
  python3 - "$SRC/$1" "$TMP/$1" "$2" "$3" <<'PY'
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
  rm -f "$TMP"/*.sql; cp "$SRC"/0*.sql "$TMP"/
  mutate "$file" "$old" "$new" || { echo "ANCHOR    $name"; survived=$((survived + 1)); names+=("$name (anchor)"); return; }
  clean_p1
  local applied=0
  # Existing data before apply (as in production): the migration must not touch it.
  q -c "INSERT INTO public.analysis_log(id, status, kind, created_at) VALUES ('00000000-0000-4000-8000-0000000c0d1e', 'success', 'analyze', now() - interval '500 days')"
  # Apply as production: 01 then 02; 03 only for rollup mutants.
  q < "$TMP/01_purge_expired_analysis_log.sql" || applied=1
  q < "$TMP/02_purge_expired_analysis_log_pg_cron.sql" || applied=1
  [ -n "$rollup" ] && { q < "$TMP/03_optional_daily_rollup.sql" || applied=1; }
  if [ $applied -ne 0 ]; then echo "APPLY-ERR $name"; survived=$((survived + 1)); names+=("$name (apply error)"); return; fi
  if [ "$(docker exec "$DB_CONTAINER" psql -U postgres -tAc "select count(*) from public.analysis_log where id = '00000000-0000-4000-8000-0000000c0d1e'")" != "1" ]; then
    judge "$name" 1; return   # the migration itself deleted pre-existing data
  fi
  q -c "DELETE FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-0000000c0d1e'"
  docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 < "$TEST" >/dev/null 2>&1
  judge "$name" $?
}
# Baseline: the unmutated files must PASS, or every "kill" below is meaningless.
reset_p1
docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 < "$TEST" >/dev/null 2>&1 \
  || { echo "BASELINE FAIL: analysis_log_retention.test.sql fails unmutated (stack not fresh?)" >&2; exit 2; }
echo "BASELINE  rollback test passes unmutated"
clean_p1; q < "$SRC/01_purge_expired_analysis_log.sql"; q < "$SRC/02_purge_expired_analysis_log_pg_cron.sql"; q < "$SRC/03_optional_daily_rollup.sql"
docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 < "$TEST" >/dev/null 2>&1 \
  || { echo "BASELINE FAIL: test fails unmutated with the optional rollup (03)" >&2; exit 2; }
echo "BASELINE  rollback test passes unmutated with 03"
F1=01_purge_expired_analysis_log.sql; F2=02_purge_expired_analysis_log_pg_cron.sql; F3=03_optional_daily_rollup.sql
m "purge < to <="               $F1 "WHERE l.created_at < c" "WHERE l.created_at <= c"
m "floor 90 -> 89"              $F1 "IF d < 90" "IF d < 89"
m "ceiling 3650 -> 3651"        $F1 "OR d > 3650" "OR d > 3651"
m "JSON type check dropped"     $F1 "IF v IS NULL OR jsonb_typeof(v) <> 'number' OR" "IF v IS NULL OR"
m "4-digit bound dropped (22003)" $F1 "(v #>> '{}') !~ '^[0-9]{1,4}\$'" "(v #>> '{}') !~ '^[0-9]+\$'"
m "seed 90 -> 120"              $F1 "('analysis_log_retention_days', '90'::jsonb)" "('analysis_log_retention_days', '120'::jsonb)"
m "batch 10000 -> 100000"       $F1 "                 LIMIT 10000);" "                 LIMIT 100000);"
m "batch newest first"          $F1 "                 ORDER BY l.created_at
                 LIMIT 10000);" "                 ORDER BY l.created_at DESC
                 LIMIT 10000);"
m "preview next_call unbounded" $F1 "next_call_rows := least(eligible_rows, 10000);" "next_call_rows := eligible_rows;"
m "preview ignores cutoff"      $F1 "FROM public.analysis_log AS l WHERE l.created_at < cutoff;" "FROM public.analysis_log AS l;"
m "preview deletes (not dry)"   $F1 "  next_call_rows := least(eligible_rows, 10000);
END;" "  next_call_rows := least(eligible_rows, 10000);
  DELETE FROM public.analysis_log WHERE created_at < cutoff;
END;"
m "preview VOLATILE"            $F1 "LANGUAGE plpgsql
STABLE
SECURITY DEFINER" "LANGUAGE plpgsql
SECURITY DEFINER"
m "purge EXECUTE to service_role" $F1 "REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, authenticated, service_role;" "REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, authenticated;"
m "purge EXECUTE to authenticated" $F1 "REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, authenticated, service_role;" "REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, service_role;"
m "preview EXECUTE to service_role" $F1 "REVOKE ALL ON FUNCTION public.preview_expired_analysis_log() FROM PUBLIC, anon, authenticated, service_role;" "REVOKE ALL ON FUNCTION public.preview_expired_analysis_log() FROM PUBLIC, anon, authenticated;"
m "helper EXECUTE to service_role" $F1 "REVOKE ALL ON FUNCTION public.analysis_log_retention_cutoff() FROM PUBLIC, anon, authenticated, service_role;" "REVOKE ALL ON FUNCTION public.analysis_log_retention_cutoff() FROM PUBLIC, anon, authenticated;"
m "helper REVOKE dropped (PUBLIC)" $F1 "REVOKE ALL ON FUNCTION public.analysis_log_retention_cutoff() FROM PUBLIC, anon, authenticated, service_role;" ""
m "purge not SECURITY DEFINER"  $F1 "RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER" "RETURNS integer
LANGUAGE plpgsql"
m "purge search_path unset"     $F1 "SET search_path = ''
AS \$\$
DECLARE n integer; c timestamptz;" "AS \$\$
DECLARE n integer; c timestamptz;"
m "helper becomes DEFINER"      $F1 "RETURNS timestamptz
LANGUAGE plpgsql
STABLE" "RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER"
m "purge owner not postgres"    $F1 "COMMENT ON FUNCTION public.analysis_log_retention_cutoff() IS" "CREATE ROLE p1b_mut NOLOGIN; GRANT p1b_mut TO postgres; GRANT CREATE ON SCHEMA public TO p1b_mut; ALTER FUNCTION public.purge_expired_analysis_log() OWNER TO p1b_mut;
COMMENT ON FUNCTION public.analysis_log_retention_cutoff() IS"
m "option B seed kept"          $F1 "  ('analysis_log_retention_days', '90'::jsonb)" "  ('analysis_log_retention_days', '90'::jsonb), ('analysis_log_detail_retention_days', '90'::jsonb)"
# Disabled-by-default gate (Phase A).
m "seed enabled true"           $F1 "('analysis_log_retention_enabled', 'false'::jsonb)" "('analysis_log_retention_enabled', 'true'::jsonb)"
m "gate removed"                $F1 "  IF (SELECT s.value FROM public.app_settings AS s WHERE s.key = 'analysis_log_retention_enabled') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'analysis_log retention is disabled' USING ERRCODE = '55000';
  END IF;
" ""
m "gate accepts string true"    $F1 "WHERE s.key = 'analysis_log_retention_enabled') IS DISTINCT FROM 'true'::jsonb THEN" "WHERE s.key = 'analysis_log_retention_enabled') #>> '{}' IS DISTINCT FROM 'true' THEN"
m "gate fails open on missing"  $F1 "WHERE s.key = 'analysis_log_retention_enabled') IS DISTINCT FROM 'true'::jsonb THEN" "WHERE s.key = 'analysis_log_retention_enabled') = 'false'::jsonb THEN"
m "period checked before gate"  $F1 "BEGIN
  IF (SELECT s.value FROM public.app_settings AS s WHERE s.key = 'analysis_log_retention_enabled')" "BEGIN
  c := public.analysis_log_retention_cutoff();
  IF (SELECT s.value FROM public.app_settings AS s WHERE s.key = 'analysis_log_retention_enabled')"
m "preview always enabled"      $F1 "  enabled := coalesce((SELECT s.value = 'true'::jsonb FROM public.app_settings AS s WHERE s.key = 'analysis_log_retention_enabled'), false);" "  enabled := true;"
m "cron schedule changed"       $F2 "'40 20 * * *'" "'40 19 * * *'"
m "cron command changed"        $F2 "'SELECT public.purge_expired_analysis_log()'" "'SELECT public.preview_expired_analysis_log()'"
m "run-history prune 90 -> 30"  $F2 "interval '90 days'" "interval '30 days'"
m "run-history prune drops open runs" $F2 "WHERE end_time < now() - interval '90 days'" "WHERE coalesce(end_time, start_time) < now() - interval '90 days'"
m "run-history prune job renamed" $F2 "SELECT cron.schedule('purge-cron-run-details'" "SELECT cron.schedule('purge-cron-history'"
m "extra job deletes analysis_log" $F2 "SELECT cron.schedule('purge-cron-run-details'" "SELECT cron.schedule('zz-extra', '0 0 * * *', 'DELETE FROM public.analysis_log WHERE false');
SELECT cron.schedule('purge-cron-run-details'"
m "migration deletes old rows"  $F1 "COMMENT ON FUNCTION public.analysis_log_retention_cutoff() IS" "DELETE FROM public.analysis_log WHERE created_at < now() - interval '400 days';
COMMENT ON FUNCTION public.analysis_log_retention_cutoff() IS"
m "rollup: non-additive merge"  $F3 "SET rows = d.rows + EXCLUDED.rows" "SET rows = EXCLUDED.rows" rollup
m "rollup: tokens dropped"      $F3 "coalesce(sum(input_tokens), 0)" "0" rollup
m "rollup: extra grant"         $F3 "GRANT SELECT ON public.analysis_log_daily TO authenticated;" "GRANT SELECT, INSERT ON public.analysis_log_daily TO authenticated;" rollup
m "rollup: purge EXECUTE to service_role" $F3 "REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, authenticated, service_role;" "GRANT EXECUTE ON FUNCTION public.purge_expired_analysis_log() TO service_role;" rollup
m "rollup: batch unbounded"     $F3 "                   LIMIT 10000)" "                   LIMIT 100000)" rollup

if [ "$NO_CRON" != "--no-cron" ]; then
  # cron: mutants run the real-execution suite against a mutated copy.
  cm() { # cm <name> <file> <old> <new>
    local name="$1"; rm -rf "$TMP/c"; mkdir -p "$TMP/c"; cp "$SRC"/0*.sql "$SRC/cron_integration.sh" "$TMP/c/"
    python3 - "$SRC/$2" "$TMP/c/$2" "$3" "$4" <<'PY' || { echo "ANCHOR    $name"; survived=$((survived + 1)); return; }
import sys
src, dst, old, new = sys.argv[1:5]; s = open(src).read()
if old not in s: sys.exit(1)
open(dst, "w").write(s.replace(old, new, 1))
PY
    clean_p1
    bash "$TMP/c/cron_integration.sh" "$WORK" >/dev/null 2>&1
    judge "cron: $name" $?
  }
  clean_p1; bash "$SRC/cron_integration.sh" "$WORK" >/dev/null 2>&1 || { echo "BASELINE FAIL: cron_integration.sh fails unmutated" >&2; exit 2; }
  echo "BASELINE  cron integration passes unmutated"
  cm "range check fails open (WARNING)" $F1 "RAISE EXCEPTION 'analysis_log_retention_days % outside [90, 3650]', d USING ERRCODE = '22023';" "RAISE WARNING 'analysis_log_retention_days % outside [90, 3650]', d; RETURN now() - interval '90 days';"
  cm "job calls a missing function" $F2 "'SELECT public.purge_expired_analysis_log()'" "'SELECT public.purge_expired_analysis_logs()'"
  cm "job inactive from the start"  $F2 "SELECT cron.schedule('purge-analysis-log', '40 20 * * *', 'SELECT public.purge_expired_analysis_log()');" "SELECT cron.schedule('purge-analysis-log', '40 20 * * *', 'SELECT public.purge_expired_analysis_log()'); SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'purge-analysis-log'), active := false);"
  cm "purge also deletes old history" $F1 "  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;" "  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.history WHERE timestamp < c;
  RETURN n;"
fi

reset_p1
echo "mutants: $killed killed, $survived survived"
[ "$survived" -eq 0 ] || { printf 'survived: %s\n' "${names[@]}"; exit 1; }
