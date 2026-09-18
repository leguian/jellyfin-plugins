#!/bin/bash
# Shared settings for the Customized Home test environment. Source this file from the other scripts.
# Everything heavy (Jellyfin server and web client built from source, third-party plugins, media) lives
# outside the repository, in CH_TEST_DIR.
TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$TESTS_DIR/.." && pwd)"
REPO_DIR="$(cd "$PLUGIN_DIR/.." && pwd)"
export CH_TEST_DIR="${CH_TEST_DIR:-$HOME/.cache/customized-home-tests}"
export JF_BASE="${JF_BASE:-http://127.0.0.1:8096}"
export JF_ADMIN_USER="${JF_ADMIN_USER:-admin}"
export JF_ADMIN_PASS="${JF_ADMIN_PASS:-admin123}"
export JELLYFIN_BRANCH="${JELLYFIN_BRANCH:-release-12.z}"
export JELLYFIN_NUGET="${JELLYFIN_NUGET:-12.1.0}"
SRC="$CH_TEST_DIR/src"
SERVER_OUT="$CH_TEST_DIR/jf-server"
WEB_DIST="$SRC/jellyfin-web/dist"
DATA="$CH_TEST_DIR/jf-test"
PLUGINS="$DATA/data/plugins"
MEDIA="$CH_TEST_DIR/media"
PW="$TESTS_DIR/e2e"
AUTH_HEADER='Authorization: MediaBrowser Client="ChTest", Device="ChTest", DeviceId="chtest-1", Version="1.0"'
JSON='Content-Type: application/json'

# Prints an Authorization header value carrying a token for the admin user.
jf_token_header() {
    local token
    token=$(curl -s -H "$AUTH_HEADER" -H "$JSON" -X POST "$JF_BASE/Users/AuthenticateByName" \
        -d "{\"Username\":\"$JF_ADMIN_USER\",\"Pw\":\"$JF_ADMIN_PASS\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["AccessToken"])')
    echo "Authorization: MediaBrowser Client=\"ChTest\", Device=\"ChTest\", DeviceId=\"chtest-1\", Version=\"1.0\", Token=\"$token\""
}

jf_user_id() {
    curl -s -H "$1" "$JF_BASE/Users/Me" | python3 -c 'import sys,json;print(json.load(sys.stdin)["Id"])'
}
