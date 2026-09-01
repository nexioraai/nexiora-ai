// REGISTRE DE SMART BLOCKS v1 (D-023) — ALLOWLIST POSITIVE : un blockType
// absent d'ici est REFUSÉ NET par le pont validateAirBlocks (patron D-020).
// Granularité : blocs COMPOSITES DE PRIMITIVES, sections d'écran (l'AIR v1
// gelé fige screens[].blocks[]). Les primitives restent HORS registre.
// Chaque définition fixe le SCHÉMA STRICT des props AIR (clé inconnue =
// refus) — le corpus a prouvé que sans schéma fermé, le LLM dérive jusque
// dans les clés de props ([mesuré] : clés en français dans un document).
// Pas d'élargissement « au cas où » : ajout = décision consignée + édition
// consciente du cliquet + version mineure (règle d'évolution D-020).
import { z } from "zod";
// D-095 — SOURCE UNIQUE DES ÉTATS. Le registre ne redéclare plus aucune liste :
// il pointe sur les tableaux de `contracts.ts`, d'où les types DÉRIVENT aussi.
// La dérive mesurée en F5 (detail_header déclarait 1 état sur 4, form 3 sur 5)
// devient impossible par construction, et non plus seulement détectable.
import {
  BUTTON_BLOCK_STATES,
  DETAIL_HEADER_BLOCK_STATES,
  EMPTY_STATE_BLOCK_STATES,
  FORM_BLOCK_STATES,
  HEADER_BLOCK_STATES,
  LIST_BLOCK_STATES,
} from "./contracts.ts";

// GELÉ (D-024, revue propriétaire du 2026-08-28). Règle d'évolution
// post-gel (D-020) : AJOUT compatible = décision consignée + édition
// consciente du cliquet + version MINEURE ; retrait/renommage/changement
// de contrat = RUPTURE (décision + migration + version MAJEURE).
// 1.1.0 (D-060, 2026-08-31) — montée STRICTEMENT ADDITIVE : `form` gagne
// `loading`/`empty`, `detail_header` gagne un état. Rien n'est retiré, `state`
// reste optionnel partout, un appelant 1.0.0 est inchangé. Motif : la dimension
// C d'A++ était INATTEIGNABLE — deux des trois types consommant des données ne
// savaient pas exprimer les états que le critère nomme.
// 1.2.0 (D-087) — montée STRICTEMENT ADDITIVE : `list` gagne la vignette et la
// recherche, `detail_header` gagne son visuel. Rien n'est retiré, toutes les
// props sont optionnelles. Motif : 23 champs image declares sur 12 documents,
// RENDUS NULLE PART — le besoin du premier jour (« menu avec photos »).
export const BLOCK_REGISTRY_VERSION = "1.2.0";

// Motifs d'identités stables — IDENTIQUES à @deribfy/air-schema (ids.ts) ;
// redéclarés structurellement (patron AirCapabilitySlice : pas de couplage
// de types entre paquets).
const ID_BODY = "[a-z0-9][a-z0-9_]{0,61}";
const fieldRef = z.string().regex(new RegExp(`^fld_${ID_BODY}$`));
const actionRef = z.string().regex(new RegExp(`^act_${ID_BODY}$`));

export type EntityBinding = "required" | "forbidden";

export interface BlockDefinition {
  /** Clé du registre — le `blockType` de l'AIR. */
  id: string;
  /** Version du CONTRAT du bloc (gel v1 = revue propriétaire, patron 2.5). */
  version: string;
  description: string;
  /** Liaison d'entité : exigée ou interdite — jamais ambiguë. */
  entity: EntityBinding;
  /** Schéma STRICT des props AIR (après conversion de la liste plate). */
  propsSchema: z.ZodType;
  /** Clés de props qui référencent des CHAMPS de l'entité liée. */
  fieldRefProps: readonly string[];
  /** Clés de props qui référencent des ACTIONS de l'AIR. */
  actionRefProps: readonly string[];
  /** États rendus par le composant (exigence du harnais 3.4). */
  states: readonly string[];
  /**
   * D-104 — LE BLOC PORTE-T-IL UNE AFFORDANCE ?
   *
   * Autrement dit : l'utilisateur peut-il DÉCLENCHER quelque chose depuis ce
   * bloc ? La réponse est décidable et vérifiée : un bloc porte une affordance
   * ssi son contrat déclare un gestionnaire `on*` — `onPress`, `onItemPress`,
   * `onSubmit`, `onAction`. `etancheite-affordance.test.ts` lie cette
   * déclaration au contrat et la fait échouer si les deux divergent.
   *
   * Deux consommateurs en dérivent, au lieu de recopier chacun sa liste :
   * `validateAirBlocks` (qui REFUSE un déclencheur `ui` sur un bloc sans
   * affordance) et `controls()` (qui compte les contrôles fantômes).
   */
  porteAffordance: boolean;
}

