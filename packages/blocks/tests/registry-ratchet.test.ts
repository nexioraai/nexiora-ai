import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BLOCK_REGISTRY_VERSION, BLOCKS, blocks } from "../src";

// CLIQUETS DE REGISTRE (patron D-020) : liste v1 EXACTE, versions, ordre
// stable, indépendance E2E. Ajouter/retirer un bloc DOIT faire échouer un
// test ici — modification = acte conscient (décision consignée + version
// mineure), jamais un effet de bord (D-023 : pas d'élargissement au cas où).
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

// Liste v1 EXACTE — GELÉE (L2 + D-024, revue propriétaire du 2026-08-28).
const V1_BLOCK_IDS = [
  "button",
  "detail_header",
  "empty_state",
  "form",
  "header",
  "list",
];

describe("cliquets du registre de blocs", () => {
  it("CLIQUET — la liste v1 est exacte, triée, sans doublon", () => {
    expect(BLOCKS.map((b) => b.id)).toEqual(V1_BLOCK_IDS);
  });

  it("CLIQUET — versions GELÉES (D-024) : registre 1.0.0, les 6 contrats 1.0.0", () => {
    expect(BLOCK_REGISTRY_VERSION).toBe("1.0.0");
    expect(BLOCKS.map((b) => [b.id, b.version])).toEqual(
      V1_BLOCK_IDS.map((id) => [id, "1.0.0"]),
    );
  });

  it("CLIQUET — chaque bloc du registre a son composant, et réciproquement", () => {
    const toComponent = (id: string): string =>
      `${id.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("")}Block`;
    expect(Object.keys(blocks).sort()).toEqual(V1_BLOCK_IDS.map(toComponent).sort());
  });

  it("CLIQUET — liaison d'entité toujours explicite, jamais ambiguë", () => {
    for (const b of BLOCKS) expect(["required", "forbidden"]).toContain(b.entity);
  });

  it("CLIQUET — indépendance E2E : aucune trace de maestro/detox dans les sources", () => {
    for (const file of readdirSync(SRC)) {
      const source = readFileSync(join(SRC, file), "utf8")
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("//"))
        .join("\n")
        .toLowerCase();
      expect(source.includes("maestro"), `${file} référence maestro`).toBe(false);
      expect(source.includes("detox"), `${file} référence detox`).toBe(false);
    }
  });
});
