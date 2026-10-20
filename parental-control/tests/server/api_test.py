#!/usr/bin/env python3
"""End-to-end checks of Parental Control on a real Jellyfin server (tests/server/setup-env.sh, install-plugin.sh,
restart-server.sh first). Exits with a non-zero status on the first failed check.

Covers what the browser tests cannot: the server really hides the content (titles, episodes, latest, next up,
search, direct access) in both modes, keeps the tags it did not write, cleans up after itself, and counts screen time.
Usage: python3 -I tests/server/api_test.py   (JF_BASE, PC_TEST_DIR as in env.sh)
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("JF_BASE", "http://127.0.0.1:8096")
MEDIA = os.path.join(os.environ.get("PC_TEST_DIR", os.path.expanduser("~/.cache/parental-control-tests")), "media")
ADMIN, ADMIN_PASSWORD = "admin", "admin123"
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
CHECKS = 0


def call(method, path, body=None, token=None, device="pctest"):
    auth = f'MediaBrowser Client="PcTest", Device="PcTest", DeviceId="{device}", Version="1.0"'
    if token:
        auth += f', Token="{token}"'
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(BASE + path, data=data, method=method, headers={"Authorization": auth, "Content-Type": "application/json"})
    try:
        with OPENER.open(request, timeout=60) as response:
            text = response.read().decode()
            return response.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()


def ok(condition, message):
    global CHECKS
    CHECKS += 1
    if not condition:
        print("FAIL", message)
        sys.exit(1)
    print("ok  ", message)


def sign_in(name, password=""):
    status, result = call("POST", "/Users/AuthenticateByName", {"Username": name, "Pw": password}, device="pctest-" + name)
    ok(status == 200, f"{name} signs in")
    return result["AccessToken"]


def names(items):
    return sorted({item.get("SeriesName") or item["Name"] for item in items})


def setup():
    _, info = call("GET", "/System/Info/Public")
    if not info["StartupWizardCompleted"]:
        call("POST", "/Startup/Configuration", {"UICulture": "en-US", "MetadataCountryCode": "US", "PreferredMetadataLanguage": "en"})
        call("GET", "/Startup/User")
        call("POST", "/Startup/User", {"Name": ADMIN, "Password": ADMIN_PASSWORD})
        call("POST", "/Startup/RemoteAccess", {"EnableRemoteAccess": True, "EnableAutomaticPortMapping": False})
        call("POST", "/Startup/Complete")
    admin = sign_in(ADMIN, ADMIN_PASSWORD)
    _, users = call("GET", "/Users", token=admin)
    existing = {user["Name"]: user["Id"] for user in users}
    for name in ("tim", "will"):
        if name not in existing:
            _, user = call("POST", "/Users/New", {"Name": name, "Password": ""}, token=admin)
            existing[name] = user["Id"]
    _, folders = call("GET", "/Library/VirtualFolders", token=admin)
    if not folders:
        options = {"EnableRealtimeMonitor": False, "EnableInternetProviders": False, "EnableChapterImageExtraction": False, "SaveLocalMetadata": False}
        for name, kind, folder in (("Movies", "movies", "movies"), ("Shows", "tvshows", "shows")):
            call("POST", f"/Library/VirtualFolders?name={name}&collectionType={kind}&refreshLibrary=true",
                 {"LibraryOptions": dict(options, PathInfos=[{"Path": os.path.join(MEDIA, folder)}])}, token=admin)
    # A scan started while the second library is added may stop early: one more, explicitly.
    call("POST", "/Library/Refresh", token=admin)
    for _ in range(240):
        _, result = call("GET", "/Items?Recursive=true&IncludeItemTypes=Movie,Series,Episode", token=admin)
        if result["TotalRecordCount"] >= 17:
            break
        time.sleep(1)
    ok(result["TotalRecordCount"] >= 17, "library scanned (5 movies, 3 series, 9 episodes)")
    # Series named from the folders, or from online metadata when the server fetched it ("Peppa" or "Peppa Pig").
    series = {}
    for item in result["Items"]:
        if item["Type"] == "Series":
            for folder in ("Bluey", "Peppa", "Breaking Bad"):
                if item["Name"].startswith(folder):
                    series[folder] = (item["Id"], item["Name"])
    return admin, existing, series


def wait_sync(admin, since):
    for _ in range(60):
        _, status = call("GET", "/ParentalControl/Status", token=admin)
        sync = status["Sync"]
        if not sync["Running"] and sync.get("LastRunUtc") and sync["LastRunUtc"] > since:
            return sync
        time.sleep(1)
    ok(False, "tag synchronization finished")


def profile(mode, hidden=(), allowed=()):
    return {"Profile": {"Enabled": True, "Mode": mode, "Hidden": list(hidden), "Allowed": list(allowed),
                        "ScreenTime": {"Enabled": True, "DailyLimitMinutes": [60] * 7, "WarningMinutes": 5, "ShowRemaining": True}}}


def visible(token):
    _, items = call("GET", "/Items?Recursive=true&IncludeItemTypes=Movie,Series,Season,Episode", token=token)
    _, latest = call("GET", "/Items/Latest?Limit=50", token=token)
    _, next_up = call("GET", "/Shows/NextUp?Limit=50", token=token)
    _, search = call("GET", "/Items?Recursive=true&searchTerm=Breaking", token=token)
    return names(items["Items"]), names(latest), names(next_up["Items"]), names(search["Items"])


def main():
    admin, users, series = setup()
    tim, will = users["tim"], users["will"]
    (bad, _), (bluey, _), (peppa, peppa_name) = series["Breaking Bad"], series["Bluey"], series["Peppa"]

    # Watch history before the rules: Next Up then has a candidate in every series.
    _, episodes = call("GET", "/Items?Recursive=true&IncludeItemTypes=Episode&Fields=SeriesName", token=admin)
    first = {}
    for episode in episodes["Items"]:
        if episode["SeriesName"] not in first or episode.get("IndexNumber", 99) < first[episode["SeriesName"]][0]:
            first[episode["SeriesName"]] = (episode.get("IndexNumber", 99), episode["Id"])
    for user in (tim, will):
        for _, episode_id in first.values():
            call("POST", f"/UserPlayedItems/{episode_id}?userId={user}", token=admin)

    started = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    status, label = call("POST", "/ParentalControl/Labels", {"Name": "Cartoons", "Color": "#2e9e5b", "Targets": [{"Kind": "Item", "Value": peppa}]}, token=admin)
    ok(status == 200, "label created")
    status, _ = call("POST", f"/ParentalControl/Profiles/{tim}", profile("BlockList", hidden=[{"Kind": "Item", "Value": bad}, {"Kind": "Label", "Value": label["Id"]}]), token=admin)
    ok(status == 200, "block list profile saved")
    status, _ = call("POST", f"/ParentalControl/Profiles/{will}", profile("AllowList", allowed=[{"Kind": "Item", "Value": bluey}]), token=admin)
    ok(status == 200, "allow list profile saved")
    sync = wait_sync(admin, started)
    ok(sync["TaggedItems"] >= 15, f"tags written on the series, seasons and episodes ({sync['TaggedItems']} items)")

    tim_token = sign_in("tim")
    items, latest, next_up, search = visible(tim_token)
    ok("Breaking Bad" not in items and peppa_name not in items and "Bluey" in items, f"block list: titles and episodes hidden {items}")
    ok("Breaking Bad" not in latest, f"block list: latest {latest}")
    ok(next_up == ["Bluey"], f"block list: next up {next_up}")
    ok(search == [], f"block list: search {search}")
    status, _ = call("GET", f"/Items/{first['Breaking Bad'][1]}", token=tim_token)
    ok(status == 404, "block list: direct access to a hidden episode refused")

    will_token = sign_in("will")
    items, latest, next_up, search = visible(will_token)
    ok(items == ["Bluey"], f"allow list: only the allowed series {items}")
    ok(latest == ["Bluey"] and next_up == ["Bluey"] and search == [], f"allow list: latest {latest}, next up {next_up}, search {search}")

    _, user = call("GET", f"/Users/{tim}", token=admin)
    ok(sorted(user["Policy"]["BlockedTags"]) == ["Cartoons", "pc-hidden-tim"], f"policy of tim {user['Policy']['BlockedTags']}")

    status, me = call("GET", "/ParentalControl/Me", token=tim_token)
    ok(status == 200 and me["Controlled"] and me["ScreenTime"]["LimitMinutes"] == 60, "client context of the child")

    # Screen time: two progress reports 16 seconds apart are counted.
    device = "pctest-tim"
    movie = [item for item in episodes["Items"] if item["SeriesName"] == "Bluey"][0]["Id"]
    call("POST", "/Sessions/Playing", {"ItemId": movie, "PositionTicks": 0}, token=tim_token, device=device)
    for step in (1, 2):
        time.sleep(16)
        call("POST", "/Sessions/Playing/Progress", {"ItemId": movie, "PositionTicks": step * 160000000, "IsPaused": False}, token=tim_token, device=device)
    call("POST", "/Sessions/Playing/Stopped", {"ItemId": movie, "PositionTicks": 320000000}, token=tim_token, device=device)
    _, me = call("GET", "/ParentalControl/Me", token=tim_token)
    ok(me["ScreenTime"]["UsedSeconds"] >= 15, f"screen time counted ({me['ScreenTime']['UsedSeconds']} s)")

    # Clean up: the policies and the items lose what the plugin wrote.
    started = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    for user_id in (tim, will):
        status, _ = call("DELETE", f"/ParentalControl/Profiles/{user_id}", token=admin)
        ok(status == 204, "profile deleted")
    status, _ = call("DELETE", f"/ParentalControl/Labels/{label['Id']}", token=admin)
    ok(status == 204, "label deleted")
    wait_sync(admin, started)
    _, user = call("GET", f"/Users/{tim}", token=admin)
    ok(user["Policy"]["BlockedTags"] == [] and user["Policy"]["AllowedTags"] == [], "policies cleaned")
    _, tagged = call("GET", "/Items?Recursive=true&Tags=pc-hidden-tim|pc-allowed-will|Cartoons", token=admin)
    ok(tagged["TotalRecordCount"] == 0, "tags removed from the items")
    items, _, _, _ = visible(sign_in("will"))
    ok("Breaking Bad" in items and peppa_name in items, "everything visible again")
    print(f"{CHECKS} checks passed")


if __name__ == "__main__":
    main()
