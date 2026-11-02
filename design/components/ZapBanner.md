# ZapBanner

Le panneau en verre qui apparaît en bas de la vidéo quand on change de chaîne, puis disparaît après 4 secondes sans action.

## À fournir

- La chaîne (`number`, `name`, `image`), le programme en cours (`title`, `start`, `end`, `progress`, `live`) et le suivant.
- `typedNumber` pendant la saisie au clavier numérique ; `error` si le numéro n'existe pas.

## Règles

- Panneau : `scrim` + `blur-panel` (saturate 1.8), `radius-xl`, 20 × 24px de marge, bordure intérieure 1px blanc à 12 %, `shadow-panel`. Posé à 48px du bas, dans `space-safe`.
- Un dégradé noir (60 % → 0 du bas sur 45 % de la hauteur) assombrit la vidéo derrière, et apparaît en 240ms.
- Contenu de gauche à droite : vignette 176 × 99 `radius-md` ; numéro en `zap-number` `accent-text` (pendant la saisie : `03_`) ; nom en `banner-title` + pastille DIRECT ; programme en `body` 17px ; progression (rail blanc à 25 %, `accent`, 5px) encadrée des horaires en `caption` ; « Ensuite · 21:45  Titre » en `caption`.
- Numéro inexistant : la ligne du programme devient « Aucune chaîne à ce numéro » en `live`.
- En haut, deux pilules en verre : « ‹ Retour » et le rappel des touches.
- ↑ ↓ zappent même pendant que le bandeau est affiché ; OK le réaffiche.
