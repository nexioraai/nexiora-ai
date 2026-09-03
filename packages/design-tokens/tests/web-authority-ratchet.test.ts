import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// CLIQUET D'AUTORITÉ (scellement 3.1b — arbitrage propriétaire Option A,
// 2026-08-28). Depuis ce scellement, la SOURCE des tokens web est
// tokens.json : le segment de tokens de apps/web/src/app/globals.css est un
// ARTEFACT GÉNÉRÉ. Ce test échoue si quelqu'un édite le segment sans passer
// par tokens.json + codegen — l'édition redevient un acte conscient :
// modifier la source, régénérer (npm run generate:web), reporter le segment.
const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const GLOBALS = join(
  PKG,
  "..",
  "..",
  "apps",
  "web",
  "src",
  "app",
  "globals.css",
);

const FIN_MEDIA = "}\n}";

describe("autorité de la source de tokens (scellement 3.1b)", () => {
  it("CLIQUET — le segment de tokens de globals.css EST l'artefact généré, octet à octet", () => {
    const web = readFileSync(GLOBALS, "utf8");
    const generated = readFileSync(
      join(PKG, "theme.web.generated.css"),
      "utf8",
    );
    const start = web.indexOf(":root {");
    expect(start).toBeGreaterThan(-1);
    const mediaStart = web.indexOf("@media (prefers-color-scheme: dark) {");
    expect(mediaStart).toBeGreaterThan(start);
    const mediaEnd = web.indexOf(FIN_MEDIA, mediaStart);
    expect(mediaEnd).toBeGreaterThan(mediaStart);
    const segment = `${web.slice(start, mediaEnd + FIN_MEDIA.length)}\n`;
    expect(segment).toBe(generated);
  });

  it("le marqueur d'autorité est présent dans globals.css", () => {
    expect(readFileSync(GLOBALS, "utf8")).toContain(
      "packages/design-tokens/tokens.json",
    );
  });
});
