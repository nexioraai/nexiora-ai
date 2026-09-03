// CLIQUET PROVIDER-AGNOSTIC (D-033, exigence propriétaire NON NÉGOCIABLE) :
// AUCUN module source du cœur (`src/`) n'importe un SDK de provider
// concret ni ne nomme un provider. Les adaptateurs vivent HORS du cœur et
// sont injectés. Ce test échoue si un couplage à un provider fuite dans le
// moteur — garantie pérenne d'interchangeabilité Modal ⇄ E2B.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const FORBIDDEN = [
  'from "modal"',
  'from "e2b"',
  "require('modal')",
  'require("modal")',
  "require('e2b')",
  'require("e2b")',
  "api.supabase.com",
  "fly.io",
  "vercel",
];

const sources = readdirSync(SRC).filter((f) => f.endsWith(".ts"));

describe("cliquet provider-agnostic (cœur sandbox)", () => {
  it("le cœur src/ n'importe aucun SDK de provider concret", () => {
    for (const file of sources) {
      const content = readFileSync(join(SRC, file), "utf8");
      for (const forbidden of FORBIDDEN) {
        expect(content.includes(forbidden), `${file} → ${forbidden}`).toBe(false);
      }
    }
  });

  it("le contrat n'expose aucun type nommant un provider", () => {
    const contracts = readFileSync(join(SRC, "contracts.ts"), "utf8");
    // Le mot d'un provider peut apparaître en COMMENTAIRE (doc) mais jamais
    // dans un identifiant de type/interface exporté.
    const exportedTypes = [...contracts.matchAll(/export (?:interface|type|class) (\w+)/g)].map((m) => m[1] ?? "");
    for (const name of exportedTypes) {
      expect(/modal|e2b|supabase|fly|vercel/i.test(name), name).toBe(false);
    }
  });
});
