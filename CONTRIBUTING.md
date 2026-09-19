# Contributing

Thank you for helping. Bug reports, ideas and pull requests are welcome, in English or in French.

- A bug or an idea: [open an issue](https://github.com/leguian/jellyfin-plugins/issues/new/choose). The form asks for the versions and for the diagnostics that make a report actionable.
- A security problem: do not open an issue, follow [SECURITY.md](SECURITY.md).
- A larger change: open an issue first to agree on the approach before writing code.

## Repository layout

One folder per plugin. Today: `customized-home/`.

| Layer | Technology | Where |
| --- | --- | --- |
| Server | C# (.NET 10 for Jellyfin 12.x, .NET 9 for Jellyfin 10.11.x) | `customized-home/Jellyfin.Plugin.CustomizedHome/` |
| Client | Vanilla JavaScript and CSS, injected into the Jellyfin web client | `customized-home/Jellyfin.Plugin.CustomizedHome/Web/` |
| Administrator page | HTML with inline JavaScript, embedded resource | `customized-home/Jellyfin.Plugin.CustomizedHome/Configuration/configPage.html` |
| Unit tests | xUnit | `customized-home/Jellyfin.Plugin.CustomizedHome.Tests/` |
| Browser tests | Playwright, strict TypeScript | `customized-home/tests/` |
| Tooling | Python (packaging, manifest), GitHub Actions | `scripts/`, `.github/workflows/` |

## Branches and commits

- One change, one branch, minimal scope. Branch names in English: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- [Conventional Commits](https://www.conventionalcommits.org/) in English: `feat(customized-home): …`, `fix(customized-home): …`, `docs: …`, `chore: …`.
- Stage files by name. Never `git add -A`: build outputs and caches (`bin/`, `obj/`, `node_modules/`, `artifacts/`, `__pycache__/`, `test-results/`) must not be committed.
- Line endings are LF everywhere (`.gitattributes`).
- Do not change version numbers (`build.yaml`, the csproj `<Version>`, the `VERSION` constant of the client script), `manifest.json` or the release workflow in a pull request: a version bump merged into `main` **is** a release, and the maintainer does it.

## Rules of the code

- **The client script is one vanilla JavaScript file**: no build step, no dependency, no import, no TypeScript, no framework. It is injected as is into the Jellyfin web client.
- **Custom CSS**, classes prefixed `ch-` (client) and `cha-` (administrator page). Surface colors derive from `currentColor` with `color-mix`: the dashboard may be light or dark.
- **Icons are Material Icons by name** (`other_houses`, `tune`…), the font shipped with the web client. Never a unicode character as an icon.
- **Never move the home sections in the DOM.** Order is set with the CSS `order` property on a flex container: moving an `emby-itemscontainer` resets its data.
- **User-facing strings of the client** go through the `I18N` table of the script, in English and French. The administrator page is in English.
- Identifiers, comments and log messages in English.
- C#: warnings are errors and analyzers are on. Logs through `[LoggerMessage]`. Every endpoint carries `[Authorize]` except the client assets and the genre thumbnail image (served like any Jellyfin image, see `SECURITY.md`); administrator endpoints use `Policies.RequiresElevation`. Every input from a client is validated and normalized on the server (`LayoutValidator`).
- Stay on Jellyfin APIs that exist in both 10.11.0 and 12.0.0: the plugin is compiled against the oldest server of each line.
- No unresolved `TODO`, no hardcoded magic values: use named constants.

## Tests

- Every new behavior of the client or of the administrator page comes with a test.
- **A test must fail without the change it covers.** Check it: revert your change temporarily, watch the test fail, restore the change. Say in the pull request how you checked.
- The browser tests run the client script against a simulated home page (`tests/fixtures/home.html`) and a fake `ApiClient` (`tests/fixtures/apiClientStub.js`). They do not detect a change in the structure of the Jellyfin web client: say so when it matters, and do not present a green test as a validation on a real server.

## Before you push

Run all of it; the CI runs the same checks and a red job blocks a release.

```bash
# 1. Build (warnings are errors). With the .NET 9 SDK only the 10.11 target builds locally; the CI builds 12.x.
dotnet build customized-home/Jellyfin.Plugin.CustomizedHome/Jellyfin.Plugin.CustomizedHome.csproj -c Release -p:JellyfinVersion=10.11.0

# 2. C# unit tests (the 10.11 run needs the .NET 9 runtime; with the .NET 10 SDK alone, drop the property to test the 12.x target)
dotnet test customized-home/Jellyfin.Plugin.CustomizedHome.Tests -p:JellyfinVersion=10.11.0

# 3. Client script syntax
node --check customized-home/Jellyfin.Plugin.CustomizedHome/Web/customized-home.js

# 4. Browser tests and type check
cd customized-home/tests
npm ci                              # first time only
npx playwright install chromium     # first time only
npm test
npm run typecheck
cd ../..

# 5. Packaging: exactly what the release runs. Skipping it has already broken a release.
python3 scripts/package.py customized-home --jellyfin 10.11 --output artifacts
```

After a change of the interface, also run `npm run screenshots` in `customized-home/tests` and look at the captures in `test-results/screenshots`.

## Pull requests

- Describe what changes for the user and why, and list what you ran with the results.
- Say what you could not verify: a real Jellyfin server, the 12.x target locally, the light theme of the dashboard, a client you do not own.
- Update the documentation in the same pull request: [`customized-home/README.md`](customized-home/README.md) (French technical reference) and [`customized-home/README.en.md`](customized-home/README.en.md) (English user guide) when the behavior described there changes.
- The descriptive texts of the plugin stay aligned: `Plugin.cs` (`Description`), `build.yaml` (`overview`), the csproj (`<Description>`), the subtitle of `configPage.html` and the plugin table of the root [README.md](README.md).

## License

By contributing you agree that your contribution is licensed under the [GPL-3.0](LICENSE), the license of this repository.
