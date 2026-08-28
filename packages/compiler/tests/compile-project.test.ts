// COMPILATION COMPLÈTE + STORE (4.6, D-031) — CI SANS RÉSEAU.
// Le CRITÈRE DUR de la ROADMAP (10 compilations → hash identique 10/10,
// corpus ACTIF v2) est exercé ici EN CONTINU (in-process) ; la preuve
// officielle multi-processus sous harnais zéro-réseau est versionnée :
// benchmarks/compiler-determinism/results/v46-critere-dur.jsonl.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex } from "@deribfy/air-schema";
import { compileProject } from "../src/compile-project.ts";
import {
  ArtifactStoreError,
  LocalArtifactStore,
  storeCompiledProject,
} from "../src/artifact-store.ts";
import { EMBEDDED_TEMPLATE } from "../src/embedded-template.generated.ts";
import { hashSourceTree } from "./helpers.ts";
import { RELEASE_TRAIN_V1 } from "../src/release-train.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(HERE, "..", "template");
const CORPUS_V2 = join(HERE, "..", "..", "golden-corpus", "corpus-v2");
const v2Docs = readdirSync(CORPUS_V2)
  .filter((f) => f.endsWith(".air.json"))
  .sort();
const loadDoc = (file: string): unknown =>
  JSON.parse(readFileSync(join(CORPUS_V2, file), "utf8"));

describe("gabarit embarqué — non-dérive", () => {
  it("EMBEDDED_TEMPLATE = fichiers réels du gabarit scellé", () => {
    const real = Object.fromEntries(
      readdirSync(TEMPLATE)
        .sort()
        .map((f) => [f, readFileSync(join(TEMPLATE, f), "utf8")]),
    );
    expect(EMBEDDED_TEMPLATE).toEqual(real);
    // Cohérence avec le scellé du train (même source de vérité).
    expect(hashSourceTree(TEMPLATE)).toBe(RELEASE_TRAIN_V1.templateHash);
  });
});

describe("compilation complète — critère dur (in-process)", () => {
  it("12 documents × 10 compilations ⇒ hash racine identique 10/10", () => {
    for (const file of v2Docs) {
      const doc = loadDoc(file);
      const hashes = new Set(
        Array.from({ length: 10 }, () => compileProject(doc).rootHash),
      );
      expect(hashes.size, file).toBe(1);
    }
  });

  it("le projet complet contient gabarit ET émission, sans collision", () => {
    const { files } = compileProject(loadDoc("resto-quartier.air.json"));
    for (const f of ["package.json", "package-lock.json", "App.tsx", "app.json", "navigation.tsx"]) {
      expect(files.has(f), f).toBe(true);
    }
  });

  it("hash racine = SHA-256 du manifeste, recompté indépendamment", () => {
    const compiled = compileProject(loadDoc("resto-quartier.air.json"));
    expect(compiled.rootHash).toBe(sha256Hex(compiled.manifest));
    const manifest = JSON.parse(compiled.manifest) as {
      entries: { path: string; sha256: string }[];
    };
    expect(manifest.entries.length).toBe(compiled.files.size);
    for (const entry of manifest.entries) {
      expect(entry.sha256).toBe(sha256Hex(compiled.files.get(entry.path) ?? ""));
    }
  });
});

describe("artifact store v1 (local, SHA-256)", () => {
  const root = mkdtempSync(join(tmpdir(), "store-"));
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("round-trip complet d'un projet compilé + déduplication", () => {
    const store = new LocalArtifactStore(root);
    const compiled = compileProject(loadDoc("resto-quartier.air.json"));
    const stored = storeCompiledProject(store, compiled);
    expect(stored.manifestHash).toBe(compiled.rootHash);
    expect(store.get(stored.rootHash).toString("utf8")).toBe(compiled.manifest);
    expect(store.get(stored.lockHash).toString("utf8")).toBe(
      canonicalJson(compiled.lock),
    );
    // Idempotent : re-stocker ne change rien et ne lève pas.
    expect(storeCompiledProject(store, compiled).rootHash).toBe(stored.rootHash);
  });

  it("immuabilité : contenu divergent pour un hash = corruption refusée", () => {
    const store = new LocalArtifactStore(root);
    const hash = store.put("contenu-a");
    expect(store.get(hash).toString("utf8")).toBe("contenu-a");
    expect(() => store.get("0".repeat(64))).toThrow(ArtifactStoreError);
  });
});
