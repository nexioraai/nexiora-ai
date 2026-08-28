# SYNTHÈSE P-003 — EXTENSION À 6 CANDIDATS (mesures du 2026-08-27, soirée)

Extension du banc P-003 à **2 candidats supplémentaires** — `@shopify/restyle`
2.4.5 et `uniwind` 1.11.0 (**moteur libre MIT** ; le moteur C++ « Pro » est
payant et **n'a pas été bancé**) — décidée après revue de paysage indépendante.

**Les 4 mesures initiales n'ont PAS été rejouées.** Le protocole
(`docs/mobile-generation/benchmarks/P-003-styling.md`) n'a **pas** été modifié :
mêmes fixture, contrats, tokens, données, écrans, runner, appareils, mode
Release, New Architecture, GPU matériel, métriques et méthodes de calcul.
**AUCUN GAGNANT N'EST DÉSIGNÉ ICI — la décision P-003 appartient au propriétaire.**

## Audit de conformité exécuté AVANT les mesures

| Contrôle | Résultat |
|---|---|
| `fixture-core/` inchangée (git + diff dépôt↔espace de build) | ✅ intacte, identique |
| Versions communes (`expo 57.0.17`, `react-native 0.86.3`, `react 19.2.3`, `expo-file-system ~57.0.6`, `expo-status-bar ~57.0.1`) | ✅ identiques sur les 6 |
| Étanchéité : aucun import de bibliothèque dans les fichiers partagés | ✅ contrats et écrans étanches |
| Typecheck symétrique (`tsconfig.check.json` identique aux 6) | ✅ **6/6 vert** |
| Tokens : thème Uniwind **généré** depuis `fixture-core/tokens.json` (`gen-global-css.mjs`), comme `tailwind.config.js` de NativeWind | ✅ aucun token saisi à la main |
| Bundle ids / cibles / commandes de build | ✅ mêmes conventions |
| Méthode de poids JS revalidée : ré-export du candidat de référence → **1436 Ko**, identique à la valeur versionnée | ✅ méthode conforme |

## Perf liste — iOS (iPhone 17 Pro, iOS 26.5, Release, New Arch)

| Candidat | TTI (ms) | frames > 34 ms | maxFrame (ms) | bascule thème (médiane) |
|---|---|---|---|---|
| stylesheet | 21,6 | 0/360 | 18,7 | 33,3 (2 frames) |
| **uniwind** | **26,1** | **0/361** | **17,9** | **83,3 (5 frames)** |
| **restyle** | **33,9** | **0/361** | **18,7** | **66,7 (4 frames)** |
| unistyles | 58,5 | 0/360 | 18,6 | 33,3 (2 frames) |
| nativewind | 59,6 | 0/360 | 18,7 | 33,2 (2 frames) |
| tamagui | 74,1 | 0/360 | 23,8 | 166,7 (10 frames) |

## Perf liste — Android (AVD Pixel 7, Android 16, **GPU host**, Release)

| Candidat | TTI (ms) | frames > 34 ms | maxFrame (ms) | bascule thème (médiane) |
|---|---|---|---|---|
| **uniwind** | **24,7** | **0/360** | **23,9** | **55,8** |
| stylesheet | 29,2 | 0/360 | 24,6 | 43,9 |
| **restyle** | **31,9** | **0/360** | **24,1** | **66,9** |
| nativewind | 47,5 | 0/361 | 24,3 | 87,2 |
| tamagui | 69,0 | 0/361 | 25,4 | 175,9 |
| unistyles | 75,5 | 0/361 | 24,9 | 38,2 |

Android : deux passes exécutées pour les nouveaux candidats — la **passe
officielle** est la passe « machine au calme » (`android-extension.jsonl`) ;
la première passe (`android-extension-passe1.jsonl`) est conservée car une
charge iOS concurrente a existé pendant sa fenêtre de mesure.

## LIMITE DE MESURE DÉCOUVERTE — dispersion du TTI

Les nouveaux candidats ont été observés **3 fois chacun** sur iOS (run officiel
+ 2 relances des protocoles parité/RTL) :

| Candidat | TTI observés (iOS) | dispersion |
|---|---|---|
| restyle | 33,9 · 27,0 · 21,4 | **±37 %** |
| uniwind | 26,1 · 17,7 · 18,3 | **±38 %** |

**Conséquence, valable pour les 6 candidats** : la dispersion inter-runs du TTI
est du même ordre que les écarts entre candidats. **Le TTI ne discrimine
donc rien en dessous d'environ 30 ms d'écart.** La bascule de thème, elle, est
stable et quantifiée en frames — c'est la mesure de perf réellement
discriminante. (Les 4 candidats initiaux n'ont pas été rejoués : leur TTI est
issu d'un run unique et doit être lu avec la même réserve.)

## Poids

| Candidat | Bundle JS (Ko) | delta | .app iOS (Ko) | delta | APK (Ko) | delta |
|---|---|---|---|---|---|---|
| stylesheet | 1 436 | réf | 53 092 | réf | 66 960 | réf |
| **restyle** | **1 456** | **+20** | **53 108** | **+16** | **66 972** | **+12** |
| unistyles | 1 592 | +156 | 58 172 | +5 080 | 75 916 | +8 956 |
| **uniwind** | **1 728** | **+292** | **53 380** | **+288** | **67 188** | **+228** |
| nativewind | 2 524 | +1 088 | 62 868 | +9 776 | 78 100 | +11 140 |
| tamagui | 6 948 | +5 512 | 59 144 | +6 052 | 71 704 | +4 744 |

Lecture : le poids mesuré est le **coût total d'adoption** (bibliothèque +
dépendances pairs qu'elle impose). Restyle et Uniwind libre n'ajoutent
**aucun module natif** → deltas binaires quasi nuls. Unistyles impose
`react-native-nitro-modules`, NativeWind impose `react-native-reanimated`.

## RTL (I18nManager.forceRTL, flow Maestro identique, captures authentifiées)

**6/6** : miroir COMPLET et correct **sans aucun code spécifique candidat**
(prix, badges, navigation, sonde inversés). Nouvelles captures :
`results/rtl/rtl-restyle.png`, `results/rtl/rtl-uniwind.png`.

## Parité visuelle (contrôle ajouté, LTR)

Captures `results/parite/` : `restyle` et `uniwind` rendent **le même écran**
que le candidat de référence (mêmes espacements, rayons, couleurs, badges).
Contrôle motivé par un risque documenté chez Uniwind (issue amont #623 :
utilitaires de thème silencieusement ignorés) — **aucun style perdu constaté**.

## New Architecture

**6/6** : builds Release verts (`newArchEnabled=true`), **0 avertissement
spécifique au candidat** (seuls des avertissements génériques communs au
candidat de référence : cache Metro, version XML du SDK, dépréciation C++
d'`expo-modules-core`).

## Étanchéité contractuelle (disqualifiante)

**6/6 CONFORMES** : les 3 écrans compilent avec les MÊMES contrats
(`fixture-core/contracts.ts`, fichier unique) ; aucun type de bibliothèque
dans les contrats ni les écrans.

## DX générateur (LOC, hors commentaires et lignes vides)

| Candidat | Règle P-003 (fichiers `.ts`/`.tsx` du candidat) | Toutes configs incluses |
|---|---|---|
| **uniwind** | **83** | 168 (dont 40 de CSS **généré**) |
| nativewind | 94 | 127 |
| unistyles | 138 | 150 |
| stylesheet | 153 | 159 |
| tamagui | 168 | 183 |
| **restyle** | **170** | 176 |

La règle originale ne comptait pas les configs `.js`/`.css` ; la seconde
colonne, calculée **pour les 6** sans re-mesure, neutralise cet écart.

## Réserves de cadrage consignées (non corrigées — hors instruction)

1. **Tamagui a été bancé avec le paquet `tamagui` (kit UI complet + `react-dom`)
   et non `@tamagui/core`** : son delta de bundle (+5 512 Ko) mesure le kit,
   pas le moteur de styles. Résultat de poids **non concluant** pour Tamagui.
2. **NativeWind** embarque `react-native-reanimated 4.5.1` (dépendance pair de
   la bibliothèque) : son delta inclut cette dépendance.
3. **Uniwind** n'est bancé qu'en **moteur libre** ; les gains annoncés du moteur
   C++ « Pro » (payant, licences individuelle/équipe/CI-CD) restent **[non mesuré]**.
