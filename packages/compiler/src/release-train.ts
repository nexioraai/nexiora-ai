// RELEASE TRAIN v1 (Phase 4.1, D-026/D-027 — ARCHITECTURE §25).
// Une release FIXE : AIR schema, blocks, capabilities, tokens, Expo/RN,
// toolchain. Tous les pins ci-dessous sont DÉMONTRÉS : harnais 3.4 et banc
// P-003 (Expo/RN/React), micro-banc V4 B-NAV (navigation, verdict S1
// consigné D-026), validations V2/V3/V5 (Node, npm ci reproductible).
// Les hash de sources scellent les paquets GELÉS que ce train embarque
// (D-020, D-024, tokens 3.1) : le test de garde du paquet les recalcule
// depuis les sources réelles — toute divergence = échec de CI (édition
// consciente requise, patron cliquet).
export const RELEASE_TRAIN_V1 = {
  id: "rt-2026.08",
  version: "1.0.0",

  // Contrats gelés embarqués par le train.
  airSchemaVersion: "1.0.0",
  blockRegistryVersion: "1.0.0",
  blocksSourcesHash:
    "b488608b4f20c2b9845324974a23f2ad65630860812ea6e76746ab5bce84dd4f",
  capabilityRegistryVersion: "1.0.0",
  capabilitySourcesHash:
    "6c28599246abde6e7010704f23f273aafe50d17c5483133709c9065f2777346c",
  designTokensVersion: "1.0.0",
  designTokensSourcesHash:
    "e16ce4bf01a07ce005d394c6536331dc6073e411d72d90f47644afc102ac4727",

  // Toolchain du projet généré (pins exacts démontrés — lock.toolchain).
  // Planchers RÉELS de plateforme du train (mesurés sur le prebuild du
  // banc V4 : merged manifest minSdk 24 ; Podfile deploymentTarget 16.4).
  // air.native est appliqué par max(plancher, exigence) via
  // expo-build-properties (D-029).
  platformFloors: {
    androidMinSdk: 24,
    iosDeploymentTarget: "16.4",
  },

  toolchain: {
    node: "24.16.0",
    expoSdk: "57.0.17",
    reactNative: "0.86.3",
  },

  // Scellé du GABARIT versionné (4.2, D-027-R42) : Merkle des fichiers de
  // `template/` (dont le package-lock.json pré-résolu, généré ×2
  // byte-identique). Le test de garde le recalcule — toute édition du
  // gabarit est une évolution consciente du train.
  // Ré-scellé en 4.3 (D-028) : + allowImportingTsExtensions au tsconfig
  // (exigé par les copies — imports `./contracts.ts`, patron 3.4 ;
  // expo/tsconfig.base ne le pose pas, règle TS5097) ; + devDependency
  // typescript 5.9.3 EXACTE (l Oracle §9 exécute tsc strict DANS la
  // sandbox du projet généré — démontré au banc v43 : sans lui, npx
  // résout le paquet-piège `tsc`). Lockfile regénéré ×2 byte-identique ;
  // preuves v42 REJOUÉES après extension (jsonl, entrées 2026-08-28b).
  // + @types/react 19.2.15 EXACTE (react ne livre pas ses types ; TS7016
  // démontré au banc v43 — RN 0.86 livre les siens). Scellé recalculé.
  // Ré-scellé en 4.4 (D-029) : + expo-build-properties 57.0.15 EXACTE
  // (bundledNativeModules SDK 57) — SEUL mécanisme Expo officiel pour
  // appliquer air.native (minSdk/deploymentTarget) au prebuild ; démontré
  // nécessaire : 10/12 documents exigent minAndroidSdk 26 > plancher 24.
  templateHash:
    "1985378e905e4b86af4ac272d6eb9a39e42b66c586ee98fdecbbd95d7c92244f",
  templateDevDependencies: {
    "@types/react": "19.2.15",
    typescript: "5.9.3",
  },

  // Dépendances EXACTES du gabarit (consommées en 4.2 ; la navigation est
  // le verdict S1 du banc V4 — versions installées et prouvées sur device).
  templateDependencies: {
    expo: "57.0.17",
    "expo-build-properties": "57.0.15",
    "expo-status-bar": "3.0.9",
    react: "19.2.3",
    "react-native": "0.86.3",
    "@react-navigation/native": "7.3.18",
    "@react-navigation/native-stack": "7.18.10",
    "react-native-screens": "4.26.2",
    "react-native-safe-area-context": "5.7.0",
  },
} as const;

export type ReleaseTrain = typeof RELEASE_TRAIN_V1;
