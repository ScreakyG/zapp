# Zapp — passation design → développement

Ce dossier décrit l'interface de **Zapp**, une app IPTV pilotée à la télécommande (expérience « 10 pieds », lue à 3 m). Le design et le comportement de navigation sont validés sur un prototype ; il s'agit maintenant de les implémenter dans la vraie stack.

> **Pour Claude Code :** lis ce fichier en entier, puis `design/README.md` et les fiches de `design/components/`. Avant d'écrire du code, propose un plan d'implémentation adapté à la stack décrite plus bas et attends sa validation.

---

## 1. Stack technique

**[À COMPLÉTER PAR LE DÉVELOPPEUR]**

Points à préciser :

- Plateforme(s) cible(s) : web TV, Android TV / Google TV, Apple TV (tvOS), Samsung Tizen, LG webOS, desktop… ?
- Framework UI et langage.
- Lecteur vidéo et formats de flux (HLS, MPEG-TS…).
- Source des chaînes : playlist M3U, API Xtream Codes, autre ?
- Source de l'EPG (guide) : XMLTV, API ?
- Gestion d'état, persistance (favoris, dernière chaîne, thème), tests.

---

## 2. Contenu du dossier

| Chemin | Rôle |
|---|---|
| `design/README.md` | Le guide de marque : principes, couleurs, typo, focus, mise en page. **Source de vérité.** |
| `design/tokens.json` | Tous les tokens (couleurs ×4 thèmes, typo, espacements, rayons, ombres, focus, flous). |
| `design/tokens.css` | Les mêmes tokens en variables CSS + classes de styles de texte. Thème via `data-theme` sur la racine. |
| `design/components/*.md` | Une fiche par composant : données à fournir, états, règles. |
| `prototype/prototype-navigation.dc.html` | Le prototype interactif (format maison « Design Component »). **Référence de comportement**, pas du code à reprendre tel quel : la logique de navigation est en JavaScript simple dans le bloc `<script type="text/x-dc">` (`onKey`, `renderVals`). Les images y pointent vers `/_blob/…` : utiliser `assets/illustrations/` à la place. |
| `data/demo-channels.json` | 13 chaînes fictives, leurs programmes, catégories et rangées d'accueil. Horaires en minutes relatives à 20:00 ; « maintenant » = 20:52. |
| `assets/illustrations/*.jpg` | Images 16:9 (960×540) des chaînes de démo. Contenu de test uniquement. |

En ligne (privés, lisibles avec le compte du propriétaire) :

- Design system : https://claude.ai/artifact/GzAr4PMvixsMyKUvUVruWv
- Prototype jouable : https://claude.ai/artifact/9iSagDFrvgzu5oSvJZSUXb

---

## 3. Direction visuelle (résumé)

- **Le contenu d'abord** : l'image de la chaîne sélectionnée remplit l'écran d'accueil ; l'interface flotte par-dessus en **verre dépoli** (`backdrop-filter`).
- **Focus par le relief, sans anneau** : l'élément focalisé s'agrandit (`--focus-scale`), remonte (`--focus-lift`), prend `--shadow-lift` et un reflet diagonal ; les autres tuiles sont assombries (`--focus-dim`).
- **Une police** : Inter, avec `font-variant-numeric: tabular-nums` partout.
- **4 thèmes sombres** aux noms de tokens identiques : `graphite` (défaut), `phosphore`, `ambre`, `lagon`.
- **Mouvement** : `--focus-duration` (240 ms) et `--focus-easing` sur toutes les transitions ; le défilement suit le focus.
- **Zone de sécurité** : `--space-safe` (64 px) sur les bords latéraux.

Résolution de référence : **1280 × 720**. À 1920 × 1080, tout multiplier par 1,5 (ou mettre l'interface à l'échelle).

---

## 4. Écrans

### Barre d'onglets (TabBar)
Centrée en haut, en verre : **Accueil · Guide TV · Mosaïque**. Logo à gauche, heure à droite. Masquée dans le lecteur.

### Accueil
- Fond : image de la chaîne focalisée, plein écran, avec dégradés de `--bg` (gauche → droite et bas → haut).
- En haut à gauche : numéro + nom + DIRECT, titre du programme (`.display`), horaire · genre · « reste N min » (`--accent-text`), résumé (`.body`).
- En bas : rangées horizontales de `ChannelTile` (272 × 153, écart 32 px) : *Chaînes favorites, Sport, En direct maintenant, Cinéma et séries, Toutes les chaînes*.
- La rangée focalisée remonte en haut de la zone ; la tuile focalisée défile pour rester visible (décalage dès la 3e tuile).

