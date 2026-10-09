#!/usr/bin/env bash
set -euo pipefail

source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
deploy_dir=/opt/dentisys
env_file="$deploy_dir/.env"
fail() { echo "ERROR: $*" >&2; exit 1; }

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

[[ "$(id -u)" -ne 0 ]] || fail 'Run as a non-root user with sudo rights.'
sudo -n true 2>/dev/null || sudo -v
umask 077
sudo install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" "$deploy_dir"
exec 9>"$deploy_dir/.deploy.lock"
flock -n 9 || fail 'Another VPS deployment or database sync is running.'
for dir in scripts assets .docker; do
  install -d -m 0750 "$deploy_dir/$dir"
done
for dir in database database/migrations; do
  install -d -m 0755 "$deploy_dir/$dir"
done
install -d -m 0700 "$deploy_dir/backups"
db_start_args=()
[[ ! -f "$deploy_dir/.db-recreate-required" ]] || db_start_args=(--force-recreate)
for file in database/init.sql database/apply-migrations.sh; do
  if ! cmp -s "$source_dir/$file" "$deploy_dir/$file"; then
    db_start_args=(--force-recreate)
  fi
done
for file in docker-compose.web.yml docker-compose.database.yml docker-compose.vps.yml; do
  install -m 0640 "$source_dir/$file" "$deploy_dir/$file"
done
for file in database/init.sql database/apply-migrations.sh; do
  install -m 0644 "$source_dir/$file" "$deploy_dir/$file"
done
for migration in "$source_dir"/database/migrations/[0-9][0-9][0-9]_*.sql; do
  install -m 0644 "$migration" "$deploy_dir/database/migrations/$(basename "$migration")"
done
install -m 0750 "$source_dir/scripts/backup-vps.sh" "$deploy_dir/scripts/backup-vps.sh"
install -m 0750 "$source_dir/scripts/migrate-vps.sh" "$deploy_dir/scripts/migrate-vps.sh"
if [[ ! -f "$env_file" ]]; then
  install -m 0600 "$source_dir/.env.vps.example" "$env_file"
  fail "Created $env_file. Fill in real values, upload the model, then rerun this script."
fi
chmod 600 "$env_file"

for key in APP_DOMAIN TRAEFIK_ACME_EMAIL WEB_IMAGE FRONTEND_IMAGE BIOMETRIC_IMAGE GHCR_USERNAME DB_NAME DB_USER DB_PASS DB_ADMIN_USER DB_ADMIN_PASS JWT_SIGNING_KEY_B64 MFA_ENCRYPTION_KEY_B64 AUDIT_MAC_KEY_B64 SMTP_HOST SMTP_FROM SMTP_USER SMTP_PASS ALLOWED_EMAIL_DOMAINS BIOMETRIC_SIDECAR_SHARED_SECRET BIOMETRIC_STORAGE_KEY_B64 MEDIAPIPE_FACE_LANDMARKER_MODEL_HOST_PATH MEDIAPIPE_FACE_LANDMARKER_SHA256 BIOMETRIC_HAAR_SCALE_FACTOR BIOMETRIC_HAAR_MIN_NEIGHBORS BIOMETRIC_HAAR_MIN_FACE_PX BIOMETRIC_QUALITY_LAPLACIAN_VARIANCE BIOMETRIC_LBPH_RADIUS BIOMETRIC_LBPH_NEIGHBORS BIOMETRIC_LBPH_GRID_X BIOMETRIC_LBPH_GRID_Y BIOMETRIC_LBPH_THRESHOLD BIOMETRIC_MATCH_COUNT BIOMETRIC_BLINK_THRESHOLD BIOMETRIC_HEAD_TURN_RATIO; do
  value="$(env_value "$key")"
  [[ -n "${value//[[:space:]]/}" && "$value" != *replace_with_* ]] || fail "Set $key in $env_file before deploying."
  printf -v "$key" '%s' "$value"
