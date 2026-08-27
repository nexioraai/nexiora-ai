import { z } from "zod";
import { projectAirSchema } from "./air.ts";
import { projectLockSchema } from "./lock.ts";
import { deploymentStateSchema } from "./deployment-state.ts";

// Projection JSON Schema (draft 2020-12) : autorité = schémas zod, la
// projection sert l'émission LLM par structured outputs (ARCHITECTURE §1).
// Tous les objets sont stricts ⇒ additionalProperties: false partout.
export function projectAirJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(projectAirSchema, { target: "draft-2020-12" });
}

export function projectLockJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(projectLockSchema, { target: "draft-2020-12" });
}

export function deploymentStateJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(deploymentStateSchema, { target: "draft-2020-12" });
}
