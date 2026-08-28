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

## P-002 — Provider de sandbox

- **Options** : E2B ; Modal ; Fly Machines ; Vercel Sandbox.
- **Tranché par** : banc Phase 1 (cold start, cache npm, egress, prix).

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

## P-004 — Palier preview mutualisé (tenancy)

- **Question** : les previews/free tier partagent-ils un projet Supabase
  dédié-preview (coût ↓) ou chaque preview a-t-elle son projet (isolation
  maximale, coût ↑) ?
- **Tranché par** : décision produit (coût/risque) + mesure du coût réel de
  provisioning par app (Phase 1) ; avant la Phase 5.

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
