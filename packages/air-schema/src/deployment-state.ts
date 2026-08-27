import { z } from "zod";
import { projectIdSchema } from "./ids";
import { semverSchema, sha256Schema } from "./air";

export const DEPLOYMENT_STATE_SCHEMA_VERSION = "1.0.0";

const platformStateSchema = z.strictObject({
  distribution: z.enum(["none", "preview", "testflight", "store"]),
  storeVersion: semverSchema.optional(),
  buildNumber: z.number().int().min(1).optional(),
  artifactHash: sha256Schema.optional(),
});

// deployment state — ce qui est RÉELLEMENT déployé, par plateforme et par
// canal OTA. Contrairement au lock, l'horodatage est légitime ici : c'est de
// l'état observé du monde, pas un artefact généré.
export const deploymentStateSchema = z.strictObject({
  stateSchemaVersion: z.literal(DEPLOYMENT_STATE_SCHEMA_VERSION),
  projectId: projectIdSchema,
  platforms: z.strictObject({
    ios: platformStateSchema.optional(),
    android: platformStateSchema.optional(),
  }),
  otaChannels: z.array(
    z.strictObject({
      channel: z.enum(["preview", "production"]),
      airHash: sha256Schema,
      lockHash: sha256Schema,
      updatedAt: z.iso.datetime(),
    }),
  ),
});

export type DeploymentState = z.infer<typeof deploymentStateSchema>;
