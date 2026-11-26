#!/bin/bash
# dentisys-service.sh - start, stop or restart DentiSYS and the services it depends on.
#
# Start order: database -> mail (Mailpit) -> face recognition sidecar -> backend
# -> web front end. Each service must be up (healthy, when it has a health check)
# before the next one starts. Stop uses the reverse order. "start" refuses to
# start a second copy when the application is already running.
#
# Authors: IT 123 Group 07 (BSIT 4-B), DentiSYS
# AI use: drafted with Claude Code (Anthropic, Claude Opus 5.5) from our own first
#          version (written by the group, without AI, on 2026-11-23), then reviewed, run and
#          explained line by line by the group. The submitted code is AI-assisted;
#          the member wrote the wording on lines 55, 58, 75 and 78 and the
#          messages on lines 43, 46, 54, 70 and 90, and Claude corrected and reworded
#          all of them. README 7.
#
# Usage: sudo ./dentisys-service.sh start|stop|restart   (see --help)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/dentisys-lib.sh"

usage() {
    cat << EOF
Usage: sudo $(basename "$0") COMMAND

Commands:
  start     start the services in order: ${START_ORDER[*]}
            (refuses if DentiSYS is already running)
  stop      stop the services in reverse order (also ends maintenance mode)
  restart   stop, then start
  --help    show this message

Examples:
  sudo ./dentisys-service.sh start
  sudo ./dentisys-service.sh stop
EOF
}

start_app() {
    if app_running; then
        die "DentiSYS is already running, so a second copy was not started. Please use ${HL_ON}restart${HL_OFF}, or ${HL_ON}stop${HL_OFF} first" 5
    fi
    if maintenance_on; then
        die "Maintenance mode is on. Please run: ${CMD_ON}sudo ./dentisys-maintenance.sh${CMD_OFF} ${HL_ON}off${HL_OFF} first" 5
    fi
    local service
    for service in "${START_ORDER[@]}"; do
        info "Starting $service ..."
        # --no-deps: start exactly this service; the loop decides the order.
        # --wait: return only when the service is running (and healthy, if it has a health check).
        compose up --detach --no-deps --wait --wait-timeout 180 "$service" > /dev/null \
            || die "The $service service did not start. Please run: ${CMD_ON}sudo docker compose -p $PROJECT logs $service${CMD_OFF}"
        info "$service is up and running."
    done
    if wait_healthy 60; then
        info "DentiSYS is running on port $(app_port)."
    else
        die "The services started but the application does not answer on port $(app_port)"
    fi
}

stop_app() {
    local i service
    if maintenance_on; then
        docker rm --force "$MAINT_CONTAINER" > /dev/null && info "Removed the maintenance page."
    fi
    if [ -f "$STATE_DIR/paused" ]; then
        die "DentiSYS is paused. Please run: ${CMD_ON}sudo ./dentisys-pause.sh${CMD_OFF} ${HL_ON}resume${HL_OFF}" 5
    fi
    # Walk START_ORDER backwards.
    for ((i = ${#START_ORDER[@]} - 1; i >= 0; i--)); do
        service="${START_ORDER[$i]}"
        info "Stopping $service ..."
        compose stop "$service" > /dev/null 2>&1 || die "Could not stop $service"
    done
    info "DentiSYS has stopped."
}

case "${1:-}" in
    --help|-h) usage; exit 0 ;;
    start|stop|restart) ;;
    "") usage >&2; exit 1 ;;
    *) echo "Unknown command: $1" >&2; usage >&2; exit 1 ;;
esac

need_root "$@"
need_cmd docker curl flock
[ -f "$ENV_FILE" ] && [ -f "$APP_DIR/release.env" ] || die "DentiSYS is not installed. Please run: ${CMD_ON}sudo ./dentisys-install.sh${CMD_OFF} first"
take_lock

case "$1" in
    start) start_app ;;
    stop) stop_app ;;
    restart) stop_app; start_app ;;
esac
