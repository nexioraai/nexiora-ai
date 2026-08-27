# STATUS — TABLEAU DE BORD DU CHANTIER MOBILE GENERATION

> Mis à jour à chaque étape significative. Dernière mise à jour :
> **2026-08-27** (validation du plan, ouverture de la Phase 0).

## ÉTAT GLOBAL

| | |
|---|---|
| Plan v0.1 | 🟢 **VALIDÉ ET FIGÉ** (propriétaire, 2026-08-27) — toute évolution passe par `DECISIONS.md` |
| Phase actuelle | **PHASE 0 — FONDATIONS** : 🔵 EN COURS (autorisée le 2026-08-27) |
| Générateur mobile | 🔴 **PAS ENCORE EN IMPLÉMENTATION** — interdit avant les prérequis de la roadmap |
| Progression globale | Phase 0 en cours · 0/15 phases terminées |

## PHASE 0 — DÉTAIL DES SOUS-ÉTAPES

| Sous-étape | Statut |
|---|---|
| Règle de continuité inscrite dans `CLAUDE.md` | 🟢 TERMINÉ (2026-08-27) |
| STATUS.md reflétant la validation et l'ouverture | 🟢 TERMINÉ (2026-08-27) |
| **P-005 : arbitrage monorepo vs dépôt séparé** | 🔴 **BLOQUÉ — ATTENTE ARBITRAGE PROPRIÉTAIRE** (recommandation : monorepo ; bloque workspaces + CI) |
| Upgrade SDK Anthropic + re-baseline routes IA web | 🟢 TERMINÉ (2026-08-27) — `@anthropic-ai/sdk` 0.99.0 → 0.121.0 ; preuves : tsc EXIT=0, 221 fichiers / 4071 tests verts, `next build` EXIT=0 ; 21 fichiers consommateurs, import par défaut inchangé, aucun code modifié |
| Mise en place des workspaces (app web → paquet, parité prouvée) | ⏳ (bloqué par P-005) |
| Extension CI (lanes par paquet, nouveaux paquets lint-bloquant) | ⏳ (bloqué par P-005) |

**Critères de sortie Phase 0** (aucun assouplissement) : suite complète verte
inchangée (4071+ tests) · build et déploiement web inchangés (parité de
comportement) · nouveaux paquets lint-bloquant · CI verte · STATUS à jour.

## PHASES

| Phase | Intitulé | Statut |
|---|---|---|
| — | Confrontation architecturale + convergence | 🟢 TERMINÉ (2026-08-27) |
| — | Centre de contrôle créé (`e8530fe`) | 🟢 TERMINÉ (2026-08-27) |
| — | Validation du plan par le propriétaire | 🟢 TERMINÉ (2026-08-27) |
| 0 | Fondations (workspaces, CI, SDK) | 🔵 EN COURS |
| 1 | Bancs de mesure (P-001→P-003, coûts, E2E) | ⏳ PROCHAIN |
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

| ID | Sujet | Quand | État |
|---|---|---|---|
| **P-005** | Monorepo à workspaces (recommandé) vs dépôt séparé | **MAINTENANT** — bloque la suite de la Phase 0 | 🔴 attente propriétaire |
| P-001 | Moteur d'orchestration | Banc Phase 1 | ⏳ |
| P-002 | Provider de sandbox | Banc Phase 1 | ⏳ |
| P-003 | Lib de styling RN | Banc Phase 1 | ⏳ |
| P-004 | Palier preview mutualisé (tenancy) | Avant Phase 5 | ⏳ |
| P-006 | Domaine du Vertical Slice 2 | Avant Phase 10 | ⏳ |

## RISQUES SUIVIS

| Risque | Niveau | Mitigation |
|---|---|---|
| Aucune infra de calcul long dans le dépôt actuel (mesuré) | ⚠️ structurel | Phases 1 et 7 dédiées ; rien ne se construit en serverless Vercel |
| Review stores (délais, rejets) dans la boucle produit | ⚠️ externe | Policy Gate + preview séparé de la prod ; deadlines suivies au Fleet |
| Coûts unitaires inconnus (LLM/sandbox/EAS/Supabase) | ⚠️ | Instrumentation dès Phase 1 ; Budget Governor |
| Slices dérivant en construction manuelle du produit | ⚠️ méthode | Garde-fou Phase 8 : tout contournement manuel = dette consignée |
| ~~Upgrade SDK Anthropic : ruptures d'API possibles~~ | 🟢 clos | Re-baseline exécuté le 2026-08-27 : aucune rupture, parité prouvée |

## RÈGLE DE CONTINUITÉ

Inscrite en règle permanente dans `CLAUDE.md` (2026-08-27). Toute session
sur ce chantier commence par `MASTER_PLAN.md`, `ARCHITECTURE.md`,
`ROADMAP.md`, `STATUS.md` (et `DECISIONS.md` si nécessaire). La mémoire de
conversation n'est jamais la source de vérité.
