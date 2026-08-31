// PREUVES 1 et 9 — le CONTRAT refuse ce qu'il doit refuser.
//
// Un validateur qui n'a jamais été vu refuser ne prouve rien. Chaque cas
// ci-dessous provoque UNE faute et exige le diagnostic exact.
import { describe, expect, it } from "vitest";
import { buildValidAir } from "./fixtures.ts";
import { validateAir } from "../src/validate.ts";
import { projectAirSchema, type ProjectAir } from "../src/air.ts";

const avecNav = (destinations: unknown): ProjectAir => {
  const a = JSON.parse(JSON.stringify(buildValidAir())) as ProjectAir;
  (a.navigation as { primary?: unknown }).primary = { destinations };
  return a;
};
const codes = (a: ProjectAir): string[] => validateAir(a).map((d) => d.code);

describe("PREUVE 1 — `navigation.primary` est défini et validé", () => {
  it("un document SANS `primary` reste valide (rétro-compatibilité)", () => {
    expect(validateAir(buildValidAir())).toEqual([]);
    expect(projectAirSchema.safeParse(buildValidAir()).success).toBe(true);
  });

  it("le schéma REFUSE moins de 3 ou plus de 5 destinations", () => {
    const deux = [
      { routeId: "nav_a", label: [{ locale: "fr-FR", text: "A" }], order: 0 },
      { routeId: "nav_b", label: [{ locale: "fr-FR", text: "B" }], order: 1 },
    ];
    expect(projectAirSchema.safeParse(avecNav(deux)).success, "2 destinations").toBe(false);
    const six = Array.from({ length: 6 }, (_, i) => ({
      routeId: `nav_${String(i)}`,
      label: [{ locale: "fr-FR", text: `T${String(i)}` }],
      order: i,
    }));
    expect(projectAirSchema.safeParse(avecNav(six)).success, "6 destinations").toBe(false);
  });
});

describe("PREUVE 9 — une destination MORTE est refusée", () => {
  const trois = (routes: string[]): unknown =>
    routes.map((r, i) => ({ routeId: r, label: [{ locale: "fr-FR", text: `T${String(i)}` }], order: i }));

  it("route INEXISTANTE → AIR_NAV_ROUTE_MISSING", () => {
    const a = avecNav(trois(["nav_inexistante", "nav_inexistante2", "nav_inexistante3"]));
    expect(codes(a)).toContain("AIR_NAV_ROUTE_MISSING");
  });

  it("ORDRES en doublon → AIR_NAV_ORDER_DUPLICATE", () => {
    const base = buildValidAir();
    const r = base.navigation.routes[0]?.id ?? "nav_x";
    const a = avecNav([
      { routeId: r, label: [{ locale: "fr-FR", text: "A" }], order: 0 },
      { routeId: r, label: [{ locale: "fr-FR", text: "B" }], order: 0 },
      { routeId: r, label: [{ locale: "fr-FR", text: "C" }], order: 0 },
    ]);
    expect(codes(a)).toContain("AIR_NAV_ORDER_DUPLICATE");
  });

  it("🔴 ÉCRAN MORT (ni donnée ni action) → AIR_NAV_DESTINATION_DEAD", () => {
    // Un écran qui ne porte qu'un `header` : rien à montrer, rien à faire.
    // C'est exactement la « belle barre menant à du vide » que ce refus existe
    // pour empêcher.
    const a = JSON.parse(JSON.stringify(buildValidAir())) as ProjectAir;
    (a.screens as unknown[]).push({
      id: "scr_vide",
      title: [{ locale: "fr-FR", text: "Vide" }],
      blocks: [{ id: "blk_vide_h", blockType: "header", props: [{ key: "title", value: "Rien" }] }],
    });
    (a.navigation.routes as unknown[]).push({
      id: "nav_vide",
      screenId: "scr_vide",
      title: [{ locale: "fr-FR", text: "Vide" }],
    });
    const r0 = a.navigation.routes[0]?.id ?? "nav_x";
    (a.navigation as { primary?: unknown }).primary = {
      destinations: [
        { routeId: r0, label: [{ locale: "fr-FR", text: "A" }], order: 0 },
        { routeId: "nav_vide", label: [{ locale: "fr-FR", text: "Vide" }], order: 1 },
        { routeId: r0, label: [{ locale: "fr-FR", text: "C" }], order: 2 },
      ],
    };
    const d = validateAir(a);
    const mort = d.find((x) => x.code === "AIR_NAV_DESTINATION_DEAD");
    expect(mort, "une destination sans donnée ni action doit être REFUSÉE").toBeDefined();
    expect(mort?.message).toContain("scr_vide");
  });

  it("CONTRÔLE POSITIF : une destination VIVANTE est acceptée", () => {
    // Sans ce contrôle, « tout refuser » suffirait à faire verdir les cas-tueurs.
    const base = buildValidAir();
    const vivante = base.navigation.routes.find((r) =>
      base.screens.some((s) => s.id === r.screenId && s.blocks.some((b) => b.entityId !== undefined)),
    );
    expect(vivante, "la fixture doit contenir un écran avec des données").toBeDefined();
    const a = avecNav([
      { routeId: vivante?.id ?? "", label: [{ locale: "fr-FR", text: "A" }], order: 0 },
      { routeId: vivante?.id ?? "", label: [{ locale: "fr-FR", text: "B" }], order: 1 },
      { routeId: vivante?.id ?? "", label: [{ locale: "fr-FR", text: "C" }], order: 2 },
    ]);
    expect(codes(a)).not.toContain("AIR_NAV_DESTINATION_DEAD");
  });
});
