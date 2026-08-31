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
//  - `resolved.providers` : VIDE de 4.1 à la Phase 9 ; RENSEIGNÉ depuis la
//    Phase 10 (§15, première abstraction provider) par le registre de
//    providers, qui dérive la classe canonique de la `capability` déclarée
//    par l'intégration — jamais de la chaîne libre `providerClass`, dont le
//    corpus gelé porte 40 valeurs distinctes pour une douzaine de classes
//    réelles. Le lock n'entre dans AUCUN hash d'artefact (le manifeste ne
//    contient que airHash/entries/merkleVersion/releaseTrain) : renseigner
//    ce champ ne peut donc pas modifier un projet compilé — propriété
//    vérifiée statiquement ET mesurée sur les 12 documents.
import {
  AIR_SCHEMA_VERSION,
  canonicalJson,
  applyAirMigrations,
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
import { selectProviders } from "@deribfy/provider-registry";
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

/**
 * Normalise un document AIR : MIGRE s'il déclare une version antérieure, puis
 * le rend au parseur. Point d'entrée UNIQUE du chemin de compilation — sans
 * lui, les 12 documents 1.0.0 du corpus gelé seraient refusés par le schéma
 * 1.1.0, et surtout le lock et l'émission risqueraient de travailler sur
 * deux versions différentes du même document.
 *
 * Le mécanisme existait depuis la Phase 2, testé mais JAMAIS câblé : cette
 * évolution de contrat l'active pour la première fois (D-044).
 */
export function normalizeAir(input: unknown): unknown {
  const declared = (input as { airSchemaVersion?: unknown } | null)?.airSchemaVersion;
  if (typeof declared !== "string" || declared === AIR_SCHEMA_VERSION) return input;
  try {
    // Étape STRUCTURELLE uniquement : la validation reste celle du résolveur,
    // qui produit des diagnostics précis (schéma, sémantique, capabilities,
    // blocs). Valider ici ferait s'effondrer toute erreur en « migration
    // échouée » — précision perdue, donc refusé.
    return applyAirMigrations(input);
  } catch (error) {
    throw new LockResolutionError([
      {
        source: "schema",
        code: "AIR_MIGRATION_FAILED",
        path: "airSchemaVersion",
        message: String(error instanceof Error ? error.message : error).slice(0, 160),
      },
    ]);
  }
}

export interface ResolveOptions {
  /**
   * Substitution de provider par classe canonique (§15). Le document AIR
   * n'est PAS modifié : c'est tout l'intérêt de l'abstraction — changer de
   * fournisseur ne doit jamais exiger de retoucher la source de vérité.
   * Fail-closed : classe non requise ou provider hors registre = refus.
   */
  readonly providerOverrides?: Readonly<Record<string, string>>;
}

export function resolveLock(
  input: unknown,
  train: ReleaseTrain = RELEASE_TRAIN_V1,
  options: ResolveOptions = {},
): ProjectLock {
  // 1. Schéma strict (fail-closed) — airSchemaVersion est un literal du
  //    schéma : un document d'une autre version d'AIR échoue ici.
  const parsed = projectAirSchema.safeParse(normalizeAir(input));
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

  // 3. Compatibilité tokens <-> train (D-027, assoupli par D-039-R2).
  //
  // AVANT : egalite stricte. Consequence demontree le 2026-08-29 : les tokens
  // ne pouvaient JAMAIS evoluer, car les 12 documents du corpus GELE epinglent
  // 1.0.0 et leur provenance-modele interdit de les retoucher. Ce n'etait donc
  // pas une garantie de securite mais un verrou d'evolution.
  //
  // MAINTENANT : compatibilite semver bornee, fail-closed sur les deux bords —
  //   (a) MAJEURE differente        => REFUS  TOKENS_MAJOR_MISMATCH
  //   (b) train ANTERIEUR au document => REFUS TOKENS_TRAIN_OLDER
  //   (c) meme majeure, train >= doc  => ACCEPTE
  //
  // La compatibilite n'est PAS supposee depuis le numero : elle est VERIFIEE
  // mecaniquement par le cliquet de surface du paquet design-tokens
  // (tests/major-surface-ratchet.test.ts), qui refuse toute suppression de cle
  // ou tout changement de type a l'interieur d'une majeure. Un changement
  // reellement incompatible ne peut donc pas se glisser dans une mineure.
  // Les changements de VALEUR restent, eux, detectes par deux cliquets de hash
  // independants : designTokensSourcesHash du train, et le rootHash de tout
  // projet compile.
  const tokensVersion = air.design.tokensVersion;
  if (tokensVersion !== undefined && tokensVersion !== train.designTokensVersion) {
    const parse = (v: string): number[] => v.split(".").map((n) => Number(n));
    const doc = parse(tokensVersion);
    const trn = parse(train.designTokensVersion);
    const wellFormed =
      doc.length === 3 && trn.length === 3 && [...doc, ...trn].every(Number.isInteger);
    const [docMajor = -1, docMinor = -1, docPatch = -1] = doc;
    const [trnMajor = -2, trnMinor = -2, trnPatch = -2] = trn;
    if (!wellFormed) {
      diagnostics.push({
        source: "resolver",
        code: "TOKENS_VERSION_MALFORMED",
        path: "design.tokensVersion",
        message: `version de tokens non semver: document ${tokensVersion}, train ${train.designTokensVersion}`,
      });
    } else if (docMajor !== trnMajor) {
      diagnostics.push({
        source: "resolver",
        code: "TOKENS_MAJOR_MISMATCH",
        path: "design.tokensVersion",
        message: `majeure incompatible : le document exige les tokens ${tokensVersion}, le train ${train.id} embarque ${train.designTokensVersion}`,
      });
    } else if (
      docMinor > trnMinor ||
      (docMinor === trnMinor && docPatch > trnPatch)
    ) {
      diagnostics.push({
        source: "resolver",
        code: "TOKENS_TRAIN_OLDER",
        path: "design.tokensVersion",
        message: `train anterieur au document : le document exige les tokens ${tokensVersion}, le train ${train.id} embarque ${train.designTokensVersion}`,
      });
    }
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
      providers: selectProviders(air, options.providerOverrides ?? {}),
      releaseTrain: { id: train.id, version: train.version },
      toolchain: { ...train.toolchain },
    },
  });
}
