#!/usr/bin/env bash
# Start a disposable local Supabase stack (Postgres 17 + PostgREST + GoTrue +
# Storage) from this repo's migrations, in a scratch project OUTSIDE the repo,
# and write its local endpoint and keys to <workdir>/db.env.
# Same path in CI (.github/workflows/db-tests.yml) and locally:
#   scripts/ci/db-stack.sh "$(mktemp -d)"
#   scripts/ci/db-tests.sh "<that dir>"
#   (cd "<that dir>" && supabase stop --no-backup)
# Never reads or needs production credentials: the keys are the local stack's
# own well-known demo keys, and the URL is 127.0.0.1.
set -euo pipefail

WORK="${1:?usage: db-stack.sh <scratch dir>}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECT="${DB_STACK_PROJECT_ID:-cvfit_ci}"

mkdir -p "$WORK"
cd "$WORK"
[ -f supabase/config.toml ] || supabase init --force >/dev/null

# Only what the DB suites use: db, api (PostgREST), auth (GoTrue), storage.
awk -v project="$PROJECT" '
  /^project_id *=/ { print "project_id = \"" project "\""; next }
  /^\[/ { section = $0; gsub(/[\[\]]/, "", section) }
  /^enabled *=/ && section ~ /^(realtime|studio|inbucket|analytics|edge_runtime|db\.seed|db\.pooler|storage\.analytics|storage\.vector)$/ {
    print "enabled = false"; next
  }
  /^major_version *=/ && section == "db" { print "major_version = 17"; next }
  { print }
' supabase/config.toml > supabase/config.toml.new
mv supabase/config.toml.new supabase/config.toml

rm -rf supabase/migrations
cp -R "$REPO/supabase/migrations" supabase/migrations

supabase start

# Kong ↔ PostgREST keep-alive race (2026-11-23, PR #105 diagnostics): PostgREST
# (warp, 30 s timeout) closes idle connections in a periodic sweep — anywhere
# 30–60 s idle, many at once — while the CLI's Kong keeps idle upstream
# connections for 60 s. A request Kong sends on a connection the sweep is
# closing gets 502 ("upstream prematurely closed connection"); nginx retries
# idempotent GETs but never POSTs, so RPCs and inserts fail, and the server's
# quota/rate-limit/candidate helpers correctly fail closed (fast 503). Keeping
# Kong's idle timeout below warp's 30 s minimum removes the race. Test stack
# only; the app and its fail-closed behaviour are unchanged.
KONG="supabase_kong_$PROJECT"
docker exec "$KONG" sh -c 'KONG_UPSTREAM_KEEPALIVE_IDLE_TIMEOUT=10 kong reload' >/dev/null
for _ in 1 2 3 4 5 6 7 8 9 10; do
  docker exec "$KONG" grep -qx 'upstream_keepalive_idle_timeout = 10' /usr/local/kong/.kong_env && break
  sleep 1
done
docker exec "$KONG" grep -qx 'upstream_keepalive_idle_timeout = 10' /usr/local/kong/.kong_env \
  || { echo "Kong upstream keep-alive fix not applied; refusing to run DB tests on a racy stack" >&2; exit 1; }

supabase status -o env > status.env
# shellcheck disable=SC1091
. ./status.env
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "Refusing: stack API_URL is not local ($API_URL)" >&2; exit 2 ;;
esac
cat > db.env <<EOF
export SUPABASE_URL=$API_URL
export SUPABASE_ANON_KEY=$ANON_KEY
export SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
export M2Q_LOCAL_DB=1
export DB_CONTAINER=supabase_db_$PROJECT
EOF
echo "Local stack up: $API_URL (container supabase_db_$PROJECT)"
