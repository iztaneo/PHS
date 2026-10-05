#!/bin/sh
# Recorrido PHS-040 en una base desechable. Nunca modifica la base POSTGRES_DB del usuario.
set -eu
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Falta .env; copia .env.example y completa los valores locales." >&2
  exit 2
fi
set -a
. ./.env
set +a

E2E_DB=phs_e2e
E2E_EVIDENCE_DIR="${TMPDIR:-/tmp}/phs-e2e-evidence"
OWNER_E2E_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@127.0.0.1:$POSTGRES_PORT/$E2E_DB?sslmode=disable"
export IDENTITY_DATABASE_URL="postgres://phs_identity_dev:$POSTGRES_PASSWORD@127.0.0.1:$POSTGRES_PORT/$E2E_DB"
export PROJECTS_DATABASE_URL="postgres://phs_projects_dev:$POSTGRES_PASSWORD@127.0.0.1:$POSTGRES_PORT/$E2E_DB"
export HEALTH_DATABASE_URL="postgres://phs_health_dev:$POSTGRES_PASSWORD@127.0.0.1:$POSTGRES_PORT/$E2E_DB"
export PLATFORM_DATABASE_URL="postgres://phs_platform_dev:$POSTGRES_PASSWORD@127.0.0.1:$POSTGRES_PORT/$E2E_DB"
export EVIDENCE_DIR="$E2E_EVIDENCE_DIR"
export HEALTH_SCHEDULER_SECONDS=2 PLATFORM_DISPATCH_SECONDS=2

export PGPASSWORD="$POSTGRES_PASSWORD"
dropdb --if-exists -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" "$E2E_DB"
createdb -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" "$E2E_DB"
DATABASE_URL="$OWNER_E2E_URL" ./node_modules/.bin/dbmate --migrations-dir db/migrations --no-dump-schema up
psql -X -v ON_ERROR_STOP=1 -q -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$E2E_DB" \
  -v dev_password="$POSTGRES_PASSWORD" -f db/local/dev_logins.sql

npx --yes pnpm@12.9.1 build
PHS_NEW_USER_EMAIL="$DEV_USER_EMAIL" PHS_NEW_USER_NAME="$DEV_USER_NAME" \
  PHS_NEW_USER_PASSWORD="$DEV_USER_PASSWORD" PHS_NEW_USER_ADMIN=true node apps/identity/dist/cli/create-user.js
node apps/identity/dist/cli/seed-demo.js
node apps/projects/dist/cli/seed-demo.js
node apps/platform/dist/cli/seed-demo.js
node apps/health/dist/cli/seed-demo.js

log_file="${TMPDIR:-/tmp}/phs-e2e-services.log"
npx --yes pnpm@12.9.1 -r --parallel start >"$log_file" 2>&1 &
services_pid=$!
cleanup() {
  kill -INT "$services_pid" 2>/dev/null || true
  wait "$services_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

attempt=0
until curl -fsS http://127.0.0.1:3000/api/v1/status >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Los servicios no iniciaron; consultar $log_file" >&2
    exit 1
  fi
  sleep 1
done

node tests/e2e/gateway-flow.mjs
