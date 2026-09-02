import { z } from "zod";
import {
  actionIdSchema,
  blockIdSchema,
  capabilityRefSchema,
  datasetIdSchema,
  entityIdSchema,
  fieldIdSchema,
  integrationIdSchema,
  projectIdSchema,
  relationIdSchema,
  routeIdSchema,
  ruleIdSchema,
  screenIdSchema,
  slotIdSchema,
  needIdSchema,
  testIdSchema,
} from "./ids.ts";

// 1.7.0 (E3.2, D-130) : `dataset.source` OPTIONNEL — seed | remote déclaré.
// 1.7.1 (E3.3, D-131) : provenance APLANIE (sourceKind/sourceIntegrationId/
//   sourceDomain/sourceRefreshSeconds) — l'union 1.7.0 dépassait la limite
//   réelle de grammaire de l'API (classe D-078) ; sémantique inchangée.
export const AIR_SCHEMA_VERSION = "1.7.1";

export const semverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
export const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

// BCP 47 restreint : langue[-Script][-RÉGION]. Le support RTL est un flag
// explicite (non-négociable #16), pas une déduction depuis la locale.
export const localeSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?$/);

// Texte localisé : liste {locale, text} — représentation FERMÉE. L'API
// structured outputs REFUSE les objets à clés libres (additionalProperties
// doit être false, patternProperties non supporté) [mesuré 2026-08-27,
// campagne 2.4] : tout ce qui doit être émis par LLM est donc modélisé en
// tableaux de paires. Unicité des locales et couverture de la locale par
// défaut vérifiées par le validateur sémantique.
export const localizedTextSchema = z
  .array(z.strictObject({ locale: localeSchema, text: z.string().min(1) }))
  .min(1);

// Valeurs de configuration STRICTEMENT plates : liste {key, value} avec value
// obligatoire (primitive ou liste de primitives). L'AIR ne contient pas de
// comportement arbitraire ; la platitude est aussi une contrainte MESURÉE de
// l'API structured outputs (≤ 24 paramètres optionnels par schéma — les
// formes imbriquées optionnelles inlinées à chaque site dépassaient la
// limite). Unicité des clés vérifiée par le validateur sémantique ; un
// groupement se exprime par des clés pointées ("options.mode").
const jsonPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
const jsonLeafSchema = z.union([jsonPrimitiveSchema, z.array(jsonPrimitiveSchema)]);
const configKeySchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]*$/);
export const flatConfigSchema = z.array(
  z.strictObject({
    key: configKeySchema,
    value: jsonLeafSchema,
  }),
);
export type LocalizedText = z.infer<typeof localizedTextSchema>;
export type FlatConfig = z.infer<typeof flatConfigSchema>;

const appLocalesSchema = z.strictObject({
  // Quatre réalités distinctes (non-négociable #16) : langue du demandeur ≠
  // langues de l'app ≠ langues du contenu.
  userLanguage: localeSchema,
  appLocales: z.array(localeSchema).min(1),
  defaultAppLocale: localeSchema,
  contentLocales: z.array(localeSchema).min(1),
  rtlSupported: z.boolean(),
});

const appSchema = z.strictObject({
  name: z.string().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  description: localizedTextSchema.optional(),
  locales: appLocalesSchema,
});

// CONDITION DE VISIBILITÉ (AIR 1.1.0, D-044 — DET-017 volet 2).
// Défaut mesuré avant cette évolution : 19 écrans sur 50 portaient un bloc
// `empty_state` À CÔTÉ d'une `list` possédant déjà son état vide, et le bloc
// était rendu SANS condition — un état vide s'affichait donc pendant que des
// données étaient présentes, observé sur appareil (Phase 8 puis Phase 10).
// La cause n'était pas le document : le schéma n'offrait AUCUN moyen
// d'exprimer une condition.
//
// Forme volontairement FERMÉE : pas de langage d'expression, deux prédicats
// seulement, adossés à la notion que le registre manipule déjà — le bloc
// `list` dérive son état de `items.length === 0`. Étendre ce vocabulaire
// sera une évolution consciente, pas une improvisation d'un LLM.
const blockVisibilitySchema = z.strictObject({
  kind: z.enum(["entity_empty", "entity_not_empty"]),
  entityId: entityIdSchema,
});

