# apps/desktop — Zapp pour PC

Enveloppe Electron de l'interface (`packages/ui`) : même interface 10 pieds, en plein écran.

## Commandes

```bash
pnpm --filter @zapp/desktop start   # construit l'UI et lance l'app
pnpm --filter @zapp/desktop dev     # contre `pnpm dev` (http://localhost:5173), en fenêtre
pnpm --filter @zapp/desktop smoke   # test de fumée : CORS, secrets, chargement de l'UI
pnpm --filter @zapp/desktop dist    # installateur Windows dans release/
```

## Dernière version validée

Le dossier `release/latest/` contient le dernier build testé dont la PR est fusionnée.
Pour lancer directement cette version, utiliser `release/latest/win-unpacked/Zapp.exe`.
Pour mettre à jour l'application installée, lancer l'installateur `Zapp Setup <version>.exe`
dans `release/latest/`, puis utiliser le raccourci habituel de Zapp.

Les builds candidats sont préparés dans un dossier distinct avec
`electron-builder --win --config.directories.output=release/<candidat>` après construction
de l'UI. Après validation et fusion, promouvoir les binaires testés dans `latest`, vérifier
leurs empreintes SHA-256, puis supprimer les anciens builds remplacés. Une fusion Git seule
ne met pas à jour les exécutables ni l'application installée.

## Ce qu'apporte Electron

- **Flux IPTV sans CORS** : les réponses des serveurs reçoivent les en-têtes CORS manquants. La sécurité web reste active (pas de `webSecurity: false`)
- **User-Agent** : celui de VLC par défaut, que la plupart des fournisseurs acceptent. On peut le changer avec `ZAPP_USER_AGENT`
- **Identifiants chiffrés** : `window.zappSecrets` (preload), qui s'appuie sur `safeStorage` (DPAPI sous Windows) et stocke dans `%APPDATA%/Zapp/secrets.json`
- **F11** bascule le plein écran. Échap reste le « Retour » de l'app

L'installateur n'est pas signé : Windows SmartScreen demandera une confirmation au premier lancement.

## Diagnostic des saccades

`electron perf.cjs` mesure 20 secondes de lecture réelle et échoue si la vidéo ne progresse
pas, si elle attend des données après le démarrage ou si plus de 2 % des images sont perdues.
Le rapport `metrics.json` ne contient ni URL ni identifiants. Ce contrôle nécessite une source
accessible ; une erreur fournisseur doit être distinguée d'une régression de fluidité.

Définir `ZAPP_DIAG_PROFILE` vers une **copie isolée** du profil Windows, comprenant
`Local Storage`, `Local State` et `secrets.json`. `Local State` est nécessaire au déchiffrement
des identifiants. Conserver cette copie hors Git et la supprimer après le diagnostic.
Arrêter la lecture dans les autres instances pour éviter les limites de connexions du fournisseur.

Par défaut, le diagnostic utilise le build UI local et la dernière chaîne enregistrée.
`ZAPP_DIAG_BUILD` peut désigner le `main.cjs` d'un `app.asar` pour comparer un ancien build ;
`ZAPP_DIAG_CHANNEL` permet de sélectionner un numéro de chaîne précis.
