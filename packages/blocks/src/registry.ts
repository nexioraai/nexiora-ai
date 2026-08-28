// PONT AIR ↔ REGISTRE DE BLOCS (patron validateAirCapabilities, D-020).
// ALLOWLIST POSITIVE : blockType inconnu = refus net. Déterministe : mêmes
// entrées => mêmes diagnostics, dans le même ordre (parcours stable).
// IMPORTANT (L2/D-023) : ce pont n'est PAS câblé dans les tests du golden
// corpus — le corpus reste GELÉ (artefact de Phase 2). Le pont est la porte
// fail-closed du COMPILATEUR (Phase 4) et l'outil de la ré-émission
// (arbitrage C, entrée de Phase 4).
import { BLOCKS, type BlockDefinition } from "./definitions.ts";

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
  entities: readonly { id: string; fields: readonly { id: string }[] }[];
  actions?: readonly { id: string }[];
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
