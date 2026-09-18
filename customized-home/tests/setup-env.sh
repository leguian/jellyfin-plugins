#!/bin/bash
# One-time setup: builds a Jellyfin server and web client from source, the third-party plugins used in the
# tests (File Transformation, Plugin Pages, Home Screen Sections), generates sample media and installs
# Playwright. Requires: dotnet SDK 10, node >= 24 with npm >= 11, ffmpeg, git, python3.
# Usage: tests/setup-env.sh [--skip-web] [--skip-server] [--skip-plugins]
source "$(dirname "$0")/env.sh"
set -eo pipefail
mkdir -p "$SRC" "$DATA"/{config,data,cache,log} "$MEDIA"
SKIP_WEB=0; SKIP_SERVER=0; SKIP_PLUGINS=0
for arg in "$@"; do case "$arg" in --skip-web) SKIP_WEB=1;; --skip-server) SKIP_SERVER=1;; --skip-plugins) SKIP_PLUGINS=1;; esac; done

clone() { [ -d "$SRC/$2" ] || git clone -q --depth 1 --branch "$3" "$1" "$SRC/$2"; }
clone https://github.com/jellyfin/jellyfin jellyfin "$JELLYFIN_BRANCH"
clone https://github.com/jellyfin/jellyfin-web jellyfin-web "$JELLYFIN_BRANCH"
clone https://github.com/IAmParadox27/jellyfin-plugin-file-transformation file-transformation main
clone https://github.com/IAmParadox27/jellyfin-plugin-pages plugin-pages main
clone https://github.com/IAmParadox27/jellyfin-plugin-home-sections home-sections main

if [ "$SKIP_SERVER" = 0 ]; then
    echo "== building Jellyfin server ($JELLYFIN_BRANCH)"
    dotnet publish "$SRC/jellyfin/Jellyfin.Server/Jellyfin.Server.csproj" -c Release -o "$SERVER_OUT" --nologo -v q
fi

if [ "$SKIP_WEB" = 0 ]; then
    echo "== building jellyfin-web ($JELLYFIN_BRANCH), takes a few minutes"
    (cd "$SRC/jellyfin-web" && npm ci --no-audit --no-fund && NODE_OPTIONS=--max-old-space-size=6144 npm run build:production)
fi

if [ "$SKIP_PLUGINS" = 0 ]; then
    echo "== building third-party plugins against Jellyfin $JELLYFIN_NUGET"
    build_plugin() {
        dotnet build "$1" -c Release -p:JellyfinVersion="$JELLYFIN_NUGET" -o "$CH_TEST_DIR/plugins-build/$2" --nologo -v q
        mkdir -p "$PLUGINS/$3"
        cp "$CH_TEST_DIR/plugins-build/$2"/*.dll "$CH_TEST_DIR/plugins-build/$2"/*.deps.json "$PLUGINS/$3/"
        cat > "$PLUGINS/$3/meta.json" <<META
{"category":"General","changelog":"","description":"$3","guid":"$4","name":"$3","overview":"","owner":"IAmParadox27","targetAbi":"${JELLYFIN_NUGET%%.*}.0.0.0","timestamp":"2026-01-01T00:00:00Z","version":"1.0.0.0","status":0,"autoUpdate":false,"imagePath":""}
META
    }
    build_plugin "$SRC/file-transformation/src/Jellyfin.Plugin.FileTransformation/Jellyfin.Plugin.FileTransformation.csproj" ft FileTransformation 5e87cc92-571a-4d8d-8d98-d2d4147f9f90
    # Plugin Pages and Home Screen Sections are staged in $CH_TEST_DIR/stage: tests/enable-hss.sh installs them.
    PLUGINS_SAVE="$PLUGINS"; PLUGINS="$CH_TEST_DIR/stage"
    build_plugin "$SRC/plugin-pages/src/Jellyfin.Plugin.PluginPages/Jellyfin.Plugin.PluginPages.csproj" pages PluginPages 5b6550fa-a014-4f4c-8a2c-59a43680ac6d
    build_plugin "$SRC/home-sections/src/Jellyfin.Plugin.HomeScreenSections/Jellyfin.Plugin.HomeScreenSections.csproj" hss HomeScreenSections b8298e01-2697-407a-b44d-aa8dc795e850
    PLUGINS="$PLUGINS_SAVE"
fi

echo "== sample media"
gen() { [ -f "$1" ] || ffmpeg -y -loglevel error -f lavfi -i "testsrc=size=320x180:rate=10" -f lavfi -i "sine=frequency=440" -t 2 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$1"; }
for m in "Alpha (2020)" "Bravo (2021)" "Charlie (2022)" "Delta (2023)" "Echo (2024)" "Foxtrot (2019)"; do mkdir -p "$MEDIA/movies/$m"; gen "$MEDIA/movies/$m/$m.mp4"; done
for s in "Series One" "Series Two" "Series Three"; do for e in 1 2 3; do mkdir -p "$MEDIA/shows/$s/Season 01"; gen "$MEDIA/shows/$s/Season 01/$s - S01E0$e.mp4"; done; done

echo "== playwright"
(cd "$PW" && npm install --no-audit --no-fund && npx playwright install chromium)
echo "done. Next: tests/install-plugin.sh && tests/restart-server.sh && tests/api-test.sh"
