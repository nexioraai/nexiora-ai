// DIMENSION H — mesure cross-domain sur le corpus GELÉ (Phase 10).
//
// Ce fichier CONSIGNE une non-conformité, il ne la contourne pas : la
// mesure établit que les 12 apps générées sont visuellement IDENTIQUES
// alors que leurs documents déclarent 12 thèmes différents. C'est le
// constat qui alimente la liste « design system v2 » (dette DET-021).
// Si un jour le thème par app devient effectif, ces attentes changeront —
// consciemment, avec une décision consignée.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileProject } from "@deribfy/compiler";
import type { ProjectAir } from "@deribfy/air-schema";
import {
  evaluateAntiTemplate,
  structuralSignature,
  visualSignature,
  VISUAL_FILES,
} from "../src/anti-template.ts";
import { evaluateApxxGrid } from "../src/apxx-grid.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus", "corpus-v2");
const docs = readdirSync(CORPUS)
  .filter((f) => f.endsWith(".air.json"))
  .sort();
const samples = docs.map((file) => {
  const air = JSON.parse(readFileSync(join(CORPUS, file), "utf8")) as ProjectAir;
  return { domain: file.replace(".air.json", ""), air, files: compileProject(air).files };
});

describe("axe STRUCTUREL — les silhouettes diffèrent", () => {
  it("12 domaines, 12 silhouettes distinctes, 0 collision", () => {
    const report = evaluateAntiTemplate(samples);
    expect(report.domains).toBe(12);
    expect(report.structuralCollisions).toEqual([]);
    expect(new Set(report.structuralSignatures.map((s) => s.signature)).size).toBe(12);
  });

  it("la silhouette ne dépend pas de l'ordre de déclaration des écrans", () => {
    const air = samples[0]?.air;
    if (air === undefined) throw new Error("fixture");
    const inverse = { ...air, screens: [...air.screens].reverse() } as ProjectAir;
    expect(structuralSignature(inverse)).toBe(structuralSignature(air));
  });

  it("la silhouette CHANGE si la composition change réellement", () => {
    const air = samples[0]?.air;
    if (air === undefined) throw new Error("fixture");
    const ampute = { ...air, screens: air.screens.slice(0, -1) } as ProjectAir;
    expect(structuralSignature(ampute)).not.toBe(structuralSignature(air));
  });
});

describe("axe VISUEL — la variété déclarée est INERTE (constat)", () => {
  it("12 thèmes déclarés, UNE SEULE identité visuelle émise", () => {
    const report = evaluateAntiTemplate(samples);
    expect(report.declaredThemes).toHaveLength(12);
    expect(report.visualVariants).toBe(1);
  });

  it("chaque fichier visuel est byte-identique d'un domaine à l'autre", () => {
    for (const path of VISUAL_FILES) {
      const variants = new Set(samples.map((s) => s.files.get(path) ?? ""));
      expect(variants.size, path).toBe(1);
    }
    expect(new Set(samples.map((s) => visualSignature(s.files))).size).toBe(1);
  });

  it("le thème déclaré n'apparaît dans AUCUN fichier émis", () => {
    for (const sample of samples) {
      const theme = sample.air.design.theme;
      const hits = [...sample.files.entries()].filter(([, c]) => c.includes(theme)).map(([p]) => p);
      expect(hits, `${sample.domain} → ${theme}`).toEqual([]);
    }
  });
});

describe("verdict de la dimension H", () => {
  it("NON CONFORME : structure variée, identité visuelle unique", () => {
    const report = evaluateAntiTemplate(samples);
    expect(report.state).toBe("non_conforme");
    expect(report.detail).toContain("variété déclarée INERTE");
  });

  it("moins de 2 domaines ⇒ NON DÉTERMINÉE, jamais conforme", () => {
    expect(evaluateAntiTemplate(samples.slice(0, 1)).state).toBe("non_determinee");
    expect(evaluateAntiTemplate([]).state).toBe("non_determinee");
  });

  it("CONTRE-ÉPREUVE : des thèmes déclarés identiques rendent le verdict conforme", () => {
    // Si les documents ne demandaient AUCUNE variété visuelle, une
    // apparence commune ne serait pas un défaut. L'instrument ne condamne
    // donc pas l'uniformité en soi — il condamne l'écart entre la variété
    // DÉCLARÉE et la variété ÉMISE.
    const memeTheme = samples.map((s) => ({
      ...s,
      air: { ...s.air, design: { ...s.air.design, theme: "theme_unique" } },
    }));
    expect(evaluateAntiTemplate(memeTheme).state).toBe("conforme");
  });

  it("CONTRE-ÉPREUVE : une collision de silhouette rend le verdict non conforme", () => {
    const air = samples[0]?.air;
    const jumeau = samples[1];
    if (air === undefined || jumeau === undefined) throw new Error("fixture");
    const clone = { ...jumeau, air: { ...air } as ProjectAir, domain: "domaine_clone" };
    expect(evaluateAntiTemplate([samples[0] as never, clone]).structuralCollisions).toHaveLength(1);
  });
});

describe("intégration dans la grille A++", () => {
  it("sans échantillon cross-domain, H reste NON DÉTERMINÉE", () => {
    const first = samples[0];
    if (first === undefined) throw new Error("fixture");
    const grid = evaluateApxxGrid(first.files, first.air);
    expect(grid.dimensions.find((d) => d.dimension === "H")?.state).toBe("non_determinee");
  });

  it("avec les 12 domaines, H devient MESURÉE et non conforme", () => {
    const first = samples[0];
    if (first === undefined) throw new Error("fixture");
    const grid = evaluateApxxGrid(first.files, first.air, samples);
    const h = grid.dimensions.find((d) => d.dimension === "H");
    expect(h?.state).toBe("non_conforme");
    expect(h?.detail).toContain("12 domaines");
  });
});
