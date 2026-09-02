// PONT AIR ↔ REGISTRE DE BLOCS (patron validateAirCapabilities, D-020).
// ALLOWLIST POSITIVE : blockType inconnu = refus net. Déterministe : mêmes
// entrées => mêmes diagnostics, dans le même ordre (parcours stable).
// IMPORTANT (L2/D-023) : ce pont n'est PAS câblé dans les tests du golden
// corpus — le corpus reste GELÉ (artefact de Phase 2). Le pont est la porte
// fail-closed du COMPILATEUR (Phase 4) et l'outil de la ré-émission
// (arbitrage C, entrée de Phase 4).
import { BLOCKS, type BlockDefinition,
  BLOCS_AFFORDANTS,
} from "./definitions.ts";

const byId = new Map<string, BlockDefinition>(BLOCKS.map((b) => [b.id, b]));

export function getBlock(id: string): BlockDefinition | undefined {
  return byId.get(id);
}

export function listBlockIds(): readonly string[] {
  return BLOCKS.map((b) => b.id);
}

export interface BlockDiagnostic {
  code: string;
  path: string;
  message: string;
}

// Tranche d'AIR nécessaire à la validation — compatible structurellement
// avec ProjectAir de @deribfy/air-schema (patron AirCapabilitySlice).
export interface AirBlockSlice {
  screens: readonly {
    id: string;
    blocks: readonly {
      id: string;
      blockType: string;
      entityId?: string;
      props?: readonly { key: string; value: unknown }[];
    }[];
  }[];
  entities: readonly {
    id: string;
    // E2 (D-129) — champs enrichis OPTIONNELS : le contrôle sémantique du
    // scope lit le type et la cible d'un champ `reference` quand l'appelant
    // les fournit (l'AIR complet les porte) ; une tranche minimale reste
    // acceptée et saute ce contrôle.
    fields: readonly { id: string; type?: string; referencesEntityId?: string }[];
  }[];
  // D-104 — la tranche porte désormais le DÉCLENCHEUR : sans lui, le registre
  // ne pouvait pas vérifier qu'une action `ui` vise un bloc actionnable.
  actions?: readonly {
    id: string;
    trigger?: { kind: string; blockId?: string };
  }[];
}

const flatToRecord = (
  props: readonly { key: string; value: unknown }[] | undefined,
): Record<string, unknown> =>
  Object.fromEntries((props ?? []).map((p) => [p.key, p.value]));

