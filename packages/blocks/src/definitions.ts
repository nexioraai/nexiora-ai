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

export const BLOCK_REGISTRY_VERSION = "0.1.0";

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
}

export const BLOCKS: readonly BlockDefinition[] = [
  {
    id: "button",
    version: "0.1.0",
    description: "Action autonome (CTA) — rendue par la primitive AppButton.",
    entity: "forbidden",
    propsSchema: z.strictObject({
      label: z.string().min(1),
      kind: z.enum(["primary", "ghost"]).optional(),
      actionId: actionRef.optional(),
    }),
    fieldRefProps: [],
    actionRefProps: ["actionId"],
    states: ["ready"],
  },
  {
    id: "detail_header",
    version: "0.1.0",
    description:
      "Tête d'écran de détail liée à une entité (titre, sous-titre, badges, valeur).",
    entity: "required",
    propsSchema: z.strictObject({
      titleFieldId: fieldRef,
      subtitleFieldId: fieldRef.optional(),
      badgeFieldIds: z.array(fieldRef).min(1).max(4).optional(),
      trailingFieldId: fieldRef.optional(),
    }),
    fieldRefProps: ["titleFieldId", "subtitleFieldId", "badgeFieldIds", "trailingFieldId"],
    actionRefProps: [],
    states: ["ready"],
  },
  {
    id: "empty_state",
    version: "0.1.0",
    description: "État vide explicite d'un écran — rendu par la primitive StateView.",
    entity: "forbidden",
    propsSchema: z.strictObject({
      title: z.string().min(1),
      message: z.string().min(1).optional(),
      actionLabel: z.string().min(1).optional(),
    }),
    fieldRefProps: [],
    actionRefProps: [],
    states: ["empty"],
  },
  {
    id: "form",
    version: "0.1.0",
    description:
      "Formulaire lié à une entité (champs, soumission, erreurs par champ).",
    entity: "required",
    propsSchema: z.strictObject({
      title: z.string().min(1).optional(),
      fieldIds: z.array(fieldRef).min(1),
      submitLabel: z.string().min(1),
    }),
    fieldRefProps: ["fieldIds"],
    actionRefProps: [],
    states: ["ready", "submitting", "error"],
  },
  {
    id: "header",
    version: "0.1.0",
    description: "Tête d'écran éditoriale (titre, sous-titre).",
    entity: "forbidden",
    propsSchema: z.strictObject({
      title: z.string().min(1),
      subtitle: z.string().min(1).optional(),
    }),
    fieldRefProps: [],
    actionRefProps: [],
    states: ["ready"],
  },
  {
    id: "list",
    version: "0.1.0",
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
    }),
    fieldRefProps: [
      "titleFieldId",
      "subtitleFieldId",
      "trailingFieldId",
      "badgeFieldId",
    ],
    actionRefProps: [],
    states: ["ready", "loading", "empty", "error"],
  },
];
