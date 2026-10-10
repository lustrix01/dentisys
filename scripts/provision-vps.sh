#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077
fail() { echo "ERROR: $*" >&2; exit 1; }
phase() { printf '\n=== %s ===\n' "$1"; }
[[ "$EUID" -eq 0 && $# -eq 0 ]] || fail 'Run via provision-vps.ps1 (sudo, stdin protocol; no arguments).'
. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 26.04 ]] || fail 'Ubuntu 26.04 LTS is required.'
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
deploy_dir=/opt/dentisys
env_file="$deploy_dir/.env"
# Read only non-secret configuration fields; never source the environment.
env_value() {
  local line value
  line="$(grep "^$1=" "$env_file" | tail -1)"
  value="${line#*=}"
  case "$value" in \'*\'|\"*\") value="${value:1:${#value}-2}" ;; esac
  printf '%s' "$value"
}
exec 8>/run/lock/dentisys-provision.lock
flock -n 8 || fail 'Another provisioning run is active.'

# NUL framing transports UTF-8 literally; never eval, source or log input.
IFS= read -r -d '' devops_password || fail 'Missing devops password.'
[[ -n "$devops_password" && "$devops_password" != *$'\n'* && "$devops_password" != *$'\r'* ]] || fail 'Invalid devops password framing.'
IFS= read -r -d '' protocol || fail 'Missing protocol.'
[[ "$protocol" == DENTISYS_PROVISION_1 ]] || fail 'Unsupported stdin protocol.'
declare -A input=()
while IFS= read -r -d '' key; do
  [[ "$key" != END ]] || break
  case "$key" in
    MODE|IP|DOMAIN|SSH_PORT|NO_DB_TUNNEL|SG_CONFIRMED|GHCR_USERNAME|GHCR_TOKEN|SMTP_USER|SMTP_PASS|TRAEFIK_ACME_EMAIL|FIRST_DEAN_FIRST_NAME|FIRST_DEAN_LAST_NAME|FIRST_DEAN_EMAIL|PGADMIN_DEFAULT_EMAIL|PGADMIN_DEFAULT_PASSWORD|ALLOWED_EMAIL_DOMAINS|GOOGLE_CLIENT_ID|STUDENT_AUTH_ENABLED|BIOMETRIC_SIDECAR_ENABLED|BIOMETRIC_HAAR_SCALE_FACTOR|BIOMETRIC_HAAR_MIN_NEIGHBORS|BIOMETRIC_HAAR_MIN_FACE_PX|BIOMETRIC_QUALITY_LAPLACIAN_VARIANCE|BIOMETRIC_LBPH_RADIUS|BIOMETRIC_LBPH_NEIGHBORS|BIOMETRIC_LBPH_GRID_X|BIOMETRIC_LBPH_GRID_Y|BIOMETRIC_LBPH_THRESHOLD|BIOMETRIC_MATCH_COUNT|BIOMETRIC_BLINK_THRESHOLD|BIOMETRIC_HEAD_TURN_RATIO|BIOMETRIC_CHALLENGE_TTL_SECONDS) ;;
    *) fail 'Unexpected input field.' ;;
  esac
  [[ ! -v "input[$key]" ]] || fail 'Duplicate input field.'
  IFS= read -r -d '' value || fail 'Truncated stdin protocol.'
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || fail 'Inputs must be one-line values.'
  input["$key"]="$value"