const blockInstanceSchema = z.strictObject({
  id: blockIdSchema,
  // Clé du registre de Smart Blocks — la version exacte est résolue dans le
  // lock, jamais choisie par le LLM.
  blockType: z.string().regex(/^[a-z][a-z0-9_]*$/),
  // ORDRE DE DÉCLARATION SIGNIFICATIF POUR L'ÉMISSION (D-019 / 2.4-H) :
  // la grammaire structured outputs suit cet ordre ; `props` déclarée avant
  // `entityId` créait une trajectoire légale qui forcloait les props sur les
  // blocs portant les deux (cause racine prouvée par la matrice X1-X4 :
  // X3' 7/7 identique ×2). `props` reste EN DERNIER — aligné sur l'ordre
  // d'émission naturel mesuré du modèle. Ne pas réordonner sans re-dérouler
  // le cycle de preuve D-018.
  entityId: entityIdSchema.optional(),
  /** Rendu conditionnel (1.1.0) — absent = toujours visible (comportement 1.0.0). */
  visibleWhen: blockVisibilitySchema.optional(),
  props: flatConfigSchema.optional(),
});

const screenSchema = z.strictObject({
  id: screenIdSchema,
  title: localizedTextSchema,
  blocks: z.array(blockInstanceSchema).min(1),
});

/**
 * NAVIGATION PRINCIPALE (1.6.0, D-086) — le RÉSULTAT ARCHITECTURAL, pas la
 * catégorie qui l'a produit.
 *
 * Fait mesuré : `routes` n'était qu'un registre PLAT d'écrans. Aucune notion de
 * destination principale. Le seul moyen d'exprimer « on peut aller au panier »
 * était donc un `button` dans le CORPS de l'écran — mesuré sur le corpus v3 :
 * **184 boutons de navigation pure sur 235, soit 1,7 par écran**, jusqu'à
 * quatre empilés sous la liste des plats.
 *
 * 🔴 L'AIR NE CONNAÎT AUCUNE CATÉGORIE MÉTIER. Ni « restaurant », ni
 * « boutique », ni « réservation ». Déduire l'archétype est un raisonnement du
 * GÉNÉRATEUR ; le contrat porte sa conclusion — quelles destinations sont
 * principales, dans quel ordre — jamais l'étiquette qui a servi à la produire.
 * Sinon le compilateur devrait connaître les métiers, et le moteur cesserait
 * d'être agnostique.
 *
 * Bornes 3–5 : en deçà une barre n'a pas lieu d'être, au-delà elle devient
 * illisible sur un écran de téléphone.
 */
const primaryNavigationSchema = z.strictObject({
  destinations: z
    .array(
      z.strictObject({
        routeId: routeIdSchema,
        /** Libellé de l'onglet — DONNÉE du document, jamais texte moteur (F3). */
        label: localizedTextSchema,
        /** Position dans la barre, à partir de 0. Unique, contiguë. */
        order: z.number().int().min(0).max(4),
      }),
    )
    .min(3)
    .max(5),
});

const navigationSchema = z.strictObject({
  entryScreenId: screenIdSchema,
  /**
   * OPTIONNELLE : un document 1.5.0 n'en porte pas, et la migration n'en
   * invente aucune — choisir les destinations principales à la place du
   * document serait décider de son architecture.
   */
  primary: primaryNavigationSchema.optional(),
  routes: z
    .array(
      z.strictObject({
        id: routeIdSchema,
        screenId: screenIdSchema,
        title: localizedTextSchema.optional(),
      }),
    )
    .min(1),
});

export const fieldTypeSchema = z.enum([
  "string",
  "text",
  "number",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "enum",
  "reference",
  "asset",
  "json",
]);

const fieldSchema = z.strictObject({
  id: fieldIdSchema,
  name: z.string().regex(/^[a-z][a-z0-9_]*$/),
  type: fieldTypeSchema,
  required: z.boolean(),
  unique: z.boolean().optional(),
  // Exigé ssi type=enum / type=reference — cohérence vérifiée par le
  // validateur sémantique (un schéma zod ne voit pas les autres champs).
  enumValues: z.array(z.string().min(1)).min(1).optional(),
  referencesEntityId: entityIdSchema.optional(),
  /**
   * CHAMP D'AFFICHAGE DE LA RÉFÉRENCE (1.4.0, D-064).
   *
   * `referencesEntityId` disait vers QUOI pointer, jamais QUOI MONTRER. Un champ
   * `reference` s'affichait donc en identifiant brut — mesuré : 6 occurrences au
   * corpus, et `relationTraversal: false` le concédait. Deviner « le premier
   * champ texte de la cible » aurait été une convention, c'est-à-dire une
   * supposition ; le document le déclare.
   *
   * OPTIONNEL : sans lui, l'identifiant brut reste affiché — comportement 1.3.0
   * inchangé, et la migration n'invente aucune cible.
   */
  referenceDisplayFieldId: fieldIdSchema.optional(),
});

