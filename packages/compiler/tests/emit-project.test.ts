// ÉMETTEUR (4.3) — corpus ACTIF v2 12/12, déterminisme byte-à-byte,
// structure (ScreenShell partout — contrainte 3.4 —, chaque bloc de l'AIR
// présent, données canoniques), fail-closed hérité du résolveur. CI SANS
// RÉSEAU. La preuve « le projet émis typecheck/bundle réellement » est
// versionnée : benchmarks/compiler-determinism/results/v43-emission.jsonl.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex } from "@deribfy/air-schema";
import { EmitError, emitProject } from "../src/emit-project.ts";
import { LockResolutionError } from "../src/resolve-lock.ts";
import { EMBEDDED_SOURCES } from "../src/embed-lib.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS_V2 = join(HERE, "..", "..", "golden-corpus", "corpus-v2");
const v2Docs = readdirSync(CORPUS_V2)
  .filter((f) => f.endsWith(".air.json"))
  .sort();
const loadDoc = (file: string): unknown =>
  JSON.parse(readFileSync(join(CORPUS_V2, file), "utf8"));

const projectHash = (files: ReadonlyMap<string, string>): string =>
  sha256Hex(
    canonicalJson(
      [...files.keys()].sort().map((p) => ({ path: p, sha256: sha256Hex(files.get(p) ?? "") })),
    ),
  );

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

describe("émetteur — corpus ACTIF v2", () => {
  for (const file of v2Docs) {
    it(`émet ${file} : structure conforme`, () => {
      const doc = loadDoc(file) as {
        screens: { id: string; blocks: { id: string }[] }[];
        navigation: { entryScreenId: string };
      };
      const { files } = emitProject(doc);

      // Fichiers de base + copies embarquées présents.
      for (const base of ["App.tsx", "navigation.tsx", "nav.data.ts"]) {
        expect(files.has(base), base).toBe(true);
      }
      for (const spec of EMBEDDED_SOURCES) {
        expect(files.has(spec.target), spec.target).toBe(true);
      }

      // Chaque écran : code + données ; ScreenShell OBLIGATOIRE (3.4) ;
      // chaque bloc de l'AIR référencé par son id dans le code émis.
      for (const screen of doc.screens) {
        const code = files.get(`screens/${screen.id}.tsx`);
        expect(code, screen.id).toBeDefined();
        expect(code).toContain(`<ScreenShell testID="${screen.id}"`);
        for (const block of screen.blocks) {
          expect(code, block.id).toContain(`blockId="${block.id}"`);
        }
        const data = files.get(`screens/${screen.id}.data.ts`);
        expect(data, screen.id).toBeDefined();
        expect(data).toContain('"screenId":');
      }

      // Navigation : route initiale = écran d'entrée de l'AIR.
      expect(files.get("navigation.tsx")).toContain(
        `initialRouteName="${doc.navigation.entryScreenId}"`,
      );

      // S5 : LF uniquement, pas de BOM.
      for (const [path, content] of files) {
        expect(content.includes("\r"), path).toBe(false);
        expect(content.startsWith("﻿"), path).toBe(false);
      }
    });
  }

  it("déterminisme : 3 rejeux + permutation des clés ⇒ projet byte-identique 12/12", () => {
    for (const file of v2Docs) {
      const doc = loadDoc(file);
      const hashes = new Set(
        [
          emitProject(doc),
          emitProject(doc),
          emitProject(doc),
          emitProject(reverseKeys(doc)),
        ].map((p) => projectHash(p.files)),
      );
      expect(hashes.size, file).toBe(1);
    }
  });

  it("le lock émis = lock du résolveur (même objet canonique)", () => {
    const doc = loadDoc("resto-quartier.air.json");
    const { lock } = emitProject(doc);
    expect(lock.resolved.releaseTrain.id).toBe("rt-2026.08");
    expect(lock.airHash).toBe(sha256Hex(canonicalJson(doc)));
  });
});

describe("émetteur — fail-closed", () => {
  it("document invalide ⇒ LockResolutionError AVANT toute émission", () => {
    const doc = loadDoc("resto-quartier.air.json") as {
      screens: { blocks: { blockType: string }[] }[];
    };
    const block = doc.screens[0]?.blocks[0];
    if (block === undefined) throw new Error("fixture inattendue");
    block.blockType = "hero_carousel";
    expect(() => emitProject(doc)).toThrow(LockResolutionError);
  });

  it("deux actions UI sur le même bloc ⇒ EMIT_UI_ACTION_AMBIGUOUS (refus net)", () => {
    // Schéma-valide et hors périmètre des validateurs : c'est l'émetteur
    // qui refuse un comportement non spécifié (corpus v2 mesuré : 0 cas).
    const doc = loadDoc("resto-quartier.air.json") as {
      actions: { id: string; trigger: { kind: string; blockId?: string } }[];
    };
    const uiAction = doc.actions.find((a) => a.trigger.kind === "ui");
    if (uiAction === undefined) throw new Error("fixture inattendue");
    doc.actions.push({
      ...JSON.parse(JSON.stringify(uiAction)) as (typeof doc.actions)[number],
      id: "act_zz_doublon_ui",
    });
    let error: unknown;
    try {
      emitProject(doc);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EmitError);
    expect((error as EmitError).code).toBe("EMIT_UI_ACTION_AMBIGUOUS");
  });
});
