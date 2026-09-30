#!/usr/bin/env sh
set -eu

env_file="${1:-.env.single-server}"
# "." searches PATH for a bare file name, so make it a path.
case "$env_file" in */*) ;; *) env_file="./$env_file" ;; esac
if [ ! -f "$env_file" ]; then
  echo "Single-server environment file not found: $env_file. Copy .env.single-server.example first." >&2
  exit 1
fi

set -a
. "$env_file"
set +a

for key in APP_BASE_URL DB_PASS DB_ADMIN_PASS JWT_SIGNING_KEY_B64 MFA_ENCRYPTION_KEY_B64 AUDIT_MAC_KEY_B64 SMTP_HOST SMTP_FROM; do
  eval "value=\${$key:-}"
  case "$value" in ''|replace_with_*) echo "Set $key before starting." >&2; exit 1;; esac
done

if ! printf '%s' "$APP_BASE_URL" | grep -Eq '^https?://[^/?#[:space:]]+(/[^?#[:space:]]*)?$'; then
  echo 'APP_BASE_URL must be a valid absolute HTTP(S) URL.' >&2
  exit 1
fi

# EML-001: CUSTOM e-mail mode also runs Mailpit.
profile=""
if [ "${EMAIL_PROVIDER:-smtp}" = "custom" ]; then
  profile="--profile mailpit"
fi

compose() {
  docker compose --env-file "$env_file" -p dentisys-single-server -f docker-compose.web.yml -f docker-compose.database.yml $profile "$@"
}

compose config --quiet

# Migrations: a new database applies them on creation; an existing one is
# backed up first when migrations are pending, then brought up to date.
compose up -d --wait db
db_name="${DB_NAME:-dentisys}"
admin_user="${DB_ADMIN_USER:-postgres}"
# First-time creation runs on a socket-only server; TCP answers once it is done.
tries=0
until compose exec -T db pg_isready -h 127.0.0.1 -U "$admin_user" -d "$db_name" >/dev/null 2>&1; do
  tries=$((tries + 1))
  if [ "$tries" -ge 90 ]; then echo 'PostgreSQL did not finish starting.' >&2; exit 1; fi
  sleep 2
done
applied="$(compose exec -T db psql -U "$admin_user" -d "$db_name" -qtAX -c 'SELECT version FROM _schema_migrations')"
pending=0
for migration in database/migrations/[0-9][0-9][0-9]_*.sql; do
  if ! printf '%s\n' "$applied" | grep -qx "$(basename "$migration")"; then
    pending=$((pending + 1))
  fi
done
if [ "$pending" -gt 0 ]; then
  mkdir -p backups
  backup_name="single-server-before-migrate-$(date +%Y%m%d-%H%M%S).dump"
  compose exec -T db pg_dump -U "$admin_user" -d "$db_name" -Fc -f "/tmp/$backup_name"
  compose cp "db:/tmp/$backup_name" "backups/$backup_name"
  compose exec -T db rm -f "/tmp/$backup_name"
  echo "Backup before $pending pending migration(s): backups/$backup_name"
  compose exec -T db sh /docker-entrypoint-initdb.d/001-migrations.sh || {
    echo "Migrations failed. Restore from backups/$backup_name if needed." >&2
    exit 1
  }
fi

compose up -d --build --wait

# Same maintenance as start-dev. A failure is reported but does not stop the stack.
compose exec -T web php /var/www/html/backend/bin/bootstrap-grade-weights.php || echo 'WARNING: Grade-weight setup did not finish.' >&2
compose exec -T web php /var/www/html/backend/bin/bootstrap-first-dean.php || echo 'WARNING: First Dean invitation did not finish (check FIRST_DEAN_*).' >&2
compose exec -T web php /var/www/html/backend/bin/expire-biometrics.php || echo 'WARNING: Biometric expiry sweep did not finish.' >&2
echo 'Single-server stack started. PostgreSQL remains internal; access the application on APP_HTTP_PORT.'
