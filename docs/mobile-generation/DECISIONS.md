# DECISIONS — JOURNAL DES DÉCISIONS DU CHANTIER

Format : décision · date · problème · options étudiées · choix · raison ·
conséquences. Les décisions D-xxx sont actées ; les P-xxx sont EN ATTENTE.

---

## D-001 — Colonne vertébrale de l'architecture (2026-08-27)

- **Problème** : structure du moteur de génération.
- **Options** : LLM écrit l'app directement ; pipeline AIR + cœur déterministe.
- **Choix** : `AI at the edges + deterministic core` — pipeline complet
  (voir `ARCHITECTURE.md` §0), issu de la confrontation multi-IA
  (Gemini/ChatGPT/Claude Chat) confrontée au dépôt réel par Claude Code.
- **Raison** : reproductibilité, audit, sécurité ; continuité mesurée avec
  les patrons existants du dépôt (allowlists, registres, cliquets,
  `sites.sections` comme proto-AIR).
- **Conséquences** : 21 non-négociables (`MASTER_PLAN.md` §4).

## D-002 — Runtime en profils, pas de runtime universel (2026-08-27)

- **Problème** : un Runtime Client embarquant toutes les capacités natives
  = binaire lourd, permissions/manifests injustifiés, risque review.
- **Options** : runtime universel ; build sur-mesure par app ; profils.
- **Choix** : petit nombre de profils versionnés par release train, app liée
  au plus petit profil couvrant ses capabilities.
- **Raison** : privacy manifests/required-reason APIs Apple + moindre
  privilège + poids ; télémétrie Fleet pour ajuster la granularité.
- **Conséquences** : matrice profils × trains à maintenir ; routeur au
  courant du profil de chaque app.

## D-003 — Décision OTA/native par empreinte native calculée (2026-08-27)

- **Problème** : un champ déclaratif `OTA-safe` peut mentir et casser une
  app en production.
- **Options** : métadonnée déclarative seule ; empreinte calculée.
- **Choix** : l'empreinte native calculée du projet compilé (outillage
  d'empreinte Expo + `runtimeVersion`) est l'AUTORITÉ ; les métadonnées de
  capability ne sont qu'un pré-filtre d'analyse d'impact.
- **Conséquences** : le compilateur émet l'empreinte ; le `deployment state`
  la stocke par app.

## D-004 — Isolation de tenancy des backends générés (2026-08-27)

- **Problème** : où vivent les bases des apps générées.
- **Options** : tables dans le projet cœur ; schéma par app dans un projet
  partagé ; projet Supabase par app.
- **Choix** : JAMAIS dans le cœur (non-négociable 21) ; cible = projet par
  app via Management API ; l'éventuel palier mutualisé preview reste ouvert
  (P-004) et serait physiquement distinct du cœur.
- **Raison** : blast radius par app ; le dépôt a payé pour savoir ce que
  coûte le durcissement d'UN projet partagé (phase 2, DEBT-073).

## D-005 — BYO Developer Account structurel v1 (2026-08-27)

- **Problème** : sous quel compte publier les apps générées.
- **Choix** : distribution = compte Apple/Google du client (App Store
  Guideline 4.2.6 ; 4.3) ; seul le preview vit sous le compte Deribfy.
  Custody des credentials/signature au Vault.
- **Conséquences** : App Identity Service sur le chemin critique de la
  première publication (Phase 12) ; onboarding compte client à designer
  (UX produit).

## D-006 — Compliance 2026 nommée (2026-08-27)

- **Choix** : le Compliance Generator et le Store Policy Gate couvrent
  nommément : classification IAP/PSP par classe de biens (dimension du
  Capability System), privacy manifests + required-reason APIs, Data Safety
  Google, suppression de compte in-app, European Accessibility Act,
  métadonnées stores, cibles SDK/API annuelles.
- **Raison** : chaque élément est une cause de rejet ou une obligation
  légale documentée ; un moteur à domaines arbitraires les rencontrera
  toutes.

## D-007 — Smart Blocks : copie régénérable, jamais éditée (2026-08-27)

- **Choix** : les blocs sont copiés dans l'app générée comme artefacts de
  sortie du compilateur (version+hash) ; aucune édition sur place (garde
  AST) ; patch de flotte = bump de version + recompilation ciblée.
- **Raison** : autonomie des apps SANS flotte de forks non patchables.

## D-008 — Oracle : pile d'autorité, juge ≠ auteur (2026-08-27)

- **Choix** : 1) déterministe (tsc, contrats, AST, diff permissions/AIR,
  conformité) > 2) E2E device généré depuis l'AIR > 3) LLM-juge UX
  subordonné, sur modèle/contexte distinct de l'auteur.
- **Raison** : l'IA n'est pas son propre juge — y compris entre étages IA.

## D-009 — Release train calé sur l'horloge stores/Expo (2026-08-27)

- **Choix** : N/N-1/N-2 dimensionnés par les planchers annuels Apple
  (Xcode/SDK) et Google (target API) et la cadence SDK Expo ; deadlines de
  re-soumission portées par le Fleet Manager.
- **Raison** : un train non soumettable est un train mort.

## D-010 — Cible technique mobile (2026-08-27)

- **Options** : React Native/Expo ; Flutter ; Capacitor ; Kotlin
  Multiplatform.
- **Choix** : React Native + Expo (EAS Build, canaux OTA).
- **Raison** : continuité TypeScript avec le stack et les Code Slots ; OTA
  JS contractuellement admis par Apple ; builds natifs hors infra par
  conception ; outillage d'empreinte native existant.

## D-011 — Mutations d'AIR par diff sur identités stables (2026-08-27)

- **Problème** : « ajoute Stripe / répare ce bouton » sur une app existante.
- **Choix** : nœuds d'AIR à identifiants stables ; toute évolution = patch
  ciblé + analyse d'impact ; jamais de régénération complète d'une app
  existante.
- **Raison** : stabilité des apps vivantes ; analyse d'impact OTA/native
  fiable ; diffs lisibles et auditables.

## D-012 — Déterminisme prouvé par golden corpus (2026-08-27)

- **Choix** : un corpus d'AIR de domaines variés, versionné ; critère de
  sortie du compilateur = hash de sortie identique sur compilations
  répétées, sur tout le corpus ; aucun appel LLM dans le chemin de
  compilation (prouvé par instrumentation).

## D-013 — Preview ≠ production (2026-08-27)

- **Choix** : le preview (QR immédiat) vit sous le compte Deribfy (dev
  builds / TestFlight interne / Internal testing) avec des DONNÉES DE
  DÉMONSTRATION uniquement ; la production vit sous compte BYO avec le
  backend provisionné de l'app. Les deux temporalités (instantané vs délais
  de review) sont assumées dans l'UX produit.

## D-015 — Résilience aux refus LLM sur tout chemin du moteur (2026-08-27)

- **Problème** : le banc coûts LLM (Phase 1, campagne n=10 du 2026-08-27) a
  établi l'**existence** [mesuré] de refus classifieur
  (`stop_reason: "refusal"`, `stop_details.category: "cyber"`) sur des
  prompts au vocabulaire typique du moteur (contrats, permissions, réseau,
  violations), facturés côté entrée. Un chemin LLM qui ne les gère pas
  produirait des pannes silencieuses du pipeline.
- **Nature de la décision** : **décision de RÉSILIENCE structurelle** —
  PAS une conclusion quantitative. L'échantillon n=10 prouve que le
  phénomène existe ; **la fréquence réelle sur les prompts du futur moteur
  reste [à mesurer]** sur un corpus représentatif avant toute conclusion
  chiffrée (dimensionnement, coûts, SLO).
- **Options** : ignorer (panne silencieuse — inacceptable) ; gérer au cas
  par cas (dérive garantie) ; règle structurelle transversale.
- **Décision (propriétaire, 2026-08-27)** :
  1. tout chemin LLM du moteur gère **explicitement** `stop_reason:
     "refusal"` ;
  2. **aucun refus ne provoque de panne silencieuse** du pipeline — un
     refus est un événement de première classe (journalisé, typé, remonté) ;
  3. le système peut mobiliser les **fallbacks/providers déjà prévus par
     l'architecture** (§15 multi-provider, §28 modèles) ;
  4. le **taux de refus devient une métrique observable du Budget
     Governor** ;
  5. la fréquence réelle des refus est **à mesurer** sur corpus
     représentatif — mesure à intégrer aux campagnes des phases aval.
- **Conséquences** : contrat d'appel LLM unique portant la gestion refusal
  (aucun appel direct hors de ce contrat) ; champ « refus » dans
  l'observabilité pipeline ; aucun autre choix architectural modifié,
  aucune phase ajoutée.

## D-017 — Règle permanente de progression et de non-anticipation (2026-08-27)

- **Problème** : risque de dérive d'ordre — une étape entamée parce qu'elle
  « semble disponible », par l'un quelconque des participants (propriétaire,
  Claude Code, assistants tiers), et perte de visibilité de l'avancement
  entre sessions.
- **Décision (propriétaire)** :
  1. **ROADMAP.md est la référence d'ordre STRICTE** — personne n'anticipe,
     n'invente, ne saute ni ne commence une étape non autorisée ;
  2. **Obligation de progression** : tout rapport important et toute fin
     d'étape affichent un bloc **PROGRESSION GLOBALE** (phases · étapes
     terminées avec statut · étape en cours · prérequis des étapes
     bloquées · prochaine étape EXACTEMENT autorisée · interdits du
     moment), vérifié contre l'état réel du dépôt avant affichage ;
  3. **Règle de décision de fin d'étape** : chaque fin d'étape énonce —
     ce qui vient d'être terminé · où nous sommes · la prochaine étape
     exacte de la ROADMAP · ses prérequis · exécutable ou bloquée ;
  4. Ambiguïté ou contradiction ROADMAP ↔ état réel = **STOP et
     signalement** avant toute action ; une proposition hors-ROADMAP,
     y compris du propriétaire, est **contestée explicitement**.
- **Consignation** : règle inscrite dans `MASTER_PLAN.md` §5 (gouvernance
  canonique) et relayée dans le bloc permanent de `CLAUDE.md` ; instance
  vivante du bloc dans `STATUS.md`.
- **Conséquences** : aucune — sinon documentaires ; aucun code, aucune
  installation, aucune étape nouvelle n'accompagne cette décision.
- **Complément (propriétaire, 2026-08-27) — pilotage opérationnel** :
  Claude Code est **responsable du pilotage opérationnel du plan**. Il
  croise ROADMAP, MASTER_PLAN, STATUS, DECISIONS, CLAUDE.md et l'état réel
  du dépôt, détermine LUI-MÊME la prochaine étape autorisée et l'EXÉCUTE
  si elle est exécutable avec les informations disponibles — sans attente
  passive entre les étapes, sans demander au propriétaire de choisir ce
  que la ROADMAP détermine déjà, sans « veux-tu que je continue ? » quand
  le plan autorise la continuation. Boucle : **ROADMAP → état réel →
  prochaine étape autorisée → exécution si possible → rapport → étape
  suivante**. Sollicitations du propriétaire réservées : (i) aux VRAIS
  prérequis externes — en précisant l'étape exactement bloquée, et
  seulement après avoir vérifié qu'aucune autre action autorisée et non
  bloquée n'existe ; (ii) aux VRAIES décisions propriétaire. Si plusieurs
  chemins sont réellement autorisés : brève présentation + recommandation
  technique fondée sur les objectifs. Chaque rapport contient :
  PROGRESSION GLOBALE · « PROCHAINE ÉTAPE AUTORISÉE : … » avec
  justification ROADMAP en une phrase · action exécutée ou prérequis
  exact · gouvernance. Les interdits de D-017 restent inchangés (ni
  inventer, ni sauter, ni anticiper, ni modifier un protocole en silence,
  ni décider à la place du propriétaire).

## D-018 — Protocole de preuve ELITE 2027 A++ (2026-08-27)

- **Décision (propriétaire)** : niveau d'exigence permanent pour TOUT le
  projet. L'objectif n'est jamais « bon/correct/suffisant » mais un
  système robuste, déterministe autant que possible, observable,
  fail-closed, capable de détecter ses propres anomalies.
- **Niveaux de preuve — jamais confondus** : hypothèse · observation ·
  corrélation · cause probable · cause confirmée · correction proposée ·
  correction testée · correction validée · absence de régression ·
  validation finale. Toute affirmation est PROPORTIONNÉE à la preuve.
- **Règles** : (1) diagnostic AVANT correction — jamais de correctif sur
  hypothèse plausible ; le test minimal qui discrimine les hypothèses
  d'abord ; (2) avant toute modification : identifier ce qui pourrait
  casser ; après : prouver que rien n'a cassé ; (3) simulation ≠
  validation réelle — une simulation valide le moteur/les gardes, JAMAIS
  le comportement du vrai modèle ; dire ce qu'elle prouve et ne prouve
  pas ; (4) le comportement LLM/API se valide sur le VRAI modèle et le
  vrai chemin ; toute dépense significative : coût, nb d'appels,
  hypothèses, option la moins chère d'abord, autorisation préalable ;
  (5) « résolu » exige : test de la correction + cas qui échouaient +
  cas qui marchaient + non-régression + vérification indépendante +
  comparaison aux critères ROADMAP — sinon NE PAS dire résolu ; (6) une
  preuve qui contredit l'hypothèse ⇒ abandon immédiat, repartir du
  dernier fait démontré ; (7) l'incertitude s'énonce explicitement
  (« nous ne savons pas encore + test discriminant ») ; (8) problèmes
  importants au format en 15 champs (OBSERVATION → VERDICT FINAL) ;
  (9) droit et devoir de contredire le propriétaire ; (10) jamais fermer
  une étape « pour finir ».
