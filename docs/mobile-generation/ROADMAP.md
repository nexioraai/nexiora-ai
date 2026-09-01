# ROADMAP — MOBILE APP GENERATION ENGINE

| | |
|---|---|
| Version | v0.1 — en attente de validation (voir `MASTER_PLAN.md`) |
| Date | 2026-08-27 |
| Règle | Aucune phase n'est sautée ou déclarée terminée sans ses critères de sortie vérifiés et consignés dans `STATUS.md`. Les critères ne sont jamais assouplis après coup. |
| Exigence produit | **PREMIUM / ELITE 2027 A++ — NON NÉGOCIABLE** (arbitrage propriétaire 2026-08-29, `DECISIONS.md` D-039). « Fonctionnel » ne vaut **jamais** acceptation lorsque le résultat est manifestement inférieur au niveau visé. Cette exigence ne peut être ni dégradée, ni repoussée, ni supprimée pour permettre la clôture d'une phase. Définition opérationnelle et méthode de vérification : § **EXIGENCE PRODUIT TRANSVERSE** en fin de document. |

| Cadre de preuve | **PROTOCOLE ELITE 2027 A+** — source de vérité unique : `docs/elite-protocol/`. Point d'entrée obligatoire : `docs/elite-protocol/README.md` ; document canonique : `docs/elite-protocol/REFERENCE_PROTOCOL_ELITE_2027.md`. Référence **obligatoire** des processus de génération, d'analyse, de validation et de certification. Voir § **CADRE D'EXÉCUTION PERMANENT** en fin de document. |
| Reprise de session | Ce document est le **plan directeur persistant**. Une nouvelle session détermine où en est le projet et quelle action est autorisée en lisant § **CADRE D'EXÉCUTION PERMANENT**, sans nouveau prompt humain pour chaque micro-étape. |

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
- **Sortie — amendement A++ (D-039, 2026-08-29)** : la « qualité UI évaluée »
  s'entend désormais **évaluée contre la grille A++ des 8 dimensions**, score
  consigné **dimension par dimension avec sa preuve**, une dimension non
  mesurable étant déclarée non déterminée et jamais conforme par défaut.
  Chaque dimension non conforme est consignée comme **dette BLOQUANTE** avec
  échéance de phase. Le seul constat « l'app démarre et navigue » ne vaut pas
  satisfaction de ce critère.
  **CONFORMITÉ EXIGÉE POUR CLORE** : les dimensions **A à G** — toutes
  mesurables au périmètre d'un slice mono-domaine — doivent être **CONFORMES,
  preuve à l'appui**. Une seule d'entre elles non conforme **bloque la
  clôture** de la Phase 8 ; une dette bloquante ne vaut jamais satisfaction.
  La dimension **H** est portée à la **Phase 10** au seul motif objectif que
  sa mesure exige un **second domaine**, inexistant au périmètre de la Phase
  8 — jamais déclarée conforme par défaut. Une dimension non mesurée faute
  d'**outillage** (et non de périmètre) n'est pas reportable : l'outillage
  doit être produit dans la phase.

## PHASE 9 — REPAIR LOOP + CODE SLOTS

- **Objectif** : slots avec politique AST complète ; boucle de réparation
  bornée et budgétée ; juge ≠ auteur.
- **Dépendances** : Phase 8.
- **Sortie** : sur le slice 1, une panne provoquée (« le bouton Commander ne
  fonctionne pas ») est diagnostiquée et réparée automatiquement, avec
  analyse d'impact et vérification Oracle ; les gardes AST mordent (preuve
  par mutation : un slot tentant un fetch direct ou l'édition d'un bloc est
  refusé) ; budget respecté.
- **Sortie — amendement A++ (D-039)** : une réparation automatique ne doit
  **régresser aucune dimension** de la grille A++ ; la grille est rejouée
  après réparation et le résultat consigné. Une réparation qui restaure la
  fonction en dégradant la grille est **refusée**, pas acceptée puis
  consignée.

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
- **Sortie — amendement A++ (D-039)** : la **dimension H (variété
  anti-template)** devient mesurable ici et doit être évaluée sur les
  2 domaines. Les dettes bloquantes A++ ouvertes en Phase 8 sont
  **réexaminées** et alimentent, à l'image du registre v2, une liste mesurée
  des manques du **design system → design system v2** (dont l'adoption reste
  une décision propriétaire consignée dans `DECISIONS.md`).

### État au 2026-08-31 — **PHASE 10 : 6 CRITÈRES SUR 7 SATISFAITS, NON CLOSE**

**Cette phase n'est PAS close, et cette inscription ne la clôt pas.** Un seul
critère reste ouvert, et il n'appartient pas au moteur.

| Critère de sortie | État | Preuve |
|---|---|---|
| app fonctionnelle sur **appareils physiques** | 🔴 **OUVERT — PROPRIÉTAIRE** | Android acquis (Galaxy A17, 2/2 flows) · **iOS : IPA construit, NON INSTALLÉ** (`DET-012`, port USB-C mort, aucune automatisation possible) |
| scorecard cross-domain à 2 domaines | 🟢 | `slices/run-scorecard.mjs` |
| substitution de provider sans changement d'AIR | 🟢 avec réserve | D-053 — remplacement prouvé dans le lock, `rootHash` identique |
| liste mesurée des capabilities manquantes | 🟠 non déterminé, **motivé** | D-053 — l'allowlist est fail-closed : aucun document ne peut exprimer un besoin non couvert |
| dimension **H** sur 2 domaines | 🟢 **CONFORME** | grille A++ avec échantillons cross-domain · **12 identités visuelles sur 12 thèmes** depuis D-067 |
| **`DET-028` / dimension C** | 🟢 **FERMÉ** | D-060 — `loading`/`empty`/`error` **atteints**, observés au rendu avec contrôle négatif |
| **A++ complet (A→H)** | 🟢 **ATTEINT** | `A·B·C·D·E·F·G·H` toutes conformes, mesurées sur 2 domaines |

**Ce qui a changé depuis le 2026-08-30** : `DET-028` était le verrou bloquant
déclaré. Il est fermé — non par assouplissement du critère, mais parce que les
états sont devenus **réellement atteignables** (registre de blocs 1.1.0 additif +
`DataProvider.status?()`), chacun **observé au rendu avant** d'entrer dans
l'enveloppe.

🔴 **Ce qui reste, et pourquoi je ne peux pas le faire** : l'installation de l'IPA
sur l'iPhone 16 exige un scan de QR par le propriétaire — le port de données de
l'appareil est mort (`DET-012`), aucune automatisation n'existe. **Un build
Android d'une application GÉNÉRÉE est en cours** (`chez-tantie`,
`ea2a69a5-bf07-41e4-ade3-ab7a0c15561a`) pour rendre ce constat possible sur un
second appareil.


## PHASE 10B — FIDÉLITÉ DE L'APPLICATION PRODUITE

> **Créée le 2026-08-31 par D-055.** Insérée entre 10 et 11 sans renumérotation :
> les Phases 11→14 ont été relues une par une et **aucune ne porte ce critère**
> (11 route, 12 conforme aux stores, 13 distribue, 14 industrialise ; la
> « qualité UI » de la 14 est le score A++, qui mesure l'apparence, jamais la
> fidélité à la demande).

- **Objectif** : fermer la lacune structurelle mesurée en `APP-D004` — les
  Phases 0→10 vérifient le **MOTEUR** (il compile, il est déterministe, il est
  reproductible) ; **aucune ne vérifie que l'application tient ce que le
  document a promis, ni que le document couvre ce qui a été demandé.**
  Toute la vérification compare l'artefact au document ; **personne ne compare
  le document à la demande.**
- **Dépendances** : Phase 10 (artefacts à confronter). **Ne dépend pas** de sa
  clôture — la Phase 10 ne peut pas se clore sans `DET-028`, qui appartient
  désormais à celle-ci.
- **Possède** : `DET-008` (jusqu'ici orphelin — 0 occurrence dans ce document
  avant le 2026-08-31), `DET-028`, `APP-D003`, `APP-D004`.

### Critères de sortie — falsifiables

| # | Critère | Comment il est réfuté |
|---|---|---|
| **F1** | Toute promesse déclarée (`expectedTests`) est confrontée à sa cible réelle, et une promesse à **cible morte** fait ÉCHOUER la gate | produire un document promettant sur un écran inatteignable et voir la gate passer |
| **F2** | La gate a été **vue échouer** sur ≥ 3 cas-tueurs distincts (écran inatteignable · effet hors enveloppe · entité sans donnée) avant d'être déclarée valide | un seul cas-tueur qui passe |
| **F3** | La **demande du client est conservée** dans l'AIR et migrée sans perte sur la totalité du corpus | un document du corpus qui perd sa demande à la migration |
| **F4** | Tout besoin exprimé est **satisfait** par un nœud, ou **déclaré inexprimable avec motif** — un besoin `PERDU` fait ÉCHOUER | *« menu avec photos »* qui disparaît sans trace, comme dans 12 documents sur 13 |
| **F5** | Aucun état de bloc n'est déclaré atteignable sans l'être (`DET-028` / `APP-D003`) | un état déclaré au registre et jamais rendu à l'exécution |

### État au 2026-08-31 — **PHASE 10B : OUVERTE**

**Cette phase n'est pas close et ne doit pas l'être par cette inscription.**

| Critère | État | Preuve |
|---|---|---|
| **F1** gate des promesses | 🟢 **SATISFAIT** | `@deribfy/fidelity` · `evaluatePromises` — les 12 documents du corpus sont **REFUSÉS** (2 à 7 cibles vivantes sur 15 à 24) |
| **F2** gate vue échouer sur ≥ 3 cas-tueurs | 🟢 **SATISFAIT — 10 cas-tueurs**, dont les deux contournements par le silence | `packages/fidelity/tests/` |
| **F3** demande conservée et migrée sans perte | 🟢 **SATISFAIT** | AIR 1.2.0 (D-056) · migration `1.1.0 → 1.2.0` **identité**, testée · chaîne `1.0.0 → 1.2.0` continue |
| **F4** besoin satisfait ou déclaré, jamais perdu | 🟢 **SATISFAIT** | `evaluateIntentCoverage` · `resto-riche` : 5 satisfaits, **2 déclarés inexprimables**, 0 défaillant |
| **F5** aucun état déclaré atteignable sans l'être | 🔴 **NON SATISFAIT** | `DET-028` / `APP-D003` — 8 états déclarés sur 11 jamais rendus |

