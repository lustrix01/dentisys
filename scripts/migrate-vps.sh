#!/usr/bin/env bash
set -euo pipefail

deploy_dir=/opt/dentisys
env_file="$deploy_dir/.env"
fail() { echo "ERROR: $*" >&2; exit 1; }
check=false
case "${1:-}" in
  --check) check=true ;;
  '') ;;
  *) fail 'Usage: migrate-vps.sh [--check]' ;;
esac
[[ "$#" -le 1 ]] || fail 'Usage: migrate-vps.sh [--check]'
[[ -f "$env_file" ]] || fail "Missing $env_file; run the deploy script first."
umask 077
# Deploy/sync pass their locked descriptor; standalone calls acquire it here.
if [[ "$(readlink /proc/$$/fd/9 2>/dev/null || true)" != "$deploy_dir/.deploy.lock" ]]; then
  exec 9>"$deploy_dir/.deploy.lock"
fi
flock -n 9 || fail 'Another VPS deployment or database sync is running.'

# Read literal one-line values; Compose handles interpolation and escaping.
env_value() {
  local key="$1" line value=''
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]] || continue
    [[ "${BASH_REMATCH[1]}" == "$key" ]] || continue
    value="${BASH_REMATCH[2]}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    case "$value" in
      \"*\"|\'*\') value="${value:1:${#value}-2}" ;;
    esac
  done < "$env_file"
  printf '%s' "$value"
}
db_name="$(env_value DB_NAME)"
admin_user="$(env_value DB_ADMIN_USER)"
for value in "$db_name" "$admin_user"; do
  [[ -n "${value//[[:space:]]/}" && "$value" != *replace_with_* ]] || fail "Set DB_NAME and DB_ADMIN_USER in $env_file."
done
profile=()
[[ "$(env_value EMAIL_PROVIDER)" != custom ]] || profile=(--profile mailpit)
compose_env=(COMPOSE_PROFILES=)
case "$(env_value PGADMIN_ENABLED)" in
  ''|true) profile+=(--profile tools) ;;
  false) compose_env+=(PGADMIN_DEFAULT_EMAIL=disabled@example.invalid PGADMIN_DEFAULT_PASSWORD=unused) ;;
  *) fail 'PGADMIN_ENABLED must be true or false.' ;;
esac
compose() {
  sudo env "${compose_env[@]}" docker --config "$deploy_dir/.docker" compose --env-file "$env_file" -p dentisys -f docker-compose.web.yml -f docker-compose.database.yml -f docker-compose.vps.yml "${profile[@]}" "$@"
}
cd "$deploy_dir"
# Initialization uses a socket-only server; TCP answers after all migrations.
tries=0
until compose exec -T db pg_isready -h 127.0.0.1 -U "$admin_user" -d "$db_name" >/dev/null 2>&1; do
  tries=$((tries + 1))
  [[ "$tries" -lt 90 ]] || fail 'PostgreSQL did not finish starting.'
  sleep 2
done
applied="$(compose exec -T db psql -U "$admin_user" -d "$db_name" -qtAX -v ON_ERROR_STOP=1 -c 'SELECT version FROM _schema_migrations')"
pending=()
for migration in database/migrations/[0-9][0-9][0-9]_*.sql; do
  [[ -f "$migration" ]] || continue
  version="$(basename "$migration")"
  if ! grep -Fxq "$version" <<< "$applied"; then pending+=("$version"); fi
done
if [[ "${#pending[@]}" -eq 0 ]]; then
  echo 'Nothing to apply'
  exit 0
fi
printf 'Pending migrations:\n'
printf '  %s\n' "${pending[@]}"
if "$check"; then exit 0; fi

install -d -m 0700 "$deploy_dir/backups"
backup_file="$(mktemp "$deploy_dir/backups/vps-before-migrate-$(date -u +%Y%m%d-%H%M%S)-XXXXXX.dump")"
# The file is private before any contents are written; never migrate on failure.
chmod 600 "$backup_file"
if ! compose exec -T db pg_dump -U "$admin_user" -d "$db_name" -Fc > "$backup_file"; then
  rm -f -- "$backup_file"
  fail "Backup failed: $backup_file (incomplete file removed). Nothing was migrated."
fi
if [[ ! -s "$backup_file" ]]; then
  rm -f -- "$backup_file"
  fail "Backup is empty: $backup_file (removed). Nothing was migrated."
fi
echo "Backup before ${#pending[@]} pending migration(s): $backup_file"
compose exec -T db sh /docker-entrypoint-initdb.d/001-migrations.sh || fail "Migrations failed. Backup: $backup_file; see the restore runbook."
echo 'Migrations applied.'
