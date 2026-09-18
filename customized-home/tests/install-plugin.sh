#!/bin/bash
# Builds the plugin and installs it into the test server's plugin folder (restart the server afterwards).
source "$(dirname "$0")/env.sh"
VERSION=$(sed -n 's/^version: *"\(.*\)"/\1/p' "$PLUGIN_DIR/build.yaml")
TARGET="$PLUGINS/CustomizedHome_$VERSION"
dotnet build "$PLUGIN_DIR/Jellyfin.Plugin.CustomizedHome/Jellyfin.Plugin.CustomizedHome.csproj" -c Release -p:JellyfinVersion="$JELLYFIN_NUGET" -p:Version="$VERSION" -o "$CH_TEST_DIR/plugins-build/customized-home" --nologo -v q
mkdir -p "$TARGET"
cp "$CH_TEST_DIR/plugins-build/customized-home/Jellyfin.Plugin.CustomizedHome.dll" "$PLUGIN_DIR/logo.png" "$TARGET/"
cat > "$TARGET/meta.json" <<META
{"category":"General","changelog":"","description":"Customized Home","guid":"7c99a4bf-cd3b-4bc8-b941-7ddccd816f3c","name":"Customized Home","overview":"","owner":"leguian","targetAbi":"${JELLYFIN_NUGET%%.*}.0.0.0","timestamp":"2026-01-01T00:00:00Z","version":"$VERSION","status":0,"autoUpdate":false,"imagePath":"logo.png"}
META
echo "installed $VERSION into $TARGET"