done
[[ "${key:-}" == END ]] || fail 'Missing end of stdin protocol.'
unset value key protocol
exec </dev/null
[[ "${input[SG_CONFIRMED]:-}" == true ]] || fail 'Confirm the AWS checklist before provisioning.'
ssh_port="${input[SSH_PORT]:-2202}"
[[ "$ssh_port" =~ ^[0-9]+$ && "$ssh_port" -ge 1024 && "$ssh_port" -le 65535 ]] || fail 'Invalid SSH port.'
[[ "${input[NO_DB_TUNNEL]:-}" == true || "${input[NO_DB_TUNNEL]:-}" == false ]] || fail 'Invalid tunnel switch.'
[[ -n "${input[GHCR_TOKEN]:-}" ]] || fail 'A GHCR read token is required.'
# Validate every fresh answer before changing the host.
if [[ ! -f "$env_file" ]]; then
  for key in GHCR_USERNAME SMTP_USER SMTP_PASS TRAEFIK_ACME_EMAIL FIRST_DEAN_FIRST_NAME FIRST_DEAN_LAST_NAME FIRST_DEAN_EMAIL PGADMIN_DEFAULT_EMAIL PGADMIN_DEFAULT_PASSWORD ALLOWED_EMAIL_DOMAINS STUDENT_AUTH_ENABLED BIOMETRIC_SIDECAR_ENABLED BIOMETRIC_HAAR_SCALE_FACTOR BIOMETRIC_HAAR_MIN_NEIGHBORS BIOMETRIC_HAAR_MIN_FACE_PX BIOMETRIC_QUALITY_LAPLACIAN_VARIANCE BIOMETRIC_LBPH_RADIUS BIOMETRIC_LBPH_NEIGHBORS BIOMETRIC_LBPH_GRID_X BIOMETRIC_LBPH_GRID_Y BIOMETRIC_LBPH_THRESHOLD BIOMETRIC_MATCH_COUNT BIOMETRIC_BLINK_THRESHOLD BIOMETRIC_HEAD_TURN_RATIO; do
    [[ -n "${input[$key]:-}" && "${input[$key]}" != *replace_with_* ]] || fail "Missing fresh configuration: $key."
  done
  [[ "${input[GHCR_USERNAME]}" =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]] || fail 'Invalid GHCR username.'
  [[ "${input[STUDENT_AUTH_ENABLED]}" =~ ^(true|false)$ && "${input[BIOMETRIC_SIDECAR_ENABLED]}" =~ ^(true|false)$ ]] || fail 'Feature switches must be true or false.'
  domain="${input[DOMAIN]:-}"
  if [[ -z "$domain" ]]; then
    [[ "${input[IP]:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'An IPv4 address is required.'
    domain="${input[IP]//./-}.sslip.io"
  fi
  [[ "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ && "$domain" == *.* ]] || fail 'Invalid application hostname.'
  dean_domain="${input[FIRST_DEAN_EMAIL]##*@}"
  allowed=false
  IFS=',' read -r -a domains <<< "${input[ALLOWED_EMAIL_DOMAINS]}"
  for email_domain in "${domains[@]}"; do
    email_domain="${email_domain//[[:space:]]/}"
    [[ "${email_domain,,}" != "${dean_domain,,}" ]] || allowed=true
  done
  [[ "$allowed" == true ]] || fail 'First Dean email must use an allowed domain.'
fi
export DEBIAN_FRONTEND=noninteractive APT_LISTCHANGES_FRONTEND=none NEEDRESTART_MODE=a

# Once SSH accepts only devops, hand the fixed upload paths to that user so
# its next SCP and extraction can replace the first ubuntu-owned bundle.
handoff_staging() {
  [[ "$source_dir" == /tmp/dentisys-deploy ]] || return 0
  id devops >/dev/null 2>&1 || return 0
  [[ -f /etc/ssh/sshd_config.d/99-hardening.conf ]] || return 0
  grep -Fxq "Port $ssh_port" /etc/ssh/sshd_config.d/99-hardening.conf || return 0
  grep -Fxq 'AllowUsers devops' /etc/ssh/sshd_config.d/99-hardening.conf || return 0
  chown -R "devops:$(id -gn devops)" /tmp/dentisys-deploy
  for upload_file in /tmp/dentisys-deploy.tar.gz /tmp/face_landmarker.task; do
    [[ ! -f "$upload_file" || -L "$upload_file" ]] || chown "devops:$(id -gn devops)" "$upload_file"
  done
}
env_temp=''
trap '[[ -z "$env_temp" ]] || rm -f -- "$env_temp"; handoff_staging' EXIT

phase 'A. Host hardening (guide steps 1-6)'
harden_flags=(--non-interactive --sg-confirmed --ssh-port "$ssh_port")
[[ "${input[NO_DB_TUNNEL]}" != true ]] || harden_flags+=(--no-db-tunnel)
if bash "$source_dir/scripts/harden-vps.sh" "${harden_flags[@]}" --check-only </dev/null >/dev/null 2>&1; then
  echo 'SKIP: hardening drop-in already matches; devops keys and SSH configuration passed pre-checks.'
else
  printf '%s\0' "$devops_password" | bash "$source_dir/scripts/harden-vps.sh" "${harden_flags[@]}" --password-stdin
fi
unset devops_password
handoff_staging

phase 'B. Server environment and face model'
install -d -m 0750 -o devops -g "$(id -gn devops)" "$deploy_dir" "$deploy_dir/assets"
model="$source_dir/face_landmarker.task"
if [[ -f "$model" ]]; then
  if [[ -f "$env_file" ]]; then
    uploaded_hash="$(sha256sum "$model")"
    configured_hash="$(env_value MEDIAPIPE_FACE_LANDMARKER_SHA256)"
    [[ "${uploaded_hash%% *}" == "${configured_hash,,}" ]] || fail 'Uploaded model differs from the preserved server checksum. Existing model was left untouched.'
  fi
  if ! cmp -s "$model" "$deploy_dir/assets/face_landmarker.task"; then
    install -m 0644 -o devops -g "$(id -gn devops)" "$model" "$deploy_dir/assets/face_landmarker.task"
  else
    echo 'SKIP: installed face model already matches.'
  fi
fi
[[ -f "$deploy_dir/assets/face_landmarker.task" ]] || fail 'Uploaded or installed face model is missing.'
if [[ -f "$env_file" ]]; then
  [[ "$(stat -c '%a' "$env_file")" == 600 ]] || fail 'Existing server .env must have mode 0600; it was left untouched.'
  echo 'SKIP: existing /opt/dentisys/.env preserved byte-for-byte; no passwords or signing keys regenerated.'
else
  declare -A values=()
  for key in "${!input[@]}"; do
    case "$key" in
      SMTP_*|TRAEFIK_ACME_EMAIL|FIRST_DEAN_*|PGADMIN_DEFAULT_*|ALLOWED_EMAIL_DOMAINS|GOOGLE_CLIENT_ID|STUDENT_AUTH_ENABLED|BIOMETRIC_*) values["$key"]="${input[$key]}" ;;
    esac
  done
  values[APP_DOMAIN]="$domain"
  values[SMTP_FROM]="${input[SMTP_USER]}"
  values[GHCR_USERNAME]="${input[GHCR_USERNAME]}"
  namespace="${input[GHCR_USERNAME],,}"
  values[WEB_IMAGE]="ghcr.io/$namespace/dentisys-web:demo"
  values[FRONTEND_IMAGE]="ghcr.io/$namespace/dentisys-frontend:demo"
  values[BIOMETRIC_IMAGE]="ghcr.io/$namespace/dentisys-biometric:demo"
  for key in DB_PASS DB_ADMIN_PASS JWT_SIGNING_KEY_B64 MFA_ENCRYPTION_KEY_B64 AUDIT_MAC_KEY_B64 BIOMETRIC_STORAGE_KEY_B64 BIOMETRIC_SIDECAR_SHARED_SECRET; do
    values["$key"]="$(openssl rand -base64 32)"
  done
  for key in DB_PASS DB_ADMIN_PASS; do values["$key"]="${values[$key]//+/-}"; values["$key"]="${values[$key]//\//_}"; values["$key"]="${values[$key]//=}"; done
  model_hash="$(sha256sum "$deploy_dir/assets/face_landmarker.task")"
  values[MEDIAPIPE_FACE_LANDMARKER_SHA256]="${model_hash%% *}"
  # Only the VPS gets an environment file; publish the private file atomically.
  env_temp="$(mktemp "$deploy_dir/.env.provision.XXXXXX")"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)= ]]; then
      key="${BASH_REMATCH[1]}"
      if [[ -v "values[$key]" ]]; then
        value="${values[$key]}"
        # Compose single quotes suppress $ interpolation; escape apostrophes.
        value="${value//\'/\\\'}"
        printf "%s='%s'\n" "$key" "$value" >> "$env_temp"
        continue
      fi
    fi
    printf '%s\n' "$line" >> "$env_temp"
  done < "$source_dir/.env.vps.example"
  ! grep -q '^[A-Z_][A-Z0-9_]*=.*replace_with_' "$env_temp" || fail 'A required environment value is still a placeholder.'
  chown "devops:$(id -gn devops)" "$env_temp"
  chmod 600 "$env_temp"
  ln "$env_temp" "$env_file" || fail 'Environment appeared during provisioning; refusing to overwrite it.'
  rm -f -- "$env_temp"
  env_temp=''
  unset values value
  echo 'Created private server .env with independent random keys.'
