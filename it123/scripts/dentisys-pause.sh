#!/bin/bash
# dentisys-pause.sh - freeze DentiSYS's processes with kill -STOP and resume them
# with kill -CONT.
#
# Every process of the application containers (web front end, backend, face
# recognition sidecar) is sent SIGSTOP; nothing answers until "resume" sends
# SIGCONT. The database keeps running so no write is cut in half. This is NOT
# maintenance mode: while paused, the server does not answer at all.
#
# Authors: IT 123 Group 07 (BSIT 4-B), DentiSYS
# AI use: drafted with Claude Code (Anthropic, Claude Opus 5.5) from our own first
#          version (written by the group, without AI, on 2026-11-23), then reviewed, run and
#          explained line by line by the group. The submitted code is AI-assisted;
#          the member wrote the messages on lines 83 and 101 and Claude corrected and
#          reworded them. README 7.
#
# Usage: sudo ./dentisys-pause.sh pause|resume|status   (see --help)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/dentisys-lib.sh"

usage() {
    cat << EOF
Usage: sudo $(basename "$0") COMMAND

Commands:
  pause     send SIGSTOP (kill -STOP) to every process of: ${APP_SERVICES[*]}
  resume    send SIGCONT (kill -CONT) to the same processes
  status    show each process and its state (T = stopped)
  --help    show this message

Examples:
  sudo ./dentisys-pause.sh pause
  sudo ./dentisys-pause.sh resume
EOF
}

# Print the host process IDs of every process inside the application containers.
app_pids() {
    local service id
    for service in "${APP_SERVICES[@]}"; do
        id="$(compose ps --quiet "$service")"
        [ -n "$id" ] || continue
        # docker top lists the container's processes with their PIDs on the host.
        docker top "$id" -eo pid | tail -n +2
    done
}

# Send one signal (STOP or CONT) to every application process.
signal_all() {
    local signal="$1" pid sent=0
    for pid in $(app_pids); do
        kill "-$signal" "$pid" && sent=$((sent + 1))
    done
    [ "$sent" -gt 0 ] || die "no DentiSYS process found; is the application running?"
    info "Sent SIG$signal to $sent processes."
}

show_status() {
    local pids
    pids="$(app_pids | paste -sd, -)"
    [ -n "$pids" ] || die "no DentiSYS process found; is the application running?"
    # STAT starting with T means the process is stopped (paused).
    ps -o pid,stat,pcpu,rss,comm -p "$pids"
    if [ -f "$STATE_DIR/paused" ]; then
        echo "DentiSYS is PAUSED since $(cat "$STATE_DIR/paused")."
    else
        echo "DentiSYS is not paused."
    fi
}

case "${1:-}" in
    --help|-h) usage; exit 0 ;;
    pause|resume|status) ;;
    "") usage >&2; exit 1 ;;
    *) echo "Unknown command: $1" >&2; usage >&2; exit 1 ;;
esac

need_root "$@"
need_cmd docker kill ps paste
[ -f "$ENV_FILE" ] || die "DentiSYS is not installed. Please run: ${CMD_ON}sudo ./dentisys-install.sh${CMD_OFF} first"

case "$1" in
    pause)
        take_lock
        [ ! -f "$STATE_DIR/paused" ] || die "DentiSYS is already paused" 5
        signal_all STOP
        date '+%Y-%m-%d %H:%M:%S' > "$STATE_DIR/paused"
        info "DentiSYS is paused: requests to port $(app_port) now wait without an answer."
        ;;
    resume)
        take_lock
        [ -f "$STATE_DIR/paused" ] || echo "Note: no pause marker found; resuming anyway."
        signal_all CONT
        rm -f "$STATE_DIR/paused"
        if wait_healthy 30; then
            info "DentiSYS is resumed and answering."
        else
            die "The processes resumed, but the application does not answer yet. Please run: ${CMD_ON}sudo ./dentisys-status.sh${CMD_OFF}"
        fi
        ;;
    status) show_status ;;
esac
