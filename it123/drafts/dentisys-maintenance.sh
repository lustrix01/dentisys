#!/bin/bash
# put a "down for maintenance" page on the app port and take it off again.
# stop the frontend, run a tiny nginx on the same port instead.
# usage: sudo ./dentisys-maintenance.sh on|off

set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
. "$HERE/dentisys-lib.sh"

PAGE_DIR="$APP_DIR/maintenance"
LIVE=/var/lib/dentisys/maintenance

case ${1:-} in
    on|off) ;;
    *) echo "usage: sudo $0 on|off" >&2; exit 1 ;;
esac

need_root "$@"
need_cmd docker
[ -f "$ENV_FILE" ] || die "not installed, run dentisys-install.sh first"

port=$(app_port)

if [ "$1" = on ]; then
    mkdir -p "$LIVE"
    cp "$PAGE_DIR/maintenance.conf" "$LIVE/default.conf"
    # TODO: the html is static right now, no way to put a message or return time
    cp "$PAGE_DIR/index.html" "$LIVE/index.html"
    chmod 755 "$LIVE"
    chmod 644 "$LIVE/default.conf" "$LIVE/index.html"

    echo "stopping the frontend"
    compose stop frontend || die "cant stop the frontend"

    echo "starting the maintenance page on $port"
    docker run -d --name dentisys-maintenance --restart unless-stopped \
        -p "$port:80" \
        -v "$LIVE/default.conf:/etc/nginx/conf.d/default.conf:ro" \
        -v "$LIVE/index.html:/usr/share/nginx/maintenance/index.html:ro" \
        "$(env_get FRONTEND_IMAGE "$APP_DIR/release.env")"

    # TODO: check that it actually answers 503, right now we just assume it did
    echo "maintenance page is on"
else
    echo "removing the maintenance page"
    docker rm -f dentisys-maintenance || true
    echo "starting the frontend again"
    compose up -d --no-deps frontend
fi
