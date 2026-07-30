#!/bin/sh
set -eu

db_name="${POSTGRES_DB:-dentisys}"
admin_user="${POSTGRES_USER:-postgres}"
app_user="${DB_USER:-dentisys}"
app_pass="${DB_PASS:-local-development-password}"

export PGPASSWORD="${POSTGRES_PASSWORD}"
psql -v ON_ERROR_STOP=1 -U "$admin_user" -d "$db_name" \
  -v app_user="$app_user" -v app_pass="$app_pass" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_pass')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec
ALTER ROLE :"app_user" LOGIN PASSWORD :'app_pass';
SQL

psql -v ON_ERROR_STOP=1 -U "$admin_user" -d "$db_name" -f /postgres/init.sql

for migration in /postgres/migrations/[0-9][0-9][0-9]_*.sql; do
    version="$(basename "$migration")"
    applied="$(psql -qtAX -U "$admin_user" -d "$db_name" -c "SELECT COUNT(*) FROM _schema_migrations WHERE version = '$version';")"
    if [ "$applied" = "0" ]; then
        psql -v ON_ERROR_STOP=1 --single-transaction -U "$admin_user" -d "$db_name" \
          -f "$migration" -c "INSERT INTO _schema_migrations (version) VALUES ('$version');"
    fi
done

psql -v ON_ERROR_STOP=1 -U "$admin_user" -d "$db_name" -v app_user="$app_user" <<'SQL'
GRANT USAGE ON SCHEMA public TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"app_user";
SQL
