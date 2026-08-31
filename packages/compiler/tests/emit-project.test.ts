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
import { compileProject } from "../src/compile-project.ts";
import { LockResolutionError, normalizeAir } from "../src/resolve-lock.ts";
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
    // ÉDITION CONSCIENTE (D-044) : le hash porte sur le document NORMALISÉ
    // (migré 1.0.0 → 1.1.0 en mémoire), pas sur le fichier brut.
    expect(lock.airHash).toBe(sha256Hex(canonicalJson(normalizeAir(doc))));
  });
});

describe("émetteur — manifestes/permissions/config native (4.4, D-029)", () => {
  const registryPromise = import("@deribfy/capability-registry");

  for (const file of v2Docs) {
    it(`app.json + manifeste de permissions conformes : ${file}`, async () => {
      const { inducedPermissionsFor } = await registryPromise;
      const doc = loadDoc(file) as {
        app: { slug: string };
        capabilities: { capability: string }[];
        native: { minAndroidSdk?: number; minIosVersion?: string };
      };
      const { files } = emitProject(doc);
      const appJson = JSON.parse(files.get("app.json") ?? "") as {
        expo: {
          slug: string;
          newArchEnabled: boolean;
          android: { package: string; permissions: string[] };
          ios: { bundleIdentifier: string; infoPlist?: Record<string, string> };
          plugins: [string, { android: { minSdkVersion: number }; ios: { deploymentTarget: string } }][];
          scheme?: string;
        };
      };
      const ids = doc.capabilities.map((c) => c.capability);
      const induced = inducedPermissionsFor(ids);

      expect(appJson.expo.slug).toBe(doc.app.slug);
      expect(appJson.expo.newArchEnabled).toBe(true);
      // Permissions Android = agrégation transitive du registre, à l'identique.
      expect(appJson.expo.android.permissions).toEqual(
        induced.filter((p) => p.platform === "android").map((p) => p.permission),
      );
      // Chaque permission iOS induite a son texte d'usage (raison AIR).
      for (const p of induced.filter((x) => x.platform === "ios")) {
        const text = appJson.expo.ios.infoPlist?.[p.permission];
        expect(text, p.permission).toBeDefined();
        expect((text ?? "").length).toBeGreaterThan(0);
      }
      // Config native : max(plancher du train, exigence AIR).
      const bp = appJson.expo.plugins.find((x) => x[0] === "expo-build-properties");
      expect(bp).toBeDefined();
      expect(bp?.[1].android.minSdkVersion).toBe(
        Math.max(24, doc.native.minAndroidSdk ?? 24),
      );
      // Schéma de deep link ssi la capability est déclarée.
      expect("scheme" in appJson.expo).toBe(ids.includes("deep_links"));

      const manifest = JSON.parse(
        files.get("manifests/permissions.manifest.json") ?? "",
      ) as { induced: unknown; declared: unknown[]; native: unknown };
      expect(manifest.induced).toEqual(induced);
      expect(manifest.native).toEqual(doc.native);
    });
  }

  it("permission iOS induite sans raison déclarée ⇒ EMIT_PERMISSION_REASON_MISSING (défense)", async () => {
    const { emitAppJson } = await import("../src/emit-manifests.ts");
    const { projectAirSchema } = await import("@deribfy/air-schema");
    const { RELEASE_TRAIN_V1 } = await import("../src/release-train.ts");
    // Document réel AVEC permission iOS induite, raison retirée APRÈS
    // validation (le validateur registre l'exige — défense en profondeur).
    const withIos = v2Docs
      .map((f) => loadDoc(f) as { permissions: { platform: string }[] })
      .find((d) => d.permissions.some((p) => p.platform === "ios"));
    if (withIos === undefined) throw new Error("fixture inattendue");
    // Le document du corpus déclare 1.0.0 : il faut le NORMALISER avant de
    // le parser contre le schéma courant (D-044).
    const { normalizeAir: normaliser } = await import("../src/resolve-lock.ts");
    const air = projectAirSchema.parse(normaliser(withIos));
    const stripped = {
      ...air,
      permissions: air.permissions.filter((p) => p.platform !== "ios"),
    };
    let error: unknown;
    try {
      emitAppJson(stripped, RELEASE_TRAIN_V1);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EmitError);
    expect((error as EmitError).code).toBe("EMIT_PERMISSION_REASON_MISSING");
  });
});

