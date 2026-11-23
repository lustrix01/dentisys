#!/bin/bash
# start/stop dentisys. the order matters, db before web.
# usage: sudo ./dentisys-service.sh start|stop|restart

set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
. "$HERE/dentisys-lib.sh"

case ${1:-} in
    start|stop|restart) ;;
    *) echo "usage: sudo $0 start|stop|restart" >&2; exit 1 ;;
esac

need_root "$@"
need_cmd docker
[ -f "$ENV_FILE" ] || die "not installed, run dentisys-install.sh first"

start_app() {
    local s
    for s in "${START_ORDER[@]}"; do
        echo "starting $s"
        compose up -d --no-deps --wait --wait-timeout 180 "$s" || die "$s wont start"
    done
    echo "all containers up"
}

stop_app() {
    local i s
    for ((i = ${#START_ORDER[@]} - 1; i >= 0; i--)); do
        s=${START_ORDER[$i]}
        echo "stopping $s"
        compose stop "$s"
    done
}

case $1 in
    start) start_app ;;
    stop) stop_app ;;
    restart) stop_app; start_app ;;
esac
