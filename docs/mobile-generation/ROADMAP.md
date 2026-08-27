# ROADMAP — MOBILE APP GENERATION ENGINE

| | |
|---|---|
| Version | v0.1 — en attente de validation (voir `MASTER_PLAN.md`) |
| Date | 2026-08-27 |
| Règle | Aucune phase n'est sautée ou déclarée terminée sans ses critères de sortie vérifiés et consignés dans `STATUS.md`. Les critères ne sont jamais assouplis après coup. |

Format de chaque phase : objectif · pourquoi · dépendances · tâches ·
critères d'entrée · critères de sortie (tests/validation inclus).

---

## PHASE 0 — FONDATIONS DU CHANTIER

- **Objectif** : rendre le dépôt capable d'héberger le moteur.
- **Pourquoi** : le moteur ne peut pas vivre dans `src/` de l'app Next
  (cliquets et config de test calibrés app) ; le SDK IA est trop ancien.
- **Dépendances** : validation du MASTER_PLAN (fige le plan).
- **Tâches** : trancher P-005 (monorepo) ; mettre en place les workspaces ;
  déplacer l'app web en paquet sans changement de comportement ; étendre la
  CI (lanes par paquet) ; upgrade SDK Anthropic + re-baseline des routes IA
  web existantes ; règle de continuité inscrite (lecture du centre de
  contrôle en début de session).
- **Entrée** : plan figé.
- **Sortie** : suite complète du dépôt verte inchangée (4071+ tests) ; build
  et déploiement web inchangés (preuve : parité de comportement) ; nouveaux
  paquets lint-bloquant ; CI verte ; `STATUS.md` à jour.

## PHASE 1 — BANCS DE MESURE (décisions expérimentales)

- **Objectif** : trancher par la mesure les choix listés « à mesurer ».
- **Pourquoi** : règle du chantier — pas de décision d'infrastructure sur
  papier.
- **Dépendances** : Phase 0.
- **Bancs** :
  - **P-001 orchestration** : pgmq+state machine vs Inngest/Trigger.dev —
    critères : reprise après `kill -9` en plein job, idempotence prouvée,
    annulation, coût mensuel estimé, observabilité ;
  - **P-002 sandbox** : E2B vs Modal vs Fly Machines vs Vercel Sandbox —
    critères : cold start, cache npm inter-jobs, egress policy, prix/minute
    d'un pipeline install+tsc+tests représentatif ;
  - **P-003 styling RN** : StyleSheet+tokens vs unistyles vs Tamagui vs
    NativeWind — critères : perfs listes, poids, compat New Architecture,
    étanchéité aux contrats de primitives ;
  - **coûts unitaires** : $ par génération (LLM avec/sans prompt caching),
    $ par build EAS, minutes par build, $ par projet Supabase provisionné ;
  - **E2E** : Maestro vs Detox sur un mini-projet Expo (flakiness, vitesse).
- **Entrée** : Phase 0 close.
- **Sortie** : chaque décision P-00x consignée dans `DECISIONS.md` avec les
  mesures brutes archivées ; budget unitaire initial documenté.

## PHASE 2 — AIR v1 + CAPABILITY REGISTRY v1

- **Objectif** : le schéma AIR (zod) avec identités stables, air/lock/state,
  et le registre des ~15 capabilities cœur (avec classe commerce, impact
  natif, permissions).
- **Pourquoi** : tout l'aval en dépend ; c'est la source de vérité.
- **Dépendances** : Phase 0 (paquets) ; Phase 1 non bloquante.
- **Tâches** : schémas + validateur sémantique ; migrations d'AIR testées ;
  émission LLM par structured outputs (round-trip : intention → AIR → rendu
  texte → même AIR) ; début du golden corpus (≥ 10 AIR de domaines variés) ;
  cliquets de registre.
- **Sortie** : round-trip structured outputs 100 % conforme au schéma sur le
  corpus ; migrations testées ; registre gelé v1 ; revue propriétaire des
  capabilities v1 (décision produit).

