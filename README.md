# jellyfin-plugins

Jellyfin plugins maintained in this repository, one folder per plugin, published through a Jellyfin plugin repository (`manifest.json`).

> Français : voir la section [En français](#en-français) en bas de page.

## Plugins

| Plugin | Folder | Description | Documentation |
| --- | --- | --- | --- |
| Customized Home | [`customized-home/`](customized-home/) | Easily edit and organize the sections on your homepage: drag and drop order, hide or remove sections, display format per section, sections rendered by the plugin (combined continue watching / next up, latest by release date, collections, watch again, because you watched, genres), hero banner, administrator default layout. **Web client only**: browsers, the official Android and iOS apps and Jellyfin Media Player; Android TV, Swiftfin, Kodi and other native apps are not affected. | [English user guide](customized-home/README.en.md) · [Référence technique (français)](customized-home/README.md) |

## Add the repository to Jellyfin

In the Jellyfin Dashboard, open the plugin repositories (Dashboard, Plugins, Repositories) and add this URL:

```
https://raw.githubusercontent.com/leguian/jellyfin-plugins/main/manifest.json
```

The plugins then appear in the catalog. Customized Home needs the [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) plugin, installed first from its own repository: the [user guide](customized-home/README.en.md#installation) gives the order of the steps.

| Jellyfin server | Supported |
| --- | --- |
| 12.x | from 12.0.0 |
| 10.11.x | from 10.11.0 |

## Release process

A release is a change of `version` in `<plugin>/build.yaml` merged into `main`. Nothing is published without it.

1. Bump `version` and `changelog` in `<plugin>/build.yaml`, and keep the `<Version>` of the csproj and the `VERSION` constant of the client script aligned.
2. Merge into `main`. The `release.yml` workflow runs every job of `build.yml` first (both builds, unit tests on both targets, browser tests): a red test blocks the release.
3. The workflow creates the tag `<plugin>-v<version>`, builds one zip per server line (Jellyfin 12.x on .NET 10, Jellyfin 10.11.x on .NET 9), publishes the GitHub release and updates `manifest.json` on `main` (`scripts/update-manifest.py`).
4. "Run workflow" on `main` finishes the current version: it publishes the release when it does not exist yet, or repairs `manifest.json` from the published zips when only that step failed.

Each zip is compiled against the oldest server of its line (10.11.0 and 12.0.0, `JELLYFIN_FLOORS` in `scripts/package.py`) and declares that same `targetAbi`: a server refuses a plugin whose Jellyfin references are newer than its own assemblies.

## Build and test

Requirements: .NET SDK 10 (Jellyfin 12.x target) or .NET SDK 9 (Jellyfin 10.11.x target only), Python 3 for packaging, Node.js for the browser tests.

```bash
# Build: Jellyfin 12.x (default target, .NET SDK 10)
dotnet build customized-home/Jellyfin.Plugin.CustomizedHome/Jellyfin.Plugin.CustomizedHome.csproj -c Release
# Build: Jellyfin 10.11.x (.NET SDK 9 or 10)
dotnet build customized-home/Jellyfin.Plugin.CustomizedHome/Jellyfin.Plugin.CustomizedHome.csproj -c Release -p:JellyfinVersion=10.11.0

# C# unit tests: Jellyfin 12.x target (.NET SDK 10)
dotnet test customized-home/Jellyfin.Plugin.CustomizedHome.Tests
# C# unit tests: Jellyfin 10.11.x target (needs the .NET 9 runtime)
dotnet test customized-home/Jellyfin.Plugin.CustomizedHome.Tests -p:JellyfinVersion=10.11.0

# Packaging, exactly what the release runs (zip and checksum in artifacts/, ignored by git)
python3 scripts/package.py customized-home --jellyfin 12 --output artifacts
python3 scripts/package.py customized-home --jellyfin 10.11 --output artifacts

# Client script syntax
node --check customized-home/Jellyfin.Plugin.CustomizedHome/Web/customized-home.js

# Browser tests (Playwright, no Jellyfin server required)
cd customized-home/tests
npm ci
npx playwright install chromium
npm test
npm run typecheck
```

The browser tests run the client script against a simulated Jellyfin home page: they do not detect a change in the structure of the Jellyfin web client. After a major Jellyfin release, check on a real server.

## Contributing and security

- [CONTRIBUTING.md](CONTRIBUTING.md): branches, commit messages, the checks to run before a push.
- [SECURITY.md](SECURITY.md): how to report a vulnerability privately.
- Bugs and ideas: [open an issue](https://github.com/leguian/jellyfin-plugins/issues/new/choose).

## License

[GPL-3.0](LICENSE), like Jellyfin and its official plugins.

## En français

Plugins Jellyfin maintenus dans ce dépôt, un sous-dossier par plugin. Actuellement : **Customized Home** ([`customized-home/`](customized-home/)), qui permet à chaque utilisateur de réorganiser la page d'accueil du client web (ordre par glisser-déposer, masquage, format par section, sections intégrées, bannière hero, disposition par défaut définie par l'administrateur).

- Documentation complète en français (fonctionnement, sections, API, tests, points de vigilance) : [customized-home/README.md](customized-home/README.md).
- Dépôt de plugins à ajouter dans le tableau de bord Jellyfin (Plugins, Dépôts) :

  ```
  https://raw.githubusercontent.com/leguian/jellyfin-plugins/main/manifest.json
  ```

- Release, build et tests : voir les sections en anglais ci-dessus ; les commandes sont identiques.
- Licence : [GPL-3.0](LICENSE).
