# CHANGELOG — CHANTIER MOBILE GENERATION

## 2026-08-28 — 4.1 TERMINÉE : release train v1 (D-027) + résolveur AIR→lock

- **Paquet `@deribfy/compiler` créé** (7ᵉ paquet moteur, patron exact des
  paquets existants : lint-bloquant strict type-checked dès le premier
  commit, vitest, sources TS exportées, câblé aux scripts racine → CI).
- **`release-train.ts`** : train `rt-2026.08`/1.0.0 — contrats gelés
  (AIR/blocs/capabilities/tokens 1.0.0), **scellés Merkle des sources des
  3 paquets gelés** (recalculés depuis les vraies sources par le test de
  garde : zone gelée éditée ⇒ CI rouge), toolchain exacte (node 24.16.0,
  expo 57.0.17, RN 0.86.3), dépendances du gabarit aux versions PROUVÉES
  sur device au banc V4 (dont react-native-screens **4.26.2** — version
  réellement installée, relevée et corrigée avant gel).
- **`resolve-lock.ts`** : `resolveLock(air)` PUR (zéro fs/réseau/horloge),
  fail-closed aux 4 validateurs (refus net, diagnostics sourcés triés,
  jamais de lock partiel), sortie revalidée contre `projectLockSchema`
  **1.0.0 INCHANGÉ**. 4 lectures consignées (D-027) : version de
  capability = version du CONTRAT ; tokensVersion absent → train,
  différent → refus ; providers [] jusqu'à 4.5 ; intégrité de bloc =
  scellé du train. Sous-chemin pur `@deribfy/blocks/registry` ajouté
  (évolution consciente anticipée par D-025 ; cliquet D-024 vert).
- **Preuves** : compiler tsc/lint 0, **26/26 tests** — v2 12/12 résolus
  (airHash contre-calculé, vocabulaire ⊆ registre, capabilities résolues),
  déterminisme (3 rejeux + permutation de clés ⇒ byte-identique 12/12),
  fail-closed (blockType/capability inconnus, tokens ≠, hors schéma),
  **corpus v1 gelé 12/12 REFUSÉS** ; packages **272/272** ; **web intact**
  après lockfile : tsc EXIT=0 + **221 fichiers / 4071/4071**. Coût : 0 $.

## 2026-08-28 — 4.0 TERMINÉE : validations V2-V5 vertes, S1 TRANCHÉ (0 $)

