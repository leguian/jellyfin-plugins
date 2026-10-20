# Parental Control (Jellyfin plugin): user guide

> Documentation en français (référence technique complète : fonctionnement interne, API, tests) : [README.md](README.md).

Parental Control turns the parental settings of Jellyfin into family profiles, one per child, edited from one page: what the child can see, when, for how long, and how they sign in.

<!--
Screenshots: to be added by the maintainer from a live Jellyfin server (family, profile editor, end of time screen, PIN pad).
Do not use the captures produced by "npm run screenshots": they show the simulated test page.
-->

## Contents

- [What it does, and what it does not](#what-it-does-and-what-it-does-not)
- [Supported versions and clients](#supported-versions-and-clients)
- [Installation](#installation)
- [First use](#first-use)
- [Profile editor](#profile-editor)
- [Labels](#labels)
- [Settings tab](#settings-tab)
- [What the child sees](#what-the-child-sees)
- [Troubleshooting](#troubleshooting)
- [Privacy and security](#privacy-and-security)
- [Uninstalling](#uninstalling)
- [Known limits](#known-limits)

## What it does, and what it does not

| It does | It does not |
| --- | --- |
| Hide titles, series, collections, genres or tags from a child, in **every** Jellyfin app (TV apps included): the server enforces it | Replace the Jellyfin user page: it edits the same settings, both stay in sync |
| Show a child **only** what you allow: new titles stay hidden until you allow them | Filter content of other users or administrators (Jellyfin never limits administrators) |
| Keep labels on titles (for example "Good for Tim", "Scary"), new episodes and collection members included | Turn the web client into a security boundary: a child who clears the browser data gets past the interface options (not past the content filtering, hours or screen time) |
| Set the age rating, unrated content, libraries, access hours (weekly grid) and permissions | Stop playback on apps that cannot be remote controlled |
| Limit the daily screen time per day of the week, warn before the end, stop the playback at the end, and let a parent add time | |
| In the web app: hide menu elements, lock the session behind a parent PIN, show the time left, a friendly screen when the time is up or outside the hours, and a big PIN pad on the sign-in page | |
| Show the activity of the last 7 days and the recent playback | |

The pages are in English and French, following the display language of the Jellyfin user.

## Supported versions and clients

| Jellyfin server | Supported |
| --- | --- |
| 12.x | from 12.0.0 |
| 10.11.x | from 10.11.0 |

| Feature | Web app (browsers, Android and iOS apps, Jellyfin Desktop) | Native apps (Android TV, Swiftfin, Kodi…) |
| --- | --- | --- |
| Hidden / allowed content, labels, age rating, libraries | Yes | Yes |
| Access hours | Yes, with a "time for a break" screen | Yes (sign-in and requests refused) |
| Daily screen time | Yes, with the time left and an end screen | Counted; warning message and stop if the app accepts remote control |
| Hidden menu elements, locked session, PIN pad | Yes | No |

## Installation

1. In the Dashboard, Plugins, Repositories, add `https://raw.githubusercontent.com/leguian/jellyfin-plugins/main/manifest.json`.
2. Install **File Transformation** from its own repository (`https://www.iamparadox.dev/jellyfin/plugins/manifest.json`). It injects the web app part of the plugin. Without it, content filtering, hours and screen time still work.
3. Install **Parental Control** from the catalog, restart the server, then refresh the browser once (Ctrl+F5).
4. Open Dashboard, Parental Control.

## First use

1. **Family** tab: click the child to protect.
2. **Content**: choose "Everything, except what I hide" or "Only what I allow", then add titles with the picker (posters, search, collections, genres, tags, labels).
3. **Screen time**: turn the daily limit on, set the minutes per day, paint the access hours on the grid.
4. **Sign-in & permissions**: show the child on the sign-in screen, turn the PIN pad on, set their PIN.
5. Click **Save** in the bar at the bottom of the screen.
6. **Settings** tab: set the parent PIN (needed to lock a session and to add time from a child's device).

The "What … sees right now" card shows how many movies, series, collections and albums the child can see, counted by the server with the saved settings.

## Profile editor

| Section | What you set |
| --- | --- |
| Content | Mode, Allowed and Hidden lists, highest age rating, unrated content to hide, libraries, preview |
| Screen time | Daily limit (15 minute steps, "no limit" per day, presets for every day, weekdays or the weekend), warning before the end, time left shown or not, today's use and extra time, access hours |
| Interface | Web app elements to hide: Search, Favorites, SyncPlay, Cast, Settings and profile, Main menu, Sign out; locked session |
| Sign-in & permissions | Shown on the sign-in screen, PIN pad, sign-in PIN, remote access, downloads, media deletion, live TV, own settings, SyncPlay, simultaneous devices; remove the protection |
| Activity | Playback time of the last 7 days against the limit, recently watched titles with the device |

Good to know:

- Hiding a series hides its seasons and episodes; hiding a collection hides every title in it. Something hidden stays hidden in "Only what I allow" mode too.
- "Protection on" off pauses the profile: settings are kept, nothing is applied.
- The access hours are the server's local time. An empty grid cannot be saved: to Jellyfin, empty hours mean no limit at all; turn the access hours off instead.
- Extra time ("+15 min" and so on) applies at once, for today only.
- The sign-in PIN becomes the password of the account, so it also works in the other apps.

## Labels

A label is a Jellyfin tag the plugin writes on the titles, collections and genres you choose, and keeps there: new episodes of a series and new members of a collection get it too, and so do titles whose metadata were refreshed. Hide or allow a label in any profile. Labels also show up as regular tags in Jellyfin. Names starting with `pc-` are reserved.

## Settings tab

| Card | Use |
| --- | --- |
| Parent PIN | 4 to 8 digits, stored hashed. Five wrong attempts on a device lock it for five minutes |
| Web client script | Whether File Transformation injects the web app part, with a retry button |
| Tag synchronization | Last run, titles carrying a tag of the plugin, "Synchronize now". It also runs after library scans and every night (scheduled task "Apply parental control rules") |
| Options | Language of the messages shown on the players (server language, French, English), developer mode |

## What the child sees

- **Sign-in page**: their avatar has a keypad badge; tapping it opens a big PIN pad that signs in as soon as the code is typed. Outside their hours, a moon badge and a "time for a break" message instead.
- **While watching**: a small "42 min left" badge in a corner of the screen; a message on the player a few minutes before the end.
- **At the end of the time**: the playback stops and a "That's all for today!" screen covers the app. A parent can add 15, 30 or 60 minutes with the parent PIN.
- **Outside the access hours**: a "Time for a break" screen saying when they can come back.
- **Locked session**: signing out or changing server asks for the parent PIN.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Nothing changes in the web app | Settings tab, Web client script: File Transformation must be installed and active. Then Ctrl+F5 |
| A hidden title is still visible for a few seconds | The tags are being written (Settings tab, Tag synchronization) |
| A new episode of a hidden series shows up | It is tagged 90 seconds after the end of the library scan; "Synchronize now" does it at once |
| The child is not on the sign-in screen | Sign-in & permissions, "Show … on the sign-in screen" |
| The PIN pad does not open | "Sign in with a PIN pad" is off, or the account is hidden or disabled |
| Playback does not stop at the end of the time in an app | The app does not accept remote control: the time is still counted and the web app shows its end screen |

## Privacy and security

- Content filtering, access hours and screen time are enforced by the server. The interface options of the web app (hidden menus, locked session) only discourage a young child.
- A short PIN on an account with remote access can be guessed from the Internet: the page warns you; turn remote access off for children's accounts.
- The parent PIN is hashed (PBKDF2), never stored as is, and limited to five attempts per five minutes per account.
- The anonymous sign-in information only tells which visible accounts use a PIN pad, the PIN length and whether the account may sign in right now; never the hours.
- Screen time and playback history stay on your server (`usage.json`, 35 days).

## Uninstalling

Uninstalling the plugin keeps what it wrote: the tags stay on the titles and in the accounts, so the restrictions keep applying (safe by default). To remove everything: first remove the protection of every child and delete the labels, wait for the synchronization (Settings tab), then uninstall. You can then delete the `Jellyfin.Plugin.ParentalControl` folder of the plugin configurations.

## Known limits

- The web app features depend on the structure of the Jellyfin web client: they were checked on Jellyfin 12.2. A major Jellyfin update may move things.
- Screen time counts playback, not browsing. Days follow the server's local time.
- With "Save metadata into media folders" (NFO) on, the tags also go into the `.nfo` files.
- A "Replace all metadata" refresh drops the tags for a moment: the plugin writes them back at the next synchronization.
