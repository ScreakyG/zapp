# Zapp

App IPTV « 10 pieds » pilotée à la télécommande : chaînes en direct, guide TV, mosaïque — puis films et séries.

Cibles : **LG webOS 6+** (`.ipk`) et **PC** (Electron). Une seule base de code TypeScript + SolidJS.

## Documentation

| Document | Rôle |
|---|---|
| [HANDOFF.md](HANDOFF.md) | Passation design → dev : écrans, navigation, critères d'acceptation |
| [design/README.md](design/README.md) | Guide de marque, source de vérité visuelle |
| [docs/adr/0001-stack.md](docs/adr/0001-stack.md) | Choix de stack |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Process de développement (issues, branches, PR) |

## Structure (cible)

```
packages/core     modèles, clients Xtream / M3U / XMLTV, navigation spatiale
packages/ui       app SolidJS, tokens, écrans
apps/webos        manifeste webOS, packaging .ipk
apps/desktop      enveloppe Electron
design/  data/  assets/  prototype/   références du design
```

## Démarrage

```bash
pnpm install
pnpm dev        # app dans le navigateur
pnpm test       # tests Vitest
```

## Preset France

Dans **Paramètres → Preset de chaînes**, choisir **France · par bouquets**, puis **Tester et
enregistrer**. L’accueil et la mosaïque proposent les bouquets **TNT**, **Canal+**, **Ligue 1+**,
**beIN Sports**, **DAZN**, **RMC Sport** et **RMC** présents dans la source. Le guide et le zapping utilisent cette même
sélection. Les favoris reconnus sont conservés en tête de l’accueil.

La sélection repose sur les noms des chaînes et les marqueurs de pays de la source M3U ou
Xtream. Les noms non reconnus sont écartés. Pour la TNT, une seule version est conservée par
chaîne, en priorité RAW : TF1 n°17990 est conservée, la n°17871 est retirée, ainsi que les
France 2/3/4/5/info PRIME et France 3 Régions n°18001 à 18025. Pour Ligue 1+, seules les
versions RAW n°18307 à 18316 sont conservées, hors éditions belges. Ces numéros sont ceux
affichés dans Zapp et correspondent à la première sélection du catalogue de référence.
Les versions marquées HEVC (ou H.265) sont exclues de tous les bouquets du preset, ainsi que
les éditions australiennes marquées AU. Les autres variantes de qualité restent disponibles
dans les bouquets qui n’ont pas encore de règle de dédoublonnage. beIN Sports conserve
uniquement les n°18245 à 18254 marqués VIP dans le nom ou le groupe fournisseur, y compris les
marqueurs stylisés. « GOLD: TRING NOVELAS » est exclue de la TNT.
RMC Sport conserve uniquement les chaînes sportives RMC n°18336 à 18393 inclus ; les autres
chaînes RMC ont leur propre bouquet, sans cette restriction de numéros, avec le n°19822 exclu.
Dans ces deux bouquets, une seule version est conservée par chaîne, en priorité RAW.
DAZN conserve uniquement les chaînes françaises RAW n°19472 à 19483 inclus. Les entrées
événementielles DAZN PPV et les lignes de séparation sont exclues.
Le preset utilise le catalogue entier, indépendamment du filtre manuel « Groupes conservés ».
Pour retrouver le catalogue et ce filtre, choisir **Toutes les chaînes** et enregistrer.
Si aucune chaîne ne correspond, un message s’affiche et la sélection précédente est conservée.

## Guide TV du fournisseur VHPlayer

Dans **Paramètres**, sélectionner la source Xtream Codes ou M3U, puis **Guide TV (EPG)** :

- **Strong8K** ou **Trex** : liens du [guide fournisseur](https://vhplayer.com/epg.html), préremplis.
- **Personnalisé** : saisir une adresse XMLTV (`.xml` ou `.xml.gz`).
- **Par défaut** : EPG de l’API Xtream ou adresse indiquée dans la playlist M3U.

Choisir **Tester et enregistrer** pour appliquer. Les programmes du guide externe sont associés
aux chaînes par leur identifiant EPG fourni dans la playlist / l’API, puis conservés en cache
pendant six heures. Une chaîne sans identifiant correspondant n’aura pas de programme affiché.
