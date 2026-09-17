# Customized Home (plugin Jellyfin)

> **EN summary** – Customized Home lets every Jellyfin user reorganize the home screen: reorder sections by drag and drop, hide/show them and group them into collapsible folders. Administrators define a default layout. Works with the built-in sections and with sections injected by other plugins (Home Screen Sections, Jellyfin Enhanced…). Requires the [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) plugin. Builds for Jellyfin 12.x (net10.0) and 10.11.x (net9.0).

Plugin Jellyfin qui permet de réorganiser la page d'accueil du client web :

| Fonction | Détail |
| --- | --- |
| Ordre | Glisser-déposer des sections (souris et tactile), boutons monter/descendre en secours |
| Afficher / masquer | Chaque section (et chaque dossier) peut être masquée sans être supprimée de la liste |
| Dossiers | Regroupement de sections sous un en-tête (icône, nom), repliable au clic, replié par défaut ou non |
| Par utilisateur | Chaque utilisateur enregistre sa propre disposition côté serveur (suivie sur tous ses appareils) |
| Disposition par défaut | Définie par l'administrateur, appliquée aux utilisateurs sans disposition, peut être forcée pour tous |
| Sections inconnues | Toute section ajoutée par un autre plugin est détectée et peut être rangée (clé dérivée de son titre) |

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
- Glisser la poignée `⋮⋮` pour réordonner. Déposer une section juste sous l'en-tête d'un dossier, entre ses membres, ou décalée vers la droite après son dernier membre pour la ranger dedans. Un dossier se déplace avec son contenu.
- `👁` masque / affiche. `⋮` : déplacer dans un dossier, sortir du dossier, replié par défaut, supprimer le dossier (les sections sont conservées).
- **Nouveau dossier** : nom libre, icône Material au choix.
- **Masquer les sections absentes de cette liste** : sinon, toute nouvelle section (plugin installé plus tard, nouvelle médiathèque) est ajoutée en fin de page.
- **Afficher toutes les sections connues** : liste aussi les sections du catalogue non présentes actuellement (utile pour préparer une disposition).
- **Réinitialiser** : supprime la disposition personnelle → retour à la disposition par défaut.
- L'état replié / déplié d'un dossier est mémorisé par appareil (localStorage).

### Page de configuration (administrateur)

| Option | Effet |
| --- | --- |
| Allow users to customize their own home page | Désactivé : tous les utilisateurs reçoivent la disposition par défaut (les admins gardent la leur) |
| Force the default layout for everybody | Ignore les dispositions enregistrées (conservées, réactivées en décochant) |
| Show a "Customize home" button at the bottom of the home page | Bouton en bas de l'accueil |
| Add a "Customize home" entry to the user menu | Entrée dans le menu utilisateur (menu MUI et tiroir classique) |
| Folders can be collapsed and expanded by clicking their header | Sinon les dossiers sont toujours dépliés |
| Developer mode | Désactive le cache des assets client |

La disposition par défaut s'édite avec le même éditeur (bouton **Edit default layout**). La liste **User layouts** permet de réinitialiser un utilisateur.

## Sections reconnues

Clés stables utilisées dans les dispositions (`GET /CustomizedHome/Catalog`) :

| Origine | Clés | Libellé FR |
| --- | --- | --- |
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
4. **Stockage** : dispositions utilisateur en JSON dans `<config>/plugins/configurations/Jellyfin.Plugin.CustomizedHome/users/<userId>.json` ; disposition par défaut et options dans la configuration XML du plugin.

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

Format d'une disposition :

```json
{
  "Version": 1,
  "HideUnlisted": false,
  "Items": [
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

## Points de vigilance

- Le plugin dépend de la structure DOM de jellyfin-web (`#homeTab .sections`, `.verticalSection`, classes `sectionN`) et des classes émises par HSS. Vérifier après une mise à jour majeure de Jellyfin.
- HSS en mode chargement paresseux (pagination) ajoute des sections au défilement : elles sont réordonnées à l'arrivée ; une section listée en haut de la disposition peut donc apparaître après un chargement.
- Les apps natives n'exécutent pas le script : leur accueil n'est pas modifié.
- Les assets client sont servis sans authentification (comme HSS / Plugin Pages) : ils ne contiennent aucune donnée sensible.
