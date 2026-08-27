# STATUS — TABLEAU DE BORD DU CHANTIER MOBILE GENERATION

> Mis à jour à chaque étape significative. Dernière mise à jour :
> **2026-08-27** (Phase 2 OUVERTE — étape 2.1 livrée : paquet
> `@deribfy/air-schema` ; bancs Phase 1 restants en attente de prérequis).

## ÉTAT GLOBAL

| | |
|---|---|
| Plan v0.1 | 🟢 **VALIDÉ ET FIGÉ** (propriétaire, 2026-08-27) — toute évolution passe par `DECISIONS.md` |
| Phase 0 — Fondations | 🟢 **TERMINÉE** (2026-08-27) — tous les critères de sortie vérifiés, dont **CI GitHub réelle verte : run #32, commit `54ef2a1`, `success`** (capture propriétaire + confirmation API Actions indépendante) |
| Phase actuelle | **PHASE 2 — AIR v1 + CAPABILITY REGISTRY v1** : 🔵 EN COURS (ouverte le 2026-08-27 sur autorisation propriétaire ; dépendances ROADMAP satisfaites — « Phase 1 non bloquante ») · **PHASE 1** : 🔵 bancs restants bloqués sur prérequis propriétaire |
| Générateur mobile | 🔵 **EN IMPLÉMENTATION** — premier paquet du moteur : `packages/air-schema` (AIR v1) |
| Progression globale | 1/15 phases terminées (Phase 0) · Phases 1 et 2 en cours |

## PHASE 0 — DÉTAIL DES SOUS-ÉTAPES

| Sous-étape | Statut |
|---|---|
| Règle de continuité inscrite dans `CLAUDE.md` | 🟢 TERMINÉ (2026-08-27) |
| STATUS.md reflétant la validation et l'ouverture | 🟢 TERMINÉ (2026-08-27) |
| P-005 : arbitrage monorepo vs dépôt séparé | 🟢 TRANCHÉ → **D-014 monorepo** (propriétaire, 2026-08-27) |
| Upgrade SDK Anthropic + re-baseline routes IA web | 🟢 TERMINÉ (2026-08-27) — `@anthropic-ai/sdk` 0.99.0 → 0.121.0 ; tsc EXIT=0, 4071 tests verts, build EXIT=0, aucun code modifié (`6fda588`) |
| Mise en place des workspaces (app web → paquet, parité prouvée) | 🟢 TERMINÉ (2026-08-27, `5200cac`) — 702 renames git à 100 % vers `apps/web/`, aucun fichier de code/cliquet/script modifié ; **parité prouvée après migration** : tsc EXIT=0 · 221 fichiers / 4071 tests, 0 échec (compte identique) · `next build` EXIT=0 · `check-api-docs` 73/73 · cliquets (273 tests) verts |
| Extension CI aux workspaces | 🟢 TERMINÉ — `npm ci` racine, étapes dans `apps/web`, gate inchangé ; déclencheur ajouté pour la branche du chantier ; **run réel #32 sur `54ef2a1` : `success` en 3 min 01** (vérifié par capture propriétaire ET par l'API Actions) |
| Règle lint-bloquant des futurs paquets | 🟢 Inscrite (`packages/README.md`) — s'applique à la création du premier paquet |

