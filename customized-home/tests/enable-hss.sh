#!/bin/bash
# Installs Plugin Pages + Home Screen Sections into the test server and enables "Modular Home" for admin.
source "$(dirname "$0")/env.sh"
BASE="$JF_BASE"
cp -r "$CH_TEST_DIR/stage/PluginPages" "$CH_TEST_DIR/stage/HomeScreenSections" "$PLUGINS/"
"$TESTS_DIR/restart-server.sh"
H="$AUTH_HEADER"
J="$JSON"
A=$(jf_token_header)
UID_=$(curl -s -H "$A" $BASE/Users/Me | python3 -c 'import sys,json;print(json.load(sys.stdin)["Id"])')
echo "== HSS meta"; curl -s -H "$A" $BASE/HomeScreen/Meta; echo
echo "== HSS sections"; curl -s -H "$A" "$BASE/ModularHomeViews/Sections?language=fr" | python3 -c 'import sys,json;d=json.load(sys.stdin);print([ (i["Section"], i["DisplayText"]) for i in d["Items"]])'
echo "== enable HSS globally"; CFG=$(curl -s -H "$A" $BASE/Plugins/b8298e01-2697-407a-b44d-aa8dc795e850/Configuration); echo "$CFG" | python3 -c 'import sys,json;d=json.load(sys.stdin);d["Enabled"]=True;print(json.dumps(d))' > /tmp/hsscfg.json; curl -s -H "$A" -H "$J" -X POST $BASE/Plugins/b8298e01-2697-407a-b44d-aa8dc795e850/Configuration -d @/tmp/hsscfg.json -o /dev/null -w "cfg:%{http_code}\n"
echo "== user settings"; curl -s -H "$A" -H "$J" -X POST $BASE/ModularHomeViews/UserSettings -d "{\"UserId\":\"$UID_\",\"EnabledSections\":[\"MyMedia\",\"ContinueWatching\",\"NextUp\",\"ContinueWatchingNextUp\",\"RecentlyAddedMovies\",\"RecentlyAddedShows\",\"LatestMovies\",\"LatestShows\",\"BecauseYouWatched\",\"WatchAgain\",\"CollectionsSection\",\"Genre\"]}" -o /dev/null -w "usersettings:%{http_code}\n"
curl -s -H "$A" $BASE/DisplayPreferences/usersettings?userId=$UID_\&client=emby | python3 -c 'import sys,json;d=json.load(sys.stdin);d["CustomPrefs"]["useModularHome"]="true";print(json.dumps(d))' > /tmp/dp.json; curl -s -H "$A" -H "$J" -X POST "$BASE/DisplayPreferences/usersettings?userId=$UID_&client=emby" -d @/tmp/dp.json -o /dev/null -w "displayprefs:%{http_code}\n"
echo "== HSS home sections for user"; curl -s -H "$A" "$BASE/HomeScreen/Sections?userId=$UID_&language=fr" | python3 -c 'import sys,json;d=json.load(sys.stdin);print([ (i["Section"], i.get("AdditionalData"), i["DisplayText"], i.get("OrderIndex")) for i in d["Items"]])'
echo "== log lines"; grep -h "HomeScreenSections\|PluginPages\|loadSections" $DATA/log/*.log | tail -6 | cut -c1-220
