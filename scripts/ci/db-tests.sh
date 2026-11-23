#!/usr/bin/env bash
# Run every database suite against the stack started by scripts/ci/db-stack.sh,
# plus the suites written for the vanilla-Postgres stub harness
# (supabase/tests/local/run.sh). Fails closed: a failing suite, a suite that
# cannot start, a migration error in the stub harness, a missing listed file,
# or any skipped DB test makes the exit code non-zero. Per-suite output goes to
# <workdir>/logs/ and the tail is printed for failures.
set -uo pipefail

WORK="${1:?usage: db-tests.sh <scratch dir from db-stack.sh>}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck disable=SC1091
. "$WORK/db.env"
case "$SUPABASE_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "Refusing: SUPABASE_URL is not a local stack" >&2; exit 2 ;;
esac
export REQUIRE_DB_TESTS=1
# The concurrency scripts commit users, and the admin aggregate suites assume
# empty tables: always start from a freshly migrated stack.
used=$(docker exec "$DB_CONTAINER" psql -U postgres -tAc "select (select count(*) from auth.users) + (select count(*) from public.analysis_log)")
[ "$used" = "0" ] || { echo "Stack is not fresh ($used rows). Reset it: (cd \"$WORK\" && supabase db reset)" >&2; exit 1; }
# The Kong keep-alive fix from db-stack.sh must still be in place (a Kong
# restart, e.g. after some CLI commands, would silently bring the race back).
KONG="${DB_CONTAINER/supabase_db_/supabase_kong_}"
docker exec "$KONG" grep -qx 'upstream_keepalive_idle_timeout = 10' /usr/local/kong/.kong_env \
  || { echo "Kong upstream keep-alive fix missing on $KONG; rerun scripts/ci/db-stack.sh" >&2; exit 1; }
LOGS="$WORK/logs"
mkdir -p "$LOGS"
cd "$REPO"

# Suites that need the stub harness (superuser features the real stack's
# postgres role does not have). Every other *.test.sql runs on the real stack,
# so a new suite lands there by default.
STUB_ONLY=(
  application_follow_up             # pg_read_file (status-transition JSON)
  application_tracker               # pg_read_file (status-transition JSON)
  application_follow_up_concurrency # dblink sessions without a password
  application_tracker_concurrency   # dblink sessions without a password
  applications_concurrency          # dblink sessions without a password
  deleted_accounts                  # SET ROLE supabase_auth_admin
  cv_files_text_plain               # reads /repo/migrations (harness mount path)
)
# Extra stub-harness runs: name|FIXTURE_BEFORE|file
STUB_FIXTURE_RUNS=(
  "applications_backfill|20261104000000:/repo/tests/fixtures/pre_p2b_applications.sql|applications_backfill.fixture-test.sql"
)

