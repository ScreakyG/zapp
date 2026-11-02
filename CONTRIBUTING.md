# Process de développement

## Cycle

1. **Issue** — tout travail part d'une issue (modèle *Fonctionnalité* ou *Bug*), avec labels `type:*` + `area:*` et un jalon.
2. **Branche** — depuis `main` : `<type>/<n°issue>-<slug>`, ex. `feat/12-guide-grid`, `fix/31-zap-timeout`.
3. **Commits** — [Conventional Commits](https://www.conventionalcommits.org/fr/) : `feat(ui): grille du guide`, `fix(core): …`, `chore: …`.
4. **PR** — vers `main`, remplir le modèle, écrire `Closes #N`. La CI doit être verte.
5. **Merge** — *squash merge* ; la branche est supprimée automatiquement.

`main` est protégée : pas de push direct, PR + CI obligatoires.

## Labels

| Label | Usage |
|---|---|
| `type:feat` `type:bug` `type:chore` `type:docs` | Nature du travail |
| `area:core` `area:ui` `area:webos` `area:desktop` `area:player` `area:ci` | Partie du code |
| `priority:high` | À traiter en premier |
| `good first issue` | Petite tâche isolée |

## Jalons

- **V1 — Direct** : Accueil, Guide, Mosaïque, Lecteur, zapping, Paramètres, packaging TV + PC.
- **V2 — VOD** : films et séries.

## Commandes

```bash
pnpm install
pnpm dev          # navigateur
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
