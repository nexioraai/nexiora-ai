# SYNTHÈSE P-003 — BIBLIOTHÈQUE DE STYLING RN (mesures du 2026-08-27)

Protocole : `docs/mobile-generation/benchmarks/P-003-styling.md` — suivi sans
dérogation. Fixture commune (contrats partagés UNIQUES, tokens JSON source
unique, 500 cartes déterministes, scénario embarqué identique). Cibles :
iPhone 17 Pro (iOS 26.5, simulateur) · AVD Pixel 7 (Android 16, arm64,
**GPU matériel**). Builds **release**, New Architecture **activée 4/4**
(0 avertissement spécifique). AUCUN GAGNANT DÉSIGNÉ ICI — mesures brutes ;
la décision P-003 appartient au propriétaire.

## Perf liste (TTI premier layout + scroll auto 6 s / 500 cartes)

| Candidat | TTI iOS | TTI Android | >34 ms iOS | >34 ms And. | max frame iOS/And. |
|---|---|---|---|---|---|
| stylesheet (réf) | 21,6 ms | 29,2 ms | 0/360 | 0/360 | 18,7 / 24,6 ms |
| unistyles | 58,5 ms | 75,5 ms | 0/360 | 0/361 | 18,6 / 24,9 ms |
| tamagui | 74,1 ms | 69,0 ms | 0/360 | 0/361 | 23,8 / 25,4 ms |
| nativewind | 59,6 ms | 47,5 ms | 0/360 | 0/361 | 18,7 / 24,3 ms |

Scroll fluide 60 fps chez les 4 sur les 2 plateformes (aucune frame > 34 ms).

## Bascule de thème light↔dark (médiane de 10 bascules)

| Candidat | iOS | Android |
|---|---|---|
| stylesheet | 33,3 ms | 43,9 ms |
| unistyles | 33,3 ms | 38,2 ms |
| **tamagui** | **166,7 ms (×5)** | **175,9 ms (×4)** |
| nativewind | 33,2 ms | 87,2 ms (×2) |

Signature tamagui reproduite sur les DEUX plateformes et lors des runs RTL.

## Poids

| Candidat | Bundle JS (delta) | .app iOS (delta) | APK Android (delta) |
|---|---|---|---|
| stylesheet | 1 436 Ko (réf) | 53,1 Mo (réf) | 67,0 Mo (réf) |
| unistyles | **+156 Ko** | +5,1 Mo | +9,0 Mo |
| tamagui | **+5 512 Ko (×4,8)** | +6,1 Mo | +4,7 Mo |
| nativewind | +1 088 Ko | +9,8 Mo | +11,1 Mo |

## RTL (I18nManager.forceRTL, captures authentifiées par le candidat affiché)

4/4 : miroir COMPLET et correct sans aucun code spécifique candidat
(prix/badges/nav/sonde inversés) — captures dans `results/rtl/`.

## Étanchéité contractuelle (disqualifiante)

4/4 CONFORMES : les 3 écrans compilent avec les MÊMES contrats
(`fixture-core/contracts.ts`, fichier unique) pour les 4 candidats ; aucun
type de bibliothèque dans les contrats ni les écrans (vérifié : les écrans
n'importent que contrats + React/RN).

## DX générateur (LOC implémentation primitives + config, hors commentaires)

nativewind 94 · unistyles 138 · stylesheet 153 · tamagui 168.

## Limites de mesure consignées

Frames échantillonnées côté thread JS (RAF) — limite identique pour les 4,
comparaison valide ; valeurs simulateur/émulateur = COMPARATIVES, jamais
absolues ; `droppedOver17ms` bruité par la cadence d'affichage (seuil
proche du budget 60 Hz) — le signal fiable est `>34 ms` et `maxFrame`.

## Journal des anomalies d'environnement (toutes résolues sur preuve)

iCloud/FinderInfo → builds hors iCloud (~/deribfy-bench) · preset Expo 57
imbriqué → résolution explicite · plugin unistyles vs racine → src/ ·
react-dom + safe-area (tamagui) · reanimated aligné SDK (nativewind) ·
identités sed héritées → bundle ids explicites · cmake Intel /usr/local →
cmake.dir SDK 3.31.6 · JDK 25 (JBR) : WARNING natif stderr de prefab traité
FATAL par le parseur AGP → **JDK 21 Temurin** (~/jdk21) · console.log
release invisible (os_log/logcat) → canal fichier iOS (expo-file-system,
identique ×4) + dump uiautomator Android (attribut text='…' à apostrophes).