export function validateAirBlocks(air: AirBlockSlice): BlockDiagnostic[] {
  const diagnostics: BlockDiagnostic[] = [];
  const entityFields = new Map(
    air.entities.map((e) => [e.id, new Set(e.fields.map((f) => f.id))]),
  );
  const actionIds = new Set((air.actions ?? []).map((a) => a.id));

  // ── D-104 · UN DÉCLENCHEUR `ui` EXIGE UNE AFFORDANCE.
  //
  // CAUSE RACINE, mesurée sur une génération réelle : trois actions ont été
  // déclarées avec `trigger:{kind:"ui", blockId:<detail_header>}`. Le validateur
  // vérifiait seulement que le bloc EXISTE, jamais qu'il puisse être actionné.
  // Or `detail_header` n'expose aucun gestionnaire : les trois actions étaient
  // valides, et TOTALEMENT MORTES — absentes de l'artefact émis, invisibles à
  // `controls()`, injoignables par aucun autre chemin.
  //
  // La liste des blocs actionnables est DÉRIVÉE du registre (`BLOCS_AFFORDANTS`),
  // jamais recopiée : un bloc qui gagnerait ou perdrait son gestionnaire change
  // ce refus automatiquement.
  const blocsParId = new Map(
    air.screens.flatMap((s) => s.blocks.map((b) => [b.id, b.blockType])),
  );
  (air.actions ?? []).forEach((action, ai) => {
    const t = action.trigger;
    if (t?.kind !== "ui" || t.blockId === undefined) return;
    const blockType = blocsParId.get(t.blockId);
    if (blockType === undefined) return; // bloc inconnu : déjà refusé ailleurs
    if (BLOCS_AFFORDANTS.has(blockType)) return;
    diagnostics.push({
      code: "BLOCK_TRIGGER_SANS_AFFORDANCE",
      path: `actions[${ai}].trigger.blockId`,
      message:
        `l'action "${action.id}" est déclenchée par le bloc "${t.blockId}" de type ` +
        `"${blockType}", qui n'expose AUCUN gestionnaire : rien ne peut la déclencher. ` +
        `Place ce déclencheur sur un bloc actionnable (${[...BLOCS_AFFORDANTS].sort().join(", ")})`,
    });
  });

  air.screens.forEach((screen, si) => {
    screen.blocks.forEach((block, bi) => {
      const path = `screens[${si}].blocks[${bi}]`;
      const definition = byId.get(block.blockType);
      if (definition === undefined) {
        diagnostics.push({
          code: "BLOCK_UNKNOWN",
          path,
          message: `blockType "${block.blockType}" absent du registre (allowlist positive)`,
        });
        return;
      }
      // Liaison d'entité — exigée ou interdite, jamais ambiguë.
      if (definition.entity === "required" && block.entityId === undefined) {
        diagnostics.push({
          code: "BLOCK_ENTITY_REQUIRED",
          path,
          message: `le bloc "${definition.id}" exige une liaison d'entité (entityId)`,
        });
      }
      if (definition.entity === "forbidden" && block.entityId !== undefined) {
        diagnostics.push({
          code: "BLOCK_ENTITY_FORBIDDEN",
          path,
          message: `le bloc "${definition.id}" n'accepte pas de liaison d'entité`,
        });
      }
      const boundFields =
        block.entityId === undefined ? undefined : entityFields.get(block.entityId);
      if (block.entityId !== undefined && boundFields === undefined) {
        diagnostics.push({
          code: "BLOCK_ENTITY_UNKNOWN",
          path,
          message: `entité "${block.entityId}" absente de l'AIR`,
        });
      }
      // Schéma STRICT des props (clé inconnue = refus).
      const record = flatToRecord(block.props);
      const parsed = definition.propsSchema.safeParse(record);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          diagnostics.push({
            code: "BLOCK_PROPS_INVALID",
            path: `${path}.props.${issue.path.join(".")}`,
            message: issue.message,
          });
        }
        return; // les références ne sont vérifiées que sur des props valides.
      }
      // Références de CHAMPS : chaque *FieldId(s) doit exister sur l'entité liée.
      if (boundFields !== undefined) {
        for (const propKey of definition.fieldRefProps) {
          const value = record[propKey];
          const refs =
            typeof value === "string"
              ? [value]
              : Array.isArray(value)
                ? value.filter((v): v is string => typeof v === "string")
                : [];
          for (const ref of refs) {
            if (!boundFields.has(ref)) {
              diagnostics.push({
                code: "BLOCK_FIELD_UNKNOWN",
                path: `${path}.props.${propKey}`,
                message: `champ "${ref}" absent de l'entité "${block.entityId ?? ""}"`,
              });
            }
          }
        }
      }
      // E2 (D-129) — PORTÉE RELATIONNELLE : `scopeFieldId` n'a de sens que
      // sur un écran de DÉTAIL, et doit désigner un champ `reference` de
      // l'entité listée pointant l'entité de l'instance courante (celle du
      // `detail_header` de l'écran). Fail-closed : additive, seuls les
      // documents déclarant le prop sont concernés — le corpus gelé n'en
      // porte aucun.
      const scopeRef = record.scopeFieldId;
      if (typeof scopeRef === "string" && block.blockType === "list") {
        const entete = screen.blocks.find((x) => x.blockType === "detail_header");
        const entiteEcran = entete?.entityId;
        const champ = (air.entities.find((e) => e.id === block.entityId)?.fields ?? []).find(
          (f) => f.id === scopeRef,
        );
        const probleme =
          entiteEcran === undefined
            ? `l'écran "${screen.id}" ne porte aucun \`detail_header\` : sans instance courante, une liste scopée n'a pas de parent`
            : champ?.type !== undefined && champ.type !== "reference"
              ? `"${scopeRef}" est de type "${champ.type}" — le scope exige un champ \`reference\``
              : champ?.referencesEntityId !== undefined &&
                  champ.referencesEntityId !== entiteEcran
                ? `"${scopeRef}" référence "${champ.referencesEntityId}" mais l'instance courante de l'écran est "${entiteEcran}"`
                : undefined;
        if (probleme !== undefined) {
          diagnostics.push({
            code: "BLOCK_SCOPE_INVALID",
            path: `${path}.props.scopeFieldId`,
            message:
              `${probleme}. Le contrat E2 : une liste scopée montre les lignes dont ` +
              `\`scopeFieldId\` vaut l'identifiant de l'instance courante — rien d'autre.`,
          });
        }
      }
      // Références d'ACTIONS.
      for (const propKey of definition.actionRefProps) {
        const value = record[propKey];
        if (typeof value === "string" && !actionIds.has(value)) {
          diagnostics.push({
            code: "BLOCK_ACTION_UNKNOWN",
            path: `${path}.props.${propKey}`,
            message: `action "${value}" absente de l'AIR`,
          });
        }
      }
    });
  });
  return diagnostics;
}

// D-104 — ré-exporté par le SOUS-CHEMIN `/registry`, seule porte utilisable
// par les paquets non-JSX (l'index tire `components.tsx`). Même motif que
// `getBlock`, documenté dans `feasibility.ts`.
export { BLOCS_AFFORDANTS } from "./definitions.ts";
