# Security policy

## Supported versions

Only the latest release of each plugin receives security fixes. The latest version is the first entry of [`manifest.json`](manifest.json) and the most recent [GitHub release](https://github.com/leguian/jellyfin-plugins/releases).

| Plugin | Supported version |
| --- | --- |
| Customized Home | Latest release, on Jellyfin 10.11.x (from 10.11.0) and 12.x (from 12.0.0) |

Update the plugin before reporting: the problem may already be fixed.

## Reporting a vulnerability

Please do **not** open a public issue, discussion or pull request for a security problem.

Report it privately through GitHub security advisories:

1. Open <https://github.com/leguian/jellyfin-plugins/security/advisories/new> (repository page, **Security** tab, **Report a vulnerability**).
2. Describe the problem: the plugin and its version, the Jellyfin version, the client involved, the steps to reproduce, and what an attacker gains (which data or action, with which account: anonymous, regular user, administrator).
3. Attach a proof of concept when you have one. Remove tokens, passwords, server addresses and personal data from logs and screenshots.

If the **Report a vulnerability** button is not available, open a public issue that only says you would like to report a security problem privately, without any detail, and wait for a private channel.

## What to expect

- This is a project maintained on spare time: expect a first answer within about a week.
- The report is confirmed or declined with an explanation. A confirmed vulnerability is fixed in a new release, published through the plugin repository; the advisory is made public once the fix is available, with credit to the reporter unless you prefer to stay anonymous.
- Please give a reasonable delay for the fix to be released before disclosing the problem publicly.

## Scope

In scope: the code of this repository, that is the server side of the plugins (API, storage, validation), the client script injected into the Jellyfin web client, the administrator page and the release tooling.

Out of scope, to report to their own projects: Jellyfin itself and its web client ([Jellyfin security policy](https://github.com/jellyfin/jellyfin/security/policy)), the [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) plugin and other third-party plugins.

Design notes that are not vulnerabilities by themselves:

- The client script and stylesheet of Customized Home (`/CustomizedHome/customized-home.js`, `.css`) are served without authentication, like the Jellyfin web client itself. They are static and hold no user data.
- Genre thumbnails uploaded by an administrator (`/CustomizedHome/GenreImages/Image`) are served without authentication, like every Jellyfin image.
- Administrators are trusted: an administrator can already change anything on the server.

A way to read or change the layout of another user, to reach an administrator endpoint as a regular user, to learn about libraries a user cannot access, to store a file outside the plugin folder, or to run script in another user's session through data handled by the plugin is a vulnerability: please report it.
