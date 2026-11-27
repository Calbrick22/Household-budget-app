#!/bin/sh
# The local test stack: a throwaway Postgres on 127.0.0.1:5433 (database
# budget_dev) and the built app on :3000 pointed at it. It never touches the
# production database: DATABASE_URL here is always the local one.
#   sh e2e/up.sh          start Postgres (creating the cluster the first time)
#   sh e2e/up.sh web      ...and start the app (after `npm run build`)
#   sh e2e/up.sh web restart
set -e
P=$(ls -d /usr/lib/postgresql/*/bin | tail -1); D=/var/lib/postgresql/devpg
if [ ! -d "$D" ]; then
  su postgres -c "$P/initdb -D $D -A trust -U postgres" >/dev/null
fi
psql -h 127.0.0.1 -p 5433 -U postgres -tAc "select 1" >/dev/null 2>&1 || {
  su postgres -c "$P/pg_ctl -D $D -o \"-p 5433 -k /tmp -h 127.0.0.1\" -l $D.log start" >/dev/null; sleep 2; }
psql -h 127.0.0.1 -p 5433 -U postgres -tAc "select 1 from pg_database where datname='budget_dev'" | grep -q 1 \
  || psql -h 127.0.0.1 -p 5433 -U postgres -qc "create database budget_dev"
echo "postgres up"
if [ "$1" = "web" ]; then
  WEB=$(cd "$(dirname "$0")/.." && pwd)
  if [ "$2" = "restart" ]; then pkill -f "next start" 2>/dev/null || true; pkill -f next-server 2>/dev/null || true; sleep 1; fi
  curl -s -o /dev/null localhost:3000/login || {
    (cd "$WEB" && DATABASE_URL="postgresql://postgres@127.0.0.1:5433/budget_dev" APP_PASSWORD=dev \
      SESSION_SECRET=local-test-secret-local-test-secret-0123 setsid nohup npx next start -p 3000 > /tmp/next-e2e.log 2>&1 &)
    sleep 5; }
  curl -s -o /dev/null -w "web %{http_code}\n" localhost:3000/login
fi
