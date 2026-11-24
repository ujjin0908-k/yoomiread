#!/usr/bin/env bash
# Tests the Supabase SQL on a throwaway local Postgres (needs Postgres 15 or later installed; nothing is kept).
# Usage: supabase/test/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bin="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
dir="$(mktemp -d)"
trap '"$bin/pg_ctl" -D "$dir/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$dir"' EXIT
run() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
chmod 777 "$dir"
run "'$bin/initdb' -D '$dir/data' -A trust -U postgres >/dev/null"
run "'$bin/pg_ctl' -D '$dir/data' -o '-k $dir -p 54329 -c listen_addresses=' -l '$dir/log' start >/dev/null"
psql=(psql -h "$dir" -p 54329 -U postgres -q -v ON_ERROR_STOP=1)
"${psql[@]}" -c 'create database yoomi' >/dev/null
for f in supabase_stub.sql ../sync.sql ../buddy.sql buddy_check.sql ../friends.sql friends_check.sql; do
  "${psql[@]}" -d yoomi -f "$here/$f" 2>&1 >/dev/null | sed -E 's/^psql:[^ ]+ (NOTICE|WARNING): +//' | { grep -v ', skipping$' || true; }
done
