# Zapp

App IPTV « 10 pieds » pilotée à la télécommande : chaînes en direct, guide TV, mosaïque — puis films et séries.

Cibles : **LG webOS 6+** (`.ipk`) et **PC** (Electron). Une seule base de code TypeScript + SolidJS.

## Documentation

| Document | Rôle |
|---|---|
| [HANDOFF.md](HANDOFF.md) | Passation design → dev : écrans, navigation, critères d'acceptation |
| [design/README.md](design/README.md) | Guide de marque, source de vérité visuelle |
| [docs/adr/0001-stack.md](docs/adr/0001-stack.md) | Choix de stack |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Process de développement (issues, branches, PR) |

## Structure (cible)

```
packages/core     modèles, clients Xtream / M3U / XMLTV, navigation spatiale
packages/ui       app SolidJS, tokens, écrans
apps/webos        manifeste webOS, packaging .ipk
apps/desktop      enveloppe Electron
design/  data/  assets/  prototype/   références du design
```

## Démarrage

```bash
pnpm install
pnpm dev        # app dans le navigateur
pnpm test       # tests Vitest
```

## Guide TV du fournisseur VHPlayer

Dans **Paramètres**, sélectionner la source Xtream Codes ou M3U, puis **Guide TV (EPG)** :

- **Strong8K** ou **Trex** : liens du [guide fournisseur](https://vhplayer.com/epg.html), préremplis.
- **Personnalisé** : saisir une adresse XMLTV (`.xml` ou `.xml.gz`).
- **Par défaut** : EPG de l’API Xtream ou adresse indiquée dans la playlist M3U.

Choisir **Tester et enregistrer** pour appliquer. Les programmes du guide externe sont associés
aux chaînes par leur identifiant EPG fourni dans la playlist / l’API, puis conservés en cache
pendant six heures. Une chaîne sans identifiant correspondant n’aura pas de programme affiché.
