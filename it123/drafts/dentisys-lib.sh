#!/bin/bash
# shared bits for the dentisys scripts

APP_DIR=/opt/dentisys
CONF_DIR=/etc/dentisys
ENV_FILE=$CONF_DIR/dentisys.env
BACKUP_DIR=/var/backups/dentisys
PROJECT=dentisys
SERVICE_USER=dentisys

# start order. db has to be up before the backend or web just crashes
START_ORDER=(db mailpit biometric web frontend)

die() { echo "ERROR: $*" >&2; exit 1; }

need_root() {
    [ "$(id -u)" -eq 0 ] || die "run this with sudo"
}

need_cmd() {
    for c in "$@"; do
        command -v "$c" >/dev/null 2>&1 || die "missing $c"
    done
}

# read a key from the env file without sourcing it
env_get() {
    grep "^$1=" "${2:-$ENV_FILE}" 2>/dev/null | tail -1 | cut -d= -f2-
}

# all the compose flags in one place, the paths are long
compose() {
    docker compose \
        -p "$PROJECT" \
        --project-directory "$APP_DIR" \
        --env-file "$ENV_FILE" \
        --env-file "$APP_DIR/release.env" \
        -f "$APP_DIR/docker-compose.web.yml" \
        -f "$APP_DIR/docker-compose.database.yml" \
        --profile mailpit \
        "$@"
}

app_port() {
    local p
    p=$(env_get APP_HTTP_PORT)
    echo "${p:-8080}"
}

# TODO: this is not a real health check, it only looks for our title in the html.
# ask if there is a proper endpoint we can hit (maybe healthcheck.php?)
app_healthy() {
    local out
    out=$(curl -s --max-time 5 "http://127.0.0.1:$(app_port)/") || return 1
    echo "$out" | grep -qi dentisys
}
