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

### D-036-R8B — Phase 8 / Étape B : builds EAS réels + 1er relevé du banc coûts EAS (2026-08-28)

- **Compte Expo créé par le propriétaire** (`deribfy-apps-team`, robot
  `deribfy-builds`, token hors dépôt) — action manuelle signalée, faite.
- **Projet EAS** `@deribfy-apps-team/maquis-express` créé et lié.
- **BUILDS EAS RÉELS, 0 $ (palier Free), aucun compte Apple** :
  **Android** profil `preview` (distribution interne, APK) — **FINISHED en
  10 min 57 s**, artefact 77,2 Mo ; **iOS** profil `preview-simulator` —
  **FINISHED en 4 min 07 s**. Soumissions : 49 s / 38 s.
- **Artefact EAS VALIDÉ** : l'APK produit par EAS a été installé sur
  l'émulateur et les **flows générés depuis l'AIR passent 2/2** (nav+RTL,
  13 étapes, 0 échec) — ce n'est donc pas seulement un build qui compile,
  c'est un artefact qui FONCTIONNE.
- **Banc « coûts EAS » (Phase 1, volet 2) — PREMIER RELEVÉ RÉEL** consigné
  (`slices/restaurant/results/eas-builds.jsonl`). Le protocole demande
  « 5 builds par plateforme minimum » : le banc reste **partiellement
  exécuté** (1+1), sans cache mesuré ni série — statut inchangé tant que
  la série n'est pas faite. **Aucune réinterprétation du protocole.**
- **DETTE DU GÉNÉRATEUR (garde-fou ROADMAP) — 3 écarts manuels** : le
  gabarit ne porte ni `eas.json`, ni `owner`/`extra.eas` dans l'`app.json`
  émis, ni `expo-dev-client`. Conséquence factuelle : **un « dev build »
  au sens Expo est impossible sans modification manuelle** ; le slice a
  utilisé la distribution interne. Consignés, non corrigés (zones scellées
  intactes).
- **Limite iOS constatée** : un build iOS **pour appareil physique** exige
  des credentials Apple (compte Apple Developer) — le build simulateur ne
  l'exige pas. Aucune dépense engagée.

## D-038 — Adhésion Apple Developer : dépense autorisée et engagée (2026-08-29)

