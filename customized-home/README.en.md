# Customized Home (Jellyfin plugin): user guide

> Documentation en français (référence technique complète : fonctionnement interne, API, tests) : [README.md](README.md).

Customized Home lets every Jellyfin user reorganize the home page of the **web client**: reorder the sections by drag and drop, hide or remove them, choose a display format per section, add extra sections rendered by the plugin and show a hero banner at the top. Administrators define a default layout for everybody.

<!--
Screenshots: to be added by the maintainer from a live Jellyfin server (editor, hero banner, administrator page).
Do not use the captures produced by "npm run screenshots": they show the simulated test page, not a real home page.
-->

## Contents

- [What it does, and what it does not](#what-it-does-and-what-it-does-not)
- [Supported versions and clients](#supported-versions-and-clients)
- [Installation](#installation)
- [First use](#first-use)
- [Hero banner](#hero-banner)
- [Administrator page](#administrator-page)
- [Troubleshooting](#troubleshooting)
- [Privacy and security](#privacy-and-security)
- [Uninstalling](#uninstalling)
- [Known limits](#known-limits)
- [More](#more)

## What it does, and what it does not

| It does | It does not |
| --- | --- |
| Reorder the home sections by drag and drop (mouse and touch) or from the keyboard | Change anything in clients that do not run the Jellyfin web client (see below) |
| Hide a section without losing its place, or remove it from the page | Modify files on disk: the script is injected on the fly by the File Transformation plugin |
| Set a format per section: card shape (default, poster, landscape, square), card size (small, normal, large), section title and card titles on or off | Replace the Jellyfin home settings (Settings, Home): both can be used, see [Known limits](#known-limits) |
| Add sections rendered by the plugin, with no other plugin: Continue Watching / Next Up (combined), Latest Movies and Latest Shows by release date, Collections, Watch Again, Because You Watched, Genre, All genres | Play media itself: playback always goes through the web client |
| Show an optional hero banner: a carousel of featured media with play, resume, trailer, favorite and watched actions | |
| Store one layout per user on the server (it follows the user on every browser and device) and one default layout set by the administrator | |
| Handle sections added by other plugins (Home Screen Sections, and any plugin that adds a titled row to the home page) | |

The interface of the editor is available in English and French and follows the display language of the Jellyfin user; other languages fall back to English. The administrator page is in English.

## Supported versions and clients

| Jellyfin server | Supported |
| --- | --- |
| 12.x | Yes, from 12.0.0 |
| 10.11.x | Yes, from 10.11.0 |
| 10.10.x and older | No |

Plugin versions up to 1.8.2.0 only load on Jellyfin 10.11.11 or later and 12.1.0 or later. Use 1.8.2.1 or later on older 10.11.x and 12.0.x servers.

The plugin works by adding a script to the Jellyfin **web client**. A client is covered only when it displays that web client.

| Client | Covered |
| --- | --- |
| Web browsers (desktop and mobile) | Yes |
| Official Jellyfin apps for Android and iOS (they display the web client of the server) | Yes |
| Jellyfin Media Player / Jellyfin Desktop (versions that display the web client of the server) | Yes |
| Android TV, Fire TV, Swiftfin, Kodi, Roku, Findroid, Infuse and every other native app | **No**: these apps draw their own home screen and never load the script |
| Other apps built on the web client (smart TV apps…) | Not tested. They can only be covered when they load the web client from your server, not a copy bundled in the app |

## Installation

Prerequisite: the [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) plugin. It lets plugins change the pages served by Jellyfin without touching the files on disk. Without it Customized Home loads, but the home page is not modified.

Install in this order:

1. **Add the File Transformation repository.** In the Jellyfin Dashboard, open the plugin repositories (Dashboard, Plugins, Repositories; the exact place varies with the Jellyfin version) and add:

   ```
   https://www.iamparadox.dev/jellyfin/plugins/manifest.json
   ```

2. **Install File Transformation** from the catalog. It needs no configuration.
3. **Add this repository** the same way:

   ```
   https://raw.githubusercontent.com/leguian/jellyfin-plugins/main/manifest.json
   ```

4. **Install Customized Home** from the catalog.
5. **Restart Jellyfin.** One restart after both installs is enough.
6. **Check the status.** Dashboard, Plugins, Customized Home (also in the Dashboard side menu): the status badge of the Options tab must read **Active**.
7. **Hard refresh the web client** (Ctrl+F5, or Cmd+Shift+R on macOS). In a mobile app, close the app completely and open it again. A round **Customize home** button now sits below the last section of the home page, and the user menu has a **Customize home** entry.

Manual installation: unzip `customized-home_<version>_jellyfin-<12 or 10.11>.zip` from the [releases](https://github.com/leguian/jellyfin-plugins/releases) into `plugins/CustomizedHome_<version>/` inside the Jellyfin data directory, then restart. Pick the zip that matches the server line.

After upgrading a server from 10.11 to 12, reinstall the plugin from the catalog (uninstall, restart, install, restart): both server lines share one version number, so the update check does not replace the installed 10.11 build with the 12.x build of the same version. Layouts and options are kept (see [Uninstalling](#uninstalling)).

## First use

Open the editor with the **Customize home** button at the bottom of the home page, or from the user menu.

The editor has two columns (stacked on a narrow screen):

| Column | Content |
| --- | --- |
| **Customized home page** (left) | Your layout: the sections shown on your home page, in this order |
| **Sections not in the layout** (right) | Everything else that exists on the server and can be added |

**The rule to remember: a layout that is not empty replaces the default home page.** As soon as the left column holds one section, only the sections of that column are displayed, in that order. An empty left column leaves the Jellyfin home page untouched.

| To do this | Do that |
| --- | --- |
| Add a section | In the right column, press **Add to the customized home page** (icon `add_circle_outline`): the section lands at the top of the layout. Or drag it to the left column |
| Reorder | Drag the handle (icon `drag_indicator`) of a row. Without a pointer: focus the handle and press the up / down arrows, or activate it (Enter, tap, screen reader) for a **Move up** / **Move down** menu. The new position is announced to screen readers |
| Hide or show a section while keeping its place | **Hide** / **Show** (icons `visibility` / `visibility_off`) |
| Remove a section from the home page | **Remove from the customized home page** (icon `close`), or drag the row to the right column |
| Change the format | **Display format (shape, size, titles)** (icon `aspect_ratio`). The menu stays open while you choose; click outside or press Escape to close it |
| Find a section | **Search a section** filters both columns. While searching, drag and drop is off and a **Move this section to the very top** button appears on the rows of the layout |
| See sections that are not on the page right now | Tick **Also list the Jellyfin sections that are not displayed right now** (sections turned off in the Jellyfin home settings, for example) |
| Save | **Save**. **Cancel**, the close button, Escape or a click outside the dialog discard the changes; when there are any, the editor first asks whether to keep editing or drop them. **Reset** asks the same way |
| Go back to the default layout | **Reset** (shown once you saved a layout of your own) |

The icon at the start of a row tells where the section comes from: a house for a section rendered by Customized Home, the Jellyfin logo for a default section of the web client, a puzzle piece for a section added by another plugin. The line under the title repeats the origin and says **not displayed right now** when the section is known but not currently on the home page.

### Formats

| Setting | Values |
| --- | --- |
| **Card shape** | Default, Poster, Landscape, Square |
| **Card size** | Small, Normal, Large |
| **Show the section title** | on / off |
| **Show the card titles** | on / off |

On a section rendered by Jellyfin or by another plugin the shape is applied with CSS: the existing image is cropped. Sections rendered by Customized Home load the image that fits the shape.

### Genre sections

| Section | What it shows | Settings (format button) |
| --- | --- | --- |
| **Genre: …** | One row of media per genre | **Genres**: tick the genres you want. With none ticked the choice is **Automatic (from your watch history)**: two genres |
| **All genres** | One card per genre; a card opens the list of media of that genre | **Genre cards**: **Posters of the genre** (a collage of four posters, the default), **Custom images** (thumbnails uploaded by the administrator, collage for genres without an image) or **Names on colored backgrounds** |

### When the layout is not applied or the home page is empty

A message at the top of the home page explains what happens. It offers a **Customize home** button when you are allowed to customize, and **Hide this message**, which lasts until the page is loaded again.

| Message | Cause | Home page shown |
| --- | --- | --- |
| **The home layout is not applied** | None of the sections of the layout exists on this home page any more (Jellyfin update, plugin removed, Jellyfin home settings), checked five seconds after the page opens | The default home page |
| **The home layout is not applied** | The layout only holds sections rendered by Customized Home and the administrator turned them off | The default home page |
| **Nothing to show on the home page** | Every section of the layout is hidden | Nothing: the layout stays in charge |
| **Nothing to show on the home page** | The sections exist but are empty for now (nothing in progress, empty library), and there is no hero | Nothing: the layout stays in charge |

Fix: open the editor and show or add sections, or reset the layout. When the layout is managed by the administrator, the message says to ask them.

## Hero banner

The hero is a carousel of featured media at the top of the home page. It is set in the editor, in the pinned **Hero banner** row above the left column: a switch turns it on, **Hero settings** (icon `tune`) opens its menu. It is saved with the layout, so each user has their own, and the administrator can put one in the default layout. A layout may hold the hero alone: it is then displayed above the unchanged Jellyfin home page.

| Setting | Values | Default |
| --- | --- | --- |
| **Sources (combined)** | Random, Recently added movies, Recently added shows, Latest movies (release date), Latest shows (release date) | Recently added movies and shows when the hero is first turned on |
| **Number of media** | 1 to 12 | 6 |
| **Automatic rotation** | 3 s, 5 s, 10 s, manual | 10 s |
| **Skip media already watched** | on / off | on |
| **Only media with a backdrop image** | on / off | on |

Each slide shows the backdrop, the logo (or the title), year, runtime, rating, community and critic scores, genres and the synopsis, with these actions: **Play** or **Resume** (plus **From the beginning**), **Trailer**, **Favorite**, **Watched**, **More info**. Unticking the last source turns the hero off. Rotation pauses while the pointer or the keyboard focus is on the hero and while the tab is hidden; a pause / play button sits next to the dots; rotation is disabled when the system asks for reduced motion.

The hero needs the administrator option **Offer the sections rendered by this plugin**.

## Administrator page

Dashboard, Plugins, Customized Home. Three tabs.

### Options tab

The **Status** card shows a badge, an explanation and three figures (File Transformation version, users with their own layout, sections in the default layout), plus a **Retry registration** button.

| Option | Default | Effect |
| --- | --- | --- |
| **Force the default layout for everybody** | off | Everybody gets the default layout and nobody can customize, administrators included. The two user entry points below and **Allow users…** are turned off and locked. Saved user layouts are kept and used again when the option is turned off |
| **Allow users to customize their own home page** | on | When off, every user gets the default layout. Administrators can always customize their own page |
| **"Customize home" button at the bottom of the home page** | on | The round button below the last section |
| **"Customize home" entry in the user menu** | on | The entry in the user menu |
| **Offer the sections rendered by this plugin** | on | Makes the plugin sections and the hero available in the editor |
| **Developer mode** | off | The client script and stylesheet are never cached. Leave off in production |

**Save options** applies the changes.

### Layouts tab

- **Default layout**: the same editor as the users', embedded in the page. The default layout applies to users without a layout of their own (or to everybody when forced). With no default layout, those users keep the regular Jellyfin home page. **Clear** empties it.
- **User layouts**: the users who saved a layout, with the number of sections and the date. **Reset** sends a user back to the default layout.

If the editor area says that the client script is not loaded, the script injection is not working: see [Troubleshooting](#troubleshooting).

### Genres tab

Thumbnails for the **All genres** section when its cards are set to **Custom images**. One image per card shape:

| Shape | Ratio | Best size |
| --- | --- | --- |
| Poster | 2:3 | 600 × 900 px |
| Landscape | 16:9 | 960 × 540 px |
| Square | 1:1 | 600 × 600 px |

PNG, JPEG or WebP, 5 MB maximum. The section picks the thumbnail that matches the shape of its cards, else another uploaded one (cropped), else the collage of posters.

## Troubleshooting

Start with the status badge of the **Options** tab.

| Badge | Meaning | What to do |
| --- | --- | --- |
| **Active** | The script is injected into the web client | If the home page does not change, the browser or a proxy serves an old page: see below |
| **File Transformation missing** | The File Transformation plugin is not installed, disabled, or failed to load | Install it (see [Installation](#installation)), check that it is **Active** in Dashboard, Plugins, then restart Jellyfin |
| **Registration failed** | File Transformation is there but refused the registration; the error is displayed | Update File Transformation and Customized Home, restart, then **Retry registration**. If it persists, open an issue with the error text |
| **Unavailable** | The page could not read the status | Reload the page; check the Jellyfin log |

**Nothing changes on the home page although the badge is Active:**

1. Hard refresh (Ctrl+F5, Cmd+Shift+R). The web client page is cached aggressively. In a mobile app, close the app completely, or clear its cache, and open it again.
2. Check that you are using a covered client (see [Supported versions and clients](#supported-versions-and-clients)). Android TV, Swiftfin, Kodi and other native apps never change.
3. Open the browser developer tools (F12):
   - In the page source of the web client, search for `data-plugin="CustomizedHome"`. If it is missing, the page you receive was not transformed: a cached copy from a reverse proxy or a CDN, or a web client that is not served by this Jellyfin server (a separately hosted jellyfin-web is not covered).
   - In the Network tab, `CustomizedHome/customized-home.js` and `customized-home.css` must answer 200 or 304. A 404 behind a reverse proxy usually means the path prefix is wrong: the script is requested under the **Base URL** configured in Jellyfin (Dashboard, Networking), which the status text displays as "Base URL prefix". The proxy must forward `/CustomizedHome/` like the rest of Jellyfin.
   - In the Console, run:

     ```js
     window.CustomizedHome.version
     window.CustomizedHome.sections()
     ```

     `window.CustomizedHome` undefined means the script is not loaded. `sections()` lists the sections found on the home page during the last pass, with the key, label and origin of each and the order applied to it. An empty list on the home page means the sections of the web client were not recognized: report it with your Jellyfin version.
4. No **Customize home** button: the administrator may have turned it off, disabled user customization or forced the default layout. The button is below the last section, at the very bottom of the page.
5. A section is missing from the editor: tick **Also list the Jellyfin sections that are not displayed right now**, or use the search. Sections of Home Screen Sections are only listed when that plugin is installed **and** renders the home page of that user (its "Modular Home" enabled); when it does, the built-in Jellyfin sections are not offered instead. The administrator editor of the default layout lists everything.
6. After a Jellyfin or plugin update, a hard refresh is needed once per browser.

**Reporting a problem.** Open an [issue](https://github.com/leguian/jellyfin-plugins/issues/new/choose) with the Jellyfin version, the plugin version, the File Transformation version (all three are on the administrator page), the client and browser, and the output of `window.CustomizedHome.sections()`. For a security problem, follow [SECURITY.md](../SECURITY.md) instead.

## Privacy and security

What the plugin stores, all of it on the Jellyfin server, under `plugins/configurations/` in the Jellyfin data directory (`/config/plugins/configurations/` in the official Docker image, `/var/lib/jellyfin/plugins/configurations/` with the Linux packages, `C:\ProgramData\Jellyfin\Server\plugins\configurations\` with the Windows installer):

| Path | Content |
| --- | --- |
| `Jellyfin.Plugin.CustomizedHome.xml` | The administrator options and the default layout |
| `Jellyfin.Plugin.CustomizedHome/users/<user id>.json` | One file per user who saved a layout: section keys, display labels (the label of a Jellyfin "recently added in a library" row is never stored; a row that could only be identified by its title keeps that title), order, visibility, formats, hero settings and chosen genres. No watch history, no media |
| `Jellyfin.Plugin.CustomizedHome/genres/` | The genre thumbnails uploaded by the administrator and their index (`index.json`) |

In the browser, the plugin keeps the collapsed or expanded state of layout folders in `localStorage`. Nothing is sent to any third party: the script only talks to your Jellyfin server. The one outgoing link is the **Trailer** button of the hero when a media has only a remote trailer: it opens that `http(s)` address, taken from the metadata of the media, in a new tab.

Access control:

| Endpoint | Access |
| --- | --- |
| `GET /CustomizedHome/customized-home.js`, `customized-home.css` | Anonymous: static client assets, the same for everybody, with no user data |
| `GET /CustomizedHome/GenreImages/Image` | Anonymous, like every Jellyfin image: serves only the genre thumbnails uploaded by the administrator |
| Layout, catalog and list of genre thumbnails | Signed-in user; a user reads and writes only their own layout |
| Default layout, status, user layouts, thumbnail upload and removal | Administrator |

Every layout sent by a client is validated and normalized by the server, and uploads are size limited (2 MB for a layout, 5 MB for a thumbnail). Thumbnails are identified from their bytes, never from the declared type; SVG is refused; files are named from a hash, never from user input. The default layout is written by an administrator who sees every library: before it is sent to a user, the server removes the "recently added" sections of libraries that user cannot access and sends no library name.

To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## Uninstalling

1. Dashboard, Plugins, Customized Home, **Uninstall**, then restart Jellyfin. The home page is back to the Jellyfin default after a hard refresh. Nothing else has to be undone: no file of the web client was modified.
2. Jellyfin removes the plugin folder only. To remove the leftover data, delete `Jellyfin.Plugin.CustomizedHome.xml` and the `Jellyfin.Plugin.CustomizedHome/` folder (user layouts and genre thumbnails) from `plugins/configurations/` (see [Privacy and security](#privacy-and-security) for the location). Keep them if you plan to reinstall: layouts are picked up again. This is on purpose: uninstalling and reinstalling is a common troubleshooting step and must not wipe every user's layout. The layout of a user deleted from Jellyfin is deleted with that user.
3. File Transformation can be uninstalled too if no other plugin needs it.

To turn the plugin off without uninstalling it, disable it in Dashboard, Plugins and restart Jellyfin.

## Known limits

- **Web client only.** Native apps (Android TV, Swiftfin, Kodi…) are not affected and cannot be.
- **It depends on the page structure of the Jellyfin web client.** A major Jellyfin release can change that structure; the plugin then needs an update. The automated tests run against a simulated home page, so a new Jellyfin version is only confirmed once checked on a real server.
- **The Jellyfin home settings still apply underneath.** A section turned off in Settings, Home does not exist on the page, so the layout cannot show it (the editor marks it "not displayed right now"). Sections rendered by Customized Home are not concerned.
- **Home Screen Sections in lazy loading mode** adds sections while you scroll: they are ordered when they arrive, so a section listed first may appear after a load.
- **Forced shape on a section that the plugin does not render**: the image stays the one chosen by the original section, cropped (a 16:9 thumbnail cropped to a poster, for example).
- **Plugin sections reload when the home page is shown again**, not while it stays on screen.
- The **Random** source of the hero costs a full sort on the server for very large libraries.
- **Right-to-left languages** are not specifically handled by the hero and the editor.
- **Folders** (collapsible groups of sections) exist in the layout format and are displayed, but the editor cannot create them any more; they can only come from the API or from a layout saved with an old version.
- **Custom CSS themes** that restyle the top bar can conflict with the transparent header over the hero.
- Interface languages: English and French.

## More

- Technical reference, section keys, API and layout format: [README.md](README.md) (French).
- Building, testing and contributing: [CONTRIBUTING.md](../CONTRIBUTING.md) and the [repository README](../README.md).
- License: [GPL-3.0](../LICENSE).
