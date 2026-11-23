#!/bin/bash
# freeze the app with kill -STOP, unfreeze with kill -CONT.
# db is left alone on purpose so nothing is written half way.
# usage: sudo ./dentisys-pause.sh pause|resume

set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
. "$HERE/dentisys-lib.sh"

# the app containers, not the db
APP_SERVICES=(frontend web biometric)

case ${1:-} in
    pause|resume) ;;
    *) echo "usage: sudo $0 pause|resume" >&2; exit 1 ;;
esac

need_root "$@"
need_cmd docker kill

# host pids of everything running inside those three containers
app_pids() {
    local s id
    for s in "${APP_SERVICES[@]}"; do
        id=$(compose ps -q "$s")
        [ -n "$id" ] || continue
        docker top "$id" -eo pid | tail -n +2
    done
}

pids=$(app_pids)
[ -n "$pids" ] || die "no dentisys processes, is it running?"

if [ "$1" = pause ]; then
    for pid in $pids; do
        kill -STOP "$pid"
    done
    echo "paused $(echo "$pids" | wc -l) processes"
else
    for pid in $pids; do
        kill -CONT "$pid"
    done
    echo "resumed $(echo "$pids" | wc -l) processes"
fi