- **Décision propriétaire (2026-08-29)** : souscrire à l'**Apple Developer
  Program**. Montant réellement débité : **135 $ CA** (99 $ US), statut
  Apple « **en attente** » au moment de la consignation (traitement annoncé
  ≤ 48 h). **Première dépense d'infrastructure du chantier mobile**
  (jusqu'ici : LLM ≈ 17,4 $, tout le reste sur crédits gratuits).
- **Raison consignée (propriétaire)** : l'adhésion est **inévitable en
  Phase 12** — critère de sortie « *une app de slice soumise TestFlight
  sous un compte BYO de test* » (ROADMAP l.168), impossible sans compte
  Apple Developer. La souscrire maintenant **anticipe** une dépense
  obligatoire à quatre phases d'échéance, au lieu de la gaspiller.
- **Déclencheur immédiat** : toutes les voies gratuites vers l'iPhone 16
  physique ont été **épuisées et démontrées fermées** — USB (DET-012 : port
  de données muet, câble et port du Mac innocentés par test de contrôle
  avec le Galaxy) ; Expo Go (DET-013 : SDK de l'App Store en retard sur le
  release train, **non modifié** conformément au garde-fou).
- **Ce que l'adhésion débloque** : enregistrement de l'appareil par
  `eas device:create` (lien/QR ouvert **sur l'iPhone**, sans USB), puis
  build iOS « appareil » et **installation par QR** — contourne
  intégralement le port défaillant.
- **Sécurité** : aucun mot de passe Apple ne sera communiqué ; l'accès
  passera par une **clé API App Store Connect** (Key ID, Issuer ID,
  fichier `.p8`) déposée **hors dépôt** en mode 600, patron des autres
  credentials du chantier.
- **Aucune tentative de paiement ne sera faite par Claude Code** ;
  l'attente d'activation est passive.

## D-037 — CORRECTION SAFE AREA + REGISTRE DE DETTES (2026-08-29)

- **Décision propriétaire (2026-08-29)** : corriger immédiatement le défaut
  Safe Area **dans le générateur**, créer un registre de dettes permanent
  dans `STATUS.md`, **sans modifier ROADMAP.md ni MASTER_PLAN.md**.
- **CAUSE (démontrée avant correction, D-018)** : fenêtre applicative bord
  à bord (`app=1080x2340`) ; le dernier bloc d'un écran était rendu en
  `[0,2213]→[1080,2340]`, bord inférieur = bas ABSOLU de l'écran, donc
  **sous la barre de navigation gestuelle** → contrôle inatteignable.
  Non reproduit sur émulateur (3 phases l'avaient manqué).
- **CORRECTION — dans le GÉNÉRATEUR, jamais dans l'artefact généré** :
  `packages/compiler/src/emit-project.ts` — le contenu défilant de chaque
  écran émis reçoit `contentContainerStyle={{ paddingBottom: insets.bottom }}`
  via `useSafeAreaInsets()`. **Fait vérifié dans le paquet installé** :
  `NativeStackView` enveloppe déjà ses écrans dans `SafeAreaProviderCompat`
  → aucun `SafeAreaProvider` à ajouter, `App.tsx` inchangé.
  `react-native-safe-area-context@5.7.0` était **déjà** au gabarit.
  **Aucune zone scellée touchée** (primitives et blocs gelés intacts).
- **PREUVE DE LA CORRECTION sur l'appareil qui a révélé le défaut**
  (Galaxy A17, SM-A175F, Android 16) : le bouton passe de
  `[2213→2340]` (bord d'écran) à **`[2078→2205]`** — 135 px au-dessus du
  bas ; **tap → navigation vers `scr_commandes` ✅** ; flows générés
  **2/2 PASS** (contre 0/2 avant).
- **DÉFAUT SECONDAIRE DÉCOUVERT ET CORRIGÉ (DET-002)** : les flows générés
  n'étaient pas robustes sur appareil physique (`scrollUntilVisible` 20 s /
  vitesse 40 expirait ; swipes directs : 1,8 s) → **faux négatif** de
  l'Oracle L2. Corrigé dans le générateur de flows (timeout 60 s, vitesse
  70) ; **`visibilityPercentage` maintenu à 100 %** : le pouvoir de
  détection d'un bloc masqué est inchangé — seule la patience augmente.
  Ce correctif ne touche PAS le projet compilé (les flows n'en font pas
  partie) : aucun hash de sortie n'en dépend.
- **VALIDATIONS REJOUÉES** (aucune preuve antérieure conservée) : packages
  **395/395** + tsc/lint 0 · **Phase 4 critère dur : 12 docs × 10
  compilations, hash identique 10/10, ATTEMPTS=0** (nouveaux hashes) ·
  émission réelle : `tsc --noEmit` strict EXIT=0 + export Hermes ios+android
  · **Phase 6.3/6.5** : pipeline sandbox vert, Oracle L1 4/4, sans secrets ·
  **Phase 7** : tâches **redéployées** + P1/P2 rejouées (bout-en-bout 5/5,
  kill -9 → reprise, **artefacts identiques**) · **Phase 8** : chaîne du
  slice verte, backend réel + teardown prouvé, build EAS refait
  (7 min 00 s), **device physique 2/2**, **émulateur Android 2/2**.
- **Nouveau rootHash du slice** : `29e0af787afe7d2d` (ancien
  `343a94d994c44b22`) — cohérent partout (compilateur, Phase 7, slice).
- **REGISTRE DE DETTES** créé dans `STATUS.md` § « DETTES OUVERTES » :
  10 entrées (ID · Description · Origine · Gravité · Échéance · Statut),
  dont **2 résolues** (DET-001 Safe Area, DET-002 flows) et **8 ouvertes**
  avec échéance de phase. Emplacement choisi parce que `STATUS.md` est relu
  obligatoirement à chaque session (règle de continuité) : **une dette
  inscrite ne peut plus être oubliée**, sans créer de règle nouvelle.

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

## D-042 (ex P-006) — Domaine du Vertical Slice 2 : SUIVI DE CONTENEURS MARITIMES (TRANCHÉ, 2026-08-29)

- **Décision propriétaire (2026-08-29)** : le domaine du Vertical Slice 2 est
  **le suivi de conteneurs maritimes**. La fiche P-006 devient donc D-042 ;
  la Phase 10 n'est plus bloquée sur ce point.
- **Pourquoi ce domaine satisfait le critère « hors-template »** : les
  12 domaines du corpus gelé sont tous des intentions de commerce ou de
  service de proximité (restauration, coiffure, mode, cours, immobilier,
  plomberie, toilettage, tutorat, billetterie, fitness, livraison,
  chantier). Le suivi de conteneurs est **logistique B2B** : pas de
  catalogue, pas d'achat dans l'app, une entité centrale suivie dans le
  temps et un besoin d'usage hors ligne sur le terrain. Il ne peut pas être
  produit par recopie d'un gabarit du corpus.
- **Protocole d'émission imposé** : celui de **D-025** — mêmes sections,
  même prompt système, mêmes niveaux de dégradation de schéma, même passe de
  réparation bornée. L'identité du prompt est **vérifiée mécaniquement** par
  le harnais de la Phase 10, qui refuse de démarrer si le texte diverge de
  celui de la campagne du corpus. Sans cela, « même protocole » ne serait
  qu'une affirmation.
- **Le corpus gelé n'est PAS étendu** : l'AIR du slice 2 est un artefact du
  slice, écrit dans `slices/conteneurs/`, jamais dans `corpus-v2/`. Le gel de
  la Phase 2 reste intact et le nombre de documents du corpus ne change pas.
- **Ancien libellé (P-006)** : « Candidat : réservation/suivi simplifié de
  conteneurs maritimes (l'exemple canonique hors-template du mandat) —
  tranché par : décision produit avant la Phase 10. »

## D-039 — EXIGENCE PRODUIT PREMIUM / ELITE 2027 A++ (NON NÉGOCIABLE, 2026-08-29)

- **Décideur** : propriétaire, arbitrage explicite du 2026-08-29.
- **Portée** : exigence **permanente et non négociable** du projet,
  applicable aux **phases restantes** à compter du 2026-08-29 (Phase 8 en
  cours incluse). **Non rétroactive** : les Phases 0-7 closes ne sont pas
  rouvertes, et leurs artefacts gelés (blocs 1.0.0 / D-024, capabilities
  1.0.0 / D-020, tokens 1.0.0, train `rt-2026.08`) ne sont pas descellés par
  la seule inscription de cette exigence.
- **Problème traité** : avant cette décision, la ROADMAP ne fixait **aucun
  niveau** de qualité UI — vérification faite, les termes « Premium »,
  « Elite », « A++ » n'y figuraient nulle part sur 204 lignes. La qualité UI
  n'y apparaissait qu'en Phase 8 (« qualité UI évaluée ») et en Phase 14
  (métrique publiée) : deux **mesures**, jamais un **seuil**. « Fonctionnel »
  pouvait donc suffire à clore une phase.
- **Décision** : l'objectif Premium / Elite 2027 A++ devient une exigence
  officielle. « Fonctionnel » ne vaut jamais acceptation si le résultat est
  manifestement inférieur au niveau visé. L'exigence ne peut être ni
  dégradée, ni repoussée, ni supprimée pour permettre une clôture de phase.
- **Rendue vérifiable par une grille de 8 dimensions** (A ergonomie
  physique · B contraste WCAG 2.2 AA · C complétude des états · D cohérence
  zéro-style-en-dur · E typographie · F internationalisation/RTL · G
  fluidité perçue et virtualisation · H variété anti-template §22), chacune
  adossée à une preuve d'une nature définie. **A++ = 8/8 conformes avec
  preuve** ; une dimension non conforme interdit la qualification et devient
  une **dette BLOQUANTE** ; une dimension non mesurable est déclarée **non
  déterminée**, jamais conforme par défaut. Ce choix évite qu'« A++ » reste
  un slogan invérifiable, et s'appuie majoritairement sur de l'outillage
  **déjà existant** (cliquets de style, rejeu RTL, harnais de rendu,
  géométrie mesurée sur appareil) plutôt que de créer du travail nouveau.
- **Inscription dans la ROADMAP** : (1) ligne « Exigence produit » dans le
  tableau de préambule, au même rang que la règle de non-assouplissement ;
  (2) section **EXIGENCE PRODUIT TRANSVERSE** en fin de document
  (définition, grille, notation, portée, limite structurelle) ; (3)
  amendements ciblés aux critères de sortie des Phases **8, 9, 10, 11, 12,
  14**. **Aucune phase n'a été réorganisée, renumérotée ni supprimée** ; la
  Phase 13 n'est délibérément pas amendée, ses critères portant sur la
  distribution et non sur la substance visuelle.
- **Conséquence sur la Phase 8, en cours — SIGNALÉE AVANT CLÔTURE** : son
  critère « qualité UI évaluée » devient « évaluée **contre la grille A++**,
  dimension par dimension, avec preuve ». **Les dimensions A à G doivent être
  CONFORMES pour clore** ; une seule non conforme bloque la clôture. La
  dimension H est portée en Phase 10 au seul motif objectif que sa mesure
  exige un second domaine.

## D-039-R1 — RÉEXAMEN : retrait de la clause de clôture avec dettes (2026-08-29)

- **Contestation propriétaire** : permettre la clôture de la Phase 8 avec des
  dimensions A++ non conformes contredit le caractère « absolument non
  négociable » de l'exigence.
- **Réexamen effectué — la contestation est FONDÉE.** Trois erreurs établies
  dans la rédaction initiale de D-039 :
  1. **Contradiction interne** : le préambule de la ROADMAP interdit de
     « repousser l'exigence pour permettre la clôture d'une phase » ;
     l'amendement de la Phase 8 repoussait la conformité en Phase 10 pour
     permettre la clôture. Les deux textes se contredisaient.
  2. **Raisonnement circulaire** : la clause d'exemption, rédigée le
     2026-08-29, était ensuite invoquée comme justification — un
     assouplissement après coup, que la règle fondatrice de la ROADMAP
     interdit explicitement.
  3. **Garde-fou mal invoqué** : le garde-fou de la Phase 8 interdit de
     rustiner un ARTEFACT pour faire passer un test ; il n'interdit pas de
     corriger le GÉNÉRATEUR. Précédent probant : **D-037**, où le défaut de
     safe area a été corrigé dans le compilateur avec rejeu intégral des
     Phases 4/6/7/8. Le gel n'a jamais signifié « incorrigible » mais
     « toute évolution passe par une décision consignée ».
- **Décision (propriétaire, 2026-08-29)** : la clause est **RETIRÉE**.
  Dimensions **A à G conformes obligatoires** pour clore la Phase 8 ; **H**
  portée en Phase 10 pour insuffisance objective de périmètre. **Une dette
  bloquante ne vaut jamais satisfaction d'un critère.**
- **Règle de périmètre inscrite** : manque d'OUTILLAGE ⇒ non reportable,
  l'outillage est produit dans la phase ; périmètre INSUFFISANT PAR NATURE
  ⇒ porté nommément à la phase où la mesure devient possible. Invoquer le
  périmètre là où seul l'outillage manque est une violation de l'exigence.
  Conséquence directe : la **dimension E** (typographie aux tailles
  d'accessibilité maximales), non mesurée faute d'instrument, **doit être
  outillée et évaluée dans la Phase 8**.
- **Limite structurelle consignée** : élever le niveau visuel au-delà de ce
  que permettent les artefacts gelés exige une évolution **design system
  v2**. Cette évolution n'a **pas** de phase dédiée dans la ROADMAP
  actuelle ; elle est rattachée à la Phase 10 par analogie avec le registre
  de capabilities v2 que cette phase alimente déjà. Si le propriétaire
  souhaite une phase dédiée, c'est un arbitrage distinct à consigner.

## D-040 — PHASE 9 : architecture des Code Slots et du Repair Loop (2026-08-29)

- **Contexte** : la Phase 9 exige « slots avec politique AST complète ;
  boucle de réparation bornée et budgétée ; juge ≠ auteur », plus une
  démonstration sur le slice 1 et une preuve par mutation des gardes AST.
  Rien de tout cela n'existait : le mot `slot` n'apparaissait que dans le
  schéma AIR et dans une non-opération commentée du runtime émis.

### Décisions structurantes

1. **Deux paquets, deux rôles.** `@deribfy/slots` porte les contrats et la
   POLITIQUE (analyse) ; `@deribfy/repair` porte la BOUCLE (décision).
   Séparer les deux permet à l'Oracle de rejouer la politique sans importer
   la boucle, et à la boucle de rester pure.
2. **AST réel, jamais d'expression régulière.** La politique s'appuie sur
   l'API du compilateur TypeScript. Preuve DISCRIMINANTE versionnée : un
   commentaire ou une chaîne contenant `fetch(` / `process.env` est ACCEPTÉ,
   alors que l'usage réel — y compris via un alias `const f = fetch` — est
   REFUSÉ. Un cliquet textuel échouerait sur les deux.
3. **Le compilateur ne juge pas.** Il émet le code d'auteur VERBATIM (son
   empreinte reste celle qui a été analysée) ; c'est l'Oracle, service
   séparé, qui refuse l'artefact. Conséquence directe : l'allowlist de
   dépendances du compilateur reste INCHANGÉE (cliquet zéro-réseau
   préservé), et le chemin de compilation reste pur.
4. **Additivité stricte.** Sans bundle de slots, la sortie du compilateur
   est identique à celle d'avant la Phase 9 — prouvé sur 12/12 documents.
   Aucun artefact de Phase 8 n'est donc touché par cette phase.
5. **Slots PURS.** La politique refuse l'horloge et l'aléa ambiants. Ce
   n'est pas une contrainte inventée : le corpus gelé (2026-08-28) fait déjà
   entrer le temps par des ENTRÉES déclarées (`horodatage`, `maintenant`).
   La politique ne fait qu'imposer mécaniquement le contrat existant.
6. **Deux nouveaux contrôles Oracle L1** — politique AST rejouée sur les
   modules émis, et intégrité octet à octet des copies (blocs, primitives,
   tokens, runtime). Le §9 les nommait depuis l'origine ; ils n'étaient pas
   implémentables avant l'existence des slots.
7. **Grille A++ instrumentée.** L'amendement D-039 de la Phase 9 exige que
   la grille soit « rejouée après réparation ». Une grille tenue à la main
   ne peut pas remplir ce rôle : `evaluateApxxGrid` la calcule sur le PROJET
   COMPILÉ, en trois états seulement, et `apxxRegressions` compare avant et
   après. Une dette déjà ouverte ne bloque rien ; une DÉGRADATION bloque.
8. **Périmètre de patch : le nœud d'AIR, pas le fichier.** Comparer les
   fichiers ne discrimine rien quand la réparation porte sur l'AIR (le
   compilateur étant déterministe, tout artefact dérivé change
   légitimement). Le gate compare donc les NŒUDS D'AIR modifiés aux cibles
   désignées par le diagnostic. Un auteur qui répare le bouton demandé mais
   en profite pour élargir le périmètre est refusé — traduction mécanique du
   non-négociable #8.
9. **VERIFY à trois conditions cumulatives** : le juge accepte ; la CAUSE
   DIAGNOSTIQUÉE a disparu ; aucune dimension A++ n'est dégradée. La
   deuxième condition est indispensable : le juge ignore ce qu'on cherchait
   à réparer, et sans elle une réparation partielle (3 slots sur 5) passerait
   pour un succès — cas prouvé par test.
10. **Auteur = port, déterministe dans cette phase.** Aucun appel LLM n'a
    été fait : les critères de sortie portent sur le MÉCANISME (diagnostic,
    gates, budget, juge indépendant), et les scénarios hostiles prouvent que
    les gardes tiennent quel que soit l'auteur — ce qui est la propriété de
    sécurité recherchée (§27). Brancher un auteur LLM réel est un
    remplacement de port, sans modification du cœur.

### Limite consignée, non contournée

L'AIR 1.0.0 déclare la SIGNATURE d'un slot mais ne lie ni ses entrées ni ses
sorties à un point d'exécution. Les modules émis sont donc réels, typés et
vérifiés (`tsc` du projet généré les contrôle), mais l'application ne les
APPELLE pas encore. Inventer ici une convention de liaison aurait été une
extension silencieuse du schéma gelé : c'est refusé, et la lacune est
consignée en **DET-018** avec son échéance.

## D-041 — PHASE 10 : abstraction provider et instruments cross-domain (2026-08-29)

- **Contexte** : la Phase 10 porte deux natures de travaux — ceux qui
  dépendent du **domaine hors-template** (non tranché, P-006) et ceux qui
  n'en dépendent pas. Les seconds ont été exécutés ; les premiers sont
  décrits au point de blocage, sans être anticipés ni simulés.

### Décisions actées

1. **La classe de provider n'est JAMAIS lue dans la chaîne libre de l'AIR.**
   Fait mesuré sur le corpus gelé : `providerClass` porte **40 valeurs
   distinctes** pour une douzaine de classes réelles (`push_gateway`,
   `push_messaging`, `push_provider`, `push_service`, `managed_push`
   désignent la même chose). S'en servir comme clé de résolution laisserait
   le LLM définir la topologie des fournisseurs — contraire au
   non-négociable #3. La classe canonique est donc **dérivée de la
   `capability` déclarée** (contrôlée par le registre gelé) ; les 8
   intégrations sans capability tombent sur une classe `backend_rest`
   unique. **Contre-épreuve versionnée** : renommer les 40 chaînes libres ne
   change RIEN au résultat de la résolution.
2. **Un provider réel par classe, plus un substitut nommé `mock`.** §15
   interdit de coder deux fournisseurs « pour le principe » : le provider
   réel est **exactement** l'implémentation que le registre de capabilities
   gelé désigne déjà, et un cliquet mécanique interdit toute divergence
   entre les deux registres.
3. **La substitution ne touche jamais l'AIR.** Prouvé au sens le plus fort
   disponible : même document, même `airHash`, **artefact compilé identique
   octet pour octet**, seul le lock enregistre le changement. Un test
   supplémentaire verrouille le fait qui rend cette gratuité possible —
   aucun fichier émis ne nomme un fournisseur concret ; le jour où ce ne
   sera plus vrai, ce test tombera et la substitution devra être re-prouvée
   au niveau de l'artefact.
4. **Le flux de provisioning devient provider-agnostique.** Une interface
   qu'aucun code partagé n'exerce n'est pas une abstraction. Le flux
   (création → santé → clé → SQL → démontage → **preuve d'absence**) est
   écrit une fois contre le contrat seul, et intègre la leçon de la Phase 8
   (démontage garanti en `finally`, plus de projet orphelin).
5. **Dimension H mesurée sur deux axes distincts.** Structure ET identité
   visuelle, parce que la mesure a montré qu'ils divergent : 12 silhouettes
   structurelles distinctes (0 collision) mais **UNE SEULE identité
   visuelle** pour 12 thèmes déclarés. Aucun seuil de similarité arbitraire
   n'a été introduit — les deux critères sont des égalités exactes.
   L'instrument ne condamne pas l'uniformité en soi : il condamne l'écart
   entre la variété **déclarée** et la variété **émise** (contre-épreuve
   versionnée : des thèmes identiques rendent le verdict conforme).
6. **Instrument de la dimension D renforcé.** Il ne mesurait que les
   couleurs hexadécimales et déclarait D conforme alors que trois des
   quatre familles nommées par le critère n'étaient pas regardées. Les
   quatre sont désormais mesurées (espacements, rayons, couleurs,
   typographie) ; les propriétés de mise en page restent hors périmètre.
   **Le code n'a pas régressé — la mesure a cessé d'être partielle.**
   Conséquence assumée : D passe à non conforme (9 valeurs en dur).

### Ce qui n'a PAS été fait, et pourquoi

- **Aucun token gelé n'a été modifié.** Les manques mesurés alimentent
  `DESIGN-SYSTEM-V2.md` ; leur adoption est P-007.
- **Aucune correction de DET-019/020/021/022/023** : toutes touchent des
  artefacts gelés ou une décision de design system.

## P-007 — Adoption d'un design system v2 (EN ATTENTE)

- **Objet** : `DESIGN-SYSTEM-V2.md` (créé en Phase 10) liste **6 manques
  mesurés**, chacun avec sa preuve exécutable : variété visuelle par app
  inexistante (DET-021), accent inutilisable en texte clair (DET-019),
  9 valeurs de style en dur (DET-022), groupes de tokens absents et absence
  d'idiomes de plateforme (DET-023), sémantique a11y du conteneur d'écran
  (DET-020).
- **Décision demandée** : ouvrir ou non un design system v2, et à quelle
  phase. Deux de ces manques (DET-019, DET-021) rendent la grille A++
  **non conforme** ; ils ne peuvent pas être résolus sans toucher aux
  artefacts gelés, ce qu'aucune phase n'autorise sans cette décision.
- **Tranché par** : décision propriétaire.

## P-008 — Capabilities v2 : manques mesurés (EN ATTENTE)

- **Mesuré sur le corpus gelé (2026-08-29)** : 14 des 15 capabilities du
  registre sont demandées par au moins un domaine (`biometrics` : jamais) ;
  **8 intégrations sur 6 domaines déclarent un backend REST qu'AUCUNE
  capability ne couvre** (`rest_api`, `rest_backend`).
- **Manque identifié** : une capability de **backend de données applicatif**
  (API REST de l'app), aujourd'hui traitée hors registre par la classe de
  provider `backend_rest`.
- **MESURE SUR LE DOMAINE HORS-TEMPLATE (2026-08-29, slice 2 émis)** — la
  réserve de méthode est levée : le domaine logistique a demandé **6
  capabilities** (`auth`, `push_notifications`, `offline_storage`, `share`,
  `analytics`, `deep_links`), **toutes présentes dans le registre v1**, et
  **0 intégration sans capability**. **Le registre gelé a donc suffi à un
  domaine hors-template** — résultat non trivial, et plutôt rassurant sur le
  critère d'inclusion v1.
- **Ce que le slice 2 confirme en revanche** : les 7 `providerClass` qu'il
  émet sont **7 chaînes libres inédites** (`managed_auth`, `push_gateway`,
  `rest_backend`, `embedded_database`, `product_analytics`, `app_links`,
  `system_share_sheet`) — aucune ne figure telle quelle dans le corpus. La
  dérive lexicale mesurée en D-041 se reproduit donc sur un domaine neuf,
  ce qui valide **a posteriori** le choix de ne jamais lire cette chaîne.
- **Reste au registre v2** : la capability de **backend de données
  applicatif** (8 intégrations `rest_api`/`rest_backend` du corpus sans
  capability ; le slice 2 a contourné en rattachant son backend REST à
  `offline_storage`, ce qui est un signal supplémentaire du manque).
- **Tranché par** : décision propriétaire.

## D-043 (ex P-007) — ADOPTION DU DESIGN SYSTEM v2 (TRANCHÉ, 2026-08-29)

- **Décision propriétaire (2026-08-29)** : adopter le design system v2. La
  fiche P-007 devient D-043.
- **Périmètre STRICT** : uniquement les manques déjà mesurés et consignés
  dans `DESIGN-SYSTEM-V2.md`. Aucun nettoyage opportuniste, aucun token
  ajouté sans consommateur réel.

### Ce que la v2 change (tokens 1.1.0 → 1.2.0, évolution MINEURE additive)

1. **Trois groupes ajoutés, chacun avec un consommateur** : `fontWeight`
   (8 graisses littérales supprimées), `space.xxs` (le pas fin du badge),
   `opacity.disabled` (l'opacité d'état désactivé). ⇒ **DET-022 résolue** :
   0 valeur de style en dur.
2. **Une valeur corrigée** : `color.light.warn` `#8A6D00` → `#866A00`.
   Ce défaut n'était pas connu — il a été révélé en élargissant les paires
   de contraste aux tons d'état sur `badgeBg` (4,34:1, sous le seuil).
3. **Deux tokens DÉRIVÉS** — c'est le cœur de la v2 :
   - `primaryText` = encre de l'accent lue sur le fond ⇒ **DET-019 résolue**
     (2,95:1 → 4,57:1) sans toucher à l'accent de marque ;
   - `onPrimary` = encre lue SUR l'accent. Ajouté APRÈS mesure : avec
     l'accent bleu du slice 2, l'encre statique tombait à **3,14:1**. Une
     encre fixe ne peut pas rester lisible sur un accent variable.
   Les deux sont **interdits à la surcharge** : les laisser fixer à la main
   rouvrirait exactement le défaut qu'ils ferment.
4. **Identité visuelle par app** ⇒ **DET-021 résolue**. Le canal n'est PAS
   inventé : `design.overrides` existe dans le schéma AIR **gelé** 1.0.0 et
   n'était simplement jamais lu. La v2 le rend effectif, avec allowlist de
   clés, valeurs validées, et re-dérivation des encres. **Conséquence
   prouvée** : n'importe quel accent produit une app conforme WCAG AA —
   la variété visuelle ne peut pas casser l'accessibilité.
5. **Ce qui n'a PAS été ajouté, et pourquoi (arbitrage DET-023)** :
   `elevation`, `motion`, `breakpoint`/`density` n'ont **aucun
   consommateur** dans le design system — les ajouter serait spéculatif, ce
   que le projet s'interdit. Pour les **idiomes iOS/Android**, l'arbitrage
   est l'**uniformité assumée** : une sortie strictement identique sur les
   deux plateformes, propriété déjà verrouillée par un test. DET-023 est
   donc close **par décision**, pas par ajout.

### DET-020 — traitée dans son périmètre réel

Le repli `accessibilityLabel ?? title` du conteneur d'écran est **retiré**.
Mesuré sur RN 0.86.3 : un conteneur non `accessible` n'expose pas son label
à VoiceOver (`accessible{false}` + `isAccessibilityElement` lié à cette
prop) ; côté Android il posait une `contentDescription` jamais mesurée sur
la racine des 47 écrans. Livrer un comportement **inerte d'un côté et non
mesuré de l'autre**, pour un bénéfice nul, est pire que ne rien livrer. La
sémantique de titre est portée par l'**en-tête natif**, qui reçoit la même
donnée AIR et n'est désactivé nulle part. L'observation « 2 écrans sur 47
dont le titre de route diffère du titre d'écran » reste consignée : c'est
une propriété du CONTENU du corpus gelé, pas un défaut du moteur.

### Défaut de générateur découvert par le slice 2 et corrigé

**Ordre d'insertion du seed** : PostgreSQL a refusé le seed du domaine
logistique (`23503 violates foreign key constraint`). Cause établie par deux
lectures indépendantes : les VALEURS de référence étaient correctes (les
fixtures tirent un identifiant réel de l'entité cible), mais les `INSERT`
étaient ordonnés **alphabétiquement** — `ent_conteneur` avant `ent_navire`.
Corrigé par un tri **topologique** déterministe (Kahn, ensemble prêt trié).
Le slice 1 ne pouvait pas révéler ce défaut : une seule de ses entités porte
un dataset, donc aucune référence entre lignes semées. **C'est exactement ce
qu'un domaine hors-template est censé produire.**

### Contrôle d'accessibilité promu au rang de CONFORMITÉ

L'Oracle L1 gagne un 7e contrôle, `contraste_wcag`, calculé sur le thème
**réellement émis** de chaque app — §22 : « accessibilité = conformité (gate
+ Oracle), pas seulement qualité ». Depuis que chaque app peut choisir ses
couleurs, le seuil doit être vérifié app par app sur l'artefact.

### Garde-fou anti-contournement de l'instrument

La liste des paires de contraste est confrontée par test aux couleurs
**réellement utilisées comme texte** dans la feuille de style émise : il
devient impossible de retirer une paire gênante pour obtenir du vert sans
retirer aussi l'usage correspondant.

## P-009 — Conditionnement des blocs et accessibilité du graphe de navigation (EN ATTENTE)

- **Origine** : trois observations faites SUR APPAREIL (Phase 8 puis Phase 10)
  décrivaient le même genre de défaut sans qu'aucune mesure n'en donne
  l'ampleur. L'instrument manquant a été produit dans la phase, comme
  D-039-R1 l'exige : `benchmarks/composition/`.
- **MESURE (2026-08-29, 13 documents / 50 écrans)** :
  - **19 écrans** portent un bloc `empty_state` à côté d'un bloc `list` qui
    possède déjà son propre état vide conditionnel ;
  - **4 écrans** exposent la **même action** par deux blocs (bouton + CTA de
    l'état vide) — le cas « Synchroniser maintenant » / « Synchroniser » du
    slice 2 en est un ;
  - **17 écrans sur 50 (34 %)** ne sont ciblés par **aucune** action
    `navigate` et ne sont pas l'écran d'entrée : rien ne permet de les
    atteindre dans l'app livrée.
- **CAUSE COMMUNE ÉTABLIE** (pas une conjecture) : le schéma AIR **1.0.0
  gelé** ne porte aucun moyen de conditionner le rendu d'un bloc
  (`blockInstanceSchema` = `id`, `blockType`, `entityId?`, `props`), et aucun
  validateur ne contrôle l'accessibilité du graphe de navigation. Les trois
  mesures sont les conséquences d'une limite de **contrat**, pas d'erreurs
  de tel ou tel document — ce que confirme leur présence sur 12 domaines du
  corpus gelé **et** sur le domaine hors-template.
- **Pourquoi cette décision est nécessaire à la Phase 10** : DET-017 porte la
  gravité « 🔴 BLOQUANTE A++ » et l'échéance « Phase 10 (volet 2 +
  conditionnement) ». La règle de la ROADMAP est sans ambiguïté : « une dette
  bloquante ne vaut JAMAIS satisfaction d'un critère ». La phase ne peut donc
  se clore ni sans traiter ce volet, ni sans le re-router **explicitement**.

### Options (analyse, non arbitrage)

| | Option | Ce qu'elle implique | Coût / risque |
|---|---|---|---|
| **A** | **Évolution du schéma AIR** — champ de condition sur le bloc (ex. `visibleWhen`), + validateur d'accessibilité du graphe | Traite la cause. Rupture de contrat gelé ⇒ **AIR 1.1.0**, re-scellement du train. **Rectifié après mesure** : les 12 fichiers du corpus restent byte-identiques (migration en mémoire), mais tous les `rootHash` changent | Le plus lourd. Touche l'artefact gelé de la Phase 2 ; la ré-émission a un coût LLM et repose la question de la provenance-modèle |
| **B** | **Convention d'émission** — le compilateur conditionne `empty_state` sur l'état du bloc `list` du même écran | Aucun changement de schéma. **Mais** c'est une convention INVENTÉE par le moteur, non exprimée par l'AIR : le document ne dirait plus ce que l'app fait | Contredit « AIR source de vérité » (non-négociable #1). Je le déconseille |
| **C** | **Re-router la dette** vers la phase où le schéma évolue déjà, par décision consignée | Honnête et traçable ; la Phase 10 se clôt sur ses critères propres | Reporte un défaut visible à l'utilisateur final. La règle de périmètre n'autorise le report que pour un périmètre insuffisant PAR NATURE — ici l'obstacle est un contrat gelé, catégorie que la règle ne nomme pas : d'où la nécessité d'une décision explicite |

### ANALYSE D'IMPACT MESURÉE (travail préparatoire, 2026-08-29)

Quatre faits établis en lisant les contrats, pas en supposant :

1. **`airSchemaVersion` est un `z.literal`** (`air.ts:297`). Faire évoluer le
   schéma en 1.1.0 fait donc ÉCHOUER les 12 documents du corpus, qui
   déclarent 1.0.0 — sauf à passer par le mécanisme prévu.
2. **Ce mécanisme existe déjà et est testé** : `migrateAirDocument`
   (`migrations.ts`), registre `AIR_MIGRATIONS` **vide**, conçu pour
   exactement ce cas (« la v1.1 n'improvisera pas »). Il n'est **câblé nulle
   part** dans le pipeline : l'option A exige donc d'ajouter la migration ET
   de la brancher en amont de la résolution.
   ⇒ **Les 12 fichiers du corpus gelé resteraient byte-identiques sur
   disque.** La migration opère en mémoire. C'est une correction de mon
   estimation initiale, qui parlait de « ré-émission ou migration ».
3. **MAIS l'`airHash` change** : mesuré sur `resto-quartier`,
   `f9f5894172b85238…` en 1.0.0 devient `3d5044d2687bfccf…` en 1.1.0.
   Conséquence en chaîne : **tous les locks et tous les `rootHash` changent**,
   donc cascade complète, deux slices à rejouer et **un nouveau build EAS**
   pour la preuve appareil.
4. **`AirDiagnostic` n'a pas de niveau de gravité** (`code`, `path`,
   `message`) : le validateur est binaire, tout diagnostic = refus
   fail-closed. Un contrôle « écran inatteignable » (DET-024) ne peut donc
   PAS être ajouté comme avertissement — il **refuserait 10 des 13
   documents**, corpus gelé compris. Le traiter suppose soit d'introduire une
   notion de gravité (nouveau changement de contrat), soit de le laisser au
   rang d'instrument de mesure, ce qu'il est aujourd'hui.

### Fichiers concernés par l'option A (inventaire, aucune modification faite)

| Fichier | Nature du changement |
|---|---|
| `packages/air-schema/src/air.ts` | champ optionnel de condition sur `blockInstanceSchema` + bump `AIR_SCHEMA_VERSION` |
| `packages/air-schema/src/migrations.ts` | migration 1.0.0 → 1.1.0 (identité sur les champs ; le runner pose la version) |
| point d'entrée du pipeline (`resolve-lock.ts` ou en amont) | brancher `migrateAirDocument` — aujourd'hui jamais appelé en production |
| `packages/compiler/src/release-train.ts` | pin `airSchemaVersion` + ré-scellement conscient |
| `packages/compiler/src/emit-project.ts` | rendu conditionnel du bloc |
| cliquets et tests | corpus, migrations, émission, déterminisme |
| `benchmarks/air-emission/` | nouvelle campagne SEULEMENT si l'on veut que le modèle PRODUISE des conditions (sinon la migration suffit) |

### Proposition technique (forme minimale, à valider ou à écarter)

Ne pas inventer de langage d'expression. Réutiliser la notion que le registre
manipule déjà — le bloc `list` dérive son état de `items.length === 0` :

```
visibleWhen?: { kind: "entity_empty" | "entity_not_empty", entityId }
```

Fermé, vérifiable par le validateur (l'entité doit exister), sans langage
d'expression, sans invention sémantique. Un `empty_state` porterait
`entity_empty`, un CTA de liste `entity_not_empty`.

### Deux variantes de l'option A, à trancher aussi

| | Variante | Conséquence mesurée |
|---|---|---|
| **A1** | bump 1.0.0 → 1.1.0 + migration | Honnête : la version décrit le contrat. **Tous les `rootHash` changent** ⇒ cascade + 2 slices + nouveau build EAS |
| **A2** | champ optionnel **sans** bump | Aucun hash ne bouge pour les documents qui ne l'utilisent pas. **Mais la version cesse de décrire le contrat** — contraire au gel, qui « porte sur les CONTRATS » |

### Plan de reprise si vous choisissez A (ordre exact)

1. Champ optionnel + bump + migration 1.0.0→1.1.0 ; 2. branchement du runner
de migration ; 3. rendu conditionnel dans l'émetteur ; 4. re-scellement du
train ; 5. cascade complète (tests/typecheck/lint/déterminisme) ; 6. rejeu des
2 slices ; 7. grille A++ et scorecard recalculés ; 8. nouveau build EAS et
**re-validation appareil** ; 9. clôture de DET-017 volet 2, réexamen de
DET-024. **Preuves exigées** : les 19 états vides dupliqués et les 4 actions
doublées doivent tomber à 0 dans `benchmarks/composition/`, sans régression
des dimensions A→H.

### Recommandation (technique, l'arbitrage reste propriétaire)

**Option A, mais pas dans la Phase 10.** Le conditionnement est un vrai manque
de contrat et mérite d'être traité à la racine ; l'engager maintenant
rouvrirait le corpus gelé et l'AIR 1.0.0 en fin de phase, au prix d'une
ré-émission dont la Phase 10 n'a pas besoin. La voie la plus solide est donc
**C puis A** : re-router formellement DET-017 volet 2 vers la phase où le
schéma AIR évolue, en inscrivant A comme son traitement prévu. Cela demande
UNE décision explicite de votre part — sans elle, la Phase 10 reste ouverte.

- **Tranché par** : décision propriétaire.

## D-044 (ex P-009) — AIR 1.1.0 : CONDITION DE VISIBILITÉ DES BLOCS (TRANCHÉ, 2026-08-29)

- **Décision propriétaire (2026-08-29)** : option **A1** — faire évoluer le
  schéma MAINTENANT plutôt que reporter, la norme **A++ (D-039) restant
  inchangée**. Ma recommandation initiale (« C puis A1 ») était **incohérente
  avec l'exigence élite** : reporter une dette « 🔴 BLOQUANTE A++ » est
  exactement ce que D-039-R1 interdit. La décision corrige ma recommandation.

### Ce qui a été fait

1. **`visibleWhen` sur le bloc** — forme FERMÉE, deux prédicats seulement
   (`entity_empty` / `entity_not_empty` + `entityId`), adossés à la notion que
   le registre manipule déjà (le bloc `list` dérive son état de
   `items.length === 0`). **Aucun langage d'expression** : l'étendre sera une
   évolution consciente, pas une improvisation de LLM.
2. **`AIR_SCHEMA_VERSION` 1.0.0 → 1.1.0**, avec la **première migration
   réelle** du projet. Le mécanisme existait depuis la Phase 2, testé mais
   **jamais câblé** : il est activé ici. La migration est une **IDENTITÉ** —
   elle n'invente aucune condition, car en attribuer une reviendrait à
   réinterpréter un artefact gelé sans décision.
3. **Les 12 documents du corpus gelé restent byte-identiques** (vérifié :
   0 fichier modifié). Ils déclarent 1.0.0 et sont migrés EN MÉMOIRE.
4. **Normalisation câblée à TOUS les points d'entrée** — résolveur, émetteur,
   Oracle, générateur SQL, harnais de slices, scorecard. Un point d'entrée
   oublié aurait fait travailler deux étages sur deux versions du même
   document ; c'est arrivé pendant l'intégration et a été corrigé.
5. **Séparation migration structurelle / validation** : fusionner les deux
   faisait s'effondrer toute erreur de schéma en « migration échouée ».
   Précision des diagnostics perdue ⇒ refusée ⇒ `applyAirMigrations` extrait.
6. **Rendu conditionnel** dans les 6 wrappers du runtime émis, évalué sur la
   **même source de données que la liste** — l'état vide et la liste ne
   peuvent donc pas se contredire.
7. **Slice 2 ré-émis** avec la règle de condition (substitutions de prompt
   vérifiées avant remplacement, comme pour `design.overrides`).

### Preuves

- **Slice 2 : 2 états vides dupliqués → 0** (`benchmarks/composition/`).
- Chaîne complète rejouée : backend réel (démonté, absence prouvée), sandbox
  (`npm ci`/`tsc`/bundle exit 0), **Oracle 7/7**, **A++ A→H conformes**,
  déterminisme 5/5. Slice 1 rejoué également.
- **560 tests verts**, typecheck 0, lint 0.

### Incident du 2026-08-29 — trois défauts de MON code, corrigés

Une panne réseau pendant l'attente de santé a laissé **un projet Supabase
vivant**. Supprimé immédiatement, **absence prouvée par l'API**. Trois causes,
toutes corrigées et couvertes par des tests :

1. l'étape en échec était **devinée** → journal faux (« sql » au lieu de
   « health ») ; elle est désormais suivie explicitement ;
2. le démontage n'était **pas réessayé** — « démontage garanti » n'a de sens
   qu'avec une insistance bornée (3 tentatives), et l'absence est vérifiée
   **dans tous les cas** ;
3. l'alerte rouge du harnais était placée **après** le `throw` : un backend en
   échec masquait l'alerte du projet resté vivant.

### Ce que cette décision ne traite PAS

**DET-024** (18 écrans sans chemin de navigation) reste ouverte : un contrôle
d'accessibilité du graphe supposerait une notion de **gravité** dans
`AirDiagnostic`, qui n'en a pas — l'ajouter refuserait 10 des 13 documents.
Autre décision, non prise ici.

## D-045 — CONTRAT D'EXÉCUTION : fermeture de l'unique chemin fail-open du moteur (2026-08-29)

**Statut** : TRANCHÉ — proposition présentée, **approuvée explicitement par le
propriétaire** le 2026-08-29, exécutée dans la foulée. Consignation conforme à
`CLAUDE.md` règle 3 (validation explicite → consignation → exécution).

### Problème établi par la mesure

Tout le moteur est fail-closed : allowlists positives (blocs, capabilities,
imports de slots, clés de thème), `strictObject` partout, quatre validateurs
qui refusent net. **Une seule exception subsistait**, dans le dispatcher
d'effets du runtime copié :

```
// capability / mutation / slot : non-opération v1 (Phases 5+/9).
```

Le moteur n'ignorait pas seulement ces effets : **il ne savait pas qu'il les
ignorait**. Conséquence mesurée sur 13 documents (12 du corpus gelé + slice 2) :

| Mesure | Valeur |
|---|---|
| effets déclarés **exécutés** | **27 / 196 (14 %)** |
| écrans **atteignables** | 27 / 51 (53 %) |
| contrôles visibles **non fantômes** | 38 / 111 (34 %) |
| états de blocs **atteignables** | 90 / 140 (64 %) |
| capabilities **câblées** | **0 / 78** |
| slots **invoqués** | **0 / 48** (DET-018) |
| règles **appliquées** | **0 / 74** |
| blocs liés à une entité **pourvue de données** | 49 / 67 (73 %) |

Et malgré cela : **Oracle L1 7/7 et grille A++ A→H conformes**. Aucun
instrument ne regardait le comportement — les huit dimensions de la grille
D-039 mesurent toutes la forme.

### Ce qui a été construit

**`@deribfy/execution-contract`** — paquet PUR (aucun fs, réseau, horloge,
aléa ; aucune dépendance à un producteur ni à un juge), à trois faces :

1. **Enveloppe** (`envelope.ts`) — déclaration versionnée de ce que le moteur
   sait réellement exécuter : effets, déclencheurs, opérations de données,
   états atteignables, capabilities émises, slots invoqués, règles appliquées,
   traversée de relation, filtrage, RTL, thème, état inter-écrans.
2. **Graphe** (`graph.ts`) — propriétés GLOBALES que l'émetteur, qui raisonne
   écran par écran, ne peut structurellement pas voir : atteignabilité
   **transitive**, source d'`itemId` des écrans de détail, disponibilité réelle
   des données, contrôles fantômes, références rendues brutes.
3. **Réconciliation** (`feasibility.ts`) — AIR ∩ enveloppe → rapport
   déterministe, trié, **scellé par empreinte**, avec deux modes fail-closed :
   `strict` (refus) et `declared_degraded` (compile, mais l'écart est porté).

**ATTRIBUTION — la propriété la plus importante du rapport.** Chaque écart est
imputé à un propriétaire : `document` (l'AIR est mal spécifié), `moteur` (le
moteur ne sait pas exécuter ce que l'AIR déclare légitimement), `contrat`
(l'AIR ne peut pas exprimer ce qu'il faudrait). Confondre ces trois causes est
exactement ce qui a permis de corriger des documents là où le moteur était en
cause. **Résultat mesuré : 535 écarts imputables au moteur, 72 au contrat,
42 aux documents** — les documents décrivent des applications légitimes.

### Trois choix de conception, et leurs raisons

1. **Le runtime n'est PAS modifié.** La non-exécution est intégralement
   déterminable à la compilation. Toucher `air-runtime.tsx` changerait
   `embedded-assets.generated.ts`, donc **tous les `rootHash`**, pour zéro
   information supplémentaire. **Preuve de non-régression : 12/12 `rootHash`
   du corpus et le `rootHash` du slice 2 sont INCHANGÉS.**
2. **Le rapport est un SIDECAR, jamais un fichier du projet** — même
   traitement que le lock (« Le lock n'entre dans AUCUN hash d'artefact »,
   D-027). Zéro churn d'artefact.
3. **L'Oracle RAPPORTE, il ne refuse pas encore.** Durcir en `strict`
   changerait un critère de sortie : la règle qui interdit d'ASSOUPLIR un
   critère après coup interdit tout autant de le RESSERRER sans décision. Le
   durcissement est une décision de l'étape d'exécution, pas de celle-ci.

### Anti-mensonge : le cliquet de véracité

Une enveloppe est une DÉCLARATION, donc elle peut mentir — et un mensonge y
serait pire que le silence qu'elle remplace, puisqu'il serait scellé. Le
cliquet `tests/envelope-truth.test.ts` (16 contrôles) confronte **chaque**
affirmation au CODE RÉEL : branches de `useDispatch`, méthodes de
`DataProvider`, `state="ready"` en dur d'`AirForm`, dépendances du gabarit,
absence de `slotRegistry`, absence de lecture de `air.rules`, de
`rtlSupported`, de `air.design.theme`, absence de `filter`/`sortBy` au
registre de blocs. **Quand le moteur gagnera une capacité, ce fichier échouera
en premier** : élargir l'enveloppe devient une édition consciente.

### Deux cliquets de généralité créés (I5 / I6)

- **AMPLITUDE** — les 13 documents portent TOUS exactement 3 entités et 3-4
  écrans. Le paquet est désormais éprouvé sur 0 entité, 1 écran, 15 écrans /
  12 entités, auto-référence, `many_to_many` — formes qu'aucun document ne
  contient. *(Note : le compilateur, testé indépendamment sur ces mêmes
  formes, les traite déjà correctement — 8/8, déterministe, Oracle vert.)*
- **INVARIANCE AU RENOMMAGE** — renommer mécaniquement tous les identifiants
  d'un document laisse **métriques et écarts strictement identiques**, tandis
  que l'empreinte diffère. Aucune dépendance sémantique cachée.

### Découverte non prévue, consignée

**`app.locales.rtlSupported` est INERTE** : mesuré, `true` vs `false` produit
**0 fichier différent** dans le projet émis. Ses seuls lecteurs sont le rendu
texte de debug et le générateur de flows E2E. Le **non-négociable #16 (« RTL
réel »)** n'est donc pas tenu côté artefact — la dimension F est conforme par
les propriétés logiques des primitives, ce qui est vrai et méritoire, mais
aucune app générée ne s'initialise en RTL. Nouvelle dette : **DET-026**.

### Livrable de spécification

`benchmarks/execution-contract/` produit, **depuis les documents réels**, la
spécification de l'AIR 2.0 — pour ne pas décider d'intuition ce qui manque au
contrat, et ne pas refaire l'erreur d'origine (schéma gelé en Phase 2 avant
qu'aucun consommateur complet n'existe) :

| Besoin d'expressivité mesuré | Occurrences | Documents |
|---|---|---|
| point d'ancrage d'un Code Slot | 48 | 13 / 13 |
| liaison explicite liste → écran de détail | 15 | 11 / 13 |
| traversée de relation (afficher un champ de l'entité cible) | 7 | 6 / 13 |
| état de parcours partagé entre écrans | 2 | 2 / 13 |

### Preuves exécutées (2026-08-29)

**636 tests verts** sur 15 paquets (dont 76 pour le nouveau) ·
`packages:typecheck` **EXIT=0** · `packages:lint` **EXIT=0** ·
**12/12 `rootHash` du corpus INCHANGÉS** · `rootHash` du slice 2 **INCHANGÉ** ·
corpus gelé **byte-identique** (0 fichier modifié) · Oracle passe de 7 à
**8 contrôles**, cliquet de surface édité consciemment.

### Ce que cette décision ne traite PAS

Elle ne construit **aucune** capacité d'exécution : ni mutation, ni
persistance, ni capability câblée, ni slot invoqué. Elle rend l'absence
**visible, imputée et mesurable**. Les étapes d'exécution restent entièrement
à faire, et **cette décision n'autorise à elle seule aucune d'entre elles** :
chacune exige sa propre validation, conformément à D-017.

---

## D-046 — Le protocole ELITE 2027 A+ devient le cadre d'exécution permanent de la ROADMAP (2026-08-30)

**Statut** : TRANCHÉ — arbitrage propriétaire du **2026-08-30**, à l'issue de la
confrontation méthodologique Claude Code ↔ Claude Chat / Opus 5. Consignation
conforme à `CLAUDE.md` règle 3 (validation explicite → consignation →
exécution).

### Décision

`docs/elite-protocol/` devient une **référence obligatoire** des processus de
génération, d'analyse, de validation et de certification du chantier. La
`ROADMAP.md` devient le **plan directeur persistant d'exécution** : une session
y détermine la phase active, l'état figé, la prochaine action autorisée et ses
préconditions, sans dépendre de la mémoire de conversation.

### Ce que la décision NE fait PAS

- elle **ne donne aucune autorité au protocole sur la ROADMAP** : le protocole
  évalue le chantier, il ne le pilote pas (`elite-protocol/README.md`,
  périmètres) ;
- elle **ne déplace ni ne duplique** le protocole : aucune seconde source de
  vérité n'est créée, la ROADMAP référence et n'a pas préséance ;
- elle **ne remplace aucun critère de sortie** : elle fixe le **niveau de
  preuve** exigé pour les déclarer satisfaits ;
- elle **ne clôt aucune phase** et **n'élève aucun statut**.

### Contenu inscrit à la ROADMAP

1. § **CADRE D'EXÉCUTION PERMANENT** (11 sous-sections) : source de vérité,
   distinction A+/A++, niveau de preuve exigé pour toute transition, état figé
   au 2026-08-30, non-correction opportuniste, rapport de continuité à 13
   champs, gouvernance, capability stack et boucle générale, procédure de
   reprise, prochaine étape autorisée, points de gouvernance en attente.
2. § **EXIGENCES OPÉRATIONNELLES PERMANENTES — E-01 → E-20**, issues de la
   confrontation, chacune formulée en exigence opposable (exigence · où elle
   mord · preuve exigée · état · interdit), avec table de rattachement par phase.

### Statuts — inchangés par cette décision

```
PHASE 10 : OUVERTE          VALIDATION PHYSIQUE : SUSPENDUE
EXP-1 : TERMINÉE            EXP-2 : NON LANCÉE
H0 : INDÉTERMINÉ            H1/H2 : OUVERTS            H3 : EXCLU
R-25 : CONDITION D'EXPLOITABILITÉ ÉTABLIE — CAUSE NON IDENTIFIÉE
PROTOCOL-D020 : ÉTABLI POUR CETTE MÉTRIQUE UNIQUEMENT
FINAL TECHNICAL AGREEMENT : NO
```

### Préconditions ouvertes, laissées à l'arbitrage propriétaire

`P1` réarbitration de la granularité avant toute expérience causale ·
`P2` versement de `PROTOCOL-D006` → `D014` ·
`P3` versionnement Git de `docs/elite-protocol/` ·
`P4` consignation du résultat E-11 (le modèle de sévérité ne peut pas
représenter la composition) dans un registre du protocole.

### Preuve

`docs/mobile-generation/ROADMAP.md` §§ CADRE et EXIGENCES ·
`docs/elite-protocol/registers/GATE_SEMANTIC_OBSERVABILITY.md` ·
`docs/elite-protocol/evidence/`.

**Non-régression** : aucun code produit modifié · aucune phase close · aucun
statut élevé · aucune expérience lancée.

---

## D-047 — Correction du câblage d'appui des lignes de liste (APP-D002 / DET-027) — 2026-08-30

**Statut** : TRANCHÉ — proposition présentée avec sa mesure, **approuvée explicitement
par le propriétaire** le 2026-08-30, exécutée dans la foulée. Consignation conforme à
`CLAUDE.md` règle 3.

### Problème établi par la mesure

Un **instrument d'observation** a été construit : il rend l'écran **émis** avec le
runtime **émis**, presse chaque identité et enregistre le delta, avec **contrôle
négatif**. C'est la première observation d'exécution du chantier — jusque-là, tous les
contrôles lisaient le code.

```
AVANT   96 identités adressables · 60 pressables · 4 AGISSANTS · 56 inertes
        dont 46 lignes de liste (24 sur le seul scr_menu)
```

Cause : `useItemNavigate` retournait **toujours** une fonction, même en l'absence
d'effet `navigate`. `AirList` la passait sans condition à `onItemPress`. Le contrat de
bloc, lui, savait déjà ne câbler aucun `onPress` quand `onItemPress` est absent.

**Invisible à toute mesure statique** : `controls()` ne recense un bloc que s'il porte
une action ; un bloc liste n'en porte aucune, donc aucun écart n'était émis.

### Décision

Ne câbler l'appui d'une ligne **que si** une action `navigate` existe.

> **Aucun comportement n'est fabriqué.** On retire une promesse que rien ne fondait.
> Inventer une navigation là où l'AIR n'en déclare pas aurait été une extension
> silencieuse du contrat — refusé, au même titre que D-040.

### Périmètre — 4 fichiers, chaîne de propagation complète

| Fichier | Nature |
|---|---|
| `packages/compiler/runtime/air-runtime.tsx` | **source** — la condition ajoutée |
| `packages/compiler/src/embedded-assets.generated.ts` | **régénéré** par `scripts/embed-assets.mjs` (`fingerprint 4962415b777fc447`) |
| `slices/conteneurs/app/lib/runtime/air-runtime.tsx` | propagé — **byte-identique** à la source avant édition |
| `slices/restaurant/app/lib/runtime/air-runtime.tsx` | idem |

### Résultat mesuré

```
APRÈS   96 identités · 14 pressables · 4 AGISSANTS · 10 inertes
        46 fausses affordances retirées · les 4 navigations fonctionnelles INCHANGÉES
```

**Correspondance runtime ↔ validateur (`E-19`) : 21,4 % → 100 %** sur la propriété
« ce contrôle agit ». La correspondance n'a pas été obtenue en changeant le validateur —
il était **sain**, 0 faux positif, 0 faux fantôme — mais en retirant du produit ce qu'il
avait raison de ne pas compter.

### Non-régression

**640 tests verts / 56 fichiers · `packages:typecheck` EXIT=0** · cliquet de véracité de
l'enveloppe et cliquet de non-dérive des assets embarqués passés · contrôle négatif de
l'instrument : 0 transition sans appui.

### Chaîne de preuve

`observation → hypothèse → preuve causale → correction → vérification → non-régression`
— parcourue **entièrement, pour la première fois du chantier**, avec un instrument
capable de mesurer avant **et** après.

### Délibérément NON traité

| | |
|---|---|
| les **10** contrôles inertes restants | l'AIR déclare `capability`/`mutation`, le moteur ne sait pas les exécuter. Les « corriger » **masquerait un manque réel** |
| `PROTOCOL-D005` / `D008` | 2 blocs recensés mais jamais rendus (`visibleWhen: entity_empty` sur entité peuplée) |
| lacune de conception sur `scr_menu` | après correction, les plats ne sont plus pressables — **conforme à l'AIR**, qui ne déclare aucune action ouvrant le détail depuis la liste. Défaut de **DOCUMENT**, pas de moteur. À arbitrer |
| `APP-D003` / `DET-028` | dimension C de la grille A++ verte sans fondement observationnel — **requalification requise avant toute clôture de Phase 10** |

---

## D-048 — Dimension C requalifiée `non_conforme` : A++ n'est pas atteint (DET-028) — 2026-08-30

**Statut** : TRANCHÉ — constat présenté avec sa mesure, **arbitrage propriétaire explicite**
du 2026-08-30. Consignation conforme à `CLAUDE.md` règle 3.

### Ce que le critère demande

`ROADMAP.md` §294 — **C, Complétude des états** : *« Tout bloc consommant des données
expose `loading` / `empty` / `error` »*. **Nature de la preuve déclarée : « Contrat du
registre + tests ».**

### Ce que l'instrument mesurait

`apxx-grid.ts` §C :

```js
["loading","empty","error"].filter(k => blocks.includes(`state.kind === "${k}"`))
```

Une **recherche de sous-chaîne** dans le source du composant émis.

> **L'instrument n'est pas fautif : il est fidèle à sa spécification.** Le critère
> lui-même déclare que sa preuve est le *contrat du registre*. Le défaut est dans le
> **niveau de preuve que le critère s'est assigné** — une lecture de contrat (N2) pour
> une propriété dont la nature est *ce que l'utilisateur voit* (N6/N7). C'est
> exactement `P-B` : le niveau exigé dépend de la **nature** de la proposition, jamais
> de la commodité de la mesure.

### Ce que l'exécution observe

Blocs consommant des données (`entity: "required"` au registre) : `detail_header`,
`form`, `list`.

| Bloc | déclaré | concédé par l'enveloppe | **observé** | critère C |
|---|---|---|---|---|
| `list` | ready/loading/empty/error | ready/empty | **empty · ready** | 🔴 |
| `form` | ready/submitting/error | ready | **ready** | 🔴 |
| `detail_header` | ready | ready | **aucun état porté** | 🔴 |

**11 états déclarés · 7 concédés · 3 observés.** L'inatteignabilité est **structurelle** :
le `DataProvider` est synchrone (`listInstances`, `getInstance` ; aucune écriture, aucun
modèle d'observation). Aucun chemin ne mène à `loading` ni à `error`.

### Décision

**C = `non_conforme`.** `non_determinee` est écarté : la règle de notation le réserve aux
dimensions **non mesurables**, or C a été mesurée par **deux voies concordantes** —
l'enveloppe (cliquetée contre le code réel) et l'exécution.

**`DET-028` = BLOQUANTE Phase 10, à traiter AVANT toute clôture.**

### Conséquences assumées

1. 🔴 **A++ n'est pas atteint** — ni sur le slice conteneurs, ni sur le slice restaurant.
2. L'entrée `CHANGELOG` du 2026-08-29 (D-043) *« A++ CONFORME A→H »* est **rectifiée en
   place, jamais supprimée** — une thèse abandonnée renseigne autant qu'une thèse retenue.
   Tout ce qu'elle rapporte par ailleurs (tokens, encres dérivées, identité visuelle,
   DET-019/021/022) demeure exact.
3. `STATUS.md` : ligne de phase et bloc « Oracle L1 7/7 » rectifiés, constats historiques
   conservés.
4. **Phase 10 porte désormais deux verrous** : `DET-028` et la validation sur appareil.

### Aucune correction engagée — et pourquoi

| Cause démontrée | Ce que corriger impliquerait |
|---|---|
| l'instrument mesure le **contrat**, pas l'état atteint | rendre l'instrument honnête ⇒ C devient non conforme, **sans rien améliorer au produit** |
| le produit **ne peut pas** atteindre `loading`/`error` — source synchrone | construire une source asynchrone ⇒ **chantier Phase 5+**, pas un correctif |

Aucune de ces voies n'est un patch. Le choix relève de la ROADMAP, pas de cette décision.

### Artefacts de mesure — INTOUCHÉS

`slices/*/results/metrics.json` **n'ont pas été modifiés**. Rectifier un relevé
d'instrument serait falsifier une preuve : le relevé dit ce que l'instrument a mesuré à
sa date, et c'est exact. C'est la **conclusion** qui était fausse, pas la mesure.

---

## P-009 — VOLET 2 : ACCESSIBILITÉ DU GRAPHE DE NAVIGATION (EN ATTENTE) — dossier rouvert le 2026-08-30

> **Le volet 1 de P-009 (conditionnement des blocs) est TRANCHÉ → D-044.**
> Le volet 2 — *« aucun validateur ne contrôle l'accessibilité du graphe de
> navigation »* — n'a **jamais été arbitré**. Ce dossier le reprend avec ce qui a
> changé depuis le 2026-08-29.

### Ce qui a changé depuis la rédaction initiale

`FACT` — Le 2026-08-29 au soir, **D-045** a créé `@deribfy/execution-contract`.
**Le contrôle d'accessibilité EXISTE désormais** : `reachableScreens()` calcule la
fermeture transitive, et `analyzeFeasibility` émet `EXEC_SCREEN_UNREACHABLE_DECLARED`
(propriétaire : *document*) et `EXEC_SCREEN_UNREACHABLE_ENGINE` (propriétaire : *moteur*).

**La question n'est donc plus « faut-il construire ce contrôle ? » mais
« faut-il le rendre BLOQUANT ? ».**

`FACT` — Il ne bloque rien aujourd'hui : le mode par défaut est `declared_degraded`,
qui **n'oppose aucun refus, quel que soit le nombre d'écarts** (verdict `degraded` de
1 à 649 écarts). Le mode `strict` existe et refuse au premier écart. **Aucune phase ne
déclare lequel s'applique.**

### Mesures disponibles

| Mesure | Définition | Résultat |
|---|---|---|
| banc `composition/` (2026-08-29) | écrans qu'**aucune** action `navigate` ne cible | **17 / 50** |
| `reachableScreens` (2026-08-30) | écrans **hors de la fermeture transitive** depuis l'entrée | **24 / 51** |
| observation d'exécution (2026-08-30) | atteignabilité **runtime** mesurée sur le slice 2 | **identique à l'effectif** — 27/51 sur les 13 documents |

Les deux définitions ne mesurent pas la même chose : la seconde est plus sévère
(un écran ciblé depuis un écran lui-même mort reste inatteignable).

`FACT` **nouveau, 2026-08-30** — Après la correction `D-047`, les lignes du bloc liste
de `scr_menu` ne sont plus pressables : **l'AIR ne déclare aucune action ouvrant le
détail d'un plat depuis la liste**. Ce n'est pas un défaut du moteur — c'est
exactement la lacune de document que ce volet 2 doit adresser.

### Options — analyse, non arbitrage

| | Option | Ce qu'elle implique | Coût / risque |
|---|---|---|---|
| **A** | **Mode `strict` sur l'accessibilité** — un écran inatteignable refuse le document | Traite la cause à la racine, fail-closed comme tout le reste du moteur | 🔴 **refuserait le corpus entier** : 24 écrans sur 51 sont inatteignables. Rend le corpus gelé incompilable |
| **B** | **Bloquant pour les documents NEUFS seulement**, corpus gelé exempté par décision datée | Arrête l'hémorragie sans casser l'existant. Traçable | Deux régimes coexistent ; il faut une marque d'exemption dans l'artefact, sinon l'exemption devient tacite |
| **C** | **Rester en rapport seul**, dette acceptée avec échéance de phase | Coût nul immédiat | Reporte un défaut **visible par l'utilisateur** : 24 écrans que personne ne peut atteindre. La règle A++ interdit qu'une dette vaille satisfaction d'un critère |
| **D** | **Seuil** — refuser au-delà de N écrans morts | Compromis | 🔴 Un seuil est un **choix de commodité**, pas une propriété. `P-B` du protocole l'exclut : le niveau exigé dépend de la nature de la proposition |

### 🔴 Avertissement à porter à l'arbitrage

`FACT` — `PROTOCOL-D015` a démontré que la métrique **déclarée** est **gamable par
transfert d'imputation** : ajouter deux déclencheurs `data` inertes fait passer
`owner:document` de 2 à 0, sans rien changer au produit.

`INFÉRENCE` — **Rendre ce contrôle bloquant crée une incitation à le contourner**, et le
contournement est connu, mesuré et bon marché. Toute option qui rend l'accessibilité
bloquante devrait s'appuyer sur la métrique **effective**, pas sur la déclarée — ou
fermer d'abord `R-23`.

### Recommandation

**Option B.** L'option A est juste mais inapplicable en l'état ; C contredit la règle
A++ que vous venez de faire respecter sur la dimension C ; D introduit un seuil de
commodité que le protocole proscrit. B est la seule qui arrête le défaut sans nier
l'existant — **à condition que l'exemption du corpus gelé soit inscrite dans un
artefact, jamais tacite.**

**Décision requise :** A · B · C · D — et, si bloquant : métrique **déclarée** ou
**effective** ?

---

## P-010 — LIAISON DES CODE SLOTS (DET-018) — EN ATTENTE, ouvert le 2026-08-30

### Le fait

`FACT` — L'AIR déclare la **signature** d'un slot (`inputs`, `outputs`,
`allowedImports`) mais **aucune convention de liaison n'existe dans le schéma gelé** :
rien ne dit où un slot est appelé, ni avec quoi.

`FACT` — Mesure sur le corpus : **44 slots déclarés · 43 actions à effet `slot` ·
0 invocation**. La Phase 9 émet les modules et un registre **typé**, vérifiés par la
politique AST et par le `tsc` du projet généré — mais **l'application ne les appelle
jamais**.

`FACT` — **D-040 a refusé d'inventer une convention** : cela aurait été une extension
silencieuse du schéma gelé. Le refus était correct ; il laisse la décision ouverte.

**Corollaire consigné** : l'exécution d'un slot en bac à sable — donc les *tests
unitaires de slot* au sens §4 de l'architecture — n'est pas câblée non plus. La
vérification actuelle est **statique**.

### Options — analyse, non arbitrage

| | Option | Ce qu'elle implique | Coût / risque |
|---|---|---|---|
| **A** | **Évolution du schéma AIR** — convention de liaison explicite (au même titre que `visibleWhen` en 1.1.0) ⇒ **AIR 1.2.0** + migration identité | Traite la cause. Le mécanisme de migration est **déjà câblé** depuis D-044 : le chemin est éprouvé | 🔴 **Cascade de hachages** : `airHash` change ⇒ tous les locks et `rootHash` changent ⇒ **deux slices à rejouer et un nouveau build EAS** |
| **B** | **Dette acceptée** — les slots restent déclarés et non invoqués, l'écart `EXEC_SLOT_NOT_INVOKED` continue de le dire | Coût nul. L'écart est déjà émis et scellé au rapport | Une capacité annoncée à l'architecture reste **inerte sur 48 slots**. Ce n'est pas un défaut visible par l'utilisateur, mais c'est une promesse non tenue du contrat |
| **C** | **Retirer les slots du contrat** jusqu'à ce qu'une phase les implémente | Honnête : le document cesse de promettre ce que le moteur ne fait pas | 🔴 **Rupture MAJEURE** du schéma gelé ; perte d'information dans 13 documents ; contredit la trajectoire d'architecture |

### Ce qui distingue P-010 de P-009 volet 2

| | P-009 v2 — écrans morts | P-010 — slots inertes |
|---|---|---|
| **visible par l'utilisateur ?** | 🔴 **oui** — 24 écrans inatteignables | ⚪ **non** — aucune surface d'app concernée |
| gravité au registre | 🔴 bloquante A++ (via DET-017) | 🟠 moyenne (DET-018) |
| échéance déjà posée | Phase 10 | « évolution du schéma AIR — Phase 10 ou 11 » |

`INFÉRENCE` — Ces deux dossiers n'ont pas la même urgence. P-009 v2 touche ce que
l'utilisateur voit ; P-010 touche une promesse d'architecture. Les traiter dans le même
mouvement se justifie **uniquement** par le coût partagé de la cascade de hachages.

### Recommandation

**Option B pour la Phase 10, avec échéance explicite** — *sauf si* P-009 volet 2 conduit
de toute façon à une évolution de schéma. Dans ce cas, **A pour les deux, en une seule
montée 1.2.0**, pour ne payer la cascade et le build EAS **qu'une fois**.

**Décision requise :** A · B · C — et : **grouper avec P-009 v2, ou non ?**

### 🔴 CONSÉQUENCE SUR L'ORDRE DES VERROUS — à trancher avant RN-07

`FACT` — Une évolution de schéma change l'`airHash`, donc tous les `rootHash`, donc
impose **un nouveau build EAS** et une **nouvelle validation sur appareil**.

`CONCL.` — **Valider sur appareil (RN-07) AVANT de trancher P-009 v2 et P-010
invaliderait cette validation** si l'une des deux conduit à une évolution de schéma.
L'ordre `RN-07 → RN-12 → RN-13` ferait alors payer **deux builds et deux campagnes
appareil** au lieu d'une.

**L'ordre sûr est : trancher P-009 v2 et P-010 D'ABORD, puis construire et valider une
seule fois.**

---

## D-049 — Accessibilité du graphe : bloquante pour les documents NEUFS, sur la métrique EFFECTIVE (P-009 volet 2) — 2026-08-30

**Statut** : TRANCHÉ — dossier présenté avec ses mesures, **arbitrage propriétaire
explicite** du 2026-08-30. Clôt le volet 2 de `P-009`, resté ouvert depuis le 2026-08-29.

### Décision

**Option B** — le contrôle d'accessibilité devient **bloquant pour les documents
NEUFS**, le corpus gelé restant exempté.

🔴 **Condition impérative attachée à la décision** :

> Le blocage s'appuie **exclusivement sur la métrique EFFECTIVE**.
> **La métrique DÉCLARÉE ne peut pas servir de base à un blocage tant que `R-23`
> n'est pas fermé.**

### Fondement de la condition

`FACT` — `PROTOCOL-D015` a démontré que la métrique **déclarée** est gamable par
**transfert d'imputation** : deux déclencheurs `data` inertes suffisent à faire passer
`owner:document` de 2 à 0 sans rien changer au produit. Le comptage reste additif ; c'est
l'**imputation** qui bascule.

`INFÉRENCE` — Rendre bloquante une métrique dont le contournement est **connu, mesuré et
bon marché** créerait une incitation directe à l'exercer. La condition ci-dessus ferme
cette voie avant qu'elle ne s'ouvre.

**Réouverture** : si `R-23` est fermé, la question de bloquer aussi sur la métrique
déclarée pourra être reposée — jamais avant.

### Exigence d'implémentation — à respecter le jour de la mise en œuvre

`FACT` — Le dossier posait : *« à condition que l'exemption du corpus gelé soit inscrite
dans un artefact, jamais tacite »*.

Toute mise en œuvre devra donc porter une **marque d'exemption explicite et vérifiable**
distinguant un document du corpus gelé d'un document neuf. **Une exemption tacite —
fondée sur une date, un chemin de fichier ou une convention implicite — est refusée par
avance** : elle rendrait le régime de blocage indécidable pour une session future.

### Options écartées

| | Pourquoi |
|---|---|
| **A** — mode `strict` inconditionnel | **24 écrans sur 51 sont inatteignables** : refuserait le corpus entier et le rendrait incompilable |
| **C** — rapport seul | Contredit la règle A++ que `D-048` vient de faire respecter : une dette ne vaut jamais satisfaction d'un critère. 24 écrans inatteignables sont **visibles par l'utilisateur** |
| **D** — seuil chiffré | Un seuil est un **choix de commodité**, pas une propriété. `P-B` du protocole l'exclut : le niveau exigé dépend de la **nature** de la proposition |

### Ce qui n'est PAS fait par cette décision

Aucun code, aucun schéma, aucun mode de gate modifié. **La décision fixe le régime ; sa
mise en œuvre est un travail distinct**, à inscrire au plan.

---

## D-050 — Code Slots : dette acceptée avec échéance, pas d'évolution de schéma (P-010 / DET-018) — 2026-08-30

**Statut** : TRANCHÉ — **arbitrage propriétaire explicite** du 2026-08-30.

### Décision

**Option B** — les slots restent **déclarés et non invoqués** pour la Phase 10. La dette
est **acceptée, avec échéance**. **Aucune évolution du schéma AIR maintenant.**

### Échéance

`DET-018` portait déjà *« Évolution du schéma AIR — arbitrage propriétaire à consigner
(Phase 10 ou 11) »*. La présente décision **exclut la Phase 10** ; l'échéance retenue est
donc **Phase 11**, par élimination sur la fiche existante — non par invention.

### Ce que la dette recouvre, exactement

`FACT` — **44 slots déclarés · 43 actions à effet `slot` · 0 invocation.** L'AIR déclare
la signature (`inputs`, `outputs`, `allowedImports`) mais **aucune convention de liaison
n'existe dans le schéma gelé**. La Phase 9 émet les modules et un registre typé, vérifiés
statiquement ; l'application ne les appelle jamais.

**Corollaire porté à la dette** : l'exécution d'un slot en bac à sable — donc les tests
unitaires de slot au sens §4 de l'architecture — n'est pas câblée non plus.

### Pourquoi B et non A

`INFÉRENCE` — Contrairement à `D-049`, cette dette **n'a aucune surface visible par
l'utilisateur** : aucun écran, aucun contrôle. Sa gravité au registre est 🟠 moyenne, non
bloquante A++. Le coût d'une montée `AIR 1.2.0` — cascade complète des hachages, deux
slices à rejouer, **un nouveau build EAS** — n'est pas justifié par une promesse
d'architecture non tenue mais invisible.

`D-040` avait refusé d'**inventer** une convention de liaison. Ce refus reste valide : la
présente décision ne l'invente pas davantage, elle **date l'échéance** au lieu de la
laisser flotter.

### Pas de regroupement avec D-049

`D-049` retenant l'option B, **aucune montée de schéma n'est engagée**. Le seul argument
qui aurait justifié de coupler les deux dossiers — payer la cascade de hachages une seule
fois — **tombe**. Les deux restent séparés.

---

## D-051 — Correction de l'ordre des verrous de Phase 10 — 2026-08-30

**Statut** : TRANCHÉ — **arbitrage propriétaire explicite** du 2026-08-30.

### Décision

L'ordre des verrous de sortie de Phase 10 est :

```
RN-12  →  RN-13  →  RN-07  →  RN-08
```

et **non** `RN-07 → RN-12 → RN-13 → RN-08`, qui avait été énoncé en séquence
conversationnelle.

### Fondement

`FACT` — Une évolution du schéma AIR change l'`airHash`, donc tous les locks et tous les
`rootHash`, donc impose **un nouveau build EAS et une nouvelle campagne appareil**
(mesuré et documenté en `D-044`).

`CONCL.` — Valider sur appareil **avant** de trancher `RN-12` et `RN-13` aurait invalidé
cette validation si l'un des deux avait conduit à une montée de schéma : **deux builds et
deux campagnes au lieu d'une**.

`D-049` et `D-050` retenant toutes deux l'option B, **aucune montée n'est finalement
engagée** — mais l'ordre corrigé reste le bon : il ne dépendait pas du résultat de
l'arbitrage, seulement de son **antériorité**.

### Fait notable — le plan avait raison

`FACT` — Le § **PLAN DE REMISE À NIVEAU** de `ROADMAP.md` portait **déjà** l'ordre
correct : `ÉTAGE 5 · RN-12 · RN-13 · RN-07 · RN-08`.

`INFÉRENCE` — La déviation venait de la **séquence conversationnelle**, pas du plan. Le
plan persistant a joué exactement le rôle pour lequel il a été écrit : **survivre à la
conversation**. C'est la première fois qu'il rattrape une erreur d'ordonnancement.

---

## P-011 — DIMENSION C : QUE FAIRE DE LA NON-CONFORMITÉ ? (DET-028) — PARTIELLEMENT TRANCHÉ → `D-052`, ouvert le 2026-08-30

> `D-048` a **requalifié** la dimension C en `non_conforme` et fait de `DET-028` un verrou
> bloquant de Phase 10. Ce dossier ne rouvre pas cette requalification : il instruit
> **ce qu'on en fait**.

> **ÉTAT AU 2026-08-30 — arbitrage propriétaire → `D-052`.** **A1 = OUI** (instrument à
> rendre honnête, **non reportable**) · **C = REFUSÉE** (aucun amendement du critère) ·
> **D = SUSPENDUE** (report **impossible** : aucune phase de `ROADMAP.md` ne prend
> `DET-008` en charge). Le § **Décision requise** ci-dessous est **conservé tel quel** :
> ses points **1** et **3** sont répondus par `D-052` ; son point **2** demeure **ouvert**,
> et le restera tant qu'aucune phase ne sera fondée dans le plan.

### Rappel du fait établi

| | |
|---|---|
| **Critère C** | *« Tout bloc consommant des données expose `loading` / `empty` / `error` »* — nature de preuve déclarée : *« Contrat du registre + tests »* |
| **Ce que l'instrument mesure** | présence des chaînes `state.kind === "loading"` … dans le **source** du composant émis |
| **Ce que l'exécution observe** | `list` → `empty`/`ready` · `form` → `ready` · `detail_header` → **aucun état porté**. **11 états déclarés · 7 concédés par l'enveloppe · 3 observés** |
| **Pourquoi** | le `DataProvider` est **synchrone** — `listInstances`, `getInstance`, aucune écriture, aucun modèle d'observation. **Aucun chemin ne mène à `loading` ni à `error`** |

**Deux causes, toutes deux démontrées, de natures différentes** :

1. **un défaut d'OUTILLAGE** — l'instrument mesure un contrat au lieu d'un état atteint ;
2. **une absence d'OBJET** — la source de données asynchrone n'existe pas dans cette phase.

### 🔴 La règle de périmètre du chantier impose de les traiter séparément

`ROADMAP.md` § **Règle de périmètre** :

| Cause | Traitement imposé |
|---|---|
| **Manque d'OUTILLAGE** — la mesure est possible au périmètre, l'instrument n'existe pas | **NON REPORTABLE.** L'outillage est produit dans la phase, puis la dimension est évaluée |
| **Périmètre INSUFFISANT par nature** — la mesure exige un objet absent de la phase | **Portée explicitement** à la phase où elle devient mesurable, **jamais conforme par défaut** |

> *« Invoquer le périmètre là où seul l'outillage manque est une violation de l'exigence. »*

`INFÉRENCE` — Ici, **les deux causes coexistent**. La règle impose donc de **scinder** :
le volet outillage **ne peut pas être reporté** ; le volet objet **doit** l'être, avec une
phase nommée.

### Options — analyse, non arbitrage

| | Option | Ce qu'elle implique | Coût / risque |
|---|---|---|---|
| **A** | **Rendre l'instrument honnête** — mesurer l'état **atteint**, pas la chaîne dans le source | Le faux vert disparaît **par mesure** au lieu de l'être par arbitrage. C reste `non_conforme`, mais pour une raison vérifiable | Faible. Deux variantes : **A1** mesurer contre `reachableBlockStates` de l'enveloppe *(déjà cliquetée contre le code réel — N2)* · **A2** mesurer contre l'exécution *(N7, mais couple la grille à un harnais de test)* |
| **B** | **Construire la source de données asynchrone** pour rendre `loading`/`error` atteignables | Traite la cause profonde. C pourrait devenir conforme **honnêtement** | 🔴 **Le plus lourd.** C'est le chantier déjà porté par `DET-008` (« app non connectée au backend vivant »). Touche le contrat `DataProvider`, l'enveloppe, les apps émises. **Hors périmètre de Phase 10** |
| **C** | **Amender le critère C** — retirer `loading`/`error`, ne garder que ce qui est atteignable | Rend le critère satisfaisable | 🔴 **Interdit par la ROADMAP** : *« Les critères ne sont jamais assouplis après coup. »* À moins de démontrer qu'il s'agit d'une **erreur de catégorie** et non d'un assouplissement — charge de la preuve élevée |
| **D** | **Porter la conformité** à la phase où le `DataProvider` cesse d'être synchrone, C restant `non_conforme` d'ici là | Exactement le mécanisme que la règle de périmètre prévoit pour une **absence d'objet** | Exige de **nommer la phase**. 🔴 Or `DET-008` porte aujourd'hui une échéance **non nommée** : *« Phase où les capabilities/auth sont implémentées »*. **Il faudra la nommer.** |

### Recommandation

**A1 + D, conjointement — et non l'un ou l'autre.**

- **A1 est obligatoire et non reportable** : la cause outillage relève du régime « manque
  d'outillage », que la règle interdit de reporter. Tant que l'instrument déclare vert ce
  qui ne l'est pas, **toute évaluation A++ future reste fausse**, sur ce slice comme sur
  les suivants. Variante A1 plutôt que A2 : l'enveloppe est déjà cliquetée contre le code
  réel, et coupler la grille de qualité produit à un harnais de test créerait une
  dépendance que rien n'exige.
- **D traite le reste** : `loading` et `error` sont inatteignables **par absence d'objet**,
  pas par négligence. La règle prévoit le report — à condition de **nommer la phase**.

**B est le vrai travail de fond**, mais il ne relève pas de la Phase 10 : c'est `DET-008`.
**C doit être refusée** sauf démonstration d'erreur de catégorie.

### 🔴 Point bloquant à trancher en même temps

`FACT` — `DET-008` porte une échéance **non nommée**. L'option **D** exige une phase
nommée, faute de quoi le report serait indéfini — c'est-à-dire un abandon déguisé.

**Nommer la phase de `DET-008` est donc une précondition de D.**

### Décision requise

1. **A1** · **A2** · ou pas d'action sur l'instrument
2. **D** oui/non — et si oui, **quelle phase** pour `DET-008` et pour le volet objet de C
3. **C** : refusée par défaut, ou instruite comme erreur de catégorie ?

---

## D-052 — Dimension C : instrument à rendre honnête, critère non amendé, report IMPOSSIBLE (P-011 / DET-028) — 2026-08-30

**Statut** : TRANCHÉ PARTIELLEMENT — **arbitrage propriétaire explicite** du 2026-08-30,
rendu **après** vérification documentaire. Clôt `P-011` sur deux points, en **suspend** un
troisième faute de fondement dans le plan.

> Cette décision **ne rejuge pas** `D-048` : la requalification de C en `non_conforme` et
> le caractère bloquant de `DET-028` y sont acquis. Elle décide **quoi en faire**.

### 1 · A1 = OUI — l'instrument doit être rendu honnête

L'instrument de la dimension C doit mesurer **l'état atteint**, non la présence d'une
chaîne de caractères dans le source du composant émis.

**Ce travail est NON REPORTABLE.** Fondement — règle de périmètre de `ROADMAP.md` :

> *« **Manque d'OUTILLAGE** — la mesure est possible au périmètre mais l'instrument
> n'existe pas ⇒ **Non reportable.** L'outillage est produit dans la phase. »*
> *« Invoquer le périmètre là où seul l'outillage manque est une violation de l'exigence. »*

`INFÉRENCE` — Tant que l'instrument déclare vert ce qui ne l'est pas, **toute évaluation
A++ future reste fausse**, sur ce slice comme sur tous les suivants. Le défaut n'est pas
local à la Phase 10 : il contamine la grille elle-même.

**Variante retenue : A1** — mesurer contre `reachableBlockStates` de l'enveloppe, déjà
cliquetée contre le code réel. **A2** (mesurer contre l'exécution) est écartée : coupler
la grille de qualité produit à un harnais de test créerait une dépendance que rien
n'exige.

🟢 **A1 — EXÉCUTÉ le 2026-08-30.** *(La décision, elle, ne modifiait aucun code : elle
prescrivait le travail. L'exécution qui suit a été menée séparément, sur feu vert.)*

| | |
|---|---|
| **Fichier corrigé** | `packages/oracle/src/apxx-grid.ts` — dimension C |
| **Ce qui change** | la mesure porte sur l'**atteignabilité** (`EXECUTION_ENVELOPE_V1.reachableBlockStates`), et non plus sur la présence d'une chaîne dans le source du composant émis |
| **Blocs mesurés** | ceux que **ce document** lie à une entité, dérivés de l'AIR — jamais une liste écrite à la main |
| **Cas vide** | aucun bloc consommateur ⇒ **`non_determinee`**, jamais conforme par défaut (D-039-R1) |
| **Dépendance** | **aucune nouvelle** — `@deribfy/execution-contract` figurait déjà aux dépendances d'oracle |
| **Verdict obtenu** | `non_conforme` sur le slice conteneurs **et** sur `resto-quartier`. Détail : **8 états requis non atteignables** — `detail_header:loading/empty/error` · `form:loading/empty/error` · `list:loading/error` |
| **Non-régression** | **640 tests verts / 56 fichiers** · `packages:typecheck` **EXIT=0** · cliquet de véracité de l'enveloppe passé |
| **Code émis** | 🟢 **inchangé — aucune ligne d'application touchée** |

**Deux tests mis à jour — édition consciente, non contournement.** `slots-and-grid.test.ts`
asseyait l'ancien verdict (`C:conforme`, `passed: true`). Les deux assertions sont
corrigées **selon le patron déjà employé par le dépôt** lorsque l'instrument de la
dimension **D** avait été renforcé en Phase 10 : motif complet en commentaire, et mention
explicite que **le code émis n'a pas changé — c'est la mesure qui a cessé de porter sur
autre chose que la propriété nommée**.

### Ce que A1 clôt — et ce qu'il ne clôt pas

| Volet | État |
|---|---|
| **A1 — OUTILLAGE** | 🟢 **CLOS.** Le faux vert est mort : toute évaluation A++ future, sur ce slice comme sur les suivants, mesure l'état **atteint** |
| **D — OBJET** | 🔴 **TOUJOURS SUSPENDU.** `loading` et `error` demeurent inatteignables faute de source de données asynchrone. Le report reste **impossible** : aucune phase de `ROADMAP.md` ne prend `DET-008` en charge |

**La distinction outillage / objet est le cœur de cette décision et doit être conservée :**
corriger l'instrument n'a rien amélioré au produit — cela a rendu la mesure honnête. Le
produit, lui, ne satisfait toujours pas le critère, et **rien au plan ne date le moment
où il le pourrait**.

### 2 · C = REFUSÉE — aucun amendement du critère

Le critère C n'est **ni amendé, ni assoupli, ni reformulé**. Fondement — `ROADMAP.md` :

> *« Les critères ne sont jamais assouplis après coup. »*

**Le statut de la dimension C reste `non_conforme`.**

### 3 · D = SUSPENDUE — le report est IMPOSSIBLE, faute de phase

`FACT` — Vérification documentaire du 2026-08-30 sur `ROADMAP.md` :

| Recherche | Résultat |
|---|---|
| `DET-008` dans `ROADMAP.md` | **0 occurrence** |
| `asynchron` | **1** — titre « PHASE 7 — WORKFLOW ASYNCHRONE DURABLE », qui porte le **workflow d'orchestration**, non la couche de données de l'app |
| `temps réel` · `realtime` · `abonnement` · `subscription` | **0** |
| `loading` | **2** — critère de sortie de Phase 3 (harnais de rendu) et le critère C lui-même |

`FACT` — Le passage le plus proche est l'objectif de **Phase 10** : *« première abstraction
provider exercée (interface + 1 implémentation réelle + 1 mock de substitution) »*, dont
le critère de sortie est *« preuve de substitution de provider sans changement d'AIR »*.

`INFÉRENCE` — Phase 10 exige la **substituabilité** du provider, **pas son
asynchronisme**. Un provider réel et substituable peut demeurer synchrone — c'est le cas
du provider de démonstration actuel. Rendre `loading`/`error` atteignables exige de
modifier le **contrat** `DataProvider` lui-même (aujourd'hui `listInstances` /
`getInstance`, sans écriture ni modèle d'observation ; l'enveloppe le scelle :
`dataOperations: ["list","get"]`).

`CONCL.` — **Aucun critère de sortie d'aucune phase n'exige ce changement de contrat.**
L'option D exigeait une phase **explicitement nommée et déjà fondée dans la ROADMAP** :
elle n'existe pas. **D est donc SUSPENDUE, non tranchée.**

🔴 **Interdits attachés à cette suspension** :
- ne **pas** choisir Phase 11 ni aucune autre phase par déduction ou convenance ;
- ne **pas** modifier `ROADMAP.md` pour résoudre artificiellement l'absence.

### 4 · DET-028 — état inchangé

```
DET-028 : 🔴 BLOQUANTE PHASE 10, à traiter avant toute clôture
Dimension C : non_conforme
A++ : NON ATTEINT sur les deux slices
```

### 5 · FAIT NOUVEAU CONSIGNÉ — `DET-008` est une dette HORS PLAN

> `DET-008` — *« app non connectée au backend vivant ; le chemin app ⇄ backend n'est pas
> encore prouvé »* — **n'est rattachée à AUCUNE phase de la ROADMAP.**

`FACT` — Son échéance, telle qu'elle figure au registre, est *« Phase où les
capabilities/auth sont implémentées »* : une **désignation par condition, pas par nom de
phase**. Aucune phase du plan ne porte cette condition comme objectif ou critère de sortie.

`INFÉRENCE` — `DET-008` n'est donc **pas reportée : elle est hors plan.** Et le volet
« objet » de la dimension C en dépend directement — il est donc **rattaché à rien**.

🔴 **Cette absence doit rester visible comme telle.** Elle **ne doit pas** être convertie
en échéance fictive. Une échéance inventée serait un abandon déguisé, présenté comme un
report.

### Ce qui reste à décider — et qui ne l'est pas ici

| # | Décision réellement nécessaire | Nature |
|---|---|---|
| **1** | Une phase de la ROADMAP doit-elle prendre `DET-008` en charge ? Si oui, laquelle, et par quel amendement de plan ? | **évolution de plan** — règle 3 : proposition, validation, consignation |
| **2** | À défaut, `DET-028` reste-t-elle bloquante **sans horizon** ? | conséquence assumée de 1 |

Tant que la décision 1 n'est pas prise, **le volet objet de la dimension C n'a pas
d'échéance possible**, et `DET-028` demeure un verrou ouvert sans date.

---

## D-053 — Fermeture des deux critères 🟠 de Phase 10 — 2026-08-30

**Statut** : TRANCHÉ — mesures exécutables produites, **arbitrage propriétaire explicite**
du 2026-08-30. Aucune correction de code n'accompagne ces verdicts.

### Critère « preuve de substitution de provider sans changement d'AIR » → 🟢 CONFORME

`FACT` — Mesuré sur 2 documents (`slice conteneurs`, `suivi-chantier`) :

| Sous-propriété | Résultat |
|---|---|
| substitution **sans toucher au document** | 🟢 `airHash` identique avant/après |
| provider **réellement remplacé** | 🟢 6 puis 7 classes basculées vers `mock` ; le registre offre un mock **16 classes sur 16** |
| la substitution **change l'artefact émis** | 🔴 `rootHash` **identiques**, **0 fichier différent** |

**Verdict : 🟢 CONFORME au critère TEL QU'IL EST ÉCRIT.** La substitution est démontrée,
exécutable, et l'AIR reste intact.

🔴 **RÉSERVE INSCRITE AU REGISTRE — à ne pas perdre :**

> Ce qui est prouvé est le remplacement **dans le lock**, jamais dans le **produit**. Un
> projet dont **tous** les providers sont des mocks est **byte-identique** au projet réel.
> Même signature que `capabilitiesEmitCode: false` : une déclaration résolue qui n'atteint
> pas le code émis.
>
> L'**objectif** de Phase 10 demande *« 1 mock de substitution prouvant le remplacement »*.
> Le remplacement prouvé est celui de la **résolution**, pas celui du **comportement**.
> **Cette nuance n'est PAS tranchée** — elle relève de la portée de l'objectif, non du
> critère écrit.

**Preuve** : `docs/elite-protocol/evidence/phase10-substitution-provider.mjs`

### Critère « liste mesurée des capabilities manquantes » → 🟠 NON DÉTERMINÉ, MOTIVÉ

`FACT` — Registre v1 gelé : **15 capabilities**. Mesure sur les 13 documents :

| | |
|---|---:|
| capabilities distinctes déclarées | **14 / 15** |
| au registre mais **jamais déclarées** | **1** — `biometrics` |
| déclarées **hors registre** | **0** |
| **manquantes constatées** | **0** |

Usage : `analytics`, `push_notifications`, `offline_storage` → **13/13** · `auth` → 12/13 ·
jusqu'à `barcode_scan` → 1/13.

`INFÉRENCE` — L'allowlist de capabilities est **positive et fail-closed** :
`validateAirCapabilities` refuse net toute capability hors registre, et le corpus a franchi
cette barrière. **Par construction, aucun document ne peut exprimer un besoin non couvert.**
Le corpus est donc **filtré par le registre qu'il devrait servir à évaluer**.

`CONCL.` — Les « 0 manquantes » ne mesurent **pas** une couverture complète : elles mesurent
**l'impossibilité d'observer un manque**. C'est le cas que le protocole nomme
*« taux nul mais sondes corrélées : aucune information — le cas le plus dangereux »*.

**Verdict : 🟠 NON DÉTERMINÉ.** Ni conforme, ni non conforme. Déclarer 🟢 sur
« 0 manquantes » serait un vert obtenu par **aveuglement de l'instrument**.

`INFÉRENCE` — Relève du **périmètre insuffisant PAR NATURE** au sens de la règle du
chantier : la mesure exige un objet absent — **une source de besoins non filtrée par
l'allowlist**.

**Preuve** : `docs/elite-protocol/evidence/phase10-capabilities-manquantes.mjs`

### 🔴 Verrou nouveau — À NE PAS CORRIGER MAINTENANT

> **Quelle source de besoins non filtrée est légitime ?**
>
> Trois pistes existent — intentions humaines rédigées par des tiers · domaines hors corpus ·
> journal des candidates rejetées (tier B, consigné en D-020). **Aucune n'est arbitrée.**
>
> 🔴 **Décider d'abord, mesurer ensuite.** Fabriquer une source pour obtenir un chiffre
> produirait une mesure artificielle : exactement le défaut que ce verdict 🟠 dénonce.

### Deux anomalies d'instrument corrigées avant conclusion

| Bug | Ce qui aurait été rapporté sans vérification |
|---|---|
| `ProviderDefinition` expose `id`, lu comme `.provider` | *« le registre n'offre aucune alternative »* — **faux** : 16/16 |
| `listCapabilities()` retourne des définitions, pas des chaînes | *« 15 capabilities jamais déclarées »* — **faux** : 1 seule |

Les deux résultats erronés étaient **plausibles**. C'est l'anomalie du chiffre, non
l'intuition, qui a déclenché la vérification.

### Ce que cette décision NE fait PAS

Aucun code produit, schéma, gate ou métrique historique modifié. Aucune correction engagée
sur la réserve du critère 1 ni sur le verrou du critère 2.

---

## D-054 — LA RACINE : l'intention n'est stockée nulle part, les promesses ne s'exécutent jamais — 2026-08-31

> 🔴 **RECTIFIÉE LE 2026-08-31 → `D-054-R1`.** Le **titre** de cette décision et
> **trois de ses affirmations factuelles** — *« l'intention n'est stockée nulle part »*,
> *« avec photos évaporé sans trace »*, *« le manque est structurellement indicible »* —
> sont **RÉFUTÉS PAR MESURE**, et la démonstration `resto-riche` est **CIRCULAIRE**.
> **Ses relevés chiffrés demeurent exacts** (227 · 167 · 73,6 %), et son `INFÉRENCE`
> centrale — *personne ne compare le document à la demande* — **reste vraie**.
> L'entrée est **conservée telle quelle, jamais supprimée** : une thèse abandonnée
> renseigne autant qu'une thèse retenue (patron `D-048`).

**Déclencheur** — arbitrage propriétaire : *« il faut résoudre le problème depuis
racine sinon ça ne se résout pas profondément »*. La correction du prompt, engagée
la veille, a été **refusée comme racine** : elle ne traitait qu'un symptôme.

### Ce qui n'est PAS la cause — hypothèse tuée

`FACT` — **Le moteur n'est pas le plafond.** Un AIR écrit à la main de **12 écrans /
8 entités** passe `assertValidAir` 🟢 et `compileProject` 🟢 **47 fichiers**. Aucun
refus, aucune dégradation. L'hypothèse « le contrat AIR bride la richesse » est
**ÉCARTÉE**.

`FACT` — **Le prompt bridait, mais n'est qu'un symptôme.** `emit-v2.mjs:134` et
`emit.mjs:142`, identiques : *« Sois complet mais sobre : 2 à 4 écrans, 1 à 3
entités »*. Plafond **saturé 12 fois sur 12**. Réel — mais il n'explique pas
pourquoi personne ne l'a vu pendant douze documents.

### La racine — deux faits, une seule cause

`FACT` — **① L'intention du client n'est conservée nulle part.** L'AIR porte 19
champs de premier niveau ; **aucun** ne contient la demande d'origine. *« menu avec
photos et prix »* entre dans un prompt et **disparaît**. Aucun artefact en aval ne
sait ce qui avait été demandé.

`FACT` — **② Les promesses sont déclarées et jamais exécutées.** **227
`expectedTests`** dans le corpus. Leurs seuls consommateurs : `validate.ts`
(unicité de l'identifiant) et `render-text.ts` (affichage). **Aucun exécuteur.**

`INFÉRENCE` — **Toute la vérification compare l'artefact au document. Personne ne
compare le document à la demande.** C'est la cause commune de tous les symptômes
observés : le plafond du prompt passé inaperçu sur 12 documents, *« avec photos »*
évaporé sans trace, la grille A++ verte sur une application pauvre, `APP-D002`
(56 contrôles inertes sur 60) non détectée par 640 tests verts.

### MESURE — les promesses confrontées à l'état réel de leur cible

**Instrument** : `docs/elite-protocol/evidence/promesses-tenues.mjs` — rejouable,
coût nul. Chaque `expectedTests[]` est confronté à sa cible dans l'artefact émis :
écran atteignable (`reachableScreens`) · action exécutée (`controls` ∩
`EXECUTION_ENVELOPE_V1`) · entité liée à un bloc rendu et alimentée (`dataBindings`).

| sur les **227** promesses préexistantes | | |
|---|---:|---:|
| **CIBLE MORTE** | **167** | **73,6 %** |
| CIBLE VIVANTE | 60 | 26,4 % |
| CIBLE INEXISTANTE | 0 | — |

| nature | vivante | **morte** |
|---|---:|---:|
| `deterministic` | 40 | **75** |
| `e2e` | 18 | **35** |
| `contract` | 2 | **57** |

Causes de mort mesurées : effet `slot`/`mutation`/`capability` **hors enveloppe
d'exécution** · écran **inatteignable** · entité liée à **aucun bloc rendu**.

> 🔴 **AUCUNE promesse n'est déclarée TENUE.** Ce relevé n'établit qu'une
> **CONDITION NÉCESSAIRE** — que la cible existe et fonctionne. L'énoncé lui-même
> (« le total additionne correctement ») **n'est pas vérifié** : il faudrait exécuter
> une logique que le moteur n'exécute pas. `P-C` : `PARTIAL → PASS` ❌.

### La couche la plus profonde — le manque est structurellement indicible

`FACT` — `expectedTests.targetId` doit désigner un **nœud existant** (`scr_`, `act_`,
`ent_`). `INFÉRENCE` — **un besoin sans nœud — une photo que rien ne peut rendre —
ne peut pas être exprimé comme promesse.** Le manque n'est pas *non détecté* : il est
**inexprimable**. C'est pourquoi *« avec photos »* n'a laissé aucune trace dans 12
documents sur 13.

### DÉMONSTRATION — même moteur, document honnête

`slices/resto-riche/` — AIR écrit à la main, 7 écrans · 5 entités · 20 blocs ·
9 actions · 22 champs, compilé en 37 fichiers.

| | promesses | **cible vivante** | contrôles pressables | **qui agissent** |
|---|---:|---:|---:|---:|
| `resto-quartier` *(généré)* | 18 | **4 — 22 %** | 14 *(2 slices)* | 4 |
| `resto-riche` *(écrit à la main)* | 10 | **10 — 100 %** | **22** | **22** |

`INFÉRENCE` — l'écart ne vient **pas** du moteur, identique dans les deux cas : il
vient de ce que le document **promet ce que le moteur peut tenir**.

### Ce que cette décision NE fait PAS — et pourquoi

| non fait | raison |
|---|---|
| stocker l'intention dans l'AIR | **montée de schéma** — arbitrage propriétaire requis |
| dériver les promesses de l'intention et refuser un document qui ne les couvre pas | dépend du point précédent |
| ériger `promesses-tenues.mjs` en **gate** | aucune phase ne possède ce critère (voir verrou) |
| exécuter `emit-v3.mjs` | **budget LLM** — arbitrage propriétaire |
| registre de blocs v2 (image, recherche, catégories) | artefact **gelé** — arbitrage propriétaire |
| build appareil | credentials propriétaire |

`emit.mjs` et `emit-v2.mjs` sont **intacts** — les campagnes historiques restent
rejouables à l'identique.

### 🔴 Verrou nouveau — aucune phase ne possède la qualité de l'application produite

> Les Phases 0→10 vérifient le **moteur** : il compile, il est déterministe, il est
> gelé, il est reproductible. **Aucune ne vérifie que l'application émise tient ce
> que le document a promis.** `DET-028` était déjà orphelin (`DET-008` n'appartient à
> aucune phase — vérifié : 0 occurrence dans `ROADMAP.md`). La mesure ci-dessus l'est
> aussi.
>
> **À trancher avant toute clôture de Phase 10** : quelle phase possède ce critère,
> ou faut-il en créer une.

### Non-régression

`FACT` — **15 suites vertes · `typecheck` EXIT=0**, après la correction `D-047` et
l'ajout de `resto-riche`. Aucune ligne du moteur modifiée par la présente décision.

---

## D-054-R1 — RECTIFICATION de D-054 : trois faits réfutés, une démonstration retournée, la racine reformulée — 2026-08-31

**Statut** : **RECTIFICATION DOCUMENTAIRE**, sur instruction propriétaire explicite du
2026-08-31. `D-054` est **conservée intégralement**. Aucun code produit, aucun schéma,
aucune gate, aucune métrique historique n'est touché par la présente entrée.

> **Ce que la rectification NE remet PAS en cause.** Les relevés chiffrés de `D-054`
> sont **exacts et reproduits** : **227** promesses · **167** à cible morte · **73,6 %** ·
> 60 vivantes · 26,4 % · `deterministic` 40/75 · `e2e` 18/35 · `contract` 2/57.
> Reproduits le 2026-08-31 par **expérience à variable unique** — retrait de la seule
> ligne du document témoin dans la liste `DOCS` de l'instrument, tout le reste intact.
> Son `INFÉRENCE` centrale — *« personne ne compare le document à la demande »* —
> **reste vraie**, mais pour une autre raison que celle avancée (voir § 5).

### 1 · Trois affirmations factuelles de `D-054` sont RÉFUTÉES

**R1 — « L'intention du client n'est conservée nulle part ; l'AIR porte 19 champs de
premier niveau, aucun ne contient la demande d'origine. »**

`FACT` — `app.description` est **non vide dans 13 documents sur 13**. Comparaison
littérale sur `resto-quartier` :

| source | texte |
|---|---|
| demande d'origine — `benchmarks/air-emission/intentions.mjs` (*« textes FIXES »*) | « … mes clients voient le menu **avec photos et prix**, commandent à emporter, paient par carte dans l'app, et reçoivent une notification quand la commande est prête. » |
| ce que l'AIR en garde — `app.description` | « … consultez le menu **en photos**, commandez à emporter, payez par carte et recevez une notification dès que votre commande est prête. » |

🔴 **RÉFUTÉE.** L'intention est conservée **clause par clause**. Le nombre de 19 champs
est exact ; la conclusion qu'aucun ne porte la demande ne l'est pas.

**R2 — « *menu avec photos et prix* entre dans un prompt et disparaît » · « *avec
photos* n'a laissé aucune trace dans 12 documents sur 13. »**

`FACT` — Mesure sur les 13 documents générés :

| trace | résultat |
|---|---:|
| documents portant au moins un champ de type `asset` | **12 / 13** |
| documents mentionnant photo/image dans `app.description` | **6 / 13** |

`resto-quartier` porte `fld_plat_photo`, type `asset`. 🔴 **RÉFUTÉE** — la trace existe
à **deux** niveaux, le texte et le modèle de données.

**R3 — « Le manque est structurellement indicible : un besoin sans nœud ne peut pas
être exprimé comme promesse. »**

`FACT` — Le besoin **est** exprimé, deux fois (R1, R2). Ce qui est impossible est autre
chose, et se nomme précisément :

| ce qui est impossible | mécanisme | origine |
|---|---|---|
| le **promettre** | `expectedTests.targetId` n'accepte qu'un **écran, une action ou une entité** — jamais un champ (`validate.ts` § 11) | contrat AIR |
| le **rendre** | le registre de blocs est **GELÉ à 6 blocs** — `button` · `detail_header` · `empty_state` · `form` · `header` · `list` — **aucun n'accepte un champ `asset`** | **`D-024`** (2026-08-28) |

🔴 **RÉFUTÉE dans sa formulation.** Le besoin n'est pas indicible : **il est dit, puis
abandonné par deux portes nommées et datées.** La reformulation est plus dure que
l'originale, et actionnable.

**Précision — non une réfutation.** `D-054` écrit : *« leurs seuls consommateurs :
`validate.ts` et `render-text.ts` »*. Le balayage **complet** du dépôt montre d'autres
**lecteurs** (`air.ts` les déclare, `workflow/src/corpus.ts` les embarque, les
émetteurs et rejeux de `benchmarks/` les produisent, des fixtures de test). **Aucun ne
les exécute** : la conclusion de `D-054` tient, seul son périmètre d'établissement
était trop étroit.

### 2 · La démonstration `resto-riche` est CIRCULAIRE

`FACT` — Composition mesurée des deux documents comparés :

| | actions | effets | déclencheurs | slots | capabilities | rules |
|---|---:|---|---|---:|---:|---:|
| **`resto-riche`** *(témoin « honnête »)* | 9 | **`navigate` × 9** | **`ui` × 9** | **0** | **0** | **0** |
| `resto-quartier` *(généré)* | 17 | navigate 3 · mutation 3 · capability 6 · slot 5 | ui 8 · lifecycle 5 · data 4 | 5 | 5 | 5 |

`FACT` — L'enveloppe d'exécution déclare `effects: ["navigate"]` et `triggers: ["ui"]`.

`CONCL.` — **`resto-riche` est exactement l'enveloppe, et rien d'autre.** Son score de
100 % est acquis **par construction** : il ne demande au moteur que la seule chose que
le moteur exécute. Il ne déclare **ni paiement, ni notification, ni authentification,
ni règle métier, ni calcul**.

🔴 L'`INFÉRENCE` de `D-054` — *« l'écart ne vient pas du moteur : il vient de ce que le
document promet ce que le moteur peut tenir »* — est **retournée par sa propre pièce à
conviction**. La comparaison ne mesure pas l'honnêteté du document : **elle mesure
l'enveloppe.** Un document qui demande ce qu'exige une application de commerce réelle
a 73,6 % de promesses mortes ; un document qui ne demande que de naviguer en a 0 %.

`FACT` — Corollaire mesuré : **`resto-riche` déclare lui aussi 1 champ `asset` lié à
aucun bloc.** Le témoin porte le même défaut que le corpus — il se borne à ne rien en
promettre.

### 3 · Ce que `resto-riche` démontre LÉGITIMEMENT

`FACT` — 7 écrans (contre 4), 20 blocs (contre 16), 5 entités, accepté et compilé sans
refus.

`CONCL.` — **L'AIR et le compilateur acceptent un document structurellement plus
riche.** L'hypothèse *« le contrat AIR bride la richesse »* est **valablement écartée
pour la STRUCTURE** — cette part de `D-054` est maintenue.

🔴 Le saut de là vers *« le moteur n'a jamais été le plafond »* **n'est pas soutenu** :
le moteur est le plafond pour **tout ce qui dépasse la navigation**.

### 4 · Mesure `asset` — le besoin est dit, jamais montré

| | |
|---|---:|
| champs `asset` déclarés sur les 14 documents | **18** |
| liés à une prop de bloc | **3** |
| **affichés comme image** | **0** |

`FACT` — Les 3 liés le sont à `form.fieldIds` : ils apparaissent en **champs de
saisie**, dans des formulaires qui ne peuvent pas soumettre (`dataOperations:
["list","get"]`). **Aucun bloc du registre gelé n'accepte un champ `asset`.**

### 5 · `app.description` — présente dans l'AIR, ABSENTE de l'artefact émis

`FACT` — Non vide dans **13/13** documents. **Absente de l'application émise**,
`app.json` compris — la phrase de `resto-quartier` n'apparaît dans aucun fichier du
projet généré.

`CONCL.` — **L'intention ne meurt pas au schéma : elle meurt à l'émission.** Le champ
existe ; le compilateur ne le transporte pas. C'est la formulation correcte de
l'`INFÉRENCE` de `D-054`, qui reste vraie : personne ne compare le document à la
demande — non par manque de matière, mais **par absence de l'organe de comparaison**.

`INFÉRENCE` — La **montée de schéma** que `D-054` renvoie à l'arbitrage propriétaire
pour *« conserver l'intention dans l'AIR »* **n'est pas nécessaire pour conserver la
trace en texte libre** : le champ existe déjà et porte la demande dans 13/13 documents.
Elle resterait requise pour une intention **structurée** — proposition **non démontrée
ici**, et qui reste entière à instruire.

### 6 · La racine DÉMONTRÉE au 2026-08-31 : l'ENVELOPPE D'EXÉCUTION

`FACT` — Décomposition des 167 cibles mortes — **jamais chiffrée avant ce jour** :

| cause | nombre | part |
|---|---:|---:|
| **effet non exécuté par le runtime** | **136** | **81 %** |
| entité sans bloc rendu ou sans donnée | 19 | 11 % |
| écran hors du graphe de navigation | 12 | 7 % |

`FACT` — Les 136, par nature d'effet : **`capability` 69 · `slot` 48 · `mutation` 19**.

`FACT` — Cause au code : `useDispatch` ne traite que `navigate` ; seuls les déclencheurs
`ui` l'atteignent (`packages/compiler/runtime/air-runtime.tsx`).

`FACT` — **Fiabilité de la mesure** : l'enveloppe est une *déclaration*, donc elle peut
mentir ; le cliquet `packages/execution-contract/tests/envelope-truth.test.ts` la
confronte au code réel du runtime copié — **16 tests verts le 2026-08-31**.

`CONCL.` — **La racine démontrée n'est ni l'intention perdue, ni les promesses non
exécutées : c'est l'enveloppe d'exécution** — `effects ["navigate"]` ·
`triggers ["ui"]` · `dataOperations ["list","get"]`. Les deux constats de `D-054` en
sont des **symptômes**, et le « document honnête » en est la **confirmation**, pas la
réfutation.

### 7 · `DET-008` — nœud hors plan restant, AUCUNE phase inventée

Chaîne de propriété des 136 effets non exécutés :

| effet | nombre | mécanisme | propriétaire |
|---|---:|---|---|
| `capability` | 69 | `capabilitiesEmitCode: false` | **Phase 11** |
| `slot` | 48 | `slotsInvoked: false` — `DET-018` | **Phase 11** (`D-050`) |
| `mutation` | 19 | `dataOperations: ["list","get"]` — `DataProvider` en lecture seule | 🔴 **`DET-008`** |

`FACT` — `DET-008` n'apparaît **pas une seule fois** dans `ROADMAP.md` (vérifié le
2026-08-30, `D-052`).

🔴 **Conformément à `D-052`, aucune phase n'est désignée ici** — ni Phase 11, ni aucune
autre par déduction ou convenance. `ROADMAP.md` n'est pas modifiée. **L'absence reste
visible comme telle** ; la convertir en échéance serait un abandon déguisé.

`CONCL.` — La racine des promesses mortes et la racine de la dimension C (`DET-028`)
**convergent sur le même nœud**, déjà isolé par `D-052`, et **qui n'appartient à aucune
phase**.

### Établi · Inféré — la ligne de partage

| | |
|---|---|
| **ÉTABLI par mesure** | 227 / 167 / 73,6 % · `app.description` 13/13 · `asset` 18 déclarés / 3 liés / 0 affichés · composition de `resto-riche` (9 actions, toutes `navigate`/`ui`) · enveloppe `["navigate"]`/`["ui"]`/`["list","get"]` · décomposition 136/19/12 · `app.description` absente de l'artefact · registre gelé à 6 blocs (`D-024`) · `targetId` ∌ champ · cliquet d'enveloppe 16 verts |
| **INFÉRENCE** | la racine est l'enveloppe d'exécution · la montée de schéma n'est pas requise pour la trace en texte libre · `resto-riche` ne démontre pas l'adéquation du moteur |
| **NON DÉTERMINÉ** | ce qu'exigerait une intention **structurée** · pourquoi le registre est resté à 6 blocs au-delà du gel `D-024` · si l'organe de comparaison doit être une gate, et de quelle phase |

### Portée de cette rectification

- **Aucun** code produit, schéma AIR, gate, `metrics.json` ou artefact de mesure touché.
- `D-054` **conservée intégralement** ; bandeau de renvoi ajouté en tête.
- Rectifications **en place, jamais suppression** : `STATUS.md` (entête) et
  `CHANGELOG.md` (entrée du 2026-08-31).
- **Aucun commit, aucun push.**

---

## D-055 — CRÉATION DE LA PHASE 10B : fidélité de l'application produite — 2026-08-31

**Fait établi** (`APP-D004`, D-054) : les Phases 0→10 vérifient le **moteur**.
**Aucune** ne vérifie que l'application tient ce que le document promet, ni que le
document couvre ce qui a été demandé. `DET-008` était **orphelin** — 0 occurrence
dans `ROADMAP.md`, vérifié — et `DET-028` en dépendait sans propriétaire.

**Vérification avant création** — les Phases 11→14 ont été relues une par une :

| phase | ce qu'elle possède | porte-t-elle la fidélité ? |
|---|---|---|
| 11 | routage OTA / profils de runtime | **non** |
| 12 | gate store / conformité / identité | **non** |
| 13 | distribution réelle / Guardian | **non** |
| 14 | flotte / scorecard élargi — « qualité UI » = **score A++** | **non** — A++ mesure l'apparence, jamais la fidélité à la demande |

**Décision** : créer **PHASE 10B — FIDÉLITÉ DE L'APPLICATION PRODUITE**, insérée
entre 10 et 11. **Aucune renumérotation** : les Phases 11→14 gardent leur numéro,
aucune référence existante n'est cassée. La position exprime la dépendance réelle —
10B se nourrit des artefacts de la 10 mais **n'attend pas sa clôture**, puisque
`DET-028`, qui bloque cette clôture, lui appartient désormais.

**Cinq critères de sortie, chacun avec sa condition de réfutation** : `F1` gate des
promesses · `F2` trois cas-tueurs vus échouer · `F3` demande conservée et migrée
sans perte · `F4` besoin satisfait ou déclaré inexprimable, jamais perdu · `F5`
aucun état déclaré atteignable sans l'être.

**Limite inscrite dans la phase elle-même** : elle n'établit qu'une **CONDITION
NÉCESSAIRE**. L'énoncé d'une promesse n'est pas vérifié — le moteur n'exécute pas
la logique qu'il faudrait pour cela. `P-C` : `PARTIAL → PASS` ❌.

**Voie employée** : le plan v0.1 est gelé ; toute évolution passe par
`DECISIONS.md`. C'est ce mécanisme, et non une modification silencieuse du plan,
qui crée cette phase.

---

## D-056 — AIR 1.2.0 : l'intention entre au contrat, et deux gates la font tenir — 2026-08-31

Exécution de la **PHASE 10B** créée par `D-055`. Traite la racine `APP-D004` —
non plus la mesurer, la **refermer**.

### ① L'intention entre au contrat — schéma `1.1.0 → 1.2.0`

`FACT` — l'AIR portait **19 champs** et aucun ne contenait la demande. Il en porte
**20** : `intent = { request, requestLocale, needs[] }`.

**Le champ décisif est `resolution`, requis et FERMÉ** — un besoin est soit
`satisfied` avec des `nodeIds`, soit `unexpressible` avec un `reason` non vide.
**Il n'existe pas de troisième issue, et surtout pas l'absence silencieuse** :
c'est précisément par elle que *« avec photos »* s'est évaporé dans 12 documents
sur 13.

**`intent` est OPTIONNEL au schéma, EXIGÉ par la gate.** Le rendre requis
forcerait la migration à **fabriquer** une intention pour le corpus gelé —
exactement ce que `D-044` s'était interdit. Le fail-closed vit dans la gate, pas
dans le schéma. Migration `1.1.0 → 1.2.0` : **identité**, testée comme telle.

### ② Deux gates — paquet `@deribfy/fidelity`

| critère | gate | ce qu'elle refuse |
|---|---|---|
| **F1** | `evaluatePromises` | une promesse dont la cible est morte, inexistante — **ou l'absence de promesse** |
| **F4** | `evaluateIntentCoverage` | un besoin rattaché à un nœud absent, à un nœud mort — **ou l'absence d'intention** |

Les deux **publient leurs limites dans leur propre rapport** : une cible vivante
n'est pas une promesse tenue, et un besoin jamais énuméré reste invisible.
`P-C` : `PARTIAL → PASS` ❌.

### ③ Critère F2 — les gates ont été VUES ÉCHOUER

**10 cas-tueurs**, chacun sur un défaut distinct : écran inatteignable · effet
hors enveloppe · entité sans donnée · cible inexistante · **contournement par le
silence** (ne rien promettre) · absence de compensation · **absence d'intention** ·
référence brisée · **besoin satisfait par du mort** · absence de compensation.

Les deux contournements évidents — *ne rien promettre*, *ne rien déclarer* — sont
fermés par un test chacun. Sans eux, un document muet aurait été certifié.

### ④ MESURE — les gates appliquées au réel

| document | F1 | F4 | verdict |
|---|---|---|---|
| **12 documents du corpus gelé** | 🔴 2 à 7 promesses vivantes sur 15 à 24 | 🔴 **aucune intention** | 🔴 **REFUSÉS** |
| `resto-riche` (écrit à la main) | 🟢 **10/10** | 🟢 **5 satisfaits · 2 déclarés · 0 défaillant** | 🟢 **FIDÈLE** |

`FACT` — **1 document sur 13** passe. Ce n'est pas une régression : c'est la
première fois que la question est posée.

**La démonstration décisive** — dans `resto-riche`, les deux besoins qui
disparaissaient sont maintenant **DITS**, pas perdus :

> 🟠 *« des photos sur les plats »* → registre de Smart Blocks **gelé à 6 types**, aucun bloc image
> 🟠 *« chercher un plat »* → aucun bloc de recherche, et `dataOperations` se limite à `list`/`get`

Le besoin est **porté au document**, faute de pouvoir l'être à l'application.
`LOT D` (registre v2) le lèvera ; jusque-là il est visible, daté et motivé.

### ⑤ Conséquences assumées

`RELEASE_TRAIN_V1.airSchemaVersion` porté à `1.2.0` : l'`airHash` change, donc
tous les `rootHash`. **C'est le prix d'une évolution de contrat, pas une dérive** —
même mécanique et même motif qu'en `1.1.0`.

**Deux éditions conscientes de cliquets**, chacune motivée dans le test :
le registre de migrations ne se compte plus, sa **chaîne** se vérifie (vrai pour
toutes les montées à venir) ; un pin littéral `"1.1.0"` d'une fixture devient la
constante `AIR_SCHEMA_VERSION`.

### Non-régression

`FACT` — **658 tests verts sur 16 espaces de travail · `typecheck` EXIT=0 ·
`lint` 0 écart** sur le paquet créé.

### Ce que cette décision NE fait PAS

Les gates ne sont **pas encore câblées dans l'Oracle** : elles sont exécutables et
prouvées, non imposées au pipeline. Le registre de blocs v2 (`LOT D`), la campagne
`emit-v3` (`LOT E`) et la preuve appareil (`LOT F`) restent **en arbitrage
propriétaire**. `DET-028` reste ouvert.

---

## D-057 — AUDIT INTÉGRAL DES PHASES 0 À 10 — 2026-08-31

**Mandat propriétaire** : reprendre depuis la Phase 0, dans l'ordre, ne rien rater ;
**deux vérifications indépendantes obligatoires avant toute correction**.

**Méthode** : chaque critère de sortie déclaré en `ROADMAP.md` est confronté à
l'état RÉEL du dépôt — exécution en direct chaque fois que c'est possible,
lecture d'archive seulement à défaut. Aucun critère n'est cru sur parole.

### Résultat global — 41 critères examinés

| Phase | Critères | Verdict |
|---|---:|---|
| **0** fondations | 5 | 🟢 4 satisfaits · 🔴 **1 défaut (A-P0-01)** |
| **1** bancs de mesure | 2 | 🟢 5/5 arbitrages `P-00x` tranchés · 🟠 **1 blocage mal nommé (A-P1-01)** |
| **2** AIR + capabilities | 4 | 🟢 **4/4** |
| **3** design system + blocs | 3 | 🟢 **3/3** |
| **4** compilateur déterministe | 4 | 🟢 **4/4** — critère dur **rejoué en direct** |
| **5** provisioner | 3 | 🟢 **3/3** — 20 vérifications, 0 échec |
| **6** sandbox + Oracle | 4 | 🟢 **4/4** |
| **7** workflow durable | 5 | 🟢 **5/5** — critère dur `kill -9` prouvé |
| **8** vertical slice 1 | 4 | 🔴 **2 défauts (A-P8-01, A-P8-02)** |
| **9** repair + slots | 4 | 🟢 **4/4** — 3 mutations, gardes qui mordent |
| **10** vertical slice 2 | 5 | 🔵 en cours, déjà consigné (D-048, D-053) |

### 🔴 A-P0-01 — LA CI N'A PAS VU 97 COMMITS · `P1` · **CORRIGÉ**

`FACT` — `.github/workflows/ci.yml` déclenchait sur `[main, fix/xss-jsonld]`.
La branche de travail a été renommée `feat/mobile-generation` **sans que le
déclencheur suive**.
`FACT` — dernier commit couvert : **2026-08-27**. **97 commits** jamais vus par la
CI, dont **les 5 paquets** `slots`, `repair`, `provider-registry`,
`execution-contract`, `fidelity`.
`INFÉRENCE` — le critère de sortie « CI verte » de la Phase 0 était **invérifiable
sur le travail réel** depuis quatre jours. La gate existait ; elle ne portait sur rien.
**Correction** : branche ajoutée au déclencheur, avec le motif inscrit dans le fichier.

### 🟠 A-P1-01 — UN BLOCAGE MAL NOMMÉ N'EST JAMAIS LEVÉ · `P2` · **CORRIGÉ**

`FACT` — `couts-unitaires.md` volet 2 déclarait *« prérequis : compte Expo/EAS »*.
Ce prérequis **est satisfait** : builds réellement soumis (UUID
`9bf08d4e-e612-4464-939f-35ec43997e07`), **deux APK de 77 Mo** produits les 28 et
29 août, `eas.json` sur les deux slices.
**Ma première correction était elle-même inexacte** — j'y ai nommé une défaillance
d'outillage, alors que `STATUS.md` consignait déjà sa réparation au 2026-08-29.
`FACT` — le blocage réel et **unique** est un **prérequis propriétaire** : la série
consomme du quota. Rectifié à la seconde passe.

### 🔴 A-P8-01 — `STATUS.md` SE CONTREDIT SUR LA PHASE 8 · `P1` · **CORRIGÉ**

`FACT` — le tableau de synthèse affirmait *« Phases 0, 2-9 terminées »* pendant que
le **détail du même document** disait *« En cours : Phase 8 »*.
`FACT` — le détail a raison : le critère « app installée et fonctionnelle sur
**2 appareils physiques** » n'a que **Android 🟢** ; l'IPA iOS est **construit mais
non installé** (`DET-012`, prérequis propriétaire).

### 🔴 A-P8-02 — LA CLÔTURE DE LA PHASE 8 REPOSE SUR UN CRITÈRE RÉFUTÉ DEPUIS · `P0` · **CORRIGÉ**

`FACT` — la ROADMAP exige pour clore la Phase 8 que **A à G soient CONFORMES** :
*« une seule d'entre elles non conforme BLOQUE la clôture »*.
`FACT` — **C est `non_conforme` depuis `D-048` (2026-08-30)**, donc **postérieurement**
à la clôture revendiquée.
`CONCLUSION` — la Phase 8 est **rouverte par le fait**, pour deux motifs indépendants.
`STATUS.md` le dit désormais.

### Trois constats RÉFUTÉS par la seconde vérification — la discipline a mordu

| Constat de première passe | Ce que la seconde vérification a établi |
|---|---|
| *« aucun budget unitaire documenté »* | **FAUX** — `docs/mobile-generation/benchmarks/couts-unitaires.md`, 3 volets, 2 exécutés |
| *« preuve d'isolation absente en Phase 5 »* | **FAUX** — **8 vérifications d'isolation**, toutes vertes (A↛B, B↛A, ↛cœur ×2, deny-by-default ×2) ; j'avais grepé les mauvais champs |
| *« un critère est passé de rouge à vert en 72 s par changement d'instrument »* | **FAUX** — consigné en D-034 : *« sonde secrets `MODAL_IMAGE_ID` faux positif (métadonnée publique) »* |

> **Sans la seconde vérification, j'aurais porté trois accusations fausses** — dont
> une de falsification. C'est la règle qui a produit ce résultat, pas la prudence.

### 🔴 RECTIFICATION D'UNE DÉCLARATION ANTÉRIEURE — dimension H

J'ai affirmé au propriétaire, plus tôt dans la session, que *« Dimension H → 🟢 est
faux, H vaut `non_determinee` »*. **C'était FAUX.**

`FACT` — `evaluateApxxGrid` prend un paramètre `crossDomain` **optionnel**. Sans
échantillon : `non_determinee` (*« jamais conforme par défaut »* — fail-closed
correct). Avec 2 domaines : **`conforme`** — *« 2 silhouettes distinctes, 0 collision »*.
`INFÉRENCE` — j'avais mesuré **le mauvais objet** : la grille mono-document, quand le
critère porte sur le cross-domain. La ROADMAP a raison, avec sa réserve `RN-15`
(mesure recalculée à la volée, aucun artefact de résultat versionné).

### Non-régression

`FACT` — mesurée après corrections : voir `CHANGELOG.md` du 2026-08-31 (3).
Aucune correction n'a touché au code produit : les quatre portent sur la CI et sur
la documentation d'état.

---

## D-058 — VOIE 1 : les Code Slots sont INVOQUÉS (AIR 1.3.0) — 2026-08-31

**Choix fondé sur une mesure, pas sur une intuition.** Sur les **152 promesses
mortes** du corpus : `capability` **61** · `slot` **44** · `mutation` **17** ·
entité sans donnée 19 · écran inatteignable 11. **80 % meurent d'un effet non
exécuté** — et les deux premiers tueurs **ne dépendent ni du backend ni de
l'asynchrone.** J'allais commencer par les données ; c'était faux.

### Le diagnostic — `DET-018` avait une cause précise

`FACT` — le compilateur **émettait déjà** `slots/<id>.ts` et `slots/index.ts`, et
l'Oracle **refusait déjà** les slots exfiltrants (3 mutations, gardes qui mordent).
`FACT` — **rien ne les appelait.** `slotsInvoked: false`.
`INFÉRENCE` — parce que `{kind:"slot", slotId}` **nommait** un slot sans dire ni ce
qu'on lui donne, ni ce qu'on fait de son résultat. **Le câblage était
inexprimable** — exactement le défaut de l'intention avant 1.2.0.

### AIR 1.3.0 — la liaison

`binding: { inputs: [{port, source}], outputs: [{port, blockId, prop}] }`, **unions
fermées** : une entrée vient des lignes d'une entité ou d'un littéral déclaré ; une
sortie alimente la prop d'un bloc. **Aucune expression arbitraire.**

Le validateur exige la **TOTALITÉ** : une entrée déclarée par le slot et non liée
est **refusée** (`AIR_SLOT_INPUT_UNBOUND`) — un port manquant produirait un
`undefined` silencieux dans du code d'auteur. Ports inconnus, entités et blocs
inexistants : refusés aussi. `binding` **optionnel**, migration **identité** : les
12 documents gelés n'en portent pas, et on ne leur en invente aucune.

### Le moteur

`useSlotOverrides` exécute les slots liés **au rendu de l'écran** et écrit leurs
sorties dans les props des blocs ciblés. **Trois refus délibérés** : slot absent du
registre → aucune surcharge · slot qui lève → aucune surcharge, l'écran rend quand
même · port absent du résultat → aucune surcharge pour ce port.

**Règle d'appartenance STRUCTURELLE** : un slot appartient à l'écran dont **une
sortie** cible un bloc — c'est la sortie qui dit où le résultat sert. Aucune
devinette sur le déclencheur.

### 🔴 DEUX SURDÉCLARATIONS QUE J'AI CRÉÉES — refusées par les cliquets

1. J'ai ajouté `slot` à `effects`. **Faux** : `effects` décrit ce que le
   **dispatcher** exécute sur un appui ; un slot est calculé **au rendu**.
   `envelope-truth` a refusé. **Reverté.**
2. J'ai basculé `slotsInvoked: true`, et la métrique par document — `envelope
   .slotsInvoked ? air.slots.length : 0` — a fait **passer les 44 slots du corpus
   de 0 à 44 sans qu'un seul soit lié.** `corpus.test.ts` a refusé. La métrique
   compte désormais les slots **réellement liés dans CE document**.

> **Les cliquets de véracité m'ont attrapé deux fois en dix minutes.** C'est
> exactement ce pour quoi ils ont été écrits.

### La preuve — au RENDU, pas dans le source

`docs/elite-protocol/evidence/observation/slot-invoque.obs.tsx` monte l'écran
panier de `resto-riche` avec le registre réel :

| | rendu |
|---|---|
| **contrôle négatif** — sans registre | *« Vérifiez avant de commander »* (la prop **déclarée**) |
| **avec registre** | **`Total : 2 911 FCFA`** — calculé sur les **7 lignes réelles** |

La prop déclarée est **remplacée**, pas juxtaposée. Sans le contrôle négatif, le
vert n'aurait rien prouvé.

**Un bug réel attrapé par ce rendu** : `App.tsx` importait `./slots/registry` alors
que le registre est émis en `slots/index.ts`. **L'app générée n'aurait pas
résolu son import** — et aucun test de source ne l'aurait vu.

### Effet mesuré — et ce qu'il n'est PAS

`FACT` — **le corpus gelé est INCHANGÉ** : 12/12 toujours refusés, ses 44 promesses
de slot toujours mortes. C'est **correct** : elles n'ont aucune liaison. Le moteur a
gagné une capacité ; **seuls les documents qui l'expriment en bénéficient.**
`INFÉRENCE` — la suite de la VOIE 1 appartient au **générateur** : sans liaisons
émises, les 44 promesses restent mortes.

### Non-régression

`FACT` — **658 tests verts · 16 espaces de travail · typecheck EXIT=0 · lint EXIT=0.**
`RELEASE_TRAIN_V1` porté à `1.3.0` : l'`airHash` change, donc tous les `rootHash`.

---

## D-059 — VOIE 2 : la couture des capabilities, et le blocage qui la borne — 2026-08-31

**Cible mesurée** : `capability` est le **premier tueur** — **61 des 152 promesses
mortes** du corpus. 88 actions `capability` au total, réparties sur 14 capabilities.

### 🔴 BLOCAGE DUR, TROUVÉ AVANT D'ÉCRIRE UNE LIGNE

`FACT` — chaque capability du registre gelé exige **son paquet npm**
(`expo-sharing`, `expo-location`, `expo-notifications`, `@supabase/supabase-js`…).
`FACT` — l'app émise embarque un **`package-lock.json` de 233 Ko verrouillant
504 paquets**, et le pipeline installe avec `npm ci --ignore-scripts`
(`packages/sandbox/src/pipeline.ts`) — commande qui **ÉCHOUE si le manifeste et le
lock divergent**.
`CONCLUSION` — **livrer une seule implémentation de capability exige d'étendre le
lock EMBARQUÉ du moteur** : résolution réseau de l'arbre transitif, empreintes
d'intégrité, ré-embarquement. Cela fait grandir le **train de release**, déplace
`EMBEDDED_ASSETS_FINGERPRINT` et **tous les `rootHash`**. **Arbitrage propriétaire.**

> Je l'ai vérifié **avant** de coder, pas après. C'est la différence entre un
> chantier borné et un chantier abandonné à mi-course.

### Ce qui EST livré — la couture

`capability-provider.tsx` : contrat `CapabilityProvider.invoke(call) → boolean`,
sur le patron exact du fournisseur de données. **Le défaut REFUSE ET TRACE**
(`AIR_CAPABILITY_NOT_IMPLEMENTED:<capability>.<method>`) — il ne prétend jamais
avoir agi. Retourner `true` en silence serait `APP-D002` à l'identique.

Le dispatcher ne **jette plus** l'effet : il le **présente**. Et l'émetteur
transporte enfin `capability`, `method` et `params` jusqu'au runtime — sans eux, le
dispatcher n'avait littéralement rien à présenter.

### 🔴 UN TROISIÈME FAUX VERT REFUSÉ PAR LES CLIQUETS

`capability` **N'ENTRE PAS** dans `envelope.effects`. **Présenter n'est pas
exécuter** : le fournisseur par défaut refuse. L'y ajouter aurait fait basculer les
**61 promesses de capability du corpus de mortes à vivantes sans qu'une seule ligne
ne s'exécute.**

Le cliquet exigeait `branches === effects`. Il exige désormais la propriété qui
compte : **tout effet déclaré a sa branche, et toute branche EN PLUS est justifiée
par un refus explicite** — vérifié jusque dans le source du fournisseur
(`return false;`).

### Effet mesuré — honnêtement, aucun

`FACT` — **le corpus est INCHANGÉ** : `resto-quartier` toujours 4/18, 12/12
refusés. `capabilitiesEmitCode` reste **`false`**.
`CONCLUSION` — **la VOIE 2 n'est PAS terminée.** L'architecture est posée et
prouvée ; **les 61 promesses restent mortes** jusqu'à l'arbitrage sur le lock.

### Non-régression

**658 tests verts · 16 espaces de travail · typecheck EXIT=0 · lint EXIT=0.**

---

## D-060 — A++ EST ATTEINT : les états de blocs sont réellement atteints — 2026-08-31

**Le verrou d'A++ n'était pas un manque de travail. C'était une IMPOSSIBILITÉ.**

### Le diagnostic qui a tout changé

La dimension C exige que **tout bloc consommant des données expose
`loading`/`empty`/`error`**. Le corpus lie trois types à une entité : `list`,
`form`, `detail_header`.

`FACT` — `FormBlockState` valait `"ready" | "submitting" | "error"` : **ni
`loading`, ni `empty`**.
`FACT` — `DetailHeaderBlockProps` n'avait **aucune prop `state`**.
`CONCLUSION` — deux types sur trois **ne pouvaient pas EXPRIMER** les états que le
critère nomme. **C n'était pas « non atteinte » : elle était INATTEIGNABLE.**
Aucune quantité de travail sur le moteur ne l'aurait rendue conforme.

`FACT` — et le fournisseur de données était **purement synchrone** :
`listInstances()` rendait un tableau. **`loading` était l'état d'une attente qui
n'existait pas ; `error` celui d'un appel qui ne pouvait pas échouer.**

### Les deux levées

**① Registre de blocs 1.0.0 → 1.1.0 — DÉGEL DÉLIBÉRÉ, STRICTEMENT ADDITIF.**
`FormBlockState` gagne `loading` et `empty` · `DetailHeaderBlock` gagne un état ·
les trois blocs à données gagnent `loadingTitle`/`errorTitle`/`errorMessage`.
**Rien n'est retiré**, `state` reste optionnel, défauts inchangés : un appelant
1.0.0 se comporte à l'identique — propriété **vérifiée par le cliquet**, pas
seulement déclarée.

**② `DataProvider.status?()` — OPTIONNEL.** Sans lui, comportement de 1.0.0 au
caractère près. Avec lui, `loading` et `error` deviennent atteignables. Et comme
partout : **un état sans titre DÉCLARÉ n'est pas rendu** — le moteur n'invente
aucun texte (F3).

### La preuve — au RENDU, avant l'enveloppe

`etats-atteints.obs.tsx` monte l'écran avec une source qui rapporte son état :

| source | rendu |
|---|---|
| `ready` *(contrôle négatif)* | ni chargement ni erreur |
| `loading` | **« Chargement de la carte »** |
| `error` | **« Carte indisponible »** |

**L'enveloppe n'a été élargie qu'APRÈS cette observation.** C'est l'inverse exact
de l'erreur que `D-052` avait corrigée — déclarer sur lecture de source.

### RÉSULTAT — A++ ATTEINT SUR LES 8 DIMENSIONS

```
A:conforme · B:conforme · C:conforme · D:conforme
E:conforme · F:conforme · G:conforme · H:conforme
```

> **Ne pas lire ceci comme l'inverse de `D-048`.** Là, l'instrument avait cessé
> de mentir et C était tombée **sans que le produit change**. Ici, **l'instrument
> est INCHANGÉ, ligne pour ligne** — c'est le produit qui a bougé. Les deux
> décisions vont dans le même sens : la mesure porte sur l'état ATTEINT.

### Ce que cela NE ferme PAS

`FACT` — **le corpus de fidélité est INCHANGÉ** : 12/12 toujours refusés,
`resto-quartier` toujours 4/18. **Aucun faux progrès.** A++ mesure la QUALITÉ DE
L'INTERFACE ; les gates de fidélité mesurent si l'app **tient ses promesses**.
**Deux propriétés distinctes — et la seconde n'est toujours pas tenue.**

`submitting` reste inatteignable sur `form` : il suppose une **écriture**. Il
tombera avec la **VOIE 3** (mutation), pas avant. L'écart se rétrécit, il ne
disparaît pas.

### Non-régression

**657 tests verts · 16 espaces de travail · 0 échec · typecheck EXIT=0 · lint EXIT=0.**
`RELEASE_TRAIN_V1` : `blockRegistryVersion` → `1.1.0`, `blocksSourcesHash` re-scellé.

---

## D-061 — VOIE 3 : les MUTATIONS s'exécutent — 2026-08-31

`FACT` — le contrat de données ne savait que **LIRE** : `listInstances` et
`getInstance`. Un bouton « Commander », un formulaire « Enregistrer » ne
produisaient **rien**. 17 promesses de `mutation` en mouraient.

### La levée

`DataProvider` gagne `create?` / `update?` / `remove?`, **OPTIONNELLES**. Le
dispatcher présente l'écriture ; **une source en lecture seule n'expose pas la
méthode, donc l'appel est ABSENT — jamais un faux succès.** C'est ce `?` qui
empêche `mutation` de redevenir une promesse que rien ne fonde.

Chaque méthode retourne `true` si l'écriture a été **honorée** — jamais un
`void` optimiste : l'appelant doit pouvoir distinguer « écrit » de « refusé ».

Le formulaire transmet enfin **ses valeurs saisies** à l'action : sans elles,
une création écrivait un enregistrement vide.

### Effet MESURÉ sur le corpus — le compteur monte pour la première fois

| document | avant | après |
|---|---:|---:|
| `plombier-urgence` | 7/21 | **9/21** |
| `suivi-chantier` | 6/15 | **8/15** |
| `toiletteur-chiens` | 6/15 | **8/15** |
| `livraison-fruits` | 4/24 | **7/24** |
| `resto-quartier` | 4/18 | **6/18** |

`FACT` — **effets exécutés : 26 → 48. Contrôles fantômes : 67 → 45.**
**22 contrôles ont cessé d'être muets.**

### Six cliquets consciemment édités

`corpus.test.ts` (×2) · `envelope-truth.test.ts` (×2) · `feasibility.test.ts` ·
`graph.test.ts` · `promises.test.ts`. Chacun constatait que `mutation` était
inerte. **Le contraste qui prouve que les mesures discriminent encore se porte
désormais sur `capability`** — seul effet restant sans exécution : les fixtures
de test ont été basculées dessus, pas supprimées.

`FACT` — la mention *« non-opération v1 »* a **disparu du runtime**. Elle
couvrait `capability`/`mutation`/`slot` ; **les trois ont désormais une branche.**

### Non-régression

**657 tests verts · 0 échec · typecheck EXIT=0 · lint EXIT=0.**

---

## D-062 / D-063 — Les RÈGLES s'appliquent, le drapeau RTL agit — 2026-08-31

### D-062 — `rulesEnforced: false → true`

`FACT` — `air.rules` n'était lu par **AUCUN étage**. Un document pouvait déclarer
*« le téléphone est obligatoire »* et l'application écrivait sans lui.
**67 règles déclarées au corpus, 0 appliquée.**

Les règles de `kind: "validation"` sont désormais évaluées **AVANT toute
écriture** ; une violation **ANNULE la mutation**. Fermé par construction : seuls
les 9 opérateurs du schéma sont évalués. **Un opérateur inconnu ne bloque
JAMAIS** — refuser sur une règle qu'on ne sait pas lire serait s'arroger un
jugement.

**Portée déclarée, pas élargie en douce** : `authorization` n'est **PAS**
appliquée — elle suppose une identité que le moteur n'a pas. Le cliquet le
vérifie.

**67 règles → 67 appliquées.**

### D-063 — `rtlFlagEffective: false → true`

`FACT` — `app.locales.rtlSupported` était transporté par le schéma et lu par
aucun étage : **deux documents, l'un RTL l'autre non, produisaient le MÊME
artefact.** Le non-négociable #16 n'était pas tenu.

Le drapeau pilote désormais `I18nManager.allowRTL` à la racine de l'app émise.

### 🔴 Ce que j'ai REFUSÉ de faire — `themeNameEffective`

J'ai écrit une graine de teinte dérivée de `design.theme`, puis **je l'ai
retirée**. Elle touchait **toutes les couleurs de toutes les apps** — donc la
dimension B (contraste WCAG) et les cliquets du design system — en fin de longue
session, sans marge pour la valider correctement.

`themeNameEffective` reste **`false`**, honnêtement. **Livrer un changement de
couleurs non validé pour faire tomber un `false` de plus aurait été exactement le
faux vert que ce chantier passe son temps à refuser.**

### Non-régression

**657 tests verts · 0 échec · typecheck EXIT=0 · lint EXIT=0.**

---

## D-064 — AIR 1.4.0 : la traversée de relation — 2026-08-31

`FACT` — `relationTraversal: false` signifiait qu'un champ `reference` s'affichait
en **IDENTIFIANT BRUT** : *« ent_plat_003 »* au lieu de *« Thiéboudienne »*.
**6 occurrences mesurées au corpus gelé.**

`FACT` — le champ déclarait `referencesEntityId` — vers **quoi** pointer — et
**rien ne disait QUOI MONTRER**. Encore un câblage inexprimable, le quatrième de
la session après l'intention, la liaison de slot et les titres d'état.

### La levée

`referenceDisplayFieldId`, optionnel, sur le champ. Le validateur exige qu'il
existe **sur l'entité cible** et que le champ soit bien une référence.

> **Deviner « le premier champ texte de la cible » aurait été une convention,
> c'est-à-dire une supposition.** Le document déclare. Sans déclaration,
> l'identifiant brut reste affiché — comportement 1.3.0 inchangé.

### La preuve — au rendu

`traversee.obs.tsx` : le panier de `resto-riche` affiche les **noms des plats**,
et le contrôle vérifie qu'**aucun identifiant `ent_plat*` ne fuit à l'écran**.

### Le cliquet a tenu, et il a été précisé

Le test vérifiait qu'aucun BLOC n'accepte de chemin de relation. **C'est toujours
vrai** — pas de `targetFieldId`, pas de `relationPath`. La traversée vit sur le
**CHAMP**, pas sur le bloc. Le cliquet le dit désormais explicitement.

### Non-régression

**657 tests verts · 0 échec · typecheck EXIT=0 · lint EXIT=0.**
`RELEASE_TRAIN_V1.airSchemaVersion` → `1.4.0`.

---

## D-065 — Tri, filtre et pagination des listes — 2026-08-31

`FACT` — `listFiltering: false` : une liste rendait **TOUJOURS tout**, dans
l'ordre du dataset. Aucun tri, aucun filtre, aucune borne.

### La levée — unions FERMÉES

`sortFieldId` + `sortDirection` (`asc`/`desc`) · `filterFieldId` +
`filterOperator` (`eq`/`neq`/`contains`) + `filterValue` · `pageSize` (entier,
borné à 200). **Toutes optionnelles.**

**Aucune expression arbitraire n'entre dans un document** — c'est la propriété
que le cliquet vérifie désormais : pas de `where:`, `query:`, `expression:`,
`predicate:`. Trois opérateurs nommés, une direction nommée, une borne entière.

**Ordre d'application volontaire : filtrer → trier → borner.** L'inverse
tronquerait avant d'avoir vu toutes les lignes.

Sans props, la liste rend tout dans l'ordre du dataset — comportement antérieur
**inchangé au caractère près**.

### Non-régression

**658 tests verts · 0 échec · typecheck EXIT=0 · lint EXIT=0.**
`blocksSourcesHash` re-scellé ; registre toujours 1.1.0, rien retiré.

---

## D-066 — L'état d'un formulaire survit au changement d'écran — 2026-08-31

`FACT` — `useState` vivait **DANS** le composant. Un utilisateur qui remplissait
ses coordonnées, revenait vérifier son panier, puis repartait — **retrouvait un
formulaire vide.** Sur un parcours de commande, c'est l'abandon garanti.

### La levée

`FormStateRoot` tient l'état **au-dessus des écrans**, indexé par identifiant de
bloc, et l'app émise le monte à sa racine.

**Portée DÉCLARÉE, pas élargie** : magasin **éphémère en mémoire** — partagé entre
écrans, **remis à zéro au redémarrage**. Aucune persistance disque n'est promise :
ce serait une capability, et elle n'en est pas une. Le cliquet vérifie l'absence
d'`AsyncStorage`.

### Un écart de FAISABILITÉ a disparu

`EXEC_CROSS_SCREEN_FORM_STATE` n'est plus émis. Le test ne retire pas la ligne :
il **vérifie désormais son ABSENCE** — sans quoi une régression le ferait revenir
en silence.

### Non-régression

**658 tests verts · 0 échec · typecheck EXIT=0 · lint EXIT=0.**

---

## D-067 — Le nom du thème produit une identité visuelle — 2026-08-31

`FACT` — `design.theme` était transporté par le schéma et **lu par AUCUN étage**.
Conséquence mesurée au banc anti-template : **12 documents, 12 thèmes déclarés,
UNE SEULE identité visuelle.**

### La levée, et pourquoi elle est SÛRE

Le nom fait tourner la **teinte** de l'accent. **Seule la teinte bouge** —
saturation et luminosité conservées, car le contraste dépend d'abord de la
luminosité. Déterministe : même nom → même teinte. Les surcharges explicites sont
appliquées **après** et gardent la priorité.

**Résultat : 12 identités visuelles distinctes sur 12 thèmes.**

### 🔴 Le risque s'est réalisé, et j'ai réparé plutôt que reculer

`FACT` — première mesure : **2 documents en échec sur la dimension B** —
`dark:primaryText/surface = 4,16` (seuil 4,5).

`INFÉRENCE` — l'encre était dérivée **contre le fond seul**, alors que le texte
primaire s'affiche **aussi sur les surfaces**. *Dériver contre le fond, c'était
garantir le contraste là où on regardait, pas là où le texte est lu.*

**Correction** : l'encre est désormais dérivée contre la **surface la plus
exigeante**. `FACT` — **0 échec sur 12.**

> C'est la deuxième fois de la session que j'ai touché à ce chantier. La
> première, j'avais **retiré** la modification faute de marge pour la valider.
> Cette fois, la marge existait — et la mesure a immédiatement montré le défaut.

### Propriétés DÉLIBÉRÉMENT levées, non contournées

**« Additivité stricte »** — sans surcharge, le thème émis était byte-identique à
la copie embarquée. Cette propriété **coûtait** l'identité visuelle de toutes les
apps. Le test ne disparaît pas : il vérifie désormais le **déterminisme** (même
document → même thème) et la **distinction** (12 documents → 12 modules).

**Le test « 12 thèmes, UNE SEULE identité »** existait pour **constater un
défaut**. Il devient un **cliquet inverse** : si la variété retombait, il
échouerait de nouveau.

### Un écart de faisabilité disparaît

`EXEC_THEME_NAME_INERT` n'est plus émis. **Un document éditorial n'a désormais
AUCUN écart de faisabilité.** Le contraste réalisable/dégradé se démontre sur
`capability`, seul effet restant sans exécution.

### Non-régression

**659 tests verts · 0 échec · typecheck EXIT=0 · lint EXIT=0.**
**A++ : A·B·C·D·E·F·G·H toutes CONFORMES sur 2 domaines.**

---

## D-068 — Les déclencheurs de CYCLE DE VIE sont honorés — 2026-08-31

`FACT` — `triggers: ["ui"]` : le moteur n'exécutait QUE les actions déclenchées
par un appui. **62 actions du corpus déclaraient un déclencheur `lifecycle` et
étaient purement IGNORÉES** — `screen_open` 40 · `app_start` 19 ·
`screen_close` 3. Un pan entier du contrat d'action, sans implémentation.

### La levée — les TROIS événements, sans exception muette

`AirScreenLifecycle`, composant **sans rendu** monté en tête d'écran : actions
d'ouverture au montage, de sortie au démontage. Une action `app_start` (sans
`screenId`) n'est attachée qu'à **l'écran d'entrée** — sinon elle s'exécuterait à
chaque écran, ce qui n'est pas ce que « démarrage de l'application » veut dire.

**`data` reste ABSENT de l'enveloppe** : réagir à la création ou à la
modification d'une entité suppose une source qui **NOTIFIE**, et le contrat de
données n'en a pas. Le déclarer aurait été la surdéclaration la plus facile de la
session.

### 🔴 Le gain est PETIT, et le dire est le point

`FACT` — effets exécutés : **48 → 49**. **Une seule** action de plus.

`INFÉRENCE` — **honorer un déclencheur ne rend pas vivant ce que l'effet ne sait
pas faire.** Les 61 autres actions `lifecycle` portent des effets `capability`
ou des slots **sans liaison** : elles restent mortes, et la gate le dit.

> Le réflexe aurait été de compter 62 promesses ressuscitées. Le cliquet du
> corpus a mesuré **une**. C'est la bonne réponse.

### Non-régression

**659 tests verts · 0 échec · typecheck EXIT=0 · lint EXIT=0.**
**A++ : A·B·C·D·E·F·G·H toutes CONFORMES sur 2 domaines.**

---

## D-069 / D-070 / D-071 — INSPECTION DE L'APPLICATION : trois défauts que 659 tests ne voyaient pas — 2026-08-31

**Déclencheur propriétaire** : *« est-ce que tu as bien regardé l'appli, vérifié
toi-même avant moi ? »* **Réponse honnête : non.** Onze décisions avaient été
prises sans jamais monter les 7 écrans ensemble, ni compiler l'app émise, ni
presser un seul bouton. Je l'ai fait. **Trois défauts sont sortis.**

### 🔴 D-069 — L'APPLICATION ÉMISE NE COMPILAIT PAS

`FACT` — `tsc` du projet `resto-riche` : **erreur TS2322**. Un slot déclare ses
entrées précises (`{lignes, devise}`) ; TypeScript **refuse** de l'assigner à un
registre typé `Record<string, unknown>` — contravariance des paramètres.

`CONCLUSION` — **toute application portant un slot échouait au `tsc` de son
propre projet**, donc au pipeline (`npm_ci` → `typecheck`). **Aucun des 659 tests
ne le voyait : ils vérifiaient le TEXTE émis, jamais qu'il COMPILE.**

**Correction** : le registre émet un **adaptateur** au point de jonction. La
conformité des ports n'est pas perdue — elle est garantie par le VALIDATEUR
(`AIR_SLOT_INPUT_UNBOUND`), qui refuse un document dont la liaison ne couvre pas
exactement les entrées. `FACT` — **app émise : `tsc` EXIT=0.**

### 🔴 D-071 — LE FORMULAIRE N'AFFICHAIT PAS CE QU'ON TAPAIT

`FACT` — `FormStateRoot` (D-066, écrit quelques heures plus tôt) tenait son
magasin dans un **`useRef`**. Il partageait bien l'état entre écrans — mais
**aucune écriture ne provoquait de rendu**. Conséquence : la saisie **ne
s'affichait pas**, et la soumission envoyait les valeurs du rendu **précédent**,
donc **vides**.

`INFÉRENCE` — un défaut que **seule la frappe réelle** pouvait révéler. Le test
d'origine montait le composant et vérifiait son existence ; il ne tapait rien.

### 🔴 D-070 — LE CONTRAT NE SAVAIT PAS « ÉCRIRE PUIS NAVIGUER »

`FACT` — un effet d'action est **UNIQUE**. Un formulaire ne pouvait donc pas
« enregistrer PUIS confirmer » : il fallait choisir.
`FACT` — **les 9 actions de ma propre vitrine étaient toutes `navigate`.**
*« Valider » changeait d'écran sans rien enregistrer* — et **la gate de fidélité
laissait passer**, puisque sa cible était bien vivante.

> **C'est la limite de la gate, écrite dès le premier jour, qui vient de mordre
> sur mon propre document de démonstration.** Une cible vivante n'est pas une
> promesse tenue.

**AIR 1.5.0** : `thenScreenId` optionnel sur l'effet `mutation`. **La navigation
n'a lieu QUE SI L'ÉCRITURE A RÉUSSI** — envoyer quelqu'un sur un écran de
confirmation après un refus de règle serait un mensonge de l'interface.
L'atteignabilité reconnaît ce chemin, sinon `scr_confirmation` serait déclaré
mort alors que l'utilisateur y arrive.

### La vitrine est devenue honnête

`resto-riche` : « Valider » **crée réellement le client**, puis confirme. Une
**règle** exige le téléphone. Mesuré au rendu :

| geste | résultat |
|---|---|
| saisie complète puis soumission | **`create:ent_client:{nom, telephone, email}`** — écriture réelle |
| soumission **sans téléphone** | **0 écriture** — la règle refuse |
| source en **lecture seule** | aucun appel, **aucun crash** |

### Ce que l'inspection a aussi confirmé

**7/7 écrans montés sans exception** (8 à 38 identités adressables chacun) ·
**aucun identifiant technique ne fuit à l'écran** (`ent_`, `scr_`, `fld_`…).

### Non-régression

**659 tests verts · 0 échec · typecheck EXIT=0 · lint EXIT=0 ·
17 observations au rendu · `tsc` de l'app émise EXIT=0.**
**A++ : A·B·C·D·E·F·G·H toutes CONFORMES.**

---

## D-072 — LA RACINE : aucune gate ne compilait ni ne rendait l'application émise — 2026-08-31

**Arbitrage propriétaire** : *« couper la tête ne suffit pas, ça repoussera —
résoudre depuis la racine. »* Il avait raison, et le chiffre le prouve.

### Le diagnostic de fond

`FACT` — les 659 tests du moteur vérifient le **TEXTE émis** : *le fichier
contient-il telle chaîne, telle structure ?* **Aucun ne compile, aucun n'exécute
l'application produite.**

`INFÉRENCE` — c'est la cause commune de `APP-D002` (56 contrôles muets),
`APP-D003` (états jamais atteints), `D-069` (registre de slots non compilable) et
`D-071` (formulaire qui n'affiche rien). **Chacun a été corrigé une tête à la
fois ; aucun n'était empêché de revenir.**

### 🔴 LA MESURE — 11 APPLICATIONS SUR 14 NE COMPILAIENT PAS

La gate construite, passée sur le corpus entier :

```
    3 / 14 applications compilent
```

`FACT` — cause unique : `AirRuleData.assertions[].value` était typé **à la main**
dans le runtime comme `string | number | boolean | null`. Or `jsonLeafSchema`
autorise les **TABLEAUX**, qu'emploie l'opérateur `in`
(`value: ["payee", "annulee", …]`). **Toute application portant une règle `in`
échouait au `tsc` de son propre projet** — donc au pipeline.

`INFÉRENCE` — **le défaut vient d'un TYPE ÉCRIT À LA MAIN, miroir du schéma, qui
a dérivé en silence.** Le runtime est un fichier COPIÉ dans l'app générée : il ne
peut pas importer le schéma. Le miroir est donc structurel — **seule une gate qui
compile peut détecter sa dérive.**

`FACT` après correction : **14 / 14 applications compilent.**

### La racine, refermée

Deux gates versionnées, **et surtout CÂBLÉES DANS LA CI** — c'est ce câblage qui
est la correction de racine, pas les types :

| gate | ce qu'elle refuse |
|---|---|
| `gate:app-compile` | une application émise qui **ne compile pas**, `tsc` réel avec les vraies dépendances, sur les 14 documents |
| `gate:app-rendu` | un écran **sans identité adressable** · une **fuite d'identifiant technique** dans une valeur affichée |

Les deux entrent dans l'étape **Gate** du workflow : leur échec fait échouer la CI.

### L'instrument a été vérifié AVANT d'être cru

`FACT` — première exécution de `gate:app-rendu` : **0 identité sur 14
applications**, verdict 🔴 partout. **C'était mon extracteur qui était faux**, pas
les applications : il découpait sur la première accolade, qui appartenait à un
commentaire. Corrigé → **14/14 passent.**

> Publier ce premier verdict aurait été une accusation fausse contre les
> 14 applications. C'est la troisième fois de la session que vérifier
> l'instrument avant de le croire évite une conclusion erronée.

### Non-régression

**659 tests verts · 0 échec · typecheck EXIT=0 · lint EXIT=0 ·
14/14 applications compilent · 14/14 se rendent.**

---

## D-073 / D-074 — Mes propres gates ne tenaient pas leurs promesses — 2026-08-31

### 🔴 D-073 — `gate:app-rendu` SURDÉCLARAIT

`FACT` — elle s'appelait *« se rendent »* et se contentait de **LIRE les modules
de données émis**. Elle ne montait rien.

> **C'est exactement le défaut qu'elle existe pour attraper** : un nom qui promet
> plus que la mesure. Le même que la dimension C cherchant une sous-chaîne, le
> même que `slotsInvoked` que j'ai failli déclarer vrai sans liaison.

Version réelle : chaque écran est **MONTÉ** avec React et ses données de
démonstration. Trois refus — exception au montage · écran sans identité
adressable · **fuite d'identifiant dans un TEXTE RENDU** (et non plus dans une
prop, qui n'était qu'un proxy).

`FACT` — **14 applications · 58 écrans montés · 2030 identités · 0 problème.**

L'ancien script est **supprimé**, pas gardé en doublon : *deux gates du même nom
dont l'une ment est pire que pas de gate.*

### 🔴 D-074 — LES GATES NE POUVAIENT TOURNER QUE CHEZ MOI

`FACT` — trois défauts de portabilité, trouvés en relisant après le push :

1. chemin **absolu** de ma machine (`/Users/yia/Documents/woorri/`) ;
2. répertoire temporaire propre à **ma session** ;
3. dépendance à `slices/resto-riche/app/node_modules` — **`slices/` n'est pas un
   workspace npm** et `node_modules` est ignoré par git : sur une machine propre,
   la gate sortait en **code 2 avant de compiler quoi que ce soit**.

`CONCLUSION` — **la CI que je venais de câbler aurait échoué sur ma propre
gate.** Une gate qui ne tourne que chez son auteur ne protège personne — défaut
identique à `A-P0-01`, où la CI ne voyait pas la branche de travail.

**Correction** : racine calculée depuis `import.meta.url` · `os.tmpdir()` ·
**installation automatique** des dépendances si absentes, jamais d'abandon
silencieux.

`FACT` — **vérifié par simulation réelle** : `node_modules` déplacé, gate
relancée → installation, puis **14/14 compilent**.

### Non-régression

**659 tests verts · 0 échec · typecheck EXIT=0 · lint EXIT=0 ·
14/14 compilent · 58/58 écrans montés.**

---

## D-076 — LA CI A VU CE QUE MA GATE NE VOYAIT PAS — 2026-08-31

### La CI est VERTE, et le correctif de portabilité était la cause

`FACT` — run sur `c2758fc`, machine GitHub (`linux x64`, node `v24.19.0`) :
**`gate:app-compile` 14/14** (auto-installation : 493 paquets en 10 s) ·
**`gate:app-rendu` 14 applications · 58 écrans · 2030 identités · 0 problème**.
Les 7 contrôles historiques : **tous SUCCESS**.

### 🔴 Mais le journal contenait un défaut RÉEL que ma gate ignorait

`FACT` — trois fois dans le log :
> `Encountered two children with the same key, ``. […] the behavior is
> unsupported and could change in a future version.`

`FACT` — cause : `key={badge}` dans `DetailHeaderBlock`. Deux champs de badge
**VIDES** produisaient deux clés `""`.
`INFÉRENCE` — **ma gate ne surveillait que les EXCEPTIONS.** Un avertissement
React que React lui-même qualifie de « comportement non supporté » passait
inaperçu. **Il a fallu que la CI l'imprime pour que je le voie.**

### La correction, aux deux niveaux ET dans la gate

| | |
|---|---|
| `components.tsx` | clé rendue **unique par la position** — indépendante des valeurs |
| `air-runtime.tsx` | un badge **vide n'est pas un badge** : il n'est plus rendu du tout |
| **la gate** | **capture `console.error`/`console.warn` et fait ÉCHOUER sur tout avertissement React** |

`AIR_CAPABILITY_NOT_IMPLEMENTED` est **explicitement exclu** de cette capture :
ce n'est pas un défaut, c'est le fournisseur par défaut qui **refuse et trace**,
exactement comme conçu — le journal de CI l'a d'ailleurs montré à l'œuvre sur
`geolocation`, `auth`, `analytics`, `offline_storage`, `maps`, `media_upload`,
`push_notifications`. **Le manque est visible et nommé à l'exécution.**

### CAS-TUEUR — la gate a été VUE échouer

`FACT` — les deux correctifs retirés, la gate rapporte
**`1 problème(s)` · `🔴 AVERTISSEMENT REACT : Encountered two children with the
same key`** et **échoue**. Rétablis : **0 problème**.

> Il a fallu retirer **les deux** correctifs pour reproduire : chacun seul
> suffisait à masquer le défaut. Un cas-tueur qui ne mord pas doit être creusé,
> jamais accepté comme preuve.

### Non-régression

**659 tests verts · 0 échec · typecheck EXIT=0 · lint EXIT=0 ·
14/14 compilent · 58/58 écrans montés · 0 avertissement React.**
`blocksSourcesHash` re-scellé.

---

## D-078 / D-079 — CAMPAGNE emit-v3 : cinq causes, dont deux dans mes instruments — 2026-08-31

**Exigence propriétaire** : *« vérifie, revérifie, fais des simulations ; ne demande
l'autorisation qu'une fois la réussite établie. »*

### Ce que la vérification a évité — avant tout appel

`FACT` — **`emit-v3.mjs` n'avait JAMAIS été syntaxiquement valide.** Douze
backticks non échappés fermaient le littéral du prompt système. Il portait
pourtant la mention « NON EXÉCUTÉ » : **écrit, jamais lancé, donc jamais vu
casser.** Sans l'essai, la campagne aurait été autorisée sur un script qui ne
démarre pas.

`FACT` — il visait `airSchemaVersion = "1.1.0"` : il ne demandait **ni intention,
ni liaison de slot, ni `thenScreenId`, ni titres d'état, ni champ d'affichage de
référence**. Les documents produits auraient encore échoué les gates.

**Sept règles ajoutées** (11→17), dont la **17 — honnêteté sur les capabilities**,
que la SIMULATION a révélée : le modèle promettait des capabilities que le moteur
n'exécute pas. *Déclarer le besoin est juste ; le promettre est un mensonge.*

### Les cinq causes d'échec, et à qui elles appartenaient

| # | cause | fautif |
|---|---|---|
| 1 | syntaxe invalide depuis toujours | le script |
| 2 | réponse **tronquée** à 8000 jetons, rapportée en « erreur de parsing » | le script — `stop_reason` jamais vérifié |
| 3 | **« compiled grammar is too large »** — `intent` et les liaisons font déborder | le découpage en sections |
| 4 | 8 besoins « nœuds inexistants » | 🔴 **MA GATE** |
| 5 | 5 slots liés déclarés morts | 🔴 **MA GATE** |

**D-079 — les deux défauts de mes gates :**

`FACT` — `evaluateIntentCoverage` n'énumérait que écrans, blocs, actions, entités
et champs. Elle déclarait **ABSENTS** des datasets, slots, règles, routes,
intégrations et tests **qui existaient**. Vérifié : sur les **99 `nodeIds`** cités
par le modèle, **AUCUN n'était inexistant.** *Le modèle avait raison ; c'est moi
qui n'en connaissais que la moitié.*

`FACT` — `promises.ts` savait qu'un slot **lié** est vivant ; `intent.ts` ne le
savait pas. **Deux gates du même chantier avec deux définitions de « vivant ».**
Elles se sont contredites sur le premier document réel.

> **Deux causes sur cinq étaient dans mes propres instruments.** C'est la
> quatrième fois de la session — et à chaque fois, c'est d'avoir vérifié
> l'instrument avant de croire son verdict qui a évité une accusation fausse.

### RÉSULTAT — le premier document généré qui soit FIDÈLE

| | v2 (gelé) | v3 (généré) |
|---|---|---|
| écrans / entités / actions | 4 / 3 / 17 | **7 / 6 / 18** |
| F1 promesses vivantes | 6/18 🔴 | **36/36 🟢** |
| F4 intention | aucune 🔴 | **7 ok · 3 déclarés · 0 KO 🟢** |
| compilation | — | 🟢 40 fichiers |
| **verdict** | 🔴 REFUSÉ | **🟢 FIDÈLE** |

`resto-riche` était fidèle parce que **je l'avais écrit à la main**. Celui-ci,
**le générateur l'a produit.**

### Garde-fous vérifiés avant dépense

`FACT` — `emit-v3` écrivait dans **`corpus-v2`, LE CORPUS GELÉ.** Il l'aurait
écrasé, détruisant la base de comparaison de toutes les mesures historiques et le
avant/après que la campagne existe pour produire. **Redirigé vers `corpus-v3`** ;
`git status` sur `golden-corpus` : **0 fichier modifié**.

`FACT` — coût réel mesuré : **1,74 $ par domaine**, contre 0,03 à 0,18 $ estimés
avant les sept règles. **L'estimation initiale était fausse et a été corrigée
auprès du propriétaire avant l'autorisation.** Plafond dur de 25 $ intact.

---

## D-081 — CAMPAGNE emit-v3 TERMINÉE : 12/12 documents FIDÈLES — 2026-08-31

### Le résultat

| | corpus v2 (gelé) | corpus v3 (généré) |
|---|---:|---:|
| écrans | **47** | **106** |
| promesses vivantes | **71 / 207** | **423 / 423** |
| intention conservée | **0 / 12** | **12 / 12** |
| documents FIDÈLES | **0 / 12** | **12 / 12** |

`FACT` — chaque document v3 : `F1` **toutes promesses vivantes**, `F4` **0 besoin
défaillant**, compilation 🟢. Le plus petit passe de 4 à 7 écrans, le plus grand de
4 à **11**.

`FACT` — **`423/423`**. Ce n'est pas une amélioration du taux : **plus une seule
promesse morte**, sur un corpus qui en comptait 136 sur 207.

### Ce que ce chiffre veut dire, et ce qu'il ne veut pas dire

`INFÉRENCE` — le moteur savait déjà faire tout cela. **Les documents ne le lui
demandaient pas.** `1/13` ne mesurait pas le moteur : il mesurait des documents
écrits quand le moteur ne savait que naviguer.

🔴 **Ce que ce chiffre N'EST PAS** : une preuve que les applications tiennent
leurs promesses. `F1` établit une **CONDITION NÉCESSAIRE** — la cible existe et
fonctionne. L'énoncé (« le total additionne correctement ») **n'est toujours pas
vérifié**. La limite est inchangée depuis le premier jour.

`FACT` — les besoins **inexprimables sont DÉCLARÉS, pas perdus** : 3 à 7 par
document, dont les capabilities que le moteur n'exécute pas. **C'est la règle 17
qui les rend visibles au lieu de les laisser promettre.**

### Les deux corpus franchissent les mêmes gates

`FACT` — **26/26 applications compilent** (`tsc` réel) · **164 écrans montés ·
6328 identités adressables · 0 problème.** Le corpus gelé reste mesuré à côté du
nouveau : **v2 n'a pas été touché** — c'est ce qui rend le « avant » opposable.

### Coût réel et écart avec l'estimation

`FACT` — **25,58 $ sur 19 tentatives**, dont **6,04 $ en sept échecs** de mise au
point. Estimation annoncée avant autorisation : 0,33 à 2,15 $ — **fausse d'un
facteur 12**, parce qu'elle datait d'avant les sept règles ajoutées. **Corrigée
auprès du propriétaire à 1,74 $/domaine dès la première mesure réelle**, avant de
lancer les onze suivants.

`FACT` — le plafond dur de 25 $ a été **atteint et respecté** : le script s'arrête
de lui-même. Les 25,58 $ incluent les essais de mise au point, hors décompte du
plafond de campagne.

### Six causes traversées — deux étaient dans mes instruments

| cause | fautif |
|---|---|
| script jamais syntaxiquement valide | le script |
| réponse tronquée rapportée en « erreur de parsing » | le script |
| « compiled grammar is too large » | le découpage |
| `Request timed out` ×2 (SDK : 10 min par défaut) | le client |
| 8 besoins « nœuds inexistants » | 🔴 **ma gate** |
| 5 slots liés déclarés morts | 🔴 **ma gate** |

### Non-régression

**659 tests verts · 0 échec · typecheck EXIT=0 · lint EXIT=0 ·
26/26 compilent · 164/164 écrans montés.**
