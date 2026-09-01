# Génération P5 — expérience contrôlée du 2026-09-01

Artefacts de l'UNIQUE génération API autorisée (`emit-v3.mjs 5 6`, `plombier-urgence`),
conservés parce qu'ils portent la preuve d'un défaut que quatre passes d'audit
hors ligne n'avaient pas pu produire.

| fichier | contenu |
|---|---|
| `journal.jsonl` | journal complet : 17 diagnostics, sections réémises, 16 mutations rejetées |
| `attempt1.air.json` | document de l'attempt 1 — celui que le modèle a écrit librement |

**Coût réel : 2,4799 $.**

## Ce que cette génération a démontré

Le générateur **construit** : `imageFieldId` 3 → 7, recherche câblée sur la bonne
entité, 8 besoins satisfaits sur 11, et les 3 restants légitimement inexprimables
(caméra, GPS, notifications). Zéro image orpheline, zéro motif réfuté.

## Le défaut qu'elle a révélé

Le garde anti-amputation a rejeté **16 réparations légitimes**. Le diagnostic
`AIR_TEST_TARGET_UNKNOWN` nommait la valeur À REMPLACER (`blk_accueil_urgences`),
pas le nœud à préserver — et le garde cherchait l'identifiant du nœud dans le
texte. Corrigé par D-093 : le périmètre se déduit du CHEMIN du diagnostic.

`perimetre-p5-reel.test.ts` rejoue ce cas sur ces artefacts exacts.
