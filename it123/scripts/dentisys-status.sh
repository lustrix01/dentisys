#!/bin/bash
# dentisys-status.sh - report whether DentiSYS is running, which port it listens
# on, and how much CPU and memory it uses.
#
# Shows each service's state, the listening port (from ss), the health check
# answer, CPU and memory per container (docker stats), and the server's load,
# memory (free) and disk (df). --watch repeats the report; --save also writes it
# to a dated report file in /var/log/dentisys.
#
# Authors: IT 123 Group 07 (BSIT 4-B), DentiSYS
# AI use: drafted with Claude Code (Anthropic, Claude Opus 5.5) from our own first
#          version (written by the group, without AI, on 2026-11-23), then reviewed, run and
#          explained line by line by the group. The submitted code is AI-assisted;
#          the member wrote the message on line 61 and Claude corrected and reworded
#          it. README 7.
#
# Usage: sudo ./dentisys-status.sh [--watch SECONDS] [--count N] [--save]   (see --help)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/dentisys-lib.sh"

usage() {
    cat << EOF
Usage: sudo $(basename "$0") [OPTIONS]

Report whether DentiSYS is running, its port, and its CPU and memory use.

Options:
  --watch SECONDS   repeat the report every SECONDS seconds (Ctrl+C to stop)
  --count N         with --watch, stop after N reports
  --save            also write the report to $LOG_DIR/status-DATE.txt
  --help            show this message

Exit status: 0 running and healthy, 1 error, 6 not running or not healthy.

Examples:
  sudo ./dentisys-status.sh
  sudo ./dentisys-status.sh --watch 5 --count 3
EOF
}

interval=0
count=0
save=no
while [ "$#" -gt 0 ]; do
    case "$1" in
        --help|-h) usage; exit 0 ;;
        --watch) interval="${2:?--watch needs seconds}"; shift ;;
        --count) count="${2:?--count needs a number}"; shift ;;
        --save) save=yes ;;
        *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
    esac
    shift
done
echo "$interval$count" | grep -Eq '^[0-9]+$' || die "--watch and --count take whole numbers"

need_root "$@"
need_cmd docker curl ss df free
[ -f "$ENV_FILE" ] || die "DentiSYS is not installed. Please run: ${CMD_ON}sudo ./dentisys-install.sh${CMD_OFF} first"

report() {
    local port state healthy=no
    port="$(app_port)"
    echo "=== DentiSYS status, $(date '+%Y-%m-%d %H:%M:%S') ==="
    echo "Version: $(env_get DENTISYS_VERSION "$APP_DIR/release.env")"

    if maintenance_on; then
        echo "Mode:    MAINTENANCE (users see the 'temporarily unavailable' page)"
    elif [ -f "$STATE_DIR/paused" ]; then
        echo "Mode:    PAUSED (processes frozen with kill -STOP)"
    fi

    echo
    echo "--- Services ---"
    compose ps --all --format 'table {{.Service}}\t{{.State}}\t{{.Status}}'

    echo
    echo "--- Listening port ---"
    # ss lists listening TCP sockets; keep only the application's port.
    if ss -ltnH | awk '{print $4}' | grep -Eq "[:.]${port}\$"; then
        echo "Listening on TCP port $port (http://$(hostname -I | awk '{print $1}'):$port)"
    else
        echo "Nothing is listening on TCP port $port"
    fi

    echo
    echo "--- Health check ---"
    if app_healthy; then
        echo "Application answers and the database is up."
        healthy=yes
    else
        echo "Application does NOT answer (or its database is down)."
    fi

    echo
    echo "--- CPU and memory per container ---"
    state="$(compose ps --status running --quiet)"
    if [ -n "$state" ]; then
        # shellcheck disable=SC2086  # one container id per word is intended
        docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' $state
    else
        echo "No DentiSYS container is running."
    fi

    echo
    echo "--- Server ---"
    echo "Load average (1, 5, 15 min): $(cut -d ' ' -f 1-3 /proc/loadavg)"
    free -h | grep -E '^(Mem|Swap):'
    df -h / /var/lib/docker 2> /dev/null | grep -Ev '^Filesystem' | sort -u \
        | awk '{print "Disk " $6 ": " $3 " used of " $2 " (" $5 ")"}'

    [ "$healthy" = yes ]
}

run_once() {
    if [ "$save" = yes ]; then
        local file
        file="$LOG_DIR/status-$(date +%Y%m%d-%H%M%S).txt"
        report | tee "$file"
        local result="${PIPESTATUS[0]}"
        chmod 640 "$file"
        echo "(saved to $file)"
        return "$result"
    fi
    report
}

if [ "$interval" -eq 0 ]; then
    run_once && exit 0 || exit 6
fi

n=0
status=0
while true; do
    run_once && status=0 || status=6
    n=$((n + 1))
    if [ "$count" -gt 0 ] && [ "$n" -ge "$count" ]; then
        break
    fi
    echo
    sleep "$interval"
done
exit "$status"
