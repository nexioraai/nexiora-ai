# ARCHITECTURE DE RÉFÉRENCE — MOBILE APP GENERATION ENGINE

| | |
|---|---|
| Version | v0.1 — en attente de validation (voir `MASTER_PLAN.md`) |
| Date | 2026-08-27 |
| Portée | Référence d'implémentation. Chaque section fait autorité pour son étage. |

Qualification utilisée : **[mesuré]** = vérifié dans le dépôt Deribfy réel ;
**[démontré]** = vérifiable dans une documentation officielle stable ;
**[à mesurer]** = décision expérimentale (Phase 1, voir `DECISIONS.md`).

---

## 0. VUE D'ENSEMBLE

```
USER INTENT
    ↓
AI UNDERSTANDING            (LLM, structured outputs)
    ↓
AIR                         (source de vérité, versionnée, mutations par diff)
    ↓
CAPABILITY SYSTEM           (registre fermé, profils, classe commerce)
    ↓
SMART BLOCKS + CODE SLOTS   (contrats + code spécifique borné)
    ↓
STORE POLICY GATE           (licéité, IAP, 4.2.6, permissions, a11y)
    ↓
DETERMINISTIC COMPILER      (AIR+lock → projet Expo, byte-reproductible)
    ↓
BACKEND PROVISIONING        (projet Supabase isolé par app)
    ↓
SANDBOX                     (éphémère, sans secrets)
    ↓
ORACLE                      (déterministe > device E2E > LLM-juge subordonné)
    ↓
REPAIR LOOP                 (borné, budgété, jamais arbitraire)
    ↓
CAPABILITY ROUTER           (empreinte native = autorité OTA/rebuild)
    ↓
RUNTIME PROFILES / EAS BUILD
    ↓
PREVIEW / QR                (compte Deribfy, données de démo uniquement)
    ↓
DISTRIBUTION                (BYO Developer Account)
```

---

## 1. AIR — APPLICATION INTERMEDIATE REPRESENTATION

- **Contenu** : écrans, navigation, entités, relations, données, actions,
  règles métier, capabilities, permissions, design, intégrations, réseau,
  configuration, exigences natives, conformité, tests attendus.
- **Schéma** : autorité = schémas **zod** (déjà dans le stack [mesuré]),
  projetés en JSON Schema. Versionné (`air_schema_version`), migrable — les
  migrations d'AIR sont testées comme les migrations SQL du dépôt
  (expand/contract, barrières).
- **Identités stables** : chaque nœud (écran, entité, action, slot) porte un
  identifiant stable, indépendant de son libellé. Les modifications
  utilisateur (« le bouton Commander ne marche pas ») ciblent un nœud, pas
  un texte.
- **Mutations par diff** : une app existante n'est JAMAIS régénérée de zéro.
  Toute évolution = patch d'AIR (ciblé par identifiants stables) → analyse
  d'impact → routage OTA/native. La régénération complète est réservée à la
  création.
- **Trois réalités séparées** :
  - `project.air` — ce que l'app doit être ;
  - `project.lock` — versions exactes résolues (blocks, capabilities,
    providers, release train, toolchain) ;
  - `deployment state` — ce qui est réellement déployé (par plateforme,
    par canal OTA, par version store).
- L'AIR ne contient PAS de comportement arbitraire : le comportement
  spécifique passe par Code Slots ou capabilities.
- **Émission par LLM** : structured outputs (schéma strict) — un AIR émis est
  syntaxiquement valide par construction [démontré, API Claude] ; la
  validité sémantique est vérifiée par le validateur AIR (déterministe).
- Le contenu généré (textes, assets, données initiales) est produit AVANT la
  compilation et stocké (hashé) dans l'AIR/les assets : la compilation reste
  pure.

## 2. CAPABILITY SYSTEM

- Le LLM demande une capacité (`camera`, `payments`, `push_notifications`,
  `maps`, `offline_storage`…). **Il ne choisit jamais un package ni un
  provider.** Le Capability Graph résout vers une implémentation autorisée.
- **Champs d'une capability** : id ; version ; implémentation ; dépendances
  (dont natives) ; compatibilité iOS/Android ; compatibilité runtime
  (profils) ; configuration native ; permissions induites ; coût ;
  **impact d'empreinte native** ; compatibilité OTA ; exigence de rebuild ;
  **classe commerce** (`digital` ⇒ IAP obligatoire / `physical_or_offapp` ⇒
  PSP type Stripe autorisé) ; contraintes ; conflits ; provenance ;
  empreinte de build.
