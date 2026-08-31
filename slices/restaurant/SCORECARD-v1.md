# SCORECARD v1 — VERTICAL SLICE 1 (restaurant / « maquis-express »)

Phase 8, Étape A (D-036) — 2026-08-28. Métriques **mesurées**, journaux
bruts : `results/*.jsonl`, `results/metrics.json`.

## Identité du slice

| | |
|---|---|
| Intention | « restaurant / maquis » (une des 12 intentions fixes du corpus) |
| AIR | `resto-quartier` — **émis par le modèle** (D-025), aucune retouche manuelle (non-négociable 14 : provenance-modèle préservée) |
| projectId / slug | `prj_resto_quartier_abidjan` / `maquis-express` |
| Contenu | 4 écrans · 3 entités · 5 capabilities · 17 blocs |
| Artefacts | rootHash `29e0af787afe7d2d…` · SQL `15dd88ffef507151…` — **hashes du rejeu post-D-037** (`slice-2026-08-29T04-14-07-618Z.jsonl`). L'ancien rootHash `343a94d994c44b22…` correspond aux 4 exécutions du 2026-08-28, **antérieures à la correction Safe Area** ; le SQL est inchangé, la correction ne portant que sur le code émis |

## Taux de succès (chaîne bout-en-bout)

| Étage | Résultat | Preuve |
|---|---|---|
| Gates (4 validateurs fail-closed) | ✅ 0 diagnostic | `slice-*.jsonl` |
| Compilation déterministe | ✅ 31 fichiers, rootHash **identique à la Phase 4** | store SHA-256 |
| Backend réel (provision → SQL → vérif → teardown) | ✅ 3 tables ⇔ 3 entités, **RLS 3/3**, seed 24 lignes, **teardown prouvé** | `backend-verif`, `teardown-preuve` |
| Sandbox §8 (install → typecheck → bundle) | ✅ vert, teardown prouvé | `sandbox-detail` |
| Oracle L1 (4 contrôles) | ✅ 4/4 | `oracle-detail` |
| Flows E2E générés (Oracle L2) | ✅ générés depuis l'AIR, 4 flows (nav+RTL × 2 plateformes) | `maestro/` |
| **Dev build + validation ÉMULATEURS iOS et Android** | ✅ builds Release verts ×2, **4/4 flows générés PASS** (nav+RTL, 13 étapes chacun, 0 échec) | `results/slice-e2e.jsonl` |
| **Build EAS (cloud, §13)** | ✅ **Android APK FINISHED (10 min 57 s)** + **iOS simulateur FINISHED (4 min 07 s)** — 0 $ (palier Free) ; **APK EAS installé sur émulateur : 2/2 flows générés PASS** | `results/eas-builds.jsonl`, `eas-artifact-e2e.jsonl` |
| **Appareil physique ANDROID (Galaxy A17, SM-A175F, Android 16)** | ✅ **APK EAS installé · app lancée · fixtures rendues · navigation réelle OK** (tap → `scr_panier`, retour → `scr_menu`) — **1 défaut device consigné** (voir dette 5) | `results/device-physique-e2e.jsonl` |
| **Appareil physique iOS (iPhone 16)** | 🟠 **BUILD LIVRÉ, INSTALLATION EN ATTENTE** — credentials Apple établis par clé App Store Connect (sans mot de passe ni 2FA), UDID enregistré par QR, **build de distribution interne `FINISHED` en 195 s, IPA présent** ; état Apple contre-vérifié par lecture directe de l'API : appareil `ENABLED`, certificat `IOS_DISTRIBUTION`, profil `IOS_APP_ADHOC` `ACTIVE` **contenant l'appareil**. Reste l'installation et la manipulation par le propriétaire — **non automatisable** : le port de données USB-C de l'iPhone est mort (DET-012), donc Maestro ne peut pas piloter l'appareil comme il l'a fait sur Android | `results/` + API App Store Connect |

**Taux de succès de la chaîne automatisée : 7/7 étages verts.**

## Tests par plateforme et différences cross-platform

