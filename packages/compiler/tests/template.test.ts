// GABARIT VERSIONNÉ (4.2, D-026 S4 / D-027-R42) — invariants vérifiés en
// CI SANS RÉSEAU : cohérence gabarit ⇔ release train (dépendances EXACTES,
// lockfile pré-résolu aux pins du train), identité npm FIXE (l'identité
// d'une app générée vit dans app.json, émis depuis l'AIR en 4.4 — jamais
// dans le nom npm, sinon le lockfile diverge par app), zéro script
// d'installation. La preuve lourde (npm ci ×2 arbres identiques + fumée
// d'export) est versionnée : benchmarks/compiler-determinism/
// results/v42-gabarit.jsonl.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RELEASE_TRAIN_V1 } from "../src/release-train.ts";

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), "..", "template");

interface LockPackage {
  version?: string;
  dependencies?: Record<string, string>;
}
interface Lockfile {
  name: string;
  lockfileVersion: number;
  packages: Record<string, LockPackage>;
}

const pkg = JSON.parse(
  readFileSync(join(TEMPLATE, "package.json"), "utf8"),
) as {
  name: string;
  version: string;
  private: boolean;
  main: string;
  scripts?: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const lock = JSON.parse(
  readFileSync(join(TEMPLATE, "package-lock.json"), "utf8"),
) as Lockfile;

describe("gabarit — cohérence avec le release train", () => {
  it("dépendances du package.json = templateDependencies EXACTES du train", () => {
    expect(pkg.dependencies).toEqual(RELEASE_TRAIN_V1.templateDependencies);
  });

  it("chaque pin du train est résolu à l'IDENTIQUE dans le lockfile", () => {
    for (const [name, version] of Object.entries(
      RELEASE_TRAIN_V1.templateDependencies,
    )) {
      expect(lock.packages[`node_modules/${name}`]?.version).toBe(version);
    }
  });

  it("lockfile v3, même nom que le package.json, racine cohérente", () => {
    expect(lock.lockfileVersion).toBe(3);
    expect(lock.name).toBe(pkg.name);
    expect(lock.packages[""]?.dependencies).toEqual(pkg.dependencies);
  });
});

describe("gabarit — identité et hygiène", () => {
  it("identité npm FIXE (l'identité d'app vit dans app.json, émis en 4.4)", () => {
    expect(pkg.name).toBe("deribfy-generated-app");
    expect(pkg.version).toBe("0.0.0");
    expect(pkg.private).toBe(true);
    expect(pkg.main).toBe("index.ts");
  });

  it("aucun script d'installation ni de cycle de vie", () => {
    expect(pkg.scripts).toBeUndefined();
  });

  it("devDependencies = templateDevDependencies EXACTES du train (tsc pour l'Oracle §9)", () => {
    expect(pkg.devDependencies).toEqual(RELEASE_TRAIN_V1.templateDevDependencies);
    expect(lock.packages["node_modules/typescript"]?.version).toBe(
      RELEASE_TRAIN_V1.templateDevDependencies.typescript,
    );
  });

  it("fichiers du gabarit : liste exacte, aucun App/app.json (émis 4.3/4.4)", () => {
    expect(readdirSync(TEMPLATE).sort()).toEqual([
      ".gitignore",
      "index.ts",
      "package-lock.json",
      "package.json",
      "tsconfig.json",
    ]);
  });

  it("index.ts et tsconfig conformes au patron prouvé (harnais 3.4)", () => {
    const index = readFileSync(join(TEMPLATE, "index.ts"), "utf8");
    expect(index).toContain("registerRootComponent(App)");
    const tsconfig = JSON.parse(
      readFileSync(join(TEMPLATE, "tsconfig.json"), "utf8"),
    ) as { extends: string; compilerOptions: { strict: boolean } };
    expect(tsconfig.extends).toBe("expo/tsconfig.base");
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });
});
