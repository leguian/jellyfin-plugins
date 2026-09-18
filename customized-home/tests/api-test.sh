#!/bin/bash
source "$(dirname "$0")/env.sh"
BASE="$JF_BASE"
for i in $(seq 1 180); do curl -s -o /dev/null $BASE/System/Info/Public && break; sleep 1; done
echo "== public info"; curl -s $BASE/System/Info/Public; echo
H="$AUTH_HEADER"
J="$JSON"
if curl -s $BASE/System/Info/Public | grep -q '"StartupWizardCompleted":false'; then
  echo "== wizard"
  curl -s -H "$H" -H "$J" -X POST $BASE/Startup/Configuration -d '{"UICulture":"fr","MetadataCountryCode":"FR","PreferredMetadataLanguage":"fr"}' -o /dev/null -w "cfg:%{http_code}\n"
  curl -s -H "$H" $BASE/Startup/User -o /dev/null -w "getuser:%{http_code}\n"
  curl -s -H "$H" -H "$J" -X POST $BASE/Startup/User -d '{"Name":"'"$JF_ADMIN_USER"'","Password":"'"$JF_ADMIN_PASS"'"}' -o /dev/null -w "user:%{http_code}\n"
  curl -s -H "$H" -H "$J" -X POST $BASE/Startup/RemoteAccess -d '{"EnableRemoteAccess":true,"EnableAutomaticPortMapping":false}' -o /dev/null -w "remote:%{http_code}\n"
  curl -s -H "$H" -X POST $BASE/Startup/Complete -o /dev/null -w "complete:%{http_code}\n"