- **Banc `benchmarks/compiler-determinism/`** (synthèse `synthese-4.0.md`) :
  - **V2 🟢** : chaîne « émission Option C → manifeste Merkle » prouvée —
    20/20 hash identiques ×2 documents du corpus v2, 10 processus × 2
    environnements hostiles (TZ Auckland, locale turque, cwd hors dépôt) ;
    contrôle positif : poison horodaté → 20 hashes distincts détectés.
  - **V5 🟢** : harnais zéro-réseau à 2 couches (`registerHooks` de
    remplacement de modules + patchs d'appel) — positif 5/5 canaux tués,
    négatif 12/12 docs (4 validateurs + hash canonique) à 0 diagnostic
    sans déclenchement, spécificité 0/5 sans harnais ; limite des
    instantanés d'exports nommés DÉMONTRÉE par la mesure et fermée
    (harnais chargé en premier ; cliquet statique = 4.6).
  - **V3 🟢** : mécanisme S4 — lockfile généré ×2 byte-identique ;
    `npm ci --ignore-scripts` ×2 environnements → 19 666 fichiers,
    arbres node_modules strictement identiques ; lockfile intact.
  - **V4 🟢 → S1 TRANCHÉ : `@react-navigation/native-stack`** (D-026) —
    fixture resto-quartier, Release, New Arch, devices réels : stabilité
    20/20 les deux candidats · poids +440/+435 k-octets vs +924/+1 230
    (expo-router ×2,1–2,8) · back réel PASS des deux (back système
    Android, pop par geste iOS — tap texte remplacé car ambigu) · défaut
    structurel expo-router MESURÉ : arbre npm invalide aux versions SDK
    (worklets 0.12 vs ^0.7–0.10), builds Release cassés 2/2, `--fix` non
    convergent, vert seulement après overrides matrice SDK.
  - Anomalies d'environnement corrigées sur précédent P-003 (cmake Intel →
    `cmake.dir` SDK ; pods ; `JAVA_HOME` pour Maestro) ; 1 flake driver
    XCUITest rejoué (infra de test, pas l'app).

## 2026-08-28 — PHASE 4 OUVERTE (D-026) : architecture du compilateur v1

- **P0 exécuté** : clôture Phase 3 / D-025 commitée localement (`3955ebb` —
  corpus-v2, tests CI, campagne, consignations) ; vérifications au commit :
  packages tsc EXIT=0, lint 0 écart, **246/246 tests**. Aucun push.
- **D-026 consignée** (feu vert propriétaire sur dossier d'options complet,
  présenté AVANT toute implémentation) : **Option C hybride canonique**
  (code structurel généré + matière variable en modules canoniques via le
  sérialiseur prouvé d'`air-schema`) ; S2 fixtures déterministes seedées
  `contentHash` derrière interface data-provider ; S3 manifeste Merkle +
  store local content-addressed ; S4 gabarit à lockfile pré-résolu, zéro
  install en compilation ; S5 émission canonique maison sans formateur
  externe ; S6 slots → stubs typés (Phase 9) ; S7 tokens scellés 1.0.0,
  `design.theme` sans effet (porte consciente) ; **S1 navigation tranché
  par micro-banc V4**, pas sur papier ; lecture A3 (manifestes/permissions
  générés, implémentations de capabilities = Phases 5+) ; release train v1
  sur pins démontrés. **Dépenses : 0 $ par défaut**, méthode arbitrage C
  pour toute exception.
- **Étape en cours : 4.0 — validations V2-V5** avant construction du
  compilateur.

## 2026-08-28 — ARBITRAGE C RÉSOLU (D-025) : golden corpus v2, 12/12, 7,42 $

- **D-025 consignée puis exécutée** : ré-émission LLM du corpus (Option A)
  après démonstration par la mesure que toute alternative gratuite échoue
  (12/12 documents v1 refusés par l'allowlist, MÊME après mapping des
  synonymes ; 153 occurrences hors registre).
- **Campagne réelle** (`emit-v2.mjs`, pipeline 2.4 réutilisé — `emit.mjs`
  INTOUCHÉ) : mêmes 12 intentions, digest du registre de SMART BLOCKS
  (schémas de props, liaisons d'entité, appariements F1/F2) ajouté au
  prompt, `design.overrides` interdit, round-trip supprimé (garantie D-019
  structurelle au schéma inchangé), PLAFOND DUR 25 $ codé. Résultat :
  **12/12 valides**, 1 passe de réparation bornée/document (11-22
  diagnostics → 0), **0 refus**, **7,42 $** (~0,62 $/doc, sous l'estimation
  8-14 $). Incident consigné : ~0,5 $ perdus par un préchargement de module
  qui a démarré la boucle (leçon : jamais d'import à sec d'un module à
  effets).
- **Contre-vérification INDÉPENDANTE** (D-018) : 12/12 à **0 diagnostic aux
  4 validateurs** (schéma strict, sémantique, capabilities, **blocs** —
  premier câblage réel de `validateAirBlocks`) ; **vocabulaire émis =
  EXACTEMENT les 6 blocs du registre** (le remède digest prouvé une 2ᵉ
  fois) ; overrides vides 12/12 ; ids/slugs uniques ; 3 classes commerce ;
  **corpus v1 byte-identique** (scellés SHA-256 avant/après identiques).
- **CI sans réseau** : `tests/corpus-v2.test.ts` (63 tests) — import du
  module PUR du registre de blocs par chemin direct (le paquet gelé reste
  intouché ; un sous-chemin d'export serait une évolution consciente).
  Packages **246/246**. Corpus v1 et son test : INTOUCHÉS.
- **Conséquence** : le prérequis corpus de la Phase 4 est LEVÉ — le critère
  dur s'exerce sur le corpus ACTIF v2. Ouverture de la Phase 4 = décision
  propriétaire.

## 2026-08-28 — 3.4 TERMINÉE : harnais de rendu VERT sur iOS ET Android

- **Harnais `harness/render/`** (H1+M1+V2 validés propriétaire) : app Expo
  autonome hors workspaces (patron banc, zéro risque web), substitut du
  compilateur — ScreenShell + les 6 Smart Blocks GELÉS (D-024), libellés/
  données/callbacks fournis par l'appelant (F3).
- **Protocole V2 exécuté INTÉGRALEMENT sur les deux plateformes** :
  préparation → parcours light (assertions + captures) → bascule dark
  assertée + 5 écrans re-assertés → bascule RTL réelle (forceRTL + relance,
  `RTL : ACTIF` asserté) → **REJEU INCHANGÉ du parcours complet** → retour
  LTR. **VERT iOS · VERT Android** — 44 captures versionnées + journaux.
- **Réserve D-024 LEVÉE** : tap RÉEL sur une ligne de ListBlock (toucher
  natif Maestro) → écran Detail asserté — sur les deux plateformes.
- **États loading/empty/error** réellement rendus et assertés (ListBlock +
  empty_state), actions retry/parcourir déclenchées et vérifiées.
- **Défaut de composition DÉMONTRÉ sur device puis corrigé (harnais seul)** :
  écrans de blocs sans ScreenShell → fond non thémé en dark (textes clairs
  sur fond clair). Correction : chaque écran enveloppé dans ScreenShell ;
  rebuilds + **protocole intégralement rejoué** (aucun PASS antérieur
  conservé). **NOTE D'ARCHITECTURE consignée pour la Phase 4 : un écran
  généré = ScreenShell(titre) + blocs.**
- Anomalies d'outillage traitées sur preuve : dialogue deep-link post-build
  (flow préparateur HORS critères — protocole V2 inchangé) ; sandbox
  takeScreenshot de Maestro 2.9 (chemins relatifs + rapatriement runner).
- **Conséquence ROADMAP : les 4 critères de sortie de la Phase 3 sont
  satisfaits** — clôture de phase = constat propriétaire. Zones gelées :
  0 modification. Coût : 0 $.

## 2026-08-28 — GEL DU REGISTRE DE SMART BLOCKS v1 (D-024)

- **Revue propriétaire exhaustive** (13 sections, lecture seule) : D-023+L2
  revérifiés sur artefacts, compatibilité AIR prouvée mécaniquement, audit
  bloc par bloc, pont, composants, compositions, cliquets, anomalies.
  Verdict initial 🟠 : 3 défauts démontrés.
- **Corrections pré-gel autorisées et appliquées** : F1 `button.actionId`
  REQUIS (CTA non câblable interdit) · F2 appariement bidirectionnel
  `empty_state.actionLabel` ⟺ `actionId` (superRefine, diagnostics ciblés,
  action validée contre l'AIR) · F3 `ListBlockState` DISCRIMINÉ — zéro
  chaîne linguistique dans le moteur (non-négociable 16), libellés fournis
  par le compilateur, cliquet linguistique de classe (littéraux réels,
  signature espace/diacritique/ellipse).
- **Résolutions factuelles** : anomalie « catalogue non interactif » =
  fixture de banc P-003 (cartes sans onPress PAR PROTOCOLE ; blocks jamais
  déployé sur device ; preuve du toucher réel = harnais 3.4) ·
  `badgeFieldIds.max(4)` supprimée (borne inventée, corpus max = 3),
  `min(1)` conservée et justifiée (forme canonique de l'absence).
- **GEL (D-024)** : `BLOCK_REGISTRY_VERSION` 1.0.0, les 6 contrats 1.0.0,
  cliquet verrouillé (version + liste exacte + versions — patron D-020),
  règle d'évolution post-gel identique à D-020.
- **Preuves** : packages 6/6 — tsc/lint 0, **183/183 tests** (57+26+39+15+
  19+27) ; web intact (tsc EXIT=0 + 4071/4071 après corrections) ; zones
  gelées : 0 modification. Coût : 0 $.

## 2026-08-28 — 3.3 TERMINÉE : Smart Blocks v1 (@deribfy/blocks, D-023)

- **D-023 consignée** (arbitrage propriétaire sur dossier d'options B) :
  registre de **blocs COMPOSITES DE PRIMITIVES** (granularité section — la
  seule compatible avec l'AIR v1 gelé), primitives HORS registre, allowlist
  positive, E2E-agnostique **par cliquet**, pas d'élargissement au cas où ;
  les 4 motifs ROADMAP (AuthFlow, List/Detail, Form, Profile) livrés comme
  **compositions de référence testées** ; **corpus GELÉ non régénéré** (L2),
  couverture corpus = Phase 4 (arbitrage C inchangé).
- **Registre v1 (6 blocs, v0.1.0 NON GELÉ — gel = revue propriétaire)** :
  `button`, `detail_header`, `empty_state`, `form`, `header`, `list` —
  schémas de props **STRICTS** (clé inconnue = refus ; leçon mesurée du
  corpus : dérive jusque dans les clés), liaison d'entité explicite
  (`required`/`forbidden`), états contractuels EXPLICITES (jamais déduits
  des données — déterminisme).
- **Pont `validateAirBlocks`** (patron D-020) : refus net des types hors
  allowlist, entités/champs/actions validés contre la tranche d'AIR,
  diagnostics déterministes triés. **NON câblé aux tests du corpus** —
  porte du compilateur (Phase 4) et outil de la ré-émission (arbitrage C).
- **6 composants** composant EXCLUSIVEMENT les primitives 3.2 — cliquets :
  contrats = types react seuls ; `FlatList` = seul import react-native ;
  **zéro StyleSheet, zéro style en dur, zéro token direct** dans les blocs ;
  aucune trace maestro/detox dans les sources (cliquet d'indépendance E2E).
- **4 compositions de référence testées en intégration** (D-023) : AuthFlow
  (saisie masquée + soumission + action secondaire), List/Detail (liste →
  sélection → détail), Form (fieldErrors + erreur globale + submitting),
  Profile (identité + réglages + déconnexion) ; + états loading/empty/error
  du harnais sur ListBlock — l'écart consigné en D-022 se résorbe comme
  prévu.
- **Preuves** : packages 6/6 — tsc/lint 0 écart, **178/178 tests**
  (57+26+39+15+19+22) ; **web intact** : tsc EXIT=0 + **4071/4071** ;
  zones gelées (AIR, corpus, capability-registry, protocoles, bancs) :
  0 modification. Coût : 0 $.

## 2026-08-28 — 3.2 TERMINÉE : primitives contractuelles (@deribfy/primitives)

- **Dossier d'options présenté et validé par le propriétaire** (A1 un paquet ·
  B2 jeu de 9 primitives · C2 contrats + surface a11y minimale · D1 liaison
  statique aux tokens + patron 2 feuilles · E1/E3 tests structurels vitest,
  vérité de rendu au harnais 3.4).
- **Contrats v1** (`contracts.ts`) : types `react` UNIQUEMENT — étanchéité §22
  (prouvée 6/6 au banc P-003) désormais **mécanisée par cliquet** (test qui
  échoue sur tout import non-react, valeurs comprises). Surface a11y :
  `testID` partout, `accessibilityLabel` sur l'interactif ; rôles posés par
  l'implémentation.
- **9 primitives** (chacune exigée par un bloc 3.3 ou le harnais 3.4) :
  ScreenShell, Section, AppText (4 variantes = 4 tokens de police), AppButton
  (disabled/loading), TextField (error/loading/secure — AuthFlow), ListRow
  (généralisation de la Card du banc : leading/trailing/badge), Badge,
  StateView (loading/empty/error — exigences du harnais), Spinner.
- **Pont de thème** : patron GAGNANT du banc P-003 (2 feuilles StyleSheet
  pré-calculées + SchemeContext — bascule 2 frames mesurée) ; liaison
  STATIQUE à `@deribfy/design-tokens` (la variance par app est un acte de
  COMPILATION, modèle copie-régénérable §3) ; **cliquet RTL** : propriétés
  logiques exclusivement (test sur les sources).
- **19 tests structurels** (react-test-renderer sur stub react-native ;
  typage contre les VRAIS types RN 0.86.3 en devDependency). Exception lint
  CONSIGNÉE, limitée aux tests : react-test-renderer est déprécié par
  React 19 — choix E1 assumé, à réexaminer ; vérité de rendu = harnais 3.4.
- **Refus consignés** (anti sur-conception) : passe-plat `style`, registre de
  primitives (hors ROADMAP — registre = blocs), thème runtime injectable,
  primitives de navigation (territoire arbitrage B), breakpoints responsive,
  système de variants générique (seuil de réexamen D-021 inchangé).
- **Preuves** : packages 5/5 — tsc/lint 0 écart, **156/156 tests**
  (57+26+39+15+19) ; **web intact** après entrée de react-native 0.86.3 au
  lockfile racine (+2159 lignes) : tsc EXIT=0 + **4071/4071 tests**.
  Coût : 0 $.
- **Écarts §22 consignés (non improvisés)** : elevation/animations (aucun
  token d'ombre dans la source — extension consciente le jour venu),
  responsive/adaptive (hors critères Phase 3), idiomes iOS/Android (minimal).

## 2026-08-28 — PHASE 3 OUVERTE : 3.1 TERMINÉE ET SCELLÉE (tokens double cible)

- **`@deribfy/design-tokens` créé** (Phase 3.1a) : `tokens.json` = SOURCE
  UNIQUE (ARCHITECTURE §22) — valeurs importées VERBATIM, aucune inventée :
  palette produit (CLAUDE.md / bloc `@theme` de `globals.css`) + jeu
  sémantique RN éprouvé au banc P-003 (D-021). Schéma zod strict ; codegen
  thème RN (`theme.generated.ts`, données pures, zéro dépendance de styling,
  zéro `node:fs` — consommable par les primitives) ; 10 tests dont cliquets
  (palette de marque gelée, variables web, non-dérive octet à octet,
  déterminisme du codegen). CI : paquet câblé aux 3 scripts `packages:*`.
- **Codegen cible WEB** (Phase 3.1b) : `theme.web.generated.css` généré depuis
  la même source ; **ÉQUIVALENCE PROUVÉE OCTET À OCTET** avec le segment de
  tokens de `apps/web/src/app/globals.css` (497 octets, SHA-256 identiques)
  — bascule = no-op par construction.
- **SCELLEMENT (arbitrage propriétaire : Option A)** : cliquet d'autorité
  (`packages:test` échoue si le segment web diverge de l'artefact généré) +
  marqueur explicite dans `globals.css` (seul changement dans `apps/web` :
  un commentaire CSS inerte). **Sens du flux verrouillé : JSON → codegen →
  CSS web + thème RN** (vigilance D-021 close).
- **Bug CI latent corrigé (1 ligne, préexistant)** : `ci.yml` exécutait
  `npm run packages:lint -- --max-warnings 0` → à travers le double saut npm,
  le flag était absorbé et le `0` résiduel devenait un motif de fichier →
  exit 2. Introduit en Phase 2.1, jamais poussé (origin antérieur), reproduit
  puis corrigé en `npm run packages:lint` — la politique « lint bloquant »
  reste portée par le script de CHAQUE paquet (4 invocations vérifiées).
- **Preuves** : packages tsc/lint/test = 0/0 écart, **137/137 tests**
  (57+26+39+15) ; **web intact** : tsc EXIT=0 + **4071/4071 tests** (preuve
  rejouée après lockfile ET après marqueur). Coût : 0 $.
- **Arbitrages à venir consignés** : B (granularité du registre de blocs,
  avant 3.3) · C (alignement du corpus + budget ré-émission, avant Phase 4).

## 2026-08-28 — BANC E2E EXÉCUTÉ → D-022 : Maestro retenu

- **Banc `E2E-mobile.md` exécuté sans dérogation** : Maestro 2.9.0 vs Detox
  20.51.4, sur une copie de la coquille P-003 **retenue** (StyleSheet + tokens,
  D-021), `fixture-core` non dérivée, **un seul binaire par plateforme partagé
  par les deux outils** (Release, New Architecture), flows de sémantique
  strictement identique, même horloge.
- **Résultats : 80/80 runs réussis** — 20/20 par outil et par plateforme, iOS
  et Android, **aucun flake**. Vitesse médiane (mur) : Maestro 30,4 s (iOS) /
  24,8 s (Android) · Detox 24,0 s / 12,6 s. **RTL : PASS pour les deux, flow
  inchangé.** Générabilité depuis l'AIR : générateur trivial de **7 LOC des
  deux côtés** (Maestro émet des **données** YAML, Detox du **code** JS).
  Diagnostic d'échec : Maestro produit **automatiquement** capture + hiérarchie
  d'UI JSON + logs ; Detox donne la ligne fautive mais **aucun artefact par
  défaut**.
- **D-022 actée (propriétaire)** : **Maestro** retenu — décision fondée sur nos
  contraintes d'architecture (émission de données et non de code ; **zéro
  instrumentation** dans l'app livrée, là où Detox impose un APK `androidTest`
  à chaque app générée ; diagnostic exploitable mécaniquement par l'Oracle et
  la Repair Loop ; dette d'intégration Expo côté Detox, plugin en `peer
  expo@^53` contre notre SDK 57). **Detox n'est pas disqualifié** : harnais
  versionné et rejouable, seuil de réexamen consigné.
- **Réversibilité préservée** : l'Oracle ne dépend que de l'interface
  « générer un flow depuis l'AIR → exécuter → interpréter le verdict » ; aucun
  couplage de l'AIR, des contrats, des blocs ou du compilateur à la syntaxe
  d'un outil E2E ; les `testID` sont un attribut RN standard consommé
  identiquement par les deux outils.
- **Écart consigné, NON corrigé** : assertions `loading`/`empty` hors de portée
  de la fixture (pas de `testID` sur l'indicateur de chargement, pas d'état
  `empty`). Non bloquant : la couverture est déjà exigée par les critères de
  sortie de la **Phase 3** sur les vrais blocs.
- **Artefacts versionnés** : `benchmarks/e2e/` (flows, 80 journaux de run,
  résultats JSONL, captures RTL, artefacts d'échec, générateurs, scripts,
  `synthese-E2E.md`). **Coût : 0 $.**
- **Conséquence ROADMAP** : tous les bancs de Phase 1 exécutables sans
  prérequis propriétaire sont **faits** ; **la Phase 3 est ouvrable**.

## 2026-08-27 — P-003 TRANCHÉ (D-021) : StyleSheet + tokens maison

- **Arbitrage propriétaire** sur dossier complet (banc 4 candidats, revue de
  paysage, extension à 6 candidats, arbitrage technique des 3 finalistes).
- **Choix : `StyleSheet` + tokens maison.** 2ᵉ Restyle (repli documenté avec
  seuil de réexamen), 3ᵉ Uniwind libre (veille). Consigné en **D-021** avec
  mesures, raisons, risques, mitigations, exclusions motivées et invariants
  d'architecture à préserver en Phase 3.
- **Vérification de réversibilité exécutée** (aucune modification) : le moteur
  versionné (`packages/air-schema`, `packages/capability-registry`) ne
  contient **aucune occurrence** d'une bibliothèque de styling ; l'AIR ne
  porte que des **références** (`design.theme` = nom, `tokensVersion` =
  semver, blocs = `blockType` + props génériques), aucune valeur visuelle ni
  concept de moteur ; étanchéité contractuelle prouvée 6/6 au banc.
- **Point de vigilance consigné (non corrigé, Phase 3)** : la **source de
  tokens JSON unique n'existe pas encore** hors fixture de banc — les tokens
  web vivent aujourd'hui dans `apps/web/src/app/globals.css`. Le critère de
  sortie de la Phase 3 l'exige déjà (« tokens compilés web+RN depuis la
  source JSON unique ») : le sens du flux doit être JSON → codegen → CSS web
  + thème RN, jamais l'inverse.
- **Conséquence ROADMAP** : dépendances de la **Phase 3 satisfaites**.
  Prochaine étape autorisée : **banc E2E mobile (Maestro vs Detox)**, dernier
  banc de Phase 1 exécutable, sur la même fixture. Aucun push.

## 2026-08-27 (soir) — P-003 ÉTENDU À 6 CANDIDATS (mesures, aucune décision)

- **Revue de paysage indépendante** (sources primaires : npm, GitHub, docs
  officielles, doc Expo, State of React Native 2025) → deux candidats
  sérieux non bancés identifiés : **Shopify Restyle** (famille « styles typés
  par tokens », absente du panel) et **Uniwind** (utility-first, 481 k dl/sem.,
  cité par la doc Expo, concurrent direct de NativeWind).
- **Écartés avec motif** : `react-native-css`/NativeWind v5 (v5 en *preview* —
  asymétrie de maturité, famille déjà représentée 2×), React Strict DOM +
  StyleX (autre catégorie : modèle de programmation, npm 0.0.55, réserves
  natives du mainteneur), Dripsy (dernier commit 2024-10), styled-components
  (maintenance mode déclaré 2025-03-17), twrnc/Emotion/Zephyr (dominés).
- **Ajout au banc SANS modification du protocole** : mêmes fixture, contrats,
  tokens (thème Uniwind **généré** depuis `tokens.json`), données, écrans,
  runner, appareils, Release, New Arch, GPU host, métriques. Les 4 mesures
  initiales n'ont pas été rejouées. Audit de conformité exécuté AVANT mesures :
  vert (tsc symétrique 6/6, méthode de poids revalidée sur la référence à
  l'unité près : 1436 Ko).
- **Résultats** : RTL **6/6** · New Arch **6/6** · étanchéité **6/6** ·
  0 frame > 34 ms partout · **restyle = plus faible coût d'adoption du banc**
  (+20 Ko bundle JS, +16 Ko .app, +12 Ko APK, aucun module natif) ·
  **uniwind = DX la plus concise** (83 LOC) et TTI/scroll de tête ·
  bascules de thème : restyle 4 frames, uniwind 4-5 frames (vs 2 pour
  stylesheet/unistyles/nativewind, 10 pour tamagui).
- **Découverte de méthode consignée** : dispersion inter-runs du TTI de
  ±37 % (3 observations par nouveau candidat) → **le TTI ne discrimine rien
  sous ~30 ms d'écart** ; la bascule de thème est la mesure de perf stable.
- **Réserves consignées, non corrigées** : Tamagui bancé avec le KIT
  (`tamagui`) et non `@tamagui/core` → son poids n'est pas concluant ;
  NativeWind embarque `reanimated` ; Uniwind bancé en moteur LIBRE seulement
  (moteur C++ « Pro » payant, licence CI/CD requise en pipeline → non mesuré).
- **Aucune décision P-003 prise. Aucun push. Protocole inchangé.**

## 2026-08-27 — Environnement P-003/E2E PROVISIONNÉ et AUDITÉ (option A, $0)

- **Option A retenue après analyse comparative** (consignée en session) :
  l'option B (appareils+EAS) était techniquement incapable d'exécuter le
  comparatif E2E protocolé (Detox ne supporte pas les appareils iOS
  physiques) ; l'option A est conforme mot pour mot aux deux protocoles.
- **Provisionné et PROUVÉ** : Xcode 26.6 (17F113) + runtime iOS 26.5 +
  simulateur iPhone 17 Pro (**boot réel 24 s**, shutdown propre) ·
  Android Studio 2026.1.3.8 arm64 + SDK android-36 + platform-tools +
  émulateur + AVD `bench_pixel` google_apis arm64 (**boot réel 38 s,
  Android 16**) · CocoaPods 1.17.0 (Homebrew arm64) · applesimutils
  0.9.12 (tap wix, confiance LIMITÉE à la formule) · Maestro 2.9.0 (JVM =
  JBR OpenJDK 25 injectée à l'invocation, aucune config système) · Node
  24.16/npm 11.13 · 283 Go libres.
- **Découvertes consignées** : Homebrew Intel préexistant CASSÉ (Bad CPU
  type, sans Rosetta) → remplacé par Homebrew arm64 (propriétaire) ;
  `mas` v7 exige sudo (voie App Store CLI fermée) ; Xcode/licences/brew
  installés par le propriétaire (droits admin), le reste en autonomie.
- **Audit final 12 points : 🟢 PRÊT** — P-003 et E2E exécutables SANS
  dérogation ; discipline de mesure consignée : GPU MATÉRIEL pour les
  runs de perf (le smoke test utilisait swiftshader), cold boot épinglé,
  valeurs comparatives jamais absolues. Dépôt resté intact pendant tout
  le provisionnement ($0, aucun compte créé).

## 2026-08-27 — 2.5 : REGISTRE v1 GELÉ (D-020) — PHASE 2 TERMINÉE

- **Gel exécuté sur décisions propriétaire** (après double confrontation
  technique) : `CAPABILITY_REGISTRY_VERSION` **0.1.0 → 1.0.0**, les 15
  contrats passés en 1.0.0, cliquet verrouillé (version + liste exacte +
  versions de contrats) ; `push_notifications` clarifiée (push distant ET
  notifications locales programmées).
- **D-020 consignée** : les 15 capabilities gelées (`biometrics`
  CONSERVÉE — l'inférence « 0/12 usage corpus → inutile » est déclarée
  INVALIDE, biais circulaire démontré) ; critère d'inclusion v2 (digue
  anti-inflation) ; candidates tier B HORS registre (documents,
  audio/micro, background_fetch, contacts ; passkeys = future évolution
  d'`auth`) ; défauts tiers (PostHog, RevenueCat, Stripe) révisables au
  lock ; gel = CONTRATS, catalogue extensible par la porte consciente ;
  items de surveillance (empreinte `auth`, versions par défaut, demande
  hors-allowlist non mesurée).
- **Preuves** : 122/122 tests paquets verts (nouveau cliquet de version
  compris), tsc/lint 0, corpus 12/12 AIR toujours valides (39 tests),
  aucun changement parasite au diff.
- **PHASE 2 TERMINÉE** — critères de sortie tous satisfaits : round-trip
  100 % conforme ✓ (et 12/12 identiques via D-019) · migrations testées ✓ ·
  registre gelé v1 ✓ · revue propriétaire ✓. Phase 3 NON ouverte
  (dépendances : Phase 2 ✓ + P-003 tranché — banc bloqué sur prérequis).

## 2026-08-27 — 2.4-H : GÉNÉRALISATION DÉMONTRÉE SUR ARTEFACTS EXISTANTS
## ($0) — la « densité » était un PROXY ; vrai discriminant : blocs armés

- **Audit gratuit de généralisation** (exigé par le propriétaire avant
  toute dépense — il a eu raison : le test payant proposé à $0,40 était
  INUTILE).
- **Découverte** : le discriminant réel des 12 documents n'est PAS la
  densité de props mais la présence de **blocs « armés »** (props ET
  entityId dans le même bloc — la configuration où la fourche du piège
  existe) : les 7 documents fautifs en ont 14-19 chacun ; les 5 documents
  qui réussissent en ont **ZÉRO** (séparation 12/12, aucune exception).
  `suivi-chantier` (le plus gros, 33 blocs) réussit car ses blocs portent
  soit props, soit entityId, jamais les deux. La corrélation de densité
  était un proxy (les blocs armés sont aussi les plus riches en props).
- **Signatures du mécanisme vérifiées dans les émissions v1 des 7
  documents** (ordre d'émission préservé dans les dumps) : 17/17 blocs
  émis suivent l'ordre du schéma ; classification exhaustive : 9 INTACT ·
  7 PIÈGE-ENTITYID (props supprimées, entityId présent — la porte du
  piège) · 1 CLÔTURE-TERMINALE · **0 contre-signature**. Témoin réussi :
  33/33 blocs intacts, ordres (id,blockType,entityId) ou
  (id,blockType,props) — un seul optionnel par bloc, pas de fourche.
- **Verdict : 🟢 GÉNÉRALISATION DÉMONTRÉE À PARTIR DES ARTEFACTS
  EXISTANTS** — préconditions présentes dans les 7 échecs, absentes des
  5 succès, signatures conformes partout, aucune contre-preuve (ni
  document armé qui réussit, ni document désarmé qui échoue).
- Cause racine 2.4-H désormais complète : fourche ordre×optionalité sur
  blocs armés (X1-X4 : preuve d'intervention ; cet audit : préconditions
  et signatures sur les 12 documents). AUCUNE correction appliquée —
  décision propriétaire attendue pour le cycle de correction D-018.

## 2026-08-27 — 2.4-H : audit gratuit exhaustif — CAUSE RACINE NON DÉMONTRÉE,
## faits décisifs établis, confusion densité×présentation identifiée

- **Correction d'une affirmation antérieure (D-018 §7)** : « les préfixes
  v1 étaient verbatim » ne tenait qu'au niveau des IDS — au niveau
  canonique complet, les blocs conservés par v1 sont EUX AUSSI dégradés
  (1/2 à 3/4 intacts) : props supprimées dès le 2ᵉ bloc.
- **Faits établis (artefacts versionnés)** : (F1) les 4 sections rendues
  en JSON inline (base/données/comportement/câblage) passent **48/48 au
  premier essai** en v2, sorties jusqu'à 4 856 tokens — sous le même
  système structured outputs ; (F2) seuls les BLOCS D'ÉCRANS — uniques
  éléments du rendu décomposés en prose (`type`/`entité`/props JSON
  imbriqué) — se dégradent : props supprimées, clôtures précoces, champs
  optionnels INVENTÉS avec chaînes corrompues ; (F3) sans grammaire, la
  reconstruction prose→JSON est complète et fidèle (champ nommé `type`) ;
  (F4) les chaînes corrompues contiennent des fragments du vocabulaire
  d'instruction (« placeholder_removed », « corrig ») — artefacts de
  déraillement, pas du contenu ; (F5) les params d'actions sont LÉGERS
  (max 3-7 pairs) — la comparaison actions/blocs ne peut PAS départager
  densité et présentation ; (F6) densité et présentation-prose sont
  CONFONDUES dans toutes les données existantes : tous les tableaux de
  pairs denses vivent dans des blocs, seuls éléments en prose.
- **Conséquence** : aucune donnée gratuite ne peut séparer « densité »
  de « présentation prose » — batterie discriminante C1-C3 spécifiée
  (rendu des blocs en JSON inline à densité CONSTANTE = isolation causale
  propre ; labels alignés ; ordre du schéma), ~$0,40-0,60, EN ATTENTE
  d'autorisation. Verdict au standard 100 % : CAUSE RACINE NON DÉMONTRÉE.

## 2026-08-27 — 2.4-H : campagne réelle v2 (12 rejeux) — 5/12 identiques,
## 7 refus fail-closed reproductibles, causes candidates éliminées

- **12 rejeux réels** avec le moteur v2 validé à blanc ($8,94 réel vs
  $13-18 devisés — les refus émettent peu ; 80 appels, 9 retries contenu,
  0 erreur API, 0 refus classifieur).
- **5/12 identiques** — contre-vérification indépendante : re-parse,
  0 diagnostic, hash ET forme canonique à l'octet — exactement les 5
  succès v1 : **non-régression confirmée**.
- **7/12 REFUSÉS fail-closed** (`SECTION_COUNT`) : sous-émission des blocs
  d'un écran précis (1-3 émis sur 5-9 attendus, sorties de 110-231
  tokens), y compris en appel MONO-ÉCRAN avec contrat de comptes
  explicite et retry. **Reproductible** : les MÊMES 7 documents échouent
  en campagne, rejeu v1 et rejeu v2 — deux granularités, trois prompts.
- **Causes éliminées [mesuré]** : longueur de sortie (écrans fautifs =
  2-3,5 k chars ≈ 650-1000 tokens), dérive d'identifiants (18/19 sections
  identiques dans les dumps v1), échantillonnage aléatoire
  (reproductibilité parfaite), consigne (trois variantes sans effet),
  marqueurs d'abrègement dans le corpus (aucun), structure du rendu
  (lignes saines vérifiées).
- **Cause résiduelle** : comportement document-spécifique du modèle sur
  certains écrans — mécanisme exact à établir par SONDE INSTRUMENTÉE
  (conservation du contenu brut des émissions refusées, ~$0,3-0,5,
  accord propriétaire requis avant toute dépense).
- Les gardes v2 ont tenu à 100 % : aucun document partiel ou divergent
  n'est jamais sorti du moteur.

## 2026-08-27 — 2.4-H : fix v2 construit et VALIDÉ À BLANC ($0 API)

- **Moteur de transcription v2** (`benchmarks/air-emission/transcribe-lib.mjs`,
  transport injectable — aucun SDK importé par la simulation) : écrans
  transcrits UN PAR UN ; **comptes attendus extraits du RENDU lui-même**
  (jamais de l'AIR original — round-trip honnête) ; contrôles déterministes
  de complétude (comptes de sections, blocs par écran, champs par entité,
  routes, ordre et identité des écrans) ; retry borné par appel ; **refus
  fail-closed** — aucune sortie incomplète/incohérente ne produit de
  document, jamais d'assemblage partiel.
- **Simulation à blanc** (`simulate-fix-v2.mjs`, node:assert, 2 runs) :
  **25 scénarios PASS** — non-régression : transport honnête ⇒ **12/12 AIR
  du corpus identiques au hash** (ordre des écrans préservé, plan d'appels
  4+N vérifié) · défaillances TOUTES refusées : écran tronqué (mode observé
  en campagne), actions/routes/champs tronqués schema-valides, échange
  d'écrans, en-tête ≠ détail, clé étrangère, panne persistante, référence
  sémantique cassée · pannes transitoires récupérées par retry ·
  comptes du parseur exacts sur les 12 rendus.
- **Limite résiduelle consignée** : une divergence de CONTENU à comptes
  égaux (ex. props altérées) n'est pas refusée par les comptes — elle est
  détectée par la comparaison de hash du banc ; en production, l'AIR stocké
  reste la source de vérité (jamais reconstruit depuis du texte).
- **Reste non simulable** (vrai appel requis) : comportement réel du modèle
  sur sorties courtes par écran, acceptation de la grammaire par écran,
  refus/cache/coûts. Test réel : 8 rejeux ≈ **$7-10** — EN ATTENTE de
  l'accord propriétaire explicite.

## 2026-08-27 — 2.4-H : rejeu 8/8, cause des round-trips non identiques
## CONFIRMÉE par dumps instrumentés

- **Rejeu approuvé exécuté** (7 échecs + témoin, depuis le corpus
  versionné, AUCUNE ré-émission ; coût réel $6,09 vs 4-6 annoncés).
- **Témoin (`suivi-chantier`) : identique, 0 diagnostic** — aucune
  régression ; le rendu texte reste prouvé sans perte (round-trip parfait
  sur un document de 33 blocs).
- **Les 7 échecs rejouent tous** avec une signature 100 % uniforme :
  **18/19 sections canoniquement IDENTIQUES** ; seule `screens` diffère —
  **tronquée à 1 écran sur 4** (2-4 blocs sur 20-31), JSON complet et
  schema-valide ⇒ clôture volontaire des tableaux longs par le modèle
  (sections ≥ ~8 k caractères), et non une coupe max_tokens (qui aurait
  produit du JSON invalide).
- **Hypothèses infirmées [mesuré]** : (a) `temperature` est DÉPRÉCIÉ et
  refusé (400) sur claude-opus-5 — le levier d'échantillonnage n'existe
  plus sur la famille Claude 5 ; (b) l'ancrage renforcé des identifiants
  est sans effet — les identifiants n'étaient pas le problème (aucune
  dérive d'ids dans les dumps).
- **Cause racine consignée** : troncature schema-valide des sorties
  longues en transcription. Leçon d'architecture : borner la taille de
  sortie par appel LLM ; une sortie structurée peut être VALIDE et
  INCOMPLÈTE — seule la vérification déterministe de complétude protège.
- **Fix v2 proposé (en attente d'arbitrage)** : transcription des écrans
  UN PAR UN + ancrage des comptes ("EXACTEMENT N écrans, M blocs") +
  contrôle déterministe de complétude ; re-test 7+1 estimé ~$7-9.

## 2026-08-27 — étape 2.4 TERMINÉE : campagne d'émission complète + corpus

- **Campagne complète** (12 intentions, 3 classes commerce, ~$19,71 sur le
  budget propriétaire de 20 $, journal JSONL versionné) :
  - **12/12 AIR valides** — émission par sections + réparation bornée
    (≤ 1 passe) : 14-32 diagnostics en 1ʳᵉ passe → **0 partout** ; classes
    commerce toutes correctement émises (digital ⇒ IAP, physique ⇒ PSP) ;
    0 refus classifieur sur 12 intentions (D-015 : signal rassurant,
    corpus non représentatif du taux réel).
  - **Round-trip** (AIR → rendu texte → re-transcription) : **12/12
    conformes au schéma strict** — le critère de sortie de phase
    « 100 % conforme au schéma sur le corpus » est SATISFAIT ; **identité
    stricte au hash canonique : 5/12** [mesuré]. Motif binaire : 0
    diagnostic (et alors hash identique) ou cassure franche (14-37
    diagnostics), sans corrélation avec la taille du document.
  - **Golden corpus démarré : 12 AIR de 12 domaines distincts** versionnés
    dans `packages/golden-corpus/corpus/`, validés en CI SANS réseau
    (39 tests : schéma + sémantique + registre + unicité + 3 classes
    commerce). Total paquets : **121 tests verts**, lint 0, tsc 0.
- **Limitation consignée (non bloquante pour 2.5)** : 7/12 transcriptions
  sémantiquement cassées ; outil de diagnostic instrumenté prêt
  (`replay-roundtrip.mjs`, dump du transcrit + diagnostics) mais non
  exécuté — budget épuisé ($0,29 restants ; ~$0,5-1/rejeu).
- Critères ROADMAP de l'étape : émission structured outputs ✓ ·
  round-trip 100 % conforme ✓ · corpus ≥ 10 domaines variés ✓ →
  **2.4 close**. Reste 2.5 (gel v1 + revue propriétaire) pour clore la
  Phase 2.

## 2026-08-27 — étape 2.4 (EN COURS) : harnais d'émission structured outputs
## + contraintes API mesurées → évolution AIR v1

- **Contraintes structured outputs [mesuré]** (sondes versionnées,
  `benchmarks/air-emission/`) : objets FERMÉS uniquement
  (`additionalProperties: false` exigé, `patternProperties` refusé),
  `oneOf` refusé, bornes numériques refusées, ≤ 24 paramètres optionnels
  par schéma, grammaire compilée du document AIR ENTIER trop large (même
  avec `$defs` ; chaque section seule passe).
- **Évolution AIR v1 en conséquence** (arbitrage technique, critère de
  sortie Phase 2 = émission structured outputs) : textes localisés
  `[{locale, text}]` et configurations `[{key, value}]` en TABLEAUX DE
  PAIRES FERMÉS (fini les records à clés libres) ; nouveaux diagnostics
  AIR_L10N_DUP_LOCALE, AIR_CONFIG_DUP_KEY. 57 tests air-schema verts.
- **Rendu texte déterministe sans perte** (`renderAirToText`) : chaque
  champ de l'AIR rendu avec sa valeur exacte — maillon du round-trip.
- **Harnais complet** `benchmarks/air-emission/` : 12 intentions fixes
  (3 classes commerce), **émission par sections** (5 groupes sondés
  acceptés : base → données → écrans → comportement → câblage, assemblage
  déterministe), validation locale fail-closed (schéma + sémantique +
  registre), réparation BORNÉE ciblée, round-trip par hash canonique,
  journal JSONL, prompt-cache sur le système.
- **Preuve de bout en bout** (journal versionné) : intention 1
  (`resto-quartier`) — 21 diagnostics en 1ʳᵉ passe → **0 après la
  réparation bornée** ; AIR complet valide, classe commerce correcte.
- **CAMPAGNE INTERROMPUE : crédits API Anthropic épuisés** (~$1.15
  consommés). Prérequis propriétaire : recharger le compte de la clé
  `apps/web/.env.local` (~10-20 $ estimés pour la campagne complète).
  Paquet `@deribfy/golden-corpus` prêt (garde bootstrap : la suite CI
  s'active au premier AIR versionné).

## 2026-08-27 — étape 2.3 : paquet `@deribfy/capability-registry`

- **Registre fermé des 15 capabilities cœur v1** (analytics, auth,
  barcode_scan, biometrics, calendar, camera, deep_links, geolocation,
  maps, media_upload, offline_storage, payments.iap, payments.psp,
  push_notifications, share) — chaque entrée porte les 17 champs
  d'ARCHITECTURE §2 (implémentation, dépendances, plateformes, profils de
  runtime, config native, permissions induites avec clé i18n, coût,
  empreinte native, OTA/rebuild, classe commerce, contraintes, conflits,
  provenance, empreinte de build). Registre **v0.1.0 NON GELÉ** — le gel
  en 1.0.0 intervient à l'étape 2.5 (revue propriétaire, décision
  produit).
- **API allowlist positive** : référence inconnue = refus net ; fermeture
  transitive des dépendances ; **empreinte native CALCULÉE sur la
  fermeture** (autorité du futur Capability Router — barcode_scan seul ⇒
  heavy via camera, prouvé) ; permissions induites agrégées avec
  provenance ; conflits (PSP ↔ IAP mutuellement exclusifs) ; contrainte
  de classe commerce (digital ⇒ IAP, physical_or_offapp ⇒ PSP).
- **Pont AIR ↔ registre** (`validateAirCapabilities`) : capability
  inconnue, conflit, classe commerce incompatible, permission induite non
  déclarée dans l'AIR — diagnostics déterministes triés.
- **Cliquets de registre** : liste v1 EXACTE verrouillée (toute évolution
  = édition consciente du cliquet), invariants OTA ⇔ impact ⇔ rebuild ⇔
  profils, dépendances existantes et acycliques, conflits symétriques,
  permissions induites ⊆ config native, contrainte commerce ⇔ capability
  de paiement.
- **Preuves** : tsc EXIT=0 · lint BLOQUANT 0 écart · 25/25 tests ·
  scripts racine et CI couvrent les deux paquets · web intact après
  changement de lockfile : tsc EXIT=0, 221 fichiers / 4071 tests verts.

## 2026-08-27 — PHASE 2 OUVERTE · étape 2.1 : paquet `@deribfy/air-schema`

- Ouverture autorisée par le propriétaire ; dépendances ROADMAP satisfaites
  (Phase 0 close, « Phase 1 non bloquante »).
- **Premier paquet du moteur** : `packages/air-schema` — schémas zod AIR v1
  (identités stables préfixées `scr_/ent_/act_/…`, effets d'actions FERMÉS
  — capability/slot/navigate/mutation, jamais de code arbitraire —, réseau
  `deny_by_default`, quatre réalités de locales, classe commerce),
  `project.lock` volontairement SANS horodatage (même AIR + même train ⇒
  même lock), `deployment state` (état observé, horodaté) ; **validateur
  sémantique déterministe** (unicité globale des ids, cohérence
  référentielle complète, capability = allowlist positive, clés de config
  à l'allure de secret REFUSÉES, digital ⇒ PSP interdit, couverture de la
  locale par défaut, sortie triée) ; JSON canonique + SHA-256 ; projection
  JSON Schema draft 2020-12 stricte pour structured outputs.
- **Preuves** : tsc EXIT=0 · lint BLOQUANT 0 écart (strictTypeChecked) ·
  42/42 tests · scripts racine `packages:*` · **CI étendue** : 3 étapes
  paquets ajoutées au Gate bloquant · non-régression web après changement
  de lockfile : tsc EXIT=0, 221 fichiers / 4071 tests verts.

## 2026-08-27 — D-017 complétée : pilotage opérationnel

- Complément propriétaire à D-017 : Claude Code est responsable du
  pilotage opérationnel du plan (ROADMAP → état réel → prochaine étape
  autorisée → exécution si possible → rapport → étape suivante) ; jamais
  d'attente passive ni de demande de choix que la ROADMAP détermine déjà ;
  sollicitations réservées aux vrais prérequis externes et aux vraies
  décisions propriétaire. Consigné dans DECISIONS.md (D-017), MASTER_PLAN
  §5, CLAUDE.md (règle 7).
- Application immédiate du croisement ROADMAP ↔ état réel : la Phase 2
  déclare « Phase 1 non bloquante » et ne dépend que de la Phase 0
  (close) → **prochaine étape autorisée = ouverture de la Phase 2**, les
  bancs Phase 1 restants continuant en parallèle sur arrivée des
  prérequis. Le bloc PROGRESSION GLOBALE de STATUS est rectifié (l'ancien
  « aucune étape exécutable » était inexact).

## 2026-08-27 — D-017 : règle permanente de progression

- Décision propriétaire consignée (D-017) : ROADMAP = référence d'ordre
  stricte pour tous les participants ; bloc PROGRESSION GLOBALE obligatoire
  à chaque rapport important et fin d'étape, vérifié contre l'état réel ;
  règle de décision de fin d'étape en 5 points ; contestation explicite de
  toute proposition hors-ROADMAP. Inscrite dans MASTER_PLAN §5 (canonique),
  relayée dans CLAUDE.md (règle 6), instanciée dans STATUS. Mise à jour
  documentaire uniquement — aucun code, aucune installation, aucun push.

## 2026-08-27 — D-016 : P-001 TRANCHÉ → Trigger.dev v4

- Arbitrage propriétaire sur le dossier comparatif complet (trois candidats
  à 5/5 en campagnes officielles). Décision consignée dans `DECISIONS.md`
  (D-016) avec : tableau des épreuves, distinction mesures du banc vs
  propriétés intrinsèques, coûts et hypothèses (grilles du 2026-08-27),
  risques et mitigations exigées (abstraction provider obligatoire,
  auto-hébergement = chemin de sortie, seuil de réexamen ~10k gén./mois,
  moindre privilège des secrets, source de vérité métier dans NOTRE
  Postgres).
- Périmètre strictement respecté : P-002 non commencé, générateur non
  commencé, aucun push.

## 2026-08-27 — P-001 : campagne (c) Trigger.dev 5/5 — comparaison COMPLÈTE

- Candidat (c) exécuté sur le **cloud managé** Trigger.dev (v4, version
  déployée `20260827.1`, projet de test ; clés hors dépôt). Péripéties
  consignées : plateforme v4 (CLI v3 aveugle), coquille de ref détectée via
  l'API et corrigée localement.
- **5/5 épreuves officielles** : E1 redélivrance **2 s** après mort du
  processus (backoff 1 s) · E2 **101 s** (dédup 6 démarrages/12 envois) ·
  E3 annulation propre · E4 exactement 2 tentatives · E5 fenêtre différée
  prouvée vide (équivalence documentée — runtime managée).
- **Les trois candidats sont à 5/5.** Coûts estimés au volume protocole
  (1 000 générations/mois) sur les grilles publiques du 2026-08-27 :
  (a) ≈ 10-45 $/mois d'infra fixe à notre charge · (b) 0 $ en Hobby mais
  **5 steps concurrents** — réalistement 99 $/mois Pro + workers ·
  (c) ≈ 0-10 $/mois à ce volume (compute à la seconde, attentes > 5 s
  checkpointées non facturées). Modèle proxy = pipeline du banc, qualifié.
- **Décision P-001 : arbitrage propriétaire sur dossier complet** — à
  consigner dans `DECISIONS.md` avec les mesures.

## 2026-08-27 — P-001 : campagne officielle du candidat (b) Inngest — 5/5

- Compte Inngest de test fourni ; clés **hors dépôt**
  (`~/.deribfy-inngest-test.env`, 600). Adaptateur en mode **connect**
  (worker sortant, sans URL publique), enregistrement d'app vérifié,
  `INNGEST_DEV` refusé.
- **5/5 épreuves officielles** — mêmes charge/épreuves/journal que (a) :
  E1 redélivrance cloud **157 s** après kill -9, mémoïsation prouvée ·
  E2 déduplication par id d'événement (6 démarrages/12 envois), **160 s**
  (parallélisme natif ; (a) : 342 s à 2 workers) · E3 `cancelOn` propre ·
  E4 exactement 2 tentatives (`retries: 1` + `onFailure`) · E5 durabilité
  prouvée (fenêtre vide sans worker connecté).
- Comparatif partiel (a)/(b) disponible ; **décision P-001 toujours
  ouverte** : (c) Trigger.dev prévu par le protocole — comparaison sur
  compte, ou arbitrage propriétaire explicite consigné en dérogation.

## 2026-08-27 — P-001 : campagne officielle du candidat (a) — 5/5

- Base de test `deribfy-mobile-test` provisionnée par le propriétaire ;
  `DATABASE_URL` fourni **hors dépôt** (`~/.deribfy-mobile-test.env`, 600,
  jamais versionné). Preflight de cible : hôte pooler session, user du
  projet de test, ≠ production — vérifié avant toute écriture.
- **Campagne 1 : 4/5** — analyse post-hoc en base : E2 était un **faux
  négatif du harnais** (timeout 600 s < somme des durées ; au fond : 6/6
  `done`, 30/30 artefacts, 0 dupliqué) + **fuite d'un worker** invalidant
  la fenêtre d'E5. Défauts du harnais, pas du candidat.
- **Harnais v2** : workers tués en `finally`, timeout E2 calculé depuis les
  durées déterministes, isolation/purge entre épreuves, fenêtre E5 prouvée
  vide, exit code capturé.
- **Campagne 2 (OFFICIELLE) : 5/5 épreuves éliminatoires réussies** —
  E1 215 s (redélivrance kill -9, 0 doublon) · E2 342 s (budget 471 s,
  idempotence totale) · E3 50 s · E4 27 s (borne exacte) · E5 226 s
  (durabilité prouvée). Journaux des DEUX campagnes versionnés.
- **Aucune décision P-001 prise** — en attente : comparaison (b)/(c) ou
  arbitrage propriétaire sur la suffisance de (a).

## 2026-08-27 — D-015 actée · harnais P-001 préparé

- **D-015 (propriétaire)** : résilience aux refus LLM — gestion explicite de
  `stop_reason: refusal` sur tout chemin LLM, zéro panne silencieuse,
  fallbacks de l'architecture mobilisables, taux de refus = métrique du
  Budget Governor. Consignée comme décision de RÉSILIENCE : le n=10 du banc
  prouve l'existence du phénomène, la fréquence réelle reste [à mesurer]
  sur corpus représentatif.
- **P-001 préparé** : harnais complet du candidat (a) pgmq + machine à
  états + workers (`benchmarks/orchestration/` — setup rejouable avec garde
  anti-base-de-production, worker à arrêt propre, 5 épreuves du protocole
  scriptées avec verdicts stricts et journal JSONL, driver installé,
  syntaxe validée, garde `DATABASE_URL` fail-closed vérifiée). Exécution
  en attente du prérequis : Postgres de test jetable avec pgmq. Adaptateurs
  (b) Inngest / (c) Trigger.dev : à la réception des comptes.
- P-002 : préparation des adaptateurs à la réception des comptes sandbox —
  aucun contournement des prérequis.

## 2026-08-27 — PHASE 0 TERMINÉE · PHASE 1 OUVERTE

- **Phase 0 close sur preuves complètes.** Dernier critère satisfait : CI
  GitHub réelle **verte** — run **#32** sur `54ef2a1`, `success` (3 min 01),
  vérifié par capture du propriétaire ET confirmation indépendante via
  l'API Actions. Push de la branche autorisé et effectué
  (`61cec23..54ef2a1`, 9 commits). Root Directory Vercel réglé sur
  `apps/web` par le propriétaire avant push (risque D-014 levé).
- **Phase 1 (bancs de mesure) ouverte.** Protocoles définis AVANT toute
  mesure (`docs/mobile-generation/benchmarks/`) pour : P-001 orchestration,
  P-002 sandbox, P-003 styling RN, E2E mobile, coûts unitaires. Premier
  banc exécuté : coûts LLM avec/sans prompt caching (résultats sous
  `benchmarks/llm-cost/`). Les bancs nécessitant des comptes externes
  (E2B/Modal/Fly, Inngest, EAS, Management API Supabase) sont **bloqués
  sur prérequis propriétaire**, listés dans STATUS.
- Aucun code du générateur. Aucune décision P-00x transformée en décision
  théorique.

## 2026-08-27 — D-014 : monorepo à workspaces en place

- **P-005 tranché par le propriétaire → D-014** : monorepo à workspaces.
- Migration exécutée (`5200cac`) : l'app web déplacée EN BLOC dans
  `apps/web/` (702 renames git à 100 %, historique préservé, **zéro fichier
  de code/cliquet/script modifié** — couplages de chemins tous relatifs au
  paquet, vérifié avant migration) ; racine = workspace `deribfy`
  (`apps/*`, `packages/*`) ; `packages/` vide par conception (aucun code
  moteur avant Phases 2+) ; `.gitignore` étendu ; lockfile workspace unique.
- **Parité prouvée après migration** : tsc EXIT=0 · 221 fichiers /
  4071 tests, 0 échec (compte identique) · `next build` EXIT=0 ·
  `check-api-docs` 73/73 · cliquets d'architecture verts.
- CI adaptée aux workspaces (install racine, étapes dans `apps/web`, gate
  inchangé) — verte à confirmer au premier run distant.
- ⚠️ Opération requise avant tout déploiement : **Root Directory Vercel →
  `apps/web`**.
- Phase 0 : toutes les sous-étapes locales terminées ; critère restant =
  CI verte sur run réel (push sur accord).

## 2026-08-27 — Plan v0.1 VALIDÉ · ouverture de la Phase 0

- **Validation officielle du propriétaire** : le plan v0.1 est FIGÉ ; toute
  évolution passe désormais par une soumission explicite + `DECISIONS.md`.
- **Règle de continuité inscrite en permanence dans `CLAUDE.md`** (source de
  vérité = `docs/mobile-generation/`, lecture obligatoire en début de
  session, pas de modification silencieuse du plan, pas de saut de phase).
- **Phase 0 ouverte.** Première sous-étape technique livrée :
  `@anthropic-ai/sdk` **0.99.0 → 0.121.0** — re-baseline complet vert
  (tsc EXIT=0 ; 221 fichiers / 4071 tests ; `next build` EXIT=0 ; aucun
  code applicatif modifié).
- **Bloqué en attente d'arbitrage propriétaire : P-005** (monorepo à
  workspaces — recommandé — vs dépôt séparé) ; bloque workspaces + CI lanes.

## 2026-08-27 — v0.1 : création du centre de contrôle

- Confrontation architecturale terminée (mandat multi-IA + rapport Claude
  Code A-H confronté au dépôt réel) ; convergence actée par le propriétaire.
- Création de `docs/mobile-generation/` : `MASTER_PLAN.md` (21
  non-négociables, gouvernance), `ARCHITECTURE.md` (référence
  d'implémentation, 29 sections), `ROADMAP.md` (15 phases avec critères
  d'entrée/sortie), `STATUS.md` (tableau de bord), `DECISIONS.md`
  (D-001→D-013 actées ; P-001→P-006 en attente), présent fichier.
- Statut : **v0.1 EN ATTENTE DE VALIDATION** — aucune implémentation du
  générateur avant validation explicite.