## PHASE 3 — DESIGN SYSTEM + PRIMITIVES + PREMIERS SMART BLOCKS

- **Objectif** : tokens double cible, primitives contractuelles, 4-6 blocs
  (AuthFlow, List/Detail, Form, Profile) testés.
- **Pourquoi** : les blocs sont la matière du compilateur ; leur contrat est
  la base de l'Oracle.
- **Dépendances** : Phase 2 (contrats typés par l'AIR) ; P-003 tranché.
- **Sortie** : chaque bloc = contrat + tests unitaires/intégration + version
  au registre ; harnais de rendu sur device/émulateur (light/dark, RTL,
  états loading/empty/error) vert ; tokens compilés web+RN depuis la source
  JSON unique.

## PHASE 4 — COMPILATEUR DÉTERMINISTE v1

- **Objectif** : AIR+lock → projet Expo complet, byte-reproductible.
- **Dépendances** : Phases 2-3.
- **Sortie (critère dur)** : sur tout le golden corpus, 10 compilations
  successives → hash de sortie identique 10/10 ; app témoin compilée lance
  sur émulateur iOS et Android ; artefacts au store SHA-256 ; aucun appel
  LLM dans le chemin de compilation (prouvé par instrumentation).

## PHASE 5 — BACKEND PROVISIONER v1

- **Objectif** : provisioning Supabase isolé par app depuis l'AIR.
- **Dépendances** : Phase 2 ; P-004 (palier preview) tranché.
- **Sortie** : cycle provision → vérification automatisée (style barrières
  fail-closed) → teardown prouvé ; test d'isolation : l'app A ne peut lire
  aucune donnée de l'app B ni du cœur (preuve par tentative) ; SQL généré
  archivé comme artefact.

## PHASE 6 — SANDBOX + ORACLE v1

- **Objectif** : pipeline install/typecheck/lint/AST/tests dans la sandbox
  choisie ; Oracle niveaux 1 (déterministe) et 2 (E2E device).
- **Dépendances** : Phase 4 ; P-002 tranché ; outil E2E tranché.
- **Sortie** : pipeline complet vert sur l'app témoin ; flows E2E générés
  depuis l'AIR (navigation + états + RTL) verts sur émulateurs iOS/Android ;
  temps et coût par pipeline mesurés et consignés ; preuve « sandbox sans
  secrets » (aucun secret accessible, test par tentative).

## PHASE 7 — WORKFLOW ASYNCHRONE DURABLE

- **Objectif** : queue + state machine + workers portant tout le pipeline.
- **Dépendances** : Phases 4-6 ; P-001 tranché.
- **Sortie (critère dur)** : génération bout-en-bout pilotée par jobs ;
  `kill -9` d'un worker en plein milieu → reprise correcte sans doublon
  (idempotence prouvée) ; cancellation propre ; timeouts ; état inspectable.

## PHASE 8 — VERTICAL SLICE 1 (domaine : restaurant)

- **Objectif** : bout-en-bout réel — intention → AIR → gate → compile →
  backend → sandbox → oracle → **preview QR sur appareils physiques
  iOS + Android** (dev build + canal OTA de preview).
- **Pourquoi** : forcer l'intégration ; premier scorecard.
- **Dépendances** : Phases 2-7.
- **Sortie** : app installée et fonctionnelle sur 2 appareils physiques ;
  scorecard v1 rempli (taux de succès, temps, coût, repairs=0 attendu ici,
  qualité UI évaluée) ; rétrospective consignée. Garde-fou : tout écart
  construit à la main pour « faire passer » le slice est consigné comme
  dette du GÉNÉRATEUR, pas comme solution.

## PHASE 9 — REPAIR LOOP + CODE SLOTS

- **Objectif** : slots avec politique AST complète ; boucle de réparation
  bornée et budgétée ; juge ≠ auteur.
- **Dépendances** : Phase 8.
- **Sortie** : sur le slice 1, une panne provoquée (« le bouton Commander ne
  fonctionne pas ») est diagnostiquée et réparée automatiquement, avec
  analyse d'impact et vérification Oracle ; les gardes AST mordent (preuve
  par mutation : un slot tentant un fetch direct ou l'édition d'un bloc est
  refusé) ; budget respecté.

