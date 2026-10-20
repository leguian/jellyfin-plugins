# Parental Control (plugin Jellyfin)

> English user guide: [README.en.md](README.en.md).

Profils familiaux pour les enfants : contenus masqués ou autorisés, étiquettes, temps d'écran, interface simplifiée et connexion par code.

Le plugin transforme les réglages parentaux de Jellyfin en profils par enfant, avec une page d'administration complète. Le filtrage des contenus est **appliqué par le serveur** (tags + politique de l'utilisateur) : il vaut dans toutes les applis Jellyfin, applis TV comprises. Les fonctions d'interface (menus masqués, session verrouillée, écrans de fin, pavé de code) concernent le client web.

## Aperçu

| Fonction | Où elle s'applique | Mécanisme |
| --- | --- | --- |
| Masquer des titres, séries, collections, genres, tags | Toutes les applis | Tag `pc-hidden-<clé>` écrit sur les titres et leurs descendants, ajouté aux tags bloqués de l'utilisateur |
| Mode « uniquement ce que j'autorise » | Toutes les applis | Tag `pc-allowed-<clé>` écrit sur les titres autorisés, seul tag autorisé de l'utilisateur |
| Étiquettes (« OK pour Tim », « Fait peur ») | Toutes les applis | Tag au nom de l'étiquette, maintenu sur ses titres ; masquée ou autorisée par profil |
| Classification, contenus non classés, médiathèques | Toutes les applis | Réglages natifs de la politique utilisateur, édités en place |
| Horaires d'accès (grille hebdomadaire) | Toutes les applis | `AccessSchedules` natif : Jellyfin refuse connexion et requêtes hors horaires |
| Temps d'écran quotidien | Toutes les applis pilotables à distance | Comptage serveur des sessions en lecture ; message d'avertissement, puis message + arrêt de la lecture |
| Temps supplémentaire | Page admin, ou appareil de l'enfant avec le code parent | Bonus du jour |
| Droits (accès distant, téléchargements, suppression, TV, paramètres, SyncPlay, appareils simultanés) | Toutes les applis | Réglages natifs |
| Afficher l'enfant sur l'écran de connexion | Toutes les applis | `IsHidden` natif (les nouveaux comptes sont masqués par défaut) |
| Éléments d'interface masqués (recherche, favoris, SyncPlay, diffuser, paramètres, menu principal, déconnexion) | Client web | Règles CSS + marquage des boutons MUI par leur icône ; pages masquées renvoyées vers l'accueil |
| Session verrouillée | Client web | `Dashboard.logout` et `Dashboard.selectServer` demandent le code parent |
| Écran « c'est fini pour aujourd'hui » / « l'heure de faire une pause » | Client web | Plein écran, avec ajout de temps par le code parent |
| Pastille de temps restant | Client web | Coin bas gauche, décompte pendant la lecture |
| Pavé de code sur l'écran de connexion | Client web | Le code devient le mot de passe ; connexion via le formulaire natif |
| Activité | Page admin | 7 derniers jours (barres + limite) et derniers visionnages |

## Compatibilité

| Serveur Jellyfin | Paquet | Framework |
| --- | --- | --- |
| 12.x | `parental-control_<version>_jellyfin-12.zip` | .NET 10, compilé contre 12.0.0 |
| 10.11.x | `parental-control_<version>_jellyfin-10.11.zip` | .NET 9, compilé contre 10.11.0 |

Les deux API qui diffèrent entre les lignes (`IUserManager.Users`/`GetUsers()`, `ChangePassword(User|Guid, …)`) sont isolées dans `Helpers/JellyfinCompat.cs` (symbole `JELLYFIN_12` défini par le csproj).

Client web : layout moderne (MUI, défaut en 12.x) et layout legacy (`libraryMenu.js`). Les applis natives (Android TV, Swiftfin, Kodi…) reçoivent le filtrage, les horaires et l'arrêt de lecture, pas les options d'interface.

## Prérequis

- Jellyfin 10.11 ou 12.
- [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) pour les fonctions du client web. Sans lui, le filtrage, les horaires et la limite de temps fonctionnent ; la page admin le signale.

## Installation

1. Tableau de bord, Extensions, Dépôts : ajouter `https://raw.githubusercontent.com/leguian/jellyfin-plugins/main/manifest.json`.
2. Installer File Transformation depuis son propre dépôt, puis Parental Control.
3. Redémarrer le serveur, puis rafraîchir le navigateur (Ctrl+F5).
4. Tableau de bord, Parental Control : choisir un enfant, régler, enregistrer.

## Utilisation (page d'administration)

Trois onglets : **Famille**, **Étiquettes**, **Réglages**. Toute la page est en français ou en anglais selon la langue d'affichage de l'administrateur.