🔴 **Réserve portant sur F1 et F4** : les deux gates sont **exécutables et
prouvées**, elles ne sont **pas câblées dans l'Oracle**. Rien n'impose encore leur
verdict au pipeline. Tant que ce câblage n'est pas fait, un document refusé par
elles peut toujours être compilé et livré.

> ### ⬆️ MISE À JOUR 2026-09-01 — LA RÉSERVE EST LEVÉE (D-088 → D-105)
>
> **F1 et F4 sont désormais CÂBLÉS** : `gate:fidelite` les exécute et **bloque la
> CI**, sans aucun plafond — la fidélité n'est pas une dette tolérable. Une 7ᵉ gate,
> `gate:invariants`, a été ajoutée : elle confronte chaque oracle GATÉ à un signal
> indépendant sur les 24 documents.
>
> **F5 : le critère était mal formulé.** L'invariant réel — *atteignable ⊆ rendable*
> — est **TENU sur les 6 blocs** ; les « 8 états sur 11 » venaient d'une recopie
> périmée du contrat dans `BLOCKS[].states`. **Duplication supprimée à la source**
> (D-095) : les états sont des tableaux `const` dont les types dérivent, et le
> registre pointe dessus. `form.submitting` reste rendable sans être atteignable —
> c'est **légitime**, les deux sources disent vrai.
>
> **La phase reste OUVERTE** : les gates de fidélité sont rouges sur des défauts
> **RÉELS** du corpus (F1 sur 13 documents, F4 sur 22, 15 motifs d'inexprimabilité
> réfutés). Leur fermeture exige des régénérations, pas une correction d'instrument.
>
> Détail complet : `STATUS.md`, bloc « CHANTIER P5 → P9 ».

> ### ⬆️ MISE À JOUR 2026-09-01 (2) — P10 EXÉCUTÉE (`D-109`)
>
> *« Leur fermeture exige des régénérations »* : **la première a été faite.** P10 a
> régénéré `coach-fitness` — **`valid=true`**, 2,3069 $, 10 appels, 27 diagnostics
> → 0, **0 amputation**, **0 mutation hors périmètre**.
>
> **6 gates sur 7 sont passées au VERT** : `app-compile` 25/26 → **26/26**,
> `app-rendu` → 🟢, `invariants` 3 désaccords → **0 sur 24 documents**.
> `v3/coach-fitness` est vert sur toutes ses lignes — 35/35 promesses vivantes,
> 0 motif réfuté.
>
> **`fidelite` reste ROUGE, et ce rouge est CONSERVÉ comme état réel** : `F1` passe
> de 13 à **12 documents**, `F4` de 22 à **21**. **Aucun ne concerne plus
> `coach-fitness`** — restent les **12 documents du corpus v2 gelé** (`1.0.0`, sans
> intention) et **9 documents v3**. Aucun seuil, aucune gate, aucun corpus
> historique n'a été touché.
>
> **La phase 10B reste OUVERTE.** Ce qui reste à trancher, par audit distinct : ce
> rouge résiduel est-il **structurellement attendu** ou un **travail restant** ?

> ### ⬆️ MISE À JOUR 2026-09-01 (3) — LA QUESTION CI-DESSUS EST TRANCHÉE PAR MESURE
>
> Les **9 documents v3** rouges sur `F4` sont **exactement** les 9 qui n'affichent
> aucune image, n'ont aucune navigation primaire et aucune recherche. Les 3 verts
> sont **exactement** les 3 régénérés après `D-088`. **C'est une DETTE DE
> GÉNÉRATION, pas un défaut structurel.** Seuls les 12 documents v2 gelés le sont
> — ils sont en `1.0.0` et ne portent aucune intention.
>
> **Corollaire** : fermer `F4` exige de régénérer 9 documents. Aucune correction
> d'instrument n'y suffira.
>
> Deux instruments ont par ailleurs été réparés ce jour — `controles-fantomes`
> (28 faux positifs) et `FORM_SANS_ACTION` (7 formulaires muets démasqués).
> Détail : `STATUS.md`, § « INSTRUMENTS RÉPARÉS ».

### Ce que cette phase NE fait PAS

Elle **ne mesure pas l'énoncé** des promesses (« le total additionne
correctement ») : cela exigerait d'exécuter une logique que le moteur
n'exécute pas. Elle établit une **CONDITION NÉCESSAIRE** — la cible existe et
fonctionne, le besoin n'a pas disparu. `P-C` : `PARTIAL → PASS` ❌.

## PHASE 11 — CAPABILITY ROUTER + RUNTIME PROFILES + OTA

- **Objectif** : routage OTA/native par empreinte calculée ; profils de
  runtime versionnés ; canaux OTA.
- **Dépendances** : Phase 8 (apps réelles à router).
- **Sortie** : modification UI livrée en OTA sur les deux slices en
  < 15 min ; ajout d'une capability native → rebuild routé automatiquement ;
  tentative de livrer en OTA un changement d'empreinte → REFUSÉE par le
  routeur (preuve par tentative) ; rollback OTA testé.
- **Sortie — amendement A++ (D-039)** : la modification UI livrée en OTA est
  soumise à la grille A++ **avant et après livraison** ; une livraison qui
  régresse une dimension est un échec du critère, quelle qu'en soit la
  rapidité.

### État au 2026-08-31 — **PHASE 11 : 3 CRITÈRES SUR 5, NON CLOSE**

**Cette phase n'est PAS close.** Le routeur est construit et prouvé ; deux
critères exigent une livraison OTA réelle vers un appareil installé.

| Critère de sortie | État | Preuve |
|---|---|---|
| **routage par empreinte calculée** | 🟢 | `@deribfy/router` — `nativeSurface()` scelle capabilities, permissions, modules natifs, planchers d'OS et train ; **12/12 documents v3 profilés** |
| **profils de runtime versionnés** | 🟢 | `core` / `standard` / `extended`, ordonnés par surface native croissante. Mesuré : 11 documents `extended`, 1 `standard`. **Un document sans capability reste `core`, sans aucun module natif** |
| **ajout d'une capability native → rebuild routé** | 🟢 **preuve par tentative** | `attemptOta` avec `camera` ajoutée : **🔴 OTA REFUSÉE** — *« capability ajoutée : camera · module natif ajouté : expo-camera »* |
| **tentative OTA d'un changement d'empreinte → REFUSÉE** | 🟢 **6 cas-tueurs** | capability ajoutée · retirée · permission ajoutée · plancher d'OS monté · **train de release changé, document inchangé** · aucune compensation |
| modification UI livrée en OTA en < 15 min sur les 2 slices | 🔴 **OUVERT** | exige `eas update` réel **vers une application INSTALLÉE** — dépend du même constat appareil que la Phase 10 |
| rollback OTA testé | 🔴 **OUVERT** | idem |
| *(amendement A++)* grille avant/après livraison | 🟠 **non déterminé** | sans livraison réelle, il n'y a pas d'« après » à mesurer |

**Contrôle positif inclus** : un changement purement UI (libellé de bouton) est
**🟢 OTA ACCEPTÉE**. Sans lui, « tout refuser » suffirait à faire verdir la suite.

🔴 **Défaut de conception trouvé par un cas-tueur** : `routeUpdate` ne prenait
qu'**UN** train, appliqué aux deux côtés — un **changement de plateforme était
donc inexprimable**, et le routeur aurait laissé passer en OTA une montée d'Expo
ou de React Native. Corrigé : deux trains, un par version.

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
- **Sortie — amendement A++ (D-039)** : le volet **a11y** du gate store est
  adossé aux dimensions **A** (cibles tactiles, zones sûres) et **B**
  (contraste WCAG 2.2 AA) de la grille — le gate refuse la soumission si
  l'une des deux est non conforme.

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
- **Sortie — amendement A++ (D-039)** : la métrique « qualité UI » du
  scorecard élargi est le **score A++ par app, dimension par dimension**,
  publié avec ses preuves sur les ≥ 6 domaines. Le taux d'apps atteignant
  A++ sur les 8 dimensions est une métrique officielle du scorecard.

---

## DÉPENDANCES TRANSVERSES

- Le **Budget Governor** s'instrumente dès la Phase 1 (coûts unitaires) et
  gate toutes les phases suivantes.
- L'**observabilité** (traces pipeline) se pose en Phase 6-7, pas après.
- La **sécurité agents** (§27 ARCHITECTURE) s'applique dès le premier prompt
  de la Phase 2.
- Les phases 2-3 et 5 peuvent avancer en parallèle après la Phase 0 ; les
  slices (8, 10) sont des points de convergence obligatoires.
- L'**exigence produit Premium / Elite 2027 A++** (§ ci-dessous) s'applique
  à toutes les phases restantes à compter du 2026-08-29 et gate leurs
  critères de sortie là où elle est vérifiable.
