# Génération P8 — 2026-09-01 · `coach-fitness` · 2,4805 $

Troisième génération contrôlée. **`valid=true`**, 10 appels, budget 3,50 $ tenu —
première génération dont le coût était borné à l'avance (D-103).

| fichier | rôle |
|---|---|
| `coach-fitness-avant-p8.air.json` | l'état GELÉ d'avant génération, avec ses 3 images orphelines |
| `attempt1.air.json` | `generatedAttempt` — 30 diagnostics |
| `attempt2.air.json` | `repairedAttempt`, **retenu** — 0 diagnostic, 0 amputation |
| `journal.jsonl` | diagnostics, sections réémises, coût, empreinte |

## Ce qu'elle a démontré

`imageFieldId` 0 → 5 (bonne entité), recherche câblée, **0** promesse
`test_besoin_non_rendable_*`, 1 seul besoin inexprimable (achat intégré, légitime),
0 orpheline. **Cinq gates passent au vert**, dont `app-compile` à 26/26.

## Le défaut qu'elle a révélé

Trois actions déclarées avec `trigger:{kind:"ui", blockId:<detail_header>}` —
un bloc **sans aucun gestionnaire**. Valides au schéma, absentes de l'artefact
émis, invisibles à `controls()`. Le harnais d'invariants (C2) les a attrapées.

Corrigé par **D-104** : le registre déclare `porteAffordance`, le validateur
refuse un déclencheur `ui` sans affordance, et `controls()` dérive de la même
source. `coach-fitness-avant-p8.air.json` sert de fixture au test du porteur,
que la régénération aurait sinon rendu obsolète.
