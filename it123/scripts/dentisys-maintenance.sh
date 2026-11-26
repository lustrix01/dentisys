#!/bin/bash
# dentisys-maintenance.sh - switch DentiSYS to maintenance mode and back.
#
# "on" stops the web front end and puts a small nginx container on the same port.
# It answers every request with HTTP 503 and a "temporarily unavailable" page, so
# users get a clear message instead of an error. "off" removes it and starts the
# front end again. Unlike pause, the server keeps answering during maintenance.
# The nginx container uses the front-end image already on the server, so nothing
# is downloaded.
#
# Authors: IT 123 Group 07 (BSIT 4-B), DentiSYS
# AI use: drafted with Claude Code (Anthropic, Claude Opus 5.5) from our own first
#          version (written by the group, without AI, on 2026-11-23), then reviewed, run and
#          explained line by line by the group. The submitted code is AI-assisted;
#          the member wrote the messages on lines 53, 94, 98 and 111 and Claude
#          corrected and reworded them. README 7.
#
# Usage: sudo ./dentisys-maintenance.sh on ["MESSAGE"] | off | status   (see --help)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/dentisys-lib.sh"

PAGE_DIR="$APP_DIR/maintenance"
LIVE_DIR="/var/lib/dentisys/maintenance"   # kept across reboots, like the container

usage() {
    cat << EOF
Usage: sudo $(basename "$0") COMMAND [MESSAGE]

Commands:
  on [MESSAGE]   show the "temporarily unavailable" page to every user;
                 MESSAGE (optional) is printed on the page, e.g. the end time
  off            remove the page and bring DentiSYS back
  status         say whether maintenance mode is on
  --help         show this message

Examples:
  sudo ./dentisys-maintenance.sh on "Back at 3:00 PM today."
  sudo ./dentisys-maintenance.sh off
EOF
}

# Make text safe to put inside HTML (& < > " become entities).
html_escape() {
    printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'
}

turn_on() {
    local message="${1:-We will be back shortly.}" port escaped
    maintenance_on && die "maintenance mode is already on" 5
    [ ! -f "$STATE_DIR/paused" ] || die "DentiSYS is paused. Please run: ${CMD_ON}sudo ./dentisys-pause.sh${CMD_OFF} ${HL_ON}resume${HL_OFF}" 5
    port="$(app_port)"

    # Build the page for this maintenance window from the template.
    mkdir -p "$LIVE_DIR"
    cp "$PAGE_DIR/maintenance.conf" "$LIVE_DIR/default.conf"
    escaped="$(html_escape "$message")"
    # | is the sed separator; escape it and the sed specials \ and & in the message.
    escaped="$(printf '%s' "$escaped" | sed -e 's/[\\|&]/\\&/g')"
    sed "s|MAINTENANCE_MESSAGE|$escaped|" "$PAGE_DIR/index.html" > "$LIVE_DIR/index.html"
    chmod 755 "$LIVE_DIR"
    chmod 644 "$LIVE_DIR/default.conf" "$LIVE_DIR/index.html"

    info "Stopping the web front end ..."
    compose stop frontend > /dev/null 2>&1 || die "could not stop the front end"

    info "Starting the maintenance page on port $port ..."
    if ! docker run --detach --name "$MAINT_CONTAINER" --restart unless-stopped \
        --publish "$port:80" \
        --volume "$LIVE_DIR/default.conf:/etc/nginx/conf.d/default.conf:ro" \
        --volume "$LIVE_DIR/index.html:/usr/share/nginx/maintenance/index.html:ro" \
        "$(env_get FRONTEND_IMAGE "$APP_DIR/release.env")" > /dev/null; then
        compose start frontend > /dev/null 2>&1 || true
        die "the maintenance page did not start; the front end was started again"
    fi

    sleep 2
    local code
    code="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:$port/")" || true
    if [ "$code" = "503" ]; then
        info "Maintenance mode is ON: users now see the 'temporarily unavailable' page (HTTP 503)."
    else
        die "the maintenance page answered HTTP '$code' instead of 503; turn it off and check"
    fi
}

turn_off() {
    maintenance_on || die "maintenance mode is not on" 5
    docker rm --force "$MAINT_CONTAINER" > /dev/null
    info "Removed the maintenance page. Starting the web front end ..."
    compose up --detach --no-deps --wait --wait-timeout 120 frontend > /dev/null \
        || die "The front end did not start. Please run: ${CMD_ON}sudo ./dentisys-service.sh${CMD_OFF} ${HL_ON}restart${HL_OFF}"
    if wait_healthy 60; then
        info "Maintenance mode is OFF: DentiSYS is back on port $(app_port)."
    else
        die "The front end is up but the application does not answer. Please run: ${CMD_ON}sudo ./dentisys-status.sh${CMD_OFF}"
    fi
}

case "${1:-}" in
    --help|-h) usage; exit 0 ;;
    on|off|status) ;;
    "") usage >&2; exit 1 ;;
    *) echo "Unknown command: $1" >&2; usage >&2; exit 1 ;;
esac

need_root "$@"
need_cmd docker curl sed
[ -f "$ENV_FILE" ] || die "DentiSYS is not installed. Please run: ${CMD_ON}sudo ./dentisys-install.sh${CMD_OFF} first"

case "$1" in
    on) take_lock; turn_on "${2:-}" ;;
    off) take_lock; turn_off ;;
    status)
        if maintenance_on; then
            echo "Maintenance mode is ON."
        else
            echo "Maintenance mode is OFF."
        fi
        ;;
esac
