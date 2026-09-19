#!/usr/bin/env python3
"""Build and package a plugin folder of this repository into a Jellyfin plugin zip.

Usage: package.py <plugin-folder> --jellyfin <server line or version> [--output artifacts] [--configuration Release]

--jellyfin takes a server line ("10.11", "12"), resolved to the oldest server of that line, or an exact
Jellyfin NuGet version. The declared targetAbi is always the version the plugin was compiled against.

The plugin folder must contain a build.yaml (jellyfin-plugin-template format) and exactly one .csproj
in a sub folder. The resulting zip contains the plugin assembly (build.yaml "artifacts"), a meta.json, the logo and the LICENSE.
A JSON summary of the produced package (version, targetAbi, checksum, file name) is printed on stdout.
"""
import argparse
import datetime as dt
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import zipfile


def read_build_yaml(path: pathlib.Path) -> dict:
    """Minimal parser for the flat build.yaml used by Jellyfin plugins (no PyYAML dependency)."""
    data: dict = {}
    current_key = None
    block_lines: list[str] = []
    list_key = None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if not line or line.startswith("#") or line == "---":
            continue
        if current_key is not None:
            if line.startswith("  ") or line.startswith("\t"):
                block_lines.append(line.strip())
                continue
            data[current_key] = " ".join(block_lines).strip()
            current_key = None
            block_lines = []
        if list_key is not None:
            if line.startswith("-"):
                data[list_key].append(line[1:].strip().strip('"'))
                continue
            list_key = None
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value == ">" or value == "|":
            current_key = key
            block_lines = []
        elif value == "":
            data[key] = []
            list_key = key
        else:
            data[key] = value.strip('"')
    if current_key is not None:
        data[current_key] = " ".join(block_lines).strip()
    return data


# Oldest server of each supported line. The plugin is compiled against it: a server refuses a plugin whose
# Jellyfin assembly references are newer than its own assemblies, while newer servers of the line load it fine.
JELLYFIN_FLOORS = {"10.11": "10.11.0", "12": "12.0.0"}


def resolve_jellyfin(value: str) -> str:
    version = JELLYFIN_FLOORS.get(value, value)
    parts = version.split(".")
    if len(parts) != 3 or not all(part.isdigit() for part in parts):
        raise ValueError(f"unsupported Jellyfin version '{value}': use one of {sorted(JELLYFIN_FLOORS)} or a release version x.y.z")
    return version


def target_framework(jellyfin_version: str) -> str:
    if jellyfin_version.startswith("10.11"):
        return "net9.0"
    return "net10.0"


def target_abi(jellyfin_version: str) -> str:
    """Minimum server version declared in meta.json: exactly the version the plugin is compiled against.

    Declaring anything lower offers the plugin to servers that cannot load it (their MediaBrowser.* assemblies
    are older than the ones the plugin references).
    """
    return f"{jellyfin_version}.0"


def check_jellyfin_references(build_dir: pathlib.Path, project: pathlib.Path, jellyfin_version: str) -> None:
    """Fails when NuGet resolved another Jellyfin version than the one the targetAbi is derived from."""
    deps_path = build_dir / f"{project.stem}.deps.json"
    deps = json.loads(deps_path.read_text(encoding="utf-8"))
    found: dict = {}
    for libraries in deps.get("targets", {}).values():
        for name, library in libraries.items():
            if name.split("/")[0] == project.stem:
                found = {key: value for key, value in library.get("dependencies", {}).items() if key.startswith("Jellyfin.")}
    if not found:
        raise RuntimeError(f"no Jellyfin dependency found in {deps_path}")
    wrong = {key: value for key, value in found.items() if value != jellyfin_version}
    if wrong:
        raise RuntimeError(f"built against {wrong}, expected {jellyfin_version}: the declared targetAbi would be wrong")


