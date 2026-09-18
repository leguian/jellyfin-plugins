# Tests Customized Home

Environnement de test complet, hors dépôt (dans `CH_TEST_DIR`, défaut `~/.cache/customized-home-tests`) :
serveur Jellyfin et client web compilés depuis les sources, File Transformation (et Home Screen Sections
en option), médias factices, vérifications Playwright sur la vraie page d'accueil.

Prérequis : dotnet SDK 10, node ≥ 24 + npm ≥ 11, ffmpeg, git, python3, lsof. Environ 25 min pour le
premier `setup-env.sh` (build de jellyfin-web).

| Script | Rôle |
| --- | --- |
| `setup-env.sh` | Clone + build serveur (`JELLYFIN_BRANCH`, défaut `release-12.z`), jellyfin-web, File Transformation, Plugin Pages, HSS ; médias ; Playwright. Options `--skip-web`, `--skip-server`, `--skip-plugins` |
| `install-plugin.sh` | Compile le plugin (version de `build.yaml`) et l'installe dans le dossier plugins du serveur de test |
| `restart-server.sh` | (Re)démarre le serveur en arrière-plan et attend l'API (`run-server.sh` = premier plan) |
| `api-test.sh` | Assistant de démarrage (admin / admin123), tests API du plugin (layout, permissions, assets, validation), création des médiathèques |
| `prep-integrated.sh` | Historique de visionnage, genres, collection, disposition avec sections intégrées et formats |
| `enable-hss.sh` | Installe Plugin Pages + Home Screen Sections et active « Modular Home » pour l'admin |
| `e2e/test-home.js` | Accueil natif : injection, éditeur, glisser-déposer, masquage, persistance, repli, menu utilisateur |
| `e2e/probe-integrated.js` | Sections intégrées, formats, navigation, changement de forme |
| `e2e/probe-admin.js` | Recherche dans l'éditeur, page admin (onglets, éditeur intégré), image du plugin |
| `e2e/probe-hss.js` / `probe-hss-sim.js` | Accueil rendu par HSS (réel / simulé) |

Séquence type :

```bash
tests/setup-env.sh
tests/install-plugin.sh && tests/restart-server.sh
tests/api-test.sh
tests/prep-integrated.sh
cd tests/e2e && npm run test:home && npm run test:integrated && npm run test:admin
```

Variables : `JF_BASE` (défaut `http://127.0.0.1:8096`), `JF_ADMIN_USER` / `JF_ADMIN_PASS`, `CHROME`
(chemin d'un Chromium si Playwright ne doit pas télécharger le sien), `CH_TEST_DIR`.

Captures d'écran : `tests/e2e/shots/` (ignoré par git).

Notes :
- Si l'accès direct à `github.com` est bloqué, `npm ci` de jellyfin-web échoue sur la dépendance
  `classlist.js` (tarball GitHub) : cloner `eligrey/classList.js` (tag `1.2.20180112`) et remplacer la
  dépendance par `"classlist.js": "file:../classListjs"` puis `npm install`.
- Les serveurs de test répondent sans proxy : les scripts Playwright lancent Chromium avec `--no-proxy-server`.
