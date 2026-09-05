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
  // ÉDITION CONSCIENTE (2026-09-02, E3.2 D-130) : AIR 1.7.0 — champ ADDITIF
  // `dataset.source`, migration identité (les 25 documents inchangés).
  // ÉDITION CONSCIENTE (2026-09-02, E3.3 D-131) : AIR 1.7.1 — APLANISSEMENT
  // de la provenance (l'union 1.7.0 dépassait la limite réelle de grammaire
  // de l'API, sonde différentielle) ; migration identité, sémantique
  // inchangée, aucun document ne portait la forme union.
  // 1.7.1 -> 1.8.0 (phase 3) : `navigation.primary.destinations[].icon`,
  // OPTIONNELLE et fermée. Montée MINEURE et ADDITIVE, migration identité.
// 1.8.0 -> 1.9.0 (DET-004) : `app.distribution` OPTIONNELLE — la liaison au
  // projet de build cesse d'être un ajout manuel après chaque régénération.
  airSchemaVersion: "1.9.0",
  // Porté à 1.1.0 le 2026-08-31 (D-060) : montée STRICTEMENT ADDITIVE du
  // registre de blocs — `form` gagne `loading`/`empty`, `detail_header` gagne un
  // état, les trois blocs à données gagnent les props de titres. Rien n'est
  // retiré. Motif : la dimension C d'A++ était INATTEIGNABLE sans cela.
  // ÉDITION CONSCIENTE (2026-09-02, E1/E2 D-129) : registre 1.3.0 — props
  // ADDITIFS (filtres pilotés, portée relationnelle) ; scellé des sources
  // recalculé dans le même geste, précédents D-060/D-084.
  blockRegistryVersion: "1.3.0",
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
  // ÉDITION CONSCIENTE (D-090). Le sceau change parce que `fieldRefProps` a été
  // complété sur `list` et `detail_header`. QUATRE props désignaient un champ
  // sans être vérifiées comme telles : `imageFieldId`, `searchFieldId` (ajoutées
  // en 1.2.0) et `sortFieldId`, `filterFieldId` (D-065, omises depuis l'origine).
  // Mesuré : pointer l'une d'elles vers un champ inexistant, ou vers celui d'une
  // AUTRE entité, passait la validation — et pour `imageFieldId`, cela faisait
  // TAIRE le diagnostic d'image orpheline sans rien afficher.
  // Aucune prop n'est ajoutée ni retirée : seule leur VÉRIFICATION est rétablie.
  blocksSourcesHash:
    // Ré-scellé 2026-09-05 (phase 2, refonte UX) : les options d'un filtre à
    // CHOIX passent d'un empilement pleine largeur à une rangée qui va à la
    // ligne — `<Section inline>`. Le bloc ne gagne AUCUN style : il déclare un
    // RÔLE, la primitive porte la forme, et le cliquet d'étanchéité reste
    // vérifié. Aucun type de bloc, aucune prop, aucun état n'est ajouté ni
    // retiré — un appelant antérieur est inchangé.
    // Ré-scellé 2026-08-31 (D-060) : montée ADDITIVE du registre en 1.1.0 —
  // `FormBlockState` gagne `loading`/`empty`, `DetailHeaderBlockProps` gagne
  // `state`, et les trois blocs consommant des données gagnent les props de
  // titres d'état. Aucun état, aucune prop, aucun type de bloc n'est RETIRÉ :
  // un appelant 1.0.0 est inchangé, ce que le cliquet du registre vérifie.
  // Ré-scellé 2026-08-31 (D-084) : `onPress` devient OPTIONNEL sur le bouton
  // et sur la primitive. Un effet que le moteur n'exécute pas — `slot` sur un
  // appui — ne doit pas offrir d'affordance : remède d'APP-D002 appliqué à un
  // second effet. 21 contrôles fantômes retirés sur les 26 applications.
  // Re-scelle 2026-08-31 (D-087) : registre 1.2.0 — `list` gagne vignette et
  // recherche, `detail_header` gagne son visuel, la primitive AppImage porte
  // leur style. Strictement additif, toutes props optionnelles.
  // ÉDITION CONSCIENTE (D-090) : `fieldRefProps` complété sur `list` et
  // `detail_header`. QUATRE props désignaient un champ SANS être vérifiées comme
  // telles — `imageFieldId`, `searchFieldId` (1.2.0), `sortFieldId`,
  // `filterFieldId` (D-065, omises depuis l'origine). Mesuré : les pointer vers
  // un champ inexistant, ou vers celui d'une AUTRE entité, passait la validation ;
  // et pour `imageFieldId`, cela FAISAIT TAIRE le diagnostic d'image orpheline
  // sans que rien ne soit rendu. Aucune prop ajoutée ni retirée : seule leur
  // VÉRIFICATION est rétablie. Version du registre INCHANGÉE (1.2.0).
// Ré-scellé (D-095) : SOURCE UNIQUE DES ÉTATS. `BLOCKS[].states` ne recopie
  // plus une liste à la main — il pointe sur les tableaux de `contracts.ts`,
  // d'où les types DÉRIVENT. Aucun état ajouté au moteur : `detail_header` et
  // `form` cessent simplement de SOUS-DÉCLARER ce que leurs composants rendent
  // déjà. La dérive F5 devient impossible par construction.
// Ré-scellé (D-104) : le registre déclare `porteAffordance` — un bloc est-il
  // pressable ? — et l'expose par `BLOCS_AFFORDANTS`. Le validateur REFUSE
  // désormais un déclencheur `ui` visant un bloc sans gestionnaire, et
  // `controls()` dérive de la même source au lieu d'une liste recopiée.
  // Aucun bloc, aucune prop, aucun état n'est ajouté ni retiré.
  "4f9e106eb57d0b09c08fdbf4a6e7547359be7905c4765e513b15d33226a5533e",
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
    // Ré-scellé 2026-09-05 (phase 3, refonte UX) : le gabarit gagne
    // `@expo/vector-icons` en 15.1.1 — version EXACTE, dans la fourchette
    // que le SDK 57 déclare lui-même (`bundledNativeModules` : ^15.0.2).
    // Sans elle, il n'existe AUCUN moyen de rendre une icône : le lock
    // pré-résolu de 504 paquets n'en portait aucune, et un glyphe Unicode
    // dans un `Text` n'est pas une icône — rendu variable selon la police
    // système, incohérent d'une plateforme à l'autre.
    // Lock régénéré et prouvé BYTE-IDENTIQUE sur deux passes
    // (`88cd87c4ce954642…`), 504 -> 505 paquets. Aucune autre dépendance
    // n'entre, aucune version existante ne bouge.
    "6770dd86157d0b2042013baaf798f1eb0d0eb193e31453baca1fe3397acadc8d",
  templateDevDependencies: {
    "@types/react": "19.2.15",
    typescript: "5.9.3",
  },

  // Dépendances EXACTES du gabarit (consommées en 4.2 ; la navigation est
  // le verdict S1 du banc V4 — versions installées et prouvées sur device).
  templateDependencies: {
    // AJOUTÉE 2026-09-05 (phase 3) — seule dépendance nouvelle du lot. Version
    // EXACTE, dans la fourchette que le SDK 57 déclare (`^15.0.2`). Elle rend
    // la dimension ⑤ réalisable : sans elle, aucune icône n'est rendable.
    "@expo/vector-icons": "15.1.1",
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
