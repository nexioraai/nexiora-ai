// RÉSOLVEUR AIR→lock (4.1) — corpus ACTIF v2 12/12, déterminisme,
// fail-closed. CI SANS RÉSEAU : uniquement fs local + calcul pur.
// Le déterminisme inter-processus/environnements de la chaîne canonique a
// été prouvé au préalable (validation V2, 20/20 ×2 environnements —
// `benchmarks/compiler-determinism/`) ; ici on prouve le déterminisme du
// RÉSOLVEUR lui-même (rejeux et permutation d'ordre des clés d'entrée).
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  projectLockSchema,
  sha256Hex,
} from "@deribfy/air-schema";
import { listBlockIds } from "@deribfy/blocks/registry";
import { LockResolutionError, normalizeAir, resolveLock } from "../src/resolve-lock.ts";
import { RELEASE_TRAIN_V1 } from "../src/release-train.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS_V2 = join(HERE, "..", "..", "golden-corpus", "corpus-v2");
const CORPUS_V1 = join(HERE, "..", "..", "golden-corpus", "corpus");

const listDocs = (dir: string): string[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".air.json"))
    .sort();

const loadDoc = (dir: string, file: string): unknown =>
  JSON.parse(readFileSync(join(dir, file), "utf8"));

// Permutation récursive de l'ordre d'insertion des clés (les tableaux,
// porteurs d'ordre sémantique, sont préservés).
const reverseKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .reverse()
        .map(([k, v]) => [k, reverseKeys(v)]),
    );
  }
  return value;
};

const v2Docs = listDocs(CORPUS_V2);

describe("résolveur — corpus ACTIF v2", () => {
  it("couvre bien 12 documents", () => {
    expect(v2Docs).toHaveLength(12);
  });

  for (const file of v2Docs) {
    it(`résout ${file} en lock conforme au schéma courant`, () => {
      const doc = loadDoc(CORPUS_V2, file);
      const lock = resolveLock(doc);
      // Conforme au schéma gelé (re-parse indépendant du resolver).
      expect(projectLockSchema.safeParse(lock).success).toBe(true);
      // airHash = hash canonique du document NORMALISÉ (contre-calcul
      // indépendant). ÉDITION CONSCIENTE (D-044) : depuis que le schéma est
      // en 1.1.0, un document du corpus déclarant 1.0.0 est migré avant
      // résolution — le hash porte donc sur le document migré. C'est la
      // conséquence mesurée et assumée de l'évolution de contrat.
      expect(lock.airHash).toBe(sha256Hex(canonicalJson(normalizeAir(doc))));
      // Vocabulaire ⊆ registre gelé (D-024/D-025), train du lock = train v1.
      const known = new Set(listBlockIds());
      expect(lock.resolved.blocks.length).toBeGreaterThan(0);
      for (const b of lock.resolved.blocks) {
        expect(known.has(b.blockType)).toBe(true);
        expect(b.version).toBe("1.0.0");
        expect(b.integrity).toMatch(/^[0-9a-f]{64}$/);
      }
      expect(lock.resolved.releaseTrain).toEqual({
        id: RELEASE_TRAIN_V1.id,
        version: RELEASE_TRAIN_V1.version,
      });
      // ÉDITION CONSCIENTE (Phase 10, §15) : `providers` n'est plus vide —
      // il porte la sélection canonique dérivée des intégrations. Chaque
      // entrée respecte le schéma du lock et est triée par classe.
      expect(lock.resolved.providers.length).toBeGreaterThan(0);
      const classes = lock.resolved.providers.map((p) => p.providerClass);
      expect([...classes].sort()).toEqual(classes);
      for (const p of lock.resolved.providers) {
        expect(p.providerClass).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(p.provider.length).toBeGreaterThan(0);
      }
      // Chaque capability du document est résolue, triée, avec
      // implémentation non vide.
      const declared = (doc as { capabilities: { capability: string }[] })
        .capabilities.length;
      expect(lock.resolved.capabilities).toHaveLength(declared);
      const refs = lock.resolved.capabilities.map((c) => c.capability);
      expect([...refs].sort()).toEqual(refs);
      for (const c of lock.resolved.capabilities) {
        expect(c.implementation.length).toBeGreaterThan(0);
        expect(c.version).toBe("1.0.0");
      }
    });
  }

  it("déterminisme : 3 rejeux + permutation des clés ⇒ lock byte-identique", () => {
    for (const file of v2Docs) {
      const doc = loadDoc(CORPUS_V2, file);
      const hashes = new Set(
        [
          resolveLock(doc),
          resolveLock(doc),
          resolveLock(doc),
          resolveLock(reverseKeys(doc)),
        ].map((lock) => sha256Hex(canonicalJson(lock))),
      );
      expect(hashes.size).toBe(1);
    }
  });
});

