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
