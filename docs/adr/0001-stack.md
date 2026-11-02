# ADR 0001 — Stack technique

Statut : accepté · 2026-11-02

## Contexte

Zapp doit tourner sur une TV LG webOS et sur PC, avec la même interface 10 pieds. Usage personnel (installation en mode développeur), pas de publication sur un store.

## Décisions

- **Plateformes** : LG webOS **6+** (Chromium 79) et PC Windows via **Electron**. Une seule base de code web.
- **UI** : **SolidJS + Vite + TypeScript**, build ciblé `chrome79`. Navigation spatiale maison (machine à états par zones, cf. HANDOFF §5). Sur PC : en plus, survol et clic à la souris.
- **Sources** : **Xtream Codes** en priorité, **M3U + XMLTV** en repli. Une seule source active en V1. Démo (`data/demo-channels.json`) tant qu'aucune source n'est configurée.
- **EPG** : Xtream à la demande par chaîne ; XMLTV analysé en flux, fenêtre ±12 h, cache IndexedDB.
- **Catégories** : table de correspondance par mots-clés `group-title` → 6 catégories (défaut : `divert`) + filtre des groupes conservés.
- **Lecture** : webOS → lecteur natif d'abord, repli hls.js / mpegts.js. PC → hls.js (HLS), mpegts.js (`.ts`), `<video>` natif (MP4). Electron contourne CORS et peut forcer le User-Agent.
- **Paramètres** : icône engrenage en haut à droite (à côté de l'heure). Sources saisies au clavier virtuel, thème, filtre des groupes, « Recharger ». Pas de QR code en V1.
- **Mise à l'échelle** : canevas fixe 1280×720 agrandi par CSS `zoom`. Chromium 79 et le Chromium d'Electron ne rapportent pas la géométrie zoomée de la même façon : tout calcul de mise en page (défilement, grille du guide) se fait en unités du canevas, jamais via `getBoundingClientRect` / `offsetTop`.
- **Persistance** : `localStorage` (thème, favoris, dernière chaîne, identifiants sur TV) ; identifiants chiffrés via `safeStorage` sur Electron ; IndexedDB pour l'EPG.
- **Organisation** : monorepo pnpm (`packages/core`, `packages/ui`, `apps/webos`, `apps/desktop`).
- **Tests** : Vitest sur la navigation et les parseurs.

## Périmètre

- **V1** : direct (Accueil, Guide, Mosaïque, Lecteur, zapping par numéro) + Paramètres.
- **V2** : films et séries (écrans à concevoir).