const entitySchema = z.strictObject({
  id: entityIdSchema,
  name: z.string().regex(/^[a-z][a-z0-9_]*$/),
  fields: z.array(fieldSchema).min(1),
});

const relationSchema = z.strictObject({
  id: relationIdSchema,
  fromEntityId: entityIdSchema,
  toEntityId: entityIdSchema,
  kind: z.enum(["one_to_one", "one_to_many", "many_to_many"]),
});

// Le contenu initial est généré AVANT compilation et stocké hors AIR, adressé
// par hash — la compilation reste pure (ARCHITECTURE §1).
/**
 * PROVENANCE D'UN DATASET (1.7.1, E3.3/D-131) — forme APLANIE, sémantique
 * E3.2/D-130 INCHANGÉE. L'union fermée 1.7.0 (seed | remote) était refusée
 * par l'API réelle à TOUS les niveaux de l'échelle (« compiled grammar is
 * too large », classe D-078) : la partie `donnees` était au bord de la
 * limite et l'union l'a fait franchir — prouvé par sonde différentielle
 * même-jour (1.6.0 acceptée · union refusée · forme plate acceptée au
 * niveau nominal). Champs PLATS optionnels + cohérence par superRefine :
 * la forme plate n'accepte QUE ce que l'union acceptait, plus l'absence
 * totale (comportement historique au caractère près). `remote` DÉCLARE une
 * provenance — la CONSOMMATION est l'affaire du runtime (adaptateur E3.3/
 * D-132, fait d'enveloppe `liveData`) : AUCUNE présence syntaxique ne vaut
 * preuve de vivacité — les instruments exigent la trace ET le moteur a dû
 * prouver la sienne au rendu. Fail-closed au validateur : intégration
 * existante + domaine autorisé.
 */
const datasetSchema = z
  .strictObject({
    id: datasetIdSchema,
    entityId: entityIdSchema,
    contentHash: sha256Schema,
    rowCount: z.number().int().min(0),
    sourceKind: z.enum(["seed", "remote"]).optional(),
    sourceIntegrationId: integrationIdSchema.optional(),
    sourceDomain: z
      .string()
      .regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/)
      .optional(),
    sourceRefreshSeconds: z.number().int().min(5).max(3600).optional(),
  })
  .superRefine((d, ctx) => {
    const remoteFields =
      d.sourceIntegrationId !== undefined ||
      d.sourceDomain !== undefined ||
      d.sourceRefreshSeconds !== undefined;
    if (d.sourceKind === undefined && remoteFields) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceKind"],
        message: "champs source* sans sourceKind : provenance incohérente refusée",
      });
    }
    if (d.sourceKind === "seed" && remoteFields) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceKind"],
        message:
          'sourceKind "seed" = source locale : sourceIntegrationId/sourceDomain/sourceRefreshSeconds interdits',
      });
    }
    if (d.sourceKind === "remote") {
      if (d.sourceIntegrationId === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["sourceIntegrationId"],
          message: 'sourceKind "remote" exige sourceIntegrationId (fail-closed)',
        });
      }
      if (d.sourceDomain === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["sourceDomain"],
          message: 'sourceKind "remote" exige sourceDomain (fail-closed)',
        });
      }
    }
  });

const actionTriggerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ui"), blockId: blockIdSchema }),
  z.strictObject({
    kind: z.literal("lifecycle"),
    event: z.enum(["app_start", "screen_open", "screen_close"]),
    screenId: screenIdSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("data"),
    entityId: entityIdSchema,
    event: z.enum(["created", "updated", "deleted"]),
  }),
]);

// Fermé par construction : pas de comportement arbitraire dans l'AIR — le
// spécifique-domaine passe par une capability ou un Code Slot (§1/§4).
// Source d'une entrée de slot — union FERMÉE. Aucune expression arbitraire :
// un slot reçoit des données du document, jamais un calcul improvisé.
const slotInputSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("entity_rows"), entityId: entityIdSchema }),
  z.strictObject({ kind: z.literal("literal"), value: jsonLeafSchema }),
]);

const slotPortNameSchema = z.string().regex(/^[a-z][a-zA-Z0-9]*$/);

const slotBindingSchema = z.strictObject({
  // TOTALITÉ EXIGÉE par le validateur : chaque entrée déclarée par le slot doit
  // être liée. Une entrée manquante produirait un `undefined` silencieux dans du
  // code d'auteur — le défaut que ce chantier passe son temps à traquer.
  inputs: z.array(z.strictObject({ port: slotPortNameSchema, source: slotInputSourceSchema })),
  // Une sortie alimente la prop d'un bloc. Cible fermée : le slot ne peut
  // écrire nulle part ailleurs.
  outputs: z
    .array(
      z.strictObject({
        port: slotPortNameSchema,
        blockId: blockIdSchema,
        prop: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
      }),
    )
    .min(1),
});

const actionEffectSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("capability"),
    capability: capabilityRefSchema,
    method: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
    params: flatConfigSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("slot"),
    slotId: slotIdSchema,
    /**
     * LIAISON DU SLOT (1.3.0, D-058) — d'où viennent ses entrées, où vont ses
     * sorties.
     *
     * Fait mesuré : sur 152 promesses mortes du corpus, **44 visaient un slot**.
     * Le compilateur ÉMET pourtant leur code et l'Oracle en refuse les
     * exfiltrations — mais rien ne les APPELAIT, parce que `{kind:"slot",
     * slotId}` nommait un slot sans dire ce qu'on lui donne ni ce qu'on fait de
     * son résultat. **Le câblage était inexprimable**, exactement comme
     * l'intention l'était avant 1.2.0.
     *
     * OPTIONNELLE au schéma : les 12 documents gelés n'en portent pas, et la
     * migration s'interdit d'en inventer. Sans liaison, le slot n'est PAS
     * invoqué — et la gate de fidélité le dit.
     */
    binding: slotBindingSchema.optional(),
  }),
  z.strictObject({ kind: z.literal("navigate"), screenId: screenIdSchema }),
  z.strictObject({
    kind: z.literal("mutation"),
    entityId: entityIdSchema,
    operation: z.enum(["create", "update", "delete"]),
    /**
     * ÉCRAN SUIVANT (1.5.0, D-070) — où aller UNE FOIS l'écriture faite.
     *
     * Défaut trouvé en INSPECTANT l'application émise : un effet d'action est
     * UNIQUE. Un formulaire ne pouvait donc pas « enregistrer PUIS confirmer » —
     * il fallait choisir. Toutes les vitrines choisissaient `navigate`, si bien
     * que **« Valider » changeait d'écran sans rien enregistrer**, et la gate de
     * fidélité laissait passer : sa cible était bien vivante.
     *
     * OPTIONNEL : sans lui, l'écriture a lieu et l'utilisateur reste sur place —
     * comportement 1.4.0 inchangé. La navigation N'A LIEU QUE SI L'ÉCRITURE A
     * RÉUSSI : une règle qui refuse la saisie doit garder l'utilisateur sur son
     * formulaire, jamais l'envoyer sur un écran de confirmation mensonger.
     */
    thenScreenId: screenIdSchema.optional(),
  }),
]);

const actionSchema = z.strictObject({
  id: actionIdSchema,
  name: z.string().min(1),
  trigger: actionTriggerSchema,
  effect: actionEffectSchema,
});

const ruleAssertionSchema = z.strictObject({
  fieldId: fieldIdSchema,
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "matches", "required"]),
  value: jsonLeafSchema.optional(),
});

const ruleSchema = z.strictObject({
  id: ruleIdSchema,
  description: z.string().min(1),
  kind: z.enum(["validation", "authorization"]),
  entityId: entityIdSchema,
  assertions: z.array(ruleAssertionSchema).min(1),
});

// Un slot est du code écrit par LLM sous influence potentielle du prompt
// utilisateur (injection indirecte) : signature typée + imports en allowlist
// ici ; gardes AST et sandbox sans secrets côté compilateur (§4).
const slotPortSchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
  type: fieldTypeSchema,
});

const slotSchema = z.strictObject({
  id: slotIdSchema,
  description: z.string().min(1),
  inputs: z.array(slotPortSchema),
  outputs: z.array(slotPortSchema),
  allowedImports: z.array(z.string()),
});

const capabilityRequestSchema = z.strictObject({
  capability: capabilityRefSchema,
  config: flatConfigSchema.optional(),
});

const permissionSchema = z.strictObject({
  platform: z.enum(["ios", "android", "both"]),
  permission: z.string().regex(/^[A-Za-z][A-Za-z0-9_.]*$/),
  reason: localizedTextSchema,
  requiredByCapability: capabilityRefSchema,
});

const designSchema = z.strictObject({
  theme: z.string().regex(/^[a-z][a-z0-9_]*$/),
  tokensVersion: semverSchema.optional(),
  overrides: flatConfigSchema.optional(),
});

const integrationSchema = z.strictObject({
  id: integrationIdSchema,
  // Classe neutre ("psp", "email"…) — le provider concret est résolu dans le
  // lock (multi-provider, non-négociable #12).
  providerClass: z.string().regex(/^[a-z][a-z0-9_]*$/),
  capability: capabilityRefSchema.optional(),
  // JAMAIS de secret ici (non-négociable #13) — vérifié par le validateur.
  config: flatConfigSchema.optional(),
});

