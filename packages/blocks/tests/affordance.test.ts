// D-104 — UN DÉCLENCHEUR `ui` EXIGE UNE AFFORDANCE.
//
// CAUSE RACINE, mesurée sur la génération P8 : trois actions déclarées avec
// `trigger:{kind:"ui", blockId:<detail_header>}`. Le validateur vérifiait que
// le bloc EXISTE, jamais qu'il puisse être actionné. `detail_header` n'expose
// aucun gestionnaire : les trois actions étaient valides et TOTALEMENT MORTES
// — absentes de l'artefact émis, invisibles à `controls()`, injoignables par
// aucun autre chemin.
//
// La liste des blocs actionnables n'est PAS recopiée : elle est dérivée du
// registre, et le premier test ci-dessous la lie au CONTRAT. C'est l'inverse
// de l'architecture qui avait produit D-095 et D-101.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BLOCKS, BLOCS_AFFORDANTS } from "../src/definitions.ts";
import { validateAirBlocks, type AirBlockSlice } from "../src/registry.ts";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const CONTRATS = readFileSync(join(SRC, "contracts.ts"), "utf8");

/** Le contrat d'un bloc déclare-t-il un gestionnaire `on*` ? */
const contratDeclareUnGestionnaire = (blockId: string): boolean => {
  const nom =
    blockId
      .split("_")
      .map((m) => m.charAt(0).toUpperCase() + m.slice(1))
      .join("") + "BlockProps";
  const i = CONTRATS.indexOf(`interface ${nom}`);
  if (i < 0) return false;
  const j = CONTRATS.indexOf("\n}", i);
  return /\bon[A-Z]\w*\??:/.test(CONTRATS.slice(i, j));
};

describe("affordance — la déclaration est LIÉE au contrat (D-104)", () => {
  it("🔒 CLIQUET : `porteAffordance` équivaut à « le contrat déclare un gestionnaire »", () => {
    // LE test qui empêche la dérive. Déclarer `porteAffordance` sans
    // gestionnaire — ou l'inverse — fait échouer ici, pas en production.
    for (const b of BLOCKS) {
      expect(b.porteAffordance, `${b.id} : déclaration ≠ contrat`).toBe(
        contratDeclareUnGestionnaire(b.id),
      );
    }
  });

  it("la source dérivée contient exactement les blocs actionnables", () => {
    expect([...BLOCS_AFFORDANTS].sort()).toEqual(["button", "empty_state", "form", "list"]);
    for (const sans of ["header", "detail_header"]) {
      expect(BLOCS_AFFORDANTS.has(sans), `${sans} n'est pas actionnable`).toBe(false);
    }
  });

  it("CONTRÔLE NÉGATIF : le cliquet sait détecter une divergence", () => {
    // Sans lui, un `contratDeclareUnGestionnaire` toujours faux passerait
    // pour une preuve. `header` n'en a pas, `button` en a un.
    expect(contratDeclareUnGestionnaire("header")).toBe(false);
    expect(contratDeclareUnGestionnaire("button")).toBe(true);
  });
});

const tranche = (blockType: string, triggerBlockId: string): AirBlockSlice => ({
  screens: [
    {
      id: "scr_a",
      blocks: [
        { id: "blk_cible", blockType, entityId: "ent_a", props: [{ key: "title", value: "T" }] },
      ],
    },
  ],
  entities: [{ id: "ent_a", fields: [{ id: "fld_a" }] }],
  actions: [{ id: "act_x", trigger: { kind: "ui", blockId: triggerBlockId } }],
});

const refusAffordance = (a: AirBlockSlice) =>
  validateAirBlocks(a).filter((d) => d.code === "BLOCK_TRIGGER_SANS_AFFORDANCE");

describe("un déclencheur `ui` exige un bloc actionnable", () => {
  it("🔴 vers un bloc SANS affordance : REFUSÉ", () => {
    for (const sans of ["header", "detail_header"]) {
      const d = refusAffordance(tranche(sans, "blk_cible"));
      expect(d, sans).toHaveLength(1);
      expect(d[0]?.path).toBe("actions[0].trigger.blockId");
      expect(d[0]?.message).toContain(sans);
    }
  });

  it("🟢 CONTRÔLE POSITIF : vers un bloc actionnable, ACCEPTÉ", () => {
    for (const avec of ["button", "empty_state", "form", "list"]) {
      expect(refusAffordance(tranche(avec, "blk_cible")), avec).toEqual([]);
    }
  });

  it("🟢 un bloc INCONNU n'est pas re-refusé ici — un seul diagnostic par défaut", () => {
    // `BLOCK_ENTITY_UNKNOWN` / `BLOCK_UNKNOWN` s'en chargent : empiler deux
    // refus sur la même cause brouillerait le diagnostic.
    expect(refusAffordance(tranche("button", "blk_inexistant"))).toEqual([]);
  });

  it("🟢 un déclencheur NON-`ui` n'est pas concerné", () => {
    const a = tranche("detail_header", "blk_cible");
    const avecLifecycle: AirBlockSlice = {
      ...a,
      actions: [{ id: "act_x", trigger: { kind: "lifecycle" } }],
    };
    expect(refusAffordance(avecLifecycle)).toEqual([]);
  });

  it("aucune régression : les blocs actuellement valides le restent", () => {
    // Toute combinaison actionnable × déclencheur ui doit passer.
    for (const b of BLOCKS.filter((x) => x.porteAffordance)) {
      expect(refusAffordance(tranche(b.id, "blk_cible")), b.id).toEqual([]);
    }
  });
});
