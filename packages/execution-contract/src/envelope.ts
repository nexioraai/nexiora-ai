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
  /** Un champ `asset` désigné par un bloc est-il RENDU en image ? */
  readonly imageRendering: boolean;
  /** Une liste peut-elle porter une recherche qui FILTRE réellement ses lignes ? */
  readonly listSearch: boolean;
  /** `navigation.primary` produit-il une barre PERSISTANTE sur chaque écran ? */
  readonly primaryNavigation: boolean;
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
  // `lifecycle` entre le 2026-08-31 (D-068) : **62 actions du corpus étaient
  // déclarées avec un déclencheur de cycle de vie et purement IGNORÉES** — un
  // pan entier du contrat d'action sans implémentation. Les trois événements
  // sont honorés : `screen_open` au montage, `screen_close` au démontage,
  // `app_start` une fois sur l'écran d'entrée.
  // `data` reste absent : réagir à une création/modification d'entité suppose
  // une source qui NOTIFIE, et le contrat de données n'en a pas.
  triggers: ["ui", "lifecycle"],

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
  // VRAI depuis D-064 : un champ `reference` dont le document déclare
  // `referenceDisplayFieldId` est résolu en la valeur lisible de l'entité cible.
  // Sans déclaration, l'identifiant brut reste affiché — on ne devine pas quel
  // champ montrer, et l'enveloppe ne prétend pas le contraire.
  relationTraversal: true,

  // Aucune prop de filtre, de tri ou de pagination au registre de blocs gelé.
  // VRAI depuis D-065 : une liste peut être TRIÉE (`sortFieldId` +
  // `sortDirection`), FILTRÉE (`filterFieldId` + `filterOperator` +
  // `filterValue`) et BORNÉE (`pageSize`). Unions fermées, aucune expression
  // arbitraire. Sans props, la liste rend tout dans l'ordre du dataset —
  // comportement antérieur inchangé.
  listFiltering: true,

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
  // VRAI depuis D-067 : `design.theme` fait tourner la teinte de l'accent —
  // 12 thèmes déclarés au corpus produisaient UNE SEULE identité visuelle, ils
  // en produisent 12. Seule la TEINTE bouge ; saturation et luminosité sont
  // conservées, et l'encre est re-dérivée contre la surface la plus exigeante,
  // de sorte que la dimension B (contraste WCAG) tient : 0 échec sur 12.
  // Déterministe : même nom → même teinte. Les surcharges explicites du
  // document sont appliquées APRÈS et gardent la priorité.
  themeNameEffective: true,

  // `AirForm` porte un `useState` LOCAL, remis à zéro à chaque montage
  // d'écran. Un workflow multi-étapes perd ses données à chaque transition.
  // VRAI depuis D-066 : l'état d'un formulaire est tenu AU-DESSUS des écrans,
  // indexé par identifiant de bloc. Un retour en arrière ne le vide plus.
  // Portée exacte : magasin ÉPHÉMÈRE en mémoire — partagé entre écrans, remis à
  // zéro au redémarrage. Aucune persistance disque n'est promise ; ce serait une
  // capability, et elle n'en est pas une.
  crossScreenFormState: true,

  // D-088 — TROIS CAPACITÉS QUI EXISTAIENT SANS ÊTRE DÉCLARÉES.
  //
  // Le mot « image » n'apparaissait NULLE PART dans cette enveloppe alors que
  // le moteur rendait déjà les images. Conséquence MESURÉE, pas supposée : un
  // document généré a déclaré le besoin « les photos doivent être visibles »
  // INEXPRIMABLE, au motif que « le registre de blocs fermé ne sait rendre ni
  // vignette ni visuel ». Le motif était faux. Une enveloppe qui se tait ne
  // protège pas le générateur : elle le fait renoncer.
  //
  // Chacune des trois est déclarée VRAIE parce qu'elle appartient à la surface
  // que le générateur est AUTORISÉ à utiliser — prop du registre GELÉ ou champ
  // du contrat AIR — et qu'elle a été OBSERVÉE au rendu avec contrôle négatif,
  // jamais seulement lue dans le code du runtime.

  // `imageFieldId` (registre gelé : `list`, `detail_header`) → le runtime
  // résout le champ `asset` en `imageUri` → la primitive `AppImage` le rend
  // (`thumb` | `header`). Observé : vignette par ligne, visuel d'en-tête sur
  // le détail, et CONTRÔLE NÉGATIF — un écran sans champ image n'en rend aucune.
  imageRendering: true,

  // `searchFieldId` + `searchPlaceholder` (registre gelé : `list`). Le runtime
  // filtre les lignes RÉELLES avant tri et bornage. Observé : le champ précède
  // les lignes, et la saisie FILTRE réellement le rendu — ce n'est pas une
  // barre décorative.
  listSearch: true,

  // `navigation.primary` (AIR 1.6.0) → `<PrimaryNav>`, dernier enfant de la
  // coquille. Observé : présente sur CHAQUE écran avec les mêmes onglets, dans
  // l'ordre du document, sur UNE ligne et non empilés, et presser un onglet
  // navigue vers l'écran attendu.
  primaryNavigation: true,
} as const;
