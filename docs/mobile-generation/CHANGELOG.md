# CHANGELOG — CHANTIER MOBILE GENERATION

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