- Le **protocole de preuve ELITE 2027 A+** (`docs/elite-protocol/`, §
  CADRE D'EXÉCUTION PERMANENT) s'applique à toutes les phases restantes à
  compter du 2026-08-30. Il ne remplace aucun critère de sortie existant : il
  fixe le **niveau de preuve** exigé pour les déclarer satisfaits.

---

## EXIGENCE PRODUIT TRANSVERSE — PREMIUM / ELITE 2027 A++

**Statut** : NON NÉGOCIABLE (D-039, arbitrage propriétaire 2026-08-29).
**Portée** : phases restantes à compter du 2026-08-29 (Phase 8 en cours
incluse). **Non rétroactive** sur les Phases 0-7 déjà closes, dont les
artefacts gelés (registre de blocs 1.0.0 / D-024, capabilities 1.0.0 /
D-020, tokens 1.0.0, train `rt-2026.08`) ne sont pas rouverts par la seule
inscription de cette exigence.

**Principe** : « fonctionnel » n'est jamais une preuve de qualité. Une app
qui démarre, navigue et ne plante pas peut être manifestement inférieure au
niveau visé ; ce constat suffit à refuser l'acceptation.

### Grille A++ — 8 dimensions, chacune objectivement vérifiable

| # | Dimension | Critère de conformité | Nature de la preuve |
|---|---|---|---|
| **A** | Ergonomie physique | Zones sûres respectées ; aucune cible sous une barre système ; cibles tactiles ≥ 44 pt (iOS) / 48 dp (Android) | Géométrie **mesurée sur appareil réel** |
| **B** | Contraste / accessibilité | WCAG 2.2 **AA minimum** sur toutes les paires texte/fond, thèmes clair ET sombre | Ratio **calculé depuis les tokens**, cliquet CI |
| **C** | Complétude des états | Tout bloc consommant des données expose `loading` / `empty` / `error` | Contrat du registre + tests |
| **D** | Cohérence | **Zéro** valeur de style en dur : espacements, rayons, couleurs, typographie exclusivement issus des tokens | Analyse statique (cliquet existant) |
| **E** | Typographie | Échelle hiérarchique appliquée ; **aucune troncature** aux tailles d'accessibilité système maximales | Rendu au harnais |
| **F** | Internationalisation | RTL par propriétés logiques ; aucune troncature ni rupture de mise en page | Rejeu RTL (déjà outillé) |
| **G** | Fluidité perçue | Défilement sans jank ; **virtualisation active** sur listes longues ; retour visuel sur chaque action | Mesure sur appareil |
| **H** | Variété anti-template (§22 ARCHITECTURE) | Deux apps de domaines distincts ne partagent pas la même silhouette | Scorecard cross-domain, ≥ 2 domaines |

### Règle de notation

Le niveau **A++ est atteint uniquement si les 8 dimensions sont conformes,
preuve à l'appui**. Une seule dimension non conforme interdit la
qualification A++ : l'écart devient une **dette BLOQUANTE** au registre de
`STATUS.md`, assortie d'une échéance de phase. Une dimension non mesurable
se déclare **non déterminée** — jamais conforme par défaut.

**Une dette bloquante ne vaut JAMAIS satisfaction d'un critère.** Consigner
un écart ne le résout pas : toute dimension mesurable au périmètre d'une
phase doit être **conforme** pour que cette phase soit close. L'exigence
A++ n'est jamais assouplie, reportée, contournée, ni réputée satisfaite par
la seule présence d'une dette.

**Règle de périmètre** — deux causes de non-mesure, deux traitements
opposés, à ne jamais confondre :

| Cause | Traitement |
|---|---|
| **Manque d'OUTILLAGE** — la mesure est possible au périmètre mais l'instrument n'existe pas | **Non reportable.** L'outillage est produit dans la phase, puis la dimension est évaluée et doit être conforme |
| **Périmètre INSUFFISANT par nature** — la mesure exige un objet absent de la phase (ex. dimension H : un second domaine) | **Portée explicitement** à la phase où elle devient mesurable, nommément désignée, **jamais conforme par défaut** |

Invoquer le périmètre là où seul l'outillage manque est une violation de
l'exigence.

### Où l'exigence mord

Elle est inscrite dans les critères de sortie des phases où elle est
réellement vérifiable et où la ROADMAP peut agir : **8** (évaluation
initiale), **9** (non-régression après réparation), **10** (variété
inter-domaines + alimentation du design system v2), **11** (une livraison
OTA ne régresse pas la grille), **12** (a11y du gate store adossée aux
dimensions A et B), **14** (score publié au scorecard). Elle n'est
**délibérément pas** inscrite en Phase 13, dont les critères portent sur la
distribution et non sur la substance visuelle.

### Limite structurelle consignée

La substance visuelle d'une app générée provient d'artefacts **gelés** en
Phase 3 (blocs, primitives, tokens) et scellés dans le train de release.
Élever le niveau visuel au-delà de ce que ces artefacts permettent exige une
**évolution de design system (v2)**, qui relève d'une décision propriétaire
consignée dans `DECISIONS.md` — jamais d'une retouche d'artefact pour faire
passer un slice, ce que le garde-fou de la Phase 8 interdit explicitement.

---

# CADRE D'EXÉCUTION PERMANENT — PROTOCOLE DE PREUVE ELITE 2027 A+

> **Origine** : arbitrage propriétaire du **2026-08-30**, après confrontation
> méthodologique. Cette intégration est une décision du CHANTIER, inscrite
> dans le document du chantier. **Le protocole reste sans autorité sur la
> ROADMAP** : il l'évalue, il ne la modifie pas (`docs/elite-protocol/README.md`,
> périmètres). À consigner dans `DECISIONS.md` — **non fait dans cette tâche**,
> voir § *Points de gouvernance en attente*.

## 1. Source de vérité — unique, non dupliquée

| | |
|---|---|
| **Dossier** | `docs/elite-protocol/` — **ne pas déplacer, ne pas dupliquer** |
| **Point d'entrée obligatoire** | `docs/elite-protocol/README.md` (porte la SESSION CONTINUITY RULE) |
| **Document canonique** | `docs/elite-protocol/REFERENCE_PROTOCOL_ELITE_2027.md` |
| **Registres** | `registers/` — découvertes · risques · gates · cas-tueurs · indépendance des preuves · oracles · **mesure sémantique & observabilité des 25 gates** |
| **Preuves exécutables** | `docs/elite-protocol/evidence/` — scripts en lecture seule, ré-exécutables depuis la racine du dépôt |

**Aucune seconde source de vérité n'est créée.** Ce chapitre **référence** le
protocole ; il ne le recopie pas. En cas de divergence entre ce chapitre et
`docs/elite-protocol/`, **le protocole fait foi** et la divergence est signalée
comme anomalie.

## 2. Distinction absolue des deux standards

| | **ELITE 2027 A++** *(deux plus)* | **ELITE 2027 A+** *(un plus)* |
|---|---|---|
| **Objet** | qualité du **PRODUIT / APPLICATION** | qualité de la **PREUVE / conformité / validation** |
| **Question** | *que vaut cette application ?* | *que vaut cette démonstration ?* |
| **Défini par** | ce document, § EXIGENCE PRODUIT TRANSVERSE (grille A→H, D-039) | `docs/elite-protocol/` |
| **Falsifié par** | un utilisateur qui échoue une tâche | un faux PASS, un faux FAIL, une propriété tue |
| **Statut** | NON NÉGOCIABLE | **NON CERTIFIÉ** |

**Ils sont liés, jamais interchangeables.** Ils sont **logiquement indépendants
dans les deux sens** : un protocole irréprochable peut certifier honnêtement
une application médiocre ; une application excellente peut exister sans qu'aucune
preuve admissible ne l'établisse. **La seconde situation est l'état actuel du
chantier.** Ne jamais invoquer l'un pour tenir l'autre pour acquis.

## 3. Niveau de preuve exigé pour toute transition

Le protocole ne remplace aucun critère de sortie : il fixe le **niveau de
preuve** qui permet de les déclarer satisfaits.

> 🔴 **RÈGLE DE TRANSITION** — **un test qui passe ne suffit JAMAIS, à lui seul,
> à autoriser une transition lorsque le protocole exige une preuve
> supplémentaire.** Un critère de sortie n'est satisfait que si la preuve
> fournie atteint le niveau exigé par la **nature** de la proposition
> (`REFERENCE_PROTOCOL_ELITE_2027.md` § E, hiérarchie N0-N11).

Interdits absolus — **liste canonique dans
`REFERENCE_PROTOCOL_ELITE_2027.md` § P-C**, reproduite ici pour lisibilité ;
en cas de divergence, le protocole fait foi :

```
UNKNOWN → PASS  ❌      PARTIAL → PASS  ❌      HUMAN-REQUIRED → PASS  ❌
EXTERNAL-DEPENDENCY → PASS  ❌      non réfuté → prouvé  ❌
forte probabilité → prouvé  ❌      conforme → excellent  ❌
plusieurs outils → preuves indépendantes  ❌
nouveau corpus → généralisation démontrée  ❌
```

Toute affirmation produite par une session porte son niveau :
**`FACT` · `INFÉRENCE` · `HYPOTHÈSE` · `CONCLUSION`.** Une hypothèse non
démontrée reste explicitement une hypothèse, y compris dans les rapports et
dans `STATUS.md`.

## 4. ÉTAT FIGÉ AU 2026-08-30 — à ne présenter comme résolu sous aucune forme

```
PHASE 10 ................ OUVERTE
VALIDATION PHYSIQUE ..... SUSPENDUE
EXP-1 ................... TERMINÉE
EXP-2 ................... NON LANCÉE
H0 ...................... INDÉTERMINÉ
H1 / H2 ................. OUVERTS
H3 ...................... EXCLU
R-25 .................... CONDITION D'EXPLOITABILITÉ ÉTABLIE — CAUSE NON IDENTIFIÉE
PROTOCOL-D020 ........... ÉTABLI POUR CETTE MÉTRIQUE UNIQUEMENT
FINAL TECHNICAL AGREEMENT NO
```

**Précisions dont l'omission produirait une erreur de lecture :**

- **H1 vs H2 (D004/D005)** : la conclusion `H2` d'EXP-1 **n'est pas un fait**.
  La règle de granularité `R-GRAN` est une **projection incomplète** ; une
  intersection vide obtenue sur une projection incomplète ne conclut rien.
  **La granularité doit être réarbitrée AVANT toute expérience causale
  ultérieure**, et jamais reconstruite rétroactivement à partir de D004/D005.
