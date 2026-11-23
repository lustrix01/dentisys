#!/bin/bash
# show what dentisys is doing. read only, changes nothing.
# usage: sudo ./dentisys-status.sh

set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
. "$HERE/dentisys-lib.sh"

need_root "$@"
need_cmd docker curl ss
[ -f "$ENV_FILE" ] || die "not installed, run dentisys-install.sh first"

port=$(app_port)

echo "=== dentisys, $(date) ==="
echo "version: $(env_get DENTISYS_VERSION "$APP_DIR/release.env")"

echo
echo "containers:"
compose ps

echo
echo "port $port:"
if ss -ltn | grep -q ":$port "; then
    echo "  listening"
else
    echo "  not listening"
fi

echo
echo "health:"
if app_healthy; then
    echo "  app answers"
else
    echo "  app does not answer"
fi

echo
echo "cpu/ram:"
docker stats --no-stream

if app_healthy; then
    exit 0
fi
exit 1