def abi_label(abi: str) -> str:
    major, minor = abi.split(".")[:2]
    return major if minor == "0" else f"{major}.{minor}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plugin", help="plugin folder (e.g. customized-home)")
    parser.add_argument("--jellyfin", required=True, help="server line (10.11, 12) or exact Jellyfin NuGet version to build against")
    parser.add_argument("--output", default="artifacts", help="output folder")
    parser.add_argument("--configuration", default="Release")
    parser.add_argument("--version", default=None, help="override the plugin version from build.yaml")
    args = parser.parse_args()

    root = pathlib.Path(__file__).resolve().parent.parent
    plugin_dir = root / args.plugin
    build_yaml = plugin_dir / "build.yaml"
    if not build_yaml.exists():
        print(f"build.yaml not found in {plugin_dir}", file=sys.stderr)
        return 1
    meta = read_build_yaml(build_yaml)
    # Test projects (<Name>.Tests.csproj) live next to the plugin project and are never packaged.
    projects = [path for path in plugin_dir.glob("*/*.csproj") if not path.name.endswith(".Tests.csproj")]
    if len(projects) != 1:
        names = ", ".join(sorted(path.name for path in projects)) or "none"
        print(f"expected exactly one plugin csproj in {plugin_dir}/*/, found {len(projects)}: {names}", file=sys.stderr)
        return 1
    project = projects[0]

    version = args.version or meta["version"]
    try:
        jellyfin = resolve_jellyfin(args.jellyfin)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1
    framework = target_framework(jellyfin)
    abi = target_abi(jellyfin)
    build_dir = root / "artifacts" / "build" / f"{args.plugin}-{jellyfin}"
    if build_dir.exists():
        shutil.rmtree(build_dir)
    cmd = [
        "dotnet", "build", str(project), "-c", args.configuration, "--nologo",
        f"-p:JellyfinVersion={jellyfin}", f"-p:Version={version}", "-o", str(build_dir),
    ]
    # Keep stdout for the JSON summary only: the compiler output goes to stderr.
    subprocess.run(cmd, check=True, stdout=sys.stderr)
    try:
        check_jellyfin_references(build_dir, project, jellyfin)
    except (OSError, ValueError, RuntimeError) as error:
        print(error, file=sys.stderr)
        return 1

    artifacts = meta.get("artifacts") or []
    if isinstance(artifacts, str):
        artifacts = [artifacts]
    manifest = {
        "category": meta.get("category", "General"),
        "changelog": meta.get("changelog", ""),
        "description": meta.get("description", ""),
        "guid": meta["guid"],
        "name": meta["name"],
        "overview": meta.get("overview", ""),
        "owner": meta.get("owner", ""),
        "targetAbi": abi,
        "timestamp": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "version": version,
        "status": 0,
        "autoUpdate": True,
        "imagePath": "logo.png" if (plugin_dir / "logo.png").exists() else "",
        "assemblies": artifacts,
    }

    output_dir = root / args.output
    output_dir.mkdir(parents=True, exist_ok=True)
    zip_name = f"{args.plugin}_{version}_jellyfin-{abi_label(abi)}.zip"
    zip_path = output_dir / zip_name
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for artifact in artifacts:
            source = build_dir / artifact
            if not source.exists():
                print(f"artifact {artifact} missing in {build_dir}", file=sys.stderr)
                return 1
            archive.write(source, artifact)
        archive.writestr("meta.json", json.dumps(manifest, indent=2))
        if manifest["imagePath"]:
            archive.write(plugin_dir / "logo.png", manifest["imagePath"])
        # The binaries link GPL code: they ship with their license.
        if (root / "LICENSE").exists():
            archive.write(root / "LICENSE", "LICENSE")

    checksum = hashlib.md5(zip_path.read_bytes()).hexdigest()  # noqa: S324 - Jellyfin manifests use MD5
    summary = {
        "plugin": args.plugin,
        "name": meta["name"],
        "guid": meta["guid"],
        "version": version,
        "targetAbi": abi,
        "jellyfin": jellyfin,
        "framework": framework,
        "file": str(zip_path.relative_to(root)),
        "checksum": checksum,
        "changelog": meta.get("changelog", ""),
        "description": meta.get("description", ""),
        "overview": meta.get("overview", ""),
        "owner": meta.get("owner", ""),
        "category": meta.get("category", "General"),
        "hasLogo": bool(manifest["imagePath"]),
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
