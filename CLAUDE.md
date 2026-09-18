# CLAUDE.md — jellyfin-plugins

> Surcharge le CLAUDE.md global. Ce dépôt n'est PAS un projet Next.js : les règles globales Next.js / Tailwind / Zod / Supabase / Stripe / lucide-react / Radix ne s'appliquent pas ici. Les règles de communication, de langue du code et de workflow restent valables.

## Nature du dépôt

Plugins Jellyfin, un sous-dossier par plugin. Actuellement : `customized-home/`.

| Couche | Techno | Où |
|--------|--------|----|
| Serveur | C# (.NET 10 pour Jellyfin 12.x, .NET 9 pour 10.11.x) | `customized-home/Jellyfin.Plugin.CustomizedHome/` |
| Client | JavaScript vanilla + CSS, injectés dans jellyfin-web | `.../Web/customized-home.{js,css}` |
| Page admin | HTML + JS inline, embarquée en ressource | `.../Configuration/configPage.html` |
| Tests | Playwright + TypeScript strict | `customized-home/tests/` |
| Outillage | Python (packaging, manifest), GitHub Actions | `scripts/`, `.github/workflows/` |

## Contraintes techniques (non négociables)

- **JS client = vanilla, un seul fichier, pas de build, pas de dépendance.** Il est injecté tel quel dans jellyfin-web via le plugin File Transformation. Pas de TypeScript, pas de framework, pas d'import.
- **CSS custom obligatoire** (pas de Tailwind). Classes préfixées `ch-` (client) et `cha-` (page admin). Couleurs de surface dérivées de `currentColor` via `color-mix` : le dashboard peut être clair ou sombre.
- **Icônes : Material Icons** (police fournie par jellyfin-web), par nom (`other_houses`, `tune`…). Jamais de caractère unicode en guise d'icône.
- **Ne jamais déplacer les sections de l'accueil dans le DOM.** L'ordre se fait par `order` CSS sur un conteneur flex : déplacer un `emby-itemscontainer` réinitialise ses données.
- **Dépendance au DOM de jellyfin-web** : `#homeTab .sections`, `.verticalSection`, classes `sectionN`. À revérifier à chaque version majeure de Jellyfin.
- **File Transformation** : enregistrement par réflexion, clé de pipeline `index.html` (chaîne exacte partagée avec les autres plugins, sinon un seul pipeline s'exécute). Le callback doit laisser intact tout contenu sans `</body>`.
- **Le CSS du dashboard plafonne `form` à 54em** : toute page admin doit le surcharger explicitement.
- C# : `TreatWarningsAsErrors`, analyzers actifs. Logs via `[LoggerMessage]`. API : `[Authorize]` partout sauf assets client, admin via `Policies.RequiresElevation`. Toute entrée client est validée et normalisée côté serveur (`LayoutValidator`).
- Textes UI du client : FR + EN dans la table `I18N` du JS. Page admin : anglais.

## Commandes

```powershell
# Build (le SDK .NET 9 local ne compile que la cible 10.11 ; la cible 12.x est validée par la CI)
dotnet build customized-home/Jellyfin.Plugin.CustomizedHome/Jellyfin.Plugin.CustomizedHome.csproj -c Release -p:JellyfinVersion=10.11.11

# Tests unitaires C# (validation des dispositions, stockage des miniatures)
dotnet test customized-home/Jellyfin.Plugin.CustomizedHome.Tests -p:JellyfinVersion=10.11.11

# Packaging, identique à ce que fait la release (zip dans artifacts/, ignoré par git)
python scripts/package.py customized-home --jellyfin 10.11.11 --output artifacts

# Syntaxe du script client
node --check customized-home/Jellyfin.Plugin.CustomizedHome/Web/customized-home.js

# Tests navigateur (aucun serveur Jellyfin requis)
cd customized-home/tests
npm test
npm run typecheck
npm run screenshots   # captures dans test-results/screenshots, à regarder après tout changement d'UI
```

Avant tout push : build + `dotnet test` + `node --check` + `npm test` + `npm run typecheck` + **packaging** (`python scripts/package.py customized-home --jellyfin 10.11.11 --output artifacts`). Le packaging est ce que la release exécute : l'oublier a déjà cassé une release (ajout d'un second `.csproj`). Après un changement d'UI : `npm run screenshots` et contrôle visuel des captures.

## Tests

- DOM de l'accueil simulé (`tests/fixtures/home.html`) + `ApiClient` factice (`apiClientStub.js`). La fixture reproduit les règles CSS de jellyfin-web qui nous ont déjà piégés (plafond des `form`).
- Toute nouvelle fonctionnalité du client ou de la page admin arrive avec son test. Un test doit échouer quand on retire le code qu'il couvre : le vérifier.
- Limite connue : ces tests ne détectent pas un changement de structure de jellyfin-web. Le dire quand c'est pertinent, ne pas présenter un test vert comme une validation sur serveur réel.

## Git et release

- 1 évolution = 1 branche (`feat/…`, `fix/…`, `chore/…`), Conventional Commits en anglais.
- **Après chaque merge dans `main` : supprimer la branche mergée, en local et sur GitHub, systématiquement** (`git branch -d` puis `git push origin --delete`). Vérifier d'abord qu'elle est bien mergée.
- **Release = changement de `version` dans `customized-home/build.yaml` mergé dans `main`.** Le workflow `release.yml` crée le tag `customized-home-v<version>`, construit les deux zips, publie la release et met à jour `manifest.json`. Sans changement de version, rien n'est publié.
- À chaque bump, aligner : `build.yaml` (`version`, `changelog`), `<Version>` du csproj, `const VERSION` du JS.
- Ne jamais merger dans `main` ni publier sans demande explicite : une release est irréversible.
- Après un merge : attendre les workflows, puis vérifier tag + manifest **dans git** (`git show origin/main:manifest.json`). `raw.githubusercontent.com` a ~5 min de cache.
- Textes descriptifs à garder alignés : `Plugin.cs` (`Description`), `build.yaml` (`overview`), csproj (`<Description>`), sous-titre de `configPage.html`, tableau du `README.md` racine.
- Fins de ligne : LF partout (`.gitattributes`).

## Environnement (Windows)

- PowerShell par défaut. **Pas de heredoc bash inline contenant des backticks ou des apostrophes** : bash les interprète (incident réel : commandes exécutées par erreur). Pour tout patch multi-fichiers, écrire un script Python dans le scratchpad puis l'exécuter, avec des `assert` sur chaque remplacement.
- Vérifier `git status` avant de merger ou de committer : l'utilisateur modifie aussi le dépôt depuis IntelliJ. Ne jamais committer ni écraser une modification qui n'est pas la sienne sans l'avoir montrée.

## Documentation

- `customized-home/README.md` (français) : fonctionnement, sections, API, tests, points de vigilance. À mettre à jour dans le même commit que le code.
- Signaler ce qui n'a pas été vérifié (serveur réel, cible 12.x en local, thème clair du dashboard).
