# CategoryChips

Les filtres de catégorie en haut de la mosaïque (Toutes, Sport, Cinéma, Info et docs, Divertissement, Jeunesse, Musique), avec le nombre de chaînes de chacun.

## À fournir

- La liste des catégories et leur nombre de chaînes, la catégorie sélectionnée, et si le focus est sur la rangée de filtres.

## Règles

- Pilule `radius-pill`, 9 × 18px de marge, `label` ; le nombre en `caption` 600 à 75 % d'opacité.
- Au repos : `glass`, texte `ink-muted`. Sélectionnée sans focus : `glass-strong`, texte `ink`.
- Focalisée : `accent` / `on-accent`, `scale(1.08)`, `shadow-pill`.
- Le filtre s'applique dès que le focus passe dessus (← →), sans appuyer sur OK : la grille se met à jour en direct et son focus revient à la première tuile.
- ↑ depuis la première ligne de la grille remonte aux filtres ; ↑ depuis les filtres remonte à la TabBar.
