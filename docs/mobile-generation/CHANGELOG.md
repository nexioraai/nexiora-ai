# CHANGELOG — CHANTIER MOBILE GENERATION

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