| | iOS (simulateur iPhone 17 Pro, iOS 26.5) | Android (émulateur bench_pixel) |
|---|---|---|
| Build dev Release | ✅ EXIT=0 | ✅ EXIT=0 |
| Installation + lancement | ✅ | ✅ |
| Flow navigation généré (13 étapes) | ✅ PASS | ✅ PASS |
| Flow RTL généré (13 étapes) | ✅ PASS | ✅ PASS |
| Fixtures rendues (ligne 1 de la liste) | ✅ | ✅ |
| Action `navigate` réelle + retour | ✅ (pop par geste de bord) | ✅ (back système) |

**Différences entre plateformes — inventaire complet :**
1. **Aucune différence dans le code généré** : 0 occurrence de `Platform.OS`,
   `.ios.`, `.android.` sur les 31 fichiers émis — les MÊMES fichiers
   servent les deux plateformes (vérifié par analyse du projet compilé) ;
2. **Une seule différence, dans les FLOWS de test** (pas dans l'app) : le
   geste de retour — `back` système sur Android, pop par geste de bord sur
   iOS, car iOS n'a pas de bouton retour matériel. Cette différence est
   portée par le **générateur de flows** (paramètre `platform`), jamais par
   l'application ;
3. **Manifeste `app.json`** : sections `ios` et `android` toutes deux
   émises (identités, permissions induites, planchers de plateforme via
   `expo-build-properties`) — symétrie complète.

**Conclusion cross-platform : le slice est nativement bi-plateforme.**
Aucune implémentation iOS-only n'a été introduite ; l'absence d'appareil
Android physique n'a eu AUCUN effet sur l'architecture ni sur le code.

## Temps (mesurés)

| Étape | Durée |
|---|---|
| Gates | 2 ms |
| Compilation | 3 ms |
| **Backend Supabase** (création → SQL → vérifications) | **169,4 s** |
| **Sandbox** (npm ci 9,9 s · tsc 1,9 s · bundle 14,7 s) | **28,7 s** |
| Oracle L1 | 17 ms |
| **Total chaîne (hors device)** | **≈ 3 min 20 s** |

## Coût

| Poste | Coût réel |
|---|---|
| LLM | **0 $** (AIR déjà émis en D-025 ; aucun appel dans ce slice) |
| Sandbox (Modal) | ~0 $ (crédits ; ~30 s de compute) |
| Backend (Supabase) | ~0 $ (org de banc Pro déjà souscrite ; projet **détruit** après vérification) |
| Émulateurs / Maestro | 0 $ (local) |
| **Total slice** | **≈ 0 $** |

## Repairs

**0 repair** — conforme à l'attente de la ROADMAP pour cette phase
(« repairs=0 attendu ici »). Aucune boucle de réparation n'a été
nécessaire : la chaîne a réussi du premier coup sur le document du slice.

## Qualité UI (évaluation)

Évaluée sur émulateurs (captures de 4.7/6.4 et flows du slice) : écrans
composés de blocs gelés (header/list/button/form/detail_header), thème
issu des tokens scellés, états explicites, page défilante ; navigation
native-stack conforme à l'AIR. **Réserve consignée** : l'évaluation
« anti-template » (variété visuelle inter-apps, §22) n'est pas
significative sur **un seul** domaine — elle prendra son sens au scorecard
cross-domain (Phase 10/14). Évaluation propriétaire attendue sur appareil.

## Garde-fou ROADMAP (« dette du GÉNÉRATEUR »)

**Aucun écart construit à la main pour faire passer le slice** :
`manualWorkarounds: []`. L'app, le SQL, les manifestes et les flows sont
**intégralement générés**. Les corrections faites pendant l'Étape A ont
porté sur le **harnais du slice** (résolution de module, fichier de
credentials, portée de variables, **teardown garanti en `finally`**), pas
sur les artefacts générés — elles sont journalisées et n'entrent pas dans
la dette du générateur.

## Dette du GÉNÉRATEUR consignée (constats, non corrigés ici)

1. **Seed partiel** : seules les entités portant un `dataset` dans l'AIR
   reçoivent des lignes (ici `ent_plat` = 24 ; `ent_commande` et
   `ent_ligne_commande` = 0). Constat de conception (D-030), à réexaminer
   quand les datasets seront produits par le Content Pipeline (§19).
2. **App non connectée au backend en preview** : conforme à D-013
   (« preview = données de démonstration uniquement ») et à D-032 (policies
   RLS applicatives différées) — mais cela signifie que le slice ne prouve
   pas encore le chemin app ⇄ backend vivant. À traiter là où la ROADMAP
   le prévoit, jamais par contournement.
3. **Provisioning à 169 s** (org Pro) contre ~9,5 s mesuré en Free
   (D-032-R55) : à surveiller pour le débit de flotte (Phase 14).
4. **Le gabarit ne porte pas la configuration de build cloud** — écarts
   ajoutés À LA MAIN pour faire passer le slice (garde-fou ROADMAP, donc
   DETTE DU GÉNÉRATEUR, pas solution) :
   a) `eas.json` absent du projet généré (profils de build) ;
   b) `app.json` émis sans `owner` ni `extra.eas.projectId` (liaison au
      projet EAS faite à la main) ;
   c) `expo-dev-client` absent : le profil EAS `development` (dev build au
      sens Expo) est donc **impossible sans modification manuelle** — le
      slice a utilisé la **distribution interne** (APK release installable
      par QR), qui satisfait « app installée et fonctionnelle » mais n'est
      pas un « dev build » au sens strict du terme.
   d) **[ajouté le 2026-08-29]** `app.json` émis sans
      `ios.infoPlist.ITSAppUsesNonExemptEncryption` (conformité export
      Apple) : au premier build iOS, **`eas build` a écrit lui-même cette
      clé** dans le fichier généré. Constaté au `git diff`, pas supposé.
      Sans effet sur la distribution interne ; obligatoire dès la
      soumission App Store (Phase 12).
   Ces quatre manques sont des CONSTATS sur le générateur ; aucun n'a été
   « corrigé » dans les zones scellées (le gabarit reste intact).
