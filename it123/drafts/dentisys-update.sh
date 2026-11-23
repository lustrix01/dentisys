#!/bin/bash
# update dentisys: dump the db, tar the app, unpack the new bundle, restart.
# this does NOT roll back if something breaks, it just prints where the backup is.
# usage: sudo ./dentisys-update.sh BUNDLE

set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
. "$HERE/dentisys-lib.sh"

[ $# -eq 1 ] || { echo "usage: sudo $0 BUNDLE" >&2; exit 1; }
bundle=$1

need_root "$@"
need_cmd docker tar
[ -f "$bundle" ] || die "cant find $bundle"
[ -f "$APP_DIR/release.env" ] || die "not installed, run dentisys-install.sh first"

old=$(env_get DENTISYS_VERSION "$APP_DIR/release.env")

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

echo "unpacking $bundle"
tar -xzf "$bundle" -C "$work" || die "cant unpack the bundle"
release=$(find "$work" -maxdepth 1 -type d -name 'dentisys-*' | head -1)
[ -n "$release" ] || die "no dentisys folder inside"
new=$(env_get DENTISYS_VERSION "$release/app/release.env")
[ -n "$new" ] || die "bundle has no version"

if [ "$new" = "$old" ]; then
    die "version $new is already installed"
fi

echo "updating $old -> $new"

# backup. TODO: check the tar after writing it, right now if it is corrupt we
# only find out when we need it
stamp=$(date +%Y%m%d-%H%M%S)
backup="$BACKUP_DIR/dentisys-backup-$stamp-v$old.tar.gz"
mkdir -p "$BACKUP_DIR"

echo "dumping the db"
compose exec -T db pg_dump -U "$(env_get DB_ADMIN_USER)" -d "$(env_get DB_NAME)" >"$work/db.dump"

echo "making the backup"
umask 077
tar -czf "$backup" -C / "${APP_DIR#/}" -C "$work" db.dump
umask 022
echo "backup: $backup"

# apply
echo "loading images"
docker load -i "$release/images.tar"

echo "copying files"
cp -a "$release/app/." "$APP_DIR/"

echo "restarting everything"
# TODO: migrations. we do not run them here at all yet, the init script only
# runs on an empty database so a real update probably will not migrate anything
compose down
compose up -d --wait

sleep 5
if app_healthy; then
    echo
    echo "updated to $new and responding"
else
    echo
    echo "UPDATED BUT BROKEN: $new does not answer"
    echo "backup is $backup"
    echo "restore by hand, we have not scripted this yet"
    exit 1
fi
