#!/bin/bash
# dentisys-update.sh - back up DentiSYS, apply an update bundle, and check that it
# still works.
#
# 1. Checks the new bundle (checksums) before touching anything.
# 2. Backs up the application files (/opt/dentisys) and a database dump into one
#    dated .tar.gz in /var/backups/dentisys, then verifies the archive.
# 3. Applies the update: loads the new images, copies the new files, runs pending
#    database migrations, and recreates the containers.
# 4. Checks that the application answers and its database is up. If not, it stops
#    and prints the exact commands to restore the backup by hand. It does not
#    undo the update by itself (Project Guide 3.3).
#
# Authors: IT 123 Group 07 (BSIT 4-B), DentiSYS
# AI use: drafted with Claude Code (Anthropic, Claude Opus 5.5) from our own first
#          version (written by the group, without AI, on 2026-11-23), then reviewed, run and
#          explained line by line by the group. The submitted code is AI-assisted;
#          the member wrote the messages on lines 54, 56, 57 and 58 and Claude
#          corrected and reworded them. README 7.
#
# Usage: sudo ./dentisys-update.sh BUNDLE   (see --help)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/dentisys-lib.sh"

usage() {
    cat << EOF
Usage: sudo $(basename "$0") BUNDLE

Back up DentiSYS, apply the update in BUNDLE (a dentisys-VERSION.tar.gz made by
dentisys-bundle.sh), and check that the application still works.

Exit status: 0 updated and working, 1 error before any change,
             7 update applied but the check failed (restore by hand; see the message).

Examples:
  sudo ./dentisys-update.sh /home/admin/dentisys-1.1.tar.gz
  sudo ./dentisys-update.sh /home/admin/dentisys-1.1-broken.tar.gz   # the demo
EOF
}

case "${1:-}" in
    --help|-h) usage; exit 0 ;;
    "") usage >&2; exit 1 ;;
esac
bundle="$1"

# --- Checks before any work -------------------------------------------------
need_root "$@"
need_cmd docker tar gzip sha256sum curl flock
[ -f "$bundle" ] || die "bundle not found: $bundle"
[ -f "$APP_DIR/release.env" ] || die "DentiSYS is not installed. Please run: ${CMD_ON}sudo ./dentisys-install.sh${CMD_OFF} first"
take_lock
[ ! -f "$STATE_DIR/paused" ] || die "DentiSYS is paused. Please run: ${CMD_ON}sudo ./dentisys-pause.sh${CMD_OFF} ${HL_ON}resume${HL_OFF}" 5
maintenance_on && die "Maintenance mode is on. Please run: ${CMD_ON}sudo ./dentisys-maintenance.sh${CMD_OFF} ${HL_ON}off${HL_OFF} first" 5
app_running || die "DentiSYS is not running, so the database cannot be backed up. Please run: ${CMD_ON}sudo ./dentisys-service.sh${CMD_OFF} ${HL_ON}start${HL_OFF} first"

stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$LOG_DIR"
log="$LOG_DIR/update-$stamp.log"
: > "$log" && chmod 640 "$log"
exec > >(tee -a "$log") 2>&1

old_version="$(env_get DENTISYS_VERSION "$APP_DIR/release.env")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

info "Checking the update bundle $bundle ..."
tar -xzf "$bundle" -C "$work" || die "the bundle is damaged (tar could not read it)"
release_dir="$(find "$work" -mindepth 1 -maxdepth 1 -type d -name 'dentisys-*' | head -n 1)"
[ -n "$release_dir" ] || die "the bundle has no dentisys-VERSION folder"
(cd "$release_dir" && sha256sum --check --quiet SHA256SUMS) || die "checksum mismatch: the bundle is incomplete or changed"
new_version="$(env_get DENTISYS_VERSION "$release_dir/app/release.env")"
[ -n "$new_version" ] || die "the bundle has no version"
[ "$new_version" != "$old_version" ] || die "version $new_version is already installed"
info "Update: $old_version -> $new_version"

# --- Automatic backup -------------------------------------------------------
backup="$BACKUP_DIR/dentisys-backup-$stamp-v$old_version.tar.gz"
install -d -m 700 "$BACKUP_DIR"
info "Backing up the database ..."
compose exec -T db pg_dump -U "$(env_get DB_ADMIN_USER)" -d "$(env_get DB_NAME)" -Fc > "$work/db.dump" \
    || die "the database backup failed; nothing was changed"
[ -s "$work/db.dump" ] || die "the database backup is empty; nothing was changed"

info "Archiving the application files and the database dump ..."
umask 077
tar -czf "$backup" -C / "${APP_DIR#/}" -C "$work" db.dump || die "could not write $backup; nothing was changed"
umask 022
# Verify: gzip can read it all, and the two key members are inside.
gzip -t "$backup" || die "backup verification failed (gzip); nothing was changed"
members="$(tar -tzf "$backup")"
echo "$members" | grep -qx "${APP_DIR#/}/release.env" || die "backup verification failed (no release.env); nothing was changed"
echo "$members" | grep -qx "db.dump" || die "backup verification failed (no db.dump); nothing was changed"
sha256sum "$backup" > "$backup.sha256"
chmod 600 "$backup" "$backup.sha256"
info "Backup verified: $backup ($(du -h "$backup" | cut -f 1), $(echo "$members" | wc -l) files)"

# --- Apply the update -------------------------------------------------------
failed() {
    local db_container
    db_container="$(compose ps --format '{{.Name}}' db)"
    echo
    echo "======================================================================"
    echo "UPDATE FAILED: DentiSYS $new_version does not work ($1)."
    echo "The update was NOT undone. Restore the backup by hand:"
    echo
    echo "  1. Put back the application files of version $old_version:"
    echo "     ${CMD_ON}sudo rm -rf $APP_DIR && sudo tar -xzf $backup -C / ${APP_DIR#/}${CMD_OFF}"
    echo "  2. Put back the database as it was before the update:"
    echo "     ${CMD_ON}sudo tar -xzOf $backup db.dump | sudo docker exec -i ${db_container:-dentisys-db-1} pg_restore --clean --if-exists -U $(env_get DB_ADMIN_USER) -d $(env_get DB_NAME)${CMD_OFF}"
    echo "  3. Restart version $old_version and check it:"
    echo "     ${CMD_ON}sudo $SCRIPT_DIR/dentisys-service.sh restart && sudo $SCRIPT_DIR/dentisys-status.sh${CMD_OFF}"
    echo
    echo "Backup checksum: $backup.sha256   Log: $log"
    echo "======================================================================"
    exit 7
}

info "Loading the new Docker images ..."
docker load --input "$release_dir/images.tar" | grep -E '^Loaded image' || die "docker load failed; nothing was changed"

info "Copying the new application files ..."
cp -a "$release_dir/app/." "$APP_DIR/"
set_app_permissions

info "Applying pending database migrations ..."
compose exec -T db sh /docker-entrypoint-initdb.d/001-migrations.sh > /dev/null || failed "a database migration failed"

info "Recreating the containers with version $new_version ..."
compose up --detach --wait --wait-timeout 90 > /dev/null 2>&1 || failed "the containers did not become healthy"

info "Checking that the application answers ..."
wait_healthy 60 || failed "the health check at http://127.0.0.1:$(app_port)/healthcheck.php did not pass"

echo
echo "SUCCESS: DentiSYS updated from $old_version to $new_version and responding. Backup: $backup"
