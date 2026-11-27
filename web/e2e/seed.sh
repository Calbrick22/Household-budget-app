#!/bin/sh
# Reset the LOCAL test database to the seed data, then restart the app so it
# re-runs its start-up work (new columns, freezing confirmed months).
set -e
HERE=$(dirname "$0")
sh "$HERE/up.sh" >/dev/null
psql -q -h 127.0.0.1 -p 5433 -U postgres -d budget_dev -f "$HERE/seed.sql"
sh "$HERE/up.sh" web restart >/dev/null
# One signed-in request so the app runs its start-up work now.
curl -s -c /tmp/e2e-cookies -o /dev/null localhost:3000/login
echo seeded