export const BLOCKS: readonly BlockDefinition[] = [
  {
    id: "button",
    version: "1.0.0",
    description: "Action autonome (CTA) — rendue par la primitive AppButton.",
    entity: "forbidden",
    // F1 (revue pré-gel 2026-08-28) : actionId REQUIS — un CTA sans action
    // câblée serait un bouton mort dans l'app générée, divergence silencieuse
    // AIR ↔ app (l'AIR est la source de vérité, non-négociable 1).
    propsSchema: z.strictObject({
      label: z.string().min(1),
      kind: z.enum(["primary", "ghost"]).optional(),
      actionId: actionRef,
    }),
    fieldRefProps: [],
    actionRefProps: ["actionId"],
    states: BUTTON_BLOCK_STATES,
    porteAffordance: true,
  },
  {
    id: "detail_header",
    version: "1.0.0",
    description:
      "Tête d'écran de détail liée à une entité (titre, sous-titre, badges, valeur).",
    entity: "required",
    propsSchema: z.strictObject({
      titleFieldId: fieldRef,
      subtitleFieldId: fieldRef.optional(),
      // min(1) est NORMATIF : interdit deux représentations de « aucun
      // badge » ([] vs absence) — forme canonique unique (déterminisme,
      // même esprit que la canonicalisation AIR). La borne max(4) initiale
      // a été SUPPRIMÉE en revue pré-gel : aucune source (AIR/ROADMAP/
      // décisions/corpus — max observé : 3), elle aurait rejeté des AIR
      // légitimes sans protéger aucune propriété architecturale.
      badgeFieldIds: z.array(fieldRef).min(1).optional(),
      /** Visuel d'en-tete de fiche (1.2.0, D-087) — champ de type `asset`. */
      imageFieldId: fieldRef.optional(),
      // REGISTRE 1.1.0 (D-060) — titres des états. DONNÉES, jamais texte moteur
      // (F3) : sans titre déclaré, l'état n'est pas rendu. Additif, optionnel.
      loadingTitle: z.string().min(1).optional(),
      emptyTitle: z.string().min(1).optional(),
      emptyMessage: z.string().min(1).optional(),
      errorTitle: z.string().min(1).optional(),
      errorMessage: z.string().min(1).optional(),

      trailingFieldId: fieldRef.optional(),
    }),
    // D-090 — `imageFieldId` MANQUAIT ICI. Il était déclaré au `propsSchema`
    // mais absent de `fieldRefProps` : rien ne vérifiait donc qu'il désigne un
    // champ de l'entité LIÉE. Mesuré : le pointer vers un champ inexistant, ou
    // vers celui d'une AUTRE entité, passait la validation — et faisait TAIRE
    // le diagnostic d'image orpheline sans que rien ne soit affiché.
    fieldRefProps: [
      "titleFieldId",
      "subtitleFieldId",
      "badgeFieldIds",
      "trailingFieldId",
      "imageFieldId",
    ],
    actionRefProps: [],
    states: DETAIL_HEADER_BLOCK_STATES,
    porteAffordance: false,
  },
  {
    id: "empty_state",
    version: "1.0.0",
    description: "État vide explicite d'un écran — rendu par la primitive StateView.",
    entity: "forbidden",
    // F2 (revue pré-gel 2026-08-28) : APPARIEMENT OBLIGATOIRE, dans les
    // deux sens — un actionLabel sans actionId serait silencieusement
    // ignoré au rendu (divergence AIR ↔ app) ; un actionId sans libellé ne
    // serait pas rendable. Forme choisie : superRefine sur l'objet strict —
    // exprime l'invariant d'appariement directement et produit des
    // diagnostics ciblés (path actionId / actionLabel), là où une union
    // dégraderait les messages en « aucune branche ne correspond ».
    propsSchema: z
      .strictObject({
        title: z.string().min(1),
        message: z.string().min(1).optional(),
        actionLabel: z.string().min(1).optional(),
        actionId: actionRef.optional(),
      })
      .superRefine((value, ctx) => {
        if (value.actionLabel !== undefined && value.actionId === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["actionId"],
            message:
              "actionLabel déclaré sans actionId — le libellé serait ignoré au rendu (appariement obligatoire)",
          });
        }
        if (value.actionId !== undefined && value.actionLabel === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["actionLabel"],
            message:
              "actionId déclaré sans actionLabel — l'action ne serait pas rendable (appariement obligatoire)",
          });
        }
      }),
    fieldRefProps: [],
    actionRefProps: ["actionId"],
    states: EMPTY_STATE_BLOCK_STATES,
    porteAffordance: true,
  },
  {
    id: "form",
    version: "1.0.0",
    description:
      "Formulaire lié à une entité (champs, soumission, erreurs par champ).",
    entity: "required",
    propsSchema: z.strictObject({
      title: z.string().min(1).optional(),
      fieldIds: z.array(fieldRef).min(1),
      submitLabel: z.string().min(1),
      // REGISTRE 1.1.0 (D-060) — titres des états. DONNÉES, jamais texte moteur
      // (F3) : sans titre déclaré, l'état n'est pas rendu. Additif, optionnel.
      loadingTitle: z.string().min(1).optional(),
      emptyTitle: z.string().min(1).optional(),
      emptyMessage: z.string().min(1).optional(),
      errorTitle: z.string().min(1).optional(),
      errorMessage: z.string().min(1).optional(),

    }),
    fieldRefProps: ["fieldIds"],
    actionRefProps: [],
    states: FORM_BLOCK_STATES,
    porteAffordance: true,
  },
  {
    id: "header",
    version: "1.0.0",
    description: "Tête d'écran éditoriale (titre, sous-titre).",
    entity: "forbidden",
    propsSchema: z.strictObject({
      title: z.string().min(1),
      subtitle: z.string().min(1).optional(),
    }),
    fieldRefProps: [],
    actionRefProps: [],
    states: HEADER_BLOCK_STATES,
    porteAffordance: false,
  },
  {
    id: "list",
    version: "1.0.0",
    description:
      "Liste d'instances d'une entité (liaisons de champs vers les lignes).",
    entity: "required",
    propsSchema: z.strictObject({
      title: z.string().min(1).optional(),
      titleFieldId: fieldRef,
      subtitleFieldId: fieldRef.optional(),
      trailingFieldId: fieldRef.optional(),
      badgeFieldId: fieldRef.optional(),
      emptyTitle: z.string().min(1).optional(),
      emptyMessage: z.string().min(1).optional(),
      // REGISTRE 1.1.0 (D-060) — titres des états `loading`/`error`. DONNÉES du
      // document, jamais texte moteur (F3) : sans titre déclaré, l'état n'est
      // pas rendu. Additif et optionnel — un document 1.0.0 est inchangé.
      loadingTitle: z.string().min(1).optional(),
      errorTitle: z.string().min(1).optional(),
      errorMessage: z.string().min(1).optional(),
      // TRI, FILTRE, PAGINATION (D-065) — `listFiltering: false` signifiait
      // qu'une liste rendait TOUJOURS tout, dans l'ordre du dataset. Unions
      // FERMÉES : aucune expression arbitraire n'entre dans un document.
      // IMAGE ET RECHERCHE (1.2.0, D-087) — additives, optionnelles. Sans
      // elles, la liste rend EXACTEMENT ce qu'elle rendait en 1.1.0.
      imageFieldId: fieldRef.optional(),
      searchFieldId: fieldRef.optional(),
      searchPlaceholder: z.string().min(1).optional(),
      sortFieldId: fieldRef.optional(),
      sortDirection: z.enum(["asc", "desc"]).optional(),
      filterFieldId: fieldRef.optional(),
      filterOperator: z.enum(["eq", "neq", "contains"]).optional(),
      filterValue: z.string().min(1).optional(),
      pageSize: z.number().int().positive().max(200).optional(),

    }),
    // D-090 — QUATRE props manquaient ici, pas deux. `imageFieldId` et
    // `searchFieldId` (registre 1.2.0), mais aussi `sortFieldId` et
    // `filterFieldId` (D-065), omis depuis leur introduction : un tri ou un
    // filtre sur un champ inexistant passait la validation et devenait
    // silencieusement inopérant au rendu. Le cliquet d'exhaustivité les a
    // trouvés tous les quatre.
    fieldRefProps: [
      "titleFieldId",
      "subtitleFieldId",
      "trailingFieldId",
      "badgeFieldId",
      "imageFieldId",
      "searchFieldId",
      "sortFieldId",
      "filterFieldId",
    ],
    actionRefProps: [],
    states: LIST_BLOCK_STATES,
    porteAffordance: true,
  },
];

/**
 * D-104 — SOURCE UNIQUE DES AFFORDANCES. Le validateur et `controls()` la
 * lisent tous deux, au lieu de recopier chacun sa liste. C'est l'architecture
 * qui avait produit D-095 et D-101 ; elle ne se répète pas ici.
 */
export const BLOCS_AFFORDANTS: ReadonlySet<string> = new Set(
  BLOCKS.filter((b) => b.porteAffordance).map((b) => b.id),
);
