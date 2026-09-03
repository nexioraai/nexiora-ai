import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// CLIQUET RTL — le miroir automatique prouvé au banc P-003 (6/6 sans code
// spécifique) repose sur les propriétés LOGIQUES : aucune propriété
// directionnelle PHYSIQUE n'est autorisée dans les sources du paquet.
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const PHYSIQUES =
  /\b(marginLeft|marginRight|paddingLeft|paddingRight|left|right|borderTopLeftRadius|borderTopRightRadius|borderBottomLeftRadius|borderBottomRightRadius)\s*:/;

describe("propriétés logiques RTL", () => {
  it.each(readdirSync(SRC).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx")))(
    "%s — aucune propriété directionnelle physique",
    (file) => {
      const source = readFileSync(join(SRC, file), "utf8");
      expect(source).not.toMatch(PHYSIQUES);
      expect(source).not.toMatch(/textAlign:\s*"(left|right)"/);
    },
  );
});
