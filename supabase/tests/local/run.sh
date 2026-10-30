#!/bin/sh
# Usage: run.sh <repo> <extra sql files mounted under /x/...>; runs stubs + all migrations (pg_cron skipped) + extra files
set -e
REPO="$1"; shift
SP="$(cd "$(dirname "$0")" && pwd)"
docker run -i --rm --network none -m 512m --cpus 0.5 --pids-limit 128 \
  --user 999:999 --tmpfs /tmp:rw,size=256m,mode=1777 -e PGDATA=/tmp/pg \
  -v "$REPO/supabase:/repo:ro" -v "$SP:/sp:ro" \
  -v "${HARNESS:-$SP}:/harness:ro" \
  postgres:16 sh -c 'initdb -D /tmp/pg -U postgres >/dev/null 2>&1;
    pg_ctl -D /tmp/pg -o "-c listen_addresses= -c unix_socket_directories=/tmp/pg -c fsync=off" -l /tmp/pg/pg.log start >/dev/null 2>&1;
    sleep 1; export PGOPTIONS="-c client_min_messages=warning"; P="psql -h /tmp/pg -U postgres -X -q -v ON_ERROR_STOP=1";
    $P -f /sp/stubs.sql || exit 1
    for f in /repo/migrations/*.sql; do case "$f" in *pg_cron*) continue;; esac; psql -h /tmp/pg -U postgres -X -q -f "$f" >/dev/null 2>/tmp/err; grep -E "ERROR" /tmp/err | sed "s|^|MIGRATION-ERR |"; done
    echo "migrations loaded"
    for t in '"$*"'; do echo "== $t"; $P -f "$t" && echo "PASS $t" || echo "FAIL $t"; done'
