// CLIQUET STATIQUE ZÉRO-RÉSEAU / ZÉRO-LLM (4.6, D-031 — critère ROADMAP
// « aucun appel LLM dans le chemin de compilation, prouvé par
// instrumentation ») : volet STATIQUE de la preuve — aucune source du
// chemin de compilation (src/ + runtime copié) n'importe un module réseau
// ni un SDK LLM ; les dépendances du paquet restent l'allowlist moteur.
// Le volet DYNAMIQUE (campagne 12×10 sous harnais qui tue tout accès
// réseau, contrôle positif inclus) : benchmarks/compiler-determinism/
// v46-critere-dur.mjs + v5-zero-reseau-preload.mjs.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN_SPECIFIERS = [
  "net",
  "dns",
  "tls",
  "http",
  "https",
  "http2",
  "dgram",
  "child_process",
  "worker_threads",
  "undici",
  "@anthropic-ai/sdk",
  "openai",
]
  .flatMap((m) => [m, `node:${m}`])
  .map((m) => `from "${m}"`);

const sourceFiles = (dir: string): string[] =>
  readdirSync(join(PKG, dir))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => join(dir, f));

describe("cliquet statique zéro-réseau (chemin de compilation)", () => {
  it("aucun import de module réseau/LLM dans src/ ni runtime/", () => {
    for (const file of [...sourceFiles("src"), ...sourceFiles("runtime")]) {
      const content = readFileSync(join(PKG, file), "utf8");
      for (const forbidden of FORBIDDEN_SPECIFIERS) {
        expect(content.includes(forbidden), `${file} → ${forbidden}`).toBe(false);
      }
      expect(content.includes("fetch("), `${file} → fetch(`).toBe(false);
    }
  });

  it("dépendances du paquet = allowlist moteur exacte", () => {
    const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    // ÉDITION CONSCIENTE (Phase 10, §15) : le résolveur renseigne désormais
    // `resolved.providers` depuis le registre de providers. Ce paquet est
    // du DONNÉES PURES dérivées du registre de capabilities gelé — aucun
    // accès réseau, aucun SDK — la propriété que ce cliquet protège reste
    // donc entière (elle est re-vérifiée ci-dessus sur les sources).
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      "@deribfy/air-schema",
      "@deribfy/blocks",
      "@deribfy/capability-registry",
      "@deribfy/design-tokens",
      "@deribfy/provider-registry",
      "zod",
    ]);
  });

  it("seul artifact-store touche le fs ; resolve/emit/compile restent purs", () => {
    for (const file of sourceFiles("src")) {
      const content = readFileSync(join(PKG, file), "utf8");
      if (content.includes('from "node:fs"')) {
        expect(file.endsWith("artifact-store.ts"), file).toBe(true);
      }
    }
  });
});
