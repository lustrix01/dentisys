#!/bin/bash
# build the offline bundle on the dev PC. run from the repo root.
# usage: scripts/dentisys-bundle.sh VERSION

set -euo pipefail

HERE=$(cd "$(dirname "$0")/.." && pwd)

[ $# -eq 1 ] || { echo "usage: $0 VERSION" >&2; exit 1; }
version=$1

[ -f docker-compose.web.yml ] || { echo "run this from the repo root" >&2; exit 1; }

web=dentisys-web:$version
front=dentisys-frontend:$version
bio=dentisys-biometric:$version
models=(face_landmarker.task face_detection_yunet_2023mar.onnx face_recognition_sface_2021dec.onnx)
assets=../dentisys-biometric-assets

echo "building $version"
docker build --quiet --target runtime -t "$web" .
docker build --quiet --target production -t "$front" frontend
docker build --quiet -t "$bio" biometric-sidecar

# these two are not ours
docker pull -q postgres:18
docker pull -q axllent/mailpit:v1.27

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
root="$stage/dentisys-$version"
mkdir -p "$root/app/database" "$root/app/assets" "$root/app/maintenance"

cp docker-compose.web.yml docker-compose.database.yml "$root/app/"
# TODO: only init.sql for now. the migrations folder exists in the repo but
# nothing runs it yet, see dentisys-update.sh
cp database/init.sql "$root/app/database/"
for m in "${models[@]}"; do
    cp "$assets/$m" "$root/app/assets/"
done
cp "$HERE/files/maintenance.conf" "$HERE/files/index.html" "$root/app/maintenance/"

cat >"$root/app/release.env" <<EOF
DENTISYS_VERSION=$version
WEB_IMAGE=$web
FRONTEND_IMAGE=$front
BIOMETRIC_IMAGE=$bio
MEDIAPIPE_FACE_LANDMARKER_MODEL_HOST_PATH=/opt/dentisys/assets/face_landmarker.task
BIOMETRIC_YUNET_MODEL_HOST_PATH=/opt/dentisys/assets/face_detection_yunet_2023mar.onnx
BIOMETRIC_SFACE_MODEL_HOST_PATH=/opt/dentisys/assets/face_recognition_sface_2021dec.onnx
EOF

echo "saving images, slow part"
docker save -o "$root/images.tar" "$web" "$front" "$bio" postgres:18 axllent/mailpit:v1.27

# checksums so we can tell a cut off download from a good one
(cd "$root" && find app images.tar -type f -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS)

mkdir -p "$HERE/dist"
tar -czf "$HERE/dist/dentisys-$version.tar.gz" -C "$stage" "dentisys-$version"
echo "done: $HERE/dist/dentisys-$version.tar.gz"
