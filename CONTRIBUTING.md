# Process de développement

## Cycle

1. **Issue** — tout travail part d'une issue (modèle *Fonctionnalité* ou *Bug*), avec labels `type:*` + `area:*` et un jalon.
2. **Branche** — depuis `main` : `<type>/<n°issue>-<slug>`, ex. `feat/12-guide-grid`, `fix/31-zap-timeout`.
3. **Commits** — [Conventional Commits](https://www.conventionalcommits.org/fr/) : `feat(ui): grille du guide`, `fix(core): …`, `chore: …`.
4. **PR** — vers `main`, remplir le modèle, écrire `Closes #N`. La CI doit être verte.
5. **Merge** — *squash merge* ; la branche est supprimée automatiquement.
6. **Build Windows validé** — après validation du build et fusion de sa PR, déplacer ce build
   exact vers `apps/desktop/release/latest/`, puis supprimer les anciens builds et installateurs
   remplacés. `latest` contient uniquement la dernière version validée et fusionnée, jamais
   un candidat en cours de test. Ne pas reconstruire pendant la promotion : conserver les
   binaires testés. Le chemin de lancement direct reste `release/latest/win-unpacked/Zapp.exe`.
   Une fonctionnalité validée et fusionnée n’est pas livrée tant que le setup de `latest`
   ne l’embarque pas. Si la validation a porté sur `desktop start`, générer le setup depuis
   le commit fusionné dans une copie isolée, vérifier les fichiers embarqués, puis promouvoir
   ce build sans le reconstruire. Fournir le lien vers l’installateur à la fin de la livraison.

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
