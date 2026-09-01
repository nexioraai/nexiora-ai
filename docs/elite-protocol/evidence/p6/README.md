# Génération P6 — 2026-09-01 · 2,7396 $

Deuxième génération API contrôlée (`emit-v3.mjs 5 6`, `plombier-urgence`).
**`valid=true`** — le document a été accepté et écrit au corpus.

| fichier | rôle |
|---|---|
| `journal.jsonl` | 24 diagnostics → 0, sections `cablage/actions/ecrans`, 0 amputation |
| `attempt1.air.json` | `generatedAttempt` — ce que le modèle a écrit seul |
| `attempt2.air.json` | `repairedAttempt`, **retenu** comme `acceptedDocument` |

## Ce qu'elle a démontré

Le générateur **construit** : `imageFieldId` 3 → 8 (tous sur la bonne entité),
recherche câblée, **0** promesse `test_besoin_non_rendable_*` (contre 3),
2 besoins inexprimables seulement — caméra et GPS, tous deux légitimes.
0 amputation, 0 dénaturation, 0 mutation, 0 orpheline, 0 motif réfuté.

## Le défaut qu'elle a révélé

`reachableScreens` ignorait `navigation.primary` : `scr_prestations` et
`scr_compte`, atteignables par la seule barre persistante, étaient déclarés
morts, et trois promesses accusées à tort. **Le document était correct, l'oracle
incomplet.** Corrigé par D-099 ; `p6-navigation-primaire.test.ts` rejoue ce
document et exige F1 42/42.

## Dépassement de budget

Budget fixé 2,50 $, coût réel **2,7396 $**. Le plafond dur d'`emit-v3` est à
25 $ et n'est vérifié qu'ENTRE intentions : rien n'arrête une génération en
cours. Défaut d'instrumentation, à traiter séparément.
