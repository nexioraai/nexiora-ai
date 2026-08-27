# Campagne 2.4 — émission d'AIR par structured outputs + round-trip

ROADMAP Phase 2 : « émission LLM par structured outputs (round-trip :
intention → AIR → rendu texte → même AIR) ; début du golden corpus (≥ 10 AIR
de domaines variés) ».

## Méthode

- `intentions.mjs` : 12 intentions FIXES de domaines distincts (campagne
  rejouable), couvrant les trois classes commerce (4× physical_or_offapp,
  3× digital, 5× none).
- `emit.mjs` : pour chaque intention —
  1. **Émission par sections** (5 appels structured outputs : base → données
     → écrans → comportement → câblage), assemblage déterministe ;
  2. **Validation locale fail-closed** du document complet : schéma zod
     strict + validateur sémantique + registre de capabilities ;
  3. **Réparation BORNÉE** (1 passe, ciblée sur les seules sections en
     diagnostic — jamais de modification arbitraire) ;
  4. **Round-trip** : `renderAirToText` (rendu déterministe sans perte) →
     re-transcription par sections (structured outputs) → comparaison des
     hash canoniques ;
  5. AIR valides écrits dans `packages/golden-corpus/corpus/` ; journal
     JSONL dans `results/`.
- `probe-grammar.mjs` : sonde d'acceptation des schémas par l'API (coût ~0).

## Contraintes de l'API structured outputs [mesuré 2026-08-27]

Ces contraintes ont dicté la conception (schéma AIR et harnais) :

| Contrainte | Conséquence |
|---|---|
| `additionalProperties` doit être `false` (objets fermés seulement) ; `patternProperties` non supporté | Les records à clés libres sont IMPOSSIBLES → AIR v1 modélise textes localisés (`[{locale, text}]`) et configurations (`[{key, value}]`) en tableaux de paires fermés |
| `oneOf` non supporté | Unions discriminées projetées puis converties en `anyOf` (équivalent ici : branches exclusives par littéral `kind`) |
| Bornes numériques (`minimum`/`maximum`) refusées | Retirées du schéma d'émission ; la validation zod locale les conserve |
| ≤ 24 paramètres optionnels par schéma | Configurations strictement plates (`value` obligatoire) |
| Grammaire compilée du document AIR entier trop large (même avec `$defs`) — chaque section seule passe | **Émission par sections** (5 groupes sondés acceptés) ; l'assemblage est déterministe et la validation complète reste locale |

## Résultat partiel (campagne interrompue)

Intention 1 (`resto-quartier`) : émission 5 sections OK → 21 diagnostics en
première passe → **0 diagnostic après la réparation bornée** (AIR complet
valide, classe commerce correcte). Round-trip interrompu :
**crédits API épuisés** (~$1.15 consommés). Reprise dès recharge du compte —
`node emit.mjs` (complet) ou `node emit.mjs <debut> <fin>` (tranche).