describe("émetteur — fixtures demo déterministes (4.5, D-030)", () => {
  for (const file of v2Docs) {
    it(`fixtures conformes au schéma et aux datasets : ${file}`, () => {
      const doc = loadDoc(file) as {
        datasets: { entityId: string; rowCount: number }[];
        entities: {
          id: string;
          fields: { id: string; type: string; enumValues?: string[] }[];
        }[];
      };
      const { files } = emitProject(doc);
      const module = files.get("demo.data.ts") ?? "";
      const marker = "DemoData = ";
      const json = module.slice(
        module.indexOf(marker) + marker.length,
        module.lastIndexOf(";"),
      );
      const demo = JSON.parse(json) as Record<
        string,
        { id: string; values: Record<string, string> }[]
      >;

      // rowCount respecté par entité (datasets cumulés).
      const expected = new Map<string, number>();
      for (const d of doc.datasets) {
        expected.set(d.entityId, (expected.get(d.entityId) ?? 0) + d.rowCount);
      }
      for (const [entityId, count] of expected) {
        expect(demo[entityId]?.length, entityId).toBe(count);
      }

      // Énums ∈ enumValues ; références → ids de lignes réels ; ids uniques.
      const entitiesById = new Map(doc.entities.map((e) => [e.id, e]));
      for (const [entityId, rows] of Object.entries(demo)) {
        const fields = entitiesById.get(entityId)?.fields ?? [];
        const ids = new Set(rows.map((r) => r.id));
        expect(ids.size).toBe(rows.length);
        for (const row of rows) {
          for (const field of fields) {
            const value = row.values[field.id];
            expect(value, `${entityId}.${field.id}`).toBeDefined();
            if (field.type === "enum" && (field.enumValues ?? []).length > 0) {
              expect(field.enumValues).toContain(value);
            }
          }
        }
      }
      // Références croisées : chaque valeur non vide pointe une ligne réelle.
      for (const entity of doc.entities) {
        for (const field of entity.fields.filter((f) => f.type === "reference")) {
          for (const row of demo[entity.id] ?? []) {
            const v = row.values[field.id] ?? "";
            if (v !== "") {
              const target = (field as { referencesEntityId?: string }).referencesEntityId ?? "";
              expect(
                (demo[target] ?? []).some((r) => r.id === v),
                `${entity.id}.${field.id} -> ${v}`,
              ).toBe(true);
            }
          }
        }
      }
    });
  }
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

// DET-006 (D-039, dimension G) — VERROU MÉCANIQUE de la propriété recherchée.
// Ne dépend d'aucun appareil : se lit directement sur le code émis.
describe("DET-006 — virtualisation : bornage des écrans porteurs de liste", () => {
  const docs = v2Docs;

  it("un écran AVEC bloc list n'émet AUCUN ScrollView englobant", () => {
    const offenders: string[] = [];
    for (const file of docs) {
      const air = JSON.parse(readFileSync(join(CORPUS_V2, file), "utf8")) as {
        screens: { id: string; blocks: { blockType: string }[] }[];
      };
      const { files } = compileProject(air);
      for (const screen of air.screens) {
        const hasList = screen.blocks.some((b) => b.blockType === "list");
        const path = [...files.keys()].find((k) => k.endsWith(`${screen.id}.tsx`));
        if (path === undefined) continue;
        const code = String(files.get(path));
        if (hasList && code.includes("ScrollView")) {
          offenders.push(`${file}:${screen.id}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("un écran SANS bloc list reste une page défilante (non-régression D-031-R47)", () => {
    let checked = 0;
    for (const file of docs) {
      const air = JSON.parse(readFileSync(join(CORPUS_V2, file), "utf8")) as {
        screens: { id: string; blocks: { blockType: string }[] }[];
      };
      const { files } = compileProject(air);
      for (const screen of air.screens) {
        if (screen.blocks.some((b) => b.blockType === "list")) continue;
        const path = [...files.keys()].find((k) => k.endsWith(`${screen.id}.tsx`));
        if (path === undefined) continue;
        expect(String(files.get(path))).toContain("ScrollView");
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