- **Application immédiate** : 2.4-H — la simulation v2 ne vaut PAS preuve
  du comportement réel ; mécanisme des 7 échecs = NON ÉTABLI ; sonde
  instrumentée conçue pour un maximum d'information par dollar, aucune
  dépense sans autorisation explicite.
- **Complément (propriétaire, 2026-08-27) — standard de preuve 100 %** :
  trois états SEULS pour les décisions importantes : 🟢 PROUVÉ ·
  🔴 RÉFUTÉ · 🟠 NON DÉTERMINÉ. Vocabulaire de conjecture (probablement,
  semble, devrait, cause probable, confiance X %, fortement soutenue…)
  INTERDIT hors d'une section « HYPOTHÈSES NON PROUVÉES ». Transformer
  🟠 en 🟢 par interprétation est interdit. « La cause est X » exige :
  test démontrant X · résultat obtenu · résultat attendu si X était faux ·
  élimination des hypothèses concurrentes · réplication ·
  contre-vérification indépendante — sinon 🟠. Une simulation ne prouve
  QUE ce qu'elle simule. Une correction n'est 🟢 qu'après : disparition du
  problème initial + cas fautifs corrects + cas sains conservés +
  non-régression + critères ROADMAP + contre-vérification. Cycle
  obligatoire : DIAGNOSTIC → HYPOTHÈSE → TEST DISCRIMINANT → PREUVE →
  CORRECTION → SIMULATION → TEST RÉEL → CONTRE-VÉRIFICATION →
  NON-RÉGRESSION → VERDICT. Chercher activement à DÉTRUIRE ses propres
  hypothèses, pas à les confirmer. Si on ne peut pas le prouver, on ne le
  déclare pas.

## D-019 — Correction 2.4-H : ordre de déclaration du schéma de bloc
## (2026-08-27)