const networkPolicySchema = z.strictObject({
  policy: z.literal("deny_by_default"),
  allowedDomains: z.array(z.string().regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/)),
});

const nativeRequirementsSchema = z.strictObject({
  minIosVersion: z.string().regex(/^\d+(\.\d+)?$/),
  minAndroidSdk: z.number().int().min(21),
});

const complianceSchema = z.strictObject({
  // digital ⇒ IAP obligatoire ; physical_or_offapp ⇒ PSP autorisé (§2).
  commerceClass: z.enum(["none", "digital", "physical_or_offapp"]),
  accountDeletionRequired: z.boolean(),
  dataCollected: z.array(
    z.enum([
      "contact_info",
      "identifiers",
      "usage_data",
      "location",
      "user_content",
      "purchases",
      "diagnostics",
    ]),
  ),
});

const expectedTestSchema = z.strictObject({
  id: testIdSchema,
  description: z.string().min(1),
  kind: z.enum(["deterministic", "e2e", "contract"]),
  // Id d'écran, d'action ou d'entité — existence vérifiée par le validateur.
  targetId: z.string().min(1),
});

// INTENTION DU CLIENT (AIR 1.2.0, D-056) — la racine mesurée en `APP-D004`.
//
// Fait fondateur : l'AIR portait 19 champs et AUCUN ne contenait la demande.
// « menu avec photos et prix » entrait dans un prompt et DISPARAISSAIT. Aucun
// artefact en aval ne savait ce qui avait été demandé, donc toute la
// vérification comparait l'artefact au document — jamais le document à la
// demande.
//
// `resolution` est REQUISE et FERMÉE : un besoin est soit rattaché à des nœuds
// du document, soit déclaré inexprimable AVEC MOTIF. Il n'existe pas de
// troisième issue, et surtout pas l'absence silencieuse — c'est précisément
// par elle que « avec photos » s'est évaporé dans 12 documents sur 13.
const needSchema = z.strictObject({
  id: needIdSchema,
  // Le besoin dans les termes du client, jamais reformulé en vocabulaire moteur.
  statement: z.string().min(1),
  resolution: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("satisfied"),
      // Nœuds du document qui portent ce besoin — existence vérifiée par le
      // validateur sémantique, jamais supposée.
      nodeIds: z.array(z.string().min(1)).min(1),
    }),
    z.strictObject({
      kind: z.literal("unexpressible"),
      // Pourquoi le document ne peut pas porter ce besoin. Un motif vide est
      // refusé : « inexprimable » sans raison serait un abandon déguisé.
      reason: z.string().min(1),
    }),
  ]),
});

export const intentSchema = z.strictObject({
  // La demande TELLE QU'ELLE A ÉTÉ FORMULÉE. Elle n'est pas une source de
  // vérité pour le moteur — elle est la source de vérité pour le JUGE.
  request: z.string().min(1),
  requestLocale: localeSchema,
  needs: z.array(needSchema).min(1),
});

export const projectAirSchema = z.strictObject({
  airSchemaVersion: z.literal(AIR_SCHEMA_VERSION),
  projectId: projectIdSchema,
  app: appSchema,
  screens: z.array(screenSchema).min(1),
  navigation: navigationSchema,
  entities: z.array(entitySchema),
  relations: z.array(relationSchema),
  datasets: z.array(datasetSchema),
  actions: z.array(actionSchema),
  rules: z.array(ruleSchema),
  slots: z.array(slotSchema),
  capabilities: z.array(capabilityRequestSchema),
  permissions: z.array(permissionSchema),
  design: designSchema,
  integrations: z.array(integrationSchema),
  network: networkPolicySchema,
  native: nativeRequirementsSchema,
  compliance: complianceSchema,
  expectedTests: z.array(expectedTestSchema),
  // OPTIONNEL AU SCHÉMA, EXIGÉ PAR LA GATE. Le rendre requis forcerait la
  // migration à FABRIQUER une intention pour les 12 documents du corpus gelé —
  // exactement ce que D-044 s'est interdit. Le fail-closed vit dans la gate de
  // fidélité (PHASE 10B), pas dans le schéma : un document sans intention ne
  // peut pas être certifié, mais il reste lisible.
  intent: intentSchema.optional(),
});

export type ProjectAir = z.infer<typeof projectAirSchema>;
export type AirScreen = ProjectAir["screens"][number];
export type AirEntity = ProjectAir["entities"][number];
export type AirAction = ProjectAir["actions"][number];
