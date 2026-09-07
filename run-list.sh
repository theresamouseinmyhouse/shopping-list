#!/bin/sh
# Build the image and (re)create the container. No compose needed, but there's a
# docker-compose.yml too if you prefer that.
set -e
cd "$(dirname "$0")"

# Paths are relative to this script's directory so it works wherever you clone it.
# On Git Bash / MSYS, MSYS_NO_PATHCONV stops the "/data" mount target being mangled.
: "${MSYS_NO_PATHCONV:=1}"
export MSYS_NO_PATHCONV

docker build -t list:local .
docker rm -f listapp 2>/dev/null || true

mkdir -p ./data
[ -f ./list.env ] || { echo "copy list.env.example to list.env first"; exit 1; }

docker run -d --name listapp --restart unless-stopped \
  -p 2120:3000 \
  --env-file "$PWD/list.env" \
  -v "$PWD/data:/data" \
  list:local

echo "listapp up on http://localhost:2120 — logs: docker logs -f listapp"