- Continuité Deribfy [mesuré] : même philosophie que les cinq frontières
  existantes (`canTransact`, `resolveFulfillmentDomain`, `modeCapabilities`,
  `hasSupplierCatalog`, `toolCapabilities`) — allowlists positives ; une
  capacité ne s'obtient que par inscription au registre.

## 3. SMART BLOCKS

- Trois niveaux : PRIMITIVES → SMART BLOCKS → APPLICATION.
- Un bloc officiel possède : contrat comportemental ; tests unitaires et
  d'intégration ; version ; entrée au registre ; intégration vérifiée.
  Un bloc non testé n'est pas officiel.
- **Copie régénérable** : le bloc est copié dans le projet généré
  (autonomie), mais la copie est un **artefact de sortie du compilateur**,
  adressée version+hash, **jamais éditée sur place** — ni par le Repair
  Loop, ni par un Code Slot. Toute correction = bump de version du bloc +
  recompilation ciblée (Fleet Manager). Un garde AST refuse tout diff
  touchant une copie de bloc.
- Migration : quand l'architecture évolue, la régénération depuis
  AIR + lock + nouveau train reproduit l'app — les blocs ne peuvent pas
  devenir des forks incontrôlables.

## 4. CODE SLOTS

- Le spécifique-domaine vit dans des slots : signature ; inputs/outputs
  typés ; **imports en allowlist** ; permissions ; tests ; contraintes.
- Politique AST sur les slots : pas d'accès réseau direct (le client HTTP
  fourni est le seul chemin) ; pas d'accès filesystem/secret ; pas d'import
  hors allowlist ; pas de modification d'une copie de bloc.
- Modèle de menace : un slot est du code écrit par LLM sous influence
  potentielle du prompt utilisateur (injection indirecte). Les gardes
  ci-dessus + sandbox sans secrets + RLS par app (tenancy) bornent l'impact.

## 5. STORE POLICY GATE (étage ajouté)

Placé APRÈS la résolution AIR/capabilities, AVANT toute dépense de
compilation/sandbox. Vérifie, de manière déterministe :
- **licéité et politique stores du domaine demandé** (jeu, médical régulé,
  adulte, sanctions/export) — refus motivé avant tout coût ;
- **classe commerce** : biens numériques ⇒ `payments.iap` imposé, PSP
  interdit pour ce flux [démontré : App Store Guideline 3.1.1] ; biens
  physiques/services ⇒ PSP autorisé ;
- **4.2.6 / 4.3** : la distribution exige un compte BYO (§17) ;
- permissions dérivées de l'AIR uniquement — toute permission non dérivable
  = FAIL ;
- exigences d'accessibilité applicables (European Accessibility Act pour
  l'e-commerce UE) [démontré].

## 6. COMPILATEUR DÉTERMINISTE

- `AIR + capabilities + blocks + slots + lock` → projet React Native/Expo.
- Aucun LLM dans la compilation. Même entrée + mêmes versions = **sortie
  byte-identique** — testé par golden corpus d'AIR + hash de sortie
  (critère de sortie de la Phase 4).
- Sorties : projet complet, manifestes (permissions, privacy), config
  native, artefacts hashés (SHA-256) dans l'Artifact Store.
- Objectifs servis : reproductibilité, cache, diff, rollback, debug, audit.

## 7. BACKEND PROVISIONER

- `AIR → data model → provisioner déterministe → Supabase` : tables,
  relations, index, RLS, storage, functions, webhooks.
- **Tenancy (non-négociable 21)** : jamais dans le projet Supabase cœur.
  Cible : un projet par app (Management API). Un palier mutualisé
  (schéma-par-app + RLS) pour preview/free est une décision en attente
  (`DECISIONS.md` P-004) ; s'il existe, il est physiquement distinct du
  cœur et ne contient jamais de données réelles.
- **Style de sortie** : le SQL généré reprend le patron éprouvé du dépôt
  [mesuré] — additif, expand/contract, barrières `RAISE EXCEPTION`
  fail-closed, relevés avant/après, rejouable. La convention « SQL manuel +
  preuves » reste la loi du projet cœur ; les projets générés sont
  machine-provisionnés avec vérifications automatisées équivalentes.