## PHASE 10 — VERTICAL SLICE 2 (domaine hors-template)

- **Objectif** : généralisation réelle — domaine sans template prédéterminé
  (ex. réservation/suivi simplifié de conteneurs) ; première abstraction
  provider exercée (interface + 1 implémentation réelle + 1 mock de
  substitution prouvant le remplacement).
- **Dépendances** : Phase 9.
- **Sortie** : app fonctionnelle sur appareils physiques ; scorecard
  cross-domain à 2 domaines ; preuve de substitution de provider sans
  changement d'AIR ; liste mesurée des capabilities manquantes → alimente le
  registre v2.

## PHASE 11 — CAPABILITY ROUTER + RUNTIME PROFILES + OTA

- **Objectif** : routage OTA/native par empreinte calculée ; profils de
  runtime versionnés ; canaux OTA.
- **Dépendances** : Phase 8 (apps réelles à router).
- **Sortie** : modification UI livrée en OTA sur les deux slices en
  < 15 min ; ajout d'une capability native → rebuild routé automatiquement ;
  tentative de livrer en OTA un changement d'empreinte → REFUSÉE par le
  routeur (preuve par tentative) ; rollback OTA testé.

## PHASE 12 — STORE POLICY GATE + COMPLIANCE + APP IDENTITY / BYO

- **Objectif** : gate complet (licéité, IAP, permissions, a11y) ; génération
  privacy manifests / Data Safety / suppression de compte ; onboarding
  compte développeur client ; custody signature au Vault.
- **Dépendances** : Phases 8-11.
- **Sortie** : une app de slice soumise **TestFlight sous un compte BYO de
  test** ; manifestes générés acceptés par les validateurs locaux
  Apple/Google ; app « biens numériques » correctement forcée vers IAP par
  le gate (preuve par tentative Stripe → FAIL) ; procédure de custody/rotation
  des clés documentée et exercée.

## PHASE 13 — DISTRIBUTION RÉELLE + GUARDIAN v1

- **Objectif** : première publication store réelle ; rollout/rollback ;
  télémétrie de flotte active ; kill-switch.
- **Dépendances** : Phase 12.
- **Sortie** : app publiée sur les deux stores sous compte BYO ; OTA
  post-publication livré ; rollback exercé ; crash reporting remontant au
  Fleet ; migration backend expand/contract exécutée par le Guardian sur
  une app vivante (preuve).

## PHASE 14 — FLEET MANAGER + INDUSTRIALISATION + SCORECARD ÉLARGI

- **Objectif** : gestion de flotte (versions, deadlines stores, migrations),
  release train N/N-1/N-2 opérationnel, scorecard sur ≥ 6 domaines dont
  ≥ 2 hors-template.
- **Sortie** : tableau de flotte exact ; une migration de train exécutée sur
  toutes les apps de test ; scorecard publié avec les métriques officielles
  (taux génération/build/tests, repairs, temps, coût, stabilité, qualité UI,
  conformité, généralisation).

---

## DÉPENDANCES TRANSVERSES

- Le **Budget Governor** s'instrumente dès la Phase 1 (coûts unitaires) et
  gate toutes les phases suivantes.
- L'**observabilité** (traces pipeline) se pose en Phase 6-7, pas après.
- La **sécurité agents** (§27 ARCHITECTURE) s'applique dès le premier prompt
  de la Phase 2.
- Les phases 2-3 et 5 peuvent avancer en parallèle après la Phase 0 ; les
  slices (8, 10) sont des points de convergence obligatoires.
