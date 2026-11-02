# ChannelTile

Une chaîne sous forme de tuile 16:9 avec son image, la progression du programme en cours et son nom ; utilisée dans les rangées de l'accueil et dans la mosaïque.

## À fournir

- `number` (3 chiffres), `name`, `image` (capture en direct, sinon illustration), `now` (titre du programme en cours), `progress` (0–1), `isLive`.
- `focused` : état piloté par la navigation, jamais par le survol seul.

## Règles

- Image 272 × 153, `radius-lg`, `object-fit: cover`, bordure intérieure 1px blanc à 14 %.
- Pastille DIRECT en haut à gauche (10px du bord) : `live` / `on-live`, style `badge`, `radius-sm`.
- Progression dans l'image, 12px des bords : rail blanc à 28 %, remplissage `accent`, 4px de haut.
- Sous l'image : numéro + nom en `label`, programme en `caption` `ink-muted`.
- Au repos : `shadow-rest`, `brightness(focus-dim)`, nom en `ink-muted`.
- Focalisée : `translateY(focus-lift) scale(focus-scale)`, `shadow-lift`, reflet diagonal, nom en `ink` et légende décalée de 10px vers le bas. Transition `focus-duration` / `focus-easing`.
- À éviter : contour coloré autour de la tuile, texte écrit sur l'image.
