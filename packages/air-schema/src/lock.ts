import { z } from "zod";
import { capabilityRefSchema } from "./ids.ts";
import { semverSchema, sha256Schema } from "./air.ts";

// 1.1.0 (E3.3, D-132) : `resolved.remoteData` OPTIONNEL — cibles distantes
// résolues (datasetId, entityId, integrationId, url du protocole de données
// du moteur, refreshSeconds). ABSENT quand le document ne déclare aucune
// provenance distante : les locks historiques restent byte-identiques.
export const LOCK_SCHEMA_VERSION = "1.1.0";

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
    // Cibles distantes (E3.3) : l'ENDPOINT est résolu ICI, jamais dans l'AIR
    // (doctrine multi-provider — l'AIR déclare, le lock lie). URL https
    // uniquement ; l'hôte est revérifié fail-closed au runtime contre
    // `network.allowedDomains`.
    remoteData: z
      .array(
        z.strictObject({
          datasetId: z.string().min(1),
          entityId: z.string().min(1),
          integrationId: z.string().min(1),
          url: z.string().regex(/^https:\/\//),
          refreshSeconds: z.number().int().min(5).max(3600).optional(),
        }),
      )
      .optional(),
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