- **R-25** : `C1` et `C2` sont des conditions **observées**, **jamais établies
  comme causes nécessaires**. Ne pas les promouvoir.
- **PROTOCOL-D020** : établi pour la **seule** métrique d'atteignabilité
  déclarée. **Toute généralisation aux 25 gates doit être MESURÉE.**
- **H-14** : repose sur une affirmation universelle établie par **inspection de
  code**. **Fragile** tant qu'aucune exécution ne la corrobore. Ne pas la
  promouvoir au-delà de ce niveau.
- **Mesure structurelle des 25 gates** (`registers/GATE_SEMANTIC_OBSERVABILITY.md`) :
  **0/25** gate possède une correspondance runtime établie ayant survécu à
  l'examen · **9/25** énoncent une propriété observable sur un artefact produit ·
  **8/25** ne sont pas observables en l'état · **1/25** a réellement refusé un
  artefact (G14).

## 5. Règle permanente — NON-CORRECTION OPPORTUNISTE

> 🔴 **Aucune correction ne doit être appliquée dans le seul but de faire
> passer le prochain test.**

Chaîne obligatoire, dans cet ordre, sans saut :

```
observation → hypothèse → preuve causale suffisante → correction
           → vérification → non-régression
```

- Une hypothèse non démontrée **reste une hypothèse**, nommée comme telle.
- Un symptôme corrigé sans cause identifiée est une **dette**, jamais une
  résolution.
- Un défaut découvert **hors périmètre** est consigné, **jamais corrigé
  automatiquement** (`CLAUDE.md`, principe fondamental).
- Une correction fondée sur une cause non établie est **interdite** — cas
  actuel : `R-25`, dont la cause n'est pas identifiée.

## 6. Règle permanente — RAPPORT DE CONTINUITÉ

À chaque étape importante, la session produit un rapport **qui sert de
continuité opérationnelle**, pas de compte rendu. Champs minimaux
**obligatoires** :

| # | Champ |
|---|---|
| 1 | étape exécutée |
| 2 | objectif |
| 3 | actions réalisées |
| 4 | preuves (chemins ré-exécutables, pas des affirmations) |
| 5 | résultats |
| 6 | **FACT / INFÉRENCE / HYPOTHÈSE / CONCLUSION** pour chaque énoncé |
| 7 | anomalies |
| 8 | décisions |
| 9 | état de la ROADMAP |
| 10 | **prochaine étape autorisée** |
| 11 | préconditions restantes |
| 12 | éléments **volontairement non modifiés** |
| 13 | bloc **PROGRESSION GLOBALE** (D-017, `MASTER_PLAN.md` §5) |

Le rapport doit permettre à une session ultérieure de **reprendre exactement**
le travail sans reconstituer le contexte à partir d'une conversation.

## 7. Gouvernance — qui exécute, qui arbitre

**Claude Code exécute. L'humain supervise et arbitre la gouvernance.**

**Claude Code n'attend pas un nouveau prompt** pour exécuter une étape déjà
prévue par la ROADMAP **dont toutes les préconditions sont satisfaites**
(D-017, pilotage opérationnel).

**Claude Code s'ARRÊTE et demande arbitrage** dès qu'une décision :

1. n'est pas couverte par la ROADMAP ;
2. modifie une exigence ;
3. modifie le protocole canonique ;
4. change une décision de gouvernance ;
5. impose de choisir entre plusieurs interprétations incompatibles ;
6. risque de contredire une exigence ELITE 2027 A+ ou A++.

Un arrêt pour arbitrage est **une exécution correcte du plan**, jamais un échec.

## 8. Capability stack — objectif de couverture, capacité NON acquise

> 🔴 **Cette capacité n'existe pas aujourd'hui.** Ce tableau décrit une cible,
> pas un état. Aucune ligne ne vaut acquise sans preuve au niveau exigé.

**Boucle générale visée** — le système visé n'est **pas**
`AIR → génération → tests → téléphone`, mais :

```
compréhension → planification → architecture → assemblage → implémentation
→ exécution → observation → mesure → validation → DIVERGENCE
→ diagnostic causal → correction → revalidation → non-régression
→ validation physique
```

Le maillon **DIVERGENCE** — l'écart entre ce qui était attendu et ce qui est
observé — est le seul par lequel une information nouvelle entre dans le
système. Une boucle sans divergence observable ne peut rien apprendre : elle
reconduit ses propres hypothèses.

🔴 **Cette boucle doit être pensée pour des applications JAMAIS RENCONTRÉES
AUPARAVANT**, pas seulement pour les domaines du corpus existant. Une boucle
qui ne fonctionne que sur les 13 documents connus ne démontre rien sur la
généralisation (`REFERENCE_PROTOCOL_ELITE_2027.md` § K ; OOD : **0 échantillon**).

Trois natures, **à ne jamais confondre** :

| Nature | Définition | Ce qu'elle ne fait pas |
|---|---|---|
| **CAPACITY** | ce qui permet d'**améliorer** le résultat | n'apporte aucune information nouvelle ; n'empêche rien |
| **SIGNAL** | ce qui fournit une **information nouvelle** au système | n'améliore rien par soi-même ; n'empêche rien |
| **CONSTRAINT** | ce qui **empêche de livrer** un résultat insuffisant | n'améliore rien ; n'informe de rien |

Confondre les trois est une erreur de conception : ajouter une CAPACITY là où
manque un SIGNAL ne produit qu'une meilleure exécution de la mauvaise chose ;
ajouter un SIGNAL sans CONSTRAINT produit un constat que rien n'oblige à
traiter. **But final** : produire des applications **ELITE 2027 A++** inédites,
cohérentes, fonctionnelles et robustes, **puis** disposer d'un protocole
**ELITE 2027 A+** capable d'en établir les preuves.

## 9. Procédure de reprise après interruption — OBLIGATOIRE

Toute nouvelle session applique cette procédure **avant** d'agir :

| # | Lire | Pour déterminer |
|---|---|---|
| 1 | `CLAUDE.md` | règles d'exécution, interdits absolus |
| 2 | `docs/elite-protocol/README.md` | SESSION CONTINUITY RULE, collisions de vocabulaire, statut du protocole |
| 3 | `docs/elite-protocol/REFERENCE_PROTOCOL_ELITE_2027.md` | niveaux de preuve exigés, principes P-A…P-G, limites L1-L4 |
| 4 | `docs/mobile-generation/ROADMAP.md` — **ce chapitre en premier** | phase active, état figé, prochaine étape autorisée |
| 5 | `docs/mobile-generation/STATUS.md` | état réel consigné du chantier |
| 6 | registres et preuves pertinents | ce qui est démontré, ce qui ne l'est pas |

Puis **vérifier le plan contre l'état réel du dépôt** (`git status`, exécution
des preuves citées). **Ambiguïté ROADMAP ↔ état réel = STOP et signalement**
(D-017). La mémoire d'une conversation ne fait jamais foi.

## 10. Prochaine étape autorisée — au 2026-08-30

> ### ⬆️ DÉPASSÉ LE 2026-09-01 — `D-106`. Le texte ci-dessous est CONSERVÉ TEL QUEL :
> il était exact au 2026-08-30. Il ne décrit plus l'état du chantier.
>
> **Ce qui a changé, par les faits :** `RN-04` a été exécuté le **2026-08-31**
> (commit `2f00c00`, 88 fichiers de `docs/elite-protocol/` suivis) ; le chantier
> **P5 → P9** a été conduit, prouvé et versionné (`D-087` → `D-105`). Le point de
> contrôle **`C-0` est donc CADUC** : sa dépendance déclarée s'est dénouée sans que
> `RN-01` soit levée.
>
> **L'interdit « modifier le code produit » est LEVÉ DE FAIT** — P5→P9 l'a franchi.
> Le constat est inscrit plutôt que tu.
>
> **`RN-01` est CLOS PAR CADUCITÉ le 2026-09-01 (`D-108`)** — arbitrage
> propriétaire. Le travail qu'il conditionnait a été réalisé, prouvé et sécurisé
> (`614e6dc` → `bcf8890` → `afd5954` → `9f88792`) sans que la règle ait été écrite.
> **Caduc n'est pas résolu** : aucune règle `R-GRAN` n'existe. Si une analyse
> causale est reprise (`EXP-2`, `H1`/`H2`, `RN-11`), la précondition `E-17`
> **redevient exigible à ce moment-là**.
>
> **Ce qui reste EN VIGUEUR :** les autres interdits du §10 tiennent — `EXP-2`,
> validation physique, clôture de la Phase 10, `G4`/`G5`, sévérité, protocole
> canonique. Le protocole reste **NON CERTIFIÉ**.
>
> **Prochaine étape autorisée au 2026-09-01** : voir `STATUS.md`, bloc
> « CHANTIER P5 → P9 » — une génération `coach-fitness`, **sur autorisation
> explicite**, aucune dépense sans elle.


> **Aucune étape d'exécution n'est autorisée.** Le plan figé du 2026-08-30 se
> termine par un `STOP` explicite après la mesure structurelle des 25 gates.

**Étape en cours** : confrontation méthodologique Claude Code ↔ Claude Chat /
Opus 5 sur les résultats d'EXP-1 et de la mesure structurelle.
**Nature** : arbitrage de gouvernance — **humain**, non exécutable par Claude Code.

**Préconditions à lever, par arbitrage propriétaire :**