- **Cause racine prouvée** (matrice X1-X4 + généralisation sur artefacts,
  12/12 sans contre-exemple) : fourche ordre×optionalité — `props`
  optionnelle déclarée AVANT `entityId` rendait légale la trajectoire
  naturelle du modèle (entityId d'abord), forcluant les props des blocs
  « armés » (props+entityId), présents uniquement dans les 7 documents
  fautifs (14-19 chacun ; 0 dans les 5 sains).
- **Correction appliquée (autorisée)** : permutation de deux lignes dans
  `blockInstanceSchema` (`air.ts`) — `entityId` avant `props`, `props` en
  dernier, aligné sur l'ordre d'émission naturel MESURÉ. Aucune
  modification de renderer, corpus, prompts ou architecture. RÈGLE
  dérivée pour les schémas futurs : l'ordre de déclaration est
  SIGNIFICATIF pour l'émission — jamais d'optionnel lourd avant un champ
  que le modèle préfère émettre plus tôt.
- **Garde ajoutée (harnais uniquement)** : comptes de pairs de props par
  bloc extraits du rendu, refus fail-closed `PROPS_COUNT` — ferme le trou
  prouvé par les bruts A2/A4 (props supprimées = schema-valides).
- **Preuves locales ($0)** : T1 diff de projection = relocalisation du
  seul nœud `entityId` (10 lignes, zéro parasite) · T2 121/121 tests
  paquets + typecheck + lint 0 · T3 hashes canoniques des 12 AIR
  inchangés 12/12 · T4 simulation 27 scénarios PASS ×2 (dont 2 nouveaux
  prouvant la garde) · équivalence EXACTE du schéma d'émission réel avec
  le bras X3′ (7/7 identique ×2 sur l'API réelle).
- **Validation réelle finale (2026-08-27, autorisée, $9,67)** :
  **🟢 12/12 IDENTIQUES au hash canonique** — 90 appels, ZÉRO retry,
  zéro refus ; les 7 documents historiquement fautifs passent, les 5
  sains restent identiques ; contre-vérification indépendante
  (re-parse, hash, forme canonique, validateurs : 0 diagnostic) ;
  code gelé pendant la campagne (HEAD identique, tree propre).
  **D-019 VALIDÉE — cycle D-018 complet respecté de bout en bout.**

## D-020 — GEL DU REGISTRE DE CAPABILITIES v1 (2026-08-27)

- **Décision (propriétaire, après double confrontation technique)** : le
  registre v1 est **GELÉ en 1.0.0** avec EXACTEMENT les 15 capabilities :
  analytics · auth · barcode_scan · biometrics · calendar · camera ·
  deep_links · geolocation · maps · media_upload · offline_storage ·
  payments.iap · payments.psp · push_notifications · share.
- **`biometrics` est CONSERVÉE malgré 0 usage dans le corpus** —
  l'inférence « 0/12 usage → pas nécessaire » est INVALIDE (biais
  circulaire démontré : émissions contraintes à l'allowlist + scénarios
  choisis par le concepteur ; le corpus de test ne définit JAMAIS la
  frontière du produit). La recommandation initiale de retrait a été
  attaquée et retirée (D-018 §7).
- **Aucun ajout** : les candidates futures restent HORS registre —
  **tier B (sur demande réelle)** : `documents` (génération/partage de
  fichiers — candidat le plus fort), `audio/micro`, `background_fetch`,
  `contacts` ; **évolutions de contrat futures** : passkeys (`auth` v2),
  portées étendues de `calendar`/`share`/`geolocation` (bump de version,
  pas de nouvelles entrées).
- **Critère d'inclusion v2** (digue anti-inflation — remplace le critère
  v1 invalidé par contre-exemples auth/analytics) : une capability entre
  au registre si (1) demande plausible dans ≥ 2 familles de domaines du
  produit ; (2) contrat stable et mûr DANS SA CATÉGORIE — natives :
  primitive OS/Expo de première classe ; services : classe de provider
  abstraite avec ≥ 1 provider viable et chemin de sortie (#12) ;
  (3) impact intégralement exprimable dans les 17 champs existants, sans
  nouvelle classe de menace ni de conformité ; (4) aucun engagement
  provider irréversible.
- **`push_notifications` clarifiée** : le contrat couvre push distant
  (APNs/FCM) ET notifications locales programmées (rappels) —
  implémentation commune expo-notifications.
- **Défauts d'implémentation tiers RÉVISABLES AU LOCK** : PostHog
  (analytics), RevenueCat (payments.iap), Stripe (payments.psp) sont des
  défauts de résolution, PAS des engagements architecturaux — le
  multi-provider (#12) et `project.lock` restent l'autorité.
- **Sens du gel** : gel des CONTRATS, pas fermeture du catalogue.
  Règle d'évolution : AJOUT compatible = décision consignée + édition
  consciente du cliquet + version MINEURE (les AIR existants restent
  valides sans migration — démontré : référence par motif, appartenance
  dynamique) ; retrait/renommage/changement de contrat = RUPTURE
  (décision + migration d'AIR + version MAJEURE).
- **Items de surveillance consignés** : empreinte réelle d'`auth`
  (stockage sécurisé de session natif — à re-mesurer en Phase 3 au choix
  de l'adaptateur runtime) ; versions de packages par défaut [proposé],
  résolues au lock ; demande hors-allowlist des modèles non mesurée
  (mesurable plus tard sur banc dédié sans allowlist).
- **Conséquence ROADMAP** : les critères de sortie de la Phase 2 sont
  TOUS satisfaits — **Phase 2 TERMINÉE**. Phase 3 NON ouverte
  (dépendances : Phase 2 ✓ + **P-003 tranché** — banc bloqué sur
  prérequis propriétaire).

---

# EN ATTENTE

## ~~P-001~~ → D-016 — Moteur d'orchestration : **Trigger.dev v4** (TRANCHÉ, 2026-08-27)

- **Contexte** : décision prise par le propriétaire le 2026-08-27, sur le
  dossier comparatif COMPLET du banc P-001 — trois candidats, campagnes
  officielles aux durées du protocole (étapes 5-30 s), même charge, mêmes
  épreuves, même instrumentation (base de test `deribfy-mobile-test`), même
  journal JSONL. Journaux versionnés : `benchmarks/orchestration/results/`
  (a), `…/inngest/results/` (b), `…/triggerdev/results/` (c). Temporal :
  écarté avant banc (coût opérationnel), conformément au protocole.
- **Problème** : moteur du workflow asynchrone durable du pipeline
  (ARCHITECTURE §14) — jobs durables, retries, idempotence, annulation,
  reprise après crash, état inspectable.
- **Options mesurées — épreuves éliminatoires (5/5 pour les trois)** :

  | Épreuve | (a) pgmq+état | (b) Inngest | (c) Trigger.dev v4 |
  |---|---|---|---|
  | E1 mort brutale en étape 3 | ✅ 215 s | ✅ 284 s | ✅ 181 s |
  | — latence de reprise | ≤ 60 s (vt configuré) | 157 s (lease défaut) | 2 s (backoff 1 s configuré) |
  | — étapes antérieures re-exécutées | 0 | 0 (mémoïsation prouvée) | 0 (structurel + idempotencyKey) |
  | E2 ré-émission idempotente, 6 jobs | ✅ 342 s (2 workers) | ✅ 160 s | ✅ **101 s** |
  | E3 annulation propre | ✅ | ✅ (`cancelOn`) | ✅ (`runs.cancel`) |
  | E4 exactement 2 tentatives puis failed | ✅ | ✅ | ✅ |
  | E5 durabilité, fenêtre prouvée vide | ✅ | ✅ | ✅ (équivalence différés — runtime managée) |
  | Artefacts dupliqués (total) | 0 | 0 | 0 |
  | LOC d'orchestrateur à notre charge | 158 | ~120 | ~110 |

  ⚠️ **Mesures du banc ≠ propriétés intrinsèques** : les latences de reprise
  comparent des MÉCANISMES différents (visibility timeout / lease cloud /
  backoff de retry), tous CONFIGURABLES — les chiffres reflètent les
  configurations du banc, pas des plafonds. Les équivalences d'épreuves de
  (b) et (c) sont documentées dans le code des adaptateurs et les journaux.
- **Coûts estimés** (grilles publiques relevées le 2026-08-27 ; hypothèses :
  volume protocole 1 000 générations/mois, pipeline proxy du banc
  ~5 étapes/génération, travaux lourds réels — sandbox, builds EAS —
  EXTERNES à l'orchestrateur) :
  - (a) : ~10-45 $/mois fixe (Postgres + workers conteneurisés), plat ;
  - (b) : 0 $ en Hobby mais **5 steps concurrents** → réalistement
    99 $/mois (Pro) + workers ~5-20 $ ;
  - (c) : **~0-10 $/mois** à ce volume (compute 0,0000338 $/s small-1x +
    0,25 $/10k runs ; crédits Free 5 $ / Hobby 10 $) — les attentes > 5 s
    sont checkpointées et NON facturées, ce qui correspond à la forme
    réelle du pipeline (orchestrateur = colle autour de travaux externes).
- **Décision (propriétaire)** : **candidat (c) — Trigger.dev v4**, exécution
  managée cloud.
- **Raisons factuelles** : 5/5 comme les autres, avec — E2 le plus rapide
  (101 s) ; reprise la plus rapide dans la configuration du banc ; le moins
  de code d'orchestration à notre charge (~110 LOC, état durable, retries,
  dédup, annulation et checkpointing délégués) ; coût le plus bas au volume
  cible avec un modèle de facturation aligné sur la forme du pipeline ;
  primitives natives couvrant exactement les besoins de l'ARCHITECTURE §14
  (triggerAndWait + idempotencyKey, retry borné, cancel API, différés).
- **Limites et risques consignés, avec mitigations exigées** :
  1. **Lock-in du plan de contrôle** : l'état d'orchestration vit chez
     Trigger.dev. Mitigations : la couche jobs du moteur passe par NOTRE
     abstraction provider (ARCHITECTURE §15) — aucun appel direct au SDK
     hors de l'adaptateur ; Trigger.dev est open-source et auto-hébergeable
     (chemin de sortie documenté) ; les candidats (a)/(b) restent bancés et
     rejouables (adaptateurs versionnés).
  2. **Coût linéaire à fort volume** vs (a) plat : seuil de réexamen fixé —
     re-chiffrer quand le volume réel dépasse ~10 000 générations/mois
     (métrique portée par le Budget Governor).
  3. **Custody de secrets côté tiers** : les env vars des tâches vivent
     chez Trigger.dev — n'y placer que des credentials de moindre privilège
     par environnement (règle Vault, ARCHITECTURE §16) ; les étapes
     manipulant des secrets sensibles peuvent rester des workers à nous.
  4. La machine à états MÉTIER (project.air/lock/deployment state) reste
     dans NOTRE Postgres — Trigger.dev orchestre, il ne devient pas la
     source de vérité des données du moteur.
- **Conséquences** : l'implémentation du workflow (Phase 7) ciblera
  Trigger.dev v4 derrière l'interface d'orchestration du moteur ; les
  mesures comparatives restantes du protocole (débit 20 jobs/5 workers…)
  deviennent sans objet pour la sélection et seront relevées sur (c) seul
  en Phase 7 si utiles au dimensionnement.

### D-034-R6 — PHASE 6 CLOSE : Sandbox + Oracle v1, critères tous satisfaits (2026-08-28)

- **6.1** `@deribfy/sandbox` : interface `SandboxProvider` provider-agnostic
  + runner de pipeline (§8, destruction garantie en finally) + **cliquet
  provider-agnostic** + tests sur provider factice (5/5).
- **6.2** `@deribfy/oracle` L1 déterministe (§9) : service SÉPARÉ qui
  re-vérifie sans faire confiance au générateur — 4 contrôles
  (re-validation fail-closed, déterminisme recompilé, diff
  permissions/manifestes vs AIR, cohérence schéma backend) ; détecte hash
  et AIR falsifiés (14/14).
- **6.3** Adaptateur Modal (HORS du cœur — monorepo sans dépendance
  `modal`) injecté dans le runner AGNOSTIQUE : **pipeline §8 réel sur l'app
  témoin dans un sandbox Modal — VERT** (install→typecheck→bundle,
  ~27,8-28,6 s ; npm_ci ~9,6 s, tsc ~1,9 s, bundle ~15 s), **teardown
  prouvé** ; Oracle L1 4/4 sur l'AIR témoin.
- **6.4** Oracle L2 : `generateMaestroFlows(air)` — flows E2E **générés
  depuis l'AIR** (navigation via actions ui→navigate réelles, état peuplé =
  fixtures, RTL), testID = identités stables, geste de retour par
  plateforme ; 27/27 générateur (12/12 corpus) ; **DEVICE : 4/4 flows
  générés VERTS sur les 2 émulateurs** (nav+RTL iOS+Android, 0 échec).
- **6.5** « sandbox SANS SECRETS » prouvé par tentative (6.3 : env NONE,
  metadata bloqué) ; temps/coût par pipeline consignés (crédits Modal,
  ~0 $ réel).
- **Anomalies traitées sur preuve** : workdir non-root (E2B), collision de
  nom `run`, `getent` pendant, sonde secrets `MODAL_IMAGE_ID` faux positif
  (métadonnée publique), déterminisme Oracle non enveloppé (fail-closed),
  `- back` iOS sans bouton système → geste de bord. Aucune sur hypothèse.
- **Garde-fous** : indépendance provider-agnostic PRÉSERVÉE (cliquet vert,
  0 dépendance modal dans le monorepo) ; zones gelées intouchées ; secrets
  hors dépôt jamais journalisés.
- **CRITÈRES DE SORTIE ROADMAP — TOUS SATISFAITS** : pipeline complet vert
  sur l'app témoin ✅ · flows E2E générés depuis l'AIR (navigation + états +
  RTL) verts sur émulateurs iOS/Android ✅ · temps/coût par pipeline mesurés
  et consignés ✅ · preuve « sandbox sans secrets » ✅. Packages 382/382,
  web intact (tsc 0 + 4071/4071). **Clôture = constat propriétaire.**

## D-035 — OUVERTURE PHASE 7 : Workflow asynchrone durable (découpage, 2026-08-28)

- **Contexte** : dépendances ROADMAP satisfaites (Phases 4-6 ✅, P-001 →
  D-016 Trigger.dev v4 ✅). Feu vert de continuité propriétaire.
- **Découpage** :
  - **7.1** `@deribfy/workflow` — machine à états PURE et **agnostique du
    moteur d'orchestration** (même discipline que D-033 pour le sandbox) :
    étapes du pipeline de génération, transitions, **clés d'idempotence
    déterministes**, état inspectable ; cliquet engine-agnostic. 0 $.
  - **7.2** Adaptateur **Trigger.dev** HORS du cœur (`workflow/`, hors
    workspaces — patron de l'adaptateur Modal) : tâches durables portant
    les étapes réelles.
  - **7.3** Génération **bout-en-bout pilotée par jobs** (réelle).
  - **7.4** Critère dur : `kill -9` en plein milieu → reprise sans doublon
    (idempotence prouvée) · annulation propre · timeouts · état inspectable.
  - **7.5** Clôture.
- **Lecture consignée (sécurité)** : l'orchestrateur managé (D-016) exécute
  les étapes hors de notre machine ; les credentials nécessaires aux étapes
  externes sont transmis par la **synchronisation chiffrée d'env de
  Trigger.dev** (patron déjà employé au banc P-001 avec `DATABASE_URL`) —
  jamais dans le dépôt, jamais journalisés. Conséquence assumée du choix
  d'un orchestrateur managé.
- **Lecture consignée (§14)** : ARCHITECTURE §14 évoquait « état durable +
  file en Postgres » AVANT le banc ; **D-016 a tranché un moteur managé**
  qui fournit file, état durable, retries, dédup et workers — l'état
  durable vit donc dans le moteur, l'état MÉTIER dans notre machine à
  états. Aucune modification de ROADMAP.

### D-035-R7 — PHASE 7 CLOSE : Workflow asynchrone durable, critère dur PROUVÉ (2026-08-28)

- **7.1** `@deribfy/workflow` — machine à états PURE et **agnostique du
  moteur** : 5 étapes du pipeline, transitions fail-closed, **clés
  d'idempotence déterministes** (jobId, étape, airHash — sans horodatage ni
  aléa), détection de non-déterminisme, état inspectable ; **cliquet
  engine-agnostic** (aucun SDK d'orchestrateur dans le cœur) — 13/13.
- **7.2** Adaptateur **Trigger.dev** dans `workflow/` **HORS des
  workspaces** (patron D-033) : le monorepo n'a **aucune dépendance à un
  moteur d'orchestration**. Déployé : version `20260828.1`, 2 tâches.
- **7.3/7.4 — CRITÈRE DUR : 5/5 ÉPREUVES RÉUSSIES** (journaux
  `workflow/results/`) :
  - **P1 bout-en-bout piloté par jobs** : 5 étapes RÉELLES du moteur
    (resolve → compile → **verify = pipeline §8 dans la sandbox Modal via
    le contrat provider-agnostic** → Oracle L1 → finalize), **44,7 s**,
    5 artefacts (dont rootHash `343a94d994c4` = celui de la Phase 4) ;
  - **P2 kill -9 → reprise SANS DOUBLON** : mort BRUTALE du processus en
    pleine étape `compile` (`process.exit(1)`), **reprise automatique**
    (2 tentatives), pipeline complété en 62,8 s, **5 étapes une seule
    fois** et **artefacts IDENTIQUES à P1** — idempotence prouvée à
    l'artefact près, pas seulement au compte ;
  - **P3 annulation propre** : `runs.cancel` en cours → statut terminal
    `CANCELED`, étapes suivantes jamais exécutées ;
  - **P4 timeouts** : étape dépassant `maxDuration` → **step `TIMED_OUT`
    (1 seule tentative)**, job borné à **620 s**, statut métier `failed`
    sur `resolve`, **0 artefact produit** ;
  - **P5 état inspectable** : instantanés successifs lisibles par API
    (QUEUED → EXECUTING → COMPLETED), étapes et artefacts consultables.
- **Anomalie traitée sur preuve** : P4 initialement rouge — **cause
  démontrée par l'API** (le step était bien `TIMED_OUT` et la sortie métier
  bien `failed/resolve/0 artefact`) : c'était l'**ASSERTION du test** qui
  confondait statut du RUN d'orchestration (le parent se termine
  normalement en RETOURNANT un verdict d'échec) et statut MÉTIER. Test
  corrigé, épreuve REJOUÉE → réussie. Aucun défaut du système.
- **Lecture consignée (sécurité)** : credentials des étapes externes
  synchronisés vers l'environnement CHIFFRÉ du moteur managé (patron
  P-001) — jamais dans le dépôt, jamais journalisés.
- **CRITÈRES DE SORTIE ROADMAP — TOUS SATISFAITS** : génération
  bout-en-bout pilotée par jobs ✅ · `kill -9` en plein milieu → reprise
  correcte sans doublon (idempotence prouvée) ✅ · cancellation propre ✅ ·
  timeouts ✅ · état inspectable ✅. Packages **395/395**, tsc/lint 0 ;
  **web intact** (tsc 0 + 4071/4071). Coût : crédits (~0 $).
  **Clôture = constat propriétaire.**

## D-036 — OUVERTURE PHASE 8 : Vertical Slice 1 (restaurant), Étape A (2026-08-28)

- **Contexte** : dépendances ROADMAP satisfaites (Phases 2-7 ✅). Feu vert
  propriétaire pour l'**Étape A à 0 $** ; appareils : **iPhone 16 (iOS
  26.5.2) disponible**, **aucun Android physique**.
- **CROSS-PLATFORM — vérification sur le code réel (lecture seule)** : le
  projet généré ne contient **AUCUNE branche de plateforme** (`Platform.OS`,
  `.ios.`, `.android.` : 0 occurrence sur les 31 fichiers émis) — le MÊME
  code sert iOS et Android ; `app.json` émis couvre les deux plateformes
  (config native, permissions, planchers) ; les primitives sont en
  propriétés logiques (cliquet RTL 3.2) et les blocs sont gelés sans code
  spécifique. Continuité de preuve : 3.4 (harnais VERT iOS+Android), 4.7
  (app témoin buildée et lancée sur les 2 émulateurs), 6.4 (4/4 flows
  générés verts sur les 2). **Aucune implémentation iOS-only n'est
  introduite** ; la validation Android continue sur émulateur.
- **Découpage Étape A (0 $, sans action propriétaire)** :
  - **8.A1** Slice restaurant : intention → AIR (document `resto-quartier`
    du corpus ACTIF, émis par LLM en D-025) → compile → **backend RÉEL
    provisionné** (Phase 5) → sandbox §8 → Oracle L1/L2 ;
  - **8.A2** Validation **dev build sur émulateurs iOS ET Android** +
    contrôles cross-platform explicites ;
  - **8.A3** **Scorecard v1** (taux de succès, temps, coût, repairs,
    qualité UI) + rétrospective ; garde-fou ROADMAP appliqué (tout écart
    manuel = dette du GÉNÉRATEUR).
- **Lectures consignées (aucune modification de ROADMAP)** :
  1. **Preview = données de démonstration** (D-013) : l'app de preview
     consomme les fixtures déterministes (D-030) ; le backend réel est
     provisionné et vérifié **côté service** (patron Phase 5) — aucune
     policy RLS applicative n'est ajoutée (D-032 les diffère
     explicitement, décision NON touchée) ;
  2. le **gate** cité dans l'objectif de la Phase 8 est construit en
     **Phase 12** (ROADMAP) : la Phase 8 exerce les gates DÉJÀ existants
     (4 validateurs fail-closed + Oracle L1) — constat, pas modification ;
  3. **appareils physiques** : le critère de sortie 1 (« 2 appareils
     physiques ») reste OUVERT à la fin de l'Étape A — il exige un compte
     Expo/EAS et les appareils ; l'Android physique fait l'objet d'une
     analyse de nécessité séparée présentée au propriétaire AVANT toute
     dépense.

### D-036-R8A — PHASE 8 / ÉTAPE A CLOSE : slice restaurant, chaîne verte (2026-08-28)

- **Chaîne bout-en-bout RÉELLE, 7/7 étages verts** (`slices/restaurant/`) :
  gates fail-closed (0 diagnostic) → compile (rootHash `343a94d994c44b22`,
  **identique à la Phase 4 et à la Phase 7**) → **backend Supabase RÉEL**
  (3 tables ⇔ 3 entités, RLS 3/3, seed 24, SQL archivé au store,
  **teardown prouvé**) → sandbox §8 (28,7 s) → Oracle L1 4/4 → flows L2
  générés → **builds dev Release + 4/4 flows PASS sur émulateurs iOS ET
  Android**. Total chaîne ≈ 3 min 20 s. **0 repair · 0 contournement
  manuel · ≈ 0 $**.
- **CROSS-PLATFORM PROUVÉ** : 0 branche de plateforme dans les 31 fichiers
  émis ; `app.json` symétrique ios/android ; l'unique différence vit dans
  le GÉNÉRATEUR DE FLOWS (geste de retour), jamais dans l'app. L'absence
  d'Android physique n'a eu aucun effet sur l'architecture.
- **Scorecard v1** (`SCORECARD-v1.md`) et **rétrospective**
  (`RETROSPECTIVE.md`) consignés — critères ROADMAP 2 et 3 satisfaits ;
  critère 4 (garde-fou) satisfait : `manualWorkarounds: []`.
