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
| P-005 : arbitrage monorepo vs dépôt séparé | 🟢 TRANCHÉ → **D-014 monorepo** (propriétaire, 2026-08-27) |
| Upgrade SDK Anthropic + re-baseline routes IA web | 🟢 TERMINÉ (2026-08-27) — `@anthropic-ai/sdk` 0.99.0 → 0.121.0 ; tsc EXIT=0, 4071 tests verts, build EXIT=0, aucun code modifié (`6fda588`) |
| Mise en place des workspaces (app web → paquet, parité prouvée) | 🟢 TERMINÉ (2026-08-27, `5200cac`) — 702 renames git à 100 % vers `apps/web/`, aucun fichier de code/cliquet/script modifié ; **parité prouvée après migration** : tsc EXIT=0 · 221 fichiers / 4071 tests, 0 échec (compte identique) · `next build` EXIT=0 · `check-api-docs` 73/73 · cliquets (273 tests) verts |
| Extension CI aux workspaces | 🟢 CÂBLÉE (2026-08-27) — `npm ci` racine, étapes dans `apps/web`, gate bloquant inchangé, YAML validé ; **verte à CONFIRMER au premier run distant** (nécessite un push) |
| Règle lint-bloquant des futurs paquets | 🟢 Inscrite (`packages/README.md`) — s'applique à la création du premier paquet |

**Critères de sortie Phase 0** : suite complète verte inchangée ✅ (4071/4071,
compte identique) · build web inchangé ✅ (EXIT=0) · nouveaux paquets
lint-bloquant ✅ (règle inscrite, aucun paquet encore) · **CI verte ⏳ — seul
critère restant, vérifiable uniquement par un run GitHub Actions réel
(push requis, sur accord)** · STATUS à jour ✅.

⚠️ **AVANT TOUT DÉPLOIEMENT de cette structure : régler le Root Directory
Vercel sur `apps/web`** (consigné dans D-014). Sans ce réglage, le build de
production échouera ; `vercel.json` (crons) est lu depuis ce root.

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
| ~~P-005~~ | Monorepo à workspaces | — | 🟢 tranché → D-014 (2026-08-27) |
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
