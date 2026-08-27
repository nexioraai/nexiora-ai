# CHANGELOG — CHANTIER MOBILE GENERATION

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