**Critères de sortie Phase 0 — TOUS SATISFAITS ✅ (2026-08-27)** : suite
complète verte inchangée ✅ (4071/4071, compte identique) · build web
inchangé ✅ (EXIT=0) · nouveaux paquets lint-bloquant ✅ (règle inscrite) ·
**CI verte ✅ (run #32 `success`)** · STATUS à jour ✅.

✅ **Root Directory Vercel réglé sur `apps/web` par le propriétaire**
(2026-08-27, avant le push) — le risque consigné dans D-014 est levé.

## PROGRESSION GLOBALE (bloc de référence — règle D-017)

- **Terminé** : Phase 0 🟢 (fondations, CI #32 verte) · Phase 1 partiel :
  banc coûts LLM 🟢, P-001 🟢 tranché → **D-016 Trigger.dev v4** ·
  Phase 2 partiel : **2.1 🟢 `@deribfy/air-schema`** (schémas AIR/lock/
  state, validateur sémantique, 51 tests avec 2.2) · **2.2 🟢 migrations
  d'AIR** (fail-closed, testées) · **2.3 🟢 `@deribfy/capability-registry`**
  (15 capabilities cœur, cliquets de registre, 25 tests).
- **En cours** : Phase 2 — AIR v1 + Capability Registry v1.
- **Bloqué, prérequis propriétaire** : **2.4 — CRÉDITS API ANTHROPIC**
  (compte de la clé `apps/web/.env.local` à recharger ; estimation
  campagne complète ~10-20 $) · Phase 1 : P-002 (comptes
  E2B/Modal/Fly/Vercel Sandbox + budget ~10-20 $) · P-003 & E2E (Xcode
  complet + simulateurs et Android Studio, OU 2 appareils physiques +
  compte EAS) · coûts EAS (compte Expo/EAS) · coût projet Supabase (token
  Management API, org de test). Chaque chantier reprend dès l'arrivée de
  son prérequis.
- **Prochaine étape EXACTEMENT autorisée** : **reprendre la campagne 2.4**
  (`node benchmarks/air-emission/emit.mjs`) dès recharge des crédits API —
  harnais prouvé de bout en bout, corpus et round-trip restants.
- **INTERDIT à ce stade** : toute phase dont les dépendances ROADMAP ne
  sont pas satisfaites (Phase 3 exige P-003 ; Phases 4+ dépendent de 2/3),
  tout push sans accord explicite, toute décision P-00x sans les mesures
  prévues.

## PHASE 2 — DÉTAIL (ouverte le 2026-08-27)

| Étape | Contenu | Statut |
|---|---|---|
| 2.1 | Paquet `@deribfy/air-schema` : schémas zod AIR v1 (identités stables préfixées, effets d'actions fermés, réseau deny-by-default, classe commerce) + `project.lock` (sans horodatage — déterminisme) + `deployment state` ; validateur sémantique déterministe (18 familles de diagnostics triés) ; JSON canonique + hash SHA-256 ; projection JSON Schema draft 2020-12 (objets stricts partout) | 🟢 TERMINÉ (2026-08-27) — tsc EXIT=0 · **lint bloquant 0 écart** · **42/42 tests** · CI étendue (3 étapes paquets dans le Gate) · web intact : tsc EXIT=0 + **4071/4071 tests** après changement de lockfile |
| 2.2 | Migrations d'AIR testées : chaînage versionné pas à pas, le runner fixe la version cible (une migration ne saute pas de version), détection de cycle, fail-closed (le document migré repasse schéma + validateur sémantique) ; registre réel vide par construction (v1.0.0 = première version publiée), mécanisme prouvé par migrations synthétiques | 🟢 TERMINÉ (2026-08-27) — tsc EXIT=0 · lint 0 écart · **51/51 tests** (9 nouveaux) |
| 2.3 | Paquet `@deribfy/capability-registry` : **15 capabilities cœur** (analytics, auth, barcode_scan, biometrics, calendar, camera, deep_links, geolocation, maps, media_upload, offline_storage, payments.iap, payments.psp, push_notifications, share) avec les 17 champs d'ARCHITECTURE §2 ; API allowlist positive (référence inconnue = refus net), fermeture transitive des dépendances, **empreinte native CALCULÉE** (autorité Router), permissions induites agrégées, conflits (PSP ↔ IAP), contrainte de classe commerce ; pont `validateAirCapabilities` (AIR ↔ registre, permissions induites à déclarer) ; **cliquets de registre** : liste v1 exacte verrouillée, invariants OTA⇔impact⇔rebuild⇔profils, dépendances acycliques, conflits symétriques, permissions ⊆ config native, contrainte commerce ⇔ paiement | 🟢 TERMINÉ (2026-08-27) — tsc EXIT=0 · lint bloquant 0 écart · **25/25 tests** · registre v0.1.0 NON GELÉ (gel = 2.5, revue propriétaire) · web intact : tsc EXIT=0 + 4071/4071 |
| 2.4 | Émission LLM structured outputs + round-trip + golden corpus ≥ 10 domaines. **Livré** : rendu texte déterministe sans perte (`renderAirToText`) ; paquet `@deribfy/golden-corpus` (validation CI sans réseau, garde bootstrap) ; harnais complet `benchmarks/air-emission/` (12 intentions fixes, 3 classes commerce ; **émission par sections** — 5 groupes sondés acceptés par la grammaire ; réparation bornée ciblée ; round-trip par hash canonique). **Contraintes API [mesuré]** : objets fermés uniquement (`additionalProperties: false`, pas de `patternProperties`/`oneOf`/bornes numériques, ≤ 24 optionnels, grammaire du document entier trop large) → **évolution AIR v1** : textes localisés `[{locale,text}]` et configs `[{key,value}]` en paires fermées. **Preuve de bout en bout** : intention 1 = 21 diagnostics 1ʳᵉ passe → **0 après réparation** (AIR valide, classe commerce correcte) | 🟠 **EN COURS — BLOQUÉE : crédits API Anthropic épuisés** (~$1.15 consommés sur l'intention 1, round-trip interrompu). Reprise : `node benchmarks/air-emission/emit.mjs` dès recharge |
| 2.5 | Gel registre v1 + revue propriétaire des capabilities (décision produit) | ⏳ |

## PHASE 1 — DÉTAIL (ouverte le 2026-08-27)

| Banc | Protocole | Exécution |
|---|---|---|
| Coûts LLM (caching) | ✅ | 🟢 **EXÉCUTÉ** — caching ×6,5 global / ×10 entrée confirmé ; **découverte : refus `cyber` 7/10 sur prompts de forme moteur** (détail : `benchmarks/couts-unitaires.md`) |
| P-001 Orchestration | ✅ | 🟢 **CANDIDAT (a) pgmq+état : CAMPAGNE OFFICIELLE EXÉCUTÉE — 5/5 épreuves éliminatoires réussies** (2026-08-27, base de test `deribfy-mobile-test`, durées du protocole ; journaux versionnés `benchmarks/orchestration/results/`). Mesures : E1 kill -9 → redélivrance prouvée (2 exécutions étape 3), 0 artefact dupliqué · E2 ré-enfilage idempotent 6 jobs/30 artefacts/0 doublon en 342 s (budget calculé 471 s, 2 workers) · E3 annulation propre · E4 exactement 2 tentatives puis `failed` · E5 fenêtre sans worker **prouvée** vide puis reprise. LOC orchestrateur candidat : 158. Campagne 1 (4/5) conservée : faux négatif E2 + fuite worker = **défauts du harnais v1, corrigés en v2** — le candidat n'a montré aucun défaut. **Candidat (b) Inngest : CAMPAGNE OFFICIELLE 5/5 également** (2026-08-27, mode connect, journal `benchmarks/orchestration/inngest/results/`) — E1 redélivrance cloud 157 s avec mémoïsation prouvée (étape 1 : 1 seule exécution) · E2 déduplication par id d'événement : 6 démarrages/12 envois, 160 s (parallélisme natif vs 342 s pour (a)) · E3 `cancelOn` : étape 3 jamais exécutée · E4 `retries:1`+`onFailure` : exactement 2 tentatives · E5 fenêtre prouvée vide puis reprise. **Candidat (c) Trigger.dev v4 : CAMPAGNE OFFICIELLE 5/5 également** (2026-08-27, cloud managé, version `20260827.1`, journal `benchmarks/orchestration/triggerdev/results/`) — E1 redélivrance **2 s** (backoff 1 s configuré) · E2 **101 s**, dédup `idempotencyKey` 6/12 · E3 `runs.cancel` propre · E4 exactement 2 tentatives · E5 fenêtre différée prouvée vide. **DÉCISION PRISE → D-016 : Trigger.dev v4** (arbitrage propriétaire du 2026-08-27 sur dossier complet — les trois candidats à 5/5 ; mesures, coûts, risques et mitigations consignés dans `DECISIONS.md`) |
| P-002 Sandbox | ✅ | 🔴 bloqué — comptes E2B/Modal/Fly/Vercel Sandbox + budget ~10-20 $ |
| P-003 Styling RN | ✅ | 🔴 bloqué — Xcode complet + simulateurs OU appareils ([mesuré] : absents de la machine) |
| E2E mobile | ✅ | 🔴 bloqué — mêmes prérequis que P-003 |
| Coûts EAS | ✅ | 🔴 bloqué — compte Expo/EAS |
| Coût projet Supabase | ✅ | 🔴 bloqué — token Management API (org de test) |

**D-015 ACTÉE (2026-08-27)** : résilience aux refus LLM — gestion explicite
de `refusal` sur tout chemin LLM, zéro panne silencieuse, fallbacks prévus
par l'architecture mobilisables, taux de refus = métrique Budget Governor ;
**fréquence réelle [à mesurer] sur corpus représentatif** (le n=10 du banc
prouve l'existence, pas le taux). Voir `DECISIONS.md` D-015.

## PHASES

| Phase | Intitulé | Statut |
|---|---|---|
| — | Confrontation architecturale + convergence | 🟢 TERMINÉ (2026-08-27) |
| — | Centre de contrôle créé (`e8530fe`) | 🟢 TERMINÉ (2026-08-27) |
| — | Validation du plan par le propriétaire | 🟢 TERMINÉ (2026-08-27) |
| 0 | Fondations (workspaces, CI, SDK) | 🟢 TERMINÉ (2026-08-27) |
| 1 | Bancs de mesure (P-001→P-003, coûts, E2E) | 🔵 EN COURS (bancs restants sur prérequis) |
| 2 | AIR v1 + Capability Registry v1 | 🔵 EN COURS (2.1 🟢) |
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
| ~~P-001~~ | Moteur d'orchestration | — | 🟢 tranché → **D-016 : Trigger.dev v4** (2026-08-27, sur dossier comparatif complet) |
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
| Refus classifieur `cyber` sur prompts de forme moteur — **existence [mesuré]** (7/10, n=10), **taux réel [à mesurer]** | ⚠️ suivi | **D-015 actée** : résilience structurelle (refusal géré partout, zéro panne silencieuse, fallbacks, métrique Budget Governor) ; mesure de fréquence sur corpus représentatif planifiée dans les campagnes aval |
| ~~Upgrade SDK Anthropic : ruptures d'API possibles~~ | 🟢 clos | Re-baseline exécuté le 2026-08-27 : aucune rupture, parité prouvée |

## RÈGLE DE CONTINUITÉ

Inscrite en règle permanente dans `CLAUDE.md` (2026-08-27). Toute session
sur ce chantier commence par `MASTER_PLAN.md`, `ARCHITECTURE.md`,
`ROADMAP.md`, `STATUS.md` (et `DECISIONS.md` si nécessaire). La mémoire de
conversation n'est jamais la source de vérité.