- **Anomalie majeure traitée sur preuve** : un plantage du harnais a laissé
  un **projet Supabase orphelin** ; supprimé immédiatement (preuve
  d'absence) et cause corrigée — **teardown désormais garanti en
  `finally`** dans le runner de slice. Défaut du harnais, pas des artefacts
  générés ; consigné en rétrospective comme leçon générale.
- **Dette du GÉNÉRATEUR consignée** (non corrigée, patron ROADMAP) : seed
  partiel (entités sans dataset) · app non connectée au backend vivant en
  preview (conforme D-013/D-032, à traiter là où la ROADMAP le prévoit) ·
  provisioning 169 s sur org Pro.
- **CRITÈRE 1 OUVERT** : « app installée et fonctionnelle sur 2 appareils
  physiques ». Requiert compte Expo/EAS + appareils. **Analyse Android
  physique remise au propriétaire, aucune dépense engagée.**

## ~~P-002~~ → D-033 — Provider de sandbox : **MODAL** (TRANCHÉ, 2026-08-28)

- **Options bancées** : E2B ; Modal (finalistes du dossier) ; Fly / Vercel /
  Daytona / Cloudflare / AgentCore écartés au dossier (isolation faible,
  maturité, lock-in, ou produit sandbox à reconstruire).
- **Décision (propriétaire, 2026-08-28)** : **MODAL choix #1** ; **E2B repli
  réel** issu du même banc. Fondée sur le banc comparatif E1-E5
  (`benchmarks/sandbox-bench/synthese-P-002.md`, < 1 $/provider sur
  crédits) : E1 pipeline réel `npm ci→tsc→expo export` sur l'app témoin —
  les 2 verts 3/3, **Modal ~28 s vs E2B ~63 s** ; E2 cache npm — **Modal
  propre ~16 %, E2B instable** (exit -1 reproduit en réutilisation, propre
  en sandbox fraîche E1) ; E3 egress **tous bloqués des 2 côtés** (allowlist
  domaine supportée par les 2) ; E4 aucun secret des 2 ; E5 0 orphelin/20
  des 2. **Aucune barrière de sécurité perdue par Modal.** Débat isolation
  Firecracker (E2B) vs gVisor (Modal) instruit : gVisor = isolation de
  production éprouvée à l'hyperscale (GKE Sandbox/Cloud Run), toutes les
  barrières §8 tenues ⇒ l'écart de primitive est une défense en profondeur
  marginale pour notre charge (Phase 6-7 = outils de confiance sur sortie
  déterministe), ne justifiant pas de renoncer au gain mesuré de Modal
  (recommandation Claude révisée vers Modal sur preuves, arbitrage
  propriétaire confirmé).
- **EXIGENCE PROPRIÉTAIRE NON NÉGOCIABLE — indépendance provider** : le
  moteur ne doit JAMAIS dépendre de Modal. Vérifié sur le code réel
  (2026-08-28, lecture seule) : **aucun module de `packages/` ne référence
  Modal ni E2B** (seuls faux positifs : couleur hex `#241E2B`, « la modale »
  du web) ; tout le code provider-sandbox vit dans `benchmarks/sandbox-bench/`
  (harnais de banc, hors workspaces). Garanties architecturales préexistantes :
  non-négociable #12 (multi-provider), §15 (interfaces de provider
  obligatoires dès le premier provider, le code ne dépend jamais d'un
  provider concret), §8 (provider enfichable). Patron déjà appliqué en
  Phase 5 (`ProvisioningProvider` + `SupabaseProvider`). **Remplacer Modal
  par E2B = changement d'adaptateur + config, jamais le cœur.**
- **Conséquence Phase 6** : la couche sandbox se construit derrière une
  **interface `SandboxProvider` provider-agnostic** (6.1) ; l'adaptateur
  Modal est un module injecté ; **cliquet provider-agnostic** garantit que le
  cœur n'importe aucun SDK de provider.

## D-034 — OUVERTURE PHASE 6 : Sandbox + Oracle v1 (découpage, 2026-08-28)

- **Contexte** : dépendances ROADMAP satisfaites — Phase 4 ✅, **P-002 → D-033
  Modal** ✅, outil E2E → D-022 Maestro ✅. Feu vert propriétaire de
  continuité (2026-08-28). Budget : crédits Modal (0 $ réel attendu) ;
  émulateurs locaux pour l'Oracle L2 (0 $).
- **Découpage proposé (patron D-026/D-032)** :
  - **6.1** `@deribfy/sandbox` — **interface `SandboxProvider`
    provider-agnostic** (§15) + runner de pipeline (§8 : install→typecheck→
    lint/AST→tests→bundle→destroy) + **cliquet provider-agnostic** (le cœur
    n'importe aucun SDK de provider) + tests sur provider factice. **0 $**.
  - **6.2** Oracle L1 déterministe — lit les artefacts du pipeline, produit
    un verdict : tsc strict, contrats de blocs, politique AST, **diff
    permissions/manifestes vs AIR**, schéma backend, gate §5 rejoué. Réutilise
    les validateurs existants. **0 $** (sur artefacts).
  - **6.3** Adaptateur **Modal** (implémente `SandboxProvider`, seul module à
    dépendre du SDK `modal`) + **pipeline RÉEL sur l'app témoin dans le
    sandbox** : temps et coût par étape mesurés. **DÉPENSE** (crédits Modal,
    ~0 $) → point d'arrêt de continuité.
  - **6.4** Oracle L2 device — flows Maestro **générés depuis l'AIR**
    (navigation + états loading/empty/error + RTL) verts sur émulateurs
    iOS/Android. **0 $** (émulateurs locaux).
  - **6.5** Preuve « sandbox sans secrets » (par tentative) + temps/coût par
    pipeline consignés + clôture.
- **Lecture consignée** : l'Oracle est un service SÉPARÉ qui lit les
  artefacts, pas la conversation (§9) ; le générateur ne peut pas déclarer
  « réussi ».

## D-022 — Moteur E2E : **Maestro** (TRANCHÉ, 2026-08-28)

- **Contexte** : banc `benchmarks/E2E-mobile.md` exécuté le 2026-08-28 sans
  dérogation. App sous test = copie de la coquille P-003 **retenue**
  (`stylesheet` + tokens, D-021), `fixture-core` non dérivée. **Un seul binaire
  par plateforme, partagé par les deux outils** (build Release, New
  Architecture) ; flows de **sémantique strictement identique** ; même horloge.
  Artefacts versionnés : `benchmarks/e2e/` (flows, 80 journaux de run,
  résultats JSONL, captures RTL, artefacts d'échec, générateurs,
  `synthese-E2E.md`).
- **Problème** : outil du niveau 2 de l'Oracle (ARCHITECTURE §9). Critère de
  fond inscrit au protocole : **l'Oracle devra GÉNÉRER les flows depuis l'AIR**
  — la générabilité du format compte autant que la fiabilité.
- **Options mesurées** : Maestro 2.9.0 · Detox 20.51.4.

  | Mesure | Maestro | Detox |
  |---|---|---|
  | Fiabilité iOS (20 runs) | **20/20** | **20/20** |
  | Fiabilité Android (20 runs) | **20/20** | **20/20** |
  | Vitesse iOS (médiane mur) | 30,4 s | **24,0 s** |
  | Vitesse Android (médiane mur) | 24,8 s | **12,6 s** |
  | RTL, flow inchangé | **PASS** | **PASS** |
  | Générabilité depuis l'AIR | 7 LOC → **YAML (données)** | 7 LOC → **JS (code)** |
  | Diagnostic d'échec | **capture + hiérarchie UI JSON + logs, automatiques** | trace jest (ligne exacte), **aucun artefact par défaut** |
  | Instrumentation de l'app générée | **aucune** | **requise sur Android** (APK `androidTest` + config Gradle) |
  | Intégration Expo | native | `@config-plugins/detox@11` en `peer expo@"^53"` → **4 SDK de retard** sur notre SDK 57 |

  **Total : 80/80 runs réussis, 0 flake, sur les deux outils.** La fiabilité ne
  départage pas ; la décision se joue sur les critères d'architecture.
- **Décision (propriétaire, 2026-08-28)** : **Maestro** retenu comme moteur E2E.
  **Detox n'est PAS disqualifié** — il reste rejouable, son harnais est
  versionné.
- **Raisons — spécifiques à NOTRE architecture, pas à une supériorité générale** :
  1. **Le compilateur émet des DONNÉES, pas du code.** Le flow Maestro est un
     YAML déclaratif inerte ; le test Detox est du JavaScript à exécuter.
     Émettre du code exécutable élargirait la surface soumise aux gardes AST
     et au déterminisme byte-identique (§6, non-négociable 2) sans bénéfice.
  2. **Zéro instrumentation dans l'app livrée.** Detox impose à **chaque app
     générée** un APK `androidTest` et une configuration Gradle : l'artefact
     testé cesse d'être exactement l'artefact publié. Maestro pilote le binaire
     **réel** (non-négociable 20, §13 EAS).
  3. **Le diagnostic d'échec est la matière première de l'Oracle et de la
     Repair Loop (§10).** Maestro produit **sans configuration** une capture à
     l'étape fautive et la **hiérarchie d'UI complète en JSON** — exploitable
     mécaniquement, par app, à l'échelle. Detox n'en produit aucun par défaut.
  4. **La vitesse ne départage pas à notre échelle** : Detox gagne 6 s (iOS) et
     12 s (Android) par exécution, négligeable devant le coût d'installation et
     de build d'une génération (banc P-003 : plusieurs minutes par app).
  5. **Dette d'intégration récurrente** : le plugin Expo officiel de Detox
     accuse 4 versions de SDK de retard ; notre moteur suivra le release train
     (§25) et paierait cette dette à chaque montée de SDK.
- **Réversibilité (exigée et préservée)** : l'Oracle ne dépend que d'une
  interface **« générer un flow depuis l'AIR → exécuter → interpréter le
  verdict »**. Le générateur de flows est un **adaptateur remplaçable** :
  la démonstration est faite des deux côtés (générateurs de 7 LOC, même
  structure AIR source). Aucune dépendance Maestro ne descend dans l'AIR, les
  contrats de primitives, les blocs ou le compilateur ; les `testID` sont un
  attribut React Native standard, consommé **identiquement** par les deux
  outils. **Interdit** : tout couplage du registre de blocs ou de l'AIR à la
  syntaxe d'un outil E2E.
- **Seuil de réexamen** : régression de support RN/Expo côté Maestro, OU besoin
  avéré de synchronisation « boîte blanche » que Maestro ne fournit pas, OU
  coût E2E devenant dominant dans le budget d'une génération → le harnais Detox
  est rejouable en l'état (`benchmarks/e2e/detox/`).
- **Écart au protocole CONSIGNÉ, non corrigé** : le protocole demande des
  assertions sur les états `loading` / `error` / `empty`. La fixture P-003
  expose deux états `error` (**assertés**), mais l'indicateur de chargement n'a
  **pas de `testID`** et l'état `empty` **n'existe pas**. Ces deux assertions
  sont hors de portée sans modifier la fixture — ce qui ferait dériver un
  artefact de banc clos. **Statut : ouvert, non bloquant.** La couverture
  `loading`/`empty` est déjà exigée par les **critères de sortie de la Phase 3**
  (« harnais de rendu … états loading/empty/error vert ») sur les **vrais**
  blocs : l'écart s'y résorbe par construction. Une modification de la fixture
  de banc serait une décision propriétaire distincte, **non requise à ce jour**.
- **Coût** : 0 $ (aucun service payant, aucun compte créé).
- **Conséquence ROADMAP** : dernier banc de Phase 1 exécutable **fait**. Les
  bancs restants (P-002, coûts EAS, coût projet Supabase) demeurent bloqués sur
  prérequis propriétaire — la Phase 1 ne peut donc pas être close. **La Phase 3
  est ouvrable** : ses deux dépendances (Phase 2 ✓, P-003 tranché ✓) sont
  satisfaites.

## D-023 — Registre de Smart Blocks v1 : granularité et périmètre (TRANCHÉ, 2026-08-28)

- **Contexte** : arbitrage B annoncé en Phase 3. Dossier d'options instruit
  sur mesures fraîches du golden corpus : 12 AIR · 41 écrans · **255
  instances** · **115 blockType distincts** (fragmentation ~2,2
  instances/type, synonymes prouvés — button/primary_button/submit_button —
  et clés de props en français dans un document) ; couverture cumulée :
  top 6 = 32 % des instances, top 30 = 63 %, 0/41 écran entièrement couvert
  par 6 types. Tension structurante signalée : la lecture littérale de la
  ROADMAP (« 4-6 blocs : AuthFlow, List/Detail… ») est incompatible avec
  l'AIR v1 GELÉ (`screens[].blocks[]` : un bloc est une SECTION d'écran ;
  AuthFlow/List-Detail sont des motifs multi-écrans).
