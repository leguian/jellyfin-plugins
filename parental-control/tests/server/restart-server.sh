#!/bin/bash
# (Re)starts the test server in the background and waits for its API.
source "$(dirname "$0")/env.sh"
PID_FILE="$PC_TEST_DIR/server.pid"
if [ -f "$PID_FILE" ] && kill "$(cat "$PID_FILE")" 2>/dev/null; then
    sleep 3
fi
mkdir -p "$DATA"/{config,data,cache,log}
WEB_ARGS=(--nowebclient)
[ -d "$WEB_DIST" ] && WEB_ARGS=(--webdir "$WEB_DIST")
(cd "$SERVER_OUT" && nohup dotnet jellyfin.dll --datadir "$DATA/data" --configdir "$DATA/config" --cachedir "$DATA/cache" \
    --logdir "$DATA/log" "${WEB_ARGS[@]}" --ffmpeg "$(command -v ffmpeg)" > "$PC_TEST_DIR/server.out" 2>&1 & echo $! > "$PID_FILE")
for i in $(seq 1 120); do
    if jf "$JF_BASE/System/Info/Public" | grep -q '"Version"' && jf "$JF_BASE/Users/Public" | grep -q '^\['; then
        echo "server up after ${i}s"
        exit 0
    fi
    sleep 1
done
echo "the server did not start: $PC_TEST_DIR/server.out"
exit 1
