#!/bin/sh
# Dev copy of the app — a second container `listapp-dev` on port 2121 with its own
# SQLite DB at ./data-dev, so testing never touches the real grocery list (./data).
# First run seeds ./data-dev from a snapshot of ./data so there's realistic catalog
# data; after that the two are independent.
set -e
cd "$(dirname "$0")"

: "${MSYS_NO_PATHCONV:=1}"
export MSYS_NO_PATHCONV
HOSTPWD="$(pwd -W 2>/dev/null || pwd)"

docker build -t list:local .
docker rm -f listapp-dev 2>/dev/null || true

if [ ! -f ./data-dev/list.db ] && [ ! -f ./data-dev/list.db-wal ]; then
  mkdir -p ./data-dev
  [ -f ./data/list.db ] && cp ./data/list.db* ./data-dev/ 2>/dev/null || true
  echo "seeded ./data-dev from ./data"
fi

[ -f ./list.env ] && ENVOPT="--env-file $HOSTPWD/list.env" || ENVOPT=""

docker run -d --name listapp-dev --restart unless-stopped \
  -p 2121:3000 \
  $ENVOPT \
  -v "$HOSTPWD/data-dev:/data" \
  list:local

echo "listapp-dev up on http://localhost:2121 (real app stays on :2120)"
