# BANC P-001 — MOTEUR D'ORCHESTRATION DURABLE

**Décision alimentée** : `DECISIONS.md` P-001. **Candidats** : (a) Postgres
(pgmq + machine à états explicite + workers conteneurisés) ; (b) Inngest ;
(c) Trigger.dev. Temporal : écarté v1 sauf si (a)-(c) échouent aux critères.

## Charge de test (identique pour tous les candidats)

Pipeline factice reproduisant la forme du pipeline réel (ARCHITECTURE §14) :
5 étapes séquentielles (`intake → resolve → compile-sim → verify-sim →
publish-sim`), chaque étape = travail simulé 5-30 s + écriture d'un artefact
idempotent (clé déterministe). 20 jobs, dont 5 concurrents.

## Épreuves et critères (échec à une épreuve = candidat disqualifié)

| # | Épreuve | Critère de réussite |
|---|---|---|
| 1 | `kill -9` du worker pendant l'étape 3 | Le job reprend et se termine ; **aucun artefact dupliqué** (idempotence prouvée par comptage) |
| 2 | Crash + redémarrage de l'orchestrateur | Aucun job perdu, aucun job dupliqué |
| 3 | Annulation d'un job en étape 2 | Étapes suivantes jamais exécutées ; état final `cancelled` |
| 4 | Timeout d'étape (étape simulée bloquante) | Détection + retry borné + échec propre |
| 5 | Reprise après 24 h d'arrêt simulé (état durable) | Jobs `pending` toujours exécutables |

## Mesures complémentaires (comparatives, non éliminatoires)

Latence médiane de prise de job · débit (jobs/min à 5 workers) · **coût
mensuel estimé** au volume cible (1 000 générations/mois) · observabilité
(peut-on répondre « où en est le job X » en SQL/UI ?) · complexité (LOC de
l'orchestrateur candidat).

## Livrables

`benchmarks/orchestration/<candidat>/` : code du banc, journal brut des
épreuves (JSONL), synthèse. Décision consignée dans `DECISIONS.md` avec les
mesures — jamais sans elles.
