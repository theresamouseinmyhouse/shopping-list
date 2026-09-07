#!/bin/sh
# Build the image locally and (re)create the container.
# Prefer `docker compose up -d` for the prebuilt image; this is the build-from-source path.
set -e
cd "$(dirname "$0")"

# On Git Bash / MSYS, stop the "/data" mount target being path-mangled.
: "${MSYS_NO_PATHCONV:=1}"
export MSYS_NO_PATHCONV

docker build -t list:local .
docker rm -f listapp 2>/dev/null || true

mkdir -p ./data
[ -f ./list.env ] && ENVOPT="--env-file $PWD/list.env" || ENVOPT=""

docker run -d --name listapp --restart unless-stopped \
  -p 2120:3000 \
  $ENVOPT \
  -v "$PWD/data:/data" \
  list:local

echo "listapp up on http://localhost:2120 — logs: docker logs -f listapp"
