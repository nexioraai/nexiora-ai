# Génération P9 — 2026-09-01 · `coach-fitness` · 1,7718 $

⚠️ **GÉNÉRATION NON ABOUTIE — à ne pas présenter comme validée.**

`valid=false`, arrêtée par une **erreur 529 « Overloaded »** de l'API **pendant la
passe de réparation**. Panne d'infrastructure : ni le générateur, ni le document,
ni l'oracle, ni l'instrumentation.

| fichier | rôle |
|---|---|
| `attempt1.air.json` | `generatedAttempt` — ce que le modèle a écrit SEUL, 28 diagnostics |
| `journal.jsonl` | 7 appels · 1,7718 $ · 431 s · `request_id req_011CecjwZbEsVvtudYk1SBSp` |

**Aucun `attempt2`** : le 529 a frappé avant son écriture. Le fichier
`results/coach-fitness.attempt2.air.json` est un **reliquat de P8**, à ne pas
confondre avec un artefact P9.

## Ce qu'elle a démontré — et c'est l'essentiel

Les deux défauts révélés par P8 ont **disparu du document que le modèle a écrit
seul**, sans aucune réparation :

```
① actions `ui` sur un bloc SANS affordance   P8 : 3  →  P9 : 0
② incohérence prop `actionId` ↔ déclencheur  P8 : 4  →  P9 : 0
   imageFieldId : 7      images orphelines : 0
```

**Les règles B-bis (D-104) et B-ter (D-105) du prompt ont fonctionné.**

## Ce qu'elle n'a pas démontré

La réparation des 27 cibles de promesse n'a jamais abouti. **Aucun document
`coach-fitness` valide n'a encore été produit.** Le corpus n'a pas été modifié.

## Deux défauts d'instrumentation révélés

1. `issueGeneration` a classé cette erreur 529 comme `"terminee"` — faux.
2. `assemblagePartiel` ne couvre que l'émission initiale : les sections réparées
   et **payées** ont été perdues.

Les deux sont consignés dans `STATUS.md` comme problèmes connus à arbitrer.
