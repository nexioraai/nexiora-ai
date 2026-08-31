// ENVELOPPE D'EXÉCUTION — face CAPACITÉ du contrat d'exécution (Étape 1).
//
// POURQUOI CE MODULE EXISTE.
// Tout le moteur est fail-closed : allowlists positives sur les blocs, les
// capabilities, les imports de slots, les clés de surcharge de thème ;
// `strictObject` partout ; quatre validateurs qui refusent net. Une seule
// exception subsistait, et elle a produit à elle seule tous les symptômes
// mesurés du chantier — le dispatcher d'effets du runtime :
//
//   // capability / mutation / slot : non-opération v1 (Phases 5+/9).
//   (packages/compiler/runtime/air-runtime.tsx)
//
// Le moteur n'ignorait pas seulement ces effets : il ne SAVAIT PAS qu'il les
// ignorait. Conséquence directe et mesurée sur les 13 documents (12 du corpus
// gelé + le slice hors-template) : 169 actions sur 196 inertes, 15 blocs
// `form` sur 15 sans persistance, 0 capability sur 15 câblée — et malgré
// cela Oracle L1 7/7 et grille A++ A→H conformes.
//
// Ce module réifie la seconde face du contrat : CE QUE LE MOTEUR SAIT FAIRE.
// L'AIR décrit ce que l'app doit être ; l'enveloppe décrit ce que le moteur
// peut produire ; leur réconciliation (feasibility.ts) est l'étage qui
// manquait.
//
// PROPRIÉTÉ NON NÉGOCIABLE : cette enveloppe est une DÉCLARATION, donc elle
// peut mentir. Le cliquet `tests/envelope-truth.test.ts` la confronte au CODE
// RÉEL du runtime copié — l'enveloppe ne peut pas dériver en silence de ce
// que le moteur fait vraiment. C'est le même patron que les `sourcesHash` du
// release train : on ne fait jamais confiance à une déclaration.
//
// ÉVOLUTION : élargir l'enveloppe est une DÉCISION consignée + version
// MINEURE (patron D-020). Rétrécir est une RUPTURE (version MAJEURE).
// L'enveloppe ne s'élargit JAMAIS pour faire passer un document.

import type { ProjectAir } from "@deribfy/air-schema";

/** Version du CONTRAT d'enveloppe (scellée au train, patron D-027). */
export const EXECUTION_ENVELOPE_VERSION = "1.0.0";

export type EffectKind = ProjectAir["actions"][number]["effect"]["kind"];
export type TriggerKind = ProjectAir["actions"][number]["trigger"]["kind"];

/** Opérations que la couche de données du projet généré expose réellement. */
export type DataOperation = "list" | "get" | "create" | "update" | "delete" | "observe";

export interface ExecutionEnvelope {
  readonly version: string;
  /** Effets d'action que le runtime EXÉCUTE réellement. */
  readonly effects: readonly EffectKind[];
  /** Déclencheurs qui ATTEIGNENT réellement le dispatcher. */
  readonly triggers: readonly TriggerKind[];
  /** Opérations exposées par le contrat `DataProvider` du projet généré. */
  readonly dataOperations: readonly DataOperation[];
  /** États qu'un bloc peut réellement ATTEINDRE (≠ états qu'il sait rendre). */
  readonly reachableBlockStates: Readonly<Record<string, readonly string[]>>;
  /** Une capability déclarée produit-elle du code/des dépendances ? */
  readonly capabilitiesEmitCode: boolean;
  /** Un Code Slot déclaré est-il INVOQUÉ par l'application générée ? */
  readonly slotsInvoked: boolean;
  /** Les `air.rules` sont-elles appliquées quelque part ? */
  readonly rulesEnforced: boolean;
  /** Un bloc peut-il afficher un champ de l'entité CIBLE d'une référence ? */
  readonly relationTraversal: boolean;
  /** Une liste peut-elle être filtrée / triée / paginée ? */
  readonly listFiltering: boolean;
  /** `app.locales.rtlSupported` a-t-il un effet sur l'artefact ? */
  readonly rtlFlagEffective: boolean;
  /** `design.theme` seul (sans `design.overrides`) produit-il une identité ? */
  readonly themeNameEffective: boolean;
  /** L'état d'un formulaire survit-il à une transition d'écran ? */
  readonly crossScreenFormState: boolean;
}

/**
 * ENVELOPPE v1 — état MESURÉ du moteur au 2026-08-29, pas état souhaité.
 *
 * Chaque `false` ci-dessous est adossé à une preuve exécutée, citée en
 * commentaire. Aucune valeur n'est optimiste : une valeur douteuse se
 * déclare `false` (une capacité non démontrée n'est jamais réputée acquise —
 * protocole de preuve D-018).
 */