- Les migrations des apps VIVANTES (évolution d'AIR) sont exécutées par le
  Guardian selon le même patron expand/contract.
- Multi-provider : Supabase est le provider backend initial ; le Provisioner
  parle à une interface de provisioning, pas à Supabase en dur.

## 8. SANDBOX

- Pipeline : job → sandbox éphémère → install → typecheck → lint → AST/policy
  → tests → bundle → destroy.
- Propriétés : filesystem éphémère ; non-root ; quotas CPU/RAM ; timeout ;
  réseau contrôlé ; **aucun secret** ; dépendances contrôlées (provenance →
  lockfile → allowlist → install policy → scripts policy → network policy) ;
  destruction garantie. `--ignore-scripts` par défaut, exceptions
  explicitement autorisées par le registre.
- Provider [à mesurer] : E2B / Modal / Fly Machines / Vercel Sandbox —
  critères : démarrage à froid, cache npm inter-jobs, politique egress,
  prix/minute (banc Phase 1).

## 9. ORACLE

Pile par ordre d'autorité — un étage inférieur ne peut jamais outrepasser un
étage supérieur :
1. **Déterministe** : tsc strict ; tests de contrats de blocs ; politique
   AST (slots, copies de blocs, réseau) ; **diff permissions/manifestes vs
   AIR** ; validation de schéma backend ; conformité (gate §5 rejoué sur le
   produit compilé).
2. **Comportemental sur device/émulateur** : flows E2E générés depuis l'AIR
   (navigation, états loading/error/empty/success, RTL) — outil pressenti
   Maestro [à confirmer au banc], Detox en alternative.
3. **LLM-juge** : qualité visuelle/UX uniquement ; aucune autorité sur les
   gates 1-2 ; **modèle/contexte distinct de l'auteur** du code jugé.
Le générateur ne peut pas déclarer « le test est réussi » : l'Oracle est un
service séparé qui lit les artefacts, pas la conversation.

## 10. REPAIR LOOP

```
FAIL → DIAGNOSE → CLASSIFY → PLAN → IMPACT ANALYSIS → SIMULATE
     → POLICY GATE → APPLY → VERIFY → COMMIT   (sinon ROLLBACK)
```
- Le repair modifie l'AIR ou les slots — jamais les blocs, jamais la
  structure, jamais les seuils de l'Oracle.
- Borné : nombre d'itérations max + budget (Budget Governor). Au-delà :
  échec propre, remonté à l'humain.
- Économie : prompt caching sur le préfixe stable (contrats, registre)
  [démontré, API Claude].

## 11. CAPABILITY ROUTER

- **Autorité de décision : l'empreinte native calculée** du projet compilé
  (outillage d'empreinte Expo, `runtimeVersion`) [démontré]. Empreinte
  inchangée vs runtime cible ⇒ OTA ; changée ⇒ native build (EAS).
- Les métadonnées de capability (OTA-compatible, rebuild requirement) sont
  un pré-filtre d'analyse d'impact, jamais l'autorité finale.
- Le `deployment state` enregistre par app : profil runtime, empreinte,
  canal OTA, version store.

## 12. RUNTIME PROFILES

- Petit nombre de **profils versionnés** par release train (ex. `core`,
  `commerce`, `media-location`), chaque app liée au plus petit profil
  couvrant ses capabilities. Objectifs : binaires plus légers, permissions
  minimales, surface d'attaque réduite, review store plus sûre.
- La composition des profils est pilotée par la télémétrie du Fleet Manager
  (capabilities réellement demandées).
- Un profil embarque la télémétrie de crash de flotte (type Sentry
  [à confirmer]) et le canal OTA.

## 13. EAS / NATIVE BUILD

- Builds natifs exécutés hors de l'infrastructure principale (EAS Build)
  [démontré]. Xcode/Android SDK jamais requis sur l'infra Deribfy.
- Coûts et temps de build = métriques de première classe (Budget Governor).

## 14. WORKFLOW ASYNCHRONE DURABLE

- Exigences : durable jobs, queue, workers, state machine explicite,
  retries, idempotence, cancellation, recovery après crash, timeouts.
- Réalité du dépôt [mesuré] : aucune infra de jobs ; les fonctions Vercel ne
  conviennent pas aux étapes longues. **Nouvelle couche requise** : état
  durable + file en Postgres (projet cœur) et **workers conteneurisés hors
  Vercel** — moteur exact [à mesurer] (P-001 : pgmq+state machine maison vs
  Inngest/Trigger.dev ; Temporal écarté en v1 sauf preuve au banc).
- Critère absolu (banc Phase 1) : reprise correcte après `kill -9` d'un
  worker en plein job ; idempotence prouvée ; annulation propre.

## 15. MULTI-PROVIDER

- `capability → provider abstraction → provider A/B/C…` pour : paiements,
  cartes, géolocalisation, transport, logistique, tracking, messagerie,
  auth, stockage, analytics, IA, réservation, données métier…
- **v1 : les interfaces/contrats de provider sont obligatoires dès le
  premier provider ; les implémentations multiples arrivent à la demande.**
  On ne code jamais deux providers « pour le principe » ; on interdit
  simplement au code de dépendre d'un provider concret.
- Le système gère : sélection, fallback quand techniquement possible,
  remplacement, versioning des API, quotas, health, credentials isolés
  (Vault), compatibilité, migration.

## 16. IDENTITÉ / SECRETS / VAULT

- `User → Deribfy Auth → Project → Identity Service → Vault`.
- Credentials isolés par app/tenant : Apple, Google, Stripe, APIs externes,
  APNs/FCM. Aucun secret dans une sandbox ; aucun secret dans un binaire
  mobile (clé anon + RLS uniquement ; attestation d'appareil — Play
  Integrity / DeviceCheck — pour les APIs sensibles).
- **Custody de signature** : keystores Android (Play App Signing exigé),
  certificats/profils iOS par compte BYO — stockés au Vault, procédure de
  rotation et de perte documentées. Perdre une clé de signature = app
  définitivement non mise à jour : ce sous-système est critique.

## 17. BYO DEVELOPER ACCOUNT & APP IDENTITY (v1 structurel)

- [démontré] App Store Guideline 4.2.6 : les apps issues d'un service de
  génération doivent être soumises par le compte du client final ; 4.3
  pénalise les clusters d'apps similaires sous un même compte.
- Conséquence : **la distribution passe par le compte Apple/Google du
  client** dès la première app publiée. Seul le PREVIEW (dev builds,
  TestFlight interne, Internal testing) vit sous le compte Deribfy.
- L'App Identity Service gère : onboarding du compte client, App Store
  Connect API / Play Developer API, credentials au Vault, métadonnées.
- L'automatisation complète de publication peut s'étaler ; le MODÈLE est en
  place dès la conception.

## 18. COMPLIANCE GENERATOR

Généré depuis l'AIR : privacy (données collectées), permissions, privacy
manifests + required-reason APIs (Apple), Data Safety (Google), suppression
de compte in-app (dès qu'il y a des comptes), classification paiements
(IAP/PSP — cohérente avec le gate §5), accessibilité (EAA), métadonnées
stores. Objectif : détecter structurellement AVANT soumission — aucune
garantie d'acceptation n'est promise, le risque est réduit et mesuré.

## 19. CONTENT PIPELINE

Une app générée n'est jamais vide : placeholders cohérents, assets, images,
données initiales, import utilisateur. Produit avant compilation, stocké
hashé. Les données de preview sont TOUJOURS des données de démonstration —
jamais de données réelles dans le palier preview.

## 20. NETWORK POLICY

- Vérité technique assumée : sur l'appareil, la politique réseau est un
  **contrôle de compilation** (AST : réseau uniquement via le client fourni,
  destinations déclarées dans l'AIR) + un **contrôle d'exécution côté
  backend/proxy** pour les endpoints sensibles. Aucun contrôle runtime
  device n'est prétendu.
- Egress sandbox : allowlist stricte (registre npm miroir, endpoints de
  build).

## 21. INTERNATIONALISATION

- Quatre langues distinctes : langue de l'utilisateur créateur ≠ langue de
  l'app ≠ langue du contenu ≠ langues des utilisateurs finaux.
- i18n structurel : ICU/pluralisation, formats régionaux, devises, dates,
  nombres, RTL/LTR réels (miroir de layout testé par l'Oracle en E2E),
  contenu multilingue.
- Continuité [mesuré] : Deribfy pratique déjà fr/en/es/ar avec cliquet
  d'exhaustivité — la discipline est reconduite côté RN.

## 22. DESIGN SYSTEM

- `Design tokens (JSON, source unique) → codegen → (CSS web existant, thème
  RN) → primitives → smart blocks → application`.
- Couverture : light/dark, responsive/adaptive, typographie, spacing,
  radius, elevation, animations, contraste, états
  loading/empty/error/success, idiomes iOS/Android, cohérence cross-screen.
- **Accessibilité = conformité** (gate + Oracle), pas seulement qualité.
- Anti-template : la variété visuelle par app (directions proposées, tokens
  par app) est testée par le scorecard — une app générée ne doit pas
  ressembler à un gabarit IA générique.
- Lib de styling RN [à mesurer] (P-003) — contrainte : le choix ne doit
  jamais fuiter dans les CONTRATS de primitives (lib remplaçable).

## 23. OBSERVABILITÉ

- Pipeline : traces OpenTelemetry sur Generation/AI/AIR/Compiler/Sandbox/
  Tests/Build/Deployment ; coûts par étape (Budget Governor).
- Flotte : crash reporting embarqué dans les profils runtime ; santé par
  app/version dans le Fleet Manager.

## 24. ARTIFACT STORE

Artefacts immuables adressés SHA-256 (object storage) : projets compilés,
bundles OTA, images de build, blocs copiés, AIR/lock. Déduplication, cache,
rollback, reproductibilité, audit. Les images de toolchain des trains sont
archivées comme artefacts (une release N-2 doit rester RECOMPILABLE).

## 25. PLATFORM RELEASE TRAIN

- Une release fixe : AIR schema, compilateur, blocks, capabilities, Expo/RN,
  runtime profiles, build image. Trains N / N-1 / N-2 maintenus, migration
  contrôlée.
- **Le calendrier est celui des stores et d'Expo** [démontré] : plancher
  Xcode/SDK Apple (printemps), target API Google (été), cadence SDK Expo.
  Le Fleet Manager porte les deadlines de re-soumission par app ; un train
  non soumettable est un train mort, quelles que soient nos préférences.

## 26. LIVE APP GUARDIAN & FLEET MANAGER (architecturés v1, implémentés plus tard)

- Guardian : rollout, migrations (expand/contract générées), rollback OTA,
  compatibilité, health, kill-switch/remote config par app.
- Fleet Manager : version/capabilities/runtime/vulnérabilités/migrations/
  état de déploiement/deadlines stores pour chaque app (cible : 10 000).
- Dès la v1 : les IDENTIFIANTS et le schéma de `deployment state` sont
  conçus pour eux (aucun code Guardian/Fleet requis avant la Phase 13).

## 27. SÉCURITÉ DES AGENTS IA (injection indirecte)

- Séparation stricte : instructions ≠ données utilisateur ≠ données
  applicatives ≠ secrets ≠ outils ≠ permissions. Les données de production
  d'une app générée n'entrent JAMAIS comme contexte non contrôlé d'un agent.
- Moindre privilège par étage : l'agent d'intention ne voit pas les
  credentials ; l'agent de repair voit le diagnostic et les contrats, pas
  les secrets ; le juge ne voit pas le prompt de l'auteur.
- Toute donnée non fiable injectée dans un prompt est balisée comme donnée
  (jamais comme instruction) ; les canaux privilégiés (rôle système) sont
  réservés à l'orchestrateur.

## 28. MODÈLES IA

- Défaut moteur : `claude-opus-5` (AIR, slots, repair, juge UX sur contexte
  distinct) ; effort réduit pour les tâches mécaniques ; structured outputs
  pour toute émission structurée ; prompt caching sur les préfixes stables.
- [mesuré] Le dépôt épingle un SDK Anthropic ancien (`^0.99.0`) et des
  modèles d'ancienne génération dans les routes existantes : mise à niveau
  requise en Phase 0 (avec re-baseline des routes IA web existantes).

## 29. INTÉGRATION AU DÉPÔT DERIBFY

- [mesuré] Dépôt actuel : application Next unique, sans workspaces ;
  cliquets d'architecture (14 fichiers/273 tests) calibrés pour cette app ;
  CI GitHub Actions bloquante (tsc, 4071 tests, build, api-docs) ;
  production = `main` via PR de release.
- Cible : **monorepo à workspaces** (P-005, recommandé) — l'app web devient
  un paquet ; le moteur vit dans `packages/` (air-schema, primitives,
  blocks, compiler, capability-registry, runtime, oracle, provisioner…) ;
  les nouveaux paquets naissent lint-bloquant (la dette lint existante ne
  s'hérite pas) ; les cliquets existants sont étendus aux paquets.
- Le produit web actuel (`sites.sections` rendu par thèmes) est le précédent
  du modèle AIR [mesuré] ; aucune modification du produit web n'est requise
  par ce chantier.