### Famille

Une carte par utilisateur : statut (Protégé, En pause, Non protégé, Administrateur), résumé du filtrage, temps du jour. Les administrateurs ne sont pas contrôlables (Jellyfin ne les limite pas).

L'éditeur d'un enfant a cinq sections, une barre « Modifications non enregistrées » en bas, et demande confirmation avant d'abandonner des modifications.

| Section | Contenu |
| --- | --- |
| Contenus | Mode (tout sauf masqué / uniquement autorisé), listes Autorisé et Masqué remplies par un sélecteur à affiches (Titres, Collections, Genres, Tags, Étiquettes, recherche), classification, contenus non classés, médiathèques, aperçu de ce que l'enfant voit (comptes + affiches, calculés par le serveur avec la politique de l'enfant) |
| Temps d'écran | Limite par jour (pas de 15 min, illimité par jour, préréglages par groupe de jours), avertissement, pastille, temps du jour (anneau) et bonus immédiat, horaires d'accès (grille à peindre à la souris ou au clavier, préréglages Jours d'école et En journée) |
| Interface | Éléments masqués dans l'appli web, session verrouillée (avertit si aucun code parent n'est défini) |
| Connexion et droits | Afficher sur l'écran de connexion, pavé de code, code de connexion (4 à 8 chiffres), droits natifs, appareils simultanés, retrait de la protection |
| Activité | 7 derniers jours, derniers visionnages (appareil, durée) |

Une grille horaire entièrement vide est refusée à l'enregistrement : pour Jellyfin, des horaires vides veulent dire « aucune limite ».

### Étiquettes

Création, couleur, cibles (titres, collections, genres). Le nom de l'étiquette est le tag écrit sur les titres. Les noms commençant par `pc-` sont réservés.

### Réglages

Code parent (haché PBKDF2-SHA256, 120 000 itérations), état de l'injection du script web, synchronisation des tags (dernière exécution, titres tagués, bouton « Synchroniser maintenant »), langue des messages envoyés aux lecteurs, mode développeur.

## Fonctionnement

### Filtrage par tags

