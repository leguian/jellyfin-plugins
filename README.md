# jellyfin-plugins

Plugins Jellyfin maintenus dans ce dépôt. Chaque plugin vit dans son propre sous-dossier.

| Plugin | Dossier | Description |
| --- | --- | --- |
| Customized Home | [`customized-home/`](customized-home/) | Easily edit and organize the sections on your homepage. Ordre par glisser-déposer, masquage, format par section, sections intégrées (genres, collections, regarder à nouveau…), disposition par défaut administrateur. |

## Dépôt de plugins Jellyfin

Ajouter cette URL dans **Tableau de bord → Plugins → Dépôts** :

```
https://raw.githubusercontent.com/leguian/jellyfin-plugins/main/manifest.json
```

Le fichier `manifest.json` est mis à jour par la CI à chaque release (`scripts/update-manifest.py`).

## Release

Monter la version dans `<plugin>/build.yaml` (et le `<Version>` du csproj), fusionner dans `main` : le workflow `release.yml` crée le tag `<plugin>-v<version>`, construit les zips (Jellyfin 12.x et 10.11.x), publie la release GitHub et met à jour `manifest.json`. Un tag poussé à la main ou un « Run workflow » avec le nom du tag font la même chose.

## Build

Chaque plugin se compile avec le SDK .NET 10 :

```bash
dotnet build customized-home/Jellyfin.Plugin.CustomizedHome/Jellyfin.Plugin.CustomizedHome.csproj -c Release
# cible Jellyfin 10.11 :
dotnet build customized-home/Jellyfin.Plugin.CustomizedHome/Jellyfin.Plugin.CustomizedHome.csproj -c Release -p:JellyfinVersion=10.11.11
```

Packaging (zip + checksum, prêt pour une release) :

```bash
python3 scripts/package.py customized-home --jellyfin 12.1.0 --output artifacts
python3 scripts/package.py customized-home --jellyfin 10.11.11 --output artifacts
```
