#!/bin/bash
# (Re)starts the test server in the background and waits until the API answers.
source "$(dirname "$0")/env.sh"
pkill -f "jellyfin.dll --datadir $DATA" 2>/dev/null || true
for i in $(seq 1 90); do
    if ! pgrep -f "jellyfin.dll --datadir $DATA" >/dev/null && ! lsof -iTCP:8096 -sTCP:LISTEN >/dev/null 2>&1; then break; fi
    sleep 1
done
sleep 2
nohup "$TESTS_DIR/run-server.sh" > "$CH_TEST_DIR/server-stdout.log" 2>&1 &
ok=0
for i in $(seq 1 180); do
    code=$(curl -s -o /dev/null -w "%{http_code}" "$JF_BASE/System/Info/Public" || true)
    if [ "$code" = "200" ]; then ok=$((ok+1)); else ok=0; fi
    [ $ok -ge 3 ] && break
    sleep 1
done
echo "server up (http $code), log: $DATA/log"
