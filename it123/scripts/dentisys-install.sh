#!/bin/bash
# dentisys-install.sh - install DentiSYS on a clean Ubuntu Server 24.04 machine.
#
# Installs the platform (Docker Engine and Docker Compose from apt), creates the
# dentisys service account, copies the application from an offline bundle made by
# dentisys-bundle.sh into /opt/dentisys, loads its Docker images, writes the
# secrets file /etc/dentisys/dentisys.env (mode 600), creates the database and its
# user (the PostgreSQL container does this on first start), sets ownership and
# permissions, starts the services, and checks that the application responds.
#
# Authors: IT 123 Group 07 (BSIT 4-B), DentiSYS
# AI use: drafted with Claude Code (Anthropic, Claude Opus 5.5) from our own first
#          version (written by the group, without AI, on 2026-11-23), then reviewed, run and
#          explained line by line by the group. The submitted code is AI-assisted;
#          the member wrote the messages on lines 73, 87, 106, 204 and 231 and Claude
#          corrected and reworded them. README 7.
#
# Usage: sudo ./dentisys-install.sh [--port PORT] [--dean-email ADDRESS] BUNDLE
#   See --help.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/dentisys-lib.sh"

usage() {
    cat << EOF
Usage: sudo $(basename "$0") [OPTIONS] BUNDLE

Install DentiSYS from BUNDLE (a dentisys-VERSION.tar.gz made by dentisys-bundle.sh)
on a clean Ubuntu Server 24.04 machine. Works offline when the apt packages are
already in the package cache (apt-get install --download-only).

Options:
  --port PORT           port the application listens on (default 8080)
  --mail-port PORT      port of the Mailpit e-mail viewer (default 8025)
  --dean-email ADDRESS  e-mail of the first Dean account; its invitation appears
                        in Mailpit (http://127.0.0.1:MAIL-PORT on the server)
  --help                show this message

The ports are fixed by the first run. If an install stops halfway, fix the
cause and run the same command again: finished steps are skipped or repeated safely.

Examples:
  sudo ./dentisys-install.sh /home/admin/dentisys-1.0.tar.gz
  sudo ./dentisys-install.sh --port 8090 --mail-port 8026 /home/admin/dentisys-1.0.tar.gz
EOF
}

port=8080
mail_port=8025
dean_email=""
bundle=""
while [ "$#" -gt 0 ]; do
    case "$1" in
        --help) usage; exit 0 ;;
        --port) port="${2:?--port needs a number}"; shift ;;
        --mail-port) mail_port="${2:?--mail-port needs a number}"; shift ;;
        --dean-email) dean_email="${2:?--dean-email needs an address}"; shift ;;
        -*) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
        *) bundle="$1" ;;
    esac
    shift
done

# --- Checks before any work -------------------------------------------------
need_root "$@"
[ -n "$bundle" ] || { usage >&2; die "BUNDLE is missing"; }
[ -f "$bundle" ] || die "bundle not found: $bundle"
echo "$port $mail_port" | grep -Eq '^[0-9]{2,5} [0-9]{2,5}$' || die "--port and --mail-port must be numbers"
need_cmd tar sha256sum openssl curl apt-get systemctl ss
grep -q '^ID=ubuntu' /etc/os-release || echo "WARNING: this is not Ubuntu; the script is written for Ubuntu Server 24.04."
[ ! -f "$APP_DIR/.installed" ] || die "DentiSYS is already installed in $APP_DIR. To change versions, please run: ${CMD_ON}sudo ./dentisys-update.sh${CMD_OFF}"

mkdir -p "$LOG_DIR"
log="$LOG_DIR/install-$(date +%Y%m%d-%H%M%S).log"
: > "$log" && chmod 640 "$log"
exec > >(tee -a "$log") 2>&1
info "Installing DentiSYS from $bundle (log: $log)"

# --- 1. Platform: Docker Engine and Docker Compose ---------------------------
if command -v docker > /dev/null 2>&1 && docker compose version > /dev/null 2>&1; then
    info "Docker and Docker Compose are already installed."
