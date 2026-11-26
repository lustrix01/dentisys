#!/bin/bash
# dentisys-bundle.sh - build an offline release bundle of DentiSYS on the developer's PC.
#
# The bundle holds everything the server needs, so installing and updating never
# downloads anything: the Docker images (docker save), the Compose files, the
# database scripts, the face-recognition model files and the maintenance page.
# This is a helper for the six toolkit scripts; it is run on the developer's PC
# (Git Bash or WSL with Docker), not on the server.
#
# Authors: IT 123 Group 07 (BSIT 4-B), DentiSYS
# AI use: drafted with Claude Code (Anthropic, Claude Opus 5.5) from our own first
#          version (written by the group, without AI, on 2026-11-23), then reviewed, run and
#          explained line by line by the group. The submitted code is AI-assisted.
#          README 7.
#
# Usage: it123/scripts/dentisys-bundle.sh [--broken] [--assets DIR] [--output DIR] VERSION
#   Run from the root of the DentiSYS repository. See --help.

set -euo pipefail

TOOLKIT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] VERSION

Build dentisys-VERSION.tar.gz, an offline release bundle for dentisys-install.sh
and dentisys-update.sh. Run it from the root of the DentiSYS repository.

Options:
  --broken        make a deliberately broken update (the backend is pointed at a
                  database host that does not exist) for the update demo
  --assets DIR    folder with the three face-recognition model files
                  (default: ../dentisys-biometric-assets)
  --output DIR    where to write the bundle (default: it123/dist)
  --help          show this message

Examples:
  it123/scripts/dentisys-bundle.sh 1.0
  it123/scripts/dentisys-bundle.sh --broken 1.1-broken
EOF
}

broken=no
assets_dir="../dentisys-biometric-assets"
output_dir="$TOOLKIT_DIR/dist"
version=""

while [ "$#" -gt 0 ]; do
    case "$1" in
        --help) usage; exit 0 ;;
        --broken) broken=yes ;;
        --assets) assets_dir="${2:?--assets needs a folder}"; shift ;;
        --output) output_dir="${2:?--output needs a folder}"; shift ;;
        -*) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
        *) version="$1" ;;
    esac
    shift
done

[ -n "$version" ] || { echo "ERROR: VERSION is missing." >&2; usage >&2; exit 1; }
echo "$version" | grep -Eq '^[A-Za-z0-9._-]+$' || { echo "ERROR: VERSION may use only letters, digits, . _ and -" >&2; exit 1; }

# Check what the script needs before doing any work.
for cmd in docker tar gzip sha256sum; do
    command -v "$cmd" > /dev/null 2>&1 || { echo "ERROR: required command not found: $cmd" >&2; exit 3; }
done
[ -f docker-compose.web.yml ] && [ -d database/migrations ] || { echo "ERROR: run this from the root of the DentiSYS repository." >&2; exit 1; }
models=(face_landmarker.task face_detection_yunet_2023mar.onnx face_recognition_sface_2021dec.onnx)
for model in "${models[@]}"; do
    [ -f "$assets_dir/$model" ] || { echo "ERROR: model file not found: $assets_dir/$model" >&2; exit 1; }
done

web_image="dentisys-web:$version"
frontend_image="dentisys-frontend:$version"
biometric_image="dentisys-biometric:$version"
third_party_images=(postgres:18 axllent/mailpit:v1.27)

echo "Building the DentiSYS images for version $version ..."
docker build --quiet --target runtime --tag "$web_image" . > /dev/null
docker build --quiet --target production --tag "$frontend_image" frontend > /dev/null
docker build --quiet --tag "$biometric_image" biometric-sidecar > /dev/null
for image in "${third_party_images[@]}"; do
    docker image inspect "$image" > /dev/null 2>&1 || docker pull --quiet "$image" > /dev/null
done

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
root="$stage/dentisys-$version"
mkdir -p "$root/app/database" "$root/app/assets" "$root/app/maintenance"

echo "Collecting the application files ..."
cp docker-compose.web.yml docker-compose.database.yml "$root/app/"
cp -r database/init.sql database/apply-migrations.sh database/migrations "$root/app/database/"
for model in "${models[@]}"; do
    cp "$assets_dir/$model" "$root/app/assets/"
done
cp "$TOOLKIT_DIR/files/maintenance.conf" "$TOOLKIT_DIR/files/index.html" "$root/app/maintenance/"

# release.env: which images this version runs and where the model files are.
cat > "$root/app/release.env" << EOF
DENTISYS_VERSION=$version
WEB_IMAGE=$web_image
FRONTEND_IMAGE=$frontend_image
BIOMETRIC_IMAGE=$biometric_image
MEDIAPIPE_FACE_LANDMARKER_MODEL_HOST_PATH=/opt/dentisys/assets/face_landmarker.task
BIOMETRIC_YUNET_MODEL_HOST_PATH=/opt/dentisys/assets/face_detection_yunet_2023mar.onnx
BIOMETRIC_SFACE_MODEL_HOST_PATH=/opt/dentisys/assets/face_recognition_sface_2021dec.onnx
EOF

if [ "$broken" = yes ]; then
    # The deliberate fault: the backend looks for a database host that does not exist.
    sed -i 's/DB_HOST: db$/DB_HOST: db-does-not-exist/' "$root/app/docker-compose.web.yml"
    grep -q 'DB_HOST: db-does-not-exist' "$root/app/docker-compose.web.yml" || { echo "ERROR: could not insert the deliberate fault." >&2; exit 1; }
    echo "BROKEN bundle: the backend will not reach the database."
fi

echo "Saving the Docker images (this takes a few minutes) ..."
docker save --output "$root/images.tar" "$web_image" "$frontend_image" "$biometric_image" "${third_party_images[@]}"

# Checksums let the server prove the bundle arrived complete.
(cd "$root" && find app images.tar -type f -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)

mkdir -p "$output_dir"
bundle="$output_dir/dentisys-$version.tar.gz"
tar -czf "$bundle" -C "$stage" "dentisys-$version"
gzip -t "$bundle" && echo "Bundle ready: $bundle ($(du -h "$bundle" | cut -f 1))"
