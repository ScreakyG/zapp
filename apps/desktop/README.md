# apps/desktop — Zapp pour PC

Enveloppe Electron de l'interface (`packages/ui`) : même interface 10 pieds, en plein écran.

## Commandes

```bash
pnpm --filter @zapp/desktop start   # construit l'UI et lance l'app
pnpm --filter @zapp/desktop dev     # contre `pnpm dev` (http://localhost:5173), en fenêtre
pnpm --filter @zapp/desktop smoke   # test de fumée : CORS, secrets, chargement de l'UI
pnpm --filter @zapp/desktop dist    # installateur Windows dans release/
```

## Ce qu'apporte Electron

- **Flux IPTV sans CORS** : les réponses des serveurs reçoivent les en-têtes CORS manquants. La sécurité web reste active (pas de `webSecurity: false`)
- **User-Agent** : celui de VLC par défaut, que la plupart des fournisseurs acceptent. On peut le changer avec `ZAPP_USER_AGENT`
- **Identifiants chiffrés** : `window.zappSecrets` (preload), qui s'appuie sur `safeStorage` (DPAPI sous Windows) et stocke dans `%APPDATA%/Zapp/secrets.json`
- **F11** bascule le plein écran. Échap reste le « Retour » de l'app

L'installateur n'est pas signé : Windows SmartScreen demandera une confirmation au premier lancement.