- **Décision (propriétaire, 2026-08-28)** :
  1. **Le registre v1 est un registre de BLOCS COMPOSITES DE PRIMITIVES**
     (Smart Blocks, granularité section d'écran — la seule compatible avec
     l'AIR gelé) — PAS un registre de primitives : les 9 primitives de
     `@deribfy/primitives` restent HORS registre.
  2. **Allowlist positive** : blockType inconnu = refus net (patron D-020).
  3. Registre **versionné, déterministe, indépendant de tout moteur E2E**
     (Maestro/Detox) — indépendance MÉCANISÉE par cliquet sur les sources.
  4. **Pas d'élargissement « au cas où »** : ajout = décision consignée +
     édition consciente du cliquet + version mineure (règle D-020).
  5. **Les 4 motifs nommés par la ROADMAP** (AuthFlow, List/Detail, Form,
     Profile) sont livrés comme **COMPOSITIONS DE RÉFÉRENCE TESTÉES**
     (tests d'intégration assemblant les blocs du registre), pas comme des
     blocs eux-mêmes — c'est la lecture consignée du critère de sortie.
  6. **L2 — corpus** : le corpus historique **reste GELÉ, non régénéré** ;
     le registre v1 couvre uniquement le périmètre requis par la Phase 3 ;
     la couverture du corpus complet reste un sujet **Phase 4** (arbitrage
     C, critères existants inchangés). Le pont `validateAirBlocks` n'est
     **PAS câblé** aux tests du corpus.
- **Périmètre v1 (6 blocs, liste EXACTE, cliquet)** : `button` ·
  `detail_header` · `empty_state` · `form` · `header` · `list` — chacun
  exigé par ≥ 1 motif ROADMAP ou par le harnais 3.4, dans le top 8 mesuré
  du corpus, implémentable avec les 9 primitives sans ajout. `list` et
  `form` portent contractuellement les états loading/empty/error (états
  EXPLICITES, jamais déduits des données — déterminisme).
- **Options écartées** : G1 composite multi-écrans (exige de rouvrir l'AIR
  gelé — dominée) ; G3 deux granularités au registre (ambiguïté de choix
  pour le LLM, inflation anti-D-020) ; G4 pas de registre en Phase 3
  (reproduit la cause mesurée des 115 types ; contredit §3).
- **Conséquences** : paquet `@deribfy/blocks` (registre + pont + composants
  + compositions de référence) ; schémas de props STRICTS par bloc (clé
  inconnue = refus — leçon des clés en français) ; liaison d'entité
  explicite (`required`/`forbidden`, jamais ambiguë) ; références de champs
  et d'actions validées contre l'AIR ; **gel du registre v1 = revue
  propriétaire en fin de 3.3** (patron 2.5/D-020) ; ré-émission du corpus
  avec digest du registre = arbitrage C, entrée de Phase 4.

## D-024 — GEL DU REGISTRE DE SMART BLOCKS v1 (2026-08-28)

- **Contexte** : revue propriétaire exhaustive de fin de 3.3 (lecture seule,
  format en 13 sections) : verdict initial 🟠 — 3 défauts démontrés, corrigés
  sur autorisation avant gel, plus deux résolutions préalables factuelles.
- **Corrections pré-gel appliquées et prouvées** :
  - **F1** : `button.actionId` REQUIS (un AIR valide pouvait déclarer un CTA
    non câblable — bouton mort, divergence silencieuse AIR ↔ app ; démontré
    par notre propre sonde de test) + test négatif ;
  - **F2** : `empty_state` — appariement BIDIRECTIONNEL `actionLabel` ⟺
    `actionId` par superRefine (label sans action = silencieusement ignoré
    au rendu [3 usages réels au corpus] ; action sans label = non rendable) ;
    `actionId` validé contre les actions de l'AIR ; tests dans les 3 sens ;
  - **F3** : suppression des 3 défauts français codés en dur de `ListBlock`
    (« Aucun élément », « Une erreur est survenue », « Chargement… ») —
    violation du non-négociable 16 (i18n) ; `ListBlockState` devient un état
    DISCRIMINÉ (les libellés sont requis par le type exactement quand l'état
    les rend, fournis par le compilateur depuis l'AIR/les locales) ;
    **cliquet linguistique** ajouté (extraction des littéraux réels, refus de
    toute signature de texte naturel — espace/diacritique/points de
    suspension ; stratégie de classe, pas de liste de mots ; résidu assumé :
    mot ASCII isolé).
- **Résolutions préalables** :
  - **Anomalie « catalogue non interactif » sur simulateur** : l'app observée
    est la FIXTURE DE BANC P-003 (seules apps installées, `simctl listapps`),
    dont les cartes n'ont PAS de onPress PAR PROTOCOLE (contrat
    `CardProps{item,index}`) — `packages/blocks` n'a jamais été déployé sur
    device. Classification : hors 3.3 ; les tests 3.3 prouvent le câblage
    LOGIQUE du handler (stub), la preuve du toucher réel et du rendu revient
    au HARNAIS 3.4 (ordre prévu par la ROADMAP). Aucune correction.
  - **`detail_header.badgeFieldIds.max(4)`** : borne inventée à
    l'implémentation, sans source normative (corpus max observé : 3) —
    SUPPRIMÉE ; `min(1)` CONSERVÉE avec justification (forme canonique
    unique de l'absence — déterminisme).
- **Décision (propriétaire, 2026-08-28)** : **GEL** — `BLOCK_REGISTRY_VERSION`
  **0.1.0 → 1.0.0**, les 6 contrats (`button`, `detail_header`,
  `empty_state`, `form`, `header`, `list`) passés en **1.0.0**, cliquet
  verrouillé (version + liste exacte + versions de contrats — patron D-020).
- **Règle d'évolution post-gel** (identique à D-020) : AJOUT compatible =
  décision consignée + édition consciente du cliquet + version MINEURE ;
  retrait/renommage/changement de contrat = RUPTURE (décision + version
  MAJEURE).
- **Réserve consignée sans impact sur le gel des contrats** : la preuve
  device (toucher réel, rendu light/dark/RTL/états) relève du harnais 3.4.
- **Preuves au gel** : packages 6/6 — tsc/lint 0 écart, **183/183 tests** ;
  web intact (tsc EXIT=0 + 4071/4071 après les corrections ; le gel
  lui-même ne change que des chaînes de version) ; zones gelées :
  0 modification.

## D-025 — ARBITRAGE C : golden corpus v2 par ré-émission (TRANCHÉ, 2026-08-28)

- **Contexte** : le critère dur de la Phase 4 (« sur tout le golden corpus,
  10 compilations → hash identique 10/10 ») est **insatisfiable avec le
  corpus v1** face au compilateur fail-closed (D-023/D-024) : **12/12
  documents refusés** par l'allowlist (mesuré), et **12/12 encore refusés
  après mapping optimiste des synonymes** — l'option « transformation
  déterministe sans LLM » est réfutée par la mesure, pas par principe.
  Alternatives écartées avec démonstration : sous-ensemble compilable
  (vide : 0/12), élargissement du registre (anti-D-020/D-023), corpus
  manuel (perd la provenance-modèle, non-négociable 14), refus comptés
  comme compilations (réinterprétation d'un critère dur).
- **Décision (propriétaire, 2026-08-28)** : **ré-émission LLM → corpus-v2**,
  avec les principes suivants :
  1. `corpus-v2/` créé **À CÔTÉ** du corpus v1 — **v1 absolument intouché,
     byte-identique** (témoin gelé de la Phase 2, L2) ;
  2. le **corpus ACTIF** (v2) porte le critère de Phase 4 — lecture
     consignée de « tout le golden corpus » ;
  3. mêmes **12 intentions fixes** (comparabilité v1↔v2, 12 domaines,
     3 classes commerce), même pipeline d'émission par sections, même
     modèle (`claude-opus-5`, ARCHITECTURE §28 — témoin du chemin de
     production) ;
  4. prompt enrichi des **digests du registre de Smart Blocks** (allowlist,
     schémas de props, liaisons d'entité, appariements F1/F2) — remède
     prouvé 12/12 sur les capabilities ;
  5. **`design.overrides` ABSENT/VIDE en v2** : le vocabulaire d'overrides
     n'a pas encore de pont validateur (différé D-021) — on n'émet pas ce
     qu'on ne sait pas valider ; évolution future par porte consciente ;
  6. **round-trip NON exigé pour v2** : sa garantie (D-019) est structurelle
     au schéma, inchangé (`AIR_SCHEMA_VERSION 1.0.0`) ; aucun critère de
     Phase 4 ne l'exige ;
  7. validation locale fail-closed aux **4 validateurs** (schéma strict,
     sémantique, capabilities, **blocs**) — 0 diagnostic exigé 12/12 ;
     réparation **bornée** (1 passe ciblée) ; échec → cause démontrée et
     STOP, jamais de boucle aveugle ;
  8. **priorité propriétaire : la réussite prime sur l'économie marginale**
     — estimation 8-14 $, enveloppe 20-30 $ acceptée, **plafond dur codé
     25 $** ; dépassement anormal → STOP et rapport.
- **Critères de réussite (déclaratifs, vérifiés au rapport)** : 12/12 émis
  et valides aux 4 validateurs · 12 domaines/3 classes commerce ·
  ids/slugs uniques · overrides vides · CI sans réseau verte · **v1
  byte-identique prouvé** · bruts journalisés · coût ≤ enveloppe.

## D-026 — ARBITRAGE PHASE 4 : architecture du compilateur déterministe v1 (TRANCHÉ, 2026-08-28)

- **Contexte** : dossier d'options complet présenté avant toute
  implémentation (D-017), instruit sur l'état réel vérifié : corpus ACTIF
  v2 (D-025), paquets gelés (D-020/D-024, tokens 1.0.0 scellés), schéma
  `project.lock` 1.0.0 existant SANS résolveur ni release train, contrainte
  3.4 consignée (écran généré = ScreenShell + blocs), builds émulateur
  locaux prouvés à 0 $.
- **Décision (propriétaire, 2026-08-28) — FEU VERT Phase 4** avec priorité
  robustesse/déterminisme/preuve sur l'économie artificielle :
  1. **A1 — OPTION C : hybride canonique** — code structurel généré
     (écrans TSX composant ScreenShell + blocs, points de slots) + TOUTE la
     matière variable (props, libellés, fixtures, config) extraite en
     **modules de données générés par le sérialiseur JSON canonique de
     `air-schema`** (prouvé depuis la Phase 2) ; aucun contenu libre
     interpolé dans les templates de code (seuls des identifiants validés
     par les regex du schéma). Écartées : A (templates intégraux — surface
     d'échappement = risque de déterminisme) ; B (interpréteur embarqué —
     contre §6 diff/debug/audit, complique les Code Slots Phase 9, tension
     D-002).
  2. **S1 navigation — NON TRANCHÉ SUR PAPIER** : micro-banc **V4 (B-NAV)**
     d'abord (`@react-navigation/native-stack` vs `expo-router`), la
     solution démontrée meilleure est retenue ; critères : byte-stabilité
     ×10 de la sortie générée, poids ajouté, New Architecture, LOC du
     générateur, comportement back réel sur device.
  3. **S2** : données de démo = **fixtures déterministes** (PRNG seedé par
     le `contentHash` du dataset, `rowCount` lignes dérivées du schéma
     d'entité — fonction pure, zéro LLM), derrière l'**interface
     data-provider** (§15) avec implémentation locale `demo` (Supabase =
     Phase 5).
  4. **S3** : hash de sortie = **manifeste Merkle** (SHA-256 par fichier +
     manifeste canonique trié + hash racine, pas d'archive tar) ; Artifact
     Store v1 = interface + implémentation locale content-addressed.
  5. **S4** : release train v1 embarque un **gabarit Expo versionné avec
     `package-lock.json` pré-résolu** ; AUCUN `npm install` dans le chemin
     de compilation ; l'installation ne sert qu'au lancement de l'app
     témoin (hors périmètre du hash).
  6. **S5** : pas de formateur externe dans le chemin de compilation —
     règles d'émission canoniques maison (indentation fixe, ordre trié,
     LF, UTF-8 sans BOM) — patron D-021.
  7. **S6** : slots de l'AIR → **stubs typés déterministes** honorant la
     signature (implémentation réelle = Phase 9) — lecture consignée.
  8. **S7** : le compilateur v1 lie les **tokens scellés 1.0.0** ;
     `design.theme` transporté SANS effet (pont de variance différé,
     porte consciente — patron D-025/overrides) ; libellés résolus depuis
     l'AIR (`defaultAppLocale`), cliquet linguistique F3 étendu aux
     sorties du compilateur.
  9. **A3 — lecture consignée du critère** : la Phase 4 génère
     **manifestes/permissions/config native** depuis le registre
     (agrégation 2.3), PAS les implémentations de capabilities
     (Phases 5+).
  10. **A4** : release train v1 défini sur les **pins déjà démontrés**
      (harnais 3.4 / banc P-003) : Expo ~57.0, RN 0.86.3, React 19.2.3 —
      consigné comme décision consciente à la création (4.1).
- **Méthode imposée** : validations **V2–V5 AVANT construction** du
  compilateur complet (V2 micro-preuve d'empaquetage Merkle ×10 ×2
  environnements · V3 reproductibilité `npm ci` du gabarit · V4 micro-banc
  navigation · V5 protocole de preuve zéro-LLM/zéro-réseau défini avant le
  code) ; échec de validation → cause démontrée avant toute correction
  (D-018) ; aucun critère dur assoupli.
- **Dépenses** : **0 $ autorisé par défaut** — analyse préalable du dossier :
  aucun appel API ni compte externe nécessaire en Phase 4 (LLM interdit par
  le critère lui-même ; données de démo déterministes ; builds locaux ;
  store local). Toute dépense qui apparaîtrait = méthode arbitrage C
  (simulation préalable, alternatives à coût nul, démonstration de
  nécessité, STOP avant accord propriétaire).
- **Découpage de référence** : 4.0 validations V2–V5 → 4.1 release train
  v1 + résolveur AIR→lock → 4.2 gabarit Expo versionné → 4.3 émission
  écrans/navigation/thème → 4.4 manifestes/permissions → 4.5 fixtures
  déterministes + data-provider demo → 4.6 store SHA-256 + hash Merkle +
  preuve 12 docs × 10 compilations + preuve zéro-réseau → 4.7 app témoin
  iOS/Android. Aucun saut, aucune Phase 5+.
- **P0 exécuté** : clôture Phase 3 / D-025 commitée localement
  (`3955ebb`, vérifications au commit : packages tsc EXIT=0, lint 0 écart,
  246/246 tests) ; push uniquement sur accord explicite.
- **RÉSOLUTION S1 (2026-08-28, application du point 2 — micro-banc V4
  exécuté, 0 $)** : **`@react-navigation/native-stack`**, config générée
  depuis l'AIR. Mesures (`benchmarks/compiler-determinism/synthese-4.0.md`,
  fixture = navigation réelle de `resto-quartier`, apps Release, New Arch,
  devices réels) : byte-stabilité **20/20 les deux candidats** · poids JS
  ajouté (hbc) **+440/+435 k-octets** (react-navigation) contre
  **+924/+1 230** (expo-router, ×2,1–2,8) · back réel PASS des deux côtés
  (back système Android + pop par geste iOS) · LOC générateur 81 vs 65 ·
  **défaut structurel mesuré d'expo-router** : à ses versions SDK 57
  officielles, arbre npm INVALIDE (worklets 0.12.1 résolu contre ^0.7–0.10
  exigé par expo-modules-core), builds Release cassés 2/2 plateformes,
  `expo install --fix` non convergent — vert uniquement après `overrides`
  manuels vers la matrice `bundledNativeModules` (reanimated 4.5.1,
  worklets 0.10.1). Fondement du verdict : poids + robustesse de la chaîne
  de dépendances (patron D-021/D-002) ; l'unique avantage d'expo-router
  (−16 LOC de générateur) est un coût payé une fois. Conséquence 4.2 : le
  gabarit intègre `@react-navigation/native@7.3.x` + `native-stack@7.18.x`
  + `react-native-screens@4.26` + `react-native-safe-area-context@5.7`
  (versions exactes gelées au lockfile du gabarit).

## D-027 — RELEASE TRAIN v1 + résolveur AIR→lock (4.1, 2026-08-28)

- **Contexte** : Phase 4.1 (D-026, feu vert propriétaire — A4 pré-validé :
  « pins démontrés, décision consciente »). Schéma `lock.ts` **1.0.0
  INCHANGÉ** (exigence propriétaire) ; aucune zone gelée modifiée
  (vérifié mécaniquement, voir scellés).
- **RELEASE TRAIN v1 consigné** (`@deribfy/compiler`, `release-train.ts`) :
  - identité : **`rt-2026.08` / 1.0.0** ;
  - contrats embarqués : AIR 1.0.0 · registre blocs 1.0.0 (D-024) ·
    registre capabilities 1.0.0 (D-020) · tokens 1.0.0 (scellés 3.1) ;
  - **scellés Merkle des sources gelées** (fichiers triés par point de
    code, SHA-256) : blocs `b488608b…`, capabilities `6c285992…`, tokens
    (src + tokens.json) `e16ce4bf…` — **cliquet** : le test du train les
    recalcule depuis les vraies sources, toute divergence = CI rouge ;
  - toolchain (pins exacts démontrés 3.4/P-003/V3) : node 24.16.0 ·
    expoSdk 57.0.17 · reactNative 0.86.3 ;
  - dépendances du gabarit (versions INSTALLÉES ET PROUVÉES SUR DEVICE au
    banc V4, consommées en 4.2) : expo 57.0.17 · expo-status-bar 3.0.9 ·
    react 19.2.3 · react-native 0.86.3 · @react-navigation/native 7.3.18 ·
    native-stack 7.18.10 · **react-native-screens 4.26.2** (version réelle
    relevée dans l'app bancée — la plage `~4.26.0` résolvait 4.26.2) ·
    safe-area-context 5.7.0.
- **Résolveur `resolveLock(air) → ProjectLock`** : fonction PURE (zéro fs,
  zéro réseau, zéro horloge) ; **fail-closed aux 4 validateurs** (schéma
  strict zod, sémantique, capabilities, blocs — le moindre diagnostic ⇒
  `LockResolutionError`, diagnostics sourcés, jamais de lock partiel) ;
  sortie revalidée contre `projectLockSchema` (fail-closed en sortie).
- **Lectures consignées** :
  1. `resolved.capabilities[].version` = version du **CONTRAT** de
     capability (1.0.0, exacte) — la version EXACTE du paquet
     d'implémentation (plages `^x` du registre) sera figée à l'intégration
     réelle des implémentations (Phases 5+), par porte consciente ;
  2. `design.tokensVersion` ABSENT ⇒ résolu vers la version du train
     (c'est le rôle du résolveur : l'AIR exprime l'intention, le lock
     fige) ; présent et ≠ train ⇒ REFUS `TOKENS_VERSION_MISMATCH` ;
  3. `resolved.providers` = **[]** en 4.1 — première abstraction provider
     réelle (data/demo, S2) câblée en 4.5 par évolution consciente ;
  4. `resolved.blocks[].integrity` = SHA-256 canonique de {blockType,
     version du contrat, version du registre, scellé des sources du train}
     — l'identité de l'artefact que le compilateur copiera (D-007) ; si
     4.3 fait émerger un hash d'artefact copié par bloc, évolution
     consciente consignée ;
  5. sous-chemin d'export **`@deribfy/blocks/registry`** ajouté au paquet
     blocs (évolution consciente ANTICIPÉE par D-025 : module PUR, l'index
     tire react-native) — aucun contrat gelé touché, cliquet D-024 vert.
- **Preuves (2026-08-28)** : paquet `@deribfy/compiler` — tsc EXIT=0, lint
  bloquant 0 écart, **26/26 tests** : corpus ACTIF v2 **12/12 résolus**
  (lock conforme au schéma 1.0.0, airHash contre-calculé, vocabulaire ⊆ 6
  blocs, capabilities toutes résolues triées) · **déterminisme** : 3 rejeux
  + permutation récursive des clés d'entrée ⇒ lock byte-identique 12/12
  (l'inter-processus/environnements de la chaîne canonique est prouvé par
  V2) · **fail-closed** : blockType inconnu, capability inconnue,
  tokensVersion ≠ train, document hors schéma — refus nets sourcés ·
  **corpus v1 GELÉ : 12/12 REFUSÉS** (la mesure D-025 rejouée au résolveur
  réel) · scellés des 3 paquets gelés vérifiés. Packages **272/272** ; web
  intact après changement de lockfile : tsc EXIT=0 + suite complète verte.

### D-027-R42 — Gabarit versionné intégré au train (4.2, 2026-08-28)

- **Gabarit `packages/compiler/template/`** (5 fichiers, liste exacte sous
  test) : `package.json` (dépendances = `templateDependencies` du train,
  EXACTES) · **`package-lock.json` PRÉ-RÉSOLU** (généré ×2 →
  byte-identique `eb00f94a…`, adopté ; 237 Ko) · `index.ts` ·
  `tsconfig.json` (patron harnais 3.4) · `.gitignore`.
- **Lectures consignées** :
  1. **identité npm FIXE** (`deribfy-generated-app`/0.0.0) — l'identité
     d'une app générée vit dans `app.json` (émis depuis l'AIR en 4.4),
     jamais dans le nom npm : un nom par app invaliderait le lockfile
     partagé (`npm ci` exige la cohérence package ⇔ lock) ;
  2. le gabarit ne contient **ni `App.tsx` ni `app.json`** — tous deux
     émis par le compilateur (4.3/4.4) ; la fumée de preuve utilise des
     fichiers jetables hors gabarit ;
  3. **zéro script** npm dans le gabarit (politique §8 `--ignore-scripts`).
- **Train étendu** : champ `templateHash` (Merkle des 5 fichiers,
  `1296e246…`) — test de garde le recalcule ; éditer le gabarit sans
  éditer consciemment le scellé = CI rouge (patron des scellés D-027).
- **Preuves (2026-08-28, `results/v42-gabarit.jsonl`, 0 $)** :
  `npm ci --ignore-scripts` ×2 environnements sur copies du gabarit réel →
  **22 641 fichiers, arbres node_modules IDENTIQUES 2/2**, lockfile intact ;
  **fumée `expo export` ios+android EXIT=0**, 1 bundle Hermes par
  plateforme (le jeu de versions verrouillé bundle réellement) ; chaque pin
  du train résolu à l'identique dans le lockfile (test CI sans réseau) ;
  compiler **34/34**, packages **280/280**, tsc/lint 0 ; zones gelées 0
  modification (scellés verts) ; racine/web hors périmètre (aucun fichier
  partagé touché).

## D-028 — Émetteur 4.3 : écrans/navigation/thème + copies embarquées (2026-08-28)

- **Contexte** : 4.3 (D-026 : Option C, ScreenShell obligatoire — leçon
  3.4, navigation = verdict S1). Implémenté dans `@deribfy/compiler` :
  - **`emit-project.ts`** : `emitProject(air)` PUR — résolution du lock
    (fail-closed 4 validateurs) PUIS émission : `App.tsx` (ThemeRoot +
    DataRoot + Navigation), `navigation.tsx` + `nav.data.ts` (native-stack,
    config explicite, patron prouvé V4), par écran `screens/<id>.tsx`
    (code STRUCTUREL : ScreenShell + séquence de blocs lisible, zéro
    contenu libre interpolé) + `screens/<id>.data.ts` (module canonique
    TYPÉ `AirScreenData` — tsc valide la forme des données émises) ;
  - **copies embarquées** (D-007) : `embed-lib.ts` (jeu EXACT de 11
    fichiers + réécritures d'imports fail-closed — 1 occurrence exigée) +
    `embedded-assets.generated.ts` (codegen patron 3.1, **non-dérive
    testée** contre les vraies sources) — blocs (components/contracts),
    primitives (5 fichiers), tokens (`theme.generated` + index pur),
    runtime compilateur ;
  - **runtime copié** (`runtime/`) : `air-runtime.tsx` — pont UNIQUE testé
    données canoniques ⇄ contrats gelés (6 wrappers typés AirHeader/
    AirButton/AirEmptyState/AirDetailHeader/AirList/AirForm, dispatch
    d'actions, navigation liste→détail par `route.params.itemId`) ;
    `data-provider.tsx` — interface §15 + `EMPTY_DATA_PROVIDER` (impl
    `demo` = 4.5).
- **Lectures consignées** :
  1. **libellés de champs de formulaire = `field.name` de l'AIR** (l'AIR
     v1 ne porte AUCUN libellé humain de champ — vérifié sur schéma et
     corpus) : donnée AIR, jamais texte moteur (F3) ; libellés localisés =
     évolution d'AIR future par porte consciente ;
  2. effets d'actions **non-navigate** (capability/mutation/slot) =
     **no-op structuré** en v1 compilateur (implémentations Phases 5+/9) ;
     `navigate` intégralement câblé ;
  3. **deux actions UI sur un même bloc = refus net**
     `EMIT_UI_ACTION_AMBIGUOUS` (comportement non spécifié par l'AIR ;
     corpus v2 mesuré : 0 cas ; testé par document construit) ;
  4. `route.title` OPTIONNEL (fait du schéma) → **repli déterministe sur
     le titre de l'écran cible** (requis) ;
  5. liste vide SANS `emptyTitle` → état `ready` (le moteur n'invente
     jamais de texte d'état — F3) ;
  6. **syntaxe TS EFFAÇABLE uniquement** dans les sources moteur (pas de
     parameter properties) : les bancs exécutent les sources sous le
     strip-only de Node [démontré : ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX].
- **Gabarit ré-scellé DEUX FOIS (évolutions conscientes, preuves
  rejouées à chaque fois — aucune preuve antérieure conservée)** :
  1. `allowImportingTsExtensions: true` au tsconfig — exigé par les copies
     (`./contracts.ts`), démontré sur artefact (expo/tsconfig.base ne le
     pose pas, règle TS5097) ;
  2. devDependencies EXACTES `typescript@5.9.3` + `@types/react@19.2.15`
     — l'Oracle §9 exécute `tsc` strict DANS la sandbox du projet généré
     (§8 install→typecheck) ; démontré au banc : sans elles, `npx tsc`
     résout le paquet-piège `tsc` puis TS7016 (react sans types ; RN 0.86
     livre les siens). Champ `templateDevDependencies` ajouté au train ;
     lockfile regénéré **×2 byte-identique** à chaque évolution ;
     **preuves v42 REJOUÉES** sur le gabarit final : npm ci ×2 → **22 796
     fichiers, arbres IDENTIQUES 2/2**, lockfile intact, fumée export OK.
- **Preuves 4.3 (2026-08-28, `results/v43-emission.jsonl`, 0 $)** :
  émission **déterministe 12/12** (3 rejeux + permutation récursive des
  clés ⇒ projet byte-identique) · structure 12/12 (ScreenShell partout,
  chaque bloc de l'AIR référencé, LF/UTF-8) · non-dérive des copies ·
  fail-closed (document invalide → résolveur ; ambiguïté UI → EmitError) ·
  **projets générés RÉELS : `tsc --noEmit` strict EXIT=0 sur 3 documents**
  (resto-quartier, agence-immo, boutique-mode — émission + copies +
  runtime + données typent ENSEMBLE) · **`expo export` ios+android OK**
  (resto-quartier, 1 bundle Hermes/plateforme) · compiler **54/54** ·
  packages **300/300**, tsc/lint 0 · zones gelées 0 modification (scellés
  verts) · racine/web hors périmètre.

## D-029 — Manifestes/permissions/config native (4.4, 2026-08-28)

- **Contexte** : 4.4 (lecture A3 de D-026 : manifestes OUI, implémentations
  de capabilities NON). Implémenté : `emit-manifests.ts` câblé dans
  `emitProject` — `app.json` + `manifests/permissions.manifest.json`
  (artefact canonique d'audit pour l'Oracle §9 — diff permissions vs AIR —
  et le Compliance Generator §18).
- **Émission `app.json`** : identité de PREVIEW déterministe
  `com.deribfy.preview.<slug>` (iOS tel quel ; Android tirets→underscores,
  préfixe `x` si le slug commence par un chiffre — D-013, identité BYO =
  Phase 12) · permissions Android = agrégation TRANSITIVE du registre
  (`inducedPermissionsFor`, 2.3), à l'identique · textes iOS
  NS*UsageDescription = raisons LOCALISÉES déclarées de l'AIR (données,
  jamais texte moteur — F3 ; induite non déclarée = refus
  `EMIT_PERMISSION_REASON_MISSING`, défense derrière le validateur) ·
  **config native appliquée** : plugin `expo-build-properties` avec
  `max(plancher du train, exigence air.native)` — champ `platformFloors`
  ajouté au train (mesuré sur le prebuild du banc V4 : Android minSdk 24,
  iOS deploymentTarget 16.4) · `scheme` émis ssi capability `deep_links` ·
  `newArchEnabled` true, portrait, `userInterfaceStyle` light (S7),
  `version` **1.0.0** (lecture : version initiale — le versionnement vit
  au deployment state, Phases 11+).
- **Gabarit ré-scellé (3ᵉ évolution consciente)** : + dépendance
  `expo-build-properties@57.0.15` EXACTE (bundledNativeModules SDK 57) —
  nécessité DÉMONTRÉE : 10/12 documents exigent minAndroidSdk 26 > plancher
  24, seul mécanisme Expo officiel ; lockfile regénéré ×2 byte-identique ;
  cliquet des pins édité consciemment ; **preuves v42/v43 REJOUÉES** sur le
  gabarit final (npm ci ×2 → 22 828 fichiers, arbres identiques 2/2 ; tsc
  strict EXIT=0 ×3 docs ; exports OK).
- **Faits de schéma consignés** : `native.minAndroidSdk`/`minIosVersion`
  REQUIS (pas de repli) ; `air.permissions` porte des raisons localisées
  par plateforme — source des textes iOS.
- **Preuves (2026-08-28, `results/v44-manifests.jsonl`, 0 $)** :
  **prebuild Android réel sur resto-quartier** : POST_NOTIFICATIONS présent
  dans l'AndroidManifest ✓ · **minSdk 26 réellement appliqué**
  (gradle.properties) ✓ · package preview ✓ · `expo export` avec l'app.json
  ÉMIS : EXIT=0 ✓ · tests CI sans réseau 12/12 (app.json conforme :
  permissions = recompute indépendant, infoPlist couvert, plancher max,
  scheme ssi deep_links ; manifeste canonique = recompute) + défense
  EMIT_PERMISSION_REASON_MISSING testée · compiler **67/67** · packages
  **313/313**, tsc/lint 0 · zones gelées 0 modification.

## D-030 — Fixtures demo déterministes + provider demo (4.5, 2026-08-28)

- **Contexte** : 4.5 (D-026 S2 — alternative LLM analysée et écartée au
  dossier : nécessité non démontrée, 0 $). Choix structurant : les lignes
  de démo sont générées **À LA COMPILATION** (module canonique
  `demo.data.ts`, TYPÉ `DemoData`) — elles entrent dans le périmètre du
  hash 10/10 de 4.6 ; le runtime copié (`demo-provider.ts`) ne fait que
  les servir derrière l’interface §15.
- **Génération** (`demo-fixtures.ts`, fonction PURE) : PRNG mulberry32
  seedé par `contentHash` (32 bits de tête) ; `rowCount` lignes par
  dataset, cumulées par entité ; **ids de lignes PAR ENTITÉ**
  (`<entityId>_row_<n>` — cohérence des champs `reference`, y compris à
  datasets multiples) ; valeurs par type : string/text = `nom-de-champ n`
  (DONNÉES AIR + numéro, jamais texte moteur — F3, patron D-028) ·
  number/decimal/boolean = PRNG · date/datetime = arithmétique pure sur
  base FIXE 2026-01-01 (zéro horloge) · enum ∈ `enumValues` (AIR) ·
  reference = id de ligne réel de l’entité cible (vide si aucun dataset) ·
  asset = vide (Content Pipeline §19, phases ultérieures) · json = `{}`.
- **Provider demo** : `buildDemoProvider(demoData)` ; `getInstance` sans
  paramètre = PREMIÈRE ligne (écran de détail sans param — déterministe) ;
  `EMPTY_DATA_PROVIDER` reste exporté (contrat).
- **Preuves (2026-08-28, 0 $)** : v43 REJOUÉE fixtures incluses — tsc
  strict EXIT=0 ×3 projets générés (26 fichiers émis), export Hermes
  ios+android OK · tests CI 12/12 : rowCount respecté par entité, énums ∈
  enumValues, références → lignes réelles, ids uniques ; déterminisme
  couvert par le hash de projet (rejeux + permutation) · compiler
  **79/79** · packages **325/325**, tsc/lint 0 · zones gelées 0
  modification. Anomalie corrigée sur preuve : extraction JSON du TEST
  (marqueur trop lâche) — défaut de test, pas d’émetteur.

## D-031 — Store SHA-256 + hash Merkle + CRITÈRE DUR PROUVÉ (4.6, 2026-08-28)

- **`compileProject(air)` PUR** : gabarit scellé EMBARQUÉ (codegen
  `embedded-template.generated.ts`, non-dérive testée + cohérence avec le
  scellé du train) + émission 4.3-4.5 → projet COMPLET ; collision de
  chemins gabarit⇋émission = refus net ; **manifeste Merkle canonique**
  (entrées {path, sha256} triées, airHash, train) ; **hash racine =
  SHA-256 du manifeste** = LE hash du critère dur.
- **Artifact Store v1** (§24) : interface + implémentation LOCALE
  content-addressed (`ab/abcdef…`) — SEUL module du paquet à toucher le
  fs (cliquet) ; immuabilité (hash présent jamais réécrit ; divergence =
  STORE_CORRUPTION ; get re-hashe et vérifie) ; `storeCompiledProject` :
  fichiers + manifeste + lock canonique, contrôle croisé
  manifestHash ≡ rootHash ; object storage distant = provider branchable,
  aucun compte externe.
- **Preuve zéro-réseau/zéro-LLM (« prouvé par instrumentation »)** — deux
  volets : STATIQUE (cliquet CI : aucun import réseau/SDK LLM dans src/ ni
  runtime/ ; dépendances = allowlist moteur exacte — l'audit a détecté et
  corrigé une dépendance non déclarée `@deribfy/design-tokens`, consommée
  par hoisting) ; DYNAMIQUE (campagne sous harnais V5 : chaque processus
  vérifie `V5_NETWORK_FORBIDDEN_ATTEMPTS=0`, harnais absent = preuve
  invalide ; contrôle positif du harnais prouvé en 4.0).
- **CRITÈRE DUR DE LA ROADMAP : PROUVÉ (2026-08-28,
  `results/v46-critere-dur.jsonl`, 0 $)** : **12 documents × 10
  compilations en PROCESSUS SÉPARÉS** (environnements alternés :
  standard / TZ Auckland + locale turque) → **hash racine IDENTIQUE 10/10
  pour chacun des 12** · ATTEMPTS=0 aux 120 runs · artefacts au store
  SHA-256, round-trip manifeste vérifié à chaque run · le critère est
  AUSSI exercé en continu en CI (12×10 in-process,
  `compile-project.test.ts`). Compiler **88/88** ; packages **334/334** ;
  **web intact après lockfile** (tsc EXIT=0 + 221 fichiers / 4071/4071) ;
  zones gelées 0 modification. Reste pour clore la Phase 4 : **4.7 — app
  témoin lancée sur émulateurs iOS et Android**.

### D-031-R47 — App témoin + correction de composition ; PHASE 4 : CRITÈRES TOUS SATISFAITS (4.7, 2026-08-28)

- **Défaut de composition DÉMONTRÉ sur device** (hiérarchie Maestro à
  l'appui) : la FlatList du bloc `list` GELÉ (Section non-flex) s'étendait
  sans borne dans le shell → blocs post-liste hors écran, inatteignables —
  même famille que la leçon 3.4. **Correction compilateur (aucune zone
  gelée touchée)** : l'écran généré est une **page défilante** (ScrollView
  autour de la pile de blocs). **Réserve consignée** : virtualisation de
  la FlatList interne neutralisée (négligeable en preview ; revisité au
  scorecard qualité, Phase 8). **Preuve v46 REJOUÉE après correction**
  (aucune preuve antérieure conservée) : 12×10 → 10/10 partout,
  ATTEMPTS=0, nouveaux hashes journalisés.
- **App témoin (resto-quartier / « maquis-express »)** : projet écrit
  DEPUIS `compileProject` (rootHash `343a94d9…` ; le rootHash de la
  campagne re-prouvé au passage), `npm ci`, **builds Release iOS et
  Android EXIT=0**, **lancée sur les DEUX émulateurs** ; parcours Maestro
  PASS ×2 : écran d'entrée → **fixtures compilées RENDUES** (ligne
  `ent_plat_row_1`) → scroll de page → **action `navigate` réelle**
  (bouton → scr_panier) → retour (back système Android / pop par geste
  iOS) ; 4 captures versionnées (`results/v47-captures/`). Anomalie de
  préparation corrigée : appId supposé au lieu du slug réel de l'AIR
  (`maquis-express`) — défaut du protocole de test, pas du compilateur.
- **CRITÈRES DE SORTIE PHASE 4 (ROADMAP) — TOUS SATISFAITS** :
  1. ✅ corpus ACTIF (v2, lecture D-025) : 10 compilations → hash
     identique 10/10 sur les 12 documents (processus séparés, env
     alternés — `v46-critere-dur.jsonl`) ;
  2. ✅ app témoin compilée LANCÉE sur émulateurs iOS ET Android
     (parcours + captures — `v47-app-temoin.jsonl`) ;
  3. ✅ artefacts au store SHA-256 (immuable, round-trip vérifié aux 120
     runs) ;
  4. ✅ aucun appel LLM dans le chemin de compilation, PROUVÉ PAR
     INSTRUMENTATION (cliquet statique CI + harnais dynamique V5,
     ATTEMPTS=0 aux 120 runs, contrôle positif 4.0).
  Coût API total Phase 4 : **0 $** (conforme à l'analyse D-026).
  **Clôture de la phase = constat propriétaire** (règle du chantier).

## ~~P-003~~ → D-021 — Lib de styling RN : **StyleSheet + tokens maison** (TRANCHÉ, 2026-08-27)

- **Contexte** : décision prise par le propriétaire le 2026-08-27 sur dossier
  complet — banc P-003 exécuté sur **4 candidats** (protocole versionné,
  2 plateformes, builds Release, New Architecture), puis **étendu à
  6 candidats** après revue de paysage indépendante (sources primaires :
  npm, GitHub, doc Expo, State of React Native 2025). **Aucune mesure
  initiale rejouée, protocole NON modifié**, audit de conformité vert
  avant extension. Mesures brutes versionnées : `benchmarks/styling/results/`
  (`ios.jsonl`, `android.jsonl`, `ios-extension.jsonl`,
  `android-extension.jsonl`, `poids-*.txt`, `rtl/`, `parite/`,
  `synthese-P-003.md`, `synthese-P-003-extension.md`).
- **Problème** : quelle couche de styling concrète implémente les primitives
  du design system (ARCHITECTURE §22), sachant que le choix ne doit jamais
  fuiter dans les CONTRATS de primitives (lib remplaçable).
- **Options mesurées (6)** — égalité stricte sur RTL **6/6**, New Architecture
  **6/6**, étanchéité contractuelle **6/6**, fluidité (0 frame > 34 ms partout) :

  | Candidat | Bascule thème (iOS/Android) | Bundle JS | .app / APK | LOC |
  |---|---|---|---|---|
  | **StyleSheet + tokens** | **33,3 / 43,9 ms (2 frames)** | **réf 1 436 Ko** | **réf** | 153 |
  | @shopify/restyle 2.4.5 | 66,7 / 66,9 ms | +20 Ko | +16 / +12 Ko | 170 |
  | uniwind 1.11 (moteur libre) | 83,3 / 55,8 ms | +292 Ko | +288 / +228 Ko | 83 |
  | react-native-unistyles 3.3 | 33,3 / 38,2 ms | +156 Ko | +5 080 / +8 956 Ko | 138 |
  | nativewind 4.2.6 | 33,2 / 87,2 ms | +1 088 Ko | +9 776 / +11 140 Ko | 94 |
  | tamagui 2.7.7 | 166,7 / 175,9 ms (10 frames) | +5 512 Ko | +6 052 / +4 744 Ko | 168 |

- **Décision (propriétaire, 2026-08-27)** : **`StyleSheet` + tokens maison**,
  finalistes écartés : Restyle (2ᵉ), Uniwind libre (3ᵉ).
- **Raisons** :
  1. Il gagne **les deux seuls axes que le banc discrimine réellement** —
     poids (plancher absolu) et bascule de thème (2 frames sur les deux
     plateformes) — et il est à égalité sur tout le reste. **Le TTI ne
     discrimine pas** : dispersion inter-runs mesurée à **±37 %** (3
     observations par nouveau candidat), du même ordre que les écarts.
  2. **Zéro dépendance, zéro licence, zéro plugin, zéro étape de build** dans
     le chemin qui doit produire, en Phase 4, **10 hash de sortie identiques
     sur 10**.
  3. **Détection des fautes à la compilation [démontré]** : une faute de token
     produit une erreur `tsc` (avec suggestion), là où la famille
     utility-first laisse passer `bg-surfacee p-mdd` **silencieusement**
     (épreuve exécutée sur les trois finalistes ; `className` reste typé
     `string`, l'option `dtsFile` d'Uniwind ne génère que l'union des noms
     de thèmes — lecture du code amont).
  4. Son unique défaut mesuré — la verbosité (153 LOC) — est **payé une fois**
     : les primitives sont écrites, versionnées et testées une fois, puis
     **émises par le compilateur** et jamais éditées sur place (§3).
- **Risques consignés et mitigations** :
  1. **Tout est à notre charge** (variants, responsive, propagation de thème,
     cas limites) — aucune solution communautaire à réutiliser.
     *Mitigation* : **seuil de réexamen** — si en Phase 3 la gestion des
     variants dépasse ~250 LOC par primitive OU produit des divergences
     token↔code non capturées par `tsc`, **Restyle est ré-évalué comme couche
     de variants** ; le banc n'est pas à refaire, ses mesures sont versionnées.
  2. **Repli documenté et déjà mesuré** : Restyle (coût d'adoption dans le
     bruit : +20 Ko JS, 1 paquet, 0 dépendance transitive, variants typés dans
     le thème ; freins : cadence gelée depuis 2025-03, conflit ouvert
     Reanimated 4.4 × RN 0.86). Uniwind reste en **veille** (moteur rapide
     payant + licence CI/CD, amont v1 jeune, coût de sortie élevé).
  3. **Réversibilité** : garantie par l'étanchéité contractuelle prouvée 6/6 —
     un changement futur n'affecte ni les contrats, ni les blocs, ni l'AIR,
     seulement l'implémentation des primitives.
- **Candidats non bancés, exclusions motivées** : `react-native-css` /
  NativeWind v5 (v5 en *preview* — asymétrie de maturité, famille déjà
  représentée deux fois) · React Strict DOM + StyleX (autre catégorie :
  modèle de programmation, npm 0.0.55, réserves natives explicites du
  mainteneur — **veille Phases 3-4**) · Dripsy (dernier commit 2024-10) ·
  styled-components (maintenance mode déclaré 2025-03-17) · twrnc, Emotion,
  Zephyr (dominés ou confidentiels).
- **Réserves de cadrage consignées (non corrigées)** : Tamagui a été bancé
  avec le paquet `tamagui` (**kit UI complet**) et non `@tamagui/core` — son
  poids n'est pas concluant, sa signature de bascule à 10 frames l'est ;
  NativeWind embarque `react-native-reanimated` ; Uniwind n'a été bancé qu'en
  **moteur libre**.
- **Conséquences ROADMAP** : la dépendance « P-003 tranché » de la **Phase 3**
  est **satisfaite**. Le banc **E2E mobile** (Phase 1) devient exécutable sur
  la même fixture. **Invariants à préserver en Phase 3** (déjà exigés par
  §22 et les critères de sortie de la phase, rappelés ici comme conditions
  d'acceptation) : (a) `tokens.json` = **source unique**, le CSS web et le
  thème RN en sont des **sorties** de codegen, jamais des sources ; (b) aucun
  type ni concept de la couche de styling dans les CONTRATS de primitives ;
  (c) `design.overrides` de l'AIR contraint aux **clés de tokens** du schéma
  versionné, jamais à des déclarations de style libres.

## ~~P-004~~ → D-032 — Palier preview : **PROJET PAR APP (B)** (TRANCHÉ, 2026-08-28)

- **Question** : les previews/free tier partagent-ils un projet Supabase
  dédié-preview (A, coût ↓) ou chaque preview a-t-elle son projet (B,
  isolation maximale) ?
- **Décision (propriétaire, 2026-08-28)** : **B — projet Supabase par
  app, y compris pour les previews**, sur dossier comparatif complet +
  mesure réelle exigée par la méthode consignée (banc Volet 3 : création→
  PostgREST **10,45-12,79 s**, teardown prouvé **~5 s**, 0 $ sur Free,
  ~10 $/mois par projet actif sur org payante, 0 $ en pause).
- **Raisons** : un SEUL mécanisme identique preview→production (cible
  D-004) ; isolation physique, blast radius = 1 app (non-négociable 21) ;
  teardown prouvé trivial (mesuré) ; leçon DEBT-073 (coût du durcissement
  d'un projet partagé) ; l'économie de A est marginale au regard des
  priorités consignées (réussite/sécurité/preuve avant coût).
- **DOSSIER D'OUVERTURE PHASE 5 — découpage validé** (feu vert
  propriétaire : « découpage proposé au dossier d'ouverture puis exécuté
  sans nouvel arrêt ») :
  - **5.1** Générateur SQL déterministe (`@deribfy/provisioner`, pur) :
    AIR → SQL complet (tables/PK/FK/CHECK énums/index/RLS/seed) au patron
    éprouvé du dépôt (idempotent-rejouable, barrières `RAISE EXCEPTION`
    fail-closed, relevés avant/après) ; corpus v2 12/12, déterminisme ×N,
    fail-closed aux validateurs ;
  - **5.2** Interface de provisioning (§15) + implémentation Supabase
    (Management API — seul module réseau du paquet, consigné) ;
  - **5.3** Cycle RÉEL prouvé sur l'org de banc : provision → application
    SQL → vérifications automatisées fail-closed (tables, RLS actif,
    comptes de seed) → **SQL archivé au store SHA-256 (réutilise 4.6)** →
    teardown prouvé ;
  - **5.4** Test d'isolation PAR TENTATIVE : 2 apps provisionnées (A, B) —
    clé de A contre B (échec attendu), clé de B contre A (échec), clé de A
    contre le CŒUR en LECTURE SEULE (échec attendu — aucune modification
    de `nexiora-ai`, une tentative de lecture non autorisée est exactement
    ce que la ROADMAP exige) ; anon vs RLS deny-by-default dans son propre
    projet (zéro ligne) ;
  - **5.5** Clôture : critères ROADMAP vérifiés, consignation, rapport.
- **Lectures consignées** :
  1. **posture RLS v1** : RLS ACTIVÉ sur toutes les tables, deny-by-default
     (zéro policy anon) — les policies applicatives arrivent avec
     l'implémentation réelle des capabilities/auth (phases ultérieures,
     porte consciente) ; le provisioning et ses vérifications passent par
     le rôle de service ;
  2. **seed = fixtures déterministes D-030** (mêmes lignes que l'app —
     INSERT idempotents `ON CONFLICT DO NOTHING`) ;
  3. nommage : table = `id` d'entité (préfixé, stable) ; types AIR→SQL
     figés (string/text→text, number→bigint, decimal→numeric(12,2),
     boolean, date, datetime→timestamptz, enum→text+CHECK,
     reference→text+FK, asset→text, json→jsonb) ; relations
     many_to_many → table de jonction déterministe ;
  4. cycles réels sur l'**org de banc dédiée** (free, 0 $, 2 places —
     suffisant pour 5.4), teardown systématique en fin d'épreuve ;
  5. exécution SQL via l'endpoint query de la Management API si
     disponible [à sonder en 5.3], sinon repli consigné.
- **Budget Phase 5 : 0 $** (org free ; aucun LLM). Toute dépense
  imprévue = STOP propriétaire (méthode arbitrage C).

### D-032-R55 — PHASE 5 CLOSE : critères tous satisfaits (2026-08-28)

- **5.1-5.2** : `@deribfy/provisioner` (générateur SQL pur — 16 tests,
  12/12 corpus, déterminisme rejeux+permutation, fail-closed ; interface
  §15 + impl Management API).
- **5.3** : cycles RÉELS prouvés ×2 apps ×2 campagnes — provision, SQL
  appliqué (barrières internes), vérifs indépendantes (tables exactes,
  RLS 100 %, seeds exacts), **rejouabilité**, teardown prouvé (critère
  établi : DELETE accepté + absence du relisting), **SQL archivé au store
  SHA-256** (hashes journalisés, artefacts versionnés).
- **5.4 STRICT** : org de banc passée en **PRO par le propriétaire**
  (GO 2026-08-28 — lève la limite démontrée de 2 projets free actifs par
  compte) ; politique de plans du provider mise à jour en conséquence
  (free|pro autorisés, autres = STOP). **A et B vivants simultanément** :
  clé A→B **refusée**, clé B→A **refusée**, app↛cœur ×2 (lecture seule,
  401), cœur↛app ×2, deny-by-default anon ×2 (200/0 ligne, seeds côté
  service) — preuves journalisées.
- **Mesure consignée** : provisioning sur org PRO = **164-206 s** (contre
  ~9,5 s mesurés sur Free) — donnée Budget Governor / planification
  Phase 8.
- **Garde-fous vérifiés** : `nexiora-ai` jamais touché (refus par
  construction) · aucun secret journalisé · suppression limitée aux refs
  créés par le run · teardown en finally · aucun push.
- **Coût réel Phase 5** : 0 $ de dépense engagée par le chantier
  (projets éphémères couverts par le crédit compute de l'abonnement Pro
  décidé et souscrit par le propriétaire).
- **CRITÈRES DE SORTIE ROADMAP — TOUS SATISFAITS** : cycle
  provision→vérification fail-closed→teardown prouvé ✅ · isolation par
  tentative (A↛B, B↛A, ↛cœur) ✅ · SQL archivé comme artefact ✅.
  **Clôture = constat propriétaire.**

## ~~P-005~~ → D-014 — Monorepo à workspaces (TRANCHÉ, 2026-08-27)

- **Problème** : où faire vivre le moteur de génération (paquets AIR,
  primitives, blocks, compilateur, registre, runtime…) alors que le dépôt
  est une application Next unique dont les cliquets et la config de test
  sont calibrés pour cette seule app.
- **Options étudiées** : (a) monorepo à workspaces npm dans le dépôt
  existant ; (b) dépôt moteur séparé ; (c) paquets ajoutés à la racine sans
  déplacer l'app (écarté : racine ambiguë app/workspace, hors plan).
- **Décision (propriétaire, 2026-08-27)** : **(a) monorepo à workspaces** —
  recommandation Claude Code adoptée.
- **Raisons** : repository unique ; frontières de packages explicites ;
  outillage et CI communs ; tests inter-packages ; refactors atomiques ;
  visibilité des dépendances ; cliquets d'architecture couvrant l'ensemble
  du système ; continuité avec le centre de contrôle
  `docs/mobile-generation/`.
- **Conséquences** : l'app web est déplacée EN BLOC dans `apps/web/`
  (src, public, supabase, scripts, documentation, measures, docs produit,
  configs) — mesuré : tous ses couplages de chemins sont relatifs au paquet
  (`__dirname`/`REPO_ROOT` calculés), donc aucun cliquet ni script n'est
  modifié ; `packages/` accueillera les paquets moteur à partir des
  Phases 2+ ; lockfile unique à la racine ; CI exécutée dans le workspace ;
  les tests s'exécutent avec cwd = `apps/web` (quatre cliquets utilisent
  `process.cwd()`).
- **Risques consignés** : (1) **Vercel : Root Directory du projet doit être
  réglé sur `apps/web` AVANT tout déploiement de cette structure** — sans ce
  réglage, le build de production échouera ; `vercel.json` (crons) suit
  l'app et sera lu depuis le Root Directory. (2) Le lockfile racine est
  régénéré pour la structure workspace (grosse diff attendue, sans
  changement de versions applicatives hors SDK déjà mis à niveau).

## P-006 — Domaine du Vertical Slice 2

- **Candidat** : réservation/suivi simplifié de conteneurs maritimes
  (l'exemple canonique hors-template du mandat).
- **Tranché par** : décision produit avant la Phase 10.