fi

phase 'C. Deploy using the existing deployment script'
ghcr_token="${input[GHCR_TOKEN]}"
unset input
printf '%s\0' "$ghcr_token" | bash "$source_dir/scripts/deploy-vps.sh" --non-interactive --token-stdin
unset ghcr_token

phase 'D. Verify containers, public HTTPS and backup scheduling'
cd "$deploy_dir"
domain="$(env_value APP_DOMAIN)"
profile=()
[[ "$(env_value EMAIL_PROVIDER)" != custom ]] || profile+=(--profile mailpit)
compose_env=(COMPOSE_PROFILES=)
if [[ "$(env_value PGADMIN_ENABLED)" != false ]]; then profile+=(--profile tools); else compose_env+=(PGADMIN_DEFAULT_EMAIL=disabled@example.invalid PGADMIN_DEFAULT_PASSWORD=unused); fi
compose() { env "${compose_env[@]}" docker --config "$deploy_dir/.docker" compose --env-file "$env_file" -p dentisys -f docker-compose.web.yml -f docker-compose.database.yml -f docker-compose.vps.yml "${profile[@]}" "$@"; }
failed=0
result() { if [[ "$1" == true ]]; then echo "PASS: $2"; else echo "FAIL: $2"; failed=$((failed + 1)); fi; }
web=0 frontend=0 biometric=0 healthy=true
if ! ids="$(compose ps --all -q)"; then ids=''; healthy=false; fi
[[ -n "$ids" ]] || healthy=false
for id in $ids; do
  if ! state="$(docker inspect --format '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{index .Config.Labels "com.docker.compose.service"}}' "$id")"; then healthy=false; continue; fi
  read -r running health service <<< "$state"
  [[ "$running" == true && ( "$health" == healthy || "$health" == none ) ]] || healthy=false
  case "$service" in
    web) web=$((web + 1)); [[ "$health" == healthy ]] || healthy=false ;;
    frontend) frontend=$((frontend + 1)); [[ "$health" == healthy ]] || healthy=false ;;
    biometric) biometric=$((biometric + 1)); [[ "$health" == healthy ]] || healthy=false ;;
  esac
