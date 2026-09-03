# SYNTHÈSE — BANC E2E MOBILE : MAESTRO vs DETOX (2026-08-28)

Protocole : `docs/mobile-generation/benchmarks/E2E-mobile.md` — suivi sans
dérogation. **AUCUN GAGNANT N'EST DÉSIGNÉ ICI** : la décision appartient au
propriétaire.

## Conditions (identiques aux deux outils)

| Élément | Valeur |
|---|---|
| App sous test | **Copie de la coquille P-003 retenue** (`stylesheet` + tokens, D-021), même `fixture-core`, 3 écrans, 500 cartes déterministes — non dérivée (diff dépôt↔banc : identique) |
| Binaire | **UN SEUL binaire par plateforme, partagé par les deux outils** (build Release, New Architecture) — l'instrumentation Detox est présente dans les deux cas, donc aucune différence de binaire entre outils |
| Cibles | Simulateur iPhone 17 Pro (iOS 26.5, UDID épinglé) · AVD `bench_pixel` (Pixel 7, Android 16, GPU host) |
| Flow | **Sémantique strictement identique** : launch → synchronisation → nav Formulaire → 2 assertions d'état *error* → assertion bouton → nav Thème → bascule de thème → assertion → nav Liste → assertion |
| Exécutions | **20 par outil et par plateforme** (80 au total) |
| Mesure de vitesse | horloge murale autour de l'invocation CLI (= unité de coût réelle en CI), identique pour les deux |

## 1. Fiabilité (flakiness) — 20 runs × 2 outils × 2 plateformes

| Outil | Plateforme | Succès | Échecs non reproductibles |
|---|---|---|---|
| Maestro | iOS | **20/20** | 0 |
| Detox | iOS | **20/20** | 0 |
| Maestro | Android | **20/20** | 0 |
| Detox | Android | **20/20** | 0 |

**80/80. Aucun flake, aucun échec, sur aucun des deux outils.**

## 2. Vitesse

| Outil | Plateforme | Médiane (mur) | min | max | σ | Durée interne rapportée |
|---|---|---|---|---|---|---|
| Maestro | iOS | 30,4 s | 29,3 | 33,8 | 1,2 s | *non rapportée par l'outil* |
| **Detox** | iOS | **24,0 s** | 23,8 | 24,5 | **0,2 s** | **8,0 s** (médiane, n=20) |
| Maestro | Android | 24,8 s | 24,3 | 27,8 | 0,7 s | *non rapportée par l'outil* |
| **Detox** | Android | **12,6 s** | 12,5 | 19,6 | 1,9 s | **1,97 s** (médiane, n=20) |

Detox est **21 % plus rapide sur iOS** et **49 % plus rapide sur Android** en
temps mur. Detox rapporte en outre la durée interne du test (observabilité
utile en CI) ; Maestro n'imprime aucune durée.

## 3. RTL — le flow passe-t-il SANS MODIFICATION ?