### Guide TV
- Fond : image de la chaîne focalisée floutée (`--blur-backdrop`) + voile `--bg` à 80 %.
- En haut : détail du programme focalisé (chaîne · horaire · genre, titre `.title`, statut « En cours · reste N min » / « Dans N min » / « Terminé », description).
- Grille sur 2 h (20:00 → 22:00, repères toutes les 30 min, 7,6 px/min à 1280 px) ; une `GuideRow` par chaîne ; ligne rouge de l'heure actuelle.
- Défilement vertical : la ligne focalisée reste vers la 4e position.

### Mosaïque
- `CategoryChips` en haut : Toutes, Sport, Cinéma, Info et docs, Divertissement, Jeunesse, Musique (avec compteur).
- Grille de `ChannelTile` sur 4 colonnes, filtrée par la catégorie.

### Lecteur
- Vidéo plein écran.
- `ZapBanner` en bas pendant 4 s après chaque changement de chaîne ou appui sur OK ; pilules « ‹ Retour » et aide des touches en haut.

---

## 5. Modèle de navigation (le cœur de l'expérience)

Un **seul** élément focalisé à la fois. Le focus est géré par l'app (navigation spatiale), pas par le Tab du navigateur.

### Touches

| Touche | Rôle |
|---|---|
| ← → ↑ ↓ | Déplacer le focus |
| OK / Entrée | Ouvrir (lecteur) / réafficher le bandeau |
| Retour / Échap / ⌫ | Revenir à l'écran précédent |
| 0–9 | Zapping direct, **depuis n'importe quel écran** |

### Zones par écran

- **Accueil** : `menu` ↔ `rows`. ↑ depuis la 1re rangée → onglet Accueil. Le **focus est mémorisé par rangée** (`cols[rowIndex]`).
- **Guide** : `menu` ↔ grille. ↑ depuis la 1re ligne → onglet Guide TV.
  - ← → : programme précédent / suivant de la ligne.
  - ↑ ↓ : **conserve l'heure visée** (`gTime`). On retombe sur le programme diffusé à cette heure dans la ligne d'arrivée, pas sur la 1re case. `gTime` = maintenant si le programme focalisé est en cours, sinon son début.
- **Mosaïque** : `menu` ↔ `chips` ↔ grille.
  - ← → sur les filtres **appliquent le filtre immédiatement** (sans OK) et remettent la grille sur la 1re tuile.
  - ↑ depuis la 1re ligne de la grille → filtres ; ↓ en bout de colonne sur une ligne incomplète → dernière tuile.
- **Lecteur** : ↑ chaîne suivante, ↓ chaîne précédente (boucle). ← → OK réaffichent le bandeau. Retour → écran d'origine. Si l'on vient du guide, le focus revient sur la chaîne regardée, au programme en cours.

### Zapping par numéro

- Chaque chiffre s'ajoute au tampon (3 chiffres max) ; le bandeau affiche `03_`.
- Validation automatique 1,5 s après le dernier chiffre, ou 250 ms après le 3e.
- Numéro inconnu : « Aucune chaîne à ce numéro » en `--live` dans le bandeau.
- Le bandeau se masque 4 s après la dernière action.

---

## 6. Données

Modèle minimal (voir `data/demo-channels.json`) :

```ts
type Category = 'sport' | 'cinema' | 'info' | 'divert' | 'jeunesse' | 'musique';
interface Channel { number: string; name: string; category: Category; image?: string; logo?: string; streamUrl: string; }
interface Program { channelNumber: string; title: string; start: Date; end: Date; genre?: string; description?: string; live: boolean; }
```

Correspondances suggérées depuis un M3U : `tvg-chno` → `number`, `tvg-name` → `name`, `group-title` → `category` (table de correspondance à prévoir), `tvg-logo` → `logo`, `tvg-id` → clé de jointure avec l'EPG XMLTV.

---

## 7. Critères d'acceptation

- [ ] Toutes les couleurs, tailles, rayons, ombres et durées viennent des tokens. Aucune valeur en dur, sauf les dégradés et opacités décrits dans le guide.
- [ ] Les 4 thèmes fonctionnent en changeant uniquement `data-theme`.
- [ ] L'interface est entièrement utilisable au clavier / à la télécommande, avec exactement un élément focalisé visible à tout moment.
- [ ] Focus mémorisé par rangée ; heure visée conservée dans le guide ; filtres appliqués au déplacement.
- [ ] Zapping par numéro avec les délais ci-dessus, depuis tous les écrans.
- [ ] Transitions de focus ≤ 240 ms, sans saccade avec 13+ chaînes (privilégier `transform` et `opacity`).
- [ ] Texte ≥ 4,5:1 sur son fond dans chaque thème ; corps de texte ≥ 18 px à 1280 × 720.
- [ ] Pastille DIRECT toujours accompagnée du mot, jamais la couleur seule.

---

## 8. Hors périmètre pour l'instant

Recherche (saisie à la télécommande), favoris éditables, réglages (choix du thème, sources), contrôle parental, zapping limité à la catégorie choisie dans la mosaïque, jeu d'icônes définitif (en attendant : icônes au trait 2 px type Lucide).
