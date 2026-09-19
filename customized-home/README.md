# Customized Home (plugin Jellyfin)

> **English**: the user guide (supported clients, installation order, first use, administrator page, troubleshooting, privacy, uninstall, known limits) is in **[README.en.md](README.en.md)**. This document is the French technical reference.

<!--
Captures d'écran : à ajouter par le mainteneur à partir d'un serveur Jellyfin réel (éditeur, hero, page d'administration).
Ne pas utiliser les captures de « npm run screenshots » : elles montrent la page d'accueil simulée des tests.
-->

Plugin Jellyfin qui permet de réorganiser la page d'accueil du client web :

| Fonction | Détail |
| --- | --- |
| Ordre | Glisser-déposer des sections (souris et tactile) |
| Afficher / masquer | Chaque section (et chaque dossier) peut être masquée sans être supprimée de la liste |
| Dossiers | Pris en charge par le modèle (en-tête repliable) mais plus créables depuis l'éditeur ; utilisables via l'API |
| Par utilisateur | Chaque utilisateur enregistre sa propre disposition côté serveur (suivie sur tous ses appareils) |
| Disposition par défaut | Définie par l'administrateur, appliquée aux utilisateurs sans disposition, peut être forcée pour tous |
| Sections inconnues | Toute section ajoutée par un autre plugin est détectée et peut être rangée (clé dérivée de son titre) |
| Sections intégrées | Sans autre plugin : Continuer à regarder / À suivre (combiné), Derniers films et Dernières séries (date de sortie), Collections, Regarder à nouveau, Parce que vous avez regardé…, Genre, Tous les genres |
| Format par section | Forme des cartes (par défaut, affiche, paysage, carré), taille (petite, normale, grande), titre de la section et titres des cartes affichés ou non |
| Hero | Bannière à la une en tête d'accueil : carrousel de médias avec lecture, reprise, bande-annonce, favori, vu (voir [Hero](#hero-bannière-à-la-une)) |
| Langues | Éditeur en français et en anglais selon la langue d'affichage de l'utilisateur Jellyfin (anglais pour les autres langues) ; page d'administration en anglais |

## Compatibilité

| Élément | Support |
| --- | --- |
| Jellyfin 12.x | oui, à partir de 12.0.0 (build `net10.0` compilé contre 12.0.0, `targetAbi 12.0.0.0`) |
| Jellyfin 10.11.x | oui, à partir de 10.11.0 (build `net9.0` compilé contre 10.11.0, `targetAbi 10.11.0.0`). Les versions ≤ 1.8.2.0 du plugin ne se chargent que sur 10.11.11+ et 12.1.0+ |
| Client web (navigateur), apps Android / iOS officielles (elles affichent le client web du serveur), Jellyfin Media Player / Jellyfin Desktop | oui |
| Android TV, Fire TV, Swiftfin, Kodi, Roku, autres apps natives | non (elles n'utilisent pas jellyfin-web) |
| Autres apps bâties sur le client web (téléviseurs…) | non testé ; couvertes uniquement si elles chargent le client web depuis le serveur et non une copie embarquée |
| Home Screen Sections ("Modular Home") | oui, sections identifiées par leur identifiant HSS |
| Jellyfin Enhanced, Jellyfin Tweaks, Intro Skipper | cohabitation OK (aucun conflit de patch : seul `index.html` est transformé) |

## Prérequis

- Plugin **File Transformation** (dépôt `https://www.iamparadox.dev/jellyfin/plugins/manifest.json`). Il injecte le script client dans `index.html` sans modifier les fichiers sur disque. Sans lui, le plugin se charge mais l'accueil n'est pas modifié (le statut est visible dans la page de configuration).

## Installation

Dans cet ordre :

1. Tableau de bord → Plugins → Dépôts → ajouter le dépôt de File Transformation (voir [Prérequis](#prérequis)), puis Catalogue → **File Transformation** → Installer. Aucune configuration.
2. Ajouter de la même façon `https://raw.githubusercontent.com/leguian/jellyfin-plugins/main/manifest.json`.
3. Catalogue → **Customized Home** → Installer, puis redémarrer Jellyfin (un seul redémarrage après les deux installations suffit).
4. Vérifier dans Tableau de bord → Plugins → Customized Home (aussi dans le menu latéral du tableau de bord), onglet **Options**, que le badge de statut indique **Active**.
5. Rafraîchir le client web (Ctrl+F5 ; dans une app mobile, la fermer complètement puis la rouvrir) : un bouton rond **Personnaliser l'accueil** apparaît sous la dernière section de l'accueil, et une entrée dans le menu utilisateur.

Installation manuelle : dézipper `customized-home_<version>_jellyfin-<12 ou 10.11>.zip` dans `<data>/plugins/CustomizedHome_<version>/` puis redémarrer.

Passage d'un serveur de 10.11 à 12 : réinstaller le plugin depuis le catalogue (désinstaller, redémarrer, installer, redémarrer). Les deux lignes partagent le même numéro de version : la recherche de mises à jour ne remplace donc pas le build 10.11 installé par le build 12.x de la même version. Dispositions et options sont conservées (voir [Désinstallation](#désinstallation-et-données-résiduelles)).

## Utilisation

### Éditeur (utilisateur)

- Ouvrir via le bouton en bas de l'accueil ou le menu utilisateur → **Personnaliser l'accueil**.
- Deux colonnes : **Page d'accueil modifiée** (la disposition) et **Sections hors disposition** (tout le reste).
- **Règle** : dès que la colonne de gauche contient au moins une section, elle remplace la page d'accueil par défaut (les sections hors disposition ne sont plus affichées). Colonne vide = page d'accueil Jellyfin inchangée. Filet de sécurité et message d'explication (en tête d'accueil, avec un bouton **Personnaliser l'accueil** quand l'utilisateur y a droit, et **Masquer ce message** pour la session) :

  | Situation | Accueil affiché | Message |
  |-----------|-----------------|---------|
  | Aucune section de la disposition n'existe plus sur cet accueil (mise à jour de Jellyfin, plugin tiers retiré, réglages d'accueil Jellyfin), constaté 5 s après l'ouverture | page d'accueil par défaut | « La disposition de l'accueil n'est pas appliquée » + cause + marche à suivre |
  | La disposition ne contient que des sections Customized Home et l'administrateur les a désactivées | page d'accueil par défaut | idem |
  | Toutes les sections de la disposition sont masquées | rien (la disposition reste appliquée) | « Rien à afficher sur l'accueil » |
  | Les sections existent mais sont vides pour le moment (rien en cours de lecture…), sans hero | rien (les sections retirées ne reviennent pas) | « Rien à afficher sur l'accueil » |

  Une section vide ou masquée compte donc comme présente : seul un accueil dont les sections ont disparu retombe sur la page par défaut. Quand l'utilisateur ne peut pas personnaliser, le message renvoie vers l'administrateur.
- Les boutons sont des icônes Material, désignées ci-dessous par leur nom ; chacune a une info-bulle et un libellé accessible.
- Colonne de droite : bouton **Ajouter à la page d'accueil modifiée** (icône `add_circle_outline`), la section arrive tout en haut. Pas d'autre action.
- Colonne de gauche : **Masquer** / **Afficher** (icônes `visibility` / `visibility_off`), **Format d'affichage (forme, taille, titres)** (icône `aspect_ratio`), **Supprimer de la page d'accueil modifiée** (icône `close`). Le menu format s'ouvre directement depuis son bouton (forme, taille, titre de la section, titres des cartes, et genres pour les sections de genres) et reste ouvert pendant les choix ; clic extérieur ou Échap pour le fermer.
- Pictos en début de ligne : maison (`house`) = section rendue par Customized Home, logo Jellyfin = section par défaut du client web, puzzle (`extension`) = autre plugin. Info-bulle sur chaque icône ; la légende en haut de l'éditeur rappelle les deux premiers. Pendant une recherche, bouton au survol ou au focus **Remonter cette section tout en haut** (icône `vertical_align_top`).
- Glisser la poignée (icône `drag_indicator`) pour réordonner, glisser d'une colonne à l'autre pour ajouter ou retirer (désactivé pendant une recherche).
- Champ **Rechercher une section** : filtre les deux colonnes et retrouve aussi les sections connues mais pas encore affichées.
- Sous-titre d'une ligne : origine de la section (Jellyfin, Home Screen Sections, Customized Home, Autre plugin), « plusieurs lignes » pour une section famille, et « non affichée actuellement » quand la section est connue mais pas rendue sur l'accueil en ce moment (désactivée dans les réglages d'accueil Jellyfin, vide, plugin absent).
- Case **Lister aussi les sections Jellyfin non affichées actuellement** : liste aussi les sections du catalogue non présentes sur l'accueil (utile pour préparer une disposition). Elle n'est proposée que lorsque l'éditeur est ouvert au-dessus d'un accueil ; ailleurs (page d'administration), tout le catalogue est listé d'office.
- Format : sur les sections natives ou HSS le changement de forme est appliqué en CSS (recadrage de l'image existante) ; sur les sections intégrées l'image adaptée est chargée (affiche pour portrait, vignette / fond pour paysage).
- **Enregistrer** applique la disposition. **Annuler**, le bouton de fermeture, Échap ou un clic hors de la fenêtre ferment l'éditeur sans enregistrer ni demander confirmation.
- Les sections intégrées (picto maison, sous-titre « Customized Home ») sont toujours proposées dans la colonne de droite quand l'administrateur les autorise : elles n'existent sur l'accueil qu'une fois ajoutées à la disposition. Données chargées côté client via l'API Jellyfin, cache 5 minutes par utilisateur. Au retour sur l'accueil (navigation arrière, fin de lecture, onglet remis au premier plan), les rangées liées au visionnage (Continuer à regarder / À suivre, Regarder à nouveau, Parce que vous avez regardé) sont rechargées dès qu'elles ont plus de 15 s, les autres après 5 min. L'ancien contenu reste affiché jusqu'à l'arrivée du nouveau, n'est remplacé que s'il a changé (focus clavier / télécommande conservé sur le même média), et reste en place si le rechargement échoue (réseau pas encore revenu, serveur en redémarrage) : nouvel essai au prochain retour. Une vue d'accueil reconstruite par le client web affiche d'abord le cache, puis recharge ce qui est trop vieux.
- **Réinitialiser** (proposé une fois qu'une disposition personnelle existe) : supprime la disposition personnelle → retour à la disposition par défaut.
- Dossiers : l'éditeur ne permet plus d'en créer. Une disposition qui en contient (API, ancienne version) les affiche : nom, icône, visibilité et menu du dossier restent modifiables. Sur l'accueil, l'état replié / déplié d'un dossier est mémorisé par appareil (localStorage).

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
- Actions : **Lire** ou **Reprendre** (+ **Depuis le début**), **Bande-annonce**, favori, vu / non vu, **Plus d'infos**. La lecture passe par le gestionnaire natif du client web (`itemAction`) : aucun lecteur maison. **Depuis le début** porte ses propres attributs avec une position à 0, car le client web démarre « lire » et « reprendre » à la position de l'élément. Favori et vu sont envoyés par le plugin (`ApiClient.updateFavoriteStatus`, `markPlayed`, `markUnplayed`), affichés tout de suite et annulés avec un message si le serveur refuse : les boutons natifs correspondants ne sont enregistrés par le client web qu'après le passage sur une autre vue, ils restaient donc inertes sur l'accueil (mobile, TV). Pendant l'envoi le bouton garde le focus (pas d'attribut `disabled`, qui renverrait le focus clavier / télécommande à la page). Les boutons des slides masquées portent `tabindex="-1"` : la navigation spatiale du mode TV ne saute que ces éléments-là. Un hero « non vus uniquement » dont un média vient d'être vu redemande une sélection complète au prochain retour au lieu de rétrécir.
- Bande-annonce : locale → lue dans Jellyfin ; distante uniquement → ouverte dans un nouvel onglet (liens `http(s)` seulement).
- Rotation en pause au survol, au focus clavier, onglet masqué ; désactivée si le système demande de réduire les animations. Flèches, points, touches gauche / droite (hors mode TV), balayage tactile.
- Affichage : pleine largeur, départ sous le menu du haut, fondu dans la page en bas (masque CSS, donc quel que soit le fond du thème). Tant que le menu survole le hero, il devient transparent avec un léger dégradé sombre (classe `ch-hero-under-header` sur `<html>`) ; il retrouve son fond une fois le hero dépassé ou en quittant l'accueil. Les marges négatives sont mesurées par le script (hauteur du menu, marges du thème), pas codées en dur.
- Nécessite l'option **sections intégrées** (le hero est rendu par le plugin). Au retour sur l'accueil, seules les données utilisateur des médias affichés sont rechargées (position de reprise, favori, vu) : une requête, la sélection ne change pas sous les yeux de l'utilisateur, même avec la source aléatoire. Les sources sont réinterrogées après 5 min.

### Page de configuration (administrateur)

Trois onglets : **Options** (statut File Transformation + réglages), **Layouts** (éditeur de la disposition par défaut intégré à la page, liste des utilisateurs ayant leur propre disposition avec réinitialisation) et **Genres** (miniatures par genre pour la section « Tous les genres », une par forme de carte ; PNG, JPEG ou WebP, 5 Mo max).

| Forme | Ratio | Dimensions optimales |
| --- | --- | --- |
| Affiche | 2:3 | 600 × 900 px |
| Paysage | 16:9 | 960 × 540 px |
| Carré | 1:1 | 600 × 600 px |

La section prend la miniature de la forme de ses cartes, sinon une autre miniature envoyée (recadrée), sinon le collage d'affiches. Les miniatures envoyées avant la 1.7.0.0 sont conservées comme « affiche ».

Onglet **Options**, carte **Status** : badge (**Active**, **File Transformation missing**, **Registration failed**, **Unavailable**), explication, bouton **Retry registration** et trois chiffres (version de File Transformation, utilisateurs ayant leur disposition, sections de la disposition par défaut). Puis les options, dans l'ordre de la page, enregistrées par **Save options** :

| Option (libellé exact) | Défaut | Effet |
| --- | --- | --- |
| Force the default layout for everybody | non | Première option. Ignore les dispositions enregistrées (conservées, réactivées en décochant), administrateurs compris. Coché : désactive, verrouille et met à faux « Allow users… », le bouton d'accueil et l'entrée du menu utilisateur |
| Allow users to customize their own home page | oui | Désactivé : tous les utilisateurs reçoivent la disposition par défaut (les admins gardent la leur) |
| "Customize home" button at the bottom of the home page | oui | Bouton rond sous la dernière section de l'accueil |
| "Customize home" entry in the user menu | oui | Entrée dans le menu utilisateur (menu MUI et tiroir classique) |
| Offer the sections rendered by this plugin | oui | Propose les sections intégrées et le hero dans l'éditeur |
| Developer mode | non | Désactive le cache des assets client |

Le repli des dossiers au clic sur leur en-tête (`FoldersCollapsible`, vrai par défaut) n'a plus d'option dans la page : il ne se change que dans le fichier XML de configuration du plugin.

La disposition par défaut s'édite dans l'onglet **Layouts** avec le même éditeur que les utilisateurs (bouton **Clear** pour la vider) ; sans disposition par défaut, les utilisateurs sans disposition gardent l'accueil Jellyfin. La liste **User layouts** donne, par utilisateur, le nombre de sections et la date d'enregistrement, avec un bouton **Reset**.

## Sections reconnues

Clés stables utilisées dans les dispositions (`GET /CustomizedHome/Catalog`). Les sections Home Screen Sections ne sont servies par le catalogue que si ce plugin est installé sur le serveur ; l'éditeur utilisateur ne les propose que si HSS rend effectivement l'accueil de cet utilisateur, et ne propose alors plus les sections natives (l'éditeur administrateur liste tout) :

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
2. **Détection** : le script observe `#homeTab .sections`. Chaque `.verticalSection` est identifiée : attribut `data-page` + classe d'identifiant pour HSS, classe `sectionN` + préférences `homesectionN` pour les sections natives (repli sur le titre, comparé aux libellés anglais et français du catalogue ; une rangée dont le titre pointe vers une médiathèque est identifiée par l'identifiant de celle-ci quelle que soit la langue), titre normalisé sinon (`title:<titre>`).
3. **Application** : le conteneur passe en `display:flex; flex-direction:column` et chaque section reçoit un `order`. Aucun nœud n'est déplacé (déplacer un `emby-itemscontainer` réinitialise ses données). Les wrappers natifs (médias récents par médiathèque, TV en direct) passent en `display:contents`. Les dossiers sont des en-têtes insérés dans le conteneur ; leurs membres reçoivent une classe et sont masqués quand le dossier est replié. Un dossier dont tous les membres sont vides est masqué.
4. **Sections intégrées** : rendues par le script (markup identique aux cartes jellyfin-web, `emby-scroller` / `emby-itemscontainer` natifs) à partir des endpoints `UserItems/Resume`, `Shows/NextUp`, `Items` (tri `PremiereDate`, `DatePlayed`, `Random`, filtre `isPlayed`, `BoxSet`), `Items/{id}/Similar`, `Genres`. Section vide → masquée (et le dossier qui la contient s'il n'a plus de membre visible).
5. **Stockage** : dispositions utilisateur en JSON dans `<config>/plugins/configurations/Jellyfin.Plugin.CustomizedHome/users/<userId>.json` ; miniatures de genres et leur index (`index.json`) dans `<config>/plugins/configurations/Jellyfin.Plugin.CustomizedHome/genres/` ; disposition par défaut et options dans la configuration XML du plugin (`<config>/plugins/configurations/Jellyfin.Plugin.CustomizedHome.xml`). `<config>/plugins` désigne le dossier `plugins` du répertoire de données de Jellyfin (`/config/plugins` dans l'image Docker officielle, `/var/lib/jellyfin/plugins` avec les paquets Linux).

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

Format d'une disposition (`Shape` : auto | portrait | landscape | square ; `Size` : small | normal | large ; `GenreStyle` : posters | custom | colors ; `Hero.Sources` : random, recentMovies, recentShows, latestMovies, latestShows). Champs de section facultatifs : `Label`, `ShowTitle` (titres des cartes), `ShowSectionTitle`, `Genres` (pour `ch:genre`), `GenreStyle` (pour `ch:allGenres`). `HideUnlisted` est écrit par l'éditeur (vrai dès qu'il y a une section) mais le client décide d'après le contenu : une disposition qui liste au moins une section remplace l'accueil par défaut.

```json
{
  "Version": 1,
  "HideUnlisted": true,
  "Hero": { "Enabled": true, "Sources": ["recentMovies", "recentShows"], "Count": 6, "IntervalSeconds": 10, "ExcludePlayed": true, "RequireBackdrop": true },
  "Items": [
    { "Type": "section", "Key": "ch:combined", "Visible": true, "Shape": "landscape", "Size": "large", "ShowTitle": true, "ShowSectionTitle": true },
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
dotnet build Jellyfin.Plugin.CustomizedHome/Jellyfin.Plugin.CustomizedHome.csproj -c Release -p:JellyfinVersion=10.11.0
# zip + checksum (depuis la racine du dépôt)
python3 scripts/package.py customized-home --jellyfin 12 --output artifacts
```

Release : monter `version` dans `build.yaml` et fusionner dans `main` ; le workflow `release.yml` attend les builds et les tests, construit les deux cibles, publie la release GitHub (tag `customized-home-v<version>`) et met à jour `manifest.json`.

## Tests

Deux suites : tests unitaires C# (`Jellyfin.Plugin.CustomizedHome.Tests`, xUnit) pour la validation des dispositions et le stockage des miniatures de genres, et tests navigateur ci-dessous.

```bash
dotnet test customized-home/Jellyfin.Plugin.CustomizedHome.Tests -p:JellyfinVersion=10.11.0   # SDK .NET 9
dotnet test customized-home/Jellyfin.Plugin.CustomizedHome.Tests                                # SDK .NET 10 (CI)
```

Tests navigateur (Playwright, TypeScript) du script client contre une page d'accueil jellyfin-web simulée et un `ApiClient` factice : aucun serveur Jellyfin requis.

```bash
cd customized-home/tests
npm ci
npx playwright install chromium
npm test              # ordre, masquage, formats, éditeur, recherche, glisser-déposer, hero, genres, session, page admin
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
| `specs/hero.spec.ts` | hero (réglages dans l'éditeur, rendu, actions, rotation) |
| `specs/genres.spec.ts` | sections « Genre » et « Tous les genres » (rendu, styles de cartes, miniatures personnalisées, collages paresseux, choix dans le menu format) |
| `specs/session.spec.ts` | changement d'utilisateur, rechargements au retour sur l'accueil, serveur en erreur, messages d'accueil non appliqué ou vide |
| `specs/screenshots.spec.ts` | captures pour revue visuelle (`npm run screenshots` uniquement) |
| `specs/support.ts` | fonctions communes aux specs |

Limite : ces tests valident le script contre un DOM simulé. Ils ne détectent pas un changement de structure de jellyfin-web ; après une mise à jour majeure de Jellyfin, vérifier sur un serveur réel.

## Dépannage

Partir du badge de statut (page de configuration, onglet **Options**) :

| Badge | Signification | Action |
| --- | --- | --- |
| **Active** | Le script est injecté dans le client web | Si l'accueil ne change pas : cache du navigateur ou d'un proxy, voir ci-dessous |
| **File Transformation missing** | File Transformation absent, désactivé ou non chargé | L'installer (voir [Installation](#installation)), vérifier qu'il est actif, redémarrer |
| **Registration failed** | File Transformation présent mais enregistrement refusé ; l'erreur est affichée | Mettre à jour File Transformation et Customized Home, redémarrer, puis **Retry registration** |
| **Unavailable** | La page n'a pas pu lire le statut | Recharger la page, consulter le journal de Jellyfin |

Rien ne change alors que le badge est **Active** :

1. Ctrl+F5 (la page du client web est fortement mise en cache) ; dans une app mobile, la fermer complètement ou vider son cache.
2. Vérifier que le client est couvert (voir [Compatibilité](#compatibilité)) : Android TV, Swiftfin, Kodi et les autres apps natives ne changent jamais.
3. Outils de développement du navigateur (F12) :
   - dans le code source de la page, chercher `data-plugin="CustomizedHome"` ; absent, la page reçue n'a pas été transformée (copie en cache d'un reverse proxy ou d'un CDN, ou client web qui n'est pas servi par ce serveur Jellyfin : un jellyfin-web hébergé à part n'est pas couvert) ;
   - onglet Réseau : `CustomizedHome/customized-home.js` et `.css` doivent répondre 200 ou 304. Un 404 derrière un reverse proxy vient en général du préfixe : le script est demandé sous l'**URL de base** configurée dans Jellyfin (Tableau de bord → Réseau), rappelée par le texte de statut (« Base URL prefix »). Le proxy doit relayer `/CustomizedHome/` comme le reste de Jellyfin ;
   - console : `window.CustomizedHome.version` et `window.CustomizedHome.sections()`. `window.CustomizedHome` indéfini = script non chargé. `sections()` liste les sections trouvées sur l'accueil au dernier passage (clé, libellé, origine, ordre appliqué) ; une liste vide sur l'accueil signifie que les sections du client web n'ont pas été reconnues : à signaler avec la version de Jellyfin.
4. Pas de bouton **Personnaliser l'accueil** : l'administrateur a pu le désactiver, interdire la personnalisation ou forcer la disposition par défaut. Le bouton est sous la dernière section, tout en bas de la page.
5. Section absente de l'éditeur : cocher **Lister aussi les sections Jellyfin non affichées actuellement** ou utiliser la recherche. Les sections Home Screen Sections ne sont listées que si ce plugin est installé **et** rend l'accueil de cet utilisateur (« Modular Home » activé) ; dans ce cas les sections natives de Jellyfin ne sont plus proposées. L'éditeur administrateur de la disposition par défaut liste tout.

Signalement : [ouvrir une issue](https://github.com/leguian/jellyfin-plugins/issues/new/choose) avec les versions de Jellyfin, du plugin et de File Transformation (toutes sur la page de configuration), le client, et la sortie de `window.CustomizedHome.sections()`. Faille de sécurité : suivre [SECURITY.md](../SECURITY.md).

## Désinstallation et données résiduelles

1. Tableau de bord → Plugins → Customized Home → Désinstaller, puis redémarrer. Après un Ctrl+F5 l'accueil Jellyfin par défaut revient ; rien d'autre à défaire, aucun fichier du client web n'a été modifié.
2. Jellyfin ne supprime que le dossier du plugin. Restent dans `<config>/plugins/configurations/` : `Jellyfin.Plugin.CustomizedHome.xml` (options et disposition par défaut) et le dossier `Jellyfin.Plugin.CustomizedHome/` (`users/*.json` : une disposition par utilisateur ; `genres/` : miniatures et index). Les supprimer à la main pour tout effacer ; les garder si une réinstallation est prévue, les dispositions sont alors reprises.
3. File Transformation peut être désinstallé aussi si aucun autre plugin n'en dépend.

Côté navigateur, seul l'état replié / déplié des dossiers est gardé (`localStorage`, clés `customizedHome-…`). Aucune donnée n'est envoyée à un tiers.

## Points de vigilance

- Le plugin dépend de la structure DOM de jellyfin-web (`#homeTab .sections`, `.verticalSection`, classes `sectionN`) et des classes émises par HSS. Vérifier après une mise à jour majeure de Jellyfin.
- HSS en mode chargement paresseux (pagination) ajoute des sections au défilement : elles sont réordonnées à l'arrivée ; une section listée en haut de la disposition peut donc apparaître après un chargement.
- Les apps natives n'exécutent pas le script : leur accueil n'est pas modifié.
- Forme forcée sur une section native/HSS : l'image reste celle choisie par le rendu d'origine (vignette 16:9 recadrée en affiche, par exemple). Les sections intégrées chargent l'image adaptée.
- Session : tout ce que le script charge ou affiche appartient à un utilisateur sur un serveur. Déconnexion, autre compte ou autre serveur dans le même onglet (jellyfin-web ne recharge pas la page) : état et cache vidés, éditeur fermé, sections du plugin retirées, accueil natif rétabli, puis chargement pour le nouvel utilisateur.
- Serveur en erreur : un chargement de disposition en échec laisse l'accueil natif intact et n'est retenté qu'après 2 s, 4 s, 8 s… jusqu'à 5 min, pas à chaque modification du DOM.
- Les sections intégrées ne suivent pas les évènements de lecture de jellyfin-web : elles se rechargent quand l'accueil est réaffiché (évènement `viewshow`), pas pendant qu'il reste à l'écran.
- Confidentialité des médiathèques : la disposition par défaut est écrite par un administrateur qui voit tout. Avant envoi d'une disposition (par défaut, ou personnelle enregistrée avant une perte d'accès), le serveur retire les sections « Ajouts récents » des médiathèques auxquelles l'utilisateur n'a pas accès, les dossiers que ce retrait a vidés (leur nom désigne souvent la médiathèque) et n'envoie aucun nom de médiathèque ; pour la disposition par défaut, les libellés des sections identifiées par leur titre ne sont pas envoyés non plus. Le client n'enregistre plus ce nom et le reconstruit à partir des médiathèques de l'utilisateur, y compris celles masquées de « Mes médias » (« médiathèque indisponible » sinon). Une rangée dont le titre pointe vers une médiathèque est toujours identifiée par l'identifiant de celle-ci, quelle que soit la langue ; en mode TV (titres sans lien), l'identifiant est retrouvé par le nom parmi les médiathèques de l'utilisateur, et à défaut la section reste identifiée par son titre : le serveur ne la sert alors à personne dans une disposition par défaut.
- Les envois de disposition sont limités à 2 Mo (`RequestSizeLimit`), environ trois fois la plus grosse disposition que le client peut produire : sans limite, le corps était entièrement désérialisé avant que la validation ne le refuse.
- « Tous les genres », styles affiches et images personnalisées : la rangée s'affiche tout de suite avec les noms, les collages d'affiches (une requête par genre) ne sont demandés que pour les cartes qui approchent de l'écran, six à la fois. Sans `IntersectionObserver`, seules les 12 premières cartes reçoivent un collage.
- Miniatures de genres : type détecté sur les octets (le type déclaré n'est jamais cru), SVG refusé, 5 Mo max, fichier nommé par hash du genre (jamais par l'entrée utilisateur), servi avec `nosniff`.
- Hero : une requête `Items` par source à l'ouverture de l'accueil puis toutes les 5 min au plus, et une requête par retour après 15 s pour les données utilisateur ; la source aléatoire (`sortBy=Random`) coûte un tri complet côté serveur sur les très grosses bibliothèques. Les boutons d'action reposent sur le gestionnaire de clics de `emby-itemscontainer` du client web : à revérifier après une mise à jour majeure de Jellyfin.
- Hero sous le menu : repose sur `.skinHeader` (menu fixe) et `.page` de jellyfin-web ; un thème CSS personnalisé qui restyle le menu peut entrer en conflit avec la transparence.
- Les assets client sont servis sans authentification (comme HSS / Plugin Pages) : ils ne contiennent aucune donnée sensible.

## Licence

[GPL-3.0](../LICENSE).
