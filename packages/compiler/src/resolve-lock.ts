// RÉSOLVEUR AIR → project.lock (Phase 4.1, D-026/D-027).
// Fonction PURE et DÉTERMINISTE : aucun accès fichier, réseau ou horloge —
// mêmes entrées ⇒ même lock, octet pour octet (non-négociable #2 ; la
// pureté du chemin de compilation est prouvée par le harnais V5 et le
// cliquet statique d'imports, 4.6).
// FAIL-CLOSED : document refusé net (LockResolutionError, diagnostics
// triés) si le schéma AIR, le validateur sémantique, le registre de
// capabilities ou le registre de blocs émettent le moindre diagnostic —
// jamais de lock partiel.
// Lectures consignées (D-027) :
//  - `resolved.capabilities[].version` = version du CONTRAT de capability
//    (registre 1.0.0) — la version EXACTE du paquet d'implémentation sera
//    figée à l'intégration réelle des implémentations (Phases 5+) ;
//  - `design.tokensVersion` ABSENT ⇒ résolu vers la version du train
//    (rôle du résolveur) ; présent et ≠ train ⇒ REFUS ;
//  - `resolved.providers` = [] en 4.1 — première abstraction provider
//    réelle (data/demo) câblée en 4.5 par évolution consciente.
import {
  canonicalJson,
  projectAirSchema,
  projectLockSchema,
  sha256Hex,
  validateAir,
  type ProjectAir,
  type ProjectLock,
} from "@deribfy/air-schema";
import {
  CAPABILITIES,
  validateAirCapabilities,
} from "@deribfy/capability-registry";
import { getBlock, validateAirBlocks } from "@deribfy/blocks/registry";
import { RELEASE_TRAIN_V1, type ReleaseTrain } from "./release-train.ts";

export interface LockDiagnostic {
  source: "schema" | "semantics" | "capabilities" | "blocks" | "resolver";
  code: string;
  path: string;
  message: string;
}

export class LockResolutionError extends Error {
  readonly diagnostics: readonly LockDiagnostic[];

  constructor(diagnostics: readonly LockDiagnostic[]) {
    super(
      `résolution refusée (fail-closed) : ${diagnostics.length} diagnostic(s) — ` +
        diagnostics
          .slice(0, 3)
          .map((d) => `${d.source}:${d.code}@${d.path}`)
          .join(" · "),
    );
    this.name = "LockResolutionError";
    this.diagnostics = diagnostics;
  }
}

const byCodeUnit = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

const capabilityById = new Map(CAPABILITIES.map((c) => [c.id, c]));

export function resolveLock(
  input: unknown,
  train: ReleaseTrain = RELEASE_TRAIN_V1,
): ProjectLock {
  // 1. Schéma strict (fail-closed) — airSchemaVersion est un literal du
  //    schéma : un document d'une autre version d'AIR échoue ici.
  const parsed = projectAirSchema.safeParse(input);
  if (!parsed.success) {
    throw new LockResolutionError(
      parsed.error.issues.map((issue) => ({
        source: "schema",
        code: issue.code.toUpperCase(),
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    );
  }
  const air: ProjectAir = parsed.data;

  // 2. Les trois validateurs déterministes (sémantique, capabilities,
  //    blocs) — le moindre diagnostic est un refus.
  const diagnostics: LockDiagnostic[] = [
    ...validateAir(air).map((d) => ({
      source: "semantics" as const,
      code: d.code,
      path: d.path,
      message: d.message,
    })),
    ...validateAirCapabilities(air).map((d) => ({
      source: "capabilities" as const,
      code: d.code,
      path: d.path,
      message: d.message,
    })),
    ...validateAirBlocks(air).map((d) => ({
      source: "blocks" as const,
      code: d.code,
      path: d.path,
      message: d.message,
    })),
  ];

  // 3. Compatibilité tokens ↔ train (lecture consignée D-027).
  const tokensVersion = air.design.tokensVersion;
  if (tokensVersion !== undefined && tokensVersion !== train.designTokensVersion) {
    diagnostics.push({
      source: "resolver",
      code: "TOKENS_VERSION_MISMATCH",
      path: "design.tokensVersion",
      message: `le document exige les tokens ${tokensVersion}, le train ${train.id} embarque ${train.designTokensVersion}`,
    });
  }

  if (diagnostics.length > 0) {
    throw new LockResolutionError(diagnostics);
  }

  // 4. Blocs : types DISTINCTS utilisés, triés par point de code.
  //    L'allowlist a déjà été prouvée par validateAirBlocks — la relecture
  //    ici est une défense en profondeur (jamais un lock sur un type
  //    inconnu, même si les validateurs évoluaient).
  const blockTypes = [
    ...new Set(air.screens.flatMap((s) => s.blocks.map((b) => b.blockType))),
  ].sort(byCodeUnit);
  const blocks = blockTypes.map((blockType) => {
    const definition = getBlock(blockType);
    if (definition === undefined) {
      throw new LockResolutionError([
        {
          source: "resolver",
          code: "BLOCK_UNKNOWN_AT_RESOLVE",
          path: `blocks.${blockType}`,
          message: `blockType hors registre au moment de la résolution : ${blockType}`,
        },
      ]);
    }
    return {
      blockType,
      version: definition.version,
      // Intégrité de l'artefact de bloc que le compilateur copiera (D-007) :
      // liée au scellé des sources du registre gelé porté par le train.
      integrity: sha256Hex(
        canonicalJson({
          blockType,
          registryVersion: train.blockRegistryVersion,
          sourcesHash: train.blocksSourcesHash,
          version: definition.version,
        }),
      ),
    };
  });

  // 5. Capabilities : triées par référence, résolues contre le registre.
  const capabilities = [...air.capabilities]
    .sort((a, b) => byCodeUnit(a.capability, b.capability))
    .map((entry) => {
      const definition = capabilityById.get(entry.capability);
      if (definition === undefined) {
        throw new LockResolutionError([
          {
            source: "resolver",
            code: "CAPABILITY_UNKNOWN_AT_RESOLVE",
            path: `capabilities.${entry.capability}`,
            message: `capability hors registre au moment de la résolution : ${entry.capability}`,
          },
        ]);
      }
      return {
        capability: entry.capability,
        implementation: definition.implementation.package,
        version: definition.version,
      };
    });

  // 6. Lock complet, revalidé contre le schéma gelé 1.0.0 (fail-closed en
  //    sortie aussi : un lock non conforme ne sort jamais d'ici).
  return projectLockSchema.parse({
    lockSchemaVersion: "1.0.0",
    airSchemaVersion: air.airSchemaVersion,
    airHash: sha256Hex(canonicalJson(air)),
    resolved: {
      blocks,
      capabilities,
      providers: [],
      releaseTrain: { id: train.id, version: train.version },
      toolchain: { ...train.toolchain },
    },
  });
}