export const EXECUTION_ENVELOPE_V1: ExecutionEnvelope = {
  version: EXECUTION_ENVELOPE_VERSION,

  // `useDispatch` ne traite QUE `navigate` ; les trois autres branches sont
  // un commentaire. Mesuré : 27 actions exécutées sur 196.
  // `slot` N'ENTRE PAS ici, malgré D-058. `effects` décrit ce que le DISPATCHER
  // exécute sur un appui ; un slot lié est invoqué au RENDU de l'écran, pas par
  // le dispatcher. L'y ajouter aurait fait mentir l'enveloppe — le cliquet
  // `envelope-truth` l'a refusé, à raison. L'invocation est déclarée par
  // `slotsInvoked` ci-dessous, à sa place exacte.
  // `mutation` entre le 2026-08-31 (D-061) : le dispatcher présente l'écriture
  // au fournisseur de données. Un fournisseur en LECTURE SEULE n'expose pas la
  // méthode — l'appel est alors absent, jamais un faux succès.
  effects: ["navigate", "mutation"],

  // Seul `trigger.kind === "ui"` atteint un composant (via `uiActionsByBlock`
  // et les props `actionId`). `lifecycle` (68 occurrences) et `data` (36) ne
  // sont câblés à aucun mécanisme d'activation.
  triggers: ["ui"],

  // `DataProvider` (runtime copié) n'expose que `listInstances` et
  // `getInstance`. Aucune méthode d'écriture, aucun modèle d'observation.
  dataOperations: ["list", "get", "create", "update", "delete"],

  // Le registre de blocs DÉCLARE des états que le runtime ne peut pas
  // atteindre, faute de source de données asynchrone :
  //  - `list` déclare ready/loading/empty/error → AirList ne calcule que
  //    `empty` (items.length === 0) et `ready` ;
  //  - `form` déclare ready/submitting/error → AirForm code `state="ready"`
  //    EN DUR.
  // ÉLARGI le 2026-08-31 (D-060), après PREUVE AU RENDU — jamais l'inverse.
  //
  // `loading` et `error` étaient les états d'un monde asynchrone qui n'existait
  // pas : le fournisseur de données était purement synchrone et ne pouvait ni
  // attendre ni échouer. Deux des trois types consommant des données ne savaient
  // même pas les EXPRIMER (`form` sans `loading`/`empty`, `detail_header` sans
  // état). La dimension C d'A++ n'était donc pas non atteinte : elle était
  // INATTEIGNABLE (APP-D003 / DET-028).
  //
  // Chaque état listé ci-dessous a été OBSERVÉ au rendu avec contrôle négatif :
  // `etats-atteints.obs.tsx`. Aucun n'est déclaré sur lecture de source — c'est
  // exactement l'erreur que D-052 avait corrigée dans l'instrument.
  reachableBlockStates: {
    button: ["ready"],
    detail_header: ["ready", "loading", "empty", "error"],
    empty_state: ["empty"],
    form: ["ready", "loading", "empty", "error"],
    header: ["ready"],
    list: ["ready", "loading", "empty", "error"],
  },

  // Mesuré : ajouter la capability `maps` (implémentation `react-native-maps`)
  // à un AIR change 0 fichier du projet émis ; `package.json` reste identique.
  // Corollaire : l'empreinte native est INVARIANTE aux capabilities — le
  // critère de sortie de la Phase 11 est aujourd'hui infalsifiable.
  capabilitiesEmitCode: false,

  // DET-018 : la Phase 9 émet les modules de slots et un registre TYPÉ,
  // mais aucune convention de liaison n'existe dans le schéma gelé — l'app
  // ne les invoque jamais. Mesuré : 44 slots déclarés, 43 actions à effet
  // `slot`, 0 invocation.
  // VRAI depuis D-058, au sens EXACT suivant : un slot dont l'AIR porte une
  // liaison, et dont l'implémentation est fournie au compilateur, est exécuté à
  // l'ouverture de l'écran. Sans liaison, ou sans implémentation : non invoqué.
  slotsInvoked: true,

  // 71 règles déclarées sur le corpus, aucun consommateur dans le moteur.
  // VRAI depuis D-062 : les règles de `kind: "validation"` sont évaluées AVANT
  // toute écriture, et une violation ANNULE la mutation. Portée exacte : les
  // entités qu'un écran peut écrire. Les règles `authorization` ne sont PAS
  // appliquées — elles supposent une identité, que le moteur n'a pas.
  rulesEnforced: true,

  // Les `fieldRefProps` du registre de blocs (`list`, `detail_header`,
  // `form`) n'acceptent que des champs de l'entité LIÉE. Aucune syntaxe de
  // traversée n'existe. Conséquence rendue : un champ `reference` s'affiche
  // en identifiant brut (mesuré sur artefact : une ligne de liste dont le
  // titre est une clé étrangère affiche `<entite>_row_<n>`).
  relationTraversal: false,

  // Aucune prop de filtre, de tri ou de pagination au registre de blocs gelé.
  listFiltering: false,

  // Mesuré : `rtlSupported` true vs false → 0 fichier du projet ne diffère.
  // Le drapeau n'est lu que par le rendu texte de debug et le générateur de
  // flows E2E. Non-négociable #16 (« RTL réel ») non tenu côté artefact.
  // VRAI depuis D-063 : `app.locales.rtlSupported` pilote `I18nManager.allowRTL`
  // à la racine de l'app émise. Un document qui déclare le RTL produit désormais
  // un artefact DIFFÉRENT — le drapeau n'est plus transporté sans effet.
  rtlFlagEffective: true,

  // Mesuré : 13 thèmes déclarés → 2 identités visuelles émises. Seul
  // `design.overrides` agit (emit-theme.ts) ; `design.theme` est transporté
  // sans effet.
  themeNameEffective: false,

  // `AirForm` porte un `useState` LOCAL, remis à zéro à chaque montage
  // d'écran. Un workflow multi-étapes perd ses données à chaque transition.
  crossScreenFormState: false,
} as const;