5. **DÉFAUT RÉVÉLÉ PAR L'APPAREIL PHYSIQUE — safe area du bas non
   respectée** [démontré, Galaxy A17 / Android 16] : le **dernier bloc**
   d'un écran est rendu en `[0,2213]→[1080,2340]`, son bord inférieur
   coïncidant avec le **bas absolu de l'écran** (fenêtre applicative
   `1080x2340`, bord à bord) — il se retrouve **sous la barre de
   navigation gestuelle** et n'est pas pleinement atteignable. Preuve :
   les flows générés passent 3 étapes (lancement, écran, fixtures) puis
   échouent au `scrollUntilVisible` du dernier bouton, sur les DEUX flows.
   **Non reproduit sur émulateur** (3 phases de validation émulateur
   l'avaient manqué) — c'est exactement le type d'intégration que le
   vertical slice existe pour forcer.
   **Impact** : tout écran dont le dernier bloc atteint le bas ; contrôle
   partiellement inaccessible sur appareil réel (iOS aurait l'équivalent
   avec l'indicateur d'accueil).
   **Initialement non corrigé, volontairement** : le garde-fou ROADMAP
   impose de consigner comme dette du générateur plutôt que de patcher pour
   faire passer le slice ; et la correction (padding d'inset dans le code
   émis) changeait tous les hash de sortie, invalidant les preuves de
   déterminisme des Phases 4/6/7 — cela relevait d'une décision
   propriétaire.
   **🟢 RÉSOLUE le 2026-08-29 (D-037, arbitrage propriétaire)** — corrigée
   **dans le compilateur** (`packages/compiler/src/emit-project.ts` :
   `useSafeAreaInsets` + `paddingBottom` sur le `ScrollView`), jamais dans
   l'artefact. Nouveau rootHash `29e0af787afe7d2d…` ; les Phases 4, 6, 7
   et 8 ont été **intégralement rejouées** pour reconstituer les preuves de
   déterminisme. Preuve sur appareil réel : le dernier bloc passe de
   `[…,2213]→[…,2340]` (bas absolu de l'écran) à une position atteignable,
   le tap navigue vers `scr_commandes`, **2/2 flows générés PASS**.
   Consignée aussi au registre permanent de `STATUS.md` sous **DET-001**.

## ÉVALUATION GRILLE A++ (D-039, exigence Premium / Elite 2027 — 2026-08-29)

Critère de sortie amendé de la Phase 8 : « qualité UI évaluée **contre la
grille A++** », dimension par dimension, preuve à l'appui, une dimension non
mesurable étant déclarée **non déterminée** et jamais conforme par défaut.

| # | Dimension | Verdict | Preuve / mesure |
|---|---|---|---|
| **A** | Ergonomie physique | 🔴 **NON CONFORME** | **Aucun `minHeight`, `minWidth` ni `hitSlop`** dans `packages/primitives/src/styles.ts` — vérifié par recherche exhaustive. Le bouton se dimensionne par `paddingVertical: space.md` (12) + texte `body` 14 pt sans `lineHeight` déclaré ⇒ hauteur estimée **≈ 41 pt**, sous les seuils **44 pt (iOS HIG)** et **48 dp (Material)**. Le fait structurel — *aucun minimum n'est garanti* — est démontré indépendamment de l'estimation : une conformité éventuelle serait fortuite, pas assurée. Safe areas : 🟢 corrigées et prouvées sur appareil (D-037/DET-001) |
| **B** | Contraste WCAG 2.2 AA | 🔴 **NON CONFORME** | **30 paires texte/fond calculées depuis `tokens.json`** (15 paires × 2 thèmes). 28 conformes. **2 échecs identiques en clair ET en sombre** : `onPrimary` sur `primary` (blanc `#FFFFFF` sur l'accent de marque `#FA5D1E`) = **3,16:1**, seuil requis **4,5:1** pour du texte `body` 14 pt. C'est le **libellé du bouton primaire** — « Voir mon panier » sur l'écran d'entrée du slice. Passerait à 3:1 si le texte était « grand » (≥ 18 pt), ce qu'il n'est pas |
| **C** | Complétude des états | 🟢 **CONFORME** | États `loading` / `empty` / `error` présents aux composants de blocs (`packages/blocks/src/components.tsx`) ; contrats du registre gelé D-024 + tests de Phase 3 |
| **D** | Cohérence zéro-style-en-dur | 🟢 **CONFORME** | 25 fichiers de l'app générée analysés : **toutes** les couleurs hex (22) sont concentrées dans `lib/tokens/theme.generated.ts`, le module de thème généré depuis la source unique. **Zéro** couleur en dur dans les écrans et composants |
| **E** | Typographie / tailles d'accessibilité | ⚪ **NON DÉTERMINÉE** | Échelle hiérarchique appliquée (label 12 · body 14 · title 17 · heading 22). L'absence de troncature aux **tailles d'accessibilité système maximales** n'est pas outillée — non mesurée, donc non conforme par défaut |
| **F** | Internationalisation / RTL | 🟢 **CONFORME** | Propriétés logiques exclusivement (cliquet RTL de Phase 3) ; flows RTL générés rejoués **PASS** sur les deux plateformes |
| **G** | Fluidité perçue / virtualisation | 🔴 **NON CONFORME** | **DET-006** : la `FlatList` du bloc `list` est imbriquée dans le `ScrollView` de page ⇒ **virtualisation neutralisée**. Défaut déjà consigné, désormais **bloquant** au titre de la grille |
| **H** | Variété anti-template (§22) | ⚪ **NON DÉTERMINÉE** | Mesurable à partir de **2 domaines** seulement. Le slice 1 n'en fournit qu'un. Évaluation reportée à la Phase 10, comme la ROADMAP amendée le prévoit |

### Verdict

**Le slice 1 n'atteint PAS le niveau A++** : 3 dimensions conformes, **3 non
conformes**, 2 non déterminées. La règle de notation est sans ambiguïté —
A++ exige 8/8 conformes avec preuve.

Deux des trois non-conformités sont des **découvertes de cette évaluation**
(A et B) ; elles étaient invisibles tant que « fonctionnel » servait de
critère. L'app démarre, navigue, rend ses fixtures et passe ses flows E2E :
elle est fonctionnelle, et pourtant le libellé de son bouton principal est
sous le seuil d'accessibilité AA dans les deux thèmes.

### Conséquence

Les trois non-conformités touchent des **artefacts gelés en Phase 3**
(tokens 1.0.0, primitives, blocs 1.0.0 / D-024) et scellés dans le train
`rt-2026.08`. Le garde-fou de la Phase 8 interdit de les retoucher pour
faire passer le slice, et leur modification invaliderait les preuves de
déterminisme des Phases 4/6/7. Elles sont donc consignées comme **dettes
BLOQUANTES** (DET-006 requalifiée, **DET-014**, **DET-015**) à échéance
**Phase 10 — design system v2**, conformément à l'amendement A++ de la
ROADMAP.
