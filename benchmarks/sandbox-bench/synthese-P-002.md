# SYNTHÈSE P-002 — BANC SANDBOX E2B vs MODAL (2026-08-28)

Banc E1-E5 exécuté sur les **vraies fixtures** (app témoin compilée
resto-quartier, rootHash 343a94d9). Fixture empaquetée uploadée dans
chaque sandbox, pipeline joué in-situ. Journaux bruts :
`results/e2b-bench.jsonl`, `results/modal-bench.jsonl` (+ rejeux E2B).
Secrets hors dépôt (600), jamais journalisés. **Coût réel : < 1 $ chacun,
couvert par les crédits d'essai (E2B 100 $, Modal crédits gratuits) —
aucune facturation réelle engagée.**

## Pipeline représentatif (consignation)

Projet GÉNÉRÉ = `npm ci → tsc --noEmit → expo export` (Oracle L1 §9 :
typecheck strict + bundle). Le projet généré ne porte PAS de suite
vitest ; l'étape « tests » du dossier est donc **sans objet pour cette
fixture** (consignation, PAS une épreuve retirée — E1-E5 tous exécutés).

## Résultats mesurés

### E1 — pipeline complet (3 runs cold chacun) — **les deux 3/3 VERTS**

| Étape (médiane ms) | E2B | Modal |
|---|---|---|
| cold start (warm) | ~160-190 | ~120-150 |
| extract | ~120 | ~270 |
| node --version | ~300 (**node 20.9**) | ~250 (**node 24**) |
| npm ci | **~15 500** | **~10 400** |
| tsc --noEmit | ~3 300 | ~2 000 |
| expo export | **~44 000** | **~14 500** |
| **pipeline total** | **~63 s** | **~28 s** |

→ **Modal ~2× plus rapide** sur le pipeline réel (écart dominé par
`expo export`). Les deux réussissent le pipeline complet à chaque run.

### E2 — cache npm inter-jobs (même sandbox, npm ci répété ×3)

- **Modal : PROPRE** — 10,2 s → 8,6 s → 8,6 s (bénéfice cache ~16 %,
  stable).
- **E2B : INSTABLE [reproduit ×2]** — run 1 OK (~17-18 s), runs 2-3
  `exit -1` avec durées anormales (165-325 s). `exit -1` = interruption ;
  cause non isolée (probable perte de flux SDK sur commande longue en
  sandbox réutilisée). **N'apparaît PAS en E1** (sandbox fraîche par
  pipeline = modèle §8 réel), où E2B est 3/3. Signal de banc, pas défaut
  du modèle éphémère.

### E3 — egress par tentative (réseau coupé / bloqué)

- **E2B** (`allowInternetAccess=false`) : domaine tiers, IP directe,
  **registre npm** — **tous BLOQUÉS** (rejeu propre ; l'artefact initial
  était `getent` qui pendait, pas une fuite).
- **Modal** (`blockNetwork=true`) : les 3 sondes **tous BLOQUÉS**.
- Granularité d'allowlist : **les DEUX** supportent l'allowlist par
  DOMAINE (E2B `allowOut:["…"]` ; Modal `outboundDomainAllowlist`) +
  blocage total + mise à jour à chaud — match nul, tous deux couvrent §8.

### E4 — secrets par tentative (aucun secret injecté)

- **E2B** : env sensibles = NONE · metadata service = 401. **Aucun secret
  lisible.**
- **Modal** : env sensibles = NONE · metadata service = BLOQUÉ. **Aucun
  secret lisible.**

### E5 — lifecycle création/destruction ×20

- **E2B** : 20 créés, **0 orphelin**, 0 actif restant.
- **Modal** : 20 créés, **0 orphelin**, 0 actif restant.

## Bilan par critère (priorités propriétaire)

| Critère | E2B | Modal | Gagnant |
|---|---|---|---|
| Isolation (primitive) | **Firecracker microVM (matériel)** | gVisor (interception syscalls) | **E2B** |
| Egress contrôlé (§8) | domaine + CIDR + coupure, prouvé | domaine + CIDR + coupure, prouvé | nul |
| Aucun secret (§8) | prouvé | prouvé | nul |
| Teardown/lifecycle | 0 orphelin /20 | 0 orphelin /20 | nul |
| Pipeline réel (vitesse) | ~63 s | **~28 s** | **Modal** |
| Cache npm (E2) | instable (exit -1) | propre ~16 % | **Modal** |
| SDK TS | 1ʳᵉ classe (throw sur exit≠0) | 1ʳᵉ classe | ~nul |
| Cold start | ~160 ms | ~140 ms | nul |
| Node par défaut | 20.9 (template) | 24 (image au choix) | Modal (choix libre d'image) |

## Verdict proposé (assumé)

**Recommandation Claude : E2B en primaire, Modal en second très proche et
pleinement viable.**

Fondement : la propriété la plus porteuse pour CE système — exécuter du
code écrit par LLM sous injection indirecte potentielle (§27) sans jamais
compromettre l'Oracle ni fuiter — est la **force d'isolation**, priorité
#1 du propriétaire. **Firecracker (E2B) = isolation matérielle**, cran
au-dessus de gVisor pour du code hostile ; c'est la fondation la plus
défendable de la confiance de tout l'aval. E2B satisfait par ailleurs
toutes les barrières (egress, secrets, teardown) et **réussit le modèle
réel — sandbox éphémère par job (E1) — 3/3** ; l'instabilité E2 est dans
un scénario artificiel de réutilisation, hors §8.

**Réserve honnête** : Modal a **mesurablement mieux performé** (pipeline
2× plus rapide, cache propre, zéro anomalie, image node au choix,
gVisor = isolation de production éprouvée à grande échelle). Si le
propriétaire pondère le débit à l'échelle (Phases 8-14, campagnes) ou la
robustesse opérationnelle observée au-dessus de l'écart Firecracker↔gVisor,
**Modal est un choix parfaitement défendable** ayant passé toutes les
barrières dures.

**À vérifier avant verrouillage** (si E2B retenu) : l'instabilité `exit -1`
sur commande longue se reproduit-elle en usage réel (sandbox fraîche par
job) à l'échelle ? — le banc dit NON (E1 propre), à confirmer sur un
volume Phase 6.
