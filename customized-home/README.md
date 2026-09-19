# Customized Home (plugin Jellyfin)

> **EN summary** – Customized Home lets every Jellyfin user reorganize the home screen: reorder sections by drag and drop, hide/show them, pick a display format per section and enable extra sections rendered by the plugin (combined continue watching / next up, latest by release date, collections, watch again, because you watched, genre). Administrators define a default layout. Works with the built-in sections and with sections injected by other plugins (Home Screen Sections, Jellyfin Enhanced…). Requires the [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) plugin. Builds for Jellyfin 12.x (net10.0) and 10.11.x (net9.0).

Plugin Jellyfin qui permet de réorganiser la page d'accueil du client web :

| Fonction | Détail |
| --- | --- |
| Ordre | Glisser-déposer des sections (souris et tactile) |
| Afficher / masquer | Chaque section (et chaque dossier) peut être masquée sans être supprimée de la liste |
| Dossiers | Pris en charge par le modèle (en-tête repliable) mais plus créables depuis l'éditeur ; utilisables via l'API |
| Par utilisateur | Chaque utilisateur enregistre sa propre disposition côté serveur (suivie sur tous ses appareils) |
| Disposition par défaut | Définie par l'administrateur, appliquée aux utilisateurs sans disposition, peut être forcée pour tous |
| Sections inconnues | Toute section ajoutée par un autre plugin est détectée et peut être rangée (clé dérivée de son titre) |
| Sections intégrées | Sans autre plugin : Continuer à regarder / À suivre (combiné), Derniers films et Dernières séries (date de sortie), Collections, Regarder à nouveau, Parce que vous avez regardé…, Genre |
| Format par section | Forme des cartes (par défaut, affiche, paysage, carré), taille (petite, normale, grande), titres affichés ou non |

## Compatibilité

