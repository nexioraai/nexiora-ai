# STATUS — TABLEAU DE BORD DU CHANTIER MOBILE GENERATION

> Mis à jour à chaque étape significative. Dernière mise à jour :
> **2026-08-27** (**PHASE 2 TERMINÉE** — registre v1 GELÉ 1.0.0, D-020 ;
> bancs Phase 1 en attente de prérequis ; Phase 3 NON ouverte — P-003).

## ÉTAT GLOBAL

| | |
|---|---|
| Plan v0.1 | 🟢 **VALIDÉ ET FIGÉ** (propriétaire, 2026-08-27) — toute évolution passe par `DECISIONS.md` |
| Phase 0 — Fondations | 🟢 **TERMINÉE** (2026-08-27) — tous les critères de sortie vérifiés, dont **CI GitHub réelle verte : run #32, commit `54ef2a1`, `success`** (capture propriétaire + confirmation API Actions indépendante) |
| Phase actuelle | **PHASE 2 : 🟢 TERMINÉE** (2026-08-27 — critères de sortie tous satisfaits, registre v1 gelé D-020) · **PHASE 1** : 🔵 bancs restants bloqués sur prérequis propriétaire · **PHASE 3** : ⏳ NON ouverte (dépend de P-003, bloqué sur prérequis) |
| Générateur mobile | 🔵 **EN IMPLÉMENTATION** — premier paquet du moteur : `packages/air-schema` (AIR v1) |
| Progression globale | **2/15 phases terminées (0, 2)** · Phase 1 en cours |

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
  Phase 2 : **2.1 🟢 `@deribfy/air-schema`** · **2.2 🟢 migrations d'AIR** ·
  **2.3 🟢 `@deribfy/capability-registry`** (15 capabilities, cliquets) ·
  **2.4 🟢 émission structured outputs + corpus** (12/12 AIR valides,
  corpus de 12 domaines validé en CI — 121 tests paquets verts) ·
  **2.4-H 🟢 VALIDÉE (D-019)** : cause racine prouvée (fourche
  ordre×optionalité, matrice X1-X4 + généralisation sur artefacts),
  correction minimale appliquée (permutation entityId/props + garde
  PROPS_COUNT), **validation réelle finale 12/12 IDENTIQUES** ($9,67,
  0 retry, contre-vérifiée indépendamment — cycle D-018 complet).
  **2.5 🟢 gel du registre v1** (D-020 : 15 capabilities, version 1.0.0,
  critère d'inclusion v2, candidates tier B consignées) — **PHASE 2
  TERMINÉE, critères de sortie tous satisfaits**.
- **En cours** : Phase 1 uniquement (bancs sur prérequis).
- **Bloqué, prérequis propriétaire** : **Phase 3** (exige P-003 tranché) ·
  Phase 1 : P-002 (comptes E2B/Modal/Fly/Vercel Sandbox + budget
  ~10-20 $) · P-003 & E2E (Xcode complet + simulateurs et Android Studio,
  OU 2 appareils physiques + compte EAS) · coûts EAS (compte Expo/EAS) ·
  coût projet Supabase (token Management API, org de test).
- **Prochaine étape EXACTEMENT autorisée** : **le premier banc de Phase 1
  dont le prérequis arrive** (P-002 en priorité recommandée : il
  débloque la Phase 6 et P-003 débloque la Phase 3) — aucune étape de
  phase n'est exécutable sans prérequis propriétaire.
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
| 2.4 | Émission LLM structured outputs + round-trip + golden corpus. **Campagne complète exécutée** (12 intentions fixes, 3 classes commerce, ~$19,71 sur le budget de 20 $) : **12/12 AIR valides** (émission par sections + réparation bornée ≤ 1 passe : 14-32 diagnostics 1ʳᵉ passe → **0** partout) · **round-trip 12/12 conforme au schéma** (critère de sortie phase ✓) · **identité stricte au hash canonique : 5/12** [mesuré] · **corpus : 12 AIR de 12 domaines distincts** versionnés (`packages/golden-corpus/corpus/`), validés en CI sans réseau (39 tests). Contraintes API [mesuré] consignées (objets fermés, pas de oneOf/patternProperties/bornes, ≤ 24 optionnels, grammaire bornée → émission par sections) → évolution AIR v1 en paires fermées. **Limitation consignée** : 7/12 transcriptions round-trip sémantiquement cassées (motif binaire : 0 ou 14-37 diagnostics, sans corrélation de taille) — diagnostic instrumenté prêt (`replay-roundtrip.mjs`, dump complet) mais NON exécuté (budget épuisé, ~$0,5-1/rejeu) ; amélioration NON bloquante pour 2.5 | 🟢 **TERMINÉE** (2026-08-27) — critères ROADMAP satisfaits : émission structured outputs ✓ · round-trip 100 % conforme au schéma sur le corpus ✓ · corpus ≥ 10 domaines ✓ |
| 2.4-H | Hardening round-trip (hors ROADMAP, consigné — validé propriétaire). **Rejeu 8/8 exécuté** (7 échecs + 1 témoin, $6,09 réel vs 4-6 annoncés) : témoin **identique** (0 régression) ; les 7 échecs **rejouent tous à l'identique de la campagne**. **Cause CONFIRMÉE par dumps** : 18/19 sections canoniquement identiques partout — seule `screens` diffère, **tronquée à 1 écran sur 4** (2-4 blocs sur 20-31) dans les 7 cas : clôture volontaire schema-valide des tableaux longs (sections ≥ ~8 k chars), PAS une dérive d'ids ni d'échantillonnage. Hypothèses infirmées [mesuré] : `temperature` **déprécié/refusé (400) sur claude-opus-5** ; ancrage des ids sans effet (les ids n'étaient pas le problème) | 🟠 **CAMPAGNE RÉELLE v2 EXÉCUTÉE (12 rejeux, $8,94)** : **5/12 identiques** (contre-vérifiés à l'octet canonique, 0 diagnostic) — exactement les 5 succès v1 (non-régression ✓) ; **7/12 REFUSÉS fail-closed** (`SECTION_COUNT`, jamais de document partiel) — le modèle sous-émet les blocs d'un écran précis (1-3 émis sur 5-9) même en appel MONO-ÉCRAN avec contrat de comptes explicite, sorties minuscules (110-231 tokens), **reproductible** (mêmes 7 documents en campagne, rejeu v1 et rejeu v2, à deux granularités et trois prompts). Causes ÉLIMINÉES [mesuré] : longueur de sortie, dérive d'ids, échantillonnage (reproductible), prompt. **SONDE EXÉCUTÉE ($0,30, brut intégral conservé)** : H-B contexte INFIRMÉE (tronque aussi en rendu minimal) · H-D modèle infirmée (sonnet tronque aussi) · **décodage contraint = facteur nécessaire** (sans grammaire : 7/7 blocs fidèles) · **DÉCOUVERTE H-I** : le rendu étiquette « type »/« entité » alors que le schéma exige `blockType`/`entityId` — sans grammaire le modèle émet naturellement `"type"` ; sous grammaire ce vocabulaire interdit fait dérailler la génération sur matériel dense (brut : props supprimées — schema-valides car optionnelles —, ids fabriqués, clôture précoce). Corrélation parfaite 12/12 : docs fautifs = pairsMax ≥ 9 / ligne-bloc moyenne ≥ 305 chars. **MATRICE X1-X4 EXÉCUTÉE ($0,54)** — mécanisme démontré sur le cas canonique (`scr_article`, ×2 par bras, contre-vérifié à l'octet) : **fourche ordre×optionalité** — la grammaire suit l'ordre de déclaration du schéma (`props` avant `entityId`) alors que l'ordre naturel du modèle est inverse ; `props` étant OPTIONNELLE, la branche naturelle est légale et FORCLOT les props → dégradation en cascade. Preuves : X4 (props requises) 7/7 identique ×2 · X3′ (ordre naturel) 7/7 identique ×2 · X1 (JSON inline) 7/7 identique ×2 · X2 (labels) échoue comme la base → **H-I/vocabulaire RÉFUTÉE, densité-suffit RÉFUTÉE, présentation-nécessaire RÉFUTÉE**. **Généralisation ensuite DÉMONTRÉE sur artefacts ($0)** : vrai discriminant = blocs « armés » (props+entityId — 14-19 dans chaque doc fautif, 0 dans les 5 sains ; densité = proxy), signatures conformes 17/17, 0 contre-exemple. **CORRECTION D-019 APPLIQUÉE ET LOCALEMENT PROUVÉE ($0)** : permutation entityId/props dans `blockInstanceSchema` (= X3′, 7/7 identique ×2 sur API réelle) + garde harnais `PROPS_COUNT` ; preuves T1 (diff = seule relocalisation du nœud entityId) · T2 (121/121, tsc/lint 0) · T3 (12/12 hashes corpus inchangés) · T4 (simulation 27 scénarios ×2). **VALIDATION RÉELLE FINALE EXÉCUTÉE (2026-08-27, $9,67 / plafond $14) : 🟢 2.4-H VALIDÉE — 12/12 IDENTIQUES** (90 appels, 0 retry contenu, 0 retry API, 0 refus, brut intégral journalisé, HEAD gelé prouvé) ; contre-vérification indépendante : re-parse + hash + forme canonique 12/12, ex-fautifs 7/7, ex-sains 5/5, 0 diagnostic |
| 2.5 | Gel registre v1 + revue propriétaire. Double confrontation technique menée (périmètre, biais corpus, critère d'inclusion) ; décisions propriétaire consignées **D-020** : 15 capabilities gelées (biometrics CONSERVÉE — inférence corpus invalidée), version **1.0.0** (registre + 15 contrats), cliquet verrouillé (version + liste + contrats), `push_notifications` clarifiée (push + locales), candidates tier B hors registre (documents, audio/micro, background_fetch, contacts, passkeys), défauts tiers révisables au lock, critère d'inclusion v2, règle d'évolution post-gel | 🟢 **TERMINÉE** (2026-08-27) — 122/122 tests paquets verts, corpus 12/12 valide |

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
| 2 | AIR v1 + Capability Registry v1 | 🟢 TERMINÉ (2026-08-27) |
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
