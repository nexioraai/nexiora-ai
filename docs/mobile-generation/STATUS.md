# STATUS — TABLEAU DE BORD DU CHANTIER MOBILE GENERATION

> Mis à jour à chaque étape significative. Dernière mise à jour :
> **2026-08-27** (création du centre de contrôle).

## ÉTAT GLOBAL

| | |
|---|---|
| Phase actuelle | **PRÉ-CHANTIER** — plan v0.1 livré, **EN ATTENTE DE VALIDATION DU PROPRIÉTAIRE** |
| Étape en cours | 🔵 Examen par le propriétaire : architecture finale, roadmap, centre de contrôle, décisions en attente |
| Prochaine étape | ⏳ Validation explicite → le plan passe à FIGÉ → ouverture Phase 0 |
| Implémentation du générateur | 🔴 INTERDITE tant que le plan n'est pas validé |
| Progression globale | 0/15 phases (0 → 14) |

## PHASES

| Phase | Intitulé | Statut |
|---|---|---|
| — | Confrontation architecturale + convergence | 🟢 TERMINÉ (2026-08-27) |
| — | Centre de contrôle créé | 🟢 TERMINÉ (2026-08-27) |
| — | Validation du plan par le propriétaire | 🔵 EN COURS |
| 0 | Fondations (workspaces, CI, SDK) | ⏳ |
| 1 | Bancs de mesure (P-001→P-003, coûts, E2E) | ⏳ |
| 2 | AIR v1 + Capability Registry v1 | ⏳ |
| 3 | Design System + Primitives + Blocks | ⏳ |
| 4 | Compilateur déterministe v1 | ⏳ |
| 5 | Backend Provisioner v1 | ⏳ |
| 6 | Sandbox + Oracle v1 | ⏳ |
| 7 | Workflow asynchrone durable | ⏳ |
| 8 | Vertical Slice 1 (restaurant) | ⏳ |
| 9 | Repair Loop + Code Slots | ⏳ |
| 10 | Vertical Slice 2 (hors-template) | ⏳ |
| 11 | Router + Runtime Profiles + OTA | ⏳ |
| 12 | Policy Gate + Compliance + BYO | ⏳ |
| 13 | Distribution réelle + Guardian v1 | ⏳ |
| 14 | Fleet + industrialisation + scorecard | ⏳ |

## DÉCISIONS EN ATTENTE (détail dans `DECISIONS.md`)

| ID | Sujet | Quand |
|---|---|---|
| P-001 | Moteur d'orchestration | Banc Phase 1 |
| P-002 | Provider de sandbox | Banc Phase 1 |
| P-003 | Lib de styling RN | Banc Phase 1 |
| P-004 | Palier preview mutualisé (tenancy) | Avant Phase 5 — décision produit+technique |
| P-005 | Monorepo à workspaces (recommandé) vs dépôt séparé | Validation du plan / Phase 0 |
| P-006 | Domaine exact du Vertical Slice 2 | Avant Phase 10 — décision produit |

## RISQUES SUIVIS

| Risque | Niveau | Mitigation |
|---|---|---|
| Aucune infra de calcul long dans le dépôt actuel (mesuré) | ⚠️ structurel | Phases 1 et 7 dédiées ; rien ne se construit en serverless Vercel |
| Review stores (délais, rejets) dans la boucle produit | ⚠️ externe | Policy Gate + préview séparé de la prod ; deadlines suivies au Fleet |
| Coûts unitaires inconnus (LLM/sandbox/EAS/Supabase) | ⚠️ | Instrumentation dès Phase 1 ; Budget Governor |
| Slices dérivant en construction manuelle du produit | ⚠️ méthode | Garde-fou Phase 8 : tout contournement manuel = dette consignée |

## RÈGLE DE CONTINUITÉ

Toute session Claude Code sur ce chantier commence par la lecture de
`MASTER_PLAN.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `STATUS.md` (et
`DECISIONS.md` si nécessaire). La mémoire de conversation n'est jamais la
source de vérité.
