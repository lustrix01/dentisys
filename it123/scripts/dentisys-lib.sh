#!/bin/bash
# dentisys-lib.sh - shared settings and helper functions for the DentiSYS toolkit.
#
# Authors: IT 123 Group 07 (BSIT 4-B), DentiSYS
# AI use: drafted with Claude Code (Anthropic, Claude Opus 5.5) from our own first
#          version (written by the group, without AI, on 2026-11-23), then reviewed, run and
#          explained line by line by the group. The submitted code is AI-assisted;
#          the member wrote the cyan block at lines 144-150, and Claude found errors
#          in it that the member fixed before the final review. README 7.
#
# Usage: not run directly. Every toolkit script loads it with
#   . "$(dirname "$0")/dentisys-lib.sh"

# shellcheck disable=SC2034  # these settings are used by the scripts that load this file
# Where everything lives on the server.
APP_DIR="/opt/dentisys"                     # application files (compose files, database/, assets/)
CONF_DIR="/etc/dentisys"                    # configuration and secrets
ENV_FILE="$CONF_DIR/dentisys.env"           # secrets, mode 600, read only by root
BACKUP_DIR="/var/backups/dentisys"          # backups made by the update script
LOG_DIR="/var/log/dentisys"                 # toolkit logs and reports
STATE_DIR="/run/dentisys"                   # pause marker and lock file (cleared on reboot)
PROJECT="dentisys"                          # Docker Compose project name
SERVICE_USER="dentisys"                     # service account and group
MAINT_CONTAINER="dentisys-maintenance"      # container that serves the maintenance page

# The order services start in. Stop uses the reverse order.
START_ORDER=(db mailpit biometric web frontend)
# The services whose processes pause.sh freezes (the database keeps running).
APP_SERVICES=(frontend web biometric)

# Print an error and leave with the given exit status (default 1).
die() {
    echo "ERROR: $1" >&2
    exit "${2:-1}"
}

info() {
    echo "[$(date '+%H:%M:%S')] $*"
}

# Refuse to run unless the user is root.
need_root() {
    if [ "$(id -u)" -ne 0 ]; then
        die "This script must be run as root. Please run: ${CMD_ON}sudo $0 $*${CMD_OFF}" 2
    fi
}

# Refuse to run unless every named command exists.
need_cmd() {
    local cmd
    for cmd in "$@"; do
        command -v "$cmd" > /dev/null 2>&1 || die "required command not found: $cmd" 3
    done
}

# Read one KEY=value line from a settings file without running the file.
env_get() {
    local key="$1" file="${2:-$ENV_FILE}"
    grep -E "^${key}=" "$file" 2> /dev/null | tail -n 1 | cut -d '=' -f 2-
}

# Run docker compose for the installed application.
# release.env holds the image tags of the installed version; dentisys.env holds the secrets.
compose() {
    docker compose --progress quiet \
        --project-name "$PROJECT" \
        --project-directory "$APP_DIR" \
        --env-file "$ENV_FILE" \
        --env-file "$APP_DIR/release.env" \
        --file "$APP_DIR/docker-compose.web.yml" \
        --file "$APP_DIR/docker-compose.database.yml" \
        --profile mailpit \
        "$@"
}

# The port users open in a browser.
app_port() {
    local port
    port="$(env_get APP_HTTP_PORT)"
    echo "${port:-8080}"
}

# Succeeds when the application answers and its database is up.
app_healthy() {
    local body
    body="$(curl --silent --max-time 5 "http://127.0.0.1:$(app_port)/healthcheck.php")" || return 1
    echo "$body" | grep -Eq '"status": ?"ok"' && echo "$body" | grep -Eq '"database": ?"up"'
}

# Wait up to $1 seconds (default 120) for app_healthy.
wait_healthy() {
    local limit="${1:-120}" waited=0
    while [ "$waited" -lt "$limit" ]; do
        app_healthy && return 0
        sleep 5
        waited=$((waited + 5))
    done
    return 1
}

# Succeeds when at least one application container is running.
app_running() {
    [ -n "$(compose ps --status running --quiet 2> /dev/null)" ]
}

# Succeeds when the maintenance page container exists.
maintenance_on() {
    [ -n "$(docker ps --all --quiet --filter "name=^${MAINT_CONTAINER}$")" ]
}

# Least-privilege ownership and permissions on the application files.
# Root writes them, the dentisys group reads them. Files mounted into containers
# (database scripts, model files, maintenance page) are world-readable because the
# container processes run as their own users. Secrets are not here: see ENV_FILE.
set_app_permissions() {
    local shared
    chown -R root:"$SERVICE_USER" "$APP_DIR"
    chmod 750 "$APP_DIR"
    chmod 640 "$APP_DIR"/*.yml "$APP_DIR/release.env"
    for shared in database assets maintenance; do
        find "$APP_DIR/$shared" -type d -exec chmod 755 {} +
        find "$APP_DIR/$shared" -type f -exec chmod 644 {} +
    done
    chmod 755 "$APP_DIR/database/apply-migrations.sh"
}

# Take a lock so two toolkit scripts never change the application at the same time.
take_lock() {
    mkdir -p "$STATE_DIR"
    exec 9> "$STATE_DIR/toolkit.lock"
    flock --nonblock 9 || die "another DentiSYS toolkit script is running; try again when it finishes" 4
}

# Colour for commands the administrator must type: only when output is a terminal.
if [ -t 1 ] && [ -t 2 ]; then
    CMD_ON=$'\e[0;33m'   # colour yellow
    CMD_OFF=$'\e[0m'     # back to normal
else
    CMD_ON=""
    CMD_OFF=""
fi

# Colour for highlight
if [ -t 1 ] && [ -t 2 ]; then
   HL_ON=$'\e[0;36m'    # colour cyan
   HL_OFF=$'\e[0m'      # back to normal
else
   HL_ON=""
   HL_OFF=""
fi
