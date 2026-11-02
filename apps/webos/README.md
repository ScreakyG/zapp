# apps/webos — Zapp pour TV LG (webOS 6+)

Paquet `.ipk` de l'interface, à installer en **mode développeur** (usage personnel, sans passer par le LG Content Store).

## 1. Préparer la TV (une seule fois)

1. Sur la TV, ouvrir le **LG Content Store**, installer l'app **Developer Mode** et s'y connecter avec un compte développeur LG (gratuit, sur [webostv.developer.lge.com](https://webostv.developer.lge.com)).
2. Dans Developer Mode, activer **Dev Mode Status**, puis **Key Server**. La TV redémarre. Noter l'**adresse IP** et la **passphrase** affichées.
3. Le mode développeur **expire au bout de 1 000 heures** (environ 41 jours) : il faut rouvrir l'app Developer Mode et cliquer sur **Extend** avant cette échéance, sinon les apps installées sont supprimées.

## 2. Déclarer la TV sur le PC (une seule fois)

L'outil est installé avec le projet (`@webos-tools/cli`) :

```bash
pnpm --filter @zapp/webos exec ares-setup-device --add tv --info "{'host':'IP_DE_LA_TV','port':'9922','username':'prisoner'}"
```

```bash
pnpm --filter @zapp/webos exec ares-novacom --device tv --getkey
```

Saisir la passphrase affichée sur la TV quand elle est demandée.

## 3. Construire, installer et lancer

```bash
pnpm --filter @zapp/webos deploy
```

Cette commande enchaîne `package` (bundle TV de l'UI, puis `out/dev.zapp.tv_0.1.0_all.ipk`), `install-tv` et `launch`. Pour déboguer avec les DevTools de Chromium :

```bash
pnpm --filter @zapp/webos inspect
```

## Particularités de la version TV

- **Un seul script classique** (`vite build --mode webos`), sans modules ES : une app webOS se charge depuis `file://`, où Chromium 79 refuse les `type="module"`. Le CSS est injecté par le script ; hls.js et mpegts.js sont inclus dans le bundle
- `resolution: 1920x1080` : l'interface, dessinée en 1280×720, est agrandie ×1,5 par `zoom` (voir l'ADR)
- `disableBackHistoryAPI` : la touche Retour de la télécommande arrive à l'app (keyCode 461) au lieu de fermer l'app
- Les icônes viennent de `scripts/make-icons.cjs` (un « Z » blanc sur fond Graphite)

Points à vérifier sur la vraie TV : voir le commentaire de l'issue #19.
