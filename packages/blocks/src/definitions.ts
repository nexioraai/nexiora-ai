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

// GELÉ (D-024, revue propriétaire du 2026-08-28). Règle d'évolution
// post-gel (D-020) : AJOUT compatible = décision consignée + édition
// consciente du cliquet + version MINEURE ; retrait/renommage/changement
// de contrat = RUPTURE (décision + migration + version MAJEURE).
// 1.1.0 (D-060, 2026-08-31) — montée STRICTEMENT ADDITIVE : `form` gagne
// `loading`/`empty`, `detail_header` gagne un état. Rien n'est retiré, `state`
// reste optionnel partout, un appelant 1.0.0 est inchangé. Motif : la dimension
// C d'A++ était INATTEIGNABLE — deux des trois types consommant des données ne
// savaient pas exprimer les états que le critère nomme.
export const BLOCK_REGISTRY_VERSION = "1.1.0";

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
    states: ["ready"],
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
      // REGISTRE 1.1.0 (D-060) — titres des états. DONNÉES, jamais texte moteur
      // (F3) : sans titre déclaré, l'état n'est pas rendu. Additif, optionnel.
      loadingTitle: z.string().min(1).optional(),
      emptyTitle: z.string().min(1).optional(),
      emptyMessage: z.string().min(1).optional(),
      errorTitle: z.string().min(1).optional(),
      errorMessage: z.string().min(1).optional(),

      trailingFieldId: fieldRef.optional(),
    }),
    fieldRefProps: ["titleFieldId", "subtitleFieldId", "badgeFieldIds", "trailingFieldId"],
    actionRefProps: [],
    states: ["ready"],
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
    states: ["empty"],
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
    states: ["ready", "submitting", "error"],
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
    states: ["ready"],
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
