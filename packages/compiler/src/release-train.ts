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
  // Porté à 1.1.0 le 2026-08-29 (D-044, DET-017 volet 2) : le schéma gagne le
  // champ OPTIONNEL `visibleWhen` sur les blocs. Les 12 documents du corpus
  // GELÉ restent byte-identiques sur disque — ils déclarent 1.0.0 et sont
  // MIGRÉS en mémoire par le mécanisme prévu depuis la Phase 2, câblé pour la
  // première fois ici. Conséquence assumée et mesurée : l'`airHash` change,
  // donc tous les `rootHash` changent — c'est le prix d'une évolution de
  // contrat, pas une dérive.
  // Porté à 1.2.0 le 2026-08-31 (D-056) : le schéma gagne le champ OPTIONNEL
  // `intent` — la demande du client, que l'AIR ne conservait NULLE PART
  // (racine mesurée, APP-D004). Même mécanique qu'en 1.1.0 : le corpus GELÉ
  // reste byte-identique sur disque, il est MIGRÉ en mémoire, et la migration
  // n'invente aucune intention. Conséquence assumée : l'`airHash` change,
  // donc tous les `rootHash`. C'est le prix d'une évolution de contrat.
  // Porté à 1.3.0 le 2026-08-31 (D-058) : le schéma gagne le champ OPTIONNEL
  // `binding` sur l'effet `slot` — d'où viennent ses entrées, où vont ses
  // sorties. Même mécanique qu'en 1.1.0 et 1.2.0 : corpus gelé byte-identique,
  // migré en mémoire, aucune liaison inventée.
  airSchemaVersion: "1.4.0",
  // Porté à 1.1.0 le 2026-08-31 (D-060) : montée STRICTEMENT ADDITIVE du
  // registre de blocs — `form` gagne `loading`/`empty`, `detail_header` gagne un
  // état, les trois blocs à données gagnent les props de titres. Rien n'est
  // retiré. Motif : la dimension C d'A++ était INATTEIGNABLE sans cela.
  blockRegistryVersion: "1.1.0",
  // Ré-scellé le 2026-08-29 (DET-006 / D-039) : `ListBlock` DÉCLARE désormais
  // `fill` sur sa Section, afin que la liste virtualisée reçoive un parent
  // BORNÉ. Cause démontrée : imbriquée dans un ScrollView de même axe, une
  // FlatList reçoit une hauteur infinie et rend tous ses éléments — la
  // virtualisation est neutralisée (dimension G de la grille A++). AUCUN
  // style n'a été ajouté au paquet `blocks` : la contrainte D-021/D-023
  // (« aucun StyleSheet, aucun style en dur ») est préservée — le style est
  // porté par la primitive Section. Version du registre INCHANGÉE (1.0.0) :
  // aucun contrat de bloc, aucun schéma de props, aucun type de bloc n'a
  // changé — seule la composition interne évolue.
  blocksSourcesHash:
    // Ré-scellé 2026-08-31 (D-060) : montée ADDITIVE du registre en 1.1.0 —
  // `FormBlockState` gagne `loading`/`empty`, `DetailHeaderBlockProps` gagne
  // `state`, et les trois blocs consommant des données gagnent les props de
  // titres d'état. Aucun état, aucune prop, aucun type de bloc n'est RETIRÉ :
  // un appelant 1.0.0 est inchangé, ce que le cliquet du registre vérifie.
  "fbc00e8bd994d01a3f0500ebab5d3acd6183b06ee46f3569912a8984d1de21a7",
  capabilityRegistryVersion: "1.0.0",
  capabilitySourcesHash:
    "6c28599246abde6e7010704f23f273aafe50d17c5483133709c9065f2777346c",
  designTokensVersion: "1.2.0",
  // Ré-scellé le 2026-08-29 (D-039/D-039-R1) : évolution des tokens en
  // 1.1.0 — correction de DEUX non-conformités A++ prouvées. Dimension B :
  // `onPrimary` passe de #FFFFFF à #16181D (blanc sur l'accent #FA5D1E =
  // 3,16:1, sous le seuil WCAG 2.2 AA de 4,5:1 ; l'encre sombre donne
  // 5,62:1 en PRÉSERVANT l'accent de marque à l'identique). Dimension A :
  // nouveau groupe `size.tapTarget` = 48, qui satisfait simultanément les
  // 44 pt d'iOS et les 48 dp de Material sans ramification Platform.OS.
  // Ré-scellé le 2026-08-29 (P-007, DESIGN SYSTEM v2 — Phase 10). Évolution
  // MINEURE, surface additive : 3 groupes ajoutés (`fontWeight`, `opacity`,
  // `space.xxs`), tous avec un consommateur réel dans les primitives, plus
  // UNE correction de valeur (`color.light.warn` #8A6D00 → #866A00 : 4,34:1
  // sur `badgeBg`, sous le seuil AA, mesuré). S'y ajoute un token DÉRIVÉ,
  // `color.*.primaryText`, calculé depuis l'accent : l'accent de marque
  // #FA5D1E est PRÉSERVÉ et cesse d'être une couleur de texte (DET-019).
  // Le cliquet de surface de majeure vérifie qu'aucune clé n'a disparu ni
  // changé de type — la compatibilité mineure reste donc mécanique.
  designTokensSourcesHash:
    "4786eec85b103f893b5a45fb86ee0b7bc659c7c810ea839a98ff8897e56bd97d",

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
