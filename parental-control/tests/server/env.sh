#!/bin/bash
# Shared settings of the real server test environment. Source this file from the other scripts.
# Everything heavy (Jellyfin server and web client built from source, File Transformation, media) lives outside the
# repository, in PC_TEST_DIR.
SERVER_TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SERVER_TESTS_DIR/../.." && pwd)"
export PC_TEST_DIR="${PC_TEST_DIR:-$HOME/.cache/parental-control-tests}"
export JF_BASE="${JF_BASE:-http://127.0.0.1:8096}"
export JELLYFIN_TAG="${JELLYFIN_TAG:-v12.2}"
export JELLYFIN_NUGET="${JELLYFIN_NUGET:-12.0.0}"
SRC="$PC_TEST_DIR/src"
SERVER_OUT="$PC_TEST_DIR/jf-server"
WEB_DIST="$SRC/jellyfin-web/dist"
DATA="$PC_TEST_DIR/jf-data"
PLUGINS="$DATA/data/plugins"
MEDIA="$PC_TEST_DIR/media"
JSON='Content-Type: application/json'
export NO_PROXY="127.0.0.1,localhost${NO_PROXY:+,$NO_PROXY}"

# curl against the test server, never through a proxy.
jf() { curl -s --noproxy '*' "$@"; }

# Prints an Authorization header for a user (empty password allowed).
jf_auth() {
    local device="pctest-$1" token
    token=$(jf -H "Authorization: MediaBrowser Client=\"PcTest\", Device=\"PcTest\", DeviceId=\"$device\", Version=\"1.0\"" -H "$JSON" \
        -X POST "$JF_BASE/Users/AuthenticateByName" -d "{\"Username\":\"$1\",\"Pw\":\"$2\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["AccessToken"])')
    echo "Authorization: MediaBrowser Client=\"PcTest\", Device=\"PcTest\", DeviceId=\"$device\", Version=\"1.0\", Token=\"$token\""
}