describe("résolveur — fail-closed", () => {
  const base = (): Record<string, unknown> =>
    loadDoc(CORPUS_V2, "resto-quartier.air.json") as Record<string, unknown>;

  it("blockType hors registre ⇒ refus net avec diagnostic blocks", () => {
    const doc = base() as {
      screens: { blocks: { blockType: string }[] }[];
    };
    const block = doc.screens[0]?.blocks[0];
    if (block === undefined) throw new Error("fixture inattendue");
    block.blockType = "hero_carousel";
    let error: unknown;
    try {
      resolveLock(doc);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(LockResolutionError);
    const diags = (error as LockResolutionError).diagnostics;
    expect(diags.some((d) => d.source === "blocks")).toBe(true);
  });

  it("capability hors registre ⇒ refus net (schéma ou capabilities)", () => {
    const doc = base() as {
      capabilities: { capability: string }[];
    };
    const entry = doc.capabilities[0];
    if (entry === undefined) throw new Error("fixture inattendue");
    entry.capability = "hologram_projection";
    expect(() => resolveLock(doc)).toThrow(LockResolutionError);
  });

  // COMPATIBILITÉ TOKENS (D-039-R2) — fail-closed conservé aux DEUX bords.
  // L'égalité stricte antérieure interdisait toute évolution des tokens (le
  // corpus GELÉ épingle 1.0.0 et ne peut être retouché) ; elle est remplacée
  // par une compatibilité semver BORNÉE, dont la validité est garantie
  // MÉCANIQUEMENT par le cliquet de surface du paquet design-tokens.
  const refuseWith = (version: string, code: string): void => {
    const doc = base() as { design: { tokensVersion?: string } };
    doc.design.tokensVersion = version;
    let error: unknown;
    try {
      resolveLock(doc);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(LockResolutionError);
    expect(
      (error as LockResolutionError).diagnostics.some((d) => d.code === code),
    ).toBe(true);
  };

  it("majeure différente ⇒ REFUS TOKENS_MAJOR_MISMATCH (fail-closed)", () => {
    refuseWith("9.9.9", "TOKENS_MAJOR_MISMATCH");
    refuseWith("0.9.0", "TOKENS_MAJOR_MISMATCH");
  });

  it("train ANTÉRIEUR au document ⇒ REFUS TOKENS_TRAIN_OLDER (fail-closed)", () => {
    const [maj = 1, min = 0] = RELEASE_TRAIN_V1.designTokensVersion
      .split(".")
      .map(Number);
    refuseWith(`${maj}.${min + 1}.0`, "TOKENS_TRAIN_OLDER");
    refuseWith(`${maj}.${min}.99`, "TOKENS_TRAIN_OLDER");
  });

  it("version non semver ⇒ REFUS en amont par le SCHÉMA (INVALID_FORMAT)", () => {
    // Défense en profondeur : le schéma AIR intercepte les versions mal
    // formées AVANT le résolveur — mesuré, elles ne peuvent donc jamais
    // atteindre la branche TOKENS_VERSION_MALFORMED. Le refus reste net.
    refuseWith("1.0", "INVALID_FORMAT");
    refuseWith("1.x.0", "INVALID_FORMAT");
  });

  it("même majeure, train ≥ document ⇒ ACCEPTÉ (déverrouille l'évolution mineure)", () => {
    const doc = base() as { design: { tokensVersion?: string } };
    doc.design.tokensVersion = "1.0.0";
    expect(() => resolveLock(doc)).not.toThrow();
  });

  it("tokensVersion ABSENT ⇒ résolu vers le train (lecture D-027)", () => {
    const doc = base() as { design: { tokensVersion?: string } };
    delete doc.design.tokensVersion;
    expect(projectLockSchema.safeParse(resolveLock(doc)).success).toBe(true);
  });

  it("document hors schéma ⇒ refus avec diagnostics schema", () => {
    const doc = base();
    delete doc.navigation;
    let error: unknown;
    try {
      resolveLock(doc);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(LockResolutionError);
    expect(
      (error as LockResolutionError).diagnostics.every(
        (d) => d.source === "schema",
      ),
    ).toBe(true);
  });

  it("corpus v1 GELÉ : 12/12 REFUSÉS (vocabulaire hors registre — mesure D-025)", () => {
    const v1Docs = listDocs(CORPUS_V1);
    expect(v1Docs).toHaveLength(12);
    for (const file of v1Docs) {
      expect(() => resolveLock(loadDoc(CORPUS_V1, file))).toThrow(
        LockResolutionError,
      );
    }
  });
});
