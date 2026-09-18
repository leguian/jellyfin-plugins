#!/bin/bash
# Runs the test Jellyfin server in the foreground.
source "$(dirname "$0")/env.sh"
cd "$SERVER_OUT"
exec dotnet jellyfin.dll --datadir "$DATA/data" --configdir "$DATA/config" --cachedir "$DATA/cache" --logdir "$DATA/log" --webdir "$WEB_DIST" --ffmpeg "$(command -v ffmpeg)"
