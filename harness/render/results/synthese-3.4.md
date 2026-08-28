# SYNTHÈSE 3.4 — HARNAIS DE RENDU SUR DEVICE/ÉMULATEUR (2026-08-28)

Critère ROADMAP Phase 3 : « harnais de rendu sur device/émulateur
(light/dark, RTL, états loading/empty/error) **vert** » — sur les Smart
Blocks **GELÉS** (D-024) composés des primitives 3.2 et des tokens 3.1.
Dossier validé propriétaire : **H1** (app autonome `harness/render/`, hors
workspaces) + **M1** (5 écrans) + **V2** (preuve mécanisée Maestro).

## Conditions

| Élément | Valeur |
|---|---|
| App | `harness/render/` — substitut du compilateur : ScreenShell + blocs gelés, libellés/données/callbacks fournis par le harnais (F3) |
| Paquets consommés | `@deribfy/blocks` 1.0.0 (gelé) · `@deribfy/primitives` · `@deribfy/design-tokens` — **vraies sources**, via metro `watchFolders`/`extraNodeModules` |
| Cibles | iPhone 17 Pro (simulateur iOS 26.5, UDID du banc) · AVD `bench_pixel` (Pixel 7, Android 16) — builds **Release**, New Architecture |
| Protocole | `preparer` (environnement) → `parcours` (assertions + captures light PUIS dark) → `rtl-bascule` (forceRTL + relance) → **REJEU INCHANGÉ de `parcours`** → `rtl-restore` |

## Verdict par critère

| Critère | iOS | Android | Preuve |
|---|---|---|---|
| 5 écrans (M1) rendus et navigués | 🟢 | 🟢 | assertions `parcours.yaml` |
| 6 blocs gelés rendus | 🟢 | 🟢 | header/list/form/button/empty_state/detail_header tous assertés |
| 4 compositions de référence | 🟢 | 🟢 | AuthFlow (secure+submit), List/Detail, Form (error/submitting), Profile |
| **Tap RÉEL List → Detail (réserve D-024)** | 🟢 | 🟢 | `tapOn catalogue-row-itm_3` → `assertVisible detail-screen` + titre — toucher natif Maestro, pas un stub |
| light/dark | 🟢 | 🟢 | bascule assertée (`thème : dark`) + 5 écrans re-assertés + captures des deux schémas |
| RTL | 🟢 | 🟢 | `RTL : ACTIF` asserté après relance + **parcours complet rejoué à l'identique** + captures miroir (sonde, prix, badges, nav inversés) |
| loading / empty / error | 🟢 | 🟢 | les 3 états assertés visibles (ListBlock) + `empty_state` + actions retry/parcourir déclenchées et vérifiées |

**HARNAIS : VERT sur les deux plateformes** (journaux `journal-ios.log`,
`journal-android.log` ; 44 captures : `ios/`, `ios-rtl/`, `android/`,
`android-rtl/`).

## Anomalies rencontrées (aucune corrigée sans cause démontrée)

1. **Dialogue de deep-link post-build** (« Ouvrir dans render-harness ? ») —
   artefact d'environnement d'`expo run:ios`, déjà observé au banc P-003 ;
   masquait la première assertion. Traité par un flow `preparer.yaml`
   **hors critères** (le protocole V2 est inchangé).
2. **`takeScreenshot` Maestro 2.9 refuse les chemins absolus** hors de son
   dossier de run — captures passées en chemins relatifs + rapatriement par
   le runner. Ajustement d'outillage, pas de protocole.
3. **DÉFAUT DE COMPOSITION DÉMONTRÉ SUR DEVICE (la trouvaille de 3.4)** :
   en dark, fond d'écran resté clair sous des textes clairs — cause : les
   écrans du harnais empilaient les blocs **sans `ScreenShell`**, la
   primitive qui peint le fond thémé. Correction dans le **harnais seul**
   (aucun paquet gelé touché), rebuilds des deux plateformes, **protocole
   intégralement rejoué** (les PASS antérieurs à la correction ont été
   invalidés et re-prouvés). **NOTE D'ARCHITECTURE CONSIGNÉE pour la
   Phase 4 : le compilateur DOIT émettre chaque écran comme
   `ScreenShell(titre) + blocs` — un écran de blocs nus n'est pas thémable.**

## Limites honnêtes

- Simulateur/émulateur (pas d'appareils physiques) — conforme à la lettre du
  critère (« device/émulateur ») et au précédent P-003/E2E.
- Le harnais prouve le **rendu et l'interaction** des blocs gelés ; il ne
  prouve ni la compilation depuis l'AIR (Phase 4) ni l'accessibilité outillée
  (Oracle, phases ultérieures).

Coût : **0 $**. Zones gelées : **0 modification**.
