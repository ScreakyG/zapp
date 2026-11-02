Zapp est une app IPTV pour le salon : on la pilote à la télécommande, on la lit à trois mètres, et son travail est de faire passer d'une chaîne à l'autre le plus vite possible. L'esprit est celui d'une interface de salon haut de gamme : l'image de la chaîne remplit l'écran, l'interface est neutre et translucide, et l'élément focalisé se soulève comme un objet qu'on prend en main.

## Principes

- **Le contenu d'abord.** L'image de la chaîne sélectionnée est le fond de l'écran ; l'interface flotte par-dessus, en verre dépoli. Ne posez jamais un grand aplat de couleur là où une image peut aller.
- **Le focus se voit par le relief, pas par un contour.** Un seul élément focalisé à la fois ; il s'agrandit, remonte et prend une ombre profonde (voir *Focus*).
- **Un seul accent.** `accent` remplit l'élément focalisé et les barres de progression, rien d'autre. En thème Graphite, l'accent est blanc : c'est l'image qui apporte la couleur.
- **Le direct est sacré.** `live` signifie uniquement « en direct maintenant », toujours avec le mot DIRECT.
- **Lisible de loin.** 18px minimum pour le texte courant, contrastes ≥ 4,5:1, rien dans la marge `space-safe`.

## Ton et écriture

- Libellés courts plutôt que phrases : « Ensuite », « reste 38 min », « Toutes les chaînes ».
- Capitales uniquement pour la pastille `DIRECT` ; le reste en casse de phrase.
- Horaires au format 24 h : `20:45 – 22:10`. Numéros de chaîne sur trois chiffres, suivis du nom : `004  Stade Direct`.
- Pas d'emoji. Les chevrons et flèches typographiques (`‹`, `↑ ↓`) suffisent pour les aides.

## Couleur et thèmes

- Quatre thèmes sombres partagent les mêmes noms de tokens : **Graphite** (par défaut, neutre), **Phosphore** (vert électrique), **Ambre** (chaud), **Lagon** (turquoise). Changer de thème ne change que les valeurs.
- Fond de page `bg`. Par-dessus une image : dégradé de `bg` (92 % → 0 de gauche à droite, 100 % → 0 de bas en haut) avant d'y écrire.
- Texte principal `ink`, secondaire `ink-muted` ; texte d'accent `accent-text`.
- Éléments flottants en `glass` + `blur-glass` ; actif mais non focalisé en `glass-strong` ; focalisé en `accent` avec `on-accent`.
- Sur la vidéo, panneaux en `scrim` + `blur-panel`, texte en `ink` du thème Graphite.
- Pastille DIRECT : `live` / `on-live`, style `badge`.
- Panneaux opaques (réglages) : `surface`, `surface-raised`, filets `line`.

## Typographie

- Une seule famille, **Inter** (Google Fonts), qui garde l'aspect d'une police système. Activez partout `font-variant-numeric: tabular-nums` : les horaires et numéros gardent la même largeur et restent alignés.
- `display` pour le programme mis en avant, `title` pour le programme sélectionné dans le guide, `banner-title` et `zap-number` dans le bandeau, `heading` pour les titres de rangée.
- `body` pour les résumés, `label` pour noms de chaîne, onglets et filtres, `caption` pour les métadonnées, `badge` pour DIRECT.
- Titres en graisse 800 et approche serrée (`letterSpacing` négatif) : c'est ce qui donne le côté « affiche ».

## Espacement et mise en page

- Laissez `space-safe` (64px) libre à gauche et à droite.
- Vignettes toujours en 16:9 (272 × 153 sur l'accueil et la mosaïque). Tuiles espacées de `space-lg`.
- Rayons : `radius-lg` pour les tuiles, `radius-md` pour les cases du guide, `radius-xl` pour le bandeau, `radius-pill` pour onglets et filtres, `radius-sm` pour la pastille.
- Accueil : image plein écran + programme mis en avant en haut à gauche, rangées horizontales en bas. Le focus reste mémorisé par rangée.
- Le défilement suit le focus : la rangée ou la tuile focalisée glisse en place avec `focus-easing`.

## Focus

- Tuile focalisée : `translateY(focus-lift) scale(focus-scale)`, `shadow-lift`, reflet blanc en diagonale (135°, 28 % → 0 à 42 %), nom qui passe en `ink` et descend de 10px.
- Tuiles non focalisées : `shadow-rest` et `filter: brightness(focus-dim)`.
- Onglets, filtres, cases du guide : fond `accent`, texte `on-accent`, `shadow-pill`, légère mise à l'échelle.
- Toutes les transitions durent `focus-duration` avec `focus-easing`. Pas de rebond.
- Flèches pour se déplacer, OK pour ouvrir, Retour pour revenir ; les chiffres zappent depuis n'importe quel écran.

## Images

- Chaque chaîne a une image 16:9 : capture de la vidéo en direct, sinon l'illustration du programme. Les illustrations du groupe *Illustrations* servent de contenu de démonstration.
- Bordure intérieure de 1px blanc à 14 % sur chaque image : elle détache la tuile du fond quand l'image est sombre.
- Les logos de chaîne viennent de la playlist (`tvg-logo` du M3U) ; posez-les sur une plaque `glass`, jamais directement sur une image.

## Iconographie

- Pas encore de jeu d'icônes propre. En attendant, un jeu au trait de 2px aux bouts arrondis (Lucide, par exemple), en `ink`, à 24px minimum.

## Composants

- **TabBar** : la barre d'onglets en verre, centrée en haut (Accueil, Guide TV, Mosaïque).
- **ChannelTile** : une chaîne en tuile 16:9 avec image, progression et nom ; utilisée sur l'accueil et dans la mosaïque.
- **CategoryChips** : les filtres de la mosaïque (Toutes, Sport, Cinéma…), qui filtrent dès que le focus passe dessus.
- **GuideRow** : une ligne du guide TV sur fond flouté, avec la ligne de l'heure actuelle.
- **ZapBanner** : le panneau en verre qui apparaît sur la vidéo quand on change de chaîne.