- Chaque profil a une clé (`tim`, `lea-martin`, `tim-2`…) choisie une fois à la création, jamais modifiée.
- `TagSyncService` calcule les titres de chaque tag géré (étiquettes, `pc-hidden-<clé>`, `pc-allowed-<clé>` en mode liste blanche), puis ajoute ou retire les tags.
- **Les descendants sont tagués aussi** (saisons, épisodes, pistes, titres d'une collection) : Jellyfin 10.11 n'applique pas les tags d'une série à ses épisodes dans ses requêtes (« À suivre », « Derniers ajouts », recherche), et en mode liste blanche un épisode sans tag est invisible. Vérifié sur un serveur 12.2 réel.
- `tags.json` mémorise ce que le plugin a écrit : **un tag déjà présent sur un titre (métadonnées, autre outil) n'est jamais retiré**. Vérifié avec les mots-clés TMDb.
- Resynchronisation : 1 s après une modification, 90 s après la dernière modification de la médiathèque (scan, nouvel épisode, actualisation des métadonnées qui aurait effacé les tags), au démarrage, et chaque nuit (tâche planifiée « Apply parental control rules », 3 h 30).
- Politique : le plugin ne retire des listes Bloqués / Autorisés que ce qu'il y a écrit (`AppliedBlockedTags`, `AppliedAllowedTags`). Les tags ajoutés à la main sur la page utilisateur native restent.
- En mode liste blanche, le tag `pc-allowed-<clé>` est toujours présent dans la politique : une liste vide voudrait dire « tout » pour Jellyfin.

### Temps d'écran

- `ScreenTimeService` parcourt les sessions toutes les 15 s : temps compté par enfant (deux écrans en même temps comptent une fois), sessions en pause ou sans nouvelle depuis 3 min ignorées, écart plafonné à 30 s.
- Jour = heure locale du serveur. Données dans `usage.json` (35 jours, 100 visionnages par enfant), écrites au plus une fois par minute.
- À `WarningMinutes` de la fin : un message par jour. À la fin : message + commande Stop, répétée au plus toutes les 30 s par session ; une nouvelle lecture est arrêtée dès son démarrage. Un lecteur qui n'accepte pas le contrôle à distance ne peut pas être arrêté.

### Client web (`Web/parental-control.js`)

- `GET ParentalControl/Me` au chargement, puis toutes les 60 s (20 s pendant une lecture, 10 s à moins de 2 min de la fin), et au retour sur l'onglet.
- Masquage : une feuille de style générée (`html.pc-hide-<clé> <sélecteur>`), le marquage `data-pc-el` des boutons MUI trouvés par l'icône (`svg[data-testid]`), et un renvoi vers `#/home` des pages masquées.
- Connexion : un clic sur la carte d'un enfant à code (phase de capture) ouvre le pavé ; le code est soumis au formulaire natif (`#txtManualName`, `#txtManualPassword`, « Se souvenir de moi » coché), qui fait tout le reste. Le champ mot de passe vidé par jellyfin-web signale un refus.

### API

Route `ParentalControl`. `[Authorize]` partout sauf mention ; « admin » = `Policies.RequiresElevation`.

| Méthode | Chemin | Accès | Rôle |
| --- | --- | --- | --- |
| GET | `parental-control.js`, `parental-control.css` | anonyme | Assets du client (ETag) |
| GET | `SignIn` | anonyme | Utilisateurs à pavé de code : identifiant, longueur du code, autorisé maintenant (pas d'horaires) ; seulement les comptes visibles et actifs |
| GET | `Me` | `IgnoreParentalControl` | Contexte de l'utilisateur courant (fonctionne hors horaires) |
| POST | `Me/ParentPin` | `IgnoreParentalControl` | Vérifie le code parent (5 erreurs en 5 min : attente 5 min, par compte) |
| POST | `Me/Extend` | `IgnoreParentalControl` | Temps en plus (1 à 120 min) avec le code parent |
| GET | `Family` | admin | Utilisateurs et état de leur profil |
| GET / POST / DELETE | `Profiles/{userId}` | admin | Profil + réglages natifs |
| POST | `Profiles/{userId}/Bonus` | admin | Bonus du jour (±720 min) |
| POST | `Profiles/{userId}/Pin` | admin | Code de connexion (devient le mot de passe) |
| GET | `Profiles/{userId}/Preview` | admin | Ce que voit l'utilisateur (requêtes faites avec sa politique) |
| GET / POST | `Labels`, `Labels/{id}` ; DELETE `Labels/{id}` | admin | Étiquettes |
| GET | `Status` ; POST `Status/Retry`, `Sync`, `Options` ; POST / DELETE `ParentPin` | admin | Réglages |

Toute entrée est validée par `ProfileValidator` (listes ≤ 500 règles, étiquettes ≤ 100 avec ≤ 2000 cibles, horaires arrondis à la demi-heure, éléments d'interface connus, couleurs `#rrggbb`, limites de taille des requêtes).

### Données

| Où | Quoi |
| --- | --- |
| `plugins/configurations/Jellyfin.Plugin.ParentalControl.xml` | Profils, étiquettes, hash du code parent, options |
| `plugins/configurations/Jellyfin.Plugin.ParentalControl/usage.json` | Temps par jour, bonus, historique |
| `plugins/configurations/Jellyfin.Plugin.ParentalControl/tags.json` | Tags écrits par le plugin, par titre |
| Politique des utilisateurs (base Jellyfin) | Réglages natifs + tags bloqués / autorisés gérés |
| Titres (base Jellyfin, NFO si l'enregistrement des métadonnées locales est actif) | Tags des profils et des étiquettes |

## Build

```bash
# Jellyfin 12.x (défaut)
dotnet build parental-control/Jellyfin.Plugin.ParentalControl/Jellyfin.Plugin.ParentalControl.csproj -c Release
# Jellyfin 10.11.x
dotnet build parental-control/Jellyfin.Plugin.ParentalControl/Jellyfin.Plugin.ParentalControl.csproj -c Release -p:JellyfinVersion=10.11.0
# zip + checksum (depuis la racine du dépôt)
python3 scripts/package.py parental-control --jellyfin 10.11 --output artifacts
```

## Tests

```bash
dotnet test parental-control/Jellyfin.Plugin.ParentalControl.Tests -p:JellyfinVersion=10.11.0
node --check parental-control/Jellyfin.Plugin.ParentalControl/Web/parental-control.js
cd parental-control/tests
npm ci && npx playwright install chromium   # première fois
npm test
npm run typecheck
npm run screenshots   # captures dans test-results/screenshots
```

| Suite | Couvre |
| --- | --- |
| xUnit (177 tests) | Validation, clés de tags, PIN et limiteur, politiques (fusion, lecture / écriture natives), horaires, plan de synchronisation des tags (tags préexistants jamais retirés), temps d'écran (comptage, avertissement, arrêt, anti-répétition), service de profils (étiquettes renommées / supprimées, retour arrière si le disque refuse), contrôleur, assemblage du zip |
| Playwright (54 tests) | Masquage de chaque élément dans les deux layouts, renvoi des pages masquées, session verrouillée, pastille, écrans de fin et d'horaires, langue, changement d'utilisateur, pavé de connexion (code juste, faux, longueur inconnue, hors horaires, autres comptes), page admin complète (sélecteur, grille horaire souris et clavier, limites, étiquettes, réglages, français, contraste en thème clair) |

`PW_CHROMIUM=/chemin/chromium` : utiliser un Chromium installé au lieu de celui de Playwright.

Les tests navigateur tournent sur un jellyfin-web simulé (`tests/fixtures/web.html`) : ils ne détectent pas un changement de structure de jellyfin-web. Les sélecteurs ont été relevés sur jellyfin-web 12.2 (layouts moderne et legacy) et validés sur un serveur 12.2 réel ; à revérifier à chaque version majeure.

## Dépannage

| Symptôme | Cause probable |
| --- | --- |
| Rien ne change dans l'appli web (menus, écrans) | File Transformation absent ou en échec (onglet Réglages), ou cache : Ctrl+F5 |
| Un titre masqué reste visible quelques secondes | Synchronisation en cours (onglet Réglages) ; l'aperçu de l'éditeur le signale |
| Un nouvel épisode d'une série masquée apparaît | Resynchronisation 90 s après la fin du scan ; sinon « Synchroniser maintenant » |
| L'enfant n'apparaît pas sur l'écran de connexion | « Afficher sur l'écran de connexion » (Connexion et droits) |
| Le pavé de code ne s'ouvre pas | « Connexion avec un pavé de code » désactivé, ou compte masqué / désactivé |
| La lecture ne s'arrête pas à la fin du temps sur une appli | L'appli n'accepte pas le contrôle à distance ; l'appli web, elle, affiche l'écran de fin |

## Désinstallation et données résiduelles

Désinstaller le plugin **ne retire pas** ce qu'il a écrit : les tags restent sur les titres et dans les politiques, donc les restrictions continuent de s'appliquer (comportement sûr par défaut). Pour tout retirer proprement : supprimer d'abord les profils (« Retirer la protection ») et les étiquettes, attendre la synchronisation, puis désinstaller. Le dossier `Jellyfin.Plugin.ParentalControl` des configurations de plugins peut ensuite être supprimé.

## Points de vigilance

- **Le client web n'est pas une frontière de sécurité.** Session verrouillée et menus masqués découragent un jeune enfant ; un enfant qui efface les données du navigateur ou installe une autre appli contourne l'interface. Le filtrage, les horaires et la limite de temps, eux, sont appliqués par le serveur.
- **Code de connexion court + accès distant = risque.** Un code de 4 chiffres se devine depuis Internet malgré le verrouillage de compte de Jellyfin (qui désactive le compte après quelques échecs). La page avertit ; désactiver l'accès distant des comptes enfants.
- Le code parent est limité à 5 essais par 5 minutes et par compte ; il est haché, jamais stocké en clair.
- `SignIn` est anonyme : il ne révèle que des identifiants déjà publics (écran de connexion), la longueur du code et un booléen « autorisé maintenant », jamais les horaires.
- Les tags sont écrits dans les métadonnées : avec l'enregistrement NFO actif, ils arrivent aussi dans les fichiers `.nfo`.
- Le temps d'écran se compte en lecture, pas en navigation. Les jours suivent l'heure locale du serveur.
- Une actualisation « remplacer toutes les métadonnées » efface les tags ; le plugin les réécrit à la synchronisation suivante.

## Vérifié sur serveur réel, et ce qui ne l'est pas

| Vérifié | Comment |
| --- | --- |
| Jellyfin 12.2 (serveur + jellyfin-web compilés depuis les sources), zip de release 12 | Filtrage liste noire et liste blanche (titres, épisodes, « Derniers ajouts », recherche, accès direct en 404), étiquettes, préservation des tags TMDb, comptage du temps d'écran et arrêt de lecture, pavé de connexion, session verrouillée, écrans de fin et d'horaires, masquage dans les layouts moderne (large et mobile) et legacy, page d'administration |
| Jellyfin 10.11.0 (serveur compilé depuis les sources), zip de release 10.11 | Filtrage côté API dans les deux modes, y compris « À suivre » avec un historique de visionnage |

Non vérifié :

- Client web 10.11 (jellyfin-web 10.11) : les sélecteurs viennent de jellyfin-web 12.2 ; le layout legacy de 10.11 utilise les mêmes classes, le layout moderne de 10.11 n'a pas été contrôlé.
- Applis natives (Android TV, Swiftfin, Kodi) : arrêt de lecture et messages dépendent de leur prise en charge du contrôle à distance.
- Thème clair du tableau de bord sur un vrai serveur (vérifié sur la page simulée, contraste WCAG AA mesuré).

## Licence

[GPL-3.0](../LICENSE).
