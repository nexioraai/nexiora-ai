// RENDU CONDITIONNEL DES BLOCS (AIR 1.1.0, D-044 — DET-017 volet 2).
//
// Le défaut corrigé : 19 écrans sur 50 portaient un `empty_state` rendu SANS
// condition, à côté d'une `list` qui avait déjà son état vide — un état vide
// s'affichait donc pendant que des données étaient présentes (observé sur
// appareil). Le contrat ne permettait pas d'exprimer la condition.
//
// Ce test vérifie les DEUX moitiés : la condition traverse le compilateur
// jusqu'aux données d'écran, ET le runtime émis sait l'évaluer.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProjectAir } from "@deribfy/air-schema";
import { compileProject } from "../src/compile-project.ts";
import { normalizeAir } from "../src/resolve-lock.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus", "corpus-v2");
const resto = normalizeAir(
  JSON.parse(readFileSync(join(CORPUS, "resto-quartier.air.json"), "utf8")),
) as ProjectAir;

const withCondition = (): ProjectAir => {
  const air = JSON.parse(JSON.stringify(resto)) as ProjectAir;
  const ecran = air.screens.find((s) => s.blocks.some((b) => b.blockType === "empty_state"));
  if (ecran === undefined) throw new Error("fixture : aucun écran à empty_state");
  const liste = ecran.blocks.find((b) => b.blockType === "list");
  const vide = ecran.blocks.find((b) => b.blockType === "empty_state");
  if (liste?.entityId === undefined || vide === undefined) throw new Error("fixture incomplète");
  (vide as { visibleWhen?: unknown }).visibleWhen = {
    kind: "entity_empty",
    entityId: liste.entityId,
  };
  return air;
};

describe("la condition traverse le compilateur", () => {
  it("un document SANS condition émet des données inchangées", () => {
    for (const [, contenu] of compileProject(resto).files) {
      if (typeof contenu === "string" && contenu.includes("screenData")) {
        expect(contenu.includes("visibleWhen")).toBe(false);
      }
    }
  });

  it("un document AVEC condition la transporte dans les données d'écran", () => {
    const air = withCondition();
    const ecran = air.screens.find((s) => s.blocks.some((b) => "visibleWhen" in b));
    const data = compileProject(air).files.get(`screens/${String(ecran?.id)}.data.ts`) ?? "";
    expect(data).toContain('"visibleWhen"');
    expect(data).toContain('"entity_empty"');
  });

  it("la condition change l'artefact et reste déterministe", () => {
    const air = withCondition();
    expect(compileProject(air).rootHash).not.toBe(compileProject(resto).rootHash);
    const hashes = Array.from({ length: 5 }, () => compileProject(air).rootHash);
    expect(new Set(hashes).size).toBe(1);
  });

  it("FAIL-CLOSED : condition sur une entité inexistante = refus", () => {
    const air = withCondition();
    const bloc = air.screens.flatMap((s) => s.blocks).find((b) => "visibleWhen" in b);
    (bloc as { visibleWhen: { entityId: string } }).visibleWhen.entityId = "ent_fantome";
    expect(() => compileProject(air)).toThrow();
  });
});

describe("le runtime ÉMIS sait évaluer la condition", () => {
  it("les deux prédicats sont implémentés dans la copie embarquée", () => {
    const runtime = compileProject(resto).files.get("lib/runtime/air-runtime.tsx") ?? "";
    expect(runtime).toContain("useBlockVisible");
    expect(runtime).toContain('condition.kind === "entity_empty"');
    // Le prédicat s'appuie sur la MÊME source que la liste : impossible que
    // l'état vide et la liste se contredisent.
    expect(runtime).toContain("provider.listInstances(condition.entityId)");
  });

  it("chaque wrapper de bloc consulte la visibilité", () => {
    const runtime = compileProject(resto).files.get("lib/runtime/air-runtime.tsx") ?? "";
    const occurrences = [...runtime.matchAll(/useBlockVisible\(screen, blockId\)/g)].length;
    expect(occurrences).toBe(6);
  });
});
