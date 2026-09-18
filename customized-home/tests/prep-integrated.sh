#!/bin/bash
source "$(dirname "$0")/env.sh"; BASE="$JF_BASE"; H="$AUTH_HEADER"; J="$JSON"
A=$(jf_token_header)
UID_=$(curl -s -H "$A" $BASE/Users/Me | python3 -c 'import sys,json;print(json.load(sys.stdin)["Id"])')
# HSS off
curl -s -H "$A" $BASE/Plugins/b8298e01-2697-407a-b44d-aa8dc795e850/Configuration | python3 -c 'import sys,json;d=json.load(sys.stdin);d["Enabled"]=False;print(json.dumps(d))' > /tmp/hsscfg.json; curl -s -H "$A" -H "$J" -X POST $BASE/Plugins/b8298e01-2697-407a-b44d-aa8dc795e850/Configuration -d @/tmp/hsscfg.json -o /dev/null -w "hss off:%{http_code}\n"
MOVIES=$(curl -s -H "$A" "$BASE/Items?IncludeItemTypes=Movie&Recursive=true&SortBy=SortName" | python3 -c 'import sys,json;print(" ".join(i["Id"] for i in json.load(sys.stdin)["Items"]))')
set -- $MOVIES; M1=$1; M2=$2; M3=$3
EPS=$(curl -s -H "$A" "$BASE/Items?IncludeItemTypes=Episode&Recursive=true&SortBy=SortName&Limit=3" | python3 -c 'import sys,json;print(" ".join(i["Id"] for i in json.load(sys.stdin)["Items"]))')
# played: movie 1 + first series episodes
for id in $M1 $EPS; do curl -s -H "$A" -X POST "$BASE/UserPlayedItems/$id?userId=$UID_" -o /dev/null -w "played $id:%{http_code}\n"; done
# resume: movie 2 at 50%
curl -s -H "$A" -H "$J" -X POST "$BASE/UserItems/$M2/UserData?userId=$UID_" -d '{"PlaybackPositionTicks":10000000,"Played":false}' -o /dev/null -w "progress:%{http_code}\n"
# genres on movies
for id in $M1 $M2 $M3; do curl -s -H "$A" "$BASE/Users/$UID_/Items/$id" | python3 -c 'import sys,json;d=json.load(sys.stdin);d["Genres"]=["Action","Comedy"];print(json.dumps(d))' > /tmp/item.json; curl -s -H "$A" -H "$J" -X POST "$BASE/Items/$id" -d @/tmp/item.json -o /dev/null -w "genres $id:%{http_code}\n"; done
# collection
curl -s -H "$A" -X POST "$BASE/Collections?name=Ma%20collection&ids=$M1,$M2" -o /dev/null -w "collection:%{http_code}\n"
# layout with integrated sections + formats
curl -s -H "$A" -H "$J" -X POST $BASE/CustomizedHome/Layout -d '{"Version":1,"HideUnlisted":false,"Items":[
 {"Type":"section","Key":"ch:combined","Visible":true},
 {"Type":"folder","Id":"films","Name":"Films","Icon":"movie","Visible":true,"Collapsed":false,"Items":[
   {"Type":"section","Key":"ch:latestMovies","Visible":true,"Size":"large"},
   {"Type":"section","Key":"ch:collections","Visible":true,"Shape":"landscape","ShowTitle":false},
   {"Type":"section","Key":"ch:genre","Visible":true,"Size":"small"}]},
 {"Type":"section","Key":"ch:latestShows","Visible":true,"Shape":"square"},
 {"Type":"section","Key":"ch:watchAgain","Visible":true},
 {"Type":"section","Key":"ch:becauseYouWatched","Visible":true},
 {"Type":"section","Key":"jf:resume","Visible":true,"Shape":"portrait","Size":"large"},
 {"Type":"section","Key":"jf:smalllibrarytiles","Visible":true,"Size":"small","ShowTitle":false}
]}' | python3 -c 'import sys,json;d=json.load(sys.stdin);print("layout saved", len(d["Items"]), [ (i.get("Key"),i.get("Shape"),i.get("Size"),i.get("ShowTitle")) for i in d["Items"] if i["Type"]=="section"])'