done
[[ "$web" -eq 3 && "$frontend" -eq 3 && "$biometric" -eq 1 ]] || healthy=false
result "$healthy" 'containers running; 3 healthy web, 3 healthy frontend, 1 healthy biometric'
headers="$(curl -sS --connect-timeout 5 --max-time 10 -I "http://$domain" 2>/dev/null || true)"
redirect=false
location="$(awk 'tolower($1) == "location:" { sub(/\r$/, "", $2); print $2; exit }' <<< "$headers")"
if [[ "$headers" =~ HTTP/[0-9.]+[[:space:]]+(301|302|307|308) &&
      ( "$location" == "https://$domain" || "$location" == "https://$domain/"* || "$location" == "https://$domain:443/"* ) ]]; then redirect=true; fi
result "$redirect" 'public HTTP redirects to HTTPS'
tls=false
deadline=$((SECONDS + 180))
echo "Waiting up to 3 minutes for Let's Encrypt..."
while [[ "$SECONDS" -lt "$deadline" ]]; do
  if curl -fsS --connect-timeout 5 --max-time 10 "https://$domain/" >/dev/null 2>&1; then
    issuer="$(timeout 10 openssl s_client -connect "$domain:443" -servername "$domain" </dev/null 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null || true)"
    if [[ "$issuer" == *"Let's Encrypt"* ]]; then tls=true; break; fi
  fi
  sleep 5
done
result "$tls" 'trusted, current HTTPS certificate for APP_DOMAIN issued by Let'\''s Encrypt'
json_check() { compose exec -T -u www-data web php -r "$1" >/dev/null; }
health_ok=false
if body="$(curl -fsS --connect-timeout 5 --max-time 10 "https://$domain/api/health" 2>/dev/null)" &&
   printf '%s' "$body" | json_check '$j=json_decode(stream_get_contents(STDIN),true); exit(($j["status"]??"")==="ok"?0:1);'; then health_ok=true; fi
result "$health_ok" 'public /api/health reports ok'
refresh_code="$(curl -sS --connect-timeout 5 --max-time 10 -o /dev/null -w '%{http_code}' -X POST "https://$domain/api/auth/refresh" 2>/dev/null || true)"
refresh_ok=false
[[ "$refresh_code" != 401 ]] || refresh_ok=true
result "$refresh_ok" 'unauthenticated POST /api/auth/refresh returns 401'
runtime_ok=false
if body="$(curl -fsS --connect-timeout 5 --max-time 10 "https://$domain/api/runtime-config" 2>/dev/null)"; then
  if [[ "$(env_value BIOMETRIC_SIDECAR_ENABLED)" == true ]]; then
    if printf '%s' "$body" | json_check '$j=json_decode(stream_get_contents(STDIN),true); exit(($j["providers"]["biometrics"]["active"]??"")==="sidecar"&&($j["status"]??"")==="ok"?0:1);'; then runtime_ok=true; fi
  else
    if printf '%s' "$body" | json_check '$j=json_decode(stream_get_contents(STDIN),true); exit(($j["status"]??"")==="ok"&&($j["providers"]["biometrics"]["active"]??"")==="disabled"?0:1);'; then runtime_ok=true; fi
  fi
fi
result "$runtime_ok" 'runtime-config matches the biometrics switch'
cron_ok=false
if [[ -f /etc/cron.d/dentisys-backup ]] && grep -Fxq '17 2 * * * root /bin/bash /opt/dentisys/scripts/backup-vps.sh' /etc/cron.d/dentisys-backup && systemctl is-active --quiet cron; then cron_ok=true; fi
result "$cron_ok" 'nightly backup cron installed and cron active'
unset body
[[ "$failed" -eq 0 ]] || fail "Verification failed ($failed checks). Existing environment and database retained; fix the reported issue and rerun."
echo "Verification complete: all checks passed. Site: https://$domain"
