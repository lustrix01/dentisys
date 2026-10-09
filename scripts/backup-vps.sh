#!/usr/bin/env bash
set -euo pipefail
set -E

cd /opt/dentisys
umask 077
backup_dir=/opt/dentisys/backups
env_file=/opt/dentisys/.env
install -d -m 0700 "$backup_dir"
exec >> "$backup_dir/backup.log" 2>&1
chmod 600 "$backup_dir/backup.log"
exec 9>"$backup_dir/.backup.lock"
flock -n 9 || exit 0
echo "$(date -u +%FT%TZ) PostgreSQL backup started."
trap 'echo "$(date -u +%FT%TZ) ERROR: PostgreSQL backup failed." >&2' ERR
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
profile=()
[[ "$(env_value EMAIL_PROVIDER)" != custom ]] || profile=(--profile mailpit)
compose_env=(COMPOSE_PROFILES=)
case "$(env_value PGADMIN_ENABLED)" in
  ''|true) profile+=(--profile tools) ;;
  false) compose_env+=(PGADMIN_DEFAULT_EMAIL=disabled@example.invalid PGADMIN_DEFAULT_PASSWORD=unused) ;;
  *) echo 'ERROR: PGADMIN_ENABLED must be true or false.' >&2; exit 1 ;;
esac
compose() {
  env "${compose_env[@]}" docker --config /opt/dentisys/.docker compose --env-file /opt/dentisys/.env -p dentisys -f docker-compose.web.yml -f docker-compose.database.yml -f docker-compose.vps.yml "${profile[@]}" "$@"
}
backup_temp="$(mktemp "$backup_dir/.vps-nightly-XXXXXX.part")"
trap 'rm -f -- "$backup_temp"' EXIT
# BIO-003: database only. Never archive or copy the biometric volume.
compose exec -T db pg_dump -U "${admin_user:-postgres}" -d "${db_name:-dentisys}" -Fc > "$backup_temp"
test -s "$backup_temp"
chmod 600 "$backup_temp"
backup_suffix="${backup_temp##*-}"
backup_file="$backup_dir/vps-nightly-$(date -u +%Y%m%d-%H%M%S)-${backup_suffix%.part}.dump"
mv -- "$backup_temp" "$backup_file"
# Keep the newest 14 completed dumps, including pre-migration snapshots.
mapfile -t old_backups < <(find "$backup_dir" -maxdepth 1 -type f -name 'vps-*.dump' -printf '%T@ %p\n' | sort -nr | tail -n +15 | cut -d ' ' -f 2-)
for old_backup in "${old_backups[@]}"; do
  rm -f -- "$old_backup"
done
echo "$(date -u +%FT%TZ) Backup complete: $backup_file (newest 14 kept)."
