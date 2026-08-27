# BANCS DE MESURE — PHASE 1

Règles (MASTER_PLAN §5) : protocole défini **avant** toute mesure · mesures
réelles · résultats reproductibles versionnés · aucun banc ne devient une
décision sans passer par la gouvernance (`DECISIONS.md`) · les seuils/critères
ne sont jamais ajustés après coup pour faire passer un candidat.

## Organisation

- **Protocoles** (ce dossier) : un fichier par banc.
- **Scripts + résultats bruts** : `benchmarks/<banc>/` à la racine du dépôt
  (hors workspaces — outillage de mesure, pas du code produit).
- Qualification systématique : **[mesuré]** / **[démontré]** / **[à mesurer]**.

## État des bancs (2026-08-27)

| Banc | Protocole | Exécution | Blocage |
|---|---|---|---|
| Coûts LLM (avec/sans caching) | ✅ `couts-unitaires.md` | ✅ **exécuté** — résultats dans `benchmarks/llm-cost/` | — |
| P-001 Orchestration | ✅ `P-001-orchestration.md` | 🟢 **candidat (a) : campagne officielle 5/5** (2026-08-27, `benchmarks/orchestration/results/`) — décision EN ATTENTE (comparaison (b)/(c) sur comptes, ou arbitrage) | Comptes d'essai Inngest/Trigger.dev pour la comparaison |
| P-002 Sandbox | ✅ `P-002-sandbox.md` | ⏳ | Comptes + clés API E2B / Modal / Fly / Vercel Sandbox + petit budget |
| P-003 Styling RN | ✅ `P-003-styling.md` | ⏳ | Xcode complet + simulateurs OU appareils physiques ([mesuré] : absents de la machine) |
| E2E mobile | ✅ `E2E-mobile.md` | ⏳ | Mêmes prérequis que P-003 |
| Coûts EAS (build) | ✅ `couts-unitaires.md` | ⏳ | Compte Expo/EAS + budget builds |
| Coût projet Supabase | ✅ `couts-unitaires.md` | ⏳ | Token Management API (org dédiée de test recommandée) |

## Prérequis à provisionner par le propriétaire

1. **P-002** : comptes E2B, Modal, Fly.io, Vercel Sandbox (+ budget ~10-20 $).
2. **P-001** : au choix — Docker Desktop local, OU un projet Supabase de
   test jetable (pgmq), OU compte d'essai Inngest/Trigger.dev.
3. **P-003 / E2E** : Xcode complet + simulateurs iOS, Android Studio + AVD —
   ou 2 appareils physiques + compte EAS (dev builds).
4. **EAS** : compte Expo, projet EAS, budget builds.
5. **Supabase provisioning** : token Management API sur une organisation de
   test (jamais l'org de production).
