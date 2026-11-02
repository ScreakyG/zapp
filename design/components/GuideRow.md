# GuideRow

Une ligne du guide TV : la chaîne à gauche (vignette, numéro, nom), ses programmes sur une échelle de temps, et la ligne de l'heure actuelle ; le tout sur l'image floutée de la chaîne sélectionnée.

## À fournir

- La chaîne (`number`, `name`, `image`) et ses programmes `{ title, start, end, live }` issus du XMLTV.
- La fenêtre affichée (2 h, repères toutes les 30 min) et l'heure courante.

## Règles

- Fond de l'écran : l'image de la chaîne sélectionnée en `blur-backdrop` (saturate 1.4), voilée de `bg` à 80 %. Au-dessus de la grille, le programme sélectionné en `title` avec son statut en `accent-text`.
- Cellule chaîne : 232px, `glass` (`glass-strong` pour la ligne focalisée), `radius-md`, vignette 56 × 40 `radius-md`, numéro en `caption` 600 (`accent-text` sur la ligne focalisée), nom en `label`.
- Case programme : largeur proportionnelle à la durée, écart `space-xs`, `glass` (programme en cours un peu plus clair), `radius-md`. Titre en `label`, horaires en `caption` ; horaires du programme en cours en `accent-text`.
- Case focalisée : `accent` / `on-accent`, `scale(1.04)`, `shadow-pill`.
- Ligne de l'heure actuelle : 2px `live` sur toute la hauteur, pastille de 10px en haut.
- ↑ ↓ gardent l'heure visée : on retombe sur le programme diffusé à la même heure, pas sur la première case.
