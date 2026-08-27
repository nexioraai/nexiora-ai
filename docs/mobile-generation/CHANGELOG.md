# CHANGELOG — CHANTIER MOBILE GENERATION

## 2026-08-27 — P-001 : campagne officielle du candidat (a) — 5/5

- Base de test `deribfy-mobile-test` provisionnée par le propriétaire ;
  `DATABASE_URL` fourni **hors dépôt** (`~/.deribfy-mobile-test.env`, 600,
  jamais versionné). Preflight de cible : hôte pooler session, user du
  projet de test, ≠ production — vérifié avant toute écriture.
- **Campagne 1 : 4/5** — analyse post-hoc en base : E2 était un **faux
  négatif du harnais** (timeout 600 s < somme des durées ; au fond : 6/6
  `done`, 30/30 artefacts, 0 dupliqué) + **fuite d'un worker** invalidant
  la fenêtre d'E5. Défauts du harnais, pas du candidat.
- **Harnais v2** : workers tués en `finally`, timeout E2 calculé depuis les
  durées déterministes, isolation/purge entre épreuves, fenêtre E5 prouvée
  vide, exit code capturé.
- **Campagne 2 (OFFICIELLE) : 5/5 épreuves éliminatoires réussies** —
  E1 215 s (redélivrance kill -9, 0 doublon) · E2 342 s (budget 471 s,
  idempotence totale) · E3 50 s · E4 27 s (borne exacte) · E5 226 s
  (durabilité prouvée). Journaux des DEUX campagnes versionnés.
- **Aucune décision P-001 prise** — en attente : comparaison (b)/(c) ou
  arbitrage propriétaire sur la suffisance de (a).

## 2026-08-27 — D-015 actée · harnais P-001 préparé

- **D-015 (propriétaire)** : résilience aux refus LLM — gestion explicite de
  `stop_reason: refusal` sur tout chemin LLM, zéro panne silencieuse,
  fallbacks de l'architecture mobilisables, taux de refus = métrique du
  Budget Governor. Consignée comme décision de RÉSILIENCE : le n=10 du banc
  prouve l'existence du phénomène, la fréquence réelle reste [à mesurer]
  sur corpus représentatif.
- **P-001 préparé** : harnais complet du candidat (a) pgmq + machine à
  états + workers (`benchmarks/orchestration/` — setup rejouable avec garde
  anti-base-de-production, worker à arrêt propre, 5 épreuves du protocole
  scriptées avec verdicts stricts et journal JSONL, driver installé,
  syntaxe validée, garde `DATABASE_URL` fail-closed vérifiée). Exécution
  en attente du prérequis : Postgres de test jetable avec pgmq. Adaptateurs
  (b) Inngest / (c) Trigger.dev : à la réception des comptes.
- P-002 : préparation des adaptateurs à la réception des comptes sandbox —
  aucun contournement des prérequis.

## 2026-08-27 — PHASE 0 TERMINÉE · PHASE 1 OUVERTE

- **Phase 0 close sur preuves complètes.** Dernier critère satisfait : CI
  GitHub réelle **verte** — run **#32** sur `54ef2a1`, `success` (3 min 01),
  vérifié par capture du propriétaire ET confirmation indépendante via
  l'API Actions. Push de la branche autorisé et effectué
  (`61cec23..54ef2a1`, 9 commits). Root Directory Vercel réglé sur
  `apps/web` par le propriétaire avant push (risque D-014 levé).
- **Phase 1 (bancs de mesure) ouverte.** Protocoles définis AVANT toute
  mesure (`docs/mobile-generation/benchmarks/`) pour : P-001 orchestration,
  P-002 sandbox, P-003 styling RN, E2E mobile, coûts unitaires. Premier
  banc exécuté : coûts LLM avec/sans prompt caching (résultats sous
  `benchmarks/llm-cost/`). Les bancs nécessitant des comptes externes
  (E2B/Modal/Fly, Inngest, EAS, Management API Supabase) sont **bloqués
  sur prérequis propriétaire**, listés dans STATUS.
- Aucun code du générateur. Aucune décision P-00x transformée en décision
  théorique.

## 2026-08-27 — D-014 : monorepo à workspaces en place

- **P-005 tranché par le propriétaire → D-014** : monorepo à workspaces.
- Migration exécutée (`5200cac`) : l'app web déplacée EN BLOC dans
  `apps/web/` (702 renames git à 100 %, historique préservé, **zéro fichier
  de code/cliquet/script modifié** — couplages de chemins tous relatifs au
  paquet, vérifié avant migration) ; racine = workspace `deribfy`
  (`apps/*`, `packages/*`) ; `packages/` vide par conception (aucun code
  moteur avant Phases 2+) ; `.gitignore` étendu ; lockfile workspace unique.
- **Parité prouvée après migration** : tsc EXIT=0 · 221 fichiers /
  4071 tests, 0 échec (compte identique) · `next build` EXIT=0 ·
  `check-api-docs` 73/73 · cliquets d'architecture verts.
- CI adaptée aux workspaces (install racine, étapes dans `apps/web`, gate
  inchangé) — verte à confirmer au premier run distant.
- ⚠️ Opération requise avant tout déploiement : **Root Directory Vercel →
  `apps/web`**.
- Phase 0 : toutes les sous-étapes locales terminées ; critère restant =
  CI verte sur run réel (push sur accord).

## 2026-08-27 — Plan v0.1 VALIDÉ · ouverture de la Phase 0

- **Validation officielle du propriétaire** : le plan v0.1 est FIGÉ ; toute
  évolution passe désormais par une soumission explicite + `DECISIONS.md`.
- **Règle de continuité inscrite en permanence dans `CLAUDE.md`** (source de
  vérité = `docs/mobile-generation/`, lecture obligatoire en début de
  session, pas de modification silencieuse du plan, pas de saut de phase).
- **Phase 0 ouverte.** Première sous-étape technique livrée :
  `@anthropic-ai/sdk` **0.99.0 → 0.121.0** — re-baseline complet vert
  (tsc EXIT=0 ; 221 fichiers / 4071 tests ; `next build` EXIT=0 ; aucun
  code applicatif modifié).
- **Bloqué en attente d'arbitrage propriétaire : P-005** (monorepo à
  workspaces — recommandé — vs dépôt séparé) ; bloque workspaces + CI lanes.

## 2026-08-27 — v0.1 : création du centre de contrôle

- Confrontation architecturale terminée (mandat multi-IA + rapport Claude
  Code A-H confronté au dépôt réel) ; convergence actée par le propriétaire.
- Création de `docs/mobile-generation/` : `MASTER_PLAN.md` (21
  non-négociables, gouvernance), `ARCHITECTURE.md` (référence
  d'implémentation, 29 sections), `ROADMAP.md` (15 phases avec critères
  d'entrée/sortie), `STATUS.md` (tableau de bord), `DECISIONS.md`
  (D-001→D-013 actées ; P-001→P-006 en attente), présent fichier.
- Statut : **v0.1 EN ATTENTE DE VALIDATION** — aucune implémentation du
  générateur avant validation explicite.
