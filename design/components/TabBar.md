# TabBar

La barre d'onglets en verre dépoli, centrée en haut de l'écran, qui permet de passer de l'accueil au guide et à la mosaïque.

## À fournir

- La liste des onglets (`Accueil`, `Guide TV`, `Mosaïque`), l'onglet de l'écran courant et, si le focus est dans la barre, l'onglet focalisé.

## Règles

- Conteneur : `glass` + `blur-glass` (saturate 1.6), `radius-pill`, 6px de marge intérieure, bordure intérieure 1px blanc à 10 %. Centré, à 32px du haut ; logo à gauche et heure à droite sur la même ligne, dans `space-safe`.
- Onglet : `label` 16px, 8 × 22px de marge, `radius-pill`.
- Onglet de l'écran courant : fond `glass-strong`, texte `ink`. Autres : transparent, `ink-muted`.
- Onglet focalisé : fond `accent`, texte `on-accent`, `scale(1.08)`, `shadow-pill`.
- On y monte avec ↑ depuis la première rangée ; ← → changent d'onglet ; OK ouvre ; ↓ redescend.
- La barre disparaît dans le lecteur.