| # | Point en attente | Conséquence si non tranché |
|---|---|---|
| **P1** | **Réarbitration de la granularité** (`R-GRAN`) avant toute expérience causale | EXP-2 ne peut pas être conçue ; H1/H2 restent indécidables |
| **P2** | **Versement de `PROTOCOL-D006` → `D014`** (campagne 2), aujourd'hui hors registre | une session future ferait confiance au cliquet de véracité de l'enveloppe, dont `PROTOCOL-D010` démontre qu'il atteste une proposition fausse |
| **P3** | **Versionnement de `docs/elite-protocol/`** — voir § suivant | la source de vérité du protocole n'existe que sur le disque local |
| **P4** | **Consignation du résultat E-11** (le modèle de sévérité ne peut pas représenter la composition — problème de porteur d'arité 2) dans un registre du protocole | le résultat n'existe que dans le rapport EXP-1 ; une session future pourrait tenter la correction D002 en croyant qu'elle ferme R-25 |

**Branches conditionnelles — exécutables SANS nouveau prompt dès que la
précondition correspondante est levée :**

| Si arbitrage | Alors action autorisée |
|---|---|
| P1 tranché | concevoir EXP-2 **selon la granularité arbitrée**, verdicts attendus déclarés avant exécution ; **ne pas exécuter sans autorisation explicite** |
| P2 tranché « verser » | verser D006→D014 au `DISCOVERY_REGISTER`, niveaux de preuve conservés, aucune correction |
| P3 tranché « versionner » | commit local atomique de `docs/elite-protocol/` — **jamais de `git push`** (`CLAUDE.md`, interdiction absolue) |

**Interdits en vigueur, sans exception** : lancer EXP-2 · reprendre la
validation physique · clore la Phase 10 · corriger G4/G5 · modifier la
sévérité · créer des agents spécialisés · modifier le protocole canonique ·
modifier le code produit.

**Exigences opposables à toute reprise** : voir § **EXIGENCES OPÉRATIONNELLES
PERMANENTES — E-01 → E-20** (chapitre suivant). Une session qui reprend le
chantier applique la procédure du § 9, puis vérifie que l'action envisagée ne
tombe sous aucun interdit `E-xx`.

## 11. Points de gouvernance en attente — à traiter, non traités ici

| Point | État | Raison |
|---|---|---|
| `docs/elite-protocol/` **non suivi par Git** (`git status` : `?? docs/elite-protocol/`) | 🟢 **FERMÉ le 2026-08-31** | *Constat d'origine, conservé :* `CLAUDE.md` désigne ce dossier comme « source de vérité versionnée » ; il n'avait jamais été committé. **Résolu** : commit `2f00c00` — **88 fichiers suivis**, vérifié par `git ls-files`. Versionné localement ; `git push` reste interdit sans accord explicite |
| Consignation de la présente intégration dans `DECISIONS.md` | 🟠 **NON FAIT** | la tâche du 2026-08-30 prescrit « ne fais aucune autre modification » que la ROADMAP. La règle 3 du chantier exige néanmoins cette consignation |
| Étiquetage `G4` / `G5` des cas-tueurs des campagnes 1 et 2 | 🟠 **IMPRÉCIS** | `FACT` — la propriété énoncée pour G4 et G5 n'a aucune implémentation ; les cas-tueurs ont attaqué un **proxy**. Leurs résultats restent valides pour ce proxy. `HYPO.` non testée — d'autres gates pourraient être concernées |

---

# EXIGENCES OPÉRATIONNELLES PERMANENTES — E-01 → E-20

> **Origine** : confrontation méthodologique Claude Code ↔ Claude Chat / Opus 5,
> close le **2026-08-30**. Ces exigences sont des **règles opérationnelles du
> chantier**, opposables à toute phase et à toute session. Elles ne dupliquent
> pas le protocole : quand une règle est canonique dans `docs/elite-protocol/`,
> elle est **référencée**, et seule l'obligation côté ROADMAP est écrite ici.
>
> Format : **Exigence** (impérative) · **Où elle mord** · **Preuve exigée** ·
> **État au 2026-08-30** · **Interdit**.

## Bloc I — Nature des travaux

### E-01 · CAPACITY / SIGNAL / CONSTRAINT — classer avant d'entreprendre

| | |
|---|---|
| **Exigence** | Tout travail inscrit à une phase déclare, **avant démarrage**, laquelle des trois natures il sert. Un travail qui n'en sert aucune n'entre pas au plan. Définitions canoniques : § CADRE, 8. |
| **Où elle mord** | tâches de toutes les phases restantes ; tout amendement de critère de sortie |
| **Preuve exigée** | la nature déclarée figure au rapport de continuité (champ 3) |
| **État** | `FACT` — la quasi-totalité des travaux du protocole depuis le 2026-08-29 sont des **CONSTRAINT** ; alarme G23 active (**9 sessions d'analyse / 1 de construction**) |
| **Interdit** | 🔴 **Confondre « empêcher un mauvais résultat de passer » avec « rendre le générateur intrinsèquement meilleur ».** Ajouter une CONSTRAINT ne produit aucune CAPACITY. Ajouter une CAPACITY sans SIGNAL améliore l'exécution de la mauvaise chose. |

### E-02 · ROADMAP ≠ PROTOCOLE — aucun substitut

| | |
|---|---|
| **Exigence** | La **ROADMAP** définit *le chemin et les travaux*. Le **protocole** définit *le niveau de preuve* qui permet de déclarer un résultat établi. Chaque déclaration de fin d'étape cite **les deux** : le critère de sortie ROADMAP **et** le niveau de preuve atteint. |
| **Où elle mord** | toute clôture d'étape ou de phase |
| **Preuve exigée** | critère ROADMAP satisfait **ET** niveau de preuve N*n* atteint, nommément |
| **État** | 🟢 inscrit (§ CADRE, 3) |
| **Interdit** | invoquer le protocole pour justifier un travail non prévu au plan · invoquer le plan pour abaisser un niveau de preuve |

### E-03 · A+ ≠ A++ — séparation permanente

| | |
|---|---|
| **Exigence** | Canonique : § CADRE, 2. Obligation ROADMAP : **aucun critère de sortie ne mélange les deux**. Un critère porte soit sur la qualité du produit (A++), soit sur la qualité de la preuve (A+). |
| **Où elle mord** | rédaction de tout critère de sortie |
| **État** | 🟢 inscrit |
| **Interdit** | 🔴 **Un protocole de conformité ne certifie jamais à lui seul l'excellence intrinsèque du produit.** L'excellence est une **relation** à une population de référence, incertifiable en isolement (`REFERENCE` § F). |

## Bloc II — Ce qui rend une gate réelle

### E-04 · OBSERVABILITÉ — référent observable ou oracle explicite

| | |
|---|---|
| **Exigence** | 🔴 **Toute propriété utilisée comme critère de validation déclare son référent observable OU son oracle explicite.** À défaut, la propriété est marquée `NON OBSERVABLE` et **ne compte pas** comme critère satisfait. |
| **Où elle mord** | tout critère de sortie ; toute gate ; tout amendement A++ |
| **Preuve exigée** | artefact observable nommé + méthode d'observation + moyen de falsification |
| **État** | `FACT` — mesuré : **9/25** gates énoncent une propriété observable sur un artefact produit · **8/25** ne sont pas observables en l'état (`registers/GATE_SEMANTIC_OBSERVABILITY.md`) |
| **Interdit** | 🔴 **Une propriété sans moyen indépendant d'observer sa valeur n'est pas testable au seul motif qu'elle est écrite dans une gate.** |

### E-05 · GATES EXÉCUTABLES — mesurer, jamais supposer

| | |
|---|---|
| **Exigence** | Chaque gate est classée dans **exactement une** catégorie, **par mesure** : `PREUVE AUTOMATISÉE` · `JUGEMENT HUMAIN` · `DÉPENDANTE D'UN LLM` · `DOCUMENTAIRE`. La classification est publiée et datée. |
| **Où elle mord** | toute invocation d'une gate comme condition de transition |
| **Preuve exigée** | mesure sur le dépôt réel, pas lecture de la description de la gate |
| **État** | 🟠 **PARTIEL** — deux axes mesurés (sémantique ↔ runtime, observabilité) le 2026-08-30. **La classification en 4 catégories ci-dessus n'est PAS encore mesurée.** Travail à inscrire ; **non exécuté à ce jour** |
| **Interdit** | 🔴 **Une gate incapable de produire une décision vérifiable n'est pas une contrainte équivalente à une gate exécutable.** Ne jamais compter les deux dans un même total. |

### E-06 · BLOCAGE + ACTION SUR ÉCHEC — définies, pas implicites

| | |
|---|---|
| **Exigence** | Toute gate déclarée **bloquante** publie : ① qui produit le verdict · ② ce que l'échec bloque **exactement** · ③ l'action obligatoire sur échec · ④ qui peut lever · ⑤ quelle preuve lève. Sans ces cinq points, la gate est `DOCUMENTAIRE`, pas bloquante. |
| **Où elle mord** | toute transition d'étape ou de phase |
| **Preuve exigée** | la transition est **conditionnée** à la satisfaction, et le refus est observable |
| **État** | 🔴 `FACT` — le rapport de faisabilité s'exécute par défaut en mode `declared_degraded` : **il n'oppose aucun refus, quel que soit le nombre d'écarts** (verdict `degraded` de 1 à 649 écarts). Le mode `strict` existe et refuse au premier écart. **Aucune phase ne déclare lequel s'applique.** |
| **Interdit** | 🔴 **`échec → produire un rapport → continuer` est interdit pour une gate bloquante.** Consigner un écart ne le résout pas (règle A++ déjà en vigueur). |

### E-07 · NON-GAMING — PASS n'est pas la qualité

| | |
|---|---|
| **Exigence** | Toute métrique publiée porte **numérateur ET dénominateur**, et déclare **quelle part de sa population est contrôlée par le producteur**. |
| **Où elle mord** | scorecard, grille A++, rapport de faisabilité, tout critère chiffré |
| **Preuve exigée** | la part contrôlée par le producteur est chiffrée |
| **État** | 🔴 `FACT` — mesuré : **30,8 %** des 649 écarts du corpus sont supprimables par pure soustraction déclarative (capabilities, slots, règles). `INFÉR.` — réduire le périmètre améliore mécaniquement tout score en ratio (`PROTOCOL-D001`) |
| **Interdit** | 🔴 **Ne jamais lire « PASS aux gates » comme « qualité excellente ».** Aucune correction ni aucun choix de périmètre destinés uniquement à améliorer un score. |

## Bloc III — Discipline causale

### E-08 · CAUSALITÉ — quatre niveaux, jamais confondus

| | |
|---|---|
| **Exigence** | Tout énoncé produit par une session porte son niveau : `FACT` · `INFÉRENCE` · `HYPOTHÈSE` · `CONCLUSION`. Une hypothèse causale **reste** une hypothèse jusqu'à démonstration. |
| **Où elle mord** | rapports, registres, `STATUS.md`, tout diagnostic |
| **État** | 🟢 en vigueur (§ CADRE, 3 et 6) |
| **Interdit** | 🔴 **Aucune classification causale n'est promue parce qu'elle est élégante, plausible ou commode.** |

### E-09 · EXP-1 — résultat conservé tel quel

| | |
|---|---|
| **Exigence** | L'état d'EXP-1 est conservé **sans promotion** : `H0` **INDÉTERMINÉ** · `H1` **non exclu** · `H2` **non établi** · `H3` **EXCLU**. |
| **Où elle mord** | toute expérience causale ultérieure ; toute correction de D004/D005 |
| **Preuve exigée** | `docs/elite-protocol/evidence/exp1.mjs`, `exp1b.mjs` |
| **État** | 🔵 conservé (§ CADRE, 4) |
| **Interdit** | 🔴 **Ne pas transformer H2 en fait.** L'arbitrage de granularité (**E-17**) précède toute expérience causale qui en dépend. |

### E-10 · R-25 — attribution non établie

| | |
|---|---|
| **Exigence** | R-25 est enregistré comme **CONDITION D'EXPLOITABILITÉ ÉTABLIE — CAUSE NON IDENTIFIÉE**, et le reste tant qu'aucune expérience causale appropriée n'a identifié sa cause. |
| **Preuve exigée** | `KT-C2-06` (`evidence/kt2.mjs`) montre R-25 **sans** D004 ni D005 |
| **État** | 🔵 inscrit au `PROTOCOL_RISK_REGISTER`, note R-25 |
| **Interdit** | 🔴 **Ne pas enregistrer R-25 comme conséquence compositionnelle de D004/D005.** Ne pas promouvoir `C1`/`C2` au rang de causes. Aucune correction fondée sur une cause non établie. |

### E-17 · GRANULARITÉ — pré-enregistrée, jamais rétroactive

| | |
|---|---|
| **Exigence** | 🔴 **Toute expérience causale définit et GÈLE sa granularité d'hypothèses AVANT d'examiner les défauts qu'elle cherche à expliquer.** La règle d'extraction est mécanique et publiée avec l'expérience. |
| **Où elle mord** | EXP-2 et toute expérience causale ultérieure |
| **Preuve exigée** | liste gelée publiée, horodatée, antérieure à l'analyse |
| **État** | 🔴 **P1 OUVERT** — la granularité doit être **réarbitrée** avant EXP-2 : `R-GRAN` s'est révélée être une projection incomplète |
| **Interdit** | 🔴 **Choisir rétroactivement une granularité parce qu'elle fait converger les résultats.** |

## Bloc IV — Instrument et modèle

### E-11 · PROTOCOL-D002 — évaluer le modèle de sévérité avant de le corriger

| | |
|---|---|
| **Exigence** | Le modèle de sévérité est **évalué** sur sa capacité à représenter `severity(A + B) > max(severity(A), severity(B))` **avant** toute correction. Si le modèle ne le peut pas, cette impossibilité est **documentée comme résultat expérimental**. |
| **État** | 🔵 `FACT` — évaluation faite (EXP-1, étape 8) : comptage **strictement additif** (2+2=4). `INFÉR.` — l'agrégat porte sur des items **indépendants** ; aucun écart ne référence un autre écart ; il n'existe **aucun porteur d'arité 2**. `CONCL.` — la relation **n'est pas représentable**, ni aujourd'hui, ni après l'ajout d'une sévérité scalaire. **Problème de porteur, pas de réglage.** 🟠 Ce résultat n'est pas encore consigné au registre du protocole — obligation ouverte (**P4**) |
| **Interdit** | 🔴 **Ne pas corriger prématurément.** `CONCL.` — la correction prévue de D002 est **orthogonale** à `PROTOCOL-D015` : les deux configurations portent 2 écarts critiques, seul l'`owner` change. |

### E-18 · SÉVÉRITÉ COMPOSITIONNELLE — classe de comportements non représentable

| | |
|---|---|
| **Exigence** | Tout modèle de sévérité retenu doit pouvoir représenter les **effets de composition**, pas seulement des valeurs individuelles, additives ou maximales. Un modèle qui ne le peut pas doit **déclarer explicitement** la classe de comportements qu'il ne peut pas voir. |
| **Où elle mord** | toute évolution du rapport de faisabilité ; tout score agrégé |
| **État** | 🔴 `FACT` — le modèle actuel ne peut pas la représenter (**E-11**). La classe non représentable est donc **ouverte et non bornée** |
| **Interdit** | déclarer D002 résolu par une sévérité scalaire |

### E-19 · RUNTIME ↔ VALIDATEUR — correspondance sémantique vérifiée

| | |
|---|---|
| **Exigence** | 🔴 **Avant de renforcer une gate individuellement, vérifier explicitement la correspondance entre ce que le runtime FAIT et ce que le validateur PRÉTEND vérifier.** Un écart entre les deux se traite au niveau du **modèle**, pas gate par gate. |
| **Où elle mord** | toute correction de gate ; toute nouvelle obligation dérivée |
| **Preuve exigée** | sémantique du runtime écrite depuis le source + énumération des divergences `Δ` / `Δ′` |
| **État** | 🔴 `FACT` — **0 / 25** gates possèdent une correspondance runtime établie ayant survécu à l'examen. Une seule correspondance existe (`envelope-truth.test.ts`) ; elle procède par comparaison de **chaînes de caractères** et atteste une proposition dont la fausseté est démontrée sur l'axe des déclencheurs |
| **Interdit** | 🔴 **Renforcer une gate isolément lorsqu'un écart indique que le modèle du validateur diffère du runtime.** |

### E-14 · AGENTS SPÉCIALISÉS — indépendance de source, pas nombre

| | |
|---|---|
| **Exigence** | Un agent supplémentaire n'est ajouté que s'il apporte une **information, une perspective, une source ou un oracle suffisamment indépendants**. La demande d'ajout publie l'axe d'indépendance apporté (parmi les 8 axes du protocole). |
| **Où elle mord** | toute proposition d'architecture multi-agents |
| **Preuve exigée** | axe d'indépendance nommé + intersection des dépendances calculée |
| **État** | `FACT` — campagne 1 (adversaire, mêmes artefacts) : **2 échecs / 10**. Campagne 2 (mêmes modèle et outils, **second artefact** : le runtime) : **7 prédictions, 7 confirmées**. `INFÉR.` — ce n'est pas le nombre d'agents qui a produit la différence, mais **l'artefact lu** |
| **Interdit** | 🔴 **La diversité apparente de plusieurs agents issus du même modèle ne constitue pas une indépendance.** Ne pas ajouter d'agents pour multiplier les validations. |

## Bloc V — Qualité en amont et signal

### E-12 · G22 / QUALITÉ EN AMONT — question de CAPACITY/SIGNAL

| | |
|---|---|
| **Exigence** | La richesse de l'AIR / de la spécification en amont est traitée comme une question de **CAPACITY et de SIGNAL**, **pas** comme une gate de conformité supplémentaire. |
| **Où elle mord** | Phase 10 (variété inter-domaines) ; toute évolution du contrat AIR ; G22 |
| **Preuve exigée** | mesure sur artefacts, pas déclaration de périmètre |
| **État** | 🔴 `FACT` — un AIR techniquement valide mais fonctionnellement pauvre passe les contrôles : app minimaliste **1 écart** vs slice **52**. `FACT` — sur le **corpus gelé 12 domaines**, 12 silhouettes structurelles distinctes mais **1 seule identité visuelle** ; `INFÉR.` propriété du corpus (overrides interdits par D-025), **pas** du moteur — la dimension H du critère Phase 10 porte sur **2 domaines** et est enregistrée **conforme** (DET-021) |
| **Interdit** | traiter G22 comme un simple seuil de conformité ; publier un ratio sans son dénominateur |

### E-13 · MESURE INDÉPENDANTE DE QUALITÉ — préalable à toute affirmation causale

| | |
|---|---|
| **Exigence** | 🔴 **Aucune affirmation causale sur « ce qui rend le générateur meilleur » n'est recevable tant qu'il n'existe pas une mesure de qualité INDÉPENDANTE des gates utilisées pour l'évaluer.** Si une telle mesure ne peut pas être construite avec une indépendance suffisante, **cette impossibilité devient un résultat méthodologique documenté** — jamais un silence. |
| **Où elle mord** | tout travail visant à améliorer le générateur ; toute conclusion d'expérience |
| **Preuve exigée** | provenance de la mesure + axes d'indépendance vis-à-vis des gates |
| **État** | 🔴 **AUCUNE mesure indépendante n'existe.** `FACT` — la grille A++ est définie **et** mesurée en interne par les auteurs du moteur qu'elle évalue : elle **viole P-D** et ne peut pas servir de mesure indépendante (`REFERENCE` § F) |
| **Interdit** | 🔴 utiliser la grille A++, le rapport de faisabilité ou l'Oracle L1 comme mesure « indépendante » de la qualité |

### E-15 · SIGNAL RÉEL — étudier, ne pas présumer la hiérarchie

| | |
|---|---|
| **Exigence** | Inscrire l'**étude** de ce qui fournit au générateur une information réellement utile sur son propre résultat : observation du runtime · artefacts produits · comportement réellement exécuté · référence indépendante · signaux visuels lorsque la propriété l'exige · autres observations pertinentes. |
| **Où elle mord** | conception de tout instrument futur |
| **Preuve exigée** | mesure comparative du rendement informationnel de chaque canal |
| **État** | 🟠 **NON MESURÉ.** `FACT` — un seul canal a produit des découvertes à ce jour : la **lecture différentielle runtime ↔ instrument**. `HYPO.` — son rendement supérieur n'est établi que sur un objet, une fois |
| **Interdit** | 🔴 **Ne transformer aucune hiérarchie supposée de signaux en fait avant mesure.** |

### E-16 · RÉFÉRENCE TERRAIN — hypothèse expérimentale, pas solution

| | |
|---|---|
| **Exigence** | L'usage d'une **implémentation de référence de haute qualité** comme signal d'apprentissage ou de comparaison est étudié **comme hypothèse expérimentale**, avec protocole, mesure et critère de réfutation. |
| **Où elle mord** | toute proposition de « corpus de référence », de banc externe, de G11 |
| **Preuve exigée** | provenance signée + niveau d'indépendance (INDEPENDENT / PARTIALLY / CORRELATED / INADMISSIBLE) |
| **État** | 🔴 **aucune source externe enregistrée** à ce jour |
| **Interdit** | 🔴 **Ne pas l'inscrire comme solution garantie avant mesure.** Attention à l'empoisonnement de référence (R-07) : une première capture fautive devient la norme. |

### E-20 · OBJECTIF GLOBAL — la boucle, pour de l'inédit

| | |
|---|---|
| **Exigence** | Canonique : § CADRE, 8 (boucle générale avec le maillon **DIVERGENCE**). Obligation ROADMAP : toute phase restante déclare **quel maillon de la boucle** elle fait progresser. |
| **Où elle mord** | Phases 10 à 14 |
| **État** | `FACT` — la chaîne actuelle s'arrête à `exécution` pour 1 slice sur 2 ; les maillons `observation → mesure → validation → divergence` n'existent qu'à l'état d'artefacts textuels pour la plupart des propriétés |
| **Interdit** | 🔴 **Réduire l'objectif à `AIR → génération → tests → téléphone`.** Une boucle démontrée sur les 13 documents connus ne démontre rien sur l'inédit (**OOD : 0 échantillon**). |

---

## TABLE DE RATTACHEMENT — quelle exigence mord où

| Phase | Exigences applicables en plus des critères existants |
|---|---|
| **10** (ouverte) | E-01 · E-04 · E-06 · E-07 · E-12 · E-20 |
| **11** OTA | E-02 · E-04 · E-06 · E-07 · E-20 |
| **12** store / compliance | E-04 · E-05 · E-06 |
| **13** distribution | E-06 · E-20 |
| **14** industrialisation / scorecard | E-05 · E-07 · E-13 · E-20 |
| **transverse, hors phase** | E-03 · E-08 · E-09 · E-10 · E-11 · E-14 · E-15 · E-16 · E-17 · E-18 · E-19 |

---

# PLAN DE REMISE À NIVEAU — RN-01 → RN-23 · S-1 → S-10

> **Statut** : plan **VALIDÉ par le propriétaire le 2026-08-30**.
> `FINAL TECHNICAL AGREEMENT : YES` — **pour l'implantation et l'exécution de ce
> plan uniquement**, jamais pour une certification du protocole ou du produit.
>
> **Ce chapitre est le point de reprise opérationnel.** Une session lit le
> **JOURNAL D'EXÉCUTION** (fin de chapitre), y trouve le dernier étage franchi,
> vérifie la condition de transition, et exécute l'étage suivant — sans nouvelle
> instruction. Elle s'arrête aux **points de contrôle** marqués 🛑.

## Ordre d'exécution — strict

```
ÉTAGE 0  PRÉCONDITIONS DE GOUVERNANCE ......... RN-01 · RN-02 · RN-03 · RN-05 · RN-06
   ▼ condition : RN-01 horodatée dans DECISIONS.md AVANT toute analyse causale (E-17)
              → LEVÉE le 2026-09-01 (D-108, caducité). E-17 redevient exigible
                si une analyse causale est reprise.
ÉTAGE 1  SYNCHRONISATION + VERSIONNEMENT ...... S-4 · S-9 · RN-04 (commit)
   ▼ condition : aucune contradiction connue non consignée
ÉTAGE 2  MESURES ............................. RN-09 · RN-10 · RN-14 · RN-15
   ▼ condition : 25 gates classées ET chaque gate bloquante publie ses 5 points (E-05, E-06)
ÉTAGE 3  EXPÉRIENCES ......................... RN-11 puis EXP-2 (conception, PUIS exécution)
   ▼ condition : cause de R-25 identifiée OU impossibilité documentée (E-10)
ÉTAGE 4  GATES ............................... correction G4/G5 (E-19) · sévérité (E-18)
   ▼ condition : correspondance runtime↔validateur établie sur les gates touchées
ÉTAGE 5  REPRISE PHASE 10 .................... RN-12 · RN-13 · RN-07 · RN-08
         ordre CONFIRMÉ par D-051 — trancher AVANT de construire, sinon deux builds EAS
   ▼ condition : 5 critères de sortie satisfaits AU NIVEAU DE PREUVE EXIGÉ (E-02)
ÉTAGE 6  SUITE ROADMAP ....................... Phases 11 → 14
```

**Règle de franchissement** : un étage n'est franchi que si **toutes** ses
conditions sont satisfaites. Une condition partiellement satisfaite vaut
**non satisfaite** (P-C : `PARTIAL → PASS` ❌).

## Points de contrôle 🛑 — arrêt obligatoire, rapport avant de poursuivre

| 🛑 | Après | Motif de l'arrêt |
|---|---|---|
| **C-0** | étage 0 | 🟢 **CLOS le 2026-09-01** (`D-108`), avec `RN-01`. *Énoncé d'origine, conservé :* « **RN-01 est un arbitrage humain** : choisir la granularité. Claude Code ne peut pas la choisir — la seule candidate connue ferait converger D004/D005, ce que `E-17` interdit de décider après coup » |
| **C-1** | étage 1 | RN-04 (commit) exige une autorisation distincte ; `git push` reste interdit en toute circonstance |
| **C-2** | étage 2 | RN-10 exige un arbitrage : passer une gate en `strict` **change un critère de sortie** |
| **C-3** | conception d'EXP-2 | **l'exécution d'EXP-2 n'est jamais implicite** — autorisation explicite requise |
| **C-4** | étage 4 | toute correction de gate touche le produit : arbitrage requis |
| **C-5** | étage 5 | la validation physique est **SUSPENDUE** ; sa reprise est une décision propriétaire |

## Registre des travaux

### 🔴 BLOQUANT

| ID | Objet | Fichier / section | Dép. | Resp. | Condition de sortie |
|---|---|---|---|---|---|
| **RN-01** | granularité `R-GRAN` (P1) | `DECISIONS.md` | — | 🧑 | 🟢 **CLOS PAR CADUCITÉ le 2026-09-01** (`D-108`, arbitrage propriétaire) — le chantier P5→P9 a été mené et sécurisé sans cette règle. **Aucune règle `R-GRAN` n'a été écrite** : reprendre une analyse causale rendrait `E-17` de nouveau exigible |
| **RN-02** | verser `PROTOCOL-D006`→`D014` (P2) | `DISCOVERY_REGISTER.md` | — | 🤖 | 🟢 **FAIT 2026-08-30** — 9 entrées versées |
| **RN-03** | consigner le résultat E-11 (P4) | registres du protocole | — | 🤖 | 🟢 **FAIT 2026-08-30** — `PROTOCOL-D021` |
| **RN-04** | versionner `docs/elite-protocol/` (P3) | Git | RN-01→06 | 🧑→🤖 | 🟢 **FAIT 2026-08-31** — `2f00c00`, 88 fichiers suivis, aucun push. *La dépendance déclarée à `RN-01` s'est révélée non fondée (`D-106`).* |
| **RN-05** | corriger l'entrée « dimension H » | ROADMAP Phase 10 | — | 🤖 | 🟢 **FAIT 2026-08-30** — 2 entrées corrigées |
| **RN-06** | contradiction « vide » vs 17 cas-tueurs | `README.md` · `GATE_KILLER_TESTS.md` | — | 🤖 | 🟢 **FAIT 2026-08-30** — 4 mentions périmées rectifiées |
| **RN-07** | validation physique du slice 2 | Phase 10 · `STATUS.md` | 🛑 C-5 | 🧑 | app installée et exercée sur appareil |
| **RN-08** | `DET-006` virtualisation (dim. G) | `STATUS.md` | RN-07 | 🧑 | virtualisation effective observée |

### 🟠 NÉCESSAIRE AVANT REPRISE

| ID | Objet | Dép. | Resp. | Condition de sortie |
|---|---|---|---|---|
| **RN-09** | classer les 25 gates en 4 catégories (`E-05`) | RN-02 | 🤖 | 25 gates classées, publiées, datées |
| **RN-10** | action sur échec des gates bloquantes (`E-06`) | RN-09 | 🧑 | chaque gate bloquante publie ses 5 points |
| **RN-11** | mesure de qualité **indépendante** (`E-13`) | RN-01 | 🧑+🤖 | mesure obtenue **ou** impossibilité documentée |
| **RN-12** | `P-009` **volet 2** — accessibilité du graphe *(le volet 1, conditionnement des blocs, était déjà tranché → D-044)* | — | 🧑 | 🟢 **TRANCHÉ 2026-08-30 → D-049** : bloquant pour les documents **neufs**, **exclusivement sur la métrique EFFECTIVE** ; la métrique déclarée est **interdite comme base de blocage tant que `R-23` n'est pas fermé**. Exemption du corpus gelé à inscrire dans un **artefact**, jamais tacite. **Mise en œuvre : travail distinct, non engagé** |
| **RN-13** | `DET-018` liaison des Code Slots | — | 🧑 | 🟢 **TRANCHÉ 2026-08-30 → D-050** : dette **acceptée** pour la Phase 10, **échéance Phase 11**. **Aucune évolution de schéma maintenant.** Pas de regroupement avec `RN-12` — l'option B des deux fait tomber l'argument du coût partagé |
| **RN-14** | couverture des cas-tueurs par gate | RN-06 | 🤖 | couverture publiée par gate |
| **RN-15** | narratif du scorecard vs sa mesure | RN-05 | 🤖 | narratif dérivé de la mesure |
| **RN-16** | 60 fichiers non committés | — | 🧑 | 🟢 **FAIT 2026-09-01** — `git status --porcelain` : **0 entrée** à `9f88792`. *Reste vrai : 126 commits locaux non poussés, conformément à l'interdiction de `git push`.* |

### 🟡 PLUS TARD

`RN-17` DET-003/004/005 → Phases 11-12 · `RN-18` DET-007/008 · `RN-19` DET-009/010/012/013 ·
`RN-20` DET-026 `rtlSupported` inerte · `RN-21` banc de coûts EAS · `RN-22` alarme `G23` (9 analyses / 1 construction) ·
`RN-23` conditions 1/3/4/5/7 du protocole (`REFERENCE` § O).

### Synchronisations documentaires

| ID | Objet | Resp. | État |
|---|---|---|---|
| **S-1** | `README.md` « cas-tueurs aujourd'hui vide » — périmé | 🤖 | 🟢 **2026-08-30** |
| **S-2** | campagne 2 absente de `GATE_KILLER_TESTS.md` | 🤖 | 🟢 **2026-08-30** — 7 cas-tueurs versés + réserve d'imputation G4/G5 |
| **S-3** | couverture minimale obsolète | 🤖 | 🟢 **2026-08-30** — 17 exécutés · 9 échecs · par gate |
| **S-4** | `GATE_REGISTER` ignore EXP-1 et la mesure structurelle | 🤖 | 🟢 **2026-08-30** — + 2 mentions périmées rectifiées (règle fondamentale, G16) |
| **S-5** | bloc de statut du README à réévaluer — **sans élever aucun statut** | 🧑 | ⬜ |
| **S-6** | `REFERENCE` § O ne mentionne ni EXP-1 ni la mesure des 25 gates | 🧑 | ⬜ |
| **S-7** | = RN-03 | 🤖 | 🟢 **2026-08-30** — `PROTOCOL-D021` |
| **S-8** | = RN-02 | 🤖 | 🟢 **2026-08-30** — D006→D014 |
| **S-9** | `STATUS.md` ne porte ni D-046, ni § CADRE, ni E-01→E-20 | 🤖 | 🟢 **2026-08-30** |
| **S-10** | = RN-05 | 🤖 | 🟢 **2026-08-30** |

## JOURNAL D'EXÉCUTION — tenu à jour à chaque étape

| Date | Étage | Travaux | Preuve | Résultat |
|---|---|---|---|---|
| 2026-08-30 | — | plan validé par le propriétaire, implanté dans ce chapitre | ce chapitre | 🟢 |
| 2026-08-30 | **0** | `RN-05` — 2 entrées « dimension H » corrigées (l'entrée initiale appliquait un artefact 12 domaines à un critère 2 domaines) | `STATUS.md` DET-021 · 4 runs `anti-template` | 🟢 |
| 2026-08-30 | **0** | `RN-02` / S-8 — `PROTOCOL-D006`→`D014` versées, niveaux de preuve conservés, aucune correction | `DISCOVERY_REGISTER.md` · `evidence/` | 🟢 |
| 2026-08-30 | **0** | `RN-03` / S-7 — `PROTOCOL-D021` : le modèle de sévérité ne peut pas représenter la composition (porteur d'arité 2 absent) | `evidence/exp1b.mjs` | 🟢 |
| 2026-08-30 | **0** | `RN-06` / S-1→S-4 — 4 mentions périmées rectifiées · campagne 2 versée · réserve d'imputation G4/G5 inscrite · mention « aucun faux FAIL » **réfutée** | `GATE_KILLER_TESTS.md` · `GATE_REGISTER.md` · `README.md` | 🟢 |
| 2026-08-30 | **0** | S-9 — `STATUS.md` porte le cadre, l'état figé et les mesures structurelles | `STATUS.md` | 🟢 |
| 2026-08-30 | 🛑 **C-0** | **ARRÊT** — `RN-01` (granularité) est un arbitrage humain ; `RN-04` (commit) en dépend | — | ⏸ *(dénoué le 2026-09-01, `D-106`)* |
| 2026-08-31 | **1** | `RN-04` — `docs/elite-protocol/` versé au dépôt, 88 fichiers, aucun push | commit `2f00c00` | 🟢 |
| 2026-08-31 → 09-01 | — | **CHANTIER P5 → P9** — fidélité et couverture des oracles : 5 générations réelles (14,8831 $), gates `fidelite` et `invariants` câblées, 19 décisions | `D-087` → `D-105` · `STATUS.md` · `evidence/p5`,`p6`,`p8`,`p9` | 🟢 |
| 2026-09-01 | — | `RN-16` — arbre de travail propre | `git status --porcelain` : 0 entrée à `9f88792` | 🟢 |
| 2026-09-01 | — | **`D-106`** — `C-0` déclaré caduc, `RN-01` maintenue ouverte ; §10 et §11 rectifiés sans suppression | `DECISIONS.md` `D-106` | 🟢 |
| 2026-09-01 | — | **`D-108`** — `RN-01` et `C-0` **CLOS PAR CADUCITÉ** (arbitrage propriétaire) ; aucune règle `R-GRAN` écrite, `E-17` redevient exigible si une analyse causale reprend | `DECISIONS.md` `D-108` · `614e6dc`→`9f88792` | 🟢 |
| 2026-09-01 | — | **`D-107`** — `PB#2` fermé : la réparation conserve ses preuves payées, une panne n'est plus classée `terminee`, un artefact porte sa génération | `packages/repair/src/preservation.ts` · **23 cas-tueurs ajoutés** · 4 falsifications | 🟢 |

| 2026-09-01 | **10B** | **P10** — génération réelle `coach-fitness` autorisée : `valid=true`, 2,3069 $, 10 appels, 27 diag → 0, 0 amputation. **6/7 gates au vert** ; `fidelite` rouge conservé, hors `coach-fitness` | `DECISIONS.md` `D-109` · journal `campagne-v2-2026-09-01T15-15-53-015Z.jsonl` | 🟢 |

| 2026-09-01 | **sectoriel** | **`D-111`** · **R2** — `screenTraits()` : traits d'écran DÉRIVÉS, cumulables, jamais déclarés. Mesuré : 45 écrans sur 154 (29 %) en portent plusieurs — un champ `role` unique serait faux par construction. `D-086` respecté, aucun champ AIR, aucune migration | `execution-contract/src/graph.ts` · 10 cas-tueurs · 3 falsifications | 🟢 |
| 2026-09-01 | **instrument** | **`controles-fantomes` corrigé** — le remplissage violait les règles des documents : 28 faux positifs. **183 → 155**, plafond **180 INCHANGÉ** | `saisie-conforme.ts` · 5 cas-tueurs · 3 falsifications | 🟢 |
| 2026-09-01 | — | **`D-110`** — la marge du cliquet est un AMORTISSEUR de population, pas une tolérance. Abaisser à 155 en ferait un détecteur de croissance | `DECISIONS.md` `D-110` | 🟢 |
| 2026-09-01 | **10B** | **`D-112`** · **`FORM_SANS_ACTION`** — diagnostic non bloquant : 7 formulaires muets sur 45 contre 0 bouton sur 259. Consommé par la boucle de réparation, mappé sur `actions`, doublé de la règle 28 | `execution-contract` · `repair-scope` · `emit-v3` · 8 cas-tueurs · 3 falsifications | 🟢 |

**Prochaine action à exécuter — au 2026-09-01, après `D-110`.**

> *Énoncé précédent, conservé pour mémoire (2026-08-30)* : « 🛑 point de contrôle
> C-0 atteint. L'étage 0 est exécuté à l'exception de `RN-01`, qui est un arbitrage
> humain […] Aucune autre action n'est autorisée. » — **DÉPASSÉ** : `RN-04` a été
> exécuté sans que `RN-01` soit levée, et le chantier P5→P9 a suivi.

**Ce qui est ouvert** : le **chantier sectoriel** — `R6` (chaîne image → détail)
est le prochain, débloqué et à faible risque ; `R7` ensuite. **`R4` et `R5` sont
BLOQUÉS** : aucun bloc grille n'existe et `AppImage` n'a que deux variantes fixes,
donc « 4 images principales visibles » est **inexprimable** sans dégel du registre.

**Également ouvert** : les **7 formulaires muets** restent muets — le diagnostic
`FORM_SANS_ACTION` ne mord qu'à la prochaine génération. Et un **audit du rouge
résiduel de `gate:fidelite`** —
`F1 = 12`, `F4 = 21`, 15 motifs réfutés — pour établir si ce rouge est
**structurellement attendu** (les 12 documents v2 gelés sont en `1.0.0` et n'ont
aucune intention) ou s'il constitue un **travail restant de la Phase 10B** sur les
9 documents v3. **Audit hors ligne, aucune dépense.**

*Exécutée le 2026-09-01* : la génération `coach-fitness` (`D-109`). **Toute nouvelle
génération exige une autorisation explicite distincte** — aucune dépense sans elle.

**Ce qui reste FERMÉ, et pourquoi** : `EXP-2`, la validation physique, la clôture
de la Phase 10, `G4`/`G5`, la sévérité et le protocole canonique — par les interdits
du §10, qui tiennent. **`RN-01` n'en fait plus partie** : clos par caducité
(`D-108`). Mais aucune règle `R-GRAN` n'ayant été écrite, reprendre une analyse
causale rendrait `E-17` de nouveau exigible **avant** de commencer.
