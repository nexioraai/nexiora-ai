// CAS-TUEURS DU CRITÈRE DE DOUBLON — D-086.
//
// Le critère a été PRÉCISÉ après avoir accusé à tort un appel à l'action
// légitime. Un critère assoupli sans preuve serait un contournement : ces tests
// exigent qu'il attrape TOUJOURS le défaut fondateur, et qu'il laisse passer
// exactement ce qu'il doit laisser passer.
import { describe, expect, it } from "vitest";
import { buildValidAir } from "./fixtures.ts";
import { validateAir } from "../src/validate.ts";
import type { ProjectAir } from "../src/air.ts";

/**
 * Construit un document à 3 onglets, plus un écran de FLUX hors barre, et
 * place un bouton `navigate` de `depuis` vers `vers`.
 */
function scenario(depuis: string, vers: string): ProjectAir {
  const a = JSON.parse(JSON.stringify(buildValidAir())) as ProjectAir;
  const ecranAvecDonnees = a.screens.find((s) => s.blocks.some((b) => b.entityId !== undefined));
  const modele = JSON.parse(JSON.stringify(ecranAvecDonnees)) as ProjectAir["screens"][number];
  const faire = (id: string): void => {
    const e = JSON.parse(JSON.stringify(modele)) as ProjectAir["screens"][number];
    e.id = id;
    e.blocks = e.blocks.map((b, i) => ({ ...b, id: `blk_${id.slice(4)}_${String(i)}` }));
    (a.screens as unknown[]).push(e);
    (a.navigation.routes as unknown[]).push({
      id: `nav_${id.slice(4)}`,
      screenId: id,
      title: [{ locale: "fr-FR", text: id }],
    });
  };
  for (const id of ["scr_t1", "scr_t2", "scr_t3", "scr_flux"]) faire(id);
  (a.navigation as { primary?: unknown }).primary = {
    destinations: ["scr_t1", "scr_t2", "scr_t3"].map((s, i) => ({
      routeId: `nav_${s.slice(4)}`,
      label: [{ locale: "fr-FR", text: s }],
      order: i,
    })),
  };
  const source = a.screens.find((s) => s.id === depuis);
  const bouton = { id: "blk_cta", blockType: "button", props: [{ key: "label", value: "Aller" }, { key: "actionId", value: "act_cta" }] };
  (source?.blocks as unknown[]).push(bouton);
  (a.actions as unknown[]).push({
    id: "act_cta",
    name: "cta",
    trigger: { kind: "ui", blockId: "blk_cta" },
    effect: { kind: "navigate", screenId: vers },
  });
  return a;
}

const codes = (a: ProjectAir): string[] => validateAir(a).map((d) => d.code);

describe("critère de doublon d'onglet — il doit MORDRE", () => {
  it("🔴 DÉFAUT FONDATEUR : bouton SUR un onglet → vers un AUTRE onglet", () => {
    // C'est exactement « Mon panier » placé sous la liste des plats, alors que
    // la barre porte déjà Panier. Le critère précisé DOIT le voir.
    expect(codes(scenario("scr_t1", "scr_t2"))).toContain("AIR_NAV_TAB_DUPLICATE");
  });

  it("🔴 le défaut tient même sur l'écran d'entrée", () => {
    expect(codes(scenario("scr_t1", "scr_t3"))).toContain("AIR_NAV_TAB_DUPLICATE");
  });
});

describe("critère de doublon — il ne doit PAS mordre à tort", () => {
  it("CTA depuis un écran de FLUX vers un onglet : LÉGITIME", () => {
    // « Débloquer avec l'abonnement mensuel » depuis la fiche d'un programme
    // verrouillé. Interdire cela reviendrait à interdire toute conversion.
    expect(codes(scenario("scr_flux", "scr_t2"))).not.toContain("AIR_NAV_TAB_DUPLICATE");
  });

  it("bouton depuis un onglet vers un écran de FLUX : LÉGITIME", () => {
    // « Commander » depuis le panier : fait avancer, ne double rien.
    expect(codes(scenario("scr_t1", "scr_flux"))).not.toContain("AIR_NAV_TAB_DUPLICATE");
  });

  it("un document SANS `primary` n'est jamais concerné", () => {
    const a = scenario("scr_t1", "scr_t2");
    delete (a.navigation as { primary?: unknown }).primary;
    expect(codes(a)).not.toContain("AIR_NAV_TAB_DUPLICATE");
  });
});
