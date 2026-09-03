# BANC P-001 — ORCHESTRATION DURABLE

Protocole : `docs/mobile-generation/benchmarks/P-001-orchestration.md`.
Candidat implémenté ici : **(a) Postgres (pgmq) + machine à états + workers**.
Candidats (b) Inngest / (c) Trigger.dev : adaptateurs à implémenter à la
réception des comptes — même charge, mêmes épreuves, même journal.

## Prérequis (non contournables)

- Un **Postgres de test jetable avec l'extension pgmq** :
  projet Supabase de test (pgmq disponible nativement) OU Postgres Docker.
  **Jamais** la base de production Deribfy.
- `DATABASE_URL` exporté (chaîne de connexion complète).

## Exécution

```sh
cd benchmarks/orchestration
npm install          # installe le driver pg (local à ce dossier, hors workspaces)
node setup.mjs       # crée file pgmq + tables du banc (rejouable)
node epreuves.mjs    # exécute les 5 épreuves du protocole + journal JSONL
```

Résultats : `results/<date>-epreuves.jsonl` (journal brut) + verdict console
par épreuve. La campagne OFFICIELLE utilise les durées du protocole
(étapes 5-30 s) ; `BENCH_FAST=1` raccourcit les étapes pour la mise au point
et est marqué `officiel: false` dans le journal.

## Ce que prouve chaque épreuve

1. `kill -9` d'un worker en pleine étape 3 → redélivrance par expiration du
   visibility timeout, reprise, **0 artefact dupliqué** (contrainte UNIQUE),
   ré-exécution détectée par le journal d'exécutions.
2. Crash/relance de l'orchestrateur (ré-enfilage idempotent) → aucun job
   perdu, aucun dupliqué.
3. Annulation en étape 2 → étapes suivantes jamais exécutées, état
   `cancelled`.
4. Échec répété d'une étape → retry borné (2 tentatives) puis état `failed`
   propre, message purgé.
5. État durable : jobs enfilés sans worker, attente, redémarrage → tout
   s'exécute (rien ne vivait en mémoire).