else
    info "Installing docker.io and docker-compose-v2 with apt ..."
    DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends docker.io docker-compose-v2 \
        || die "Docker could not be installed with apt. If online, please run: ${CMD_ON}sudo apt-get update${CMD_OFF} first. If offline, fill the package cache first (see the runbook)."
fi
systemctl enable --now docker > /dev/null 2>&1 || die "the Docker service did not start"
docker info > /dev/null 2>&1 || die "Docker is installed but not answering"

# --- A run that stopped halfway: reuse its settings and free its ports -------
if [ -f "$ENV_FILE" ]; then
    port="$(env_get APP_HTTP_PORT)"
    mail_port="$(env_get MAILPIT_UI_PORT)"
    info "Found settings from an earlier run; using its ports $port and $mail_port."
    if [ -f "$APP_DIR/release.env" ] && app_running; then
        info "Stopping the containers left by the earlier run ..."
        compose down > /dev/null 2>&1 || die "could not stop the containers of the earlier run"
    fi
fi

# --- Both ports must be free before anything is copied or started ---------
for p in "$port" "$mail_port"; do
    if [ -n "$(ss -ltnH "( sport = :$p )")" ]; then
        die "Port $p is already in use by another program. To see it, please run: ${CMD_ON}sudo ss -ltnp | grep :$p${CMD_OFF}. Stop it, or choose other ports with ${HL_ON}--port${HL_OFF} and ${HL_ON}--mail-port${HL_OFF}."
    fi
done
info "Ports $port (application) and $mail_port (Mailpit) are free."

# --- 2. Service account and group -------------------------------------------
if getent group "$SERVICE_USER" > /dev/null; then
    info "Group $SERVICE_USER already exists."
else
    groupadd --system "$SERVICE_USER" && info "Created group $SERVICE_USER."
fi
if id "$SERVICE_USER" > /dev/null 2>&1; then
    info "User $SERVICE_USER already exists."
else
    useradd --system --gid "$SERVICE_USER" --home-dir "$APP_DIR" --no-create-home \
        --shell /usr/sbin/nologin "$SERVICE_USER" && info "Created service user $SERVICE_USER (no login shell)."
fi

# --- 3. Unpack and verify the bundle ----------------------------------------
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
info "Unpacking the bundle ..."
tar -xzf "$bundle" -C "$work" || die "the bundle is damaged (tar could not read it)"
release_dir="$(find "$work" -mindepth 1 -maxdepth 1 -type d -name 'dentisys-*' | head -n 1)"
[ -n "$release_dir" ] || die "the bundle has no dentisys-VERSION folder"
(cd "$release_dir" && sha256sum --check --quiet SHA256SUMS) || die "checksum mismatch: the bundle is incomplete or changed"
info "Bundle checksums are correct."

# --- 4. Application files and Docker images ---------------------------------
mkdir -p "$APP_DIR"
cp -a "$release_dir/app/." "$APP_DIR/"
info "Copied the application files to $APP_DIR."
info "Loading the Docker images (a few minutes) ..."
docker load --input "$release_dir/images.tar" | grep -E '^Loaded image' || die "docker load failed"

# --- 5. Configuration and secrets -------------------------------------------
mkdir -p "$CONF_DIR"
if [ -f "$ENV_FILE" ]; then
    info "Keeping the existing $ENV_FILE."
else
    server_ip="$(hostname -I | awk '{print $1}')"
    umask 077
    cat > "$ENV_FILE" << EOF
