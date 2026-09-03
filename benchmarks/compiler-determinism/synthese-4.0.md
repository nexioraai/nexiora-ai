# SYNTHÈSE 4.0 — VALIDATIONS PRÉALABLES DU COMPILATEUR v1 (D-026)

Exécutées le 2026-08-28, AVANT toute construction du compilateur.
Coût API : **0 $** (aucun appel LLM — conforme à l'analyse de dépense D-026).
Protocole de preuve D-018 : chaque échec intermédiaire diagnostiqué par la
mesure avant correction ; contrôles positifs ET négatifs exigés des
dispositifs de preuve.

## V2 — Micro-preuve d'empaquetage (Option C + manifeste Merkle) : 🟢 PROUVÉE

- Maquette d'émission Option C sur documents du corpus ACTIF v2
  (`v2-empaquetage.mjs`) : module de données canonique (sérialiseur prouvé
  d'`air-schema`) + code structurel (identifiants regex uniquement) +
  manifeste Merkle trié (S3, S5 : LF, UTF-8, tri par point de code —
  `localeCompare` proscrit).
- **20/20 hash racine identiques** × 2 documents (`agence-immo`,
  `billetterie-concerts`), 10 invocations de processus × 2 environnements
  (TZ `Pacific/Auckland`, locale turque `tr_TR.UTF-8` — piège i/İ, cwd
  hors dépôt).
- **Contrôle positif** : injection volontaire d'un horodatage
  (`V2_POISON=1`) → 20 hashes distincts détectés, exit 1. Le dispositif
  sait détecter une divergence.
- Journaux : `results/v2-*.jsonl`.

## V5 — Harnais zéro-réseau (preuve dynamique du critère zéro-LLM) : 🟢 PROUVÉE

- `v5-zero-reseau-preload.mjs` (chargé par `node --import`), DEUX couches :
  interception au chargement (`module.registerHooks` : net, dns, tls,
  http, https, http2, dgram, child_process, undici → stub fail-closed) +
  patchs d'appel (fetch/WebSocket globaux, `net.Socket.prototype.connect`,
  objets par défaut).
- **Contrôle positif : 5/5 canaux tués** (fetch, https.get, net.connect,
  dns.lookup, dgram) — erreur marquée SYNCHRONE exigée, un TypeError
  d'usage ne compte pas (leçon du 1er passage).
- **Contrôle négatif : charge représentative intacte** — parse + 4
  validateurs + sérialisation canonique + hash sur les 12 documents v2 :
  0 diagnostic, 0 déclenchement.
- **Spécificité** : sans harnais, 0/5 tués.
- **Limite MESURÉE et consignée** : les exports nommés d'un module cœur
  capturés AVANT l'installation du harnais restent les originaux
  (instantanés d'espace de noms — démontré : `ns.lookup !==
  default.lookup` après patch). Fermée par la couche d'interception au
  chargement + règle « harnais chargé en premier » + cliquet STATIQUE
  d'imports à câbler en 4.6.
- Journaux : `results/v5-controles.jsonl`.

## V3 — Reproductibilité de l'installation du gabarit (S4) : 🟢 PROUVÉE

- Pins démontrés (harnais 3.4) : expo ~57.0.17 · react-native 0.86.3 ·
  react 19.2.3.
- Génération du lockfile ×2 → **byte-identique**.
- `npm ci --ignore-scripts` (politique sandbox §8) ×2 environnements
  (locale/TZ hostiles) → **19 666 fichiers, hash d'arbre strictement
  identique 2/2** ; lockfile intact après installation (2/2).
- Journaux : `results/v3-npmci.jsonl`.

## V4 — Micro-banc navigation B-NAV : 🟢 EXÉCUTÉ → S1 TRANCHÉ

Fixture : navigation réelle de `resto-quartier` (corpus ACTIF v2, 4 routes,
domaine du futur Slice 1). Deux générateurs au patron Option C
(`navigation/gen-*.mjs`), apps de banc Release, New Architecture activée,
devices réels (émulateur `bench_pixel`, simulateur iPhone 17 Pro).

| Critère | react-navigation (native-stack) | expo-router |
|---|---|---|
| Byte-stabilité sortie ×20 (2 env) | 🟢 20/20 | 🟢 20/20 |
| Poids JS ajouté vs baseline (hbc, octets) | **+440 445 iOS / +435 006 Android** | +923 918 iOS / +1 230 234 Android (**×2,1 / ×2,8**) |
| New Architecture | 🟢 build Release vert | 🟢 build Release vert (APRÈS correction, voir ci-dessous) |
| LOC générateur (spécifique candidat) | 81 | **65** |
| Back réel device (back système Android + pop par geste de bord iOS) | 🟢 PASS (1er passage) | 🟢 PASS (1 rejeu iOS : flake driver XCUITest, connexion port refusée — infra de test, pas l'app) |
| Installation aux versions du SDK | 🟢 verte du premier coup | 🔴 **arbre npm INVALIDE par défaut** [mesuré] |

**Défaut structurel mesuré (expo-router)** : `expo-router@57.0.17` (version
choisie par `expo install` pour le SDK 57) tire `@expo/ui` +
`react-native-drawer-layout` + `react-native-reanimated@4.6.0` →
`react-native-worklets@0.12.1`, alors qu'`expo-modules-core` exige
`^0.7–^0.10` : `npm ls` déclare l'arbre **invalid**, et les builds Release
échouent sur les DEUX plateformes (Android : `no member named 'executeSync'
in 'worklets::WorkletRuntime'` ; iOS : échec du script ExpoModulesJSI).
`npx expo install --fix` **ne converge pas** [mesuré]. Correction requise :
`overrides` manuels vers la matrice du SDK (`bundledNativeModules.json` :
reanimated 4.5.1, worklets 0.10.1) — après quoi les builds passent.

**Anomalies d'environnement (classées, corrigées sur précédent P-003)** :
cmake `/usr/local/bin` x86_64 → `cmake.dir` SDK dans `local.properties` ;
pods désynchronisés → `pod install` ; `JAVA_HOME` requis par Maestro.
Faiblesse de preuve auto-détectée et corrigée : le tap texte du bouton
retour iOS était ambigu (même libellé qu'un bouton d'écran) → remplacé par
le **geste de pop par bord d'écran**, non ambigu, rejoué PASS sur les deux
candidats.

## VERDICT S1 (application de D-026 : « la solution démontrée meilleure »)

**`@react-navigation/native-stack`**, config générée depuis l'AIR.

1. Il gagne les deux axes que le banc discrimine réellement : **poids**
   (moitié à un tiers du surcoût JS d'expo-router) et **robustesse de la
   chaîne de dépendances** (installation verte aux versions du SDK, contre
   un arbre invalide nécessitant une chirurgie d'overrides — inacceptable
   pour un COMPILATEUR qui doit produire des apps reproductibles sans
   intervention).
2. expo-router impose à CHAQUE app générée reanimated + worklets + @expo/ui
   + drawer-layout (surface native et couplage de versions supplémentaires)
   pour des fonctionnalités que le compilateur n'utilise pas — contraire au
   patron D-021 (« zéro dépendance dans le chemin qui doit produire 10 hash
   identiques ») et à D-002 (profils minimaux).
3. La config générée EXPLICITE (routes déclarées depuis l'AIR) est plus
   proche du patron allowlist du chantier que la convention par système de
   fichiers ; le seul avantage mesuré d'expo-router (−16 LOC de générateur)
   est un coût payé UNE fois, patron D-021 §4.
4. Byte-stabilité, New Architecture et back réel : égalité (après
   correction pour expo-router).

Conséquence 4.2 : le gabarit intègre `@react-navigation/native@7.x` +
`@react-navigation/native-stack@7.x` + `react-native-screens` +
`react-native-safe-area-context` (versions exactes fixées au lockfile du
gabarit, 4.2).