fi
TOKEN=$(curl -s -H "$H" -H "$J" -X POST $BASE/Users/AuthenticateByName -d '{"Username":"'"$JF_ADMIN_USER"'","Pw":"'"$JF_ADMIN_PASS"'"}' | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["AccessToken"])')
echo "token: ${TOKEN:0:6}..."
A="Authorization: MediaBrowser Client=\"ChTest\", Device=\"ChTest\", DeviceId=\"chtest-1\", Version=\"1.0\", Token=\"$TOKEN\""
echo "== status"; curl -s -H "$A" $BASE/CustomizedHome/Status; echo
echo "== layout (initial)"; curl -s -H "$A" $BASE/CustomizedHome/Layout; echo
echo "== save layout"; curl -s -H "$A" -H "$J" -X POST $BASE/CustomizedHome/Layout -d '{"Version":1,"HideUnlisted":false,"Items":[{"Type":"folder","Id":"f1","Name":"Séries","Icon":"tv","Visible":true,"Collapsed":false,"Items":[{"Type":"section","Key":"jf:nextup","Visible":true},{"Type":"folder","Id":"nested","Name":"x","Items":[]}]},{"Type":"section","Key":"jf:resume","Visible":false},{"Type":"section","Key":"jf:resume","Visible":true},{"Type":"section","Key":"","Visible":true}]}' -w "\nhttp:%{http_code}\n"
echo "== layout (after save)"; curl -s -H "$A" $BASE/CustomizedHome/Layout; echo
echo "== catalog (first 200 chars)"; curl -s -H "$A" $BASE/CustomizedHome/Catalog | head -c 200; echo
echo "== js anonymous"; curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" $BASE/CustomizedHome/customized-home.js
echo "== css headers"; curl -s -D - -o /dev/null $BASE/CustomizedHome/customized-home.css | grep -iE "HTTP/|etag|cache-control|content-type"
ETAG=$(curl -s -D - -o /dev/null $BASE/CustomizedHome/customized-home.css | grep -i etag | awk '{print $2}' | tr -d '\r')
echo "== css conditional ($ETAG)"; curl -s -o /dev/null -w "%{http_code}\n" -H "If-None-Match: $ETAG" $BASE/CustomizedHome/customized-home.css
echo "== user layouts"; curl -s -H "$A" $BASE/CustomizedHome/UserLayouts; echo
echo "== default layout save"; curl -s -H "$A" -H "$J" -X POST $BASE/CustomizedHome/DefaultLayout -d '{"Version":1,"HideUnlisted":false,"Items":[{"Type":"section","Key":"jf:smalllibrarytiles","Visible":true}]}' -w "\nhttp:%{http_code}\n"
echo "== plugin configuration"; curl -s -H "$A" $BASE/Plugins/7c99a4bf-cd3b-4bc8-b941-7ddccd816f3c/Configuration; echo
echo "== unauthenticated layout"; curl -s -o /dev/null -w "%{http_code}\n" $BASE/CustomizedHome/Layout
echo "== create user bob"; curl -s -H "$A" -H "$J" -X POST $BASE/Users/New -d '{"Name":"bob","Password":"bob123"}' -o /dev/null -w "%{http_code}\n"
BOBTOKEN=$(curl -s -H 'Authorization: MediaBrowser Client="ChTest", Device="ChTestBob", DeviceId="chtest-bob", Version="1.0"' -H "$J" -X POST $BASE/Users/AuthenticateByName -d '{"Username":"bob","Pw":"bob123"}' | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["AccessToken"])')
B="Authorization: MediaBrowser Client=\"ChTest\", Device=\"ChTestBob\", DeviceId=\"chtest-bob\", Version=\"1.0\", Token=\"$BOBTOKEN\""
echo "== bob status (expect 403)"; curl -s -o /dev/null -w "%{http_code}\n" -H "$B" $BASE/CustomizedHome/Status
echo "== bob default layout POST (expect 403)"; curl -s -o /dev/null -w "%{http_code}\n" -H "$B" -H "$J" -X POST $BASE/CustomizedHome/DefaultLayout -d '{"Items":[]}'
echo "== bob layout"; curl -s -H "$B" $BASE/CustomizedHome/Layout; echo
echo "== bob reset admin layout (expect 403)"; curl -s -o /dev/null -w "%{http_code}\n" -H "$B" -X DELETE "$BASE/CustomizedHome/Layout?userId=$(curl -s -H "$A" $BASE/Users/Me | python3 -c 'import sys,json;print(json.load(sys.stdin)["Id"])')"
echo "== libraries"
curl -s -H "$A" -H "$J" -X POST "$BASE/Library/VirtualFolders?name=Films&collectionType=movies&refreshLibrary=false" -d "{\"LibraryOptions\":{\"PathInfos\":[{\"Path\":\"$MEDIA/movies\"}],\"EnableRealtimeMonitor\":false,\"EnableInternetProviders\":false,\"EnableChapterImageExtraction\":false,\"SaveLocalMetadata\":false}}" -o /dev/null -w "films:%{http_code}\n"
curl -s -H "$A" -H "$J" -X POST "$BASE/Library/VirtualFolders?name=S%C3%A9ries&collectionType=tvshows&refreshLibrary=true" -d "{\"LibraryOptions\":{\"PathInfos\":[{\"Path\":\"$MEDIA/shows\"}],\"EnableRealtimeMonitor\":false,\"EnableInternetProviders\":false,\"EnableChapterImageExtraction\":false,\"SaveLocalMetadata\":false}}" -o /dev/null -w "series:%{http_code}\n"
sleep 20
echo "== item counts"; curl -s -H "$A" "$BASE/Items?IncludeItemTypes=Movie&Recursive=true&Limit=0" | python3 -c 'import sys,json;print("movies",json.load(sys.stdin)["TotalRecordCount"])'; curl -s -H "$A" "$BASE/Items?IncludeItemTypes=Episode&Recursive=true&Limit=0" | python3 -c 'import sys,json;print("episodes",json.load(sys.stdin)["TotalRecordCount"])'
echo "== server log (plugin lines)"; grep -h "Customized Home\|CustomizedHome\|FileTransformation\|Loaded plugin\|Plugin.*Malfunction" "$DATA"/log/*.log | tail -15
