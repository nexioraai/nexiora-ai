import { z } from "zod";
import { capabilityRefSchema } from "./ids";
import { semverSchema, sha256Schema } from "./air";

export const LOCK_SCHEMA_VERSION = "1.0.0";

// project.lock — versions exactes résolues. Volontairement SANS horodatage :
// même AIR + même release train ⇒ même lock, octet pour octet (déterminisme,
// non-négociable #2 ; artefacts adressés par hash, #15).
export const projectLockSchema = z.strictObject({
  lockSchemaVersion: z.literal(LOCK_SCHEMA_VERSION),
  airSchemaVersion: semverSchema,
  airHash: sha256Schema,
  resolved: z.strictObject({
    blocks: z.array(
      z.strictObject({
        blockType: z.string().regex(/^[a-z][a-z0-9_]*$/),
        version: semverSchema,
        integrity: sha256Schema,
      }),
    ),
    capabilities: z.array(
      z.strictObject({
        capability: capabilityRefSchema,
        implementation: z.string().min(1),
        version: semverSchema,
      }),
    ),
    providers: z.array(
      z.strictObject({
        providerClass: z.string().regex(/^[a-z][a-z0-9_]*$/),
        provider: z.string().min(1),
      }),
    ),
    releaseTrain: z.strictObject({
      id: z.string().min(1),
      version: semverSchema,
    }),
    toolchain: z.strictObject({
      node: z.string().min(1),
      expoSdk: z.string().min(1),
      reactNative: z.string().min(1),
    }),
  }),
});

export type ProjectLock = z.infer<typeof projectLockSchema>;
