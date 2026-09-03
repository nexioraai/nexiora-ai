# ARTEFACTS DE PREUVE — campagnes de cas-tueurs et EXP-1

> **Raison d'être** : `PROTOCOL-D014` a établi que les preuves des campagnes
> vivaient dans un stockage temporaire de session (`/private/tmp/…`), donc
> **inadressables** — violation directe de P-G (« l'observation brute est
> conservée, adressée, et re-vérifiable sans refaire tourner l'agent »).
> Ces fichiers sont versés ici pour que la preuve cesse d'être volatile.
>
> **Leur versement n'est pas une modification du protocole.** Aucun de ces
> scripts n'écrit dans le dépôt : tous sont en LECTURE SEULE sur les
> artefacts, et construisent leurs documents d'attaque en mémoire.

## Exécution

```bash
node docs/elite-protocol/evidence/<script>.mjs     # depuis la racine du dépôt
```

Node ≥ 22 (typage effacé à l'import : les scripts importent directement les
sources `.ts` du dépôt, sans build).

## Inventaire

| Script | Campagne | Ce qu'il établit |
|---|---|---|
| `kt-campagne1.mjs` | 1 | les 10 cas-tueurs de la campagne 1 · 8 conformes, 2 échecs (D004, D005) |
| `exploit-d004-campagne1.mjs` | 1 | exploitabilité de D004 à l'échelle |
| `blind-campagne1.mjs` | 1 | sonde aveugle ayant produit APP-D001 |
| `g22-campagne1.mjs` | 1 | confirmation empirique de G22 (minimaliste vs slice) |
| `semantics.mjs` | 2 | Δ / Δ′ entre sémantique runtime et sémantique validateur, sur les 13 documents réels |
| `deadness.mjs` | 2 | mortalité structurelle mesurée : sites de dispatch morts, conditions insatisfiables, événements `data` non productibles |
| `ratchet.mjs` | 2 | réfutation du cliquet de véracité de l'enveloppe · composition des 649 écarts du corpus |
| `kt2.mjs` | 2 | 7 cas-tueurs de la campagne 2, verdicts déclarés avant exécution · **7 échecs** |
| `exp1.mjs` | EXP-1 | sondes des hypothèses gelées H-02 / H-07 / H-09 / H-12 / H-03 |
| `exp1b.mjs` | EXP-1 | transfert d'imputation à construction contrôlée (fondement de `PROTOCOL-D015`) |
| `rn01-gran-branches.mjs` | RN-01 audit 1 | énumérateur mécanique de **nœuds de branchement** (liste close de 9 genres AST) — unité d'exécution |
| `rn01-decl-units.mjs` | RN-01 audit 2 | unités **déclaratives** (`PropertySignature` / `PropertyAssignment`) + détecteur d'assertions non ancrées |
| `zd3-vocab.mjs` | RN-01 audit 3 | relevé **non présupposé** du vocabulaire de contraintes : 22 noms, 278 appels |
| `zd3-syntaxsites.mjs` | RN-01 audit 3 | sites **syntaxiques** de contrainte de valeur dans la zone neutre |
| `zd3-extract.mjs` | RN-01 audit 3 | extraction **U-VAL** par introspection à l'exécution + test de stabilité |
| `zd3-coverage.mjs` | RN-01 audit 3 | couverture, indépendance au volume des données, limite `superRefine` |
| `rn01-A-uval.mjs` | RN-01 arbitrage A | **épreuve de falsifiabilité** de l'énoncé U-VAL reformulé + contre-épreuve par mutation |
| `rn01-BC.mjs` | RN-01 arbitrages B/C | stabilité de `(racine, chemin)` sous factorisation · critère de rattachement inter-espaces |
| `observation/` | **instrument d'observation v0** | rend l'écran ÉMIS avec le runtime ÉMIS, presse chaque identité, enregistre le delta, **contrôle négatif**. Produit `APP-D002`. Lancement : `npx vitest run --config docs/elite-protocol/evidence/observation/obs.config.ts --reporter=verbose` |

## Réserve permanente

Les cas-tueurs des campagnes 1 et 2 sont **inventés pour l'occasion**, ce que
la règle de composition n°3 du `GATE_REGISTER` proscrit. Le résiduel assumé
(« les premiers seront forcément inventés, faute d'historique ») s'applique.
Les mesures sur corpus (`semantics.mjs`, `deadness.mjs`, `ratchet.mjs`) ne
sont **pas** concernées par cette réserve : elles portent sur les documents
réels.
