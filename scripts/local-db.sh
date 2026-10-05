#!/bin/sh
# Local PostgreSQL for development without Docker. Data lives in .local/pg (ignored by git).
# It is a separate instance on its own port; it never touches another PostgreSQL on this machine.
set -eu
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${POSTGRES_USER:=phs_owner}" "${POSTGRES_PASSWORD:=phs_local_dev}" "${POSTGRES_DB:=phs}" "${POSTGRES_PORT:=54329}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export PGPASSWORD="$POSTGRES_PASSWORD"
DATA=.local/pg
run_psql() { psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" "$@"; }

case "${1:-}" in
  start)
    mkdir -p .local
    if [ ! -d "$DATA" ]; then
      pwfile=$(mktemp)
      printf '%s\n' "$POSTGRES_PASSWORD" > "$pwfile"
      initdb -D "$DATA" -U "$POSTGRES_USER" --auth=scram-sha-256 --pwfile="$pwfile" >/dev/null
      rm -f "$pwfile"
    fi
    if ! pg_ctl -D "$DATA" status >/dev/null 2>&1; then
      pg_ctl -D "$DATA" -o "-p $POSTGRES_PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=" -l .local/pg.log -w start >/dev/null
    fi
    if [ "$(run_psql -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_DB'")" != "1" ]; then
      run_psql -q -d postgres -c "CREATE DATABASE \"$POSTGRES_DB\""
    fi
    echo "PostgreSQL local en 127.0.0.1:$POSTGRES_PORT, base $POSTGRES_DB"
    ;;
  stop)
    pg_ctl -D "$DATA" -m fast stop >/dev/null && echo "PostgreSQL local detenido"
    ;;
  logins)
    run_psql -q -d "$POSTGRES_DB" -v dev_password="$POSTGRES_PASSWORD" -f db/local/dev_logins.sql
    echo "Usuarios de desarrollo de los servicios listos"
    ;;
  test)
    for file in db/tests/*.sql; do run_psql -q -d "$POSTGRES_DB" -f "$file"; done
    ;;
  test-db)
    # Separate database for integration tests, with the same migrations.
    if [ "$(run_psql -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = 'phs_test'")" != "1" ]; then
      run_psql -q -d postgres -c 'CREATE DATABASE phs_test'
    fi
    DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@127.0.0.1:$POSTGRES_PORT/phs_test?sslmode=disable" \
      ./node_modules/.bin/dbmate --migrations-dir db/migrations --no-dump-schema up
    ;;
  dictionary)
    # Data dictionary generated from the real schema; pass --check to verify the file is up to date.
    shift
    run_psql -At -d "$POSTGRES_DB" -f scripts/data-dictionary.sql | node scripts/data-dictionary.mjs "$@"
    ;;
  seed)
    # Development user from .env; the password is passed through the environment, not the command line.
    : "${DEV_USER_EMAIL:?Falta DEV_USER_EMAIL en .env}" "${DEV_USER_NAME:?Falta DEV_USER_NAME en .env}" "${DEV_USER_PASSWORD:?Falta DEV_USER_PASSWORD en .env}"
    (cd apps/identity && PHS_NEW_USER_EMAIL="$DEV_USER_EMAIL" PHS_NEW_USER_NAME="$DEV_USER_NAME" \
      PHS_NEW_USER_PASSWORD="$DEV_USER_PASSWORD" PHS_NEW_USER_ADMIN=true node dist/cli/create-user.js)
    ;;
  seed-demo)
    # Demo users, practices and projects for trying the whole flow. Safe to repeat. Needs a build.
    : "${DEMO_USER_PASSWORD:?Falta DEMO_USER_PASSWORD en .env}" "${DEV_USER_EMAIL:?Falta DEV_USER_EMAIL en .env}"
    (cd apps/identity && node dist/cli/seed-demo.js)
    (cd apps/projects && node dist/cli/seed-demo.js)
    (cd apps/platform && node dist/cli/seed-demo.js)
    (cd apps/health && node dist/cli/seed-demo.js)
    ;;
  reset)
    pg_ctl -D "$DATA" -m fast stop >/dev/null 2>&1 || true
    rm -rf "$DATA" .local/pg.log
    echo "Datos locales eliminados"
    ;;
  *)
    echo "Uso: $0 start|stop|logins|test|test-db|dictionary|seed|seed-demo|reset" >&2
    exit 2
    ;;
esac