failed=()
ran=0
record() { # record <name> <status 0|1> <log>
  ran=$((ran + 1))
  if [ "$2" -eq 0 ]; then echo "PASS  $1"; else
    echo "FAIL  $1"; failed+=("$1")
    echo "----- $1 (last 40 lines of $3) -----"; tail -n 40 "$3"; echo "-----"
  fi
}
run() { # run <name> <command...>
  local name="$1"; shift
  local log="$LOGS/${name//[^A-Za-z0-9_.-]/_}.log"
  "$@" >"$log" 2>&1; record "$name" $? "$log"
}
psql_file() { docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 < "$1"; }
# run.sh always exits 0; judge it by its output.
stub_run() { # stub_run <name> <fixture-before or ""> <files...>
  local name="$1" fixture="$2"; shift 2
  local log="$LOGS/stub_${name}.log" args=() f
  for f in "$@"; do args+=("/repo/tests/$f"); done
  FIXTURE_BEFORE="$fixture" sh supabase/tests/local/run.sh "$REPO" "${args[@]}" >"$log" 2>&1
  local rc=$? pass
  pass=$(grep -c '^PASS ' "$log")
  if [ $rc -ne 0 ] || grep -qE '^FAIL |^MIGRATION-ERR' "$log" || ! grep -q '^migrations loaded' "$log" || [ "$pass" -ne $# ]; then
    record "stub:$name" 1 "$log"
  else
    record "stub:$name" 0 "$log"
  fi
}

# 1. SQL suites on the real stack.
all=(supabase/tests/*.test.sql)
real=() stub=()
for f in "${all[@]}"; do
  n=$(basename "$f" .test.sql)
  if printf '%s\n' "${STUB_ONLY[@]}" | grep -qx "$n"; then stub+=("$n.test.sql"); else real+=("$f"); fi
done
for n in "${STUB_ONLY[@]}"; do
  [ -f "supabase/tests/$n.test.sql" ] || { echo "STUB_ONLY lists a missing suite: $n" >&2; exit 1; }
done
[ $(( ${#real[@]} + ${#stub[@]} )) -eq "${#all[@]}" ] && [ "${#real[@]}" -ge 20 ] \
  || { echo "Suite split mismatch: real=${#real[@]} stub=${#stub[@]} all=${#all[@]}" >&2; exit 1; }
echo "SQL suites: ${#real[@]} on the real stack, ${#stub[@]} on the stub harness"
for f in "${real[@]}"; do run "sql:$(basename "$f" .test.sql)" psql_file "$f"; done

# 2. SQL suites on the stub harness (vanilla postgres:16 + platform stubs, no network).
stub_run "suites" "" "${stub[@]}"
for spec in "${STUB_FIXTURE_RUNS[@]}"; do
  IFS='|' read -r name fixture file <<<"$spec"
  [ -f "supabase/tests/$file" ] || { echo "Missing fixture suite: $file" >&2; exit 1; }
  stub_run "$name" "$fixture" "$file"
done

# 3. Concurrency scripts (PostgREST + GoTrue, many parallel clients).
run "script:test:db:quota" npm run -s test:db:quota
run "script:test:db:claim" npm run -s test:db:claim
run "script:test:db:m2q" npm run -s test:db:m2q

# 4. API-level DB tests (real handleAnalyze, Gemini mocked). Any skipped test
#    fails the run, so a new DB file without the REQUIRE_DB_TESTS guard is caught.
vitest_db() {
  npx vitest run src/__tests__/db --reporter=default --reporter=json --outputFile="$WORK/vitest-db.json" || return 1
  node -e '
    const r = require(process.argv[1]);
    const skipped = r.numPendingTests + r.numTodoTests;
    console.log(`vitest db: passed=${r.numPassedTests} failed=${r.numFailedTests} skipped=${skipped}`);
    process.exit(r.success && skipped === 0 && r.numPassedTests >= 29 ? 0 : 1);
  ' "$WORK/vitest-db.json"
}
run "vitest:src/__tests__/db" vitest_db

# 5. M3-B R0: simulated production drift (history.match_score INTEGER; the
#    production type is unverified). Runs LAST because it alters this
#    disposable stack's schema. Any skipped test fails the step.
vitest_drift() {
  docker exec "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 \
    -c 'ALTER TABLE public.history ALTER COLUMN match_score TYPE integer USING round(match_score)::integer' || return 1
  M3B_R0_DRIFT=1 npx vitest run src/__tests__/schemaDrift --reporter=default --reporter=json --outputFile="$WORK/vitest-drift.json" || return 1
  node -e '
    const r = require(process.argv[1]);
    const skipped = r.numPendingTests + r.numTodoTests;
    console.log(`vitest schemaDrift: passed=${r.numPassedTests} failed=${r.numFailedTests} skipped=${skipped}`);
    process.exit(r.success && skipped === 0 && r.numPassedTests >= 4 ? 0 : 1);
  ' "$WORK/vitest-drift.json"
}
run "vitest:src/__tests__/schemaDrift" vitest_drift

echo
echo "$ran suites, ${#failed[@]} failed. Logs: $LOGS"
echo "deadlocks=$(docker exec "$DB_CONTAINER" psql -U postgres -tAc 'select coalesce(sum(deadlocks),0) from pg_stat_database')"
[ "${#failed[@]}" -eq 0 ] || { printf 'FAILED: %s\n' "${failed[@]}"; exit 1; }
