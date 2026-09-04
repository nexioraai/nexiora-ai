# STATUS — TABLEAU DE BORD DU CHANTIER MOBILE GENERATION

> Mis à jour à chaque étape significative. Dernière mise à jour :
> **2026-09-04 (23)** (**🔧 CI RENDUE HONNÊTE — `D-134`, NON COMMITTÉ.**
> *(Rectifié le 2026-09-04 : « NON COMMITTÉ » valait à la rédaction de cette entrée. Ce lot est
> **committé depuis en `044ba4d`**, poussé sur `fix/xss-jsonld` — **CI run #53 `success`**.)*
> Diagnostic depuis la racine, 14 étapes bloquantes reproduites localement :
> **aucune régression de code**, 12 vertes, 2 rouges. **Lot 1 `app_rendu`** :
> épingle 26 → **27** (édition consciente, `b4f1b2b`) — découverte aggravante,
> l'assertion de comptage précédant la boucle de montage, **aucun écran
> n'était monté** tant qu'elle échouait ; la gate est RÉARMÉE (27 apps montées,
> > 150 écrans, 0 problème), le cliquet reste EXACT. **Lot 2 · B** (correction
> de MESURE) : `gate-fidelite.mjs` excusait les artefacts gelés sans intention
> (l. 134-135) puis les sanctionnait en F4 (l. 155) — contradiction interne
> corrigée en UNE ligne (`&& !horsContrat`). **F1 INTOUCHÉ**. Mesuré :
> **F1 12 → 12 · F4 15 → 3 · motifs 5 → 5 · `exit 1` inchangé** ; rapport
> document par document COMPLET (25 documents, `🔴 aucune intention` toujours
> affiché) — aucune donnée masquée. **Lot 2 · D** (politique CI) :
> `app_fidelite` s'exécute intégralement, son échec est TOUJOURS signalé, et
> reste **BLOQUANTE sur `main` et sur toute PR** ; non bloquante sur les push
> de branches de chantier, où le rouge = dettes ARBITRÉES (12 v2 gelés en F1 +
> 3 v3 différés `D-125`). Les 13 autres étapes restent bloquantes partout.
> **CONFORMITÉ RÉELLE : TOUJOURS ROUGE** (fidélité NON TENUE) — seule la
> politique de blocage change. **Retour au blocage** : régénération des 3
> différés ET décision sur le corpus v2 gelé. Non-régression : typecheck 0 ·
> **4071/4071** · build 0 · apidocs 0 · packages 0 · app-compile **27/27** ·
> app-rendu 0 · controles/navigation/composition/invariants 0 · fidelite 1
> (voulu). **13/14 vertes ; la 14e est désormais non bloquante en chantier,
> jamais silencieuse.** Aucun document régénéré, aucun seuil touché, 0 $.)
>
> *Entrée précédente —* **2026-09-04 (22)** (**🚀 PRODUCTION MIGRÉE · ENDPOINT E3.3 EN LIGNE · DEUX
> ARTEFACTS APPAREIL — `D-133`. SESSION PHYSIQUE `A1→A11` : NON COMMENCÉE.**
> Découverte en servant l'endpoint : `main` n'était plus déployable (projet
> Vercel `rootDirectory: apps/web`, risque consigné `D-014` ; production figée
> au 2026-08-27). Cutover exécuté : **PR #45** (`866e08b` → merge `8dee11a`,
> 20 conflits résolus sur preuve, 53/55 fichiers de main byte-identiques) puis
> **PR #44** (endpoint, `195109f` → merge **`4e56538` = `main` courant**),
> production **READY · PROMOTED**, 23 crons, site 200. **Fil réel côté
> serveur PROUVÉ** : `GET https://www.deribfy.com/air/v1/entities/ent_depart/rows`
> → **200, 0 redirection**, byte-identique à la fixture, **SHA-256
> `3eea2c2e75a1…`**, 5 lignes. **Campagne sauvegardée** :
> `fix/xss-jsonld@44e550e` poussée (155 commits `D-104`→`D-132`). **Builds
> EAS depuis le même `44e550e`** : Android #1 `c96c4359-…` FINISHED (APK, exp.
> 17/09) · iOS #2 `7f332c5b-…` FINISHED (IPA ad hoc, exp. 18/09 ; credentials
> RÉUTILISÉS, iPhone `00008140-…` dans le profil — `DET-012` contourné par QR).
> 🔴 **CONTRÔLE RÉSEAU = FAIL / NON DÉMONTRÉ** : `www.deribfy.com` intercepté
> et bloqué par un FortiGate (certificat `O=Fortinet CN=FG200FT924902840`,
> page FortiGuard 403) sur le réseau des appareils — site et certificat
> RÉELS corrects, anomalie 100 % locale ; `curl -k` refusé délibérément.
> **`A1→A11` NON COMMENCÉE, aucune observation physique produite** ; iPhone
> disponible, **Galaxy A17 inaccessible (bagages)**. Observations UX
> consignées SANS correction (`P-012`, rattachées à la grille A++ `D-039`) —
> dont 2 contaminées par le blocage réseau. CodeQL PR #45 : 7 alertes,
> **aucune introduite** (diff JS/TS nul prouvé), 1 MEDIUM non identifiée. CI
> `fix/xss-jsonld` rouge : `app_rendu` (épingle 26 vs 27) + `app_fidelite`
> (15/5) — **gouvernance connue, NON corrigée**. Aucun code, aucun
> comportement, aucune UX modifiés dans ce lot.)
>
> *Entrée précédente —* **2026-09-02 (21)** (**📱 CHANTIER APPAREIL & FIL RÉEL — LOT PRÉPARATOIRE
> PRÊT, NON COMMITTÉ, 0 $** : arbitrage propriétaire — option ③ endpoint
> statique sur domaine possédé (`www.deribfy.com`, metadataBase canonique
> d'apps/web, gravé en UNE constante remplaçable) + quota EAS 1-2 builds
> autorisé au principe (AUCUN build lancé). Livré : app-fixture UNIQUE
> `slices/validation-appareil/` portant les 4 surfaces (E1 filtres statut+
> destination · E2 billets scopés au départ courant, vide hors instance ·
> E3.1 états du magasin · E3.3 `data_departs` remote, refresh 30 s), émise
> par le VRAI compilateur (49 fichiers, lock 1.1.0, tsc app EXIT=0) ;
> endpoint statique double-état (`rows` + `rows.apres-modification` : prix
> Bouaké 6500→7500 + statut retarde + Odienné apparaît — preuve de polling)
> **NON DÉPLOYÉ** ; batterie pré-build `verifier.mjs` 21/21 🟢 (lock/
> allowlist/câblage/seed≠distant/table E2/tsc) ; protocole imprimable
> `PROTOCOLE_VALIDATION_APPAREIL.md` (A1→A11, iOS par QR, preuves à
> conserver). ROADMAP consignée : 10B close (D-125) + programme E1→E3.3 +
> chantier appareil. Vise P10 crit. 7 et rend exécutables les 2 critères OTA
> de P11. Prochaine étape : GO build EAS + déploiement endpoint =
> **exécution physique propriétaire**.)
>
> *Entrée précédente —* **2026-09-02 (20)** (**📶 E3.3 RUNTIME IMPLÉMENTÉ — `D-132`, NON COMMITTÉ** :
> adaptateur de source distante générique (`source-reseau.ts`, embarqué),
> endpoint résolu AU LOCK (`resolved.remoteData`, lock 1.1.0, protocole moteur
> `/air/v1/entities/{entityId}/rows`), `allowedDomains` fail-closed au runtime
> (hôte exact, https, port refusé), transport/planificateur INJECTÉS, états
> loading/données/erreur réels, nouveauté mesurée sur les lignes, journal
> déterministe. **`liveData` : false → TRUE, bascule ADOSSÉE à la preuve au
> rendu** (`gate:e33-remote` : fixture remote émise + tsc EXIT=0 + écran émis
> rendant des lignes n'existant QUE chez le transport) — le fait couvre le
> POLLING consommé selon contrat, JAMAIS le push (réserves : fil réel,
> appareil). Instruments inversés consciemment (motif `liveData` → réfuté ;
> satisfait → trace exigée) ; `gate:fidelite` 15/5 INCHANGÉS. ERRATUM D-131
> consigné et réparé (SyntaxError latente emit-v3 l.68) + `gate:bench-parse`.
> Cliquet zéro-réseau : exemption NOMMÉE, chemin de compilation intact.
> **997/997 · tsc 0 · lint 0 · app-compile 27/27 · e33-remote 🟢 · e3-magasin
> 🟢 · invariants/composition/navigation/contrôles 🟢 · corpus byte-intact ·
> 0 $.** Scellement : SUR ARBITRAGE.)
>
> *Entrée précédente —* **2026-09-02 (19)** (**🛰️ AMENDEMENT AIR 1.7.1 — `D-131`, NON COMMITTÉ** : la
> sonde READ-ONLY d'ouverture E3.3 a révélé que l'union `dataset.source` de
> 1.7.0 était REFUSÉE par l'API réelle à TOUS les niveaux (« compiled grammar
> is too large », classe D-078) — limite grammaticale CUMULÉE, la partie
> `donnees` était au bord (attribution différentielle : run bus 1.6.0 accepté
> le même jour). Sonde comparative arbitrée : contrôle 1.6.0 ✅ · forme
> APLANIE ✅ au niveau nominal · 0,0314 $. Aplanissement implémenté
> (`sourceKind`/`sourceIntegrationId`/`sourceDomain`/`sourceRefreshSeconds` +
> `superRefine`) : sémantique E3.2 INCHANGÉE, fail-closed conservés, forme
> union historique REFUSÉE au parse, `liveData` toujours `false`. Grammaire
> émise BYTE-IDENTIQUE à la forme sondée-acceptée. 70 documents inspectés :
> 0 porteur → migration identité. **978/978 · tsc 0 · lint 0 · app-compile
> 27/27 · corpus byte-intact · invariants/composition/navigation/contrôles
> 🟢 · `gate:fidelite` 🔴 et ⚠️ 26/27 PRÉEXISTANTS (différentiels rejoués sur
> `ca205b6` pur, identiques).** Scellement + reprise E3.3 runtime
> (adaptateur/LOCK/`liveData`) : SUR ARBITRAGE.)
>
> *Entrée précédente —* **2026-09-02 (18)** (**📡 E3.2 SCELLÉ — `D-130`** : **AIR 1.7.0** —
> `dataset.source` (union fermée `seed | remote{integrationId, domain}`,
> migration identité, fail-closed intégration+domaine). **La règle absolue de
> vérité tient : `liveData` est né `false` et RESTE `false`** — la présence
> syntaxique n'allume rien (testé), la bascule appartient à E3.3. Instrument
> renforcé : `capacitesAbsentesEngagees` — un besoin `satisfied` exigeant un
> fait ❌ est RÉFUTÉ (killer : « temps réel » satisfait avec trace `remote` →
> réfuté ; déclaré en citant `liveData` → tient) ; veto D-089 non applicable
> aux capacités absentes (consigné). Sondage de grammaire : unions déjà
> éprouvées — aucun changement à D-130 ; confirmation API réelle au prochain
> run. Vérité historique conservée : insertion corrigée, 2 lectures brutes
> fragiles alignées, nuance hash-migré mesurée. **972/972 · tsc 0 · lint 0 ·
> app-compile 27/27 · corpus byte-intact · 0 $.** Réserves : 🟡 visuels
> E1/E2 et E3.1 · ⚠️ 26/27. **E3.3 = prochain arbitrage.**)
>
> *Entrée précédente —* **2026-09-02 (17)** (**🫀 E3.1 SCELLÉ — `D-130`** : le MAGASIN OBSERVABLE —
> instantané `{rows, status, version}` par entité, transitions pilotées par
> l'appelant (jamais d'horloge), écritures D-061 à vérité booléenne,
> anti-tempête (l'identique ne notifie pas), erreur qui CONSERVE l'instantané
> et dit la vérité. `DataRoot` observe additivement (contexte versionné —
> bail-out React démontré et traité). **Preuves : pure 9/9 + rendu réel 1/1**
> sur l'écran ÉMIS `v3-bus-intercites/scr_departs` : loading rendu, v1→v2 SUR
> PLACE, mutation locale re-rend, JSON byte-identique sur no-op, erreur
> véridique. **AUCUN réseau, AUCUN `liveData`, AUCUN changement AIR** — la
> règle de preuve tient. 961/961 · tsc 0 · lint 0 · app-compile 27/27 ·
> corpus byte-intact · **0 $**. 🟡 réserves visuelles appareil (E1/E2 et
> E3.1) · ⚠️ dette consciente : obs `corpus-rendu` épingle 26 apps vs 27
> compilées. Prochain arbitrage : E3.2 (dataset.source + liveData + sondage
> grammaire). **0 $.**)
>
> *Entrée précédente —* **2026-09-02 (16)** (**⚙️ E1+E2 SCELLÉS — `D-129`** : recherche PILOTÉE
> (≤ 3 filtres en conjonction, valeur vide = inactif, `text`/`choice`) et
> PORTÉE RELATIONNELLE (`scopeFieldId` → instance du `detail_header`, **vide
> sans instance — jamais rows[0]**) — fondations transversales AVION+FINTECH
> (option C de D-128). Architecture : module PUR `list-pipeline.ts`, props
> plats additifs — **écart consigné : PAS de montée AIR 1.7.0**, corpus
> byte-intact PAR CONSTRUCTION, grammaire D-019 intouchée. Registre 1.3.0 ·
> faits `listUserFiltering`/`relationScoping` basculés APRÈS preuve (24 tests
> verts, dont falsifications : fausse recherche réfutable, pseudo-relation de
> billetterie mesurable, mauvaise entité refusée). **952/952 · tsc 0 · lint 0 ·
> app-compile 27/27 · fidelite INCHANGÉE (12/15/5)**. 🟡 [À VALIDER] rendu
> visuel des nouveaux contrôles = étape observation/appareil. Prochain jalon :
> D-130, architecture E3 (données vivantes). **0 $.**)
>
> *Entrée précédente —* **2026-09-02 (15)** (**🚌 SECTEUR VOYAGE OUVERT — `bus-intercites` ACCEPTÉ
> PAR DOCTRINE, `D-127`** : premier run du pivot sectoriel, **1,7451 $** (coût
> plancher), 10 appels, 338 s, `valid=true`, 16 → 0, **0 morsure des
> protections dès la 1ʳᵉ passe**, F1 23/23 · F4 7 ok · 0 défaillant ·
> recherche exactement au périmètre D-126 · billet à code (patron billetterie).
> **Distinction stricte consignée** : « payer par carte directement dans
> l'app » [NON DÉMONTRÉ LITTÉRALEMENT] — la frontière du débit est portée par
> le CANAL-CONTRAT (`test_contrat_paiement_psp`), doctrine D-119/D-121 pour
> `physical_or_offapp` ; le critère A de D-126 était trop strict, amendé
> prospectivement. B′ : sains **9**, orphelins ≤ 11 inchangé, ambiguïté
> 29,8 % > 25 % (168 écrans, 13 docs v3). 928/928 · tsc 0 · lint 0.
> **1,7451 $.**)
>
> *Entrée précédente —* **2026-09-02 (14)** (**🏁 PHASE 10B CLOSE PAR ARBITRAGE — `D-125`** :
> **9/12 documents v3 verts au standard de gate** (7 régénérations acceptées +
> `resto-quartier` vert sans run + `cours-cuisine` par preuve A/B/C). Les
> critères de phase F1–F5 portent sur les INSTRUMENTS : tous satisfaits et
> ré-éprouvés par 5 acceptations et 3 refus. La gate `fidelite` ne peut jamais
> être verte (résiduel v2 structurel) — la clôture est un arbitrage, précédent
> Mode 2/M2-06. **Dette différée CONSIGNÉE sans maquillage** : `salon-coiffure`,
> `toiletteur-chiens`, `tuteur-langues` différés (le rouge F4 v3 restant leur
> appartient en totalité) · resto 1 orphelin · 9 CTA décoratifs historiques ·
> résiduel v2 permanent · dettes documentaires. B′ scellés : ≤11 · ≤1 ·
> 8 sains · `{toiletteur}` · >25 %. **Le programme pivote : voyage/transport →
> fintech (après évolutions moteur) → santé.** Cycle cours-cuisine : 8,16 $ de
> preuves. **0 $.**)
>
> *Entrée précédente —* **2026-09-02 (13)** (**`cours-cuisine` EST VALIDE PAR PREUVE A/B/C — `D-124`** :
> trois runs, même intention, même plafond : sans règle 30 → mensonge (2,59 $,
> refusé) · règle 30 seule → mensonge (2,90 $, refusé, mais gardes mécaniques
> D-123 DÉMONTRÉES : 2 décoratifs + 1 morte interceptés ET réparés en run) ·
> **règle 11 RENFORCÉE (preuve de rendu exigée + menace symétrique) →
> honnêteté** (2,67 $, accepté) : `lecture_video` **unexpressible** citant le
> registre fermé énuméré + `capabilitiesEmitCode`, achat SCINDÉ
> (parcours satisfait / transaction store dite), et les 6 besoins rendables
> RESTENT satisfaits — contre-falsification anti-45/130 tenue. F1 39/39 ·
> F4 6 ok · 2 dits · 0 réfuté · orphelins 0/4 · images 0/3 · bilingue conservé.
> **9/12 v3 verts · F4 global 15 · réfutés 5.** Resserrement : orphelins
> **≤ 11**, sains **8**. Cycle cours-cuisine : **8,16 $** de preuves pour un
> document accepté, trois protections et une règle prouvées. 928/928 · tsc 0 ·
> lint 0. **2,6683 $.**)
>
> *Entrée précédente —* **2026-09-02 (12)** (**RUN `cours-cuisine` REFUSÉ, TROIS LACUNES GÉNÉRIQUES
> FERMÉES — `D-123`** : 2,5918 $, `valid=false`, corpus jamais écrit — première
> morsure réelle d'`AIR_TEST_TARGET_MORTE`, **D-118 validé par l'épreuve**.
> Trois classes démontrées sur artefacts payés : déclencheur DÉCORATIF (D-105 :
> le bloc dispatche par sa prop, pas par le déclencheur), pseudo-satisfaction
> SÉMANTIQUE (14 nœuds vivants autour d'un comportement irrendable — invisible
> aux instruments), parité F4 absente de `validateLocal` (2 `reference_brisee`
> nés de la réparation). Corrections génériques : diagnostic
> `ACTION_DECLENCHEUR_DECORATIF` (dérivé du registre), parité F4 (patron
> D-118), **règle 30** (un besoin n'est `satisfied` que si le moteur REND ce
> qu'il promet). Killer-tests exacts sur le refusé (1+2) ; **9 CTA décoratifs
> préexistants révélés dans les corpus acceptés** — dette historique, aucune
> requalification rétroactive. repair 156/156 · **928/928** · tsc 0 · lint 0 ·
> aucun seuil modifié. **2,5918 $ payés en preuves sans corpus.**)
>
> *Entrée précédente —* **2026-09-02 (11)** (**`suivi-chantier` EST VALIDE — `D-122`, premier B2B** :
> 7ᵉ régénération, **2,5311 $**, 10 appels, 490 s, `valid=true`, 25 → 0,
> 0 promesse morte, 41=41, 0 amputation, 0 troncature. **F1 41/41 · F4 9 ok,
> 1 dit, 0 réfuté** · 9/9 écrans atteignables (double audience) · hors-ligne
> satisfait par 11 nœuds vivants · détails 2 → 0 · images 3 → 0. **Arbitrage
> D-122** : GPS/alertes disparus ≠ perte — absents de la demande client
> (sur-dérivations de l'ancienne génération) ; point méthodologique consigné :
> la re-dérivation D-088 fait foi, la perte se juge sur `intent.request`.
> **7/12 v3 verts · F4 16 · réfutés 6.** Resserrement : orphelins **≤ 14**,
> sains **7**. Stock : 14 orphelins · 1 muet · 10 images. 921/921 · tsc 0 ·
> lint 0. **2,5311 $.**)
>
> *Entrée précédente —* **2026-09-02 (10)** (**`boutique-mode` EST VALIDE — `D-121`** : 6ᵉ
> régénération (« marketplace »), **2,7711 $**, 10 appels, 536 s, `valid=true`,
> 30 diagnostics → 0, **0 promesse morte**, 0 amputation, 43=43 promesses,
> 0 troncature — le timeout historique D-080 propre à ce document ne s'est pas
> représenté. **F1 43/43 · F4 10 ok, 1 dit, 0 réfuté** — le motif « sans fait
> cité » converti en satisfaction réelle ; **scan SCINDÉ comme la carte** :
> navigation vers la fiche satisfaite, acquisition caméra dite sur motif
> accepté. Détails 3 → 0 · images 2 → 0 (4 assets, tous rendus). **6/12 v3
> verts · F4 17 · motifs réfutés 8.** Resserrement de cadence : orphelins
> **≤ 16**, sains **6**. Stock : 16 orphelins · 1 muet · 13 images (erratum
> daté sur les « 13 »/« 14 » historiques consigné en D-121). 921/921 · tsc 0 ·
> lint 0. **2,7711 $.**)
>
> *Entrée précédente —* **2026-09-02 (9)** (**`agence-immo` EST VALIDE — `D-120`** : 5ᵉ régénération,
> **2,9356 $**, 10 appels, 575 s, `valid=true`, 33 diagnostics → 0, **0 promesse
> morte**, 0 amputation, 47=47 promesses. **F1 47/47 · F4 12 ok, 1 dit,
> 0 réfuté** — les 4 défaillants historiques convertis, dont les filtres
> désormais RÉELS (`searchFieldId` présent). **`maps` traité honnêtement** :
> besoin scindé, localisation satisfaite, carte native déclarée inexprimable
> sur motif ACCEPTÉ. Détails 1 orphelin → 0 (2 détails, tous sourcés) · image
> 1 → 0. Premier `commerce: none` ; `maps`/`deep_links` entrent au profil
> validé. **5/12 v3 verts · F4 global 19 → 18 · motifs réfutés 12 → 10.**
> Resserrement de cadence dans ce commit : orphelins **≤ 19**, sains **5**.
> 921/921 · tsc 0 · lint 0. **2,9356 $.**)
>
> *Entrée précédente —* **2026-09-02 (8)** (**`billetterie-concerts` EST VALIDE — `D-119`** : relance
> sous le garde `AIR_TEST_TARGET_MORTE` né de son propre rejet. **2,3848 $**,
> 10 appels, 454 s, `valid=true`, 21 diagnostics → 0, **0 promesse morte**
> (garde armé, 0 déclencheur `data` émis — la consigne a suffi avant le filet,
> l'interception en réparation réelle reste non éprouvée). **Premier document
> accepté avec `F1` ET `F4` vérifiés VERTS avant acceptation** : F1 31/31
> vivantes · F4 6 ok, 1 dit, 0 réfuté. Trois familles : 4→0 · 4→0 · 1→0.
> Intra-exécution : 0 perte, 0 amputation, actions 16→20 (cibles CRÉÉES).
> Chaîne de hash vérifiée. **4/12 documents v3 verts** sur leurs propres
> lignes ; F4 global 21→19. Cliquets B′ : 3ᵉ absorption réelle, **921/921 sans
> une édition**. **2,3848 $.**)
>
> *Entrée précédente —* **2026-09-01 (7)** (**4ᵉ RÉGÉNÉRATION EXÉCUTÉE ET REJETÉE — `D-118`** :
> `billetterie-concerts` régénéré en réel (**2,4740 $**, 10 appels, `valid=true`,
> 25 diagnostics → 0, 0 amputation, 0 troncature) et les trois familles visées
> tombent à zéro — mais la gate `fidelite` révèle **une promesse sur CIBLE
> MORTE** (`test_billet_emis_apres_paiement` → action à déclencheur `data`,
> hors `triggers: ["ui","lifecycle"]` de l'enveloppe) : `F1` régressait de 12 à
> 13 documents. **Document ÉCARTÉ du corpus (arbitrage propriétaire), corpus
> restauré à `70d5787`, preuves conservées par runId.** LACUNE D'INSTRUMENT
> DÉMONTRÉE : `validateLocal` ne contrôle pas la VIVACITÉ des cibles promises —
> `valid=true` n'implique pas « gates vertes ». Chantier de fermeture : analyse
> produite, autorisation séparée. Cliquets B′ : premier passage réel, **919/919
> sans aucune édition**, dans les deux sens (amélioration absorbée, retour
> d'état absorbé). **2,4740 $.**)
>
> *Entrée précédente —* **2026-09-01 (6)** (**EXPÉRIENCE DIAGNOSTIQUE — `D-116`** : la troncature
> **NE S'EST PAS REPRODUITE**. Même document, même prompt, même niveau de schéma
> final : `ecrans` a été émise en **6 309 jetons, 39 % du plafond**, contre
> ≥ 16 000 la fois précédente. **Écart d'un facteur ≥ 2,5 sans cause identifiée.**
> 🔴 **CAUSE NON DÉMONTRÉE ET NON REPRODUCTIBLE — aucune correction appliquée**,
> le phénomène reste OUVERT. · 🔴 **`D-115` rectifiée** : l'API refuse `maxItems`
> lui-même, donc l'étape A **ne préserve rien** et n'ajoute qu'un aller-retour
> refusé — elle est **INERTE**. · 🟢 **Le garde budgétaire est éprouvé en réel** :
> 0,9369 $ sur 1,00 $, appel refusé **avant** émission, `issue =
> interrompue-budget`. **0,9369 $.**)
>
> *Entrée précédente —* **2026-09-01 (5)** (**EXPÉRIENCE `toiletteur-chiens` : ÉCHEC INSTRUCTIF, TROIS
> INSTRUMENTS RÉPARÉS — `D-113` → `D-115`**. La génération a été **TRONQUÉE** sur
> la section `ecrans` (16 000 jetons) ; elle **n'a donc pas pu éprouver les trois
> diagnostics**, son objet initial. Mais elle a démontré en conditions réelles ce
> qui ne l'avait jamais été : `PB#1` (`issue = echec-technique`) et `PB#2`
> (13 sections conservées). Trois corrections en ont découlé — conservation du
> corps tronqué (`D-113`), comptabilité des appels tronqués (`D-114`),
> dégradation ciblée du schéma (`D-115`). **919 tests · tsc 0 · lint 0 · 6/7
> gates · 0 $.**
>
> 🔴 **LA CAUSE DE LA TRONCATURE RESTE NON DÉMONTRÉE.** Aucune de ces trois
> corrections ne la corrige ni ne l'explique — voir la réserve de `D-115`.)
>
> *Entrée précédente —* **2026-09-01 (4)** (**CHANTIER SECTORIEL OUVERT + DEUX INSTRUMENTS RÉPARÉS** :
> **R2 `screenTraits`** 🟢 — les traits d'écran sont DÉRIVÉS, jamais déclarés
> (`D-086` : l'AIR ne connaît aucune catégorie métier) ; mesuré : **45 écrans
> sur 154 (29 %) portent plusieurs traits**, un champ `role` unique serait faux
> par construction. · **Instrument `controles-fantomes` corrigé** : il remplissait
> chaque champ d'une constante qui violait les règles des documents et comptait
> fantômes des contrôles qui refusaient CORRECTEMENT une saisie invalide —
> **183 → 155**, 28 faux positifs, **plafond 180 INCHANGÉ** (`D-110`). ·
> **`FORM_SANS_ACTION`** 🟢 — diagnostic non bloquant : **7 formulaires muets sur
> 45 (15,6 %)** contre **0 bouton muet sur 259**, dont deux « Payer par carte ».
> **883 tests · tsc EXIT=0 · lint EXIT=0 · 6/7 gates vertes. Aucun appel API.**)
>
> *Entrée précédente —* **2026-09-01 (3)** (**P10 — `coach-fitness` EST VALIDE — `D-109`** : génération
> réelle autorisée, **`valid=true`**, **2,3069 $**, 10 appels, **27 diagnostics → 0**,
> **0 amputation**, **0 mutation hors périmètre**, 35/35 promesses vivantes. Le
> `NON DÉMONTRÉ` central du chantier est **RÉFUTÉ par mesure**. **6 gates sur 7 au
> vert** — `app-compile` 26/26, `app-rendu` et `invariants` passent au vert.
> `fidelite` reste ROUGE, **mais plus sur `coach-fitness`** : sur les 12 documents
> v2 gelés et 9 documents v3. Aucun seuil, aucune gate, aucun corpus historique
> touché. Corpus v2 **strictement inchangé**. **`PB#2` n'a PAS été éprouvé en
> conditions réelles — aucun `529` n'est survenu.** 865 tests · tsc EXIT=0 ·
> lint EXIT=0.)
>
> *Entrée précédente —* **2026-09-01 (2)** (**GOUVERNANCE RÉCONCILIÉE ET `PB#2` FERMÉ — D-106 / D-107** :
> le blocage `C-0` est déclaré **CADUC** — `RN-04` a été exécuté le 2026-08-31
> (`2f00c00`, 88 fichiers) sans que `RN-01` soit levée, et P5→P9 a suivi.
> **`RN-01` et `C-0` sont CLOS PAR CADUCITÉ (`D-108`, arbitrage propriétaire)** —
> aucune règle `R-GRAN` n'ayant été écrite, `E-17` redeviendrait exigible si une
> analyse causale était reprise. **`PB#2` corrigé** : la
> réparation conserve désormais ses sections payées, une erreur technique est
> classée **`echec-technique`** et non plus `terminee`, et tout artefact porte son
> `runId`. **23 cas-tueurs ajoutés, 4 falsifications concluantes. 865 tests verts ·
> typecheck EXIT=0 · lint EXIT=0.** Aucun appel API.)
>
> *Entrée précédente —* **2026-08-31 (2)** (**RACINE REFERMÉE — D-055 / D-056** : **PHASE 10B** créée
> (fidélité de l'application produite) ; **AIR 1.2.0** conserve la demande du
> client ; paquet `@deribfy/fidelity` — deux gates, **10 cas-tueurs vus échouer**.
> Mesure : **12 documents du corpus REFUSÉS**, `resto-riche` **FIDÈLE**. Les besoins
> *« photos »* et *« recherche »* sont désormais **DITS** au lieu d'être perdus.
> **658 tests verts · typecheck EXIT=0.**)
>
> *Entrée précédente —* **2026-08-31** (**RACINE IDENTIFIÉE ET MESURÉE — `APP-D004`, D-054** : l'intention
> du client n'est stockée nulle part et les **227 promesses déclarées ne sont jamais
> exécutées**. Exécuteur construit : **167/227 visent une cible morte — 73,6 %**.
> Contre-épreuve livrée (`resto-riche` : 22/22 contrôles agissants, 10/10 promesses
> vivantes). 🔴 **Verrou nouveau : aucune phase ne possède la qualité de
> l'application produite.**)
>
> 🔴 **RECTIFIÉ LE 2026-08-31 — `D-054-R1`.** *« L'intention du client n'est stockée
> nulle part »* est **RÉFUTÉ par mesure** : `app.description` la conserve dans
> **13/13** documents, clause par clause. La contre-épreuve `resto-riche` est
> **CIRCULAIRE** — ses 9 actions sont **toutes** `navigate`/`ui`, soit exactement
> l'enveloppe d'exécution : son 100 % est acquis par construction. **Les chiffres
> 227 · 167 · 73,6 % restent exacts.** Racine démontrée : **l'enveloppe d'exécution**
> (`effects ["navigate"]` · `triggers ["ui"]` · `dataOperations ["list","get"]`) —
> **136 des 167 cibles mortes (81 %)**. Nœud hors plan restant : **`DET-008`**,
> aucune phase désignée (`D-052`).
>
> *Entrée précédente —* **2026-08-28** (**4.7 TERMINÉE — PHASE 4 : CRITÈRES TOUS SATISFAITS**
> (D-031-R47) : app témoin compilée LANCÉE sur émulateurs iOS ET Android,
> parcours Maestro PASS ×2 (fixtures rendues, navigate réel, back), 4
> captures ; correction composition « page défilante » démontrée sur
> device, v46 REJOUÉE 12×10 verts ; **clôture Phase 4 = constat
> propriétaire**).

## ÉTAT GLOBAL

| | |
|---|---|
| Plan v0.1 | 🟢 **VALIDÉ ET FIGÉ** (propriétaire, 2026-08-27) — toute évolution passe par `DECISIONS.md` |
| Phase 0 — Fondations | 🟢 **TERMINÉE** (2026-08-27) — tous les critères de sortie vérifiés, dont **CI GitHub réelle verte : run #32, commit `54ef2a1`, `success`** (capture propriétaire + confirmation API Actions indépendante) |
| Phase actuelle | 🔴 **A++ N'EST PAS ÉTABLI — A et G NON DÉTERMINÉES** *(rectifié le 2026-09-04 ; énoncé antérieur CONSERVÉ ci-après mot pour mot)*. — *Énoncé du 2026-08-31 :* « 🟢 **A++ EST ATTEINT — les 8 dimensions CONFORMES (D-060, 2026-08-31)** : `A:conforme · B · C · D · E · F · G · H` sur 2 domaines. La dimension **C** était **INATTEIGNABLE** — `form` ne connaissait ni `loading` ni `empty`, `detail_header` aucun état, et le fournisseur de données était purement synchrone. Levée par le **registre de blocs 1.1.0** (dégel ADDITIF) + `DataProvider.status?()`, chaque état **observé au rendu avec contrôle négatif AVANT** d'entrer dans l'enveloppe. · **PHASE 10B : 🔵 F1-F4 🟢, F5 🟢 (DET-028 fermé)** · **Phase 8 / Phase 10 : reste la SEULE preuve appareil** · **Phases 0, 2-7, 9 : 🟢 TERMINÉES** » · 🔴 **RECTIFIÉ LE 2026-09-04 — « les 8 dimensions CONFORMES » ne vaut que pour la NATURE DE PREUVE de l'instrument, et deux dimensions échappent à cette preuve.** La grille (`ROADMAP` § EXIGENCE PRODUIT TRANSVERSE) exige pour **A** une « géométrie **mesurée sur appareil réel** » et pour **G** une « **mesure sur appareil** » ; or `apxx-grid.ts` les évalue par analyse **STATIQUE** du code émis — **A** : valeur `tapTarget` + 3 surfaces contraintes, ce qui laisse **2 des 3 clauses du critère non regardées** (zones sûres, cible sous barre système) ; **G** : absence de `ScrollView` englobant + parent borné, ce qui ne regarde ni le jank, ni la virtualisation à l'exécution, ni le retour visuel. **Aucune mesure sur appareil n'a jamais été prise.** Par la règle de notation de `D-039` — *« une dimension non mesurable se déclare non déterminée, jamais conforme par défaut »* — **A et G sont NON DÉTERMINÉES**, en cohérence avec `DET-006` (🔴 ouverte : « virtualisation effective à l'exécution : NON DÉTERMINÉE ») et `DET-016` (« conformité suspendue à l'observation appareil »). **A++ N'EST DONC PAS ÉTABLI.** B/C/D/E/F/H demeurent mesurées par l'instrument. Le constat historique de `D-060` (2026-08-31) est **conservé et daté** — il reste vrai de ce que l'instrument mesure ; **sa conclusion « 8/8 » ne l'est plus.** ⚠️ Un rejeu de la grille affichera **mécaniquement** `A:conforme G:conforme` : **cette sortie n'est admissible comme preuve ni de A, ni de G.** Le défaut d'instrument ainsi démontré est de la famille de `DET-028` ; **son traitement relève d'un arbitrage distinct** — tranché depuis par **`D-135`** (falsification exécutée : le verdict `G` survit au RETRAIT du bornage, satisfait par un COMMENTAIRE ; `A` ne couvre qu'1 clause sur 3). **Aucune correction d'instrument n'est engagée.** |
| Générateur mobile | 🔵 **EN IMPLÉMENTATION** — prochaine action : **build EAS + installation du slice 2 sur appareil** (intervention propriétaire), puis clôture de la Phase 10 |
| Progression globale | 🔴 **A-P8-01 / A-P8-02 (audit 2026-08-31) — LA PHASE 8 N'EST PAS TERMINÉE.** Ce tableau affirmait « Phases 0, 2-9 terminées » pendant que le détail de ce même document disait « **En cours : Phase 8** ». Le détail a raison, pour **deux** motifs indépendants : ① le critère « app installée et fonctionnelle sur **2 appareils physiques** » n'a que **Android 🟢** — l'IPA iOS est construit mais **non installé** (DET-012, prérequis propriétaire) ; ② la ROADMAP exige pour clore la Phase 8 que **A à G soient CONFORMES**, « une seule non conforme BLOQUE la clôture » — or **C est `non_conforme` depuis D-048 (2026-08-30)**, donc postérieurement à la clôture revendiquée. · **Phases 0, 2-7, 9 : 🟢 TERMINÉES** · **Phase 8 : 🔴 ROUVERTE PAR LE FAIT** · **Phase 10 : 🔵 clôture bloquée** · **Phase 10B : 🔵 en cours, F1-F4 🟢, F5 🟢** *(rectifié le 2026-09-01 — cette ligne portait `F5 🔴`, périmé depuis `D-095` : l'invariant `atteignable ⊆ rendable` est tenu sur les 6 blocs, les « 8 états sur 11 » venaient d'une recopie périmée. La phase reste OUVERTE pour une autre raison : les gates de fidélité sont rouges sur des défauts RÉELS du corpus)* · Phase 1 : volet EAS bloqué sur quota (propriétaire) · **dettes ouvertes : 12** |

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
- **Terminé (suite)** : **Phases 3, 4, 5, 6, 7 🟢** — compilateur
  déterministe (critère dur 12 docs × 10 compilations, hashes identiques,
  zéro réseau instrumenté) · backend isolé par app avec teardown prouvé
  (P-004 = B, D-032) · sandbox + Oracle L1/L2 (P-002 = MODAL, D-033) ·
  workflow durable Trigger.dev v4 (critère dur 5/5, D-016).
- **En cours** : **Phase 8** (vertical slice 1) — Étape A close, chaîne
  automatisée **7/7 verte**, scorecard et rétrospective produits ; critère
  « app installée et fonctionnelle sur 2 appareils physiques » : **Android
  🟢 acquis** (Galaxy A17, APK EAS, 2/2 flows générés PASS après D-037),
  **iOS 🟠** — credentials Apple établis, build de distribution interne
  **FINISHED** (2026-08-29, 195 s, IPA présent), installation et validation
  propriétaire en attente. **Phase 1** — volet 2 du banc de coûts EAS :
  script corrigé et correction prouvée (2026-08-29), série non lancée.
- **Bloqué, prérequis propriétaire** : installation de l'IPA sur l'iPhone 16
  par QR (aucune automatisation possible — port de données USB-C mort,
  DET-012) · lancement de la série du banc de coûts EAS (consomme du quota).
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
- **4.3 TERMINÉE (2026-08-28, D-028)** : émetteur Option C prouvé —
  déterminisme 12/12, tsc strict EXIT=0 sur projets générés réels, export
  OK ; gabarit ré-scellé ×2 avec preuves rejouées ; 0 $.
- **4.4 TERMINÉE (2026-08-28, D-029)** : manifestes émis et PROUVÉS au
  prebuild réel (minSdk appliqué, permissions présentes) ; gabarit
  ré-scellé 3ᵉ fois, preuves rejouées ; 0 $.
- **4.5 TERMINÉE (2026-08-28, D-030)** : fixtures compilées déterministes
  + provider demo, preuves rejouées ; 0 $.
- **4.6 TERMINÉE (D-031)** : critère dur prouvé (12×10, zéro-réseau
  instrumenté, store SHA-256) · **4.7 TERMINÉE (D-031-R47)** : app témoin
  lancée sur les 2 émulateurs, parcours PASS, captures ; correction
  composition démontrée + v46 rejouée. **PHASE 4 : critères de sortie
  TOUS SATISFAITS — clôture = constat propriétaire.**
- **Phase 4 : constat de clôture ACTÉ** (feu vert propriétaire du
  2026-08-28 ordonnant l'exécution jusqu'à la fin de la Phase 5). **Banc
  coût Supabase : EXÉCUTÉ** (mesure requise par la méthode de P-004 —
  10,45-12,79 s création→PostgREST, teardown prouvé ~5 s, 0 $).
- **P-004 TRANCHÉ → D-032 : B — projet par app** (propriétaire,
  2026-08-28). **PHASE 5 OUVERTE** (dépendances : Phase 2 ✅ · P-004 ✅),
  découpage 5.1→5.5 consigné D-032, exécution sans nouvel arrêt sauf
  décision/manuel/dépense. Budget : 0 $.
- **Phase 5 — état** : **5.1 🟢** générateur SQL déterministe
  (`@deribfy/provisioner`, 16 tests : 12/12 corpus, déterminisme
  rejeux+permutation, fail-closed, patron §7) · **5.2 🟢** interface §15 +
  impl Supabase (plan free exigé avant création, refs possédés seuls
  supprimables) · **5.3 🟢** cycles RÉELS prouvés séquentiellement sur 2
  apps (resto, agence-immo) : provision ~9,5 s, SQL appliqué ~1,5 s,
  barrières, vérifs indépendantes (tables/RLS partout/seeds exacts),
  **rejouabilité**, teardown prouvé, **SQL archivé au store SHA-256** ·
  **5.4 🟠 PARTIEL** : app↛cœur ✅ (401), cœur↛app ✅, deny-by-default
  anon ✅ (200/0 ligne vs seeds côté service) — **le croisé strict A↔B
  (2 apps générées SIMULTANÉES) est BLOQUÉ : limite de 2 projets free
  actifs PAR COMPTE [démontrée par l'API], nexiora-ai occupant 1 place
  en permanence** · packages 350/350, web intact (tsc 0 + 4071/4071).
- **5.4 STRICT 🟢 (org de banc PRO, GO propriétaire)** : A↛B ✅, B↛A ✅,
  ↛cœur ×2 ✅, cœur↛app ×2 ✅, deny-by-default ×2 ✅ — 20/20
  vérifications, teardowns prouvés. **5.5 🟢 — PHASE 5 : critères de
  sortie TOUS SATISFAITS (D-032-R55), clôture = constat propriétaire.**
- **Prochaine étape EXACTEMENT autorisée** : constat propriétaire de
  clôture Phase 5, puis **Phase 6 — Sandbox + Oracle v1** (dépendances
  ROADMAP : Phase 4 ✅ · **P-002 NON TRANCHÉ** — banc bloqué sur
  prérequis propriétaire : comptes E2B/Modal/Fly/Vercel Sandbox + budget
  ~10-20 $ · outil E2E tranché ✅ D-022 Maestro). Critère dur
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
| 4.3 | **Émission écrans/navigation/thème (D-028)** — `emitProject` PUR : App/navigation (native-stack, config explicite)/écrans (code structurel ScreenShell+blocs, zéro contenu libre)/modules canoniques TYPÉS ; copies embarquées 11 fichiers (non-dérive testée) ; runtime copié (6 wrappers + data-provider §15) ; 6 lectures consignées ; gabarit ré-scellé ×2 (tsconfig extensions + devDeps typescript/@types/react pour Oracle §9), preuves v42 rejouées | 🟢 **TERMINÉE** (2026-08-28) — émission déterministe 12/12 (rejeux+permutation) · **tsc strict EXIT=0 sur 3 projets générés réels** · export Hermes ios+android OK · compiler 54/54 · packages 300/300 |
| 4.4 | **Manifestes/permissions/config native (D-029)** — app.json émis (identité preview déterministe, permissions induites agrégées transitives, infoPlist depuis raisons AIR — F3, plugin build-properties max(plancher,exigence), scheme ssi deep_links) + manifeste canonique de permissions (Oracle §9/Compliance §18) ; gabarit ré-scellé 3ᵉ fois (+expo-build-properties 57.0.15, nécessité démontrée 10/12 docs minSdk 26) | 🟢 **TERMINÉE** (2026-08-28) — **prebuild Android réel : minSdk 26 APPLIQUÉ, permissions dans le manifeste** · export avec app.json émis OK · 12/12 tests CI · compiler 67/67 · packages 313/313 |
| 4.5 | **Fixtures demo déterministes (D-030)** — générées À LA COMPILATION (module canonique typé `demo.data.ts`, dans le périmètre du hash 4.6) : PRNG mulberry32 seedé `contentHash`, ids par entité, valeurs = données AIR (F3), dates base fixe, refs → lignes réelles ; provider demo copié (défaut = 1ʳᵉ ligne) | 🟢 **TERMINÉE** (2026-08-28) — 12/12 tests CI (rowCount, énums, refs, unicité) · v43 rejouée : tsc EXIT=0 ×3, exports OK · compiler 79/79 · packages 325/325 |
| 4.6 | **Store SHA-256 + hash Merkle + CRITÈRE DUR (D-031)** — compileProject PUR (gabarit embarqué + émission, manifeste Merkle canonique, rootHash = SHA-256 du manifeste) ; store local content-addressed immuable (seul module fs, cliquet) ; preuve zéro-réseau 2 volets (cliquet statique imports/deps + campagne sous harnais V5 ATTEMPTS=0) | 🟢 **TERMINÉE** (2026-08-28) — **12×10 processus séparés : hash identique 10/10 aux 12 docs, ATTEMPTS=0 aux 120 runs, store round-trip OK** · critère aussi en CI continue · compiler 88/88 · packages 334/334 · web intact |
| 4.7 | **App témoin (D-031-R47)** — projet écrit depuis compileProject (rootHash de campagne re-prouvé), builds Release iOS+Android EXIT=0, **LANCÉE sur les 2 émulateurs**, parcours Maestro PASS ×2 (entrée, fixtures rendues, scroll, navigate réel, back), 4 captures versionnées ; correction composition « page défilante » (cause démontrée par hiérarchie, v46 rejouée, réserve virtualisation → Phase 8) | 🟢 **TERMINÉE** (2026-08-28) — **PHASE 4 : 4 critères ROADMAP ✅✅✅✅, 0 $** |

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
| P-002 Sandbox | ✅ | 🟡 **BANC E1-E5 EXÉCUTÉ** (2026-08-28, `benchmarks/sandbox-bench/synthese-P-002.md`, < 1 $/provider sur crédits) — E1 pipeline réel `npm ci→tsc→expo export` **les 2 3/3 VERTS** (Modal ~28 s vs E2B ~63 s) · E2 cache : Modal propre ~16 %, E2B instable (exit -1 en réutilisation, PROPRE en sandbox fraîche E1) · E3 egress : **tous BLOQUÉS des 2 côtés** (allowlist domaine supportée par les 2) · E4 aucun secret des 2 · E5 0 orphelin/20 des 2. **P-002 TRANCHÉ → D-033 : MODAL choix #1, E2B repli** (propriétaire, 2026-08-28 ; recommandation Claude révisée vers Modal sur preuves). Indépendance provider vérifiée : 0 couplage Modal dans le cœur |
| P-003 Styling RN | ✅ | 🟢 **BANC EXÉCUTÉ INTÉGRALEMENT** (2026-08-27) — 4 candidats × 2 plateformes, protocole suivi sans dérogation : perf liste (60 fps partout, 0 frame > 34 ms), bascule thème (**tamagui ×4-5 sur les 2 plateformes**), RTL 4/4 (captures authentifiées), poids (bundle JS : unistyles +156 Ko · nativewind +1 088 · **tamagui +5 512**), New Arch 4/4, étanchéité 4/4, LOC DX ; synthèse `benchmarks/styling/results/synthese-P-003.md` ; anomalies d'environnement toutes résolues sur preuve (iCloud, JDK 25/prefab→JDK 21, cmake Intel, preset Expo 57…). **DÉCISION P-003 = propriétaire — mesures livrées, aucun gagnant désigné**. **EXTENSION 2026-08-27 (soir) : banc porté à 6 candidats** — ajout de `@shopify/restyle` 2.4.5 et `uniwind` 1.11.0 (moteur LIBRE ; moteur C++ « Pro » payant NON bancé) après revue de paysage indépendante ; protocole NON modifié, 4 mesures initiales NON rejouées, audit de conformité vert (fixture/contrats/tokens/versions/étanchéité identiques, tsc 6/6). Résultats : RTL 6/6 · New Arch 6/6 · étanchéité 6/6 · poids les plus faibles du banc pour restyle (+20 Ko JS / +16 Ko .app / +12 Ko APK) · LOC les plus faibles pour uniwind (83). **Limite découverte : dispersion inter-runs du TTI ±37 % → le TTI ne discrimine pas sous ~30 ms.** Synthèse : `benchmarks/styling/results/synthese-P-003-extension.md`. **DÉCISION TOUJOURS EN ATTENTE DU PROPRIÉTAIRE** |
| E2E mobile | ✅ | 🟢 **BANC EXÉCUTÉ (2026-08-28) → D-022 : Maestro retenu** — Maestro 2.9.0 vs Detox 20.51.4, même binaire partagé, flows de sémantique identique : **80/80 runs réussis (20/20 par outil et par plateforme, iOS + Android, 0 flake)** · vitesse médiane (mur) Maestro 30,4 s iOS / 24,8 s Android vs Detox 24,0 s / 12,6 s · **RTL PASS pour les deux, flow inchangé** · générabilité depuis l'AIR : 7 LOC des deux côtés (Maestro émet des **données**, Detox du **code**) · diagnostic d'échec : Maestro produit capture + hiérarchie UI JSON **automatiquement**, Detox aucun artefact par défaut · Detox exige une **instrumentation Android** dans chaque app générée · `@config-plugins/detox@11` en `peer expo@^53` (**4 SDK de retard**). Écart consigné non corrigé : assertions `loading`/`empty` hors de portée de la fixture (résorbé par les critères de sortie de la Phase 3). Synthèse : `benchmarks/e2e/synthese-E2E.md`. **Coût : 0 $** |
| Coûts EAS | ✅ | 🔴 **NON EXÉCUTÉ** — *(cause rectifiée le 2026-09-04)* le compte Expo/EAS **n'est plus la cause** : compte acquis et opérationnel, session `eas` authentifiée (comptes `deribfy-app`, `deribfy-apps-team`), **2 builds FINISHED depuis `44e550e`** (`D-133`, 2026-09-03). Ce qui reste : le protocole du banc exige **≥ 5 builds PAR PLATEFORME** (`benchmarks/eas/serie-builds.mjs`) — les 2 builds de `D-133` n'y répondent pas et portent un autre projet ; la série **consomme du quota** et exige un **GO propriétaire**. Script corrigé et correction versionnée (2026-08-29, `00270c4`) ; **série jamais lancée**. **La Phase 1 n'est donc PAS close.** |
| Coût projet Supabase | ✅ | 🟢 **EXÉCUTÉ** (2026-08-28, GO propriétaire) — org de test dédiée `supabase-bench-test` (free vérifié par API), projet éphémère créé/détruit PAR le script : **création→PostgREST 10,45-12,79 s · teardown prouvé ~5 s · 0 $** · rate limits relevés · détail `benchmarks/couts-unitaires.md` Volet 3 |

**D-015 ACTÉE (2026-08-27)** : résilience aux refus LLM — gestion explicite
de `refusal` sur tout chemin LLM, zéro panne silencieuse, fallbacks prévus
par l'architecture mobilisables, taux de refus = métrique Budget Governor ;
**fréquence réelle [à mesurer] sur corpus représentatif** (le n=10 du banc
prouve l'existence, pas le taux). Voir `DECISIONS.md` D-015.

## PHASES

> 🔴 **TABLEAU PÉRIMÉ — NE PAS PLANIFIER DESSUS** *(rectification du 2026-09-04, aucune ligne supprimée)*. Ce tableau est figé à l'état des **2026-08-27/28** et contredit le bloc **`ÉTAT GLOBAL`** ci-dessus, **qui fait seul autorité** : il y affiche les Phases 9 à 14 en `⏳` alors que la **Phase 9 est terminée**, que la **Phase 10 est à 6/7**, que la **Phase 10B est close** (`D-125`) et que la **Phase 11 est à 3/5** ; il affiche la **Phase 8 « EN COURS »** sans mentionner qu'elle a été **rouverte par le fait** (audit `A-P8-01`/`A-P8-02`) ; il affiche la **Phase 4 « EN COURS »** alors qu'elle est terminée depuis le 2026-08-28 (`D-031-R47`). Seule la ligne **Phase 1 « 🔵 EN COURS »** reste exacte — le banc « Coûts EAS » n'est pas exécuté (voir § PHASE 1 — DÉTAIL). **Source faisant foi : `ÉTAT GLOBAL` (l. « Phase actuelle » et « Progression globale »).** La réécriture ligne à ligne de ce tableau n'est PAS engagée : elle exige un arbitrage distinct.

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
| 5 | Backend Provisioner v1 | 🟢 TERMINÉE (D-032-R55) |
| 6 | Sandbox + Oracle v1 | 🟢 TERMINÉE (D-034-R6) |
| 7 | Workflow asynchrone durable | 🟢 TERMINÉE (D-035-R7) |
| 8 | Vertical Slice 1 (restaurant) | 🔵 EN COURS — **Étape A CLOSE** (D-036-R8A) : chaîne 7/7 verte, scorecard v1, rétrospective, émulateurs iOS+Android ; **critère 1 (2 appareils physiques) OUVERT** *(rectifié le 2026-09-04 : « compte Expo/EAS requis » est périmé — compte acquis et opérationnel, `D-133` ; le blocage restant est l'**installation sur appareil**. Cette ligne sous-estime par ailleurs l'état de la Phase 8 : voir la rectification en tête de tableau)* |
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

## CRITÈRES DE SORTIE — PHASE 10 (état mesuré au 2026-08-30)

| Critère | État | Fondement |
|---|---|---|
| app fonctionnelle sur appareils physiques | 🔴 **SUSPENDUE** | arbitrage propriétaire |
| scorecard cross-domain à 2 domaines | 🟢 produit | `slices/run-scorecard.mjs` |
| **substitution de provider sans changement d'AIR** | 🟢 **CONFORME** *(D-053)* | `airHash` intact, 6 et 7 classes basculées vers `mock`, registre offrant un mock **16/16**. 🔴 **RÉSERVE** : `rootHash` identiques, **0 fichier émis différent** — le remplacement est prouvé **dans le lock**, jamais dans le produit. Nuance **non tranchée** |
| **liste mesurée des capabilities manquantes** | 🟠 **NON DÉTERMINÉ, MOTIVÉ** *(D-053)* | 14/15 capabilities déclarées · `biometrics` jamais employée · **0 hors registre, 0 manquante constatée**. L'allowlist étant **positive et fail-closed**, aucun document ne peut exprimer un besoin non couvert : le corpus est **filtré par le registre qu'il devrait évaluer**. Le zéro mesure **l'impossibilité d'observer un manque**, pas une couverture |
| dimension H — variété anti-template | 🟢 conforme sur 2 domaines | DET-021 / D-043 · réserve : mesure recalculée à la volée, sans artefact versionné |
| **dimension C — complétude des états** | 🔴 **`non_conforme`** *(D-048, D-052)* | mesurée sur l'état **atteint** depuis la correction de l'instrument |

🔴 **A++ NON ATTEINT** — la dimension C interdit la qualification.

## VERROUS DE SORTIE — PHASE 10 (ordre confirmé D-051)

```
RN-12  →  RN-13  →  RN-07  →  RN-08
```

🔴 **Trancher AVANT de construire.** Une évolution de schéma change l'`airHash`, donc tous les `rootHash`, donc
impose un nouveau build EAS et une nouvelle campagne appareil. Valider sur appareil avant les arbitrages aurait
coûté **deux builds et deux campagnes**. *(Le § PLAN DE REMISE À NIVEAU de `ROADMAP.md` portait déjà cet ordre :
la déviation venait de la séquence conversationnelle, pas du plan.)*

| Verrou | Sujet | État |
|---|---|---|
| **RN-12** | accessibilité du graphe (`P-009` volet 2) | 🟢 **TRANCHÉ → D-049** — bloquant pour les documents neufs, **métrique effective uniquement** ; déclarée interdite comme base de blocage tant que `R-23` est ouvert. Mise en œuvre **non engagée** |
| **RN-13** | liaison des Code Slots (`DET-018`) | 🟢 **TRANCHÉ → D-050** — dette acceptée, échéance **Phase 11**, aucune évolution de schéma |
| **RN-07** | validation sur appareil physique du slice 2 | 🔴 **OUVERT** — build EAS + installation par QR. **Prérequis propriétaire** : un build consomme le quota. *(Rectifié le 2026-09-04 : « `eas` n'est pas installé dans l'environnement » est périmé — `npx eas` fonctionne et la session est authentifiée (comptes `deribfy-app`, `deribfy-apps-team`). Depuis `D-133`, 2 artefacts appareil EXISTENT, mais pour l'app-fixture `bus-intercites`, **pas pour le slice 2** ; `RN-07` reste donc 🔴 OUVERT.)* |
| **RN-08** | `DET-006` virtualisation (dimension G) | 🔴 **OUVERT** — s'observe **pendant** la session `RN-07`, pas après. *(Précisé le 2026-09-04 : la dimension G est déclarée `conforme` par `apxx-grid.ts` sur une preuve **statique** — absence de `ScrollView` englobant + parent borné — alors que la grille exige une « mesure sur appareil ». **Cette conformité d'instrument ne clôt pas `RN-08`.**)* |
| **4 — source de besoins** | critère « capabilities manquantes » (D-053) | 🔴 **DÉCISION À PRENDRE, AUCUNE CORRECTION.** Le critère exige une **source de besoins non filtrée par l'allowlist**. Trois pistes non arbitrées : intentions humaines de tiers · domaines hors corpus · journal des candidates tier B (D-020). **Décider d'abord, mesurer ensuite** — fabriquer une source pour obtenir un chiffre produirait une mesure artificielle |
| **DET-028** | dimension **C** `non_conforme` (D-048, D-052) | 🔴 **OUVERT — SANS HORIZON.** Volet **outillage** : 🟢 **CLOS le 2026-08-30** — instrument corrigé, il mesure désormais l'état **ATTEINT** (`reachableBlockStates`, source cliquetée contre le runtime) et non plus une chaîne dans le source. **640 tests verts · typecheck EXIT=0 · code émis inchangé.** Verdict obtenu : `non_conforme` sur les 2 slices, **8 états requis non atteignables**. Volet **objet** : 🔴 report **IMPOSSIBLE**, aucune phase de la ROADMAP ne prend `DET-008` en charge. **La dimension C reste `non_conforme` et A++ reste NON ATTEINT** |

🔴 **Troisième verrou, hors liste initiale** : `DET-028` — dimension **C** requalifiée `non_conforme` (D-048), **bloquante Phase 10, à traiter avant toute clôture**.

## DETTES OUVERTES (registre permanent — décision propriétaire 2026-08-29)

> Mécanisme de suivi des dettes, défauts et écarts découverts pendant une
> phase. Il vit ICI parce que `STATUS.md` est relu **obligatoirement au
> début de chaque session** (règle de continuité, MASTER_PLAN §5) : une
> dette inscrite ici ne peut plus disparaître du radar. Aucune ligne n'est
> supprimée — elle passe à `🟢 RÉSOLUE` avec sa preuve.
> **ROADMAP.md et MASTER_PLAN.md ne sont PAS modifiés.**

| ID | Description | Origine | Gravité | Échéance | Statut |
|---|---|---|---|---|---|
| **DET-001** | **Safe area du bas non respectée** : le dernier bloc d'un écran était rendu sous la barre de navigation gestuelle (mesuré `[0,2213]→[1080,2340]`, bord = bas absolu), contrôle inatteignable | Phase 8, Galaxy A17 physique, commit `6e857df` | 🔴 haute (fonctionnalité) | — | 🟢 **RÉSOLUE 2026-08-29** (D-037) — correction dans le compilateur ; prouvée sur appareil réel (bouton `[2078→2205]`, tap → `scr_commandes`) ; Phases 4/6/7/8 rejouées |
| **DET-002** | **Flows E2E générés non robustes sur appareil physique** : `scrollUntilVisible` (20 s/vitesse 40) expirait avant d'atteindre le bas d'une liste de 24 lignes — **faux négatif** (swipes directs : 1,8 s) | Phase 8, Galaxy A17 physique | 🟠 moyenne (fiabilité de l'Oracle L2) | — | 🟢 **RÉSOLUE 2026-08-29** (D-037) — timeout 60 s / vitesse 70 ; **seuil de visibilité 100 % INCHANGÉ** (pouvoir de détection préservé) ; 2/2 PASS device + 2/2 émulateur |
| **DET-003** | Le gabarit ne produit pas d'**`eas.json`** (profils de build) — ajouté à la main pour le slice | Phase 8, D-036-R8B | 🟠 moyenne | **Phase 11** (canaux OTA) | 🔴 OUVERTE |
| **DET-004** | L'`app.json` émis ne porte ni **`owner`** ni **`extra.eas.projectId`** — liaison au projet EAS faite à la main à chaque régénération. **ÉTENDUE 2026-08-29** : le gabarit n'émet pas non plus **`ios.infoPlist.ITSAppUsesNonExemptEncryption`** — clé de conformité export Apple **écrite dans `app.json` par `eas build` lui-même** au premier build iOS (constatée au `git diff`, pas supposée). Trois clés désormais absentes de la sortie du compilateur et ajoutées hors générateur | Phase 8, D-036-R8B ; extension 2026-08-29 | 🟠 moyenne | **Phase 11** | 🔴 OUVERTE |
| **DET-005** | **`expo-dev-client` absent** du gabarit → un « dev build » au sens Expo est impossible sans modification manuelle (le slice a utilisé la distribution interne) | Phase 8, D-036-R8B | 🟠 moyenne | **Phase 12** (TestFlight) | 🔴 OUVERTE |
| **DET-006** | 🟠 **RECTIFIÉE LE 2026-08-29 (DET-025)** — la fiche affirmait « contrat + styles + **composant** » : le composant, lui, **n'appliquait pas** `fill`. Le bornage n'a reellement existe qu'a partir de DET-025. Ancien libelle : `Section.fill` ajoutee aux primitives (contrat + styles + composant) ; `ListBlock` la DÉCLARE sans aucun style (invariant D-021/D-023 vérifié : 0 style réel dans `blocks`) ; l'émetteur n'enveloppe plus dans un `ScrollView` un écran porteur d'un bloc `list`. **Propriété vérifiée sur l'émission réelle** (3 écrans à liste sans `ScrollView` + bornage `flex:1` ; `scr_plat_detail` sans liste conserve sa page défilante) et **verrouillée mécaniquement** (2 tests bidirectionnels sur les 12 documents). Train re-scellé (`blocksSourcesHash`), registre de blocs INCHANGÉ en 1.0.0. **Virtualisation effective à l'exécution : 🟠 NON DÉTERMINÉE** — observation sur appareil requise. — ancien libellé : **Virtualisation de la FlatList neutralisée** par la page défilante (ScrollView englobant) — négligeable en preview, à revoir sur listes longues. **REQUALIFIÉE 2026-08-29 (D-039)** : constitue la non-conformité de la **dimension G** (fluidité perçue / virtualisation) de la grille A++ | Phase 4.7, D-031-R47 ; requalifiée 2026-08-29 | 🔴 **BLOQUANTE A++** (était 🟡 basse) | **Phase 10** (design system v2) | 🔴 OUVERTE |
| **DET-007** | **Seed partiel** : seules les entités portant un `dataset` reçoivent des lignes (ici 24 / 0 / 0) | Phase 8, D-036-R8A | 🟡 basse | Phase où le Content Pipeline (§19) produit les données | 🔴 OUVERTE |
| **DET-008** | **App non connectée au backend vivant** en preview (conforme D-013 « données de démonstration » et D-032 « policies RLS différées ») — le chemin app ⇄ backend n'est donc pas encore prouvé | Phase 8, D-036-R8A | 🟠 moyenne | 🔴 **AUCUNE PHASE DE LA ROADMAP** — vérifié le 2026-08-30 (D-052) : `DET-008` n'apparaît **pas une seule fois** dans `ROADMAP.md`. L'échéance historique *« Phase où les capabilities/auth sont implémentées »* est une **désignation par condition, pas par nom de phase** ; aucune phase ne porte cette condition comme objectif ou critère de sortie. **Cette dette n'est pas reportée : elle est HORS PLAN.** Ne pas convertir cette absence en échéance fictive — ce serait un abandon déguisé présenté comme un report | 🔴 **OUVERTE, NON RATTACHÉE** — le volet « objet » de la dimension C (`DET-028`) en dépend directement, et se trouve donc lui aussi rattaché à rien |
| **DET-009** | **Provisioning Supabase à ~170 s** sur org Pro (contre ~9,5 s en Free) — impact sur le débit de flotte | Phase 5/8 | 🟡 basse | **Phase 14** (industrialisation) | 🔴 OUVERTE |
| **DET-010** | **Build natif iOS local en échec** (`ExpoModulesJSI xcframework`, CocoaPods) — contourné par EAS cloud ; outillage local, pas le générateur | Phase 8, 2026-08-29 | 🟡 basse | Phase 12 (si builds locaux nécessaires) | 🔴 OUVERTE |
| **DET-011** | **Build iOS pour APPAREIL physique impossible via EAS sans credentials Apple** [mesuré 2026-08-29] : « *EAS CLI couldn't find any credentials suitable for internal distribution* ». Le build simulateur (`iphonesimulator`, x86_64+arm64) ne s'installe PAS sur un iPhone | Phase 8, 2026-08-29 | 🔴 haute (bloque le critère 1 côté iOS) | Phase 8 | 🟠 **EN COURS** — adhésion Apple Developer **payée le 2026-08-29 (135 $ CA)** puis **ACTIVÉE**. Clé API App Store Connect créée, `~/.deribfy-apple.env` (mode 0600) : formats des 4 variables vérifiés, **une confusion Issuer ID ↔ Team ID détectée et corrigée par le propriétaire**. **Clé ASC PROUVÉE fonctionnelle** [mesuré] : JWT ES256 signé localement, HTTP 200 sur `/v1/bundleIds`, `/v1/devices`, `/v1/certificates`, `/v1/profiles` (compte vierge : 0 entrée partout). **LIEN APPLE ↔ EAS ÉTABLI** [mesuré] : `eas device:create` authentifié **sans mot de passe Apple ni 2FA** via `EXPO_ASC_*` + `EXPO_APPLE_TEAM_ID` + `EXPO_APPLE_TEAM_TYPE=INDIVIDUAL` ; équipe Apple désormais listée par EAS. **URL/QR d'enregistrement d'appareil généré**, profil de configuration installé par le propriétaire, UDID remonté. **🟢 RÉSOLUE 2026-08-29** — build iOS de distribution interne **FINISHED en 195 s, artefact IPA présent** (`fc2ba66a`, profil `preview`, distribution `INTERNAL`, palier gratuit, 0 $), **aucun avertissement « Failed to provision »**. État Apple contre-vérifié par lecture directe de l'API après build : **1 bundleId** (`com.deribfy.preview.maquis-express`), **1 appareil IPHONE statut `ENABLED`** — donc pas « Processing », le délai Apple de 24-72 h ne s'est pas matérialisé —, **1 certificat `IOS_DISTRIBUTION`** (expire 2027-08-29), **1 profil `IOS_APP_ADHOC` état `ACTIVE`** contenant **l'appareil et le certificat**. **TEAM ID CONFIRMÉ PAR APPLE** : le `seedId` du bundleId créé est identique à `APPLE_TEAM_ID` — la réserve laissée ouverte sur ce point est levée |
| **DET-012** | **Port de données USB-C de l'iPhone 16 non fonctionnel** [démontré] : charge mais **zéro énumération USB**, aucune invite de confiance, y compris déverrouillé au branchement et après nettoyage du port. Câble et port du Mac **innocentés par test de contrôle** (Galaxy A17 détecté avec les mêmes) | Phase 8, 2026-08-29 | 🟠 moyenne (matériel, hors générateur) | — | 🔴 OUVERTE — contournée par la voie EAS/QR (sans câble) |
| **DET-013** | **Expo Go incompatible avec le release train** [mesuré] : « *requires a newer version of Expo Go* » — l'App Store est en retard sur le SDK 57 du train. Voie de validation sans câble et sans compte : **fermée**. Le train n'a PAS été modifié pour faire passer un test (garde-fou) | Phase 8, 2026-08-29 | 🟡 basse | Réexaminer si Expo Go rattrape le SDK | 🔴 OUVERTE |
| **DET-014** | **Contraste du bouton primaire sous le seuil WCAG 2.2 AA** [mesuré, déterministe] : `onPrimary` blanc `#FFFFFF` sur l'accent de marque `primary` `#FA5D1E` = **3,16:1**, seuil requis **4,5:1** pour du texte `body` 14 pt. Échec **identique en thème clair ET sombre**. Touche le libellé du bouton primaire de toute app générée. 28 des 30 paires testées sont conformes — le défaut est localisé, pas systémique. Correction impossible sans toucher aux **tokens gelés 1.0.0** (assombrir l'accent, inverser le premier plan, ou porter le libellé à ≥ 18 pt) | Phase 8, évaluation grille A++ 2026-08-29 (D-039) | 🔴 était BLOQUANTE A++ | — | 🟢 **RÉSOLUE — RE-MESURÉE EN PHASE 10 (2026-08-29)** : `onPrimary` `#16181D` sur `primary` `#FA5D1E` = **5,62:1** en thème clair ET sombre (seuil 4,5:1). L'accent de marque est préservé à l'identique |
| **DET-015** | **Aucune taille minimale de cible tactile garantie** [démontré structurellement] : ni `minHeight`, ni `minWidth`, ni `hitSlop` dans `packages/primitives/src/styles.ts`. Le bouton se dimensionne par `paddingVertical: space.md` (12) + texte `body` 14 pt sans `lineHeight` déclaré ⇒ hauteur estimée **≈ 41 pt**, sous **44 pt (iOS HIG)** et **48 dp (Material)**. Le fait structurel — *aucun minimum n'est imposé* — est démontré indépendamment de l'estimation ; toute conformité observée serait fortuite | Phase 8, évaluation grille A++ 2026-08-29 (D-039) | 🔴 était BLOQUANTE A++ | — | 🟢 **RÉSOLUE — RE-MESURÉE EN PHASE 10 (2026-08-29)** : `size.tapTarget` = **48** (≥ 44 pt iOS, ≥ 48 dp Material), appliqué à **3 surfaces** (bouton, champ, ligne de liste) |
| **DET-016** | **Clavier système masquant le champ actif et les contrôles** [observé sur iPhone 16 réel] : aucune gestion du clavier n'existait dans le système — ni `KeyboardAvoidingView`, ni `automaticallyAdjustKeyboardInsets`, ni `windowSoftInputMode`. Structurellement garanti sur iOS (pas de redimensionnement de fenêtre), masqué par défaut sur Android. **13 écrans sur 47 portent un bloc `form`**, sur 11 domaines | Phase 8, observation appareil 2026-08-29 | 🔴 **BLOQUANTE A++** (dimension A étendue) | Phase 8 | 🟠 **CORRIGÉE À LA SOURCE** — 3 volets sans `Platform.OS` : `automaticallyAdjustKeyboardInsets` sur le `ScrollView` émis et sur la `FlatList` du bloc liste (propriété VÉRIFIÉE iOS-seulement sur RN 0.86.3, inerte sur Android), `keyboardShouldPersistTaps="handled"`, et `softwareKeyboardLayoutMode: "resize"` au manifeste Android. **7 verrous mécaniques permanents**. Conformité suspendue à l'observation appareil |
| **DET-017** | **Répétition sémantique et incohérence de composition** [observé sur iPhone 16 réel, écran « Mes commandes »] : titre affiché 3 fois (navigation + `ScreenShell` + bloc `header`), état vide dupliqué, et action « Annuler la commande en cours » proposée alors qu'aucune commande n'existe. **21 % du corpus** portait un titre de bloc égal au titre d'écran | Phase 8, observation appareil 2026-08-29 | 🔴 **BLOQUANTE A++** (dimension I) | Phase 8 (volet 1) · Phase 10 (volet 2 + conditionnement) | 🟠 **VOLET 1 CORRIGÉ À LA SOURCE 2026-08-29** — `ScreenShell` ne rend plus le titre visible, redondant par construction avec l'en-tête natif (même source AIR ; `headerShown` n'est désactivé nulle part) ; titre reporté sur `accessibilityLabel`, contrat `ScreenShellProps` INCHANGÉ. **VOLET 2 RÉFUTÉ et reporté Phase 10** : les 35 blocs `header` portent tous un `subtitle`, et 4 quasi-doublons sémantiques (`Favoris`/« Mes favoris », `Panier`/« Votre panier », `Prestations`/« Nos prestations », `Progression`/« Ma progression ») échappent à toute comparaison de chaînes. **VOLET 2 TRAITÉ LE 2026-08-29 (D-044)** : le schéma AIR passe en 1.1.0 avec `visibleWhen` ; le slice 2 ré-émis affiche **0 état vide dupliqué** (mesuré, était 2). Les 12 documents du corpus GELÉ conservent le défaut — ils sont figés et migrés à l'identique, sans invention de condition. Ancien libellé : idem pour le conditionnement des actions par l'état réel des données → registre v2. **PORTÉE DU VOLET 2 MESURÉE LE 2026-08-29** (instrument `benchmarks/composition/`, 13 documents / 50 écrans) : **19 écrans** portent un bloc `empty_state` À CÔTÉ d'un bloc `list` qui possède déjà son propre état vide conditionnel — les deux peuvent donc s'afficher pendant que des données sont présentes ; et **4 écrans** exposent la MÊME action par deux blocs (bouton + CTA de l'état vide). **Cause commune établie** : le schéma AIR 1.0.0 GELÉ ne porte AUCUN moyen de conditionner le rendu d'un bloc (`blockInstanceSchema` = id, blockType, entityId?, props). Ce n'est donc pas une erreur d'un document : c'est une limite de CONTRAT, qui appelle une décision (P-009) |
| **DET-018** | **Les Code Slots ne sont pas encore APPELÉS par l'application générée** [démontré structurellement] : l'AIR 1.0.0 déclare la signature d'un slot (`inputs`/`outputs`/`allowedImports`) mais **ne lie ni ses entrées ni ses sorties à un point d'exécution** — aucune convention de binding n'existe dans le schéma gelé. Mesure sur le corpus : **44 slots déclarés, 43 actions à effet `slot`, 0 implémentation** produite par le moteur avant la Phase 9. La Phase 9 émet désormais les modules et un registre TYPÉ (vérifiés par `tsc` du projet généré et par la politique AST), mais l'app ne les invoque pas. Inventer une convention de liaison aurait été une extension silencieuse du schéma gelé — refusé (D-040). **Corollaire** : l'exécution d'un slot en sandbox — donc les *tests unitaires de slot* au sens §4 — n'est pas câblée non plus ; la vérification actuelle est statique (politique AST + `tsc` du projet généré) | Phase 9, 2026-08-29 | 🟠 moyenne (fonctionnalité incomplète, aucune régression) | **Phase 11** — échéance arbitrée le 2026-08-30 (D-050), la Phase 10 étant explicitement exclue | 🟠 **DETTE ACCEPTÉE, DATÉE** — option B : les slots restent déclarés et non invoqués, **aucune évolution de schéma engagée**. Justification : cette dette n'a **aucune surface visible par l'utilisateur** ; le coût d'une montée AIR 1.2.0 (cascade de hachages, 2 slices rejoués, **nouveau build EAS**) n'est pas justifié par une promesse d'architecture invisible. `D-040` (refus d'inventer une convention de liaison) reste valide — la décision **date** l'échéance, elle n'improvise rien |
| **DET-019** | **Dimension B de la grille A++ : l'accent de marque utilisé comme COULEUR DE TEXTE est sous le seuil WCAG 2.2 AA** [mesuré par instrument déterministe] : `primary` `#FA5D1E` sur `bg` = **2,95:1** et sur `surface` = **3,16:1** en thème clair (seuil 4,5:1). Usages réels : prix de fin de ligne (`rowTrailing`), ton `primary` de `AppText`, libellé de bouton fantôme — donc visible sur **toutes** les listes générées. 28 des 30 paires sont conformes : le défaut est localisé. **Distinct de DET-014** (corrigé), qui portait sur la paire INVERSE (`onPrimary` sur `primary`). La correction touche les tokens gelés ⇒ design system v2 | Phase 9, instrument A++ 2026-08-29 | 🔴 était BLOQUANTE A++ | — | 🟢 **RÉSOLUE — DESIGN SYSTEM v2 (D-043, 2026-08-29)** : token DÉRIVÉ `primaryText` (encre de l'accent lue sur le fond) — 2,95:1 → **4,57:1** ; l'accent de marque `#FA5D1E` est PRÉSERVÉ et n'est plus une couleur de texte. Mesure finale : **36 paires / 0 échec** sur les DEUX slices |
| **DET-020** | **Deux affirmations de la fiche DET-017 (volet 1) sont réfutées** [démontré, session 2026-08-29 avant Phase 9] : (a) « ce `Text` et l'en-tête dérivent de la MÊME donnée AIR sur les 47 écrans » est FAUX pour **2 écrans sur 47** (`cours-cuisine` : `scr_catalogue` route « Cours » ≠ écran « Cours de cuisine » ; `scr_lecteur` route « Lecture » ≠ écran « Lecture du cours ») — sur `scr_lecteur`, le titre d'écran n'est plus affiché nulle part ; (b) « le titre reste exposé à l'accessibilité via `accessibilityLabel` » est FAUX sur iOS : `AccessibilityProps.h` pose `accessible{false}` et `RCTViewComponentView.mm` lie `isAccessibilityElement` à cette prop — le label d'un conteneur non `accessible` **n'est pas restitué par VoiceOver** ; sur Android il pose une `contentDescription` sur le conteneur racine des 47 écrans, dont l'effet TalkBack est 🟠 non mesuré. La sémantique de titre réellement préservée est celle de **l'en-tête natif**. **CONSIGNÉE, NON CORRIGÉE** (Phase 8 close par constat propriétaire) | Session 2026-08-29 (hors périmètre Phase 9) | 🟠 était moyenne | — | 🟢 **RÉSOLUE — v2 (D-043)** : le repli `accessibilityLabel ?? title` est RETIRÉ (inerte pour VoiceOver, `contentDescription` non mesurée sur Android). La sémantique de titre est portée par l'EN-TÊTE NATIF. L'observation « 2 écrans sur 47 à titre de route divergent » reste consignée : propriété du CONTENU du corpus gelé, pas défaut du moteur |
| **DET-021** | **Aucune variété visuelle par app — dimension H NON CONFORME** [mesuré, deux méthodes indépendantes] : les 12 domaines déclarent **12 thèmes distincts** (`air.design.theme`) et produisent **UNE SEULE identité visuelle** — `theme.generated.ts`, `styles.ts`, `primitives.tsx`, `components.tsx` sont **byte-identiques** sur les 12 apps. Cause établie : (1) empirique — la chaîne du thème n'apparaît dans **aucun** fichier émis ; (2) statique — **aucun chemin de code** du compilateur ne lit `air.design.theme`. La structure, elle, varie (12 silhouettes, 0 collision). §22 « une app générée ne doit pas ressembler à un gabarit IA générique » n'est donc **pas satisfait sur l'axe visuel** | Phase 10, instrument anti-template 2026-08-29 ; **RE-MESURÉE SUR LES 2 SLICES le 2026-08-29** | 🔴 était BLOQUANTE A++ (dimension H) | — | 🟢 **RÉSOLUE — v2 (D-043)** : `design.overrides` (champ du schéma AIR **gelé**, jusque-là jamais lu) devient effectif ; allowlist de clés, valeurs validées, encres re-dérivées. **Mesure officielle sur les 2 slices : 2 silhouettes distinctes ET 2 identités visuelles pour 2 thèmes déclarés ⇒ H CONFORME**. Les 12 documents du corpus restent visuellement identiques parce que la campagne D-025 leur interdisait `design.overrides` — propriété du corpus GELÉ, pas du moteur |
| **DET-022** | **9 valeurs de style en dur — dimension D NON CONFORME** [mesuré par AST puis par l'instrument] : **8 `fontWeight`** littéraux et **1 `paddingVertical: 2`** dans `packages/primitives/src/styles.ts`. Cause : les tokens n'ont **ni groupe `fontWeight`, ni pas d'espacement inférieur à `xs`**. **Le code n'a pas régressé** — l'instrument de la dimension D ne mesurait que les couleurs hexadécimales et déclarait D conforme alors que 3 des 4 familles nommées par le critère (espacements, rayons, couleurs, typographie) n'étaient pas regardées ; il les mesure toutes depuis la Phase 10 | Phase 10, instrument renforcé 2026-08-29 | 🔴 était BLOQUANTE A++ (dimension D) | — | 🟢 **RÉSOLUE — v2 (D-043)** : `fontWeight`, `space.xxs` et `opacity.disabled` ajoutés (chacun avec un consommateur réel). Mesure : **0 valeur en dur** (était 9) |
| **DET-023** | **Couverture du design system inférieure à ce que le §22 annonce** [mesuré sur `tokens.json` 1.1.0 et sur les sources] : groupes **`elevation`, `animation`/`motion`, `opacity`, `breakpoint`/`density` ABSENTS** — ombres, transitions et responsive/adaptive ne peuvent donc pas être cohérents par construction ; et **zéro usage de `Platform`** dans tout le système (absence délibérée au service de la portabilité, DET-016, mais §22 demande des « idiomes iOS/Android »). v2 doit trancher explicitement entre uniformité assumée et idiomes de plateforme | Phase 10, 2026-08-29 | 🟠 était moyenne | — | 🟢 **RÉSOLUE PAR ARBITRAGE — v2 (D-043)** : `opacity` ajouté (consommateur réel) ; `elevation`, `motion`, `breakpoint`/`density` **délibérément NON ajoutés** — aucun consommateur, l'ajout serait spéculatif ; idiomes iOS/Android : **uniformité assumée**, propriété déjà verrouillée par test |
| **DET-024** | **Écran déclaré mais INATTEIGNABLE dans l'app générée** [mesuré, deux méthodes indépendantes] : dans le slice 2, `scr_notifications` possède une route (`nav_notifications`) mais **aucune action à effet `navigate` ne le cible** — vérifié sur l'AIR et, indépendamment, sur les données d'écran émises. L'écran est donc dans la pile de navigation sans qu'aucun appui ne puisse y mener. Rien dans les validateurs ne l'interdit aujourd'hui : le graphe de navigation n'est pas contrôlé en accessibilité. **RECTIFICATION 2026-08-29** : la fiche affirmait « le slice 1 n'était pas concerné » — **c'est FAUX**, mesure à l'appui : `scr_plat_detail` du slice 1 n'est ciblé par aucune action `navigate` (aucune action à déclencheur ui ne porte sur `blk_menu_liste`). **PORTÉE RÉELLE MESURÉE** sur 13 documents / 50 écrans : **17 écrans sans chemin de navigation (34 %)**, répartis sur 10 des 13 documents. Instrument versionné : `benchmarks/composition/` | Phase 10, préparation de la validation appareil 2026-08-29 | 🟠 moyenne (écran mort dans l'app livrée) | **Phase 11** (Capability Router / graphe de navigation) ou correctif de validateur à arbitrer | 🔴 OUVERTE |
| **DET-025** | **La liste virtualisee n'avait AUCUN parent borne — derniere ligne inatteignable sur appareil** [observe sur Galaxy A17 physique, REPRODUIT sur emulateur, cause demontree par trois sources] : la primitive `Section` **n'appliquait pas** la prop `fill`. Le contrat la declarait, les styles `sectionFill`/`sectionFillBody` existaient, `ListBlock` la demandait — **le cablage du composant manquait**, depuis l'origine (identique dans `HEAD`). Geometrie mesuree : FlatList jusqu'a `y=2400` (bas d'ecran exact), 11e ligne coupee, **12e inatteignable**, bloc `empty_state` **entierement hors ecran**. Le verrou DET-006 ne verifiait que l'ABSENCE de `ScrollView`, jamais le BORNAGE — d'ou deux phases sans detection. **Le flow E2E genere ne l'a pas vu non plus** : il assure la 1re ligne puis le bloc liste, jamais la derniere | Phase 10, validation appareil 2026-08-29 | 🔴 **haute** (contenu inatteignable dans toute app a liste longue) | Phase 10 | 🟢 **CORRIGEE A LA SOURCE** — `Section` applique `fill` sur le conteneur ET sur le corps. **3 preuves** : rendu de la primitive (2 controles), rendu du bloc de bout en bout (2 controles), verrou sur l'ARTEFACT EMIS verifiant les deux moities de la chaine. **Preuve d'execution sur appareil : EN ATTENTE d'un nouveau build** |
| **DET-026** | **`app.locales.rtlSupported` est INERTE — non-négociable #16 non tenu côté artefact** [mesuré 2026-08-29, contre-épreuve exécutée] : compiler un même document avec `rtlSupported: true` puis `false` produit **0 fichier différent** dans le projet émis ; seul l'`airHash` du manifeste change. Les deux seuls lecteurs du drapeau sont `render-text.ts` (rendu de debug) et `e2e-flows.ts` (qui force le RTL au niveau de l'ÉMULATEUR, pas de l'app). La dimension **F** de la grille A++ reste conforme — les primitives n'emploient que des propriétés logiques, ce qui est vrai et vérifié par cliquet — mais **aucune app générée ne s'initialise en RTL, quel que soit son AIR**. Aucun document du corpus ne déclare `rtlSupported: true` (0/13), ce qui explique que le défaut n'ait jamais été observé | Étape 1 (contrat d'exécution), D-045 | 🟠 moyenne (promesse d'architecture non tenue, aucune régression) | **Étape d'exécution** (le drapeau doit produire un effet d'artefact) | 🔴 OUVERTE |
| **DET-027** | **Lignes de liste PRESSABLES et INERTES** [mesuré à l'exécution 2026-08-30, premier instrument d'observation] : `useItemNavigate` retournait **toujours** une fonction, même sans effet `navigate` — chaque ligne était donc appuyable et muette. Le contrat de bloc savait pourtant ne câbler aucun `onPress` quand `onItemPress` est absent. **Mesure sur les 2 slices : 60 contrôles pressables, 4 agissants, 56 inertes**, dont **46 lignes de liste**. Invisible à toute mesure statique : `controls()` ne recense un bloc que s'il porte une action, et un bloc liste n'en porte aucune | Instrument d'observation, 2026-08-30 (`APP-D002`) | 🔴 haute (fausse promesse à l'utilisateur) | — | 🟢 **RÉSOLUE 2026-08-30** (D-047) — correction à la source du runtime, assets embarqués régénérés, 2 copies de slice propagées. **Après : 14 pressables, 4 agissants, 10 inertes** (dette moteur `capability`/`mutation`, délibérément non touchée). **46 fausses affordances retirées · 640 tests verts · typecheck EXIT=0 · les 4 navigations fonctionnelles inchangées.** Correspondance runtime ↔ validateur `E-19` : **21,4 % → 100 %** |
| **DET-028** | **La dimension C de la grille A++ mesure le CODE, pas l'ÉTAT ATTEINT** [mesuré 2026-08-30] : `apxx-grid.ts` §C calcule `["loading","empty","error"].filter(k => blocks.includes(`state.kind === "${k}"`))` — une **recherche de sous-chaîne** dans le source du composant émis. `metrics.json` enregistre donc **C = conforme**, détail « états rendus par le bloc liste : loading/empty/error ». Or l'**enveloppe** concède `reachableBlockStates.list = ["ready","empty"]`, et l'**observation** (deux conditions de données) montre que le bloc `list` ne rend jamais que `empty`/`ready`. **11 états déclarés au registre · 7 concédés · 3 observés ; 8 états déclarés ne sont jamais rendus.** Quatre types de blocs déclarent un état et n'en portent aucun. Deux organes du dépôt se contredisent sur le même objet, sans qu'ils aient jamais été croisés | Instrument d'observation, 2026-08-30 (`APP-D003`) | 🔴 **BLOQUANTE A++** — **volet outillage CLOS le 2026-08-30** (instrument corrigé, le faux vert est supprimé) ; **volet objet toujours bloquant** : `loading`/`error` restent inatteignables, source de données synchrone | 🔴 **BLOQUANTE PHASE 10 — à traiter AVANT toute clôture** (échéance arbitrée le 2026-08-30, D-048). **VOLET OUTILLAGE** : **non reportable**, à produire dans la phase (`A1`, D-052). **VOLET OBJET** : 🔴 **AUCUNE ÉCHÉANCE POSSIBLE** — le report exigeait une phase **nommée** ; `DET-008`, dont il dépend, n'est rattachée à **aucune** phase de la ROADMAP (D-052) | 🔴 **OUVERTE** — dimension C **requalifiée `non_conforme`** le 2026-08-30. `non_determinee` écarté : la règle de notation le réserve aux dimensions **non mesurables**, or C a été mesurée par deux voies concordantes (enveloppe cliquetée + exécution). **Conséquence : A++ n'est pas atteint sur les 2 slices.** Aucune correction engagée — les deux causes démontrées (instrument lisant le contrat · source de données synchrone) n'admettent pas de correctif court. **ARBITRAGE DU 2026-08-30 (D-052)** : l'instrument **doit** être rendu honnête — variante `A1`, mesurer contre `reachableBlockStates` de l'enveloppe — **travail PRESCRIT, NON ENGAGÉ** (aucun code, aucun instrument, aucun `metrics.json` modifié) ; le critère C **n'est ni amendé ni assoupli** (option C refusée) ; le report du volet objet est **SUSPENDU**, **ni Phase 11 ni aucune autre phase n'étant déduite**. **DET-028 demeure 🔴 BLOQUANTE PHASE 10 · A++ NON ATTEINT.** |
| **DET-029** | **Divergence documentaire non résorbée entre `main` et la lignée de campagne** [constatée 2026-09-04, non mesurée] : le centre de contrôle `docs/mobile-generation/` (`STATUS`/`ROADMAP`/`DECISIONS`/`CHANGELOG`) vit sur la branche de chantier `fix/xss-jsonld` et y a reçu l'intégralité de la campagne `D-104`→`D-134` ; `main` (`4e56538`) porte le cutover monorepo et la production, mais **aucune convergence documentaire n'a été instruite dans un sens ni dans l'autre**. Conséquence : `main` ne permet pas de reconstituer l'état réel du chantier, et une reprise partant de `main` planifierait sur une documentation muette. **Aucune mesure du delta n'a été faite** — ni liste de fichiers divergents, ni sens de convergence arbitré. Consigné ICI parce que l'unique trace antérieure était conversationnelle : une réinitialisation de contexte la détruisait. **Ne pas traiter la convergence sans arbitrage : elle touche `main`.** | Reprise 2026-09-04 (audit de checkpoint) | 🟠 moyenne (aucune régression de code ; risque de perte de continuité documentaire) | **non datée** — arbitrage propriétaire requis (sens de convergence, périmètre, moment) | 🔴 **OUVERTE** |

**Règle de tenue** (recommandation acceptée) : toute dette découverte est
inscrite ici **immédiatement**, avec origine, gravité et **phase
d'échéance** ; le bloc PROGRESSION GLOBALE rappelle le nombre de dettes
ouvertes à chaque rapport.

## RISQUES SUIVIS

| Risque | Niveau | Mitigation |
|---|---|---|
| Aucune infra de calcul long dans le dépôt actuel (mesuré) | ⚠️ structurel | Phases 1 et 7 dédiées ; rien ne se construit en serverless Vercel |
| Review stores (délais, rejets) dans la boucle produit | ⚠️ externe | Policy Gate + preview séparé de la prod ; deadlines suivies au Fleet |
| Coûts unitaires inconnus (LLM/sandbox/EAS/Supabase) | ⚠️ | Instrumentation dès Phase 1 ; Budget Governor |
| Slices dérivant en construction manuelle du produit | ⚠️ méthode | Garde-fou Phase 8 : tout contournement manuel = dette consignée |
| Refus classifieur `cyber` sur prompts de forme moteur — **existence [mesuré]** (7/10, n=10), **taux réel [à mesurer]** | ⚠️ suivi | **D-015 actée** : résilience structurelle (refusal géré partout, zéro panne silencieuse, fallbacks, métrique Budget Governor) ; mesure de fréquence sur corpus représentatif planifiée dans les campagnes aval |
| ~~Upgrade SDK Anthropic : ruptures d'API possibles~~ | 🟢 clos | Re-baseline exécuté le 2026-08-27 : aucune rupture, parité prouvée |

## PROTOCOLE DE PREUVE ELITE 2027 A+ — CADRE D'EXÉCUTION (D-046, 2026-08-30)

**Le protocole de preuve est désormais le cadre d'exécution permanent du
chantier.** Source de vérité unique : `docs/elite-protocol/` (point d'entrée
`README.md`). La `ROADMAP.md` porte trois chapitres opposables :

| Chapitre ROADMAP | Rôle |
|---|---|
| § **CADRE D'EXÉCUTION PERMANENT** | source de vérité · distinction A+/A++ · niveau de preuve exigé pour toute transition · état figé · rapport de continuité (13 champs) · gouvernance · boucle générale · procédure de reprise |
| § **EXIGENCES OPÉRATIONNELLES PERMANENTES E-01 → E-20** | règles opposables issues de la confrontation du 2026-08-30 |
| § **PLAN DE REMISE À NIVEAU RN-01 → RN-23 · S-1 → S-10** | **point de reprise opérationnel** — étages, conditions de transition, points de contrôle 🛑, journal d'exécution |

> ⚠️ **Une nouvelle session lit le JOURNAL D'EXÉCUTION du plan de remise à
> niveau** pour savoir exactement où reprendre. La mémoire de conversation ne
> fait jamais foi.

### État figé au 2026-08-30 — à ne présenter comme résolu sous aucune forme

```
PHASE 10 : OUVERTE            VALIDATION PHYSIQUE : SUSPENDUE
EXP-1 : TERMINÉE              EXP-2 : NON LANCÉE
H0 : INDÉTERMINÉ    H1/H2 : OUVERTS    H3 : EXCLU
R-25 : CONDITION D'EXPLOITABILITÉ ÉTABLIE — CAUSE NON IDENTIFIÉE
PROTOCOL-D020 : ÉTABLI POUR CETTE MÉTRIQUE UNIQUEMENT
FINAL TECHNICAL AGREEMENT : NO
```

`FINAL TECHNICAL AGREEMENT : YES` a été prononcé le 2026-08-30 **pour
l'implantation et l'exécution du plan de remise à niveau uniquement** — jamais
pour une certification du protocole ou du produit.

### Mesures structurelles versées le 2026-08-30

| Mesure | Résultat |
|---|---|
| gates dont la sémantique est reliée au runtime | **0 / 25** |
| gates énonçant une propriété observable sur artefact | **9 / 25** (3 exécutées) |
| gates non observables en l'état | **8 / 25** |
| gates ayant réellement refusé un artefact | **1 / 25** (G14) |
| cas-tueurs exécutés | **17** · 9 échecs · concentrés sur 4 proxys |
| écarts du corpus retirables par soustraction déclarative | **30,8 %** (200 / 649) |
| déclencheurs `data` référençant un événement non productible | **15 / 36**, sur 10 documents / 13 |
| sites de dispatch morts | **53 / 108 (49 %)** |

### Étage 0 du plan — exécuté le 2026-08-30

`RN-02` 🟢 · `RN-03` 🟢 · `RN-05` 🟢 · `RN-06` 🟢 (S-1→S-4) — *🛑 arrêt au point
de contrôle `C-0` : `RN-01` (granularité) est un arbitrage humain.*

🔵 **RECTIFIÉ LE 2026-09-01** — `RN-04` 🟢 (`2f00c00`, 88 fichiers) · `RN-16` 🟢
(arbre propre) · **`RN-01` et `C-0` CLOS PAR CADUCITÉ** (`D-108`). L'étage 0 est
**intégralement clos**. La règle `R-GRAN` n'a jamais été écrite : caduc n'est pas
résolu.

## RÈGLE DE CONTINUITÉ

Inscrite en règle permanente dans `CLAUDE.md` (2026-08-27). Toute session
sur ce chantier commence par `MASTER_PLAN.md`, `ARCHITECTURE.md`,
`ROADMAP.md`, `STATUS.md` (et `DECISIONS.md` si nécessaire). La mémoire de
conversation n'est jamais la source de vérité.

## ÉTAT A++ — PHASE 8 (2026-08-29, D-039/D-039-R1/D-039-R2)

| Dim. | État à la source | Reste à faire |
|---|---|---|
| **A** ergonomie | 🟢 `size.tapTarget=48` (≥ 44 pt iOS, ≥ 48 dp Material), 3 surfaces | revalidation appareil |
| **B** contraste | 🟢 **30 paires / 0 échec** (était 2), accent `#FA5D1E` préservé | revalidation appareil |
| **C** états | 🟢 loading/empty/error au registre | — |
| **D** cohérence | 🟢 0 couleur en dur hors thème généré | — |
| **E** typographie | 🟢 **instrument construit** (5 contrôles : échelle stricte, `allowFontScaling` jamais désactivé, aucune hauteur fixe, aucun `numberOfLines`, aucun `lineHeight` fixe) | observation rendu appareil |
| **F** i18n/RTL | 🟢 propriétés logiques, flows RTL PASS | rejeu |
| **G** virtualisation | 🟠 cause supprimée + verrou mécanique | **observation exécution requise** |
| **H** anti-template | ⚪ portée **Phase 10** (2 domaines requis) | — |

**Preuves 2026-08-29** : 409 tests verts (tous paquets), `tsc` silencieux, lint 0.
Nouveau `rootHash` `resto-quartier` = `e7d98c81b6d5288f…`, **stable sur 5 compilations**.
Évolutions scellées : tokens **1.1.0** (surface additive prouvée : 0 clé supprimée,
0 type modifié, 1 ajoutée) · `designTokensSourcesHash` et `blocksSourcesHash` re-scellés.
**Phase 8 NON CLÔTURABLE** : G non observée, A/B/E/F à revalider par la cascade.

## PHASE 9 — REPAIR LOOP + CODE SLOTS (2026-08-29, D-040)

**Critères de sortie de la ROADMAP — état vérifié**

| Critère | État | Preuve exécutée |
|---|---|---|
| Panne provoquée sur le slice 1 diagnostiquée et réparée **automatiquement** | 🟢 | `slices/restaurant/run-repair.mjs` : bouton « Mes commandes » repointé sur une action inexistante → Oracle refuse → diagnostic `AIR_ACTION_DANGLING` (cause RE-DÉRIVÉE de l'AIR, correction candidate DÉDUITE du déclencheur ui) → réparé en **1 tentative / 120 jetons** → **AIR réparé byte-identique au document gelé** |
| **Analyse d'impact** | 🟢 | Impact calculé sur deux simulations : réparation AIR = artefact absent avant / 31 fichiers après ; réparation slots = **+6 fichiers exactement** (5 modules + registre), 0 supprimé, rootHash `d0349455…` → `748647917c1b…` |
| **Vérification Oracle** | 🟢 | Oracle L1 **6/6** sur l'état réparé (2 contrôles ajoutés en Phase 9 : politique AST des slots, intégrité des copies) |
| Gardes AST **mordent** (preuve par mutation) | 🟢 | 3 mutations exécutées : slot exfiltrant (`SLOT_NETWORK_ACCESS`), édition d'une copie de bloc (`PATCH_BLOCK_COPY_EDIT`), modification d'AIR hors cible (`PATCH_AIR_OUT_OF_TARGET`). **Aucune n'atteint l'étage APPLY** |
| **Budget respecté** | 🟢 | Auteur inefficace : arrêt propre à **3 tentatives / 900 jetons**, `budget_exhausted`, **aucun état livré** ; la borne de jetons mord aussi seule (test dédié) |
| **Juge ≠ auteur** | 🟢 | Invariant vérifié au démarrage (`REPAIR_JUDGE_IS_AUTHOR`) + cliquet d'indépendance : le cœur n'importe ni l'Oracle, ni le compilateur, ni un SDK LLM |
| Amendement A++ (D-039) : grille **rejouée**, réparation dégradante **refusée** | 🟢 | Grille rejouée avant/après : **aucune régression**. Refus prouvé par test (réparation fonctionnelle dégradant G → REFUSÉE, aucun état livré) |

**Livrables** : `@deribfy/slots` (politique AST par API TypeScript — 27 tests,
dont la preuve discriminante « commentaire/chaîne acceptés, alias `const f =
fetch` refusé ») · `@deribfy/repair` (boucle 9 étages, Budget Governor,
gates, rollback — 26 tests) · compilateur : émission `slots/*.ts` + registre
typé, **additivité stricte prouvée 12/12** · Oracle : 2 contrôles + grille A++
instrumentée (`evaluateApxxGrid`, `apxxRegressions`).

**Preuves de non-régression (2026-08-29)** : **486 tests verts** sur les 13
paquets (0 échec), `packages:typecheck` **EXIT=0**, `packages:lint`
**EXIT=0**, artefact réparé **déterministe 5/5**.

**Écart de traçabilité constaté** : le `rootHash` `e7d98c81b6d5288f…`
consigné dans le bloc « ÉTAT A++ — PHASE 8 » **ne se reproduit pas** sur
l'arbre de travail actuel. Valeur mesurée aujourd'hui pour `resto-quartier` :
**`d0349455d51e9894…`** sans slots, **`748647917c1b6319…`** avec les 5 slots.
Contre-épreuve exécutée : substituer l'ancien `ScreenShell` ne redonne pas
non plus `e7d98c81…` (`8075bb6f…`) — l'origine de l'écart est 🟠 **NON
DÉTERMINÉE** et n'est pas imputable à la Phase 9, dont l'additivité est
prouvée. À trancher lors de la reprise du chantier Phase 8/10.

## PHASE 10 — VERTICAL SLICE 2 + DESIGN SYSTEM v2 (2026-08-29, D-041/D-042/D-043)

**Domaine (D-042)** : suivi de conteneurs maritimes — logistique B2B,
hors-template. AIR émis par le modèle avec le **protocole D-025 vérifié
mécaniquement** (le harnais refuse de démarrer si le prompt de référence
diverge ; seule la règle `design.overrides` a été substituée, texte exact
contrôlé avant remplacement). Écrit dans `slices/conteneurs/` — **le corpus
gelé n'est pas étendu**.

| Critère de sortie ROADMAP | État | Preuve exécutée |
|---|---|---|
| **Abstraction provider exercée** | 🟢 **SATISFAIT** | `@deribfy/provider-registry` · flux `runProvisioning` provider-agnostique **réellement utilisé par les 2 slices** · `MockProvisioningProvider` · cliquet d'agnosticité |
| **Substitution sans changement d'AIR** | 🟢 **SATISFAIT** | Même document, même `airHash`, **artefact identique octet pour octet** ; seul le lock change |
| **Scorecard cross-domain à 2 domaines** | 🟢 **SATISFAIT** | `slices/SCORECARD-CROSS-DOMAIN.md`, **régénéré depuis les artefacts** |
| **Capabilities manquantes → registre v2** | 🟢 **SATISFAIT** | Domaine hors-template : **toutes les capabilities demandées existaient au registre v1** ; manque confirmé pour v2 = backend de données (P-008) |
| **Dimension H sur les 2 domaines** | 🟢 **SATISFAIT ET CONFORME** | **2 silhouettes distinctes, 0 collision · 2 identités visuelles pour 2 thèmes déclarés** |
| **Dettes A++ réexaminées → design system v2** | 🟢 **SATISFAIT** | `DESIGN-SYSTEM-V2.md` ; **P-007 tranchée (D-043)** et les 5 dettes traitées |
| **Conformité A++ (règle D-039-R1)** | 🔴 **RECTIFIÉ LE 2026-09-04 — NON SATISFAIT pour A et G** *(énoncé initial conservé : « 🟢 SATISFAIT — A à H CONFORMES sur les DEUX slices — vérifié sur les artefacts, pas déduit du code »)* | La mention « pas déduit du code » est **inexacte pour A et G** : `apxx-grid.ts` les évalue par analyse **statique** du code émis, alors que la grille exige pour **A** une « géométrie mesurée sur appareil réel » et pour **G** une « mesure sur appareil ». **Aucune mesure appareil n'a été prise** ⇒ par la règle de notation de `D-039`, **A et G sont NON DÉTERMINÉES**, jamais conformes par défaut. **B/C/D/E/F/H restent SATISFAITES.** Détail, falsification et arbitrage : **`DECISIONS.md` `D-135`** (2026-09-04) ; rectification du bloc `ÉTAT GLOBAL` › « Phase actuelle ». Cohérent avec `DET-006` et `DET-016`. |
| **App fonctionnelle sur appareils physiques** | 🔴 **BLOQUÉ — intervention propriétaire** | Slice 2 : toute la chaîne logicielle est verte ; l'**installation sur appareil** exige l'appareil du propriétaire. *(Rectifié le 2026-09-04 : « le build EAS … exige le compte » est périmé — le compte Expo/EAS est acquis et opérationnel et 2 builds ont abouti (`D-133`) ; **mais ces 2 artefacts portent l'app-fixture `bus-intercites` du chantier `validation-appareil`, PAS le slice 2 `conteneurs`**, qui reste sans aucun artefact appareil. Le critère demeure 🔴.)* |

### CHAÎNE DU SLICE 2 — MESURES

gates 🟢 · compile 🟢 (29 fichiers, `rootHash` `7555bc357d294b6e…` après DET-025,
**déterminisme 5/5**) · backend **RÉEL** 🟢 (3 tables, **RLS 3/3**, seed
12/6, **démonté avec preuve d'absence**) · sandbox §8 🟢 (`npm ci`, `tsc`
strict, bundle : **exit 0**) · **Oracle L1 7/7** · flows E2E générés ·
**0 réparation, 0 contournement manuel**.

**Slice 1 REJOUÉ intégralement** avec le moteur d'aujourd'hui : backend réel
3 tables / RLS 3/3 / seed 24, sandbox 🟢, **Oracle 7/7** — non-régression du
domaine initial après la v2.

### DESIGN SYSTEM v2 (D-043) — CE QUI A CHANGÉ

Tokens **1.1.0 → 1.2.0** (mineure additive, cliquet de surface de majeure
vert) : `fontWeight`, `space.xxs`, `opacity.disabled` ajoutés — chacun avec
un consommateur réel ; `color.light.warn` corrigé (4,34:1 → 4,55:1, défaut
révélé en élargissant les paires) ; **deux tokens DÉRIVÉS** (`primaryText`
et `onPrimary`) qui garantissent WCAG AA **pour n'importe quel accent** ;
`design.overrides` — champ du schéma AIR **gelé**, jusque-là jamais lu —
rendu effectif avec allowlist, validation et re-dérivation.

**Défaut de générateur trouvé par le slice 2 et corrigé** : le seed insérait
les tables dans l'ordre alphabétique, violant une clé étrangère
(`23503`). Corrigé par un tri **topologique déterministe** ; prouvé par test
unitaire, par un contrôle sur les 12 documents du corpus, ET par le backend
PostgreSQL réel.

**Oracle L1 gagne un 7e contrôle** : `contraste_wcag`, calculé sur le thème
réellement émis de chaque app (§22 : accessibilité = conformité).

### VÉRIFICATIONS (2026-08-29, après v2)

**550 tests verts** sur 14 paquets · `typecheck` **EXIT=0** · `lint`
**EXIT=0** · déterminisme **5/5** sur les 2 slices · **corpus gelé intact**
(0 fichier modifié) · démonstration de la Phase 9 rejouée sans régression
(3 gardes mordent, budget borné, grille non dégradée).

### PASSE NON PHYSIQUE DU 2026-08-29 (après validation A17)

Tout ce qui pouvait être terminé sans appareil l'a été :

- **DET-025 corrigée à la source** — `Section` applique enfin `fill` (le
  contrat et les styles l'avaient depuis DET-006, le câblage manquait).
  3 preuves structurelles + verrou sur l'artefact émis vérifiant les DEUX
  moitiés de la chaîne. **Preuve d'exécution Android obtenue par le
  propriétaire** ; preuve iOS et rattachement formel de l'artefact : à faire.
- **Instrument de cohérence de composition PRODUIT et EXÉCUTÉ**
  (`benchmarks/composition/`, résultats versionnés) — l'outillage manquait,
  D-039-R1 impose de le produire dans la phase. Mesure sur **13 documents /
  50 écrans** : **19** états vides dupliqués · **4** actions exposées deux
  fois · **17 écrans (34 %) sans chemin de navigation**.
- **DET-017 volet 2 chiffré** : la cause commune est établie — le schéma AIR
  1.0.0 gelé ne porte aucun moyen de conditionner un bloc. Ce n'est pas une
  erreur de document : c'est une limite de contrat, présente sur les
  12 domaines du corpus ET sur le domaine hors-template.
- **DET-024 RECTIFIÉE** : ma fiche affirmait à tort que le slice 1 n'était
  pas concerné. Mesure : `scr_plat_detail` y est inatteignable lui aussi.
- **P-009 consignée** : décision propriétaire requise (conditionnement des
  blocs + accessibilité du graphe), avec options, analyse et recommandation.
- Cascade rejouée : **550 tests verts**, `typecheck` 0, `lint` 0, corpus gelé
  intact, **aucun slice régénéré** (liaison EAS du slice 2 préservée).

### CE QUI RESTE — ACTION MANUELLE DU PROPRIÉTAIRE

**Validation du slice 2 sur appareil physique.** Le projet est écrit et prêt
(`slices/conteneurs/app`, 29 fichiers). Il faut : (1) un build EAS — le CLI
`eas` n'est pas installé dans cet environnement et un build consomme le
quota du compte ; (2) l'installation par QR sur le Galaxy A17 et/ou
l'iPhone 16, sans automatisation possible (DET-012).
**La Phase 10 ne sera close qu'après cette preuve.**

## ÉTAPE 1 — CONTRAT D'EXÉCUTION (2026-08-29, D-045)

**Nature de l'étape.** Ce n'est **pas** une phase de la ROADMAP : la ROADMAP
n'est PAS modifiée par cette session. C'est un étage transverse, approuvé
explicitement par le propriétaire, qui referme l'unique chemin **fail-open**
du moteur — le dispatcher d'effets, qui ignorait silencieusement 3 des
4 types d'effets. **Aucune capacité d'exécution n'est construite ici.**

### Ce qui change réellement

**Avant** : un artefact dont 86 % des actions sont inertes, dont 2 écrans sur
4 sont inatteignables et dont le formulaire ne persiste rien passait
**Oracle L1 7/7 · grille A++ A→H conformes · 0 réparation · 0 contournement**.
> 🔴 *Rectifié le 2026-08-30 (D-048) : la conformité A→H incluait la dimension **C**, depuis requalifiée `non_conforme`. Le constat historique est conservé ; la conclusion « A++ conforme » ne l'est plus.* > 🔴 *Complété le 2026-09-04 : la même conformité « A→H » incluait **A** et **G**, depuis déclarées **NON DÉTERMINÉES** — l'instrument les mesure statiquement alors que la grille exige une mesure sur appareil, jamais prise. Voir la rectification du bloc `ÉTAT GLOBAL`.*

**Après** : le même artefact passe toujours — mais l'Oracle porte désormais un
8e contrôle qui **nomme, impute et scelle** l'écart. L'absence cesse d'être
invisible.

### Mesure d'ouverture (13 documents, enveloppe 1.0.0)

| Mesure | Valeur |
|---|---|
| effets déclarés **exécutés** | **27 / 196 — 14 %** |
| écrans **atteignables** | 27 / 51 — 53 % |
| contrôles visibles **non fantômes** | 38 / 111 — 34 % |
| blocs liés à une entité **pourvue de données** | 49 / 67 — 73 % |
| états de blocs **atteignables** | 90 / 140 — 64 % |
| capabilities **câblées** | **0 / 78** |
| slots **invoqués** | **0 / 48** |
| règles **appliquées** | **0 / 74** |
| **écarts totaux** | **649** — moteur 535 · contrat 72 · document 42 |

**Lecture non triviale** : **82 % des écarts sont imputables au MOTEUR**, 11 %
au CONTRAT, 6 % aux DOCUMENTS. Cela **réfute** l'hypothèse selon laquelle les
documents seraient mal spécifiés — ils décrivent des applications légitimes
que le moteur ne sait pas réaliser.

### Livrables

- **`@deribfy/execution-contract`** — enveloppe · graphe · réconciliation.
  Paquet PUR : aucun fs/réseau/horloge/aléa, aucune dépendance à un
  producteur ni à un juge (cliquet d'agnosticité + pureté).
- **Cliquet de véracité** (16 contrôles) : l'enveloppe est confrontée au CODE
  RÉEL du moteur — elle ne peut pas mentir ni dériver en silence.
- **Cliquets de généralité I5/I6** : amplitude (0 à 12 entités, 1 à 15 écrans,
  auto-référence, `many_to_many`) et invariance au renommage.
- **Oracle L1 : 7 → 8 contrôles** (`contrat_execution`), cliquet de surface
  édité consciemment.
- **`benchmarks/execution-contract/`** — instrument qui produit la
  **spécification de l'AIR 2.0 depuis la mesure**, pas depuis l'intuition.

### Preuves exécutées

**636 tests verts** sur 15 paquets · `typecheck` **EXIT=0** · `lint`
**EXIT=0** · **12/12 `rootHash` du corpus INCHANGÉS** · `rootHash` du slice 2
**INCHANGÉ** · corpus gelé **byte-identique** · zones gelées (schéma AIR,
registres, runtime copié) **non touchées**.

### Découverte consignée

**DET-026** — `rtlSupported` est inerte : 0 fichier différent entre `true` et
`false`. Non-négociable #16 non tenu côté artefact.

### Ce qui reste INTERDIT à ce stade

- ❌ Durcir l'Oracle en mode `strict` — change un critère de sortie, exige une
  décision consignée.
- ❌ Toute évolution de l'AIR (2.0) — la spécification est **mesurée**, elle
  n'est pas **arbitrée**.
- ❌ Toute construction d'exécution (mutations, persistance, capabilities,
  slots) — chacune exige sa propre validation (D-017).
- ❌ Toute validation appareil se réclamant du mot « fonctionnelle ».

---

# ÉTAT AU 2026-09-01 — CHANTIER P5 → P9 : FIDÉLITÉ ET COUVERTURE DES ORACLES

> **Point d'entrée pour une nouvelle session.** Ce bloc consigne un chantier
> conduit sur cinq générations API réelles et une quinzaine de passes d'audit
> hors ligne. Les 19 décisions correspondantes sont **D-087 à D-105** dans
> `DECISIONS.md`. Les artefacts payés sont dans `docs/elite-protocol/evidence/`.

## Ce qui a été démontré

🟢 **Le générateur CONSTRUIT au lieu de renoncer.** C'était le `NON DÉMONTRÉ`
central du chantier ; il est levé sur données réelles. Mesuré sur P8
(`coach-fitness`) : `imageFieldId` **0 → 5**, recherche câblée sur la bonne entité,
**0** promesse `test_besoin_non_rendable_*` (contre 3), 1 seul besoin inexprimable
et légitime (achat intégré), **0 image orpheline**.

🟢 **Le pipeline ne peut plus réparer par amputation.** 17 classes de contournement
refusées, 3 contrôles positifs verts — suppression, dénaturation, déplacement,
fusion, éclatement, inversion de relation, changement de version, motif hors sujet.

🟢 **L'oracle et le runtime convergent** : 396 contrôles, **0 mensonge**.

🟢 **F5 est fermé par construction** — la duplication de source est supprimée, pas
surveillée. L'invariant *atteignable ⊆ rendable* est tenu sur les 6 blocs.

## Ce qui reste NON DÉMONTRÉ

🟢 **LEVÉ LE 2026-09-01 PAR P10 (`D-109`).** *Énoncé d'origine, conservé :* « 🔴
Aucune génération n'a encore produit un `coach-fitness` valide. P8 a réussi mais
portait deux défauts alors invisibles ; P9 les a **évités tous les deux** et s'est
arrêtée sur une **erreur 529 d'infrastructure** pendant la réparation. »
**RÉFUTÉ PAR MESURE** : P10 a produit un `coach-fitness` **`valid=true`**, 27
diagnostics réparés à 0, 0 amputation, 0 mutation hors périmètre.
🔴 Archétype Réservation · rendu physique sur appareil · largeur des cartes.
🔴 Phase 10B reste **OUVERTE** : F1/F4/F5 sont désormais câblés en CI, mais les
gates de fidélité restent rouges sur des défauts RÉELS du corpus.

## Les six générations réelles — coût total 17,1900 $

| | document | issue | coût |
|---|---|---|---|
| — | resto-quartier · plombier-urgence ×2 | valides | 5,4113 $ |
| **P5** | plombier-urgence | rejetée par un garde **trop strict** → D-093 | 2,4799 $ |
| **P6** | plombier-urgence | `valid=true`, révèle D-099 | 2,7396 $ |
| **P8** | coach-fitness | `valid=true`, révèle D-104 et D-105 | 2,4805 $ |
| **P9** | coach-fitness | **529 Overloaded** pendant la réparation | 1,7718 $ |
| **P10** | coach-fitness | 🟢 **`valid=true`** — 27 diagnostics → 0, 0 amputation | 2,3069 $ |

**Trois générations sur cinq ont révélé un défaut de nos propres instruments.**
C'est ce constat qui a fondé le **harnais d'invariants** (`gate:invariants`, 7ᵉ gate
bloquante) : il a été démontré que le défaut de P6 était détectable **gratuitement**,
sur des documents déjà présents au dépôt.

## État P9 — à ne PAS présenter comme une génération validée

```
1,7718 $ · 7 appels · 431 s · erreur 529 "Overloaded" PENDANT la réparation
28 diagnostics en 1re passe · réparation JAMAIS terminée
document initial conservé (evidence/p9/) · corpus NON modifié
B-bis : actions ui sur bloc sans affordance   P8 : 3 → P9 : 0
B-ter : incohérences prop ↔ déclencheur       P8 : 4 → P9 : 0
```

**Mesure partielle mais concluante sur son objet** : les deux défauts de P8 ont
disparu du document que le modèle a écrit seul. Ce qui manque est la fin mécanique.

## État P10 — GÉNÉRATION VALIDÉE (`D-109`)

```
2,3069 $ · 10 appels · 443 s · refus 0 · runId 2026-09-01T15-15-53-015Z
issue = terminee   valid = TRUE
27 diagnostics en 1re passe → 0 après réparation
  23 × AIR_TEST_TARGET_UNKNOWN · 4 × BLOCK_PROPS_INVALID
sections réémises : cablage, actions, ecrans
amputations hors périmètre : 0     mutations hors périmètre : 0
structure attempt1 → attempt2 : 5 / 8 / 14 / 35 / 29  IDENTIQUE
airHash 968517ceb935251e8b1b50a8a94f0bea13cb4636751867f05f6e975f2522716e
```

**C'est la fin mécanique qui manquait à P9.** Le générateur produit un
`coach-fitness` fidèle, et la réparation aboutit sans rien retirer.

**Artefacts CONSERVÉS**, nommés par `runId` (`D-107`), chaîne de garde vérifiée —
`hashCanonical(attempt2)` = `hashCanonical(corpus)` = `journal.airHash` :

| artefact | SHA-256 |
|---|---|
| `campagne-v2-2026-09-01T15-15-53-015Z.jsonl` | `16d32694e78fced3…` |
| `coach-fitness.…attempt1.air.json` | `4caee4d8a3f5522e…` |
| `coach-fitness.…attempt2.air.json` | `0464fdcb90d7b101…` |

**Écart ENTRE générations, rapporté sans être qualifié** — P8 → P10 : actions
24 → 14, promesses 42 → 35, blocs 32 → 29 ; entités et écrans identiques. `D-088`
déclare cette comparaison **mal fondée** : le modèle a le droit de remodeler, et le
verdict d'amputation ne vaut qu'**au sein d'une même exécution**, où il est de **0**.

🟠 **P10 NE VALIDE PAS `PB#2` EN CONDITIONS RÉELLES** — et ne doit jamais être
présentée ainsi. Aucune erreur technique n'est survenue : `erreurTechnique`,
`assemblagePartiel` et `reparationPartielle` sont **tous `undefined`** au journal.
Le chemin de conservation **n'a pas été emprunté**. Ce que P10 démontre de `D-107` :
le **nommage par `runId`** fonctionne en production — 3 artefacts, 0 collision `wx`,
provenance relisible depuis le nom seul.

🔵 **Observation — dégradation de schéma au premier appel.** `[coach-fitness:base]
niveau "sans-bornes-numeriques" refusé — dégradation : 400 output_config.format.schema:
For 'array' type, 'minItems'…`. L'échelle `makeLevels` (`emit-v3.mjs` l.179) a joué
son rôle ; la génération a abouti. **Comportement de dégradation PRÉVU, non démontré
comme une anomalie de P10.** Aucune correction entreprise.

## Vérifications au 2026-09-01

```
AU TERME DU CHANTIER P5 → P9
842 tests · 0 échec     typecheck EXIT=0     lint EXIT=0
7 gates : controles 🟢 · navigation 🟢 · composition 🟢
          app-compile 🔴 25/26 · app-rendu 🔴 · fidelite 🔴 · invariants 🔴
rejeux des générations payées : P5 4/4 · P6 6/6
corpus v2 GELÉ : 0 fichier modifié
plafonds INCHANGÉS : ORPHELINES 38 · BOUTONS_NAV 121 · FANTÔMES 180

APRÈS D-106 / D-107 — 2026-09-01, AUCUN APPEL API
865 tests · 0 échec     typecheck EXIT=0     lint EXIT=0     (842 + 23 cas-tueurs)
7 gates RÉEXÉCUTÉES : controles 🟢 · navigation 🟢 · composition 🟢
          app-compile 🔴 25/26 · app-rendu 🔴 25≠26 · fidelite 🔴 · invariants 🔴
          → statuts et motifs IDENTIQUES à l'avant-correction : aucune régression
corpus v2 GELÉ : empreinte 85612b1f… INCHANGÉE
preuves P5→P9 (evidence/p5,p6,p8,p9) : empreinte fd97d3d4… INTACTE

APRÈS P10 — 2026-09-01, génération réelle 2,3069 $
865 tests · 0 échec     typecheck EXIT=0     lint EXIT=0
7 gates : controles 🟢 · navigation 🟢 · composition 🟢
          app-compile 🟢 26/26 · app-rendu 🟢 · invariants 🟢 0 désaccord
          fidelite 🔴 F1=12 · F4=21 · 15 motifs réfutés  ← AUCUN sur coach-fitness
          → 6 gates sur 7 au VERT     ⚠ VOIR RECTIFICATION CI-DESSOUS
images ORPHELINES 35 / plafond 38 · boutons nav 106 / plafond 121 · doublons 0
plafonds INCHANGÉS · aucune gate modifiée · aucun corpus historique touché
corpus v2 GELÉ : empreinte 85612b1f… INCHANGÉE
corpus v3 : coach-fitness.air.json réécrit (version P8 récupérable en afd5954)

⚠ RECTIFIÉ — le bloc ci-dessus est CONSERVÉ, il était sincère mais FAUX sur un point.
  « controles 🟢 » et « 6 gates sur 7 » ont été mesurés sur une compilation PÉRIMÉE
  à 25 applications : `gate:controles` lit la sortie de `gate:app-compile`, et les
  gates avaient été lancées dans le mauvais ordre. L'état réel après P10 était
  **5 gates sur 7** — `controles` était ROUGE à 183/180, `v3-coach-fitness` entrant
  au recensement pour la première fois (+7). Le cliquet avait donc raison.

AU 2026-09-01 (4) — APRÈS R2, CORRECTION DE L'INSTRUMENT ET FORM_SANS_ACTION
883 tests · 0 échec · 74 fichiers · 17 paquets     typecheck EXIT=0     lint EXIT=0
7 gates, RELANCÉES DANS LE BON ORDRE (app-compile en premier) :
          app-compile 🟢 26/26 · app-rendu 🟢 · controles 🟢 · navigation 🟢
          composition 🟢 · invariants 🟢 · fidelite 🔴 F1=12 · F4=21 · 15 motifs
          → 6 gates sur 7 au VERT — cette fois mesuré, pas hérité
contrôles fantômes : 1155/1310 agissants · 155 / plafond 180 (marge = amortisseur, D-110)
plafonds INCHANGÉS : FANTÔMES 180 · ORPHELINES 38
registre de blocs : 0 fichier modifié     schéma AIR : 0 fichier modifié
corpus v2 GELÉ : empreinte 85612b1f… INCHANGÉE

AU 2026-09-01 (5) — APRÈS D-113, D-114, D-115 · AUCUN APPEL API
919 tests · 0 échec · 76 fichiers     typecheck EXIT=0     lint EXIT=0
7 gates : app-compile 🟢 26/26 · app-rendu 🟢 · controles 🟢 · navigation 🟢
          composition 🟢 · invariants 🟢 · fidelite 🔴 → 6 sur 7
plafonds INCHANGÉS · MAX_TOKENS = 16000 inchangé · 0 règle de prompt modifiée
corpus v2, registre de blocs, schéma AIR, primitives : 0 fichier modifié
commits : 12ce5c0 · ed1c000 · 499189a · f84c2b4
```

🔵 **RECTIFIÉ LE 2026-09-01 par mesure — l'énoncé précédent était FAUX pour une gate
sur quatre.** Il affirmait : *« Les quatre gates rouges portent sur le seul document
`coach-fitness` »*. Les gates ont été réexécutées et lues :

| Gate rouge | Portée RÉELLE | Conforme à l'énoncé ? |
|---|---|---|
| `app-compile` | **`v3-coach-fitness` seul** — résolution refusée (fail-closed), 25/26 | 🟢 oui |
| `app-rendu` | **conséquence directe** de la précédente : 25 applications au lieu de 26 | 🟢 oui |
| `invariants` | **3 désaccords, tous sur `v3/coach-fitness`** (`C2`, `detail_header`) | 🟢 oui |
| `fidelite` | 🔴 **NON** — `F1` sur **13 documents**, `F4` sur **22**, dont **les 12 documents du corpus v2 gelé**, qui n'ont aucune intention (`1.0.0`) | 🔴 **non** |

Les défauts sont **détectés**, ce qui est le comportement attendu ; mais leur
**portée** n'est pas celle qui était écrite. La `ROADMAP` disait déjà juste
(*« F1 sur 13 documents, F4 sur 22 »*) : c'est `STATUS.md` qui divergeait.

## 🟠 PROBLÈMES CONNUS — état au 2026-09-01

**1. 🟢 CORRIGÉ le 2026-09-01 (`D-107`) — `issueGeneration` classait une erreur 529
comme `"terminee"`.** *Constat d'origine, conservé :* il ne connaissait que trois
états et l'erreur technique retombait sur le plus favorable ; un journal pouvait
affirmer qu'une génération s'était terminée alors qu'elle avait échoué.
**Correction** : quatrième issue **`echec-technique`**, et `erreurTechnique` est un
paramètre **REQUIS** — aucun appelant ne peut plus hériter du silence. **Vu échouer** :
l'état retiré, 3 cas-tueurs tombent.

**2. 🟢 CORRIGÉ le 2026-09-01 (`D-107`) — la conservation ne couvrait que l'émission
initiale.** *Constat d'origine, conservé :* le 529 de P9 a frappé pendant la
**réparation**, et les sections déjà réparées et **payées** ont été perdues.
**Correction** : `packages/repair/src/preservation.ts` — `avecPreservation`,
symétrique de l'émission ; le harnais n'appelle plus jamais `repairSections` nu, et
un cliquet lit le **source réel** de `emit-v3.mjs` pour l'imposer.

> 🟠 **NIVEAU DE PREUVE, à ne pas surélever.** La correction est démontrée **par
> cas-tueurs et falsification**, jamais en conditions réelles. **P10 n'a PAS
> déclenché ce chemin** — aucun `529` n'est survenu, `erreurTechnique`,
> `assemblagePartiel` et `reparationPartielle` sont `undefined` au journal. Ne
> jamais écrire que `PB#2` est validé « en conditions réelles ». Ce que P10
> démontre en production : le nommage par `runId` et l'écriture `wx`.

> 🔵 **Le sous-constat sur le reliquat était PÉRIMÉ à l'heure où il a été écrit.**
> `results/coach-fitness.attempt2.air.json` n'est **plus en place** : il a été
> supprimé par le commit `9f88792` lui-même (4 fichiers, 12 891 suppressions).
> **Cause traitée à la source** : les artefacts portaient un nom FIXE, réécrit à
> chaque campagne. Ils portent désormais leur `runId` (`nomArtefact`), se relisent
> sans journal (`provenanceDuNom`), et s'écrivent en `wx` — aucun artefact ne peut
> plus en écraser un autre, ni être pris pour celui d'une autre génération.

**🟠 Restent à arbitrer, non corrigés :** les points 3 et 4 ci-dessous.

**3. `empty_state` échoue silencieusement** quand sa prop `actionId` manque, là où
`button` jette. Divergence de robustesse du runtime.

**4. Classification lexicale** — 6 faux négatifs adversariaux sur 8 subsistent
(périphrases, synonymes). **Ils n'ouvrent aucune suppression** : la protection
D-098b est structurelle et ne dépend pas du classifieur.

# CHANTIER SECTORIEL — COMPOSITION PAR SECTEUR (ouvert le 2026-09-01)

> Objectif : passer de « le modèle propose » à **« le modèle propose → le système
> contraint → les invariants vérifient »**. Analyse complète et architecture de
> règles `R1` → `R8` conduites le 2026-09-01.

| Règle | État | Preuve |
|---|---|---|
| **R2** — traits d'écran | 🟢 **DÉMONTRÉ-VALIDÉ** (`D-111`) | `screenTraits()` dans `@deribfy/execution-contract` · **10 cas-tueurs** · 3 falsifications · cliquet de véracité : `detail` coïncide exactement avec `detailScreens` sur les 24 documents |
| **R1** — archétype | 🔴 **SANS OBJET** | Contredirait `D-086` : *« l'AIR ne connaît aucune catégorie métier »*. L'archétype reste un raisonnement du GÉNÉRATEUR, hors contrat |
| **R6** — chaîne image → détail | 🔴 non commencé, **débloqué** | S'indexera sur les traits de R2 |
| **R7** — CTA par modèle commercial | 🔴 non commencé | — |
| **R4** — densité d'images | 🔴 **BLOQUÉ** | **Aucun bloc grille n'existe.** Le registre a 6 types ; `list` rend une vignette de **48 px** à gauche d'une ligne. « 4 images principales visibles » est **inexprimable** aujourd'hui |
| **R5** — ratio / orientation | 🔴 **BLOQUÉ** | `AppImage` n'a que 2 variantes (`thumb` 48×48, `header` pleine largeur). Aucune notion de ratio nulle part |
| **R8** — structure ≠ contenu | 🔴 non commencé | 🟢 La séparation existe DÉJÀ : l'AIR porte le CHAMP `asset`, jamais l'image. Manque le fournisseur de contenu réel (Phase 5+) |
| **R3** — contrat de composition | 🔴 non commencé (dernier) | Un contrat bloquant avant mesure serait l'erreur de `D-093` |

**Mesure fondatrice du chantier** — corpus v3 : **27 champs `asset`, 9 affichés,
18 ORPHELINS**. Seuls 3 documents affichent leurs images, ont une navigation
primaire et une recherche : `resto-quartier`, `plombier-urgence`, `coach-fitness`
— **exactement les 3 régénérés après `D-088`**. Les 9 autres sont ceux que
`gate:fidelite` refuse sur F4. **Le rouge résiduel de `fidelite` est donc une
DETTE DE GÉNÉRATION, pas un défaut structurel** — hors les 12 documents v2 gelés,
qui sont en `1.0.0` et n'ont aucune intention.

🔴 **Voyage / Transport est ABSENT du corpus** : aucune des 12 intentions.

# EXPÉRIENCE `toiletteur-chiens` — 2026-09-01 · ÉCHEC INSTRUCTIF

**Objet** : éprouver en génération réelle les trois diagnostics produits ce jour
(`FORM_SANS_ACTION`, `DETAIL_SANS_SOURCE`, remplissage conforme). Document choisi
parce qu'il les cumulait tous les trois, pour un seul coût.

**Résultat** : `issue = echec-technique`, `valid = false`. L'émission s'est
arrêtée à la 3ᵉ section — `RÉPONSE TRONQUÉE sur "ecrans" : plafond de 16 000
jetons atteint`. **Les trois diagnostics n'ont donc jamais été soumis au modèle :
l'expérience n'a pas répondu à sa question.** Le corpus n'a pas été touché.

**Ce qu'elle a démontré, et qui ne l'avait jamais été en conditions réelles :**

| | Avant | Cette expérience |
|---|---|---|
| `PB#1` — classification | démontré par cas-tueurs seulement | 🟢 `issue = echec-technique`. Avant `D-107`, la panne aurait été journalisée « terminee » |
| `PB#2` — conservation | 🟠 *« jamais éprouvé par un `529` réel »* | 🟢 **13 sections, 22 041 octets conservés**. Avant `D-107`, tout aurait disparu |

**La réserve maintenue depuis `D-107` tombe : `PB#2` est éprouvé en réel** — non
par un `529`, mais par une troncature, erreur technique authentique.

**Coût** : 0,3812 $ journalisés, **plus ~0,40 $** d'un appel tronqué qui échappait
alors à la comptabilité — **cumul réel ~0,78 $** (`D-114`, sans effet rétroactif).

## 🔴 CAUSE DE LA TRONCATURE — NON DÉMONTRÉE **ET NON REPRODUCTIBLE**

> ### ⬆️ EXPÉRIENCE DIAGNOSTIQUE DU 2026-09-01 — `D-116`
>
> Une expérience contrôlée a été autorisée, protocolée avant exécution, et lancée
> **une seule fois** : `BUDGET_USD=1.0 … 9 10`. **0,9369 $ · 3 appels.**
>
> **La troncature ne s'est pas reproduite.** `ecrans` a été émise : **13 écrans,
> 44 blocs, ~6 309 jetons — 39 % du plafond**, à **485 jetons/écran**, sous la
> moyenne du corpus. Même document, même prompt, **même niveau de schéma final**
> que l'exécution qui avait tronqué.
>
> **Sept hypothèses confrontées** : H1 (limite ≠ 16 000) et H3 (densité) **écartées
> par mesure** · H5 (niveau de dégradation) **écartée** — niveau identique,
> résultats opposés · H2 affaiblie · H4, H6, H7 non observables faute de corps
> anormal.
>
> 🔴 **NON CONCLUANT.** Le protocole l'avait tranché d'avance : un échec non
> reproductible interdit d'en inférer une cause. **Aucune correction n'est
> appliquée** — ni moteur, ni prompt, ni `MAX_TOKENS`, ni corpus, ni stratégie.
> **Le phénomène reste OUVERT.** L'écart d'un facteur ≥ 2,5 est inexpliqué ;
> l'hypothèse de la variance du modèle n'est **pas démontrée**.

## 🟢 GARDE BUDGÉTAIRE — ÉPROUVÉ EN CONDITIONS RÉELLES (`D-116`)

**0,9369 $ dépensés sur 1,00 $ autorisé.** L'appel `actions` a été **REFUSÉ AVANT
ÉMISSION** — *« refusé AVANT appel — dépensé 0.9369 $, coût maximal 0.4953 $ »*.
**Aucun dépassement** : le garde a mordu en amont. `issue = "interrompue-budget"`,
distincte de `echec-technique` et de `terminee`.

`D-103`, `D-114` et la classification à quatre états sont **démontrés ensemble,
hors laboratoire**. 🟠 Réserve maintenue : `coutMaxAppel` ignore les tarifs de
cache — contrôle légèrement optimiste, dette consignée, non traitée.

## Ancien constat, conservé

Faits établis : le modèle a planifié **14 écrans au lieu de 11** · les autres
sections qu'il a produites sont **plus sobres** que l'existant (×0,93) · 14 écrans
à la densité mesurée du corpus (556–575 jetons/écran) ≈ **8 000 jetons**, non
16 000 · **le facteur d'écart d'environ ×2 reste inexpliqué**.

**`$.screens` ne porte aucun `maxItems`**, à aucun niveau de l'échelle de
dégradation — donc `D-115` ne peut pas en être la cause, et ne la corrige pas.

Ce qui manquait au diagnostic : **le corps de la réponse tronquée**. Il n'existait
pas au moment de l'échec ; il existera au prochain, grâce à `D-113`.

## INSTRUMENTS RÉPARÉS LE 2026-09-01

**① `controles-fantomes` — 28 faux positifs supprimés (183 → 155).**
La gate remplissait **chaque** champ texte de la constante `"0700000000"`. Le
runtime annule toute mutation qui viole une règle déclarée (`reglesRespectees`,
`D-062`) : e-mail, énumération, bornes numériques. Des contrôles qui **refusaient
correctement** une saisie invalide étaient comptés fantômes — le document le mieux
validé était le plus puni. Correction : `saisie-conforme.ts` choisit, par champ, la
première valeur qui satisfait **toutes** ses assertions ; un champ sans assertion
garde la valeur historique. **5 cas-tueurs, 3 falsifications.** `resto-riche` 50/50
et `cours-cuisine` 16/16 restent à 100 % — la correction ne fabrique aucun vert.

**Décomposition des 155 restants**, par cause dérivée : **65** dette `saisie.id`
(`update`/`delete` exigent un identifiant que rien ne fournit) · **30** règle
portant sur un champ que le formulaire ne collecte pas · **30** `create` déclenché
par un bouton, sans valeur propre (`D-083`) · **20 nœuds = 7 contrôles réellement
muets** · 10 indéterminés. **Seuls 20 sur 155 sont ce que cette gate a été écrite
pour détecter.**

**③ `D-113` — le corps d'une réponse tronquée est une preuve payée** (`12ce5c0`).
`callPart` levait sur `max_tokens` AVANT tout traitement du contenu : les jetons
de sortie, facturés, disparaissaient. Mesuré : **16 000 jetons jetés**.
`texteBrut()` les conserve **verbatim** — ni `trim`, ni nettoyage, ni complétion.
Le corps voyage avec l'erreur via `attacherPartiel`, le mécanisme existant. **Les
trois formes de preuve payée sont désormais conservées.** 10 cas-tueurs,
3 falsifications. 🔴 **Ne corrige pas la cause de la troncature** : rend le
prochain diagnostic possible, rien de plus. Artefacts versionnés en `f84c2b4`.

**④ `D-114` — un appel qui a eu lieu est un appel facturé** (`ed1c000`).
Deux compteurs, deux endroits, tous deux aveugles à la troncature : `etatDepense`
après le `throw`, `usage[]` chez les appelants. **Le plafond `D-103` pouvait être
franchi sans mordre.** `callPart` devient le **propriétaire unique** de la
comptabilité, avant toute branche. Montant inchangé, visibilité corrigée.
9 cas-tueurs, 4 falsifications.

**⑤ `D-115` — dégradation ciblée du schéma, étape A** (`499189a`).
🔴 **RECTIFIÉE PAR MESURE (`D-116`) — CETTE CORRECTION EST INERTE.** L'API refuse
**`maxItems` lui-même** : les bornes que `D-115` annonçait préserver ne peuvent
JAMAIS être envoyées. La dégradation atteint `sans-longueurs` exactement comme
avant ; le seul effet observable est **un aller-retour refusé supplémentaire**.
`A` reste juste sur `minItems`, mais elle ne préserve rien. Texte d'origine
conservé ci-dessous.
Une seule contrainte incompatible (`minItems: 3`, `D-086`) faisait détruire
**35 contraintes**, dont les deux seules bornes hautes du schéma. `clampMinItems`
en touche **une**. `maxItems [5]` et `maxLength [80]` survivent. `levelIndex`
remis à zéro par document. 11 cas-tueurs, 4 falsifications, **0 $**.
🔴 **Réserve absolue : ne corrige ni n'explique la troncature.**

**② `FORM_SANS_ACTION` — les formulaires qui promettent sans tenir (`D-112`).**
`FACT` — **7 formulaires muets sur 45 (15,6 %)** contre **0 bouton muet sur 259
(0 %)**. Le registre impose `actionId` à un `button` — *« un CTA sans action »* —
et **rien** à un `form` (`actionRefProps: []`) ; le pont de validation ne vérifie
que le sens inverse (`BLOCK_TRIGGER_SANS_AFFORDANCE`, `D-104`). L'asymétrie 0 %/259
contre 15,6 %/45 **réfute** l'hypothèse d'une inattention du modèle et **démontre**
la lacune du contrat.

Concernés : `billetterie-concerts` (4, dont **« Payer par carte »**),
`livraison-fruits` (2, dont **« Payer par carte »**), `toiletteur-chiens` (1,
**« Confirmer le rendez-vous »**). **Ces 7 formulaires restent muets** : le
diagnostic ne mord qu'à la prochaine génération.

Le diagnostic vit dans la validation de campagne (`emit-v3`), **volontairement
HORS de `validateAirBlocks`** : ce pont est consommé en fail-closed par le
compilateur et par le cliquet du corpus gelé qui exige zéro diagnostic — l'y placer
aurait **refusé 3 documents existants**, l'erreur d'étage de `D-105`. **6 cas-tueurs
+ 2 sur le mappage de réparation, 3 falsifications.**

## Prochaine étape autorisée

> ### ✅ EXÉCUTÉE LE 2026-09-01 — P10, `D-109`. `valid=true`, 2,3069 $, 10 appels.
> Le bloc ci-dessous est **conservé** : c'est l'autorisation telle qu'elle était
> formulée. **Aucune autre génération n'est autorisée** sans un nouvel arbitrage.
>
> **Ce qui est ouvert maintenant** : un **audit du rouge résiduel de `fidelite`**
> — déterminer si `F1 = 12` / `F4 = 21` est **structurellement attendu** (les 12
> documents v2 gelés sont en `1.0.0` et n'ont aucune intention : ils ne peuvent
> pas satisfaire un critère qui la suppose) ou s'il constitue un **travail restant
> de la Phase 10B** portant sur les 9 documents v3. **Aucun seuil, aucune gate,
> aucun corpus historique ne doit être modifié pour l'obtenir.**

**Une seule génération**, `coach-fitness`, index **2** :

```
BUDGET_USD=3.5 node benchmarks/air-emission/emit-v3.mjs 2 3
```

Attendu ~2,50 $ · exposition bornée ~4,10 $ (D-103). Elle ne mesurerait rien de
nouveau sur le générateur — P9 a déjà répondu — elle **finirait le travail**
interrompu par la panne. **Aucune dépense sans autorisation explicite.**

**Deux préalables levés le 2026-09-01, aucun appel API :**

- **Gouvernance (`D-106`)** — la divergence `ROADMAP` ↔ `STATUS` est close : le
  blocage `C-0` **et** `RN-01` sont clos par caducité (`D-108`).
  Cette génération n'est plus contredite par un autre document du dépôt.
- **`PB#2` (`D-107`)** — si un second `529` frappe au même endroit, les sections
  déjà payées sont **conservées**, l'issue est **`echec-technique`** et non plus
  `terminee`, et l'artefact porte son `runId`. **Le mode d'échec qui a coûté
  1,7718 $ à P9 ne détruit plus la dépense.**

🟠 **Non déterminé, énoncé** : la chaîne complète sous un `529` RÉEL n'est pas
mesurée — cela exigerait un appel API.