done
[[ "$APP_DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ && "$APP_DOMAIN" == *.* ]] || fail 'APP_DOMAIN must be a hostname, without scheme, port or path.'
for image in "$WEB_IMAGE" "$FRONTEND_IMAGE" "$BIOMETRIC_IMAGE"; do
  [[ "$image" == ghcr.io/* ]] || fail 'Application images must come from GHCR.'
done
[[ "$MEDIAPIPE_FACE_LANDMARKER_MODEL_HOST_PATH" == /* && -f "$MEDIAPIPE_FACE_LANDMARKER_MODEL_HOST_PATH" ]] || fail 'Upload the Face Landmarker model to the configured absolute path first.'
[[ "$MEDIAPIPE_FACE_LANDMARKER_SHA256" =~ ^[a-fA-F0-9]{64}$ ]] || fail 'Set a 64-character model SHA-256.'
model_hash="$(sha256sum "$MEDIAPIPE_FACE_LANDMARKER_MODEL_HOST_PATH")"
[[ "${model_hash%% *}" == "${MEDIAPIPE_FACE_LANDMARKER_SHA256,,}" ]] || fail 'Face Landmarker model checksum does not match.'
profile=()
EMAIL_PROVIDER="$(env_value EMAIL_PROVIDER)"
case "${EMAIL_PROVIDER:-smtp}" in
  smtp) ;;
  custom) profile=(--profile mailpit) ;;
  *) fail 'EMAIL_PROVIDER must be smtp or custom.' ;;
esac
compose_env=(COMPOSE_PROFILES=)
PGADMIN_ENABLED="$(env_value PGADMIN_ENABLED)"
case "${PGADMIN_ENABLED:-true}" in
  true)
    profile+=(--profile tools)
    for key in PGADMIN_DEFAULT_EMAIL PGADMIN_DEFAULT_PASSWORD; do
      value="$(env_value "$key")"
      [[ -n "${value//[[:space:]]/}" && "$value" != *replace_with_* ]] || fail "Set $key in $env_file before deploying."
    done
    install -m 0644 "$source_dir/database/pgadmin-servers.json" "$deploy_dir/database/pgadmin-servers.json"
    if [[ "$DB_NAME" != dentisys || "$DB_USER" != dentisys ]]; then
      # Escape configured names for the VPS copy; the local definition is untouched.
      json_value() {
        local value="$1"
        value="${value//\\/\\\\}"
        value="${value//\"/\\\"}"
        value="${value//$'\t'/\\t}"
        value="${value//$'\r'/\\r}"
        value="${value//$'\n'/\\n}"
        value="${value//$'\b'/\\b}"
        value="${value//$'\f'/\\f}"
        printf '%s' "$value"
      }
      printf '{"Servers":{"1":{"Name":"DentiSys PostgreSQL (VPS)","Group":"Servers","Host":"db","Port":5432,"MaintenanceDB":"%s","Username":"%s","SSLMode":"prefer"}}}\n' \
        "$(json_value "$DB_NAME")" "$(json_value "$DB_USER")" > "$deploy_dir/database/pgadmin-servers.json"
    fi
    ;;
  false)
    # Compose interpolates inactive services too; these values never start pgAdmin.
    compose_env+=(PGADMIN_DEFAULT_EMAIL=disabled@example.invalid PGADMIN_DEFAULT_PASSWORD=unused)
    ;;
  *) fail 'PGADMIN_ENABLED must be true or false.' ;;
esac

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  . /etc/os-release
  [[ "${ID:-}" == ubuntu ]] || fail 'Automatic Docker installation supports Ubuntu LTS only.'
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl
  sudo install -d -m 0755 /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' \
    "${UBUNTU_CODENAME:-$VERSION_CODENAME}" "$(dpkg --print-architecture)" |
    sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
sudo systemctl enable --now docker
docker_cmd() { sudo docker --config "$deploy_dir/.docker" "$@"; }
compose() {
  sudo env "${compose_env[@]}" docker --config "$deploy_dir/.docker" compose --env-file "$env_file" -p dentisys -f docker-compose.web.yml -f docker-compose.database.yml -f docker-compose.vps.yml "${profile[@]}" "$@"
}
cd "$deploy_dir"
compose config --quiet
if [[ "$PGADMIN_ENABLED" == false ]]; then
  compose stop pgadmin
  compose rm -f pgadmin
fi
# API 1.44 requires Docker Engine 25 or newer.
sudo env DOCKER_API_VERSION=1.44 docker version >/dev/null || fail 'Docker Engine 25 or newer must accept API 1.44 (see the runbook).'
if [[ ! -f "$deploy_dir/.docker/config.json" ]]; then
  printf '{}\n' > "$deploy_dir/.docker/config.json"
fi
token="${GHCR_TOKEN:-}"
if [[ -z "$token" && -t 0 ]]; then
  read -r -s -p "GHCR token for $GHCR_USERNAME (blank skips login): " token || true
  printf '\n' >&2
fi
if [[ -n "$token" ]]; then
  printf '%s' "$token" | docker_cmd login ghcr.io -u "$GHCR_USERNAME" --password-stdin
fi
unset token GHCR_TOKEN
sudo chmod 600 "$deploy_dir/.docker/config.json"
# Stop automatic updates before the manual migration/update sequence.
compose stop watchtower
compose rm -f watchtower
compose pull
compose up -d --no-build "${db_start_args[@]}" --wait --wait-timeout 180 db
rm -f -- "$deploy_dir/.db-recreate-required"
pending="$(bash "$deploy_dir/scripts/migrate-vps.sh" --check </dev/null)" || fail 'Database check failed; see the error above and the initialization recovery runbook.'
echo "$pending"
if [[ "$pending" != 'Nothing to apply' ]]; then
  compose stop frontend web biometric
  bash "$deploy_dir/scripts/migrate-vps.sh"
fi

compose up -d --no-build --remove-orphans --wait --wait-timeout 240
compose exec -T --interactive=false frontend wget -q -O /dev/null http://127.0.0.1/
# Same maintenance as the LAN script; report failures without stopping the stack.
compose exec -T --interactive=false -u www-data web php /var/www/html/backend/bin/bootstrap-grade-weights.php || echo 'WARNING: Grade-weight setup did not finish.' >&2
compose exec -T --interactive=false -u www-data web php /var/www/html/backend/bin/bootstrap-first-dean.php || echo 'WARNING: First Dean invitation did not finish (check FIRST_DEAN_*).' >&2
compose exec -T --interactive=false -u www-data web php /var/www/html/backend/bin/expire-biometrics.php || echo 'WARNING: Biometric expiry sweep did not finish.' >&2

sudo apt-get install -y cron
sudo systemctl enable --now cron
printf 'SHELL=/bin/bash\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n17 2 * * * root /bin/bash /opt/dentisys/scripts/backup-vps.sh\n' |
  sudo tee /etc/cron.d/dentisys-backup >/dev/null
sudo chmod 644 /etc/cron.d/dentisys-backup
cat <<EOF
Deployment complete. Nightly database backup: 02:17 in the server timezone.
Firewall guidance (also set the cloud firewall):
  Keep your existing SSH rule (e.g. sudo ufw limit 2202/tcp).
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw enable
  sudo ufw status verbose
Docker-published ports bypass UFW; only Traefik publishes public ports.
Do not open PostgreSQL or biometric ports.
Verify from /opt/dentisys:
  sudo env ${compose_env[*]} docker --config /opt/dentisys/.docker compose --env-file /opt/dentisys/.env -p dentisys -f docker-compose.web.yml -f docker-compose.database.yml -f docker-compose.vps.yml ${profile[*]} ps
  curl -I http://$APP_DOMAIN
  curl -I https://$APP_DOMAIN
  sudo env ${compose_env[*]} docker --config /opt/dentisys/.docker compose --env-file /opt/dentisys/.env -p dentisys -f docker-compose.web.yml -f docker-compose.database.yml -f docker-compose.vps.yml ${profile[*]} logs --tail 100 traefik watchtower web
EOF
