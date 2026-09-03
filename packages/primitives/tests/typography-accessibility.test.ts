// DIMENSION E de la grille A++ (D-039) — OUTILLAGE.
// La règle de périmètre de D-039-R2 interdit de reporter une dimension non
// mesurée faute d'INSTRUMENT : l'instrument doit être produit dans la phase.
// Ce fichier est cet instrument. Il verrouille MÉCANIQUEMENT les conditions
// nécessaires à l'absence de troncature aux tailles d'accessibilité système
// maximales — sans dépendre d'un appareil.
// PORTÉE HONNÊTE : ces contrôles établissent que RIEN dans le système
// n'EMPÊCHE le texte de grandir ni ne le CLIPPE. L'observation du rendu réel
// aux tailles maximales reste à faire sur appareil (consignée comme telle).
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PRIM_SRC = join(HERE, "..", "src");
const BLOCKS_SRC = join(HERE, "..", "..", "blocks", "src");
const TOKENS = JSON.parse(
  readFileSync(join(HERE, "..", "..", "design-tokens", "tokens.json"), "utf8"),
) as {
  // Les 4 tailles sont GARANTIES OBLIGATOIRES par `designTokensSchema`
  // (strictObject) — prouvé par épreuve comportementale : retirer l'une
  // quelconque, ou la poser à `undefined`, fait REFUSER le document.
  // Le typage explicite reflète donc le contrat réel, là où un
  // `Record<string, number>` perdait cette garantie sous
  // `noUncheckedIndexedAccess`. Aucun contournement de type.
  font: { label: number; body: number; title: number; heading: number };
};

const sources = (dir: string): { file: string; code: string }[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => ({ file: `${dir.split("/").slice(-2).join("/")}/${f}`, code: readFileSync(join(dir, f), "utf8") }));

const ALL = [...sources(PRIM_SRC), ...sources(BLOCKS_SRC)];

describe("dimension E — typographie et tailles d'accessibilité", () => {
  it("l'échelle typographique est STRICTEMENT hiérarchique", () => {
    const { label, body, title, heading } = TOKENS.font;
    expect(label).toBeLessThan(body);
    expect(body).toBeLessThan(title);
    expect(title).toBeLessThan(heading);
  });

  it("la mise à l'échelle système n'est JAMAIS désactivée", () => {
    const offenders = ALL.filter(({ code }) =>
      /allowFontScaling\s*=\s*\{?\s*false/.test(code),
    ).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("aucune hauteur FIXE ne peut clipper du texte agrandi", () => {
    // `minHeight` est autorisé (il grandit) ; `height:` fixe ne l'est pas.
    const offenders = ALL.filter(({ code }) =>
      /(?<![a-zA-Z])height\s*:\s*\d/.test(code.replace(/minHeight\s*:\s*[^,\n]+/g, "")),
    ).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("aucune troncature imposée par numberOfLines", () => {
    const offenders = ALL.filter(({ code }) => code.includes('numberOfLines')).map(
      ({ file }) => file,
    );
    expect(offenders).toEqual([]);
  });

  it("aucun interligne FIXE ne bride l'agrandissement", () => {
    const offenders = ALL.filter(({ code }) => /lineHeight\s*:\s*\d/.test(code)).map(
      ({ file }) => file,
    );
    expect(offenders).toEqual([]);
  });
});
