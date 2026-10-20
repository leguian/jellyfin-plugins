#!/bin/bash
# Packages the plugin exactly like the release (scripts/package.py) and installs the zip, with File Transformation,
# into the plugin folder of the test server. Restart the server afterwards.
# LINE: server line of the package (12 or 10.11), matching the server built by setup-env.sh.
source "$(dirname "$0")/env.sh"
set -eo pipefail
LINE="${LINE:-12}"
REPO_DIR="$(cd "$PLUGIN_DIR/.." && pwd)"
SUMMARY=$(cd "$REPO_DIR" && PYTHONDONTWRITEBYTECODE=1 python3 scripts/package.py parental-control --jellyfin "$LINE" --output artifacts)
ZIP="$REPO_DIR/$(python3 -c 'import sys,json;print(json.loads(sys.argv[1])["file"])' "$SUMMARY")"
VERSION=$(python3 -c 'import sys,json;print(json.loads(sys.argv[1])["version"])' "$SUMMARY")
rm -rf "$PLUGINS"/ParentalControl_*
mkdir -p "$PLUGINS/ParentalControl_$VERSION"
(cd "$PLUGINS/ParentalControl_$VERSION" && unzip -qo "$ZIP")
echo "installed $(basename "$ZIP")"
FT_DLL="$PC_TEST_DIR/plugins-build/ft/Jellyfin.Plugin.FileTransformation.dll"
if [ ! -f "$FT_DLL" ]; then
    # api_test.py does not need it: only the web client features do.
    echo "File Transformation not built: the web client features are not injected"
    exit 0
fi
mkdir -p "$PLUGINS/FileTransformation"
cp "$FT_DLL" "$PLUGINS/FileTransformation/"
cat > "$PLUGINS/FileTransformation/meta.json" <<META
{"category":"General","changelog":"","description":"File Transformation","guid":"5e87cc92-571a-4d8d-8d98-d2d4147f9f90","name":"File Transformation","overview":"","owner":"IAmParadox27","targetAbi":"${JELLYFIN_NUGET}.0","timestamp":"2026-01-01T00:00:00Z","version":"1.0.0.0","status":0,"autoUpdate":false,"imagePath":""}
META
echo "installed File Transformation"