App basculée en RTL réel (`I18nManager.forceRTL` via l'écran Thème), puis
**exactement les mêmes** flow/test rejoués :

| Outil | Résultat en RTL |
|---|---|
| Maestro | 🟢 **PASS** — flow inchangé |
| Detox | 🟢 **PASS** — test inchangé |

Capture : `results/rtl/ios-rtl.png`. Les deux outils sélectionnent par
`testID`/texte, insensibles au miroir de layout.

## 4. Générabilité depuis l'AIR (critère de fond du protocole)

Générateur trivial écrit pour chaque cible, depuis une structure de type AIR
(`generability/air-min.json` : `navigation.routes` + ancres) :

| Cible | Générateur | Sortie |
|---|---|---|
| Maestro (YAML) | **7 LOC** | `out-nav.yaml` |
| Detox (JS) | **7 LOC** | `out-nav.test.js` |

**Égalité de coût de génération.** Différence de nature : la cible Maestro est
un **format de données** (YAML déclaratif, sérialisable, diffable, sans
exécution) ; la cible Detox est du **code JavaScript** (nécessite un runtime
Node + jest, et le générateur produit du code à exécuter). Pour un compilateur
déterministe, émettre des **données** est structurellement plus sûr qu'émettre
du **code**.

## 5. Diagnostic d'échec (assertion volontairement fausse, 4 exécutions)

| Outil | Artefacts produits automatiquement |
|---|---|
| **Maestro** | 🟢 **Bundle de debug automatique (4,2 Mo)** : **capture d'écran à l'étape fautive**, **hiérarchie d'UI complète en JSON**, `commands.json`, `manifest.json`, logs device (simulator + xctest), message d'échec avec causes possibles |
| **Detox** | 🟠 **Trace jest avec cadre de code pointant la ligne exacte** du test fautif — mais **aucun artefact par défaut** (ni capture, ni hiérarchie : « HINT: To print view hierarchy on failed actions/matches, use log-level verbose or higher »). Captures/logs = configuration explicite à activer |

Les deux échouent proprement (`rc=1`) sur les 2 plateformes. Artefacts
conservés : `results/failure/`.

## 6. Intégration sandbox / CI

| Point | Maestro | Detox |
|---|---|---|
| Exécution headless | 🟢 CLI, émulateur lancé `-no-window` | 🟢 CLI + jest, même émulateur |
| Runtime requis | **JVM** | **Node + jest** |
| Instrumentation de l'app | **aucune** | **requise sur Android** (APK `androidTest` + config Gradle) ; **aucune sur iOS** (injection au lancement) |
| Coût/minute | **[non mesurable]** — dépend de P-002, non tranché |

## 7. Anomalies rencontrées (aucune corrigée silencieusement)

1. 🟠 **`@config-plugins/detox@11.0.0` déclare `peer expo@"^53"`** alors que la
   stack est en **SDK 57** → installation avec `--legacy-peer-deps`
   (contournement documenté). Le plugin a néanmoins injecté correctement la
   configuration Android (`testBuildType`, `testInstrumentationRunner`,
   `androidTestImplementation('com.wix:detox:+')`, `DetoxTest.java`,
   règles ProGuard) et l'APK `androidTest` s'est construit. **L'intégration
   Expo officielle de Detox a 4 versions de SDK de retard.**
2. 🟠 **La fixture P-003 exécute un scénario automatique (~12 s) au lancement.**
   Traitement **identique** pour les deux outils : point de synchronisation
   explicite sur `bench-result` en tête de flow. Découverte : Detox absorbe en
   plus ce délai via sa **synchronisation d'inactivité automatique** (le corps
   du test ne démarre qu'une fois l'app au repos) ; Maestro n'a pas de
   synchronisation implicite et dépend de l'attente explicite.
3. 🟠 **Le protocole demande des assertions sur `loading` / `error` / `empty`.**
   La fixture expose 2 états *error* (assertés) ; l'indicateur de *loading*
   n'a **pas de `testID`** et l'état *empty* **n'existe pas** dans la fixture.
   Ces deux assertions sont donc **hors de portée sans modifier la fixture** —
   ce qui aurait fait dériver les artefacts P-003. **Non corrigé**, limitation
   identique pour les deux outils.
4. 🟠 **CocoaPods absent du `PATH` par défaut** → premier build iOS en échec ;
   résolu en réutilisant exactement le `PATH` du script P-003
   (`/opt/homebrew/bin`). Anomalie d'invocation, pas d'environnement.
5. 🟠 **Asymétrie structurelle inhérente aux outils** : Detox exige une
   instrumentation native sur Android (pas sur iOS) ; Maestro n'exige rien.
   Le binaire partagé neutralise cette asymétrie **pour la mesure**, pas pour
   le coût d'intégration.

## 8. Coûts

**0 $.** Aucun service payant, aucun compte créé, aucun build cloud.
