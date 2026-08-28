# STATUS — TABLEAU DE BORD DU CHANTIER MOBILE GENERATION

> Mis à jour à chaque étape significative. Dernière mise à jour :
> **2026-08-28** (**4.2 TERMINÉE — D-027-R42** : gabarit Expo versionné
> scellé au train (lockfile pré-résolu ×2 byte-identique, npm ci ×2 arbres
> identiques 22 641 fichiers, fumée export ios+android OK) — compiler
> 34/34, packages 280/280 ; prochaine étape : **4.3 — émission
> écrans/navigation/thème**).

## ÉTAT GLOBAL

| | |
|---|---|
| Plan v0.1 | 🟢 **VALIDÉ ET FIGÉ** (propriétaire, 2026-08-27) — toute évolution passe par `DECISIONS.md` |
| Phase 0 — Fondations | 🟢 **TERMINÉE** (2026-08-27) — tous les critères de sortie vérifiés, dont **CI GitHub réelle verte : run #32, commit `54ef2a1`, `success`** (capture propriétaire + confirmation API Actions indépendante) |
| Phase actuelle | **PHASE 4 : 🔵 EN COURS** (D-026) — 4.0 🟢 · 4.1 🟢 (D-027) · 4.2 🟢 (D-027-R42) · prochaine : **4.3** · **PHASE 3 : 🟢 TERMINÉE** (2026-08-28, clôture constatée par le propriétaire avec l'arbitrage C/D-025) · **PHASE 1** : 🔵 bancs restants bloqués sur prérequis propriétaire |
| Générateur mobile | 🔵 **EN IMPLÉMENTATION** — chantier courant : compilateur déterministe v1 (Phase 4, architecture D-026) |
| Progression globale | **3/15 phases terminées (0, 2, 3)** · Phase 4 en cours (4.0 🟢 4.1 🟢 4.2 🟢 → 4.3) · Phase 1 en cours (bancs exécutables tous faits) |

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
- **Bloqué, prérequis propriétaire** : P-002 (comptes E2B/Modal/Fly/Vercel
  Sandbox + budget ~10-20 $) · coûts EAS (compte Expo/EAS) · coût projet
  Supabase (token Management API, org de test). **Phase 3 n'est plus
  bloquée** : ses deux dépendances ROADMAP sont satisfaites.
- **ARBITRAGE C RÉSOLU (D-025, 2026-08-28)** : **golden corpus v2 ÉMIS ET
  VALIDÉ 12/12** — campagne LLM réelle (mêmes 12 intentions, digests
  capabilities + SMART BLOCKS au prompt), 1 passe de réparation bornée par
  document (11-22 diagnostics → 0), 0 refus, **coût 7,42 $** (+ ~0,5 $
  d'incident de préchargement consigné) ; contre-vérification indépendante :
  **0 diagnostic aux 4 validateurs** (schéma, sémantique, capabilities,
  blocs) 12/12 · vocabulaire émis = EXACTEMENT les 6 blocs du registre
  (contre 115 types sauvages en v1) · overrides vides · ids/slugs uniques ·
  3 classes commerce · **v1 byte-identique prouvé par scellés SHA-256** ·
  63 tests CI sans réseau (`corpus-v2.test.ts`), packages 246/246.
- **PHASE 4 OUVERTE (D-026, 2026-08-28)** : feu vert propriétaire sur
  dossier d'options — **Option C hybride canonique** ; S2-S7 validés tels
  que recommandés ; **S1 navigation tranché par le micro-banc V4**, jamais
  sur papier ; lecture A3 consignée (manifestes/permissions oui,
  implémentations de capabilities non) ; release train v1 sur pins
  démontrés (Expo ~57.0 / RN 0.86.3 / React 19.2.3) ; **0 $ autorisé par
  défaut** (toute dépense = méthode arbitrage C).
- **4.0 TERMINÉE (2026-08-28)** : V2/V3/V5 🟢 prouvées avec contrôles
  positifs et négatifs · V4 🟢 exécuté → **S1 TRANCHÉ :
  `@react-navigation/native-stack`** (consigné D-026 ; mesures dans
  `benchmarks/compiler-determinism/synthese-4.0.md`) · 0 $.
- **4.1 TERMINÉE (2026-08-28, D-027)** : release train v1 `rt-2026.08`
  (contrats gelés + scellés Merkle sous cliquet, toolchain et dépendances
  gabarit aux versions prouvées) + `resolveLock` pur fail-closed —
  `@deribfy/compiler` 26/26, corpus v2 12/12 résolus, **corpus v1 12/12
  refusés** (mesure D-025 rejouée), packages 272/272, web intact (tsc 0 +
  4071/4071), 0 $.
- **4.2 TERMINÉE (2026-08-28, D-027-R42)** : gabarit versionné scellé au
  train (`templateHash` sous test de garde), lockfile pré-résolu prouvé
  (génération ×2 byte-identique ; npm ci ×2 → arbres identiques ; fumée
  export ios+android), 0 $.
- **Prochaine étape EXACTEMENT autorisée** : **4.3 — émission
  écrans/navigation/thème** (Option C : code structurel + modules
  canoniques ; ScreenShell obligatoire — contrainte 3.4 ; navigation =
  verdict S1 D-026 ; copie blocs/primitives/tokens), puis 4.4 → 4.7 dans
  l'ordre du découpage D-026. Critère dur
  inchangé : 10 compilations → hash identique 10/10 sur le **corpus ACTIF
  (v2)** ; app témoin sur émulateurs iOS et Android ; zéro appel LLM prouvé
  par instrumentation. Les bancs de Phase 1 restants (P-002, coûts EAS,
  coût projet Supabase) demeurent bloqués sur prérequis propriétaire.
- **INTERDIT à ce stade** : toute Phase 5+ (dépendances non satisfaites),
  tout saut d'étape 4.x, tout push sans accord explicite, toute
  modification des zones gelées (D-020/D-024/tokens scellés/corpus v1 et
  v2) sans décision consignée, toute décision P-00x sans les mesures
  prévues, toute réouverture de P-003 hors seuil de réexamen consigné
  (D-021).

## PHASE 4 — DÉTAIL (ouverte le 2026-08-28, D-026)

| Étape | Contenu | Statut |
|---|---|---|
| 4.0 | **Validations préalables V2-V5** (`benchmarks/compiler-determinism/`, synthèse `synthese-4.0.md`, **0 $**) — **V2 🟢** empaquetage Option C + Merkle : 20/20 hash identiques ×2 docs ×2 environnements hostiles, contrôle positif (poison détecté 20 hashes) · **V5 🟢** harnais zéro-réseau 2 couches : positif 5/5 canaux tués, négatif 12/12 docs v2 à 0 diagnostic sans déclenchement, spécificité 0/5 sans harnais, limite des instantanés d'exports MESURÉE et fermée · **V3 🟢** lockfile ×2 byte-identique, `npm ci --ignore-scripts` ×2 env → 19 666 fichiers, arbres identiques 2/2 · **V4 🟢 → S1 TRANCHÉ : `@react-navigation/native-stack`** (poids ×2,1–2,8 moindre, installation verte vs arbre npm invalide d'expo-router aux versions SDK — builds Release cassés 2/2 avant overrides manuels ; byte-stabilité 20/20 et back réel PASS pour les deux) — détail consigné dans D-026 | 🟢 **TERMINÉE** (2026-08-28) |
| 4.1 | **Release train v1 + résolveur AIR→lock** — paquet `@deribfy/compiler` (7ᵉ paquet moteur, lint-bloquant, CI) : **D-027** — train `rt-2026.08`/1.0.0 (contrats gelés 1.0.0 + **scellés Merkle des sources sous cliquet**, toolchain node 24.16.0/expo 57.0.17/RN 0.86.3, dépendances gabarit prouvées sur device au banc V4 dont screens 4.26.2) ; `resolveLock` PUR fail-closed aux 4 validateurs, sortie revalidée schéma lock 1.0.0 INCHANGÉ ; 4 lectures consignées (version capability = contrat ; tokensVersion absent→train, ≠→refus ; providers [] jusqu'à 4.5 ; intégrité bloc = scellé du train) + sous-chemin pur `@deribfy/blocks/registry` (anticipé D-025) | 🟢 **TERMINÉE** (2026-08-28) — **26/26** (v2 12/12 résolus · déterminisme rejeux+permutation · fail-closed · **v1 12/12 refusés** · scellés) ; packages 272/272 ; web intact (tsc 0 + 4071) |
| 4.2 | **Gabarit Expo versionné** (`packages/compiler/template/`, D-027-R42) — 5 fichiers sous liste exacte : package.json (deps = train, EXACTES), **package-lock.json pré-résolu** (généré ×2 byte-identique), index.ts, tsconfig, .gitignore ; identité npm FIXE (identité d'app = app.json, émis 4.4) ; SANS App/app.json (émis 4.3/4.4) ; zéro script ; **scellé `templateHash` au train sous test de garde** ; zéro install dans le chemin de compilation (le compilateur copie) | 🟢 **TERMINÉE** (2026-08-28) — preuves : npm ci ×2 → **22 641 fichiers, arbres identiques 2/2**, lockfile intact · fumée `expo export` ios+android OK · pins résolus à l'identique (CI sans réseau) · compiler 34/34 · packages 280/280 |
| 4.3 | Émission écrans/navigation/thème (Option C : code structurel + modules canoniques ; ScreenShell obligatoire — contrainte 3.4) + copie blocs/primitives/tokens | ⏳ |
| 4.4 | Manifestes/permissions/config native depuis le registre (lecture A3) | ⏳ |
| 4.5 | Fixtures déterministes (PRNG seedé `contentHash`) + interface data-provider, impl `demo` | ⏳ |
| 4.6 | Artifact Store v1 (local, SHA-256) + hash Merkle + **preuve 12 docs × 10 compilations → 10/10 identiques** + preuve zéro-réseau/zéro-LLM | ⏳ |
| 4.7 | App témoin : build + lancement émulateurs iOS ET Android (protocole type 3.4, captures versionnées) | ⏳ |

## PHASE 3 — DÉTAIL (ouverte le 2026-08-28)

| Étape | Contenu | Statut |
|---|---|---|
| 3.1 | **Source de tokens JSON unique + codegen double cible** — paquet `@deribfy/design-tokens` : `tokens.json` (valeurs importées VERBATIM : palette produit CLAUDE.md/globals.css + jeu sémantique RN éprouvé au banc P-003), schéma zod strict, codegen thème RN (`theme.generated.ts`, données pures sans dépendance) et codegen CSS web (`theme.web.generated.css`) ; **équivalence avec le segment de `globals.css` PROUVÉE octet à octet** (497 octets, SHA-256 identiques) ; **SCELLEMENT (arbitrage propriétaire Option A)** : cliquet d'autorité (packages:test échoue si le segment web diverge de la source) + marqueur dans `globals.css` ; 15 tests (cliquets de marque, non-dérive, déterminisme, autorité) ; CI câblée (4 paquets) | 🟢 **TERMINÉE** (2026-08-28) — tsc/lint 0, 135/135 tests paquets, web intact (tsc EXIT=0, 4071/4071) |
| 3.2 | **Primitives contractuelles** — paquet `@deribfy/primitives` (dossier d'options validé propriétaire : A1+B2+C2+D1+E1/E3) : contrats v1 SANS aucun type de bibliothèque (cliquet d'imports mécanisé — `contracts.ts` n'importe que des types `react`), **9 primitives** (ScreenShell, Section, AppText, AppButton, TextField, ListRow, Badge, StateView, Spinner — chacune exigée par un bloc 3.3 ou le harnais 3.4), pont de thème = patron GAGNANT du banc (2 feuilles pré-calculées + contexte, liaison statique aux tokens ; variance par app = compilation), surface a11y minimale (testID/accessibilityLabel aux contrats, rôles posés par l'implémentation), **cliquet RTL** (propriétés logiques exclusivement, aucune propriété physique), **19 tests structurels** (vitest + react-test-renderer sur stub RN — exception no-deprecated consignée, limitée aux tests ; vérité de rendu = harnais 3.4) ; react-native 0.86.3 en devDep (lockfile +2159 lignes) | 🟢 **TERMINÉE** (2026-08-28) — packages 5/5 : tsc/lint 0, 156/156 tests ; **web intact** : tsc EXIT=0 + 4071/4071 |
| 3.3 | **Registre de Smart Blocks v1 + 6 blocs** — arbitrage B tranché → **D-023** (blocs COMPOSITES DE PRIMITIVES, granularité section — la seule compatible avec l'AIR gelé ; primitives HORS registre ; allowlist positive ; E2E-agnostique par cliquet ; pas d'élargissement au cas où). Paquet `@deribfy/blocks` : 6 définitions à **schémas de props STRICTS** (`button`, `detail_header`, `empty_state`, `form`, `header`, `list` — liste exacte sous cliquet), liaison d'entité explicite, pont **`validateAirBlocks`** (refus net, champs/actions validés contre l'AIR — **NON câblé au corpus GELÉ**, L2 : couverture corpus = Phase 4/arbitrage C), 6 composants composant EXCLUSIVEMENT les primitives (cliquet : FlatList seul import RN, zéro style, zéro token direct), **4 compositions de référence testées** (AuthFlow, List/Detail, Form, Profile — lecture consignée D-023 du critère ROADMAP) + états loading/empty/error du harnais sur `list`/`form` ; **27 tests** (dont F1/F2 négatifs et cliquet linguistique F3) | 🟢 **TERMINÉE ET GELÉE** (2026-08-28) — revue propriétaire complète puis corrections pré-gel F1 (`button.actionId` requis), F2 (appariement `actionLabel` ⟺ `actionId`), F3 (états discriminés, zéro chaîne linguistique dans le moteur) ; `max(4)` supprimée (sans source normative), `min(1)` justifiée ; **GEL D-024 : registre + 6 contrats en 1.0.0, cliquet verrouillé** ; packages 6/6 : tsc/lint 0, **183/183 tests** ; web intact : tsc EXIT=0 + 4071/4071 |
| 3.4 | **Harnais de rendu device/émulateur** (H1+M1+V2 validés) — app autonome `harness/render/` (hors workspaces, patron banc) consommant les VRAIES sources des paquets gelés ; 5 écrans (AuthFlow, List/Detail, Form, Profile, États) ; protocole Maestro : parcours light→dark asserté + captures, bascule RTL réelle (`forceRTL`+relance) puis **REJEU INCHANGÉ du parcours**, retour LTR ; **tap RÉEL List→Detail** (réserve D-024 levée) ; 44 captures versionnées + journaux + `synthese-3.4.md`. Anomalies traitées sur preuve : dialogue deep-link post-build (préparateur hors critères), sandbox takeScreenshot (chemins relatifs), **défaut de composition démontré sur device : écrans sans ScreenShell = fond non thémé en dark → correction harnais + NOTE D'ARCHITECTURE Phase 4 (écran généré = ScreenShell + blocs) + protocole intégralement rejoué** | 🟢 **TERMINÉE** (2026-08-28) — **VERT iOS ET Android**, 0 $ |

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
| P-003 Styling RN | ✅ | 🟢 **BANC EXÉCUTÉ INTÉGRALEMENT** (2026-08-27) — 4 candidats × 2 plateformes, protocole suivi sans dérogation : perf liste (60 fps partout, 0 frame > 34 ms), bascule thème (**tamagui ×4-5 sur les 2 plateformes**), RTL 4/4 (captures authentifiées), poids (bundle JS : unistyles +156 Ko · nativewind +1 088 · **tamagui +5 512**), New Arch 4/4, étanchéité 4/4, LOC DX ; synthèse `benchmarks/styling/results/synthese-P-003.md` ; anomalies d'environnement toutes résolues sur preuve (iCloud, JDK 25/prefab→JDK 21, cmake Intel, preset Expo 57…). **DÉCISION P-003 = propriétaire — mesures livrées, aucun gagnant désigné**. **EXTENSION 2026-08-27 (soir) : banc porté à 6 candidats** — ajout de `@shopify/restyle` 2.4.5 et `uniwind` 1.11.0 (moteur LIBRE ; moteur C++ « Pro » payant NON bancé) après revue de paysage indépendante ; protocole NON modifié, 4 mesures initiales NON rejouées, audit de conformité vert (fixture/contrats/tokens/versions/étanchéité identiques, tsc 6/6). Résultats : RTL 6/6 · New Arch 6/6 · étanchéité 6/6 · poids les plus faibles du banc pour restyle (+20 Ko JS / +16 Ko .app / +12 Ko APK) · LOC les plus faibles pour uniwind (83). **Limite découverte : dispersion inter-runs du TTI ±37 % → le TTI ne discrimine pas sous ~30 ms.** Synthèse : `benchmarks/styling/results/synthese-P-003-extension.md`. **DÉCISION TOUJOURS EN ATTENTE DU PROPRIÉTAIRE** |
| E2E mobile | ✅ | 🟢 **BANC EXÉCUTÉ (2026-08-28) → D-022 : Maestro retenu** — Maestro 2.9.0 vs Detox 20.51.4, même binaire partagé, flows de sémantique identique : **80/80 runs réussis (20/20 par outil et par plateforme, iOS + Android, 0 flake)** · vitesse médiane (mur) Maestro 30,4 s iOS / 24,8 s Android vs Detox 24,0 s / 12,6 s · **RTL PASS pour les deux, flow inchangé** · générabilité depuis l'AIR : 7 LOC des deux côtés (Maestro émet des **données**, Detox du **code**) · diagnostic d'échec : Maestro produit capture + hiérarchie UI JSON **automatiquement**, Detox aucun artefact par défaut · Detox exige une **instrumentation Android** dans chaque app générée · `@config-plugins/detox@11` en `peer expo@^53` (**4 SDK de retard**). Écart consigné non corrigé : assertions `loading`/`empty` hors de portée de la fixture (résorbé par les critères de sortie de la Phase 3). Synthèse : `benchmarks/e2e/synthese-E2E.md`. **Coût : 0 $** |
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
| 3 | Design System + Primitives + Blocks | 🟢 TERMINÉ (2026-08-28) |
| 4 | Compilateur déterministe v1 | 🔵 EN COURS (D-026, 4.0) |
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
| ~~P-003~~ | Lib de styling RN | — | 🟢 tranché → **D-021 : StyleSheet + tokens maison** (2026-08-27, banc 6 candidats) |
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
