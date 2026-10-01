#!/usr/bin/env bash
# Run the behaviour tests against a throwaway local Postgres.
# Needs postgresql-16 (or any 14+) installed locally. Nothing here touches your
# Supabase project.
#
#   ./supabase/tests/run-local.sh
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HERE/../.."
PGDATA="${PGDATA:-/tmp/plumb-pgtest}"
PORT="${PGPORT:-55432}"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb || echo /usr/lib/postgresql/16/bin/initdb)")}"

export PATH="$PGBIN:$PATH"

cleanup() {
  pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

rm -rf "$PGDATA"
initdb -D "$PGDATA" -A trust --no-sync >/dev/null
pg_ctl -D "$PGDATA" -l "$PGDATA/log" -o "-k /tmp -p $PORT -c listen_addresses=" -w start >/dev/null

psql -h /tmp -p "$PORT" -d postgres -v ON_ERROR_STOP=1 -q \
  -f "$HERE/local-harness.sql" \
  -f "$ROOT/supabase/migrations/0001_schema.sql" \
  -f "$ROOT/supabase/migrations/0002_logic.sql" \
  -f "$ROOT/supabase/migrations/0003_rls.sql" \
  -f "$ROOT/supabase/seed.sql" >/dev/null

echo "Migrations applied. Running tests…"
echo

psql -h /tmp -p "$PORT" -d postgres -v ON_ERROR_STOP=1 -q \
  -f "$HERE/behaviour.sql" 2>&1 |
  sed -e 's/^psql:.*NOTICE:  //' -e 's/^psql:.*ERROR:  /FAILED: /'
