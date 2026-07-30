#!/usr/bin/env sh
set -eu

env_file="${1:-.env.single-server}"
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

docker compose --env-file "$env_file" -p dentisys-single-server -f docker-compose.web.yml -f docker-compose.database.yml config --quiet
docker compose --env-file "$env_file" -p dentisys-single-server -f docker-compose.web.yml -f docker-compose.database.yml up -d --build
