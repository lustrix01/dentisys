#!/bin/bash
# install dentisys from the bundle. ubuntu server, run as root.
# usage: sudo ./dentisys-install.sh [--port N] [--mail-port N] BUNDLE

set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
. "$HERE/dentisys-lib.sh"

usage() {
    echo "usage: sudo $0 [--port N] [--mail-port N] BUNDLE"
    echo "  --port       app port, default 8080"
    echo "  --mail-port  mailpit port, default 8025"
}

port=8080
mail_port=8025
bundle=""

while [ $# -gt 0 ]; do
    case $1 in
        --port) port=$2; shift ;;
        --mail-port) mail_port=$2; shift ;;
        -h|--help) usage; exit 0 ;;
        *) bundle=$1 ;;
    esac
    shift
done

need_root "$@"
[ -n "$bundle" ] || { usage; exit 1; }
[ -f "$bundle" ] || die "cant find $bundle"
need_cmd docker tar openssl curl apt-get

# docker first. this only works offline if the apt cache already has the packages,
# which is a problem we have not solved yet
if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
    echo "docker is already here"
else
    echo "installing docker"
    apt-get install -y docker.io docker-compose-v2 || die "docker install failed"
fi
systemctl enable --now docker
docker info >/dev/null 2>&1 || die "docker is not answering"

# second run after a failure: keep the old ports or the user gets confused
if [ -f "$ENV_FILE" ]; then
    port=$(env_get APP_HTTP_PORT)
    mail_port=$(env_get MAILPIT_UI_PORT)
    echo "reusing ports $port and $mail_port"
    if [ -f "$APP_DIR/release.env" ]; then
        docker compose -p "$PROJECT" --project-directory "$APP_DIR" \
            --env-file "$ENV_FILE" --env-file "$APP_DIR/release.env" \
            -f "$APP_DIR/docker-compose.web.yml" \
            -f "$APP_DIR/docker-compose.database.yml" --profile mailpit down || true
    fi
fi

# ports have to be free
for p in $port $mail_port; do
    if ss -ltn | grep -q ":$p "; then
        die "port $p is taken"
    fi
done

# service user
getent group "$SERVICE_USER" >/dev/null || groupadd --system "$SERVICE_USER"
id "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --gid "$SERVICE_USER" \
    --home-dir "$APP_DIR" --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"

# unpack
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
tar -xzf "$bundle" -C "$work" || die "cant unpack the bundle"
release=$(find "$work" -maxdepth 1 -type d -name 'dentisys-*' | head -1)
[ -n "$release" ] || die "no dentisys folder inside the bundle"

mkdir -p "$APP_DIR"
cp -a "$release/app/." "$APP_DIR/"

echo "loading images, this takes a few minutes"
docker load -i "$release/images.tar"

# env file
mkdir -p "$CONF_DIR"
if [ ! -f "$ENV_FILE" ]; then
    ip=$(hostname -I | awk '{print $1}')
    umask 077
    cat >"$ENV_FILE" <<EOF
APP_BASE_URL=http://${ip:-127.0.0.1}:$port
APP_IS_HTTPS=false
APP_HTTP_PORT=$port
DB_NAME=dentisys
DB_USER=dentisys
DB_PASS=$(openssl rand -hex 24)
DB_ADMIN_USER=postgres
DB_ADMIN_PASS=$(openssl rand -hex 24)
EMAIL_PROVIDER=custom
EMAIL_TEST_ALLOWLIST=
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_ENCRYPTION=none
SMTP_VERIFY_PEER=false
SMTP_FROM=noreply@dentisys.local
MAILPIT_UI_PORT=$mail_port
ALLOWED_EMAIL_DOMAINS=bicol-u.edu.ph
FIRST_DEAN_EMAIL=
JWT_SIGNING_KEY_B64=$(openssl rand -base64 32)
MFA_ENCRYPTION_KEY_B64=$(openssl rand -base64 32)
AUDIT_MAC_KEY_B64=$(openssl rand -base64 32)
BIOMETRIC_SIDECAR_SHARED_SECRET=$(openssl rand -hex 32)
BIOMETRIC_STORAGE_KEY_B64=$(openssl rand -base64 32)
EOF
    umask 022
    echo "wrote $ENV_FILE"
fi

# permissions. keep it simple for now, root owns it and everyone can read it.
# TODO: 755 on everything is too loose (release.env has no secrets but still),
# tighten this once the containers work.
chown -R root:"$SERVICE_USER" "$APP_DIR"
chmod -R 755 "$APP_DIR"
chown root:root "$CONF_DIR" "$ENV_FILE"
chmod 700 "$CONF_DIR"
chmod 600 "$ENV_FILE"

# start and see
"$HERE/dentisys-service.sh" start
sleep 5

if app_healthy; then
    echo
    echo "dentisys is up on port $port"
else
    echo
    echo "installed but the app doesnt answer, run dentisys-status.sh"
    exit 1
fi
