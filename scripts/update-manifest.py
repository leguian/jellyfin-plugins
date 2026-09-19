#!/usr/bin/env python3
"""Add packaged plugin versions to the repository manifest.json (Jellyfin plugin repository format).

Usage: update-manifest.py --manifest manifest.json --base-url <url of the release assets> summary1.json [summary2.json ...]

Each summary file is the JSON printed by package.py. With --zip-dir the checksum is computed from the zip
of that folder (the files actually published) instead of being taken from the summary. Versions are ordered newest first and, for equal
version numbers, highest targetAbi first so that a Jellyfin 12 server picks the 12.x build while a 10.11
server only qualifies for the 10.11 build.
"""
import argparse
import datetime as dt
import hashlib
import json
import pathlib
import sys


def version_key(entry: dict) -> tuple:
    def parse(value: str) -> tuple:
        return tuple(int(part) if part.isdigit() else 0 for part in value.split("."))

    return (parse(entry["version"]), parse(entry.get("targetAbi", "0")))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default="manifest.json")
    parser.add_argument("--base-url", required=True, help="URL prefix where the zip files are published")
    parser.add_argument("--image-url-base", default=None, help="URL prefix of the repository files (the plugin logo is <base>/<plugin>/logo.png)")
    parser.add_argument("--zip-dir", default=None, help="folder holding the published zips: their checksum wins over the summary")
    parser.add_argument("summaries", nargs="+")
    args = parser.parse_args()

    manifest_path = pathlib.Path(args.manifest)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []

    for summary_file in args.summaries:
        summary = json.loads(pathlib.Path(summary_file).read_text(encoding="utf-8"))
        plugin = next((p for p in manifest if p.get("guid") == summary["guid"]), None)
        if plugin is None:
            plugin = {
                "guid": summary["guid"],
                "name": summary["name"],
                "description": summary["description"],
                "overview": summary["overview"],
                "owner": summary["owner"],
                "category": summary["category"],
                "imageUrl": "",
                "versions": [],
            }
            manifest.append(plugin)
        plugin["name"] = summary["name"]
        plugin["description"] = summary["description"]
        plugin["overview"] = summary["overview"]
        plugin["owner"] = summary["owner"]
        plugin["category"] = summary["category"]
        if args.image_url_base and summary.get("hasLogo"):
            plugin["imageUrl"] = args.image_url_base.rstrip("/") + "/" + summary["plugin"] + "/logo.png"
        file_name = pathlib.Path(summary["file"].replace("\\", "/")).name
        checksum = summary["checksum"]
        if args.zip_dir:
            checksum = hashlib.md5((pathlib.Path(args.zip_dir) / file_name).read_bytes()).hexdigest()  # noqa: S324 - Jellyfin manifests use MD5
        entry = {
            "version": summary["version"],
            "changelog": summary["changelog"],
            "targetAbi": summary["targetAbi"],
            "sourceUrl": args.base_url.rstrip("/") + "/" + file_name,
            "checksum": checksum,
            "timestamp": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        # Repair run on an entry that is already there: keep its timestamp so that nothing changes.
        for existing in plugin["versions"]:
            if all(existing.get(key) == entry[key] for key in ("version", "targetAbi", "sourceUrl", "checksum")):
                entry["timestamp"] = existing.get("timestamp", entry["timestamp"])
        plugin["versions"] = [
            v for v in plugin["versions"]
            if not (v["version"] == entry["version"] and v.get("targetAbi") == entry["targetAbi"])
        ]
        plugin["versions"].append(entry)
        plugin["versions"].sort(key=version_key, reverse=True)

    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"updated {manifest_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
