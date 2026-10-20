# Tests Parental Control

Deux niveaux, complémentaires.

## Tests navigateur (CI)

Le script client et la page d'administration tournent sur un jellyfin-web simulé (`fixtures/web.html`, layouts
moderne et legacy, page de connexion) avec un `ApiClient` factice (`fixtures/apiClientStub.js`). Aucun serveur requis.

```bash
npm ci
npx playwright install chromium        # ou PW_CHROMIUM=/chemin/chromium pour un Chromium déjà installé
npm test
npm run typecheck
npm run screenshots                    # captures dans test-results/screenshots, à regarder après un changement d'UI
```

Limite : ces tests ne détectent pas un changement de structure de jellyfin-web.

## Recette sur un vrai serveur (`server/`, hors CI)

Serveur Jellyfin et client web compilés depuis les sources, File Transformation, médias factices, plugin installé depuis
le zip produit par `scripts/package.py` (le même que la release). Tout vit dans `PC_TEST_DIR`
(défaut `~/.cache/parental-control-tests`).

Prérequis : dotnet SDK 10, node >= 24 + npm >= 11 (client web), ffmpeg, git, python3.

| Script | Rôle |
| --- | --- |
| `server/setup-env.sh` | Clone et compile le serveur et jellyfin-web (`JELLYFIN_TAG`, défaut `v12.2`), File Transformation ; génère les médias. `--skip-web` : serveur seul |
| `server/install-plugin.sh` | Package le plugin (`LINE=12` ou `10.11`) et l'installe avec File Transformation |
| `server/restart-server.sh` | (Re)démarre le serveur en arrière-plan et attend l'API |
| `server/api_test.py` | Assistant de démarrage, utilisateurs, médiathèques, puis 25 vérifications : filtrage liste noire et liste blanche (titres, épisodes, derniers ajouts, à suivre, recherche, accès direct), étiquettes, politiques, temps d'écran, nettoyage |

```bash
tests/server/setup-env.sh
tests/server/install-plugin.sh && tests/server/restart-server.sh
python3 -I tests/server/api_test.py
```

Pour Jellyfin 10.11 : `JELLYFIN_TAG=v10.11.0 JELLYFIN_NUGET=10.11.0 tests/server/setup-env.sh --skip-web`, puis
`LINE=10.11 tests/server/install-plugin.sh`. Repartir d'un `jf-data` vide (le supprimer) pour une recette depuis zéro.

Si l'accès direct à `github.com` est bloqué, `setup-env.sh` remplace la dépendance `classlist.js` de jellyfin-web par
un clone local. Les requêtes vers le serveur de test ne passent jamais par un proxy.