| Élément | Support |
| --- | --- |
| Jellyfin 12.x | oui (build `net10.0`, `targetAbi 12.0.0.0`) |
| Jellyfin 10.11.x | oui (build `net9.0`, `targetAbi 10.11.0.0`) |
| Client web (navigateur), apps Android / iOS officielles (web UI embarquée), Jellyfin Desktop | oui |
| Android TV, Swiftfin, Kodi, autres apps natives | non (elles n'utilisent pas jellyfin-web) |
| Home Screen Sections ("Modular Home") | oui, sections identifiées par leur identifiant HSS |
| Jellyfin Enhanced, Jellyfin Tweaks, Intro Skipper | cohabitation OK (aucun conflit de patch : seul `index.html` est transformé) |

## Prérequis

- Plugin **File Transformation** (dépôt `https://www.iamparadox.dev/jellyfin/plugins/manifest.json`). Il injecte le script client dans `index.html` sans modifier les fichiers sur disque. Sans lui, le plugin se charge mais l'accueil n'est pas modifié (le statut est visible dans la page de configuration).

## Installation

1. Tableau de bord → Plugins → Dépôts → ajouter `https://raw.githubusercontent.com/leguian/jellyfin-plugins/main/manifest.json`.
2. Catalogue → **Customized Home** → Installer, puis redémarrer Jellyfin.
3. Vérifier dans Tableau de bord → Plugins → Customized Home que le statut indique « Client script registered with File Transformation ».
4. Rafraîchir le client web (Ctrl+F5) : un bouton **Personnaliser l'accueil** apparaît en bas de l'accueil et une entrée dans le menu utilisateur.

Installation manuelle : dézipper `customized-home_<version>_jellyfin-<abi>.zip` dans `<data>/plugins/CustomizedHome_<version>/` puis redémarrer.

## Utilisation

### Éditeur (utilisateur)

- Ouvrir via le bouton en bas de l'accueil ou le menu utilisateur → **Personnaliser l'accueil**.
- Deux colonnes : **Page d'accueil modifiée** (la disposition) et **Sections hors disposition** (tout le reste).
- **Règle** : dès que la colonne de gauche contient au moins une section, elle remplace la page d'accueil par défaut (les sections hors disposition ne sont plus affichées). Colonne vide = page d'accueil Jellyfin inchangée.
- Colonne de droite : bouton `+` **Ajouter à la page d'accueil modifiée**, la section arrive tout en haut. Pas d'autre action.
- Colonne de gauche : `👁` afficher / masquer, bouton format, `✕` supprimer de la page d'accueil modifiée. Le menu format (forme, taille, titre de la section, titres des cartes, genres) reste ouvert pendant les choix ; clic extérieur ou Échap pour le fermer.
- Pictos : maison = section rendue par Customized Home, logo Jellyfin = section par défaut du client web, puzzle = autre plugin. Légende en haut de l'éditeur, info-bulle sur chaque icône. Pendant une recherche, bouton au survol **Remonter cette section tout en haut**.
- Glisser la poignée `⋮⋮` pour réordonner, glisser d'une colonne à l'autre pour ajouter ou retirer (désactivé pendant une recherche).
- Champ **Rechercher une section** : filtre la liste et retrouve aussi les sections connues mais pas encore affichées.
- Sous-titre d'une ligne : origine de la section (Jellyfin, Home Screen Sections, Customized Home) et « non affichée actuellement » quand la section est connue mais pas rendue sur l'accueil en ce moment (désactivée dans les réglages d'accueil Jellyfin, vide, plugin absent).
- **Afficher toutes les sections connues** : liste aussi les sections du catalogue non présentes actuellement (utile pour préparer une disposition).
- Menu `⋮` → **Format d'affichage** : forme, taille et titres de la section. Sur les sections natives ou HSS le changement de forme est appliqué en CSS (recadrage de l'image existante) ; sur les sections intégrées l'image adaptée est chargée (affiche pour portrait, vignette / fond pour paysage).
- Les sections intégrées (badge « Intégrée à Customized Home ») apparaissent dans la liste, masquées : `👁` pour les activer. Données chargées côté client via l'API Jellyfin, cache 5 minutes.
- **Réinitialiser** : supprime la disposition personnelle → retour à la disposition par défaut.
- L'état replié / déplié d'un dossier est mémorisé par appareil (localStorage).

### Hero (bannière à la une)

Carrousel de médias en tête de l'accueil, configuré dans l'éditeur : ligne épinglée **Bannière « hero »** au-dessus de la colonne de gauche (interrupteur + bouton réglages). Enregistré avec la disposition, donc par utilisateur, et dans la disposition par défaut côté administrateur. Une disposition peut ne contenir que le hero : il s'ajoute alors au-dessus de la page d'accueil Jellyfin inchangée.

| Réglage | Valeurs | Défaut |
|---------|---------|--------|
| Sources (cumulables) | Aléatoire, Films ajoutés récemment, Séries ajoutées récemment, Derniers films (date de sortie), Dernières séries (date de sortie) | Films + séries ajoutés récemment à l'activation |
| Nombre de médias | 1 à 12 | 6 |
| Rotation automatique | 3, 5, 10 s, manuelle (3 à 60 s acceptées par l'API) | 10 s |
| Exclure les médias déjà vus | oui / non | oui |
| Uniquement les médias avec image de fond | oui / non | oui |

- Les sources sont mélangées à tour de rôle (une de chaque), sans doublon, jusqu'au nombre demandé. Désactiver la dernière source désactive le hero.
- Chaque média affiche : image de fond, logo (titre à défaut), année, durée, classification, note de la communauté, note des critiques, genres, synopsis.
- Actions : **Lire** ou **Reprendre** (+ **Depuis le début**), **Bande-annonce**, favori, vu / non vu, **Plus d'infos**. Lecture, favori et vu passent par les composants natifs du client web (`itemAction`, `emby-ratingbutton`, `emby-playstatebutton`) : aucun lecteur maison.
- Bande-annonce : locale → lue dans Jellyfin ; distante uniquement → ouverte dans un nouvel onglet (liens `http(s)` seulement).
- Rotation en pause au survol, au focus clavier, onglet masqué ; désactivée si le système demande de réduire les animations. Flèches, points, touches gauche / droite (hors mode TV), balayage tactile.
- Affichage : pleine largeur, départ sous le menu du haut, fondu dans la page en bas (masque CSS, donc quel que soit le fond du thème). Tant que le menu survole le hero, il devient transparent avec un léger dégradé sombre (classe `ch-hero-under-header` sur `<html>`) ; il retrouve son fond une fois le hero dépassé ou en quittant l'accueil. Les marges négatives sont mesurées par le script (hauteur du menu, marges du thème), pas codées en dur.
- Nécessite l'option **sections intégrées** (le hero est rendu par le plugin). Cache 5 minutes, comme les sections intégrées : la source aléatoire ne change donc pas à chaque retour sur l'accueil.

### Page de configuration (administrateur)

Trois onglets : **Options** (statut File Transformation + réglages), **Layouts** (éditeur de la disposition par défaut intégré à la page, liste des utilisateurs ayant leur propre disposition avec réinitialisation) et **Genres** (miniatures par genre pour la section « Tous les genres », une par forme de carte ; PNG, JPEG ou WebP, 5 Mo max).

| Forme | Ratio | Dimensions optimales |
| --- | --- | --- |
| Affiche | 2:3 | 600 × 900 px |
| Paysage | 16:9 | 960 × 540 px |
| Carré | 1:1 | 600 × 600 px |

La section prend la miniature de la forme de ses cartes, sinon une autre miniature envoyée (recadrée), sinon le collage d'affiches. Les miniatures envoyées avant la 1.7.0.0 sont conservées comme « affiche ».

| Option | Effet |
| --- | --- |
| Allow users to customize their own home page | Désactivé : tous les utilisateurs reçoivent la disposition par défaut (les admins gardent la leur) |
| Force the default layout for everybody | Première option. Ignore les dispositions enregistrées (conservées, réactivées en décochant). Coché : désactive et met à faux « Allow users… », le bouton d'accueil et l'entrée du menu utilisateur |
| Show a "Customize home" button at the bottom of the home page | Bouton en bas de l'accueil |
| Add a "Customize home" entry to the user menu | Entrée dans le menu utilisateur (menu MUI et tiroir classique) |
| Folders can be collapsed and expanded by clicking their header | Sinon les dossiers sont toujours dépliés |
| Offer the sections rendered by this plugin | Propose les sections intégrées dans l'éditeur |
| Developer mode | Désactive le cache des assets client |

La disposition par défaut s'édite dans l'onglet **Layouts** avec le même éditeur que les utilisateurs.

## Sections reconnues

Clés stables utilisées dans les dispositions (`GET /CustomizedHome/Catalog`). Les sections Home Screen Sections ne sont listées que si ce plugin est installé sur le serveur :

| Origine | Clés | Libellé FR |
| --- | --- | --- |
| Customized Home | `ch:combined`, `ch:latestMovies`, `ch:latestShows`, `ch:collections`, `ch:watchAgain` | Continuer à regarder / À suivre, Derniers films (date de sortie), Dernières séries (date de sortie), Collections, Regarder à nouveau |
| Customized Home | `ch:becauseYouWatched`, `ch:genre` (familles) | Parce que vous avez regardé {0} (3 derniers visionnages, items similaires), Genre : {0} (une ligne par genre choisi via bouton format → Choisir les genres ; sans choix, 2 genres pondérés par l'historique) |
| Customized Home | `ch:allGenres` | Tous les genres : une carte par genre, clic = liste des médias du genre. Apparence au choix (bouton format → Cartes des genres) : **Affiches du genre** (collage de 4 affiches distinctes, par défaut), **Images personnalisées** (miniatures de l'onglet admin Genres, collage pour les genres sans image) ou **Noms sur fonds de couleur** (aucune requête supplémentaire, couleur stable par genre) |
| jellyfin-web | `jf:smalllibrarytiles`, `jf:librarybuttons` | Mes médias, Mes médias (petit) |
| jellyfin-web | `jf:resume`, `jf:resumeaudio`, `jf:resumebook`, `jf:nextup` | Continuer de regarder, Reprendre l'écoute, Reprendre la lecture, À suivre |
| jellyfin-web | `jf:latestmedia:<idMédiathèque>` | « <Médiathèque>, ajouts récents » (une clé par médiathèque) |
| jellyfin-web | `jf:livetv`, `jf:activerecordings` | TV en direct, Enregistrements actifs |
| Home Screen Sections | `hss:MyMedia`, `hss:ContinueWatching`, `hss:NextUp`, `hss:ContinueWatchingNextUp` | Mes médias, Continuer à regarder, À suivre, Continuer à regarder / À suivre |
| Home Screen Sections | `hss:RecentlyAddedMovies`, `hss:RecentlyAddedShows`, `hss:LatestMovies`, `hss:LatestShows` | Films ajoutés récemment, Séries ajoutées récemment, Derniers films, Dernières séries |
| Home Screen Sections | `hss:BecauseYouWatched`, `hss:WatchAgain`, `hss:CollectionsSection`, `hss:Genre` | Parce que vous avez regardé …, Regarder à nouveau, Collections, Genre |
| Home Screen Sections | `hss:Discover`, `hss:DiscoverMovies`, `hss:DiscoverTV`, `hss:MyJellyseerrRequests` | Découvrir, Découvrir les films, Découvrir les séries, Mes demandes |
| Home Screen Sections | `hss:MyList`, `hss:TopTen`, `hss:LiveTV`, `hss:Upcoming*`, `hss:RecentlyAdded*`, `hss:Latest*`, `hss:DirectedBy`, `hss:Starring` | voir le catalogue |
| Autre plugin | `title:<titre-normalisé>` | titre affiché |

Les sections « famille » (Parce que vous avez regardé, Genre, Réalisé par, Avec, Ajouté récemment dans …) sont rendues plusieurs fois par HSS : une seule entrée dans la disposition pilote toutes les occurrences, qui gardent leur ordre relatif.

## Fonctionnement

1. **Injection** : au démarrage, un `IHostedService` enregistre une transformation `index.html` auprès de File Transformation (par réflexion, le `JObject` attendu est construit avec le type de FT lui-même : pas de dépendance Newtonsoft). Le callback ajoute `<link>` et `<script>` pointant vers `/CustomizedHome/customized-home.{css,js}` (servis sans authentification, ETag + `no-cache`).
2. **Détection** : le script observe `#homeTab .sections`. Chaque `.verticalSection` est identifiée : attribut `data-page` + classe d'identifiant pour HSS, classe `sectionN` + préférences `homesectionN` pour les sections natives (repli sur le titre via `web/strings/<lang>.json`), titre normalisé sinon.
3. **Application** : le conteneur passe en `display:flex; flex-direction:column` et chaque section reçoit un `order`. Aucun nœud n'est déplacé (déplacer un `emby-itemscontainer` réinitialise ses données). Les wrappers natifs (médias récents par médiathèque, TV en direct) passent en `display:contents`. Les dossiers sont des en-têtes insérés dans le conteneur ; leurs membres reçoivent une classe et sont masqués quand le dossier est replié. Un dossier dont tous les membres sont vides est masqué.
4. **Sections intégrées** : rendues par le script (markup identique aux cartes jellyfin-web, `emby-scroller` / `emby-itemscontainer` natifs) à partir des endpoints `UserItems/Resume`, `Shows/NextUp`, `Items` (tri `PremiereDate`, `DatePlayed`, `Random`, filtre `isPlayed`, `BoxSet`), `Items/{id}/Similar`, `Genres`. Section vide → masquée (et le dossier qui la contient s'il n'a plus de membre visible).
5. **Stockage** : dispositions utilisateur en JSON dans `<config>/plugins/configurations/Jellyfin.Plugin.CustomizedHome/users/<userId>.json` ; disposition par défaut et options dans la configuration XML du plugin.

### API

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| GET | `/CustomizedHome/customized-home.js` / `.css` | anonyme | assets client |
| GET | `/CustomizedHome/Layout` | utilisateur | disposition effective + options |
| POST | `/CustomizedHome/Layout` | utilisateur | enregistre sa disposition (validée et normalisée côté serveur) |
| DELETE | `/CustomizedHome/Layout[?userId=]` | utilisateur / admin | réinitialise |
| GET/POST | `/CustomizedHome/DefaultLayout` | admin | disposition par défaut |
| GET | `/CustomizedHome/Catalog` | utilisateur | sections connues |
| GET | `/CustomizedHome/Status`, POST `/CustomizedHome/Status/Retry` | admin | statut File Transformation |
| GET | `/CustomizedHome/UserLayouts` | admin | utilisateurs ayant une disposition |
| GET | `/CustomizedHome/GenreImages` | utilisateur | miniatures existantes (nom, forme, version) |
| GET | `/CustomizedHome/GenreImages/Image?name=&shape=&v=` | anonyme | miniature d'un genre pour une forme (comme toute image Jellyfin) |
| POST / DELETE | `/CustomizedHome/GenreImages` | admin | envoi (JSON `{ Name, Shape, Data }` en base64) / suppression (`?name=&shape=`). `Shape` : portrait (défaut), landscape, square |

Format d'une disposition (`Shape` : auto | portrait | landscape | square ; `Size` : small | normal | large) :

```json
{
  "Version": 1,
  "HideUnlisted": false,
  "Items": [
    { "Type": "section", "Key": "ch:combined", "Visible": true, "Shape": "landscape", "Size": "large", "ShowTitle": true },
    { "Type": "section", "Key": "hss:MyMedia", "Visible": true },
    { "Type": "folder", "Id": "f1", "Name": "Séries", "Icon": "tv", "Visible": true, "Collapsed": false,
      "Items": [
        { "Type": "section", "Key": "hss:RecentlyAddedShows", "Visible": true },
        { "Type": "section", "Key": "hss:NextUp", "Visible": true }
      ] }
  ]
}
```

## Build

```bash
# Jellyfin 12.x (défaut)
dotnet build Jellyfin.Plugin.CustomizedHome/Jellyfin.Plugin.CustomizedHome.csproj -c Release
# Jellyfin 10.11.x
dotnet build Jellyfin.Plugin.CustomizedHome/Jellyfin.Plugin.CustomizedHome.csproj -c Release -p:JellyfinVersion=10.11.11
# zip + checksum (depuis la racine du dépôt)
python3 scripts/package.py customized-home --jellyfin 12.1.0 --output artifacts
```

Release : pousser un tag `customized-home-v<version>` ; le workflow `release.yml` construit les deux cibles, publie la release GitHub et met à jour `manifest.json`.

## Tests

Deux suites : tests unitaires C# (`Jellyfin.Plugin.CustomizedHome.Tests`, xUnit) pour la validation des dispositions et le stockage des miniatures de genres, et tests navigateur ci-dessous.

```bash
dotnet test customized-home/Jellyfin.Plugin.CustomizedHome.Tests -p:JellyfinVersion=10.11.11   # SDK .NET 9
dotnet test customized-home/Jellyfin.Plugin.CustomizedHome.Tests                                # SDK .NET 10 (CI)
```

Tests navigateur (Playwright, TypeScript) du script client contre une page d'accueil jellyfin-web simulée et un `ApiClient` factice : aucun serveur Jellyfin requis.

```bash
cd customized-home/tests
npm install
npx playwright install chromium
npm test              # ordre, masquage, formats, éditeur, recherche, glisser-déposer, page admin
npm run typecheck
npm run screenshots   # captures dans test-results/screenshots pour revue visuelle
```

| Fichier | Rôle |
| --- | --- |
| `fixtures/home.html` | DOM de l'accueil jellyfin-web (`#homeTab .sections`, `sectionN`, wrapper médias récents) |
| `fixtures/apiClientStub.js` | `ApiClient` / `Dashboard` factices, requêtes enregistrées dans `window.__mock.requests` |
| `specs/home.spec.ts` | application de la disposition sur l'accueil |
| `specs/editor.spec.ts` | éditeur utilisateur (colonnes, menu, recherche, enregistrement, glisser-déposer) |
| `specs/admin.spec.ts` | page d'administration (onglets, éditeur intégré, 1100px, bouton haut, verrouillage des options) |

Limite : ces tests valident le script contre un DOM simulé. Ils ne détectent pas un changement de structure de jellyfin-web ; après une mise à jour majeure de Jellyfin, vérifier sur un serveur réel.

## Points de vigilance

- Le plugin dépend de la structure DOM de jellyfin-web (`#homeTab .sections`, `.verticalSection`, classes `sectionN`) et des classes émises par HSS. Vérifier après une mise à jour majeure de Jellyfin.
- HSS en mode chargement paresseux (pagination) ajoute des sections au défilement : elles sont réordonnées à l'arrivée ; une section listée en haut de la disposition peut donc apparaître après un chargement.
- Les apps natives n'exécutent pas le script : leur accueil n'est pas modifié.
- Forme forcée sur une section native/HSS : l'image reste celle choisie par le rendu d'origine (vignette 16:9 recadrée en affiche, par exemple). Les sections intégrées chargent l'image adaptée.
- Les sections intégrées ne se rafraîchissent pas en temps réel après un visionnage (cache 5 min, rechargement à la prochaine ouverture de l'accueil).
- Miniatures de genres : type détecté sur les octets (le type déclaré n'est jamais cru), SVG refusé, 5 Mo max, fichier nommé par hash du genre (jamais par l'entrée utilisateur), servi avec `nosniff`.
- Hero : une requête `Items` par source à l'ouverture de l'accueil (puis cache 5 min) ; la source aléatoire (`sortBy=Random`) coûte un tri complet côté serveur sur les très grosses bibliothèques. Les boutons d'action reposent sur le gestionnaire de clics de `emby-itemscontainer` du client web : à revérifier après une mise à jour majeure de Jellyfin.
- Hero sous le menu : repose sur `.skinHeader` (menu fixe) et `.page` de jellyfin-web ; un thème CSS personnalisé qui restyle le menu peut entrer en conflit avec la transparence.
- Les assets client sont servis sans authentification (comme HSS / Plugin Pages) : ils ne contiennent aucune donnée sensible.
