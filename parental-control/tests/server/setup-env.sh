#!/bin/bash
# One-time setup: builds a Jellyfin server and web client from source (JELLYFIN_TAG), File Transformation, and
# generates sample media. Requires: dotnet SDK 10, node >= 24 with npm >= 11, ffmpeg, git, python3.
# Usage: tests/server/setup-env.sh [--skip-web]
source "$(dirname "$0")/env.sh"
set -eo pipefail
mkdir -p "$SRC" "$MEDIA"
clone() { [ -d "$SRC/$2" ] || git clone -q --depth 1 ${3:+--branch "$3"} "$1" "$SRC/$2"; }
clone https://github.com/jellyfin/jellyfin jellyfin "$JELLYFIN_TAG"
clone https://github.com/IAmParadox27/jellyfin-plugin-file-transformation file-transformation

echo "== Jellyfin server $JELLYFIN_TAG"
dotnet publish "$SRC/jellyfin/Jellyfin.Server/Jellyfin.Server.csproj" -c Release -o "$SERVER_OUT" --nologo -v q

if [ "$1" != "--skip-web" ]; then
    clone https://github.com/jellyfin/jellyfin-web jellyfin-web "$JELLYFIN_TAG"
    echo "== jellyfin-web $JELLYFIN_TAG (a few minutes)"
    # Without direct access to github.com tarballs, npm cannot fetch classlist.js: use a local clone instead.
    if ! (cd "$SRC/jellyfin-web" && npm ci --no-audit --no-fund); then
        clone https://github.com/eligrey/classList.js classListjs 1.2.20180112
        (cd "$SRC/jellyfin-web" && sed -i 's#"classlist.js": *"[^"]*"#"classlist.js": "file:../classListjs"#' package.json && npm install --no-audit --no-fund)
    fi
    (cd "$SRC/jellyfin-web" && NODE_OPTIONS=--max-old-space-size=6144 npm run build:production)
fi

echo "== File Transformation (optional: only the web client features need it)"
dotnet build "$SRC/file-transformation/src/Jellyfin.Plugin.FileTransformation/Jellyfin.Plugin.FileTransformation.csproj" -c Release \
    -p:JellyfinVersion="$JELLYFIN_NUGET" -o "$PC_TEST_DIR/plugins-build/ft" --nologo -v q || echo "File Transformation did not build for $JELLYFIN_NUGET"

echo "== sample media"
gen() { [ -f "$1" ] || ffmpeg -y -loglevel error -f lavfi -i "testsrc=size=320x180:rate=10" -f lavfi -i "sine=frequency=440" -t 2 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$1"; }
for m in "Alpha (2020)" "Bravo (2021)" "Charlie (2022)" "Delta (2023)" "Echo (2024)"; do mkdir -p "$MEDIA/movies/$m"; gen "$MEDIA/movies/$m/$m.mp4"; done
for s in "Bluey" "Peppa" "Breaking Bad"; do for e in 1 2 3; do mkdir -p "$MEDIA/shows/$s/Season 01"; gen "$MEDIA/shows/$s/Season 01/$s - S01E0$e.mp4"; done; done
echo "done. Next: tests/server/install-plugin.sh && tests/server/restart-server.sh && tests/server/api-test.sh"