# DentiSYS settings and secrets, written by dentisys-install.sh on $(date '+%Y-%m-%d %H:%M').
# Readable by root only (mode 600). Never copy this file into a submission.
APP_BASE_URL=http://${server_ip:-127.0.0.1}:$port
APP_IS_HTTPS=false
APP_HTTP_PORT=$port
DB_NAME=dentisys
DB_USER=dentisys
DB_PASS=$(openssl rand -hex 24)
DB_ADMIN_USER=postgres
DB_ADMIN_PASS=$(openssl rand -hex 24)
# custom + an empty allowlist: every e-mail stays in Mailpit; none reaches a real inbox.
EMAIL_PROVIDER=custom
EMAIL_TEST_ALLOWLIST=
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_ENCRYPTION=none
SMTP_VERIFY_PEER=false
SMTP_FROM=noreply@dentisys.local
MAILPIT_UI_PORT=$mail_port
ALLOWED_EMAIL_DOMAINS=bicol-u.edu.ph
FIRST_DEAN_EMAIL=$dean_email
FIRST_DEAN_FIRST_NAME=Demo
FIRST_DEAN_LAST_NAME=Dean
JWT_SIGNING_KEY_B64=$(openssl rand -base64 32)
MFA_ENCRYPTION_KEY_B64=$(openssl rand -base64 32)
AUDIT_MAC_KEY_B64=$(openssl rand -base64 32)
BIOMETRIC_SIDECAR_SHARED_SECRET=$(openssl rand -hex 32)
BIOMETRIC_STORAGE_KEY_B64=$(openssl rand -base64 32)
BIOMETRIC_YUNET_SCORE_THRESHOLD=0.9
BIOMETRIC_MIN_FACE_PX=120
BIOMETRIC_QUALITY_LAPLACIAN_VARIANCE=60.0
BIOMETRIC_SFACE_COSINE_THRESHOLD=0.44
BIOMETRIC_MATCH_COUNT=3
BIOMETRIC_BLINK_THRESHOLD=0.21
BIOMETRIC_HEAD_TURN_RATIO=0.15
BIOMETRIC_CHALLENGE_TTL_SECONDS=120
MEDIAPIPE_FACE_LANDMARKER_SHA256=64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff
BIOMETRIC_YUNET_SHA256=8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4
BIOMETRIC_SFACE_SHA256=0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79
EOF
    umask 022
    info "Wrote $ENV_FILE with new random secrets."
fi

# --- 6. Ownership and permissions -------------------------------------------
# Secrets: root only. Application files: see set_app_permissions in dentisys-lib.sh.
chown root:root "$CONF_DIR" "$ENV_FILE"
chmod 700 "$CONF_DIR"
chmod 600 "$ENV_FILE"
set_app_permissions
install -d -m 700 -o root -g root "$BACKUP_DIR"
chown root:"$SERVICE_USER" "$LOG_DIR" && chmod 750 "$LOG_DIR"
info "Set ownership and permissions (secrets 600, application root:$SERVICE_USER 750)."

# --- 7. Start, then check the database and the application ------------------
"$SCRIPT_DIR/dentisys-service.sh" start || die "The services did not start. Please run: ${CMD_ON}sudo ./dentisys-status.sh${CMD_OFF}"

admin_user="$(env_get DB_ADMIN_USER)"
db_user="$(env_get DB_USER)"
db_name="$(env_get DB_NAME)"
if compose exec -T db psql -U "$admin_user" -d "$db_name" -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$db_user'" | grep -qx 1; then
    info "Database '$db_name' and its user '$db_user' exist."
else
    die "the database user '$db_user' was not created"
fi

# Same first-run setup as the project's start-single-server script; a failure here is only a warning.
compose exec -T -u www-data web php /var/www/html/backend/bin/bootstrap-grade-weights.php > /dev/null \
    || echo "WARNING: grade-weight setup did not finish."
if [ -n "$dean_email" ]; then
    compose exec -T -u www-data web php /var/www/html/backend/bin/bootstrap-first-dean.php \
        && info "First Dean invitation sent; open Mailpit at http://127.0.0.1:$mail_port on the server." \
        || echo "WARNING: the first Dean invitation was not sent."
fi

if wait_healthy 120; then
    date '+%Y-%m-%d %H:%M:%S' > "$APP_DIR/.installed"
    echo
    echo "SUCCESS: DentiSYS $(env_get DENTISYS_VERSION "$APP_DIR/release.env") is installed and responding at $(env_get APP_BASE_URL)"
    exit 0
fi
echo
die "DentiSYS was installed but does not respond on port $port. Please run: ${CMD_ON}sudo ./dentisys-status.sh${CMD_OFF}"
