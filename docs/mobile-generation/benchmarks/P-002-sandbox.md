# BANC P-002 — PROVIDER DE SANDBOX

**Décision alimentée** : `DECISIONS.md` P-002. **Candidats** : E2B · Modal ·
Fly Machines · Vercel Sandbox. Propriétés exigées non négociables
(ARCHITECTURE §8) : éphémère, non-root, quotas, timeout, egress contrôlable,
zéro secret, destruction garantie — un candidat qui ne peut pas les fournir
est disqualifié avant mesure.

## Charge de test (identique pour tous)

Le pipeline de vérification réel en miniature, sur un projet Expo témoin
(~le même pour tous, committé dans `benchmarks/sandbox/fixture/`) :
`npm ci → tsc --noEmit → eslint → vitest (suite témoin) → bundle`.

## Mesures

| Mesure | Méthode |
|---|---|
| Démarrage à froid | création sandbox → premier octet d'exécution (10 runs, médiane + p95) |
| Pipeline complet à froid | durée totale sans cache |
| **Pipeline avec cache npm chaud** | 2e run — LA mesure dominante pour le coût réel |
| Persistance du cache inter-jobs | le cache survit-il entre deux sandboxes ? (mécanisme + mesure) |
| Egress | peut-on couper tout réseau sauf allowlist ? (preuve par tentative : `curl` vers un domaine interdit doit échouer) |
| Secrets | preuve par tentative qu'aucun secret d'environnement n'est visible |
| Prix | $ par pipeline (froid/chaud), au tarif public, calculé sur les durées mesurées |
| Destruction | la sandbox est-elle réellement détruite ? (tentative de reconnexion) |

## Livrables

`benchmarks/sandbox/<candidat>/` : script, journaux bruts, synthèse
comparative. 10 runs minimum par mesure. Décision via `DECISIONS.md`.
