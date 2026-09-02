// E1/E2 (D-129) — VALIDATION FAIL-CLOSED des nouveaux props de `list`.
// Formes refusées par zod (BLOCK_PROPS_INVALID), sémantique du scope refusée
// par le registre (BLOCK_SCOPE_INVALID) — additif : un document sans ces
// props est STRICTEMENT inchangé.
import { describe, expect, it } from "vitest";
import { validateAirBlocks } from "../src/registry.ts";

const P = (r: Record<string, unknown>) => Object.entries(r).map(([key, value]) => ({ key, value }));
const doc = (listProps: Record<string, unknown>, opts?: { sansEntete?: boolean; champScope?: { type?: string; cible?: string } }) => ({
  screens: [{
    id: "scr_detail",
    blocks: [
      ...(opts?.sansEntete ? [] : [{ id: "blk_tete", blockType: "detail_header", entityId: "ent_route",
        props: P({ titleFieldId: "fld_route_nom" }) }]),
      { id: "blk_liste", blockType: "list", entityId: "ent_trajet",
        props: P({ titleFieldId: "fld_trajet_dest", ...listProps }) },
    ],
  }],
  entities: [
    { id: "ent_route", fields: [{ id: "fld_route_nom" }] },
    { id: "ent_trajet", fields: [
      { id: "fld_trajet_dest" }, { id: "fld_trajet_date" }, { id: "fld_trajet_heure" },
      { id: "fld_trajet_route", type: opts?.champScope?.type ?? "reference",
        referencesEntityId: opts?.champScope?.cible ?? "ent_route" },
    ] },
  ],
  actions: [],
});
const codes = (d: unknown) => validateAirBlocks(d as never).map((x) => x.code);

describe("E1 — formes refusées, jamais silencieuses", () => {
  it("🟢 CONTRÔLE : trois filtres pilotés cohérents passent", () => {
    expect(codes(doc({
      userFilterFieldIds: ["fld_trajet_dest", "fld_trajet_date", "fld_trajet_heure"],
      userFilterOperators: ["eq", "eq", "contains"],
      userFilterInputTypes: ["choice", "text", "text"],
    }))).toEqual([]);
  });

  it("🔴 un 4e filtre (littéral compris) est REFUSÉ", () => {
    expect(codes(doc({
      filterFieldId: "fld_trajet_date", filterOperator: "eq", filterValue: "2026-09-03",
      userFilterFieldIds: ["fld_trajet_dest", "fld_trajet_heure", "fld_trajet_route"],
    }))).toContain("BLOCK_PROPS_INVALID");
  });

  it("🔴 longueurs inégales REFUSÉES", () => {
    expect(codes(doc({
      userFilterFieldIds: ["fld_trajet_dest", "fld_trajet_date"],
      userFilterOperators: ["eq"],
    }))).toContain("BLOCK_PROPS_INVALID");
  });

  it("🔴 inputType inconnu REFUSÉ · opérateurs sans champs REFUSÉS", () => {
    expect(codes(doc({ userFilterFieldIds: ["fld_trajet_dest"], userFilterInputTypes: ["dropdown"] })))
      .toContain("BLOCK_PROPS_INVALID");
    expect(codes(doc({ userFilterOperators: ["eq"] }))).toContain("BLOCK_PROPS_INVALID");
  });

  it("🔴 champ piloté inexistant sur l'entité → BLOCK_FIELD_UNKNOWN (boucle tableaux)", () => {
    expect(codes(doc({ userFilterFieldIds: ["fld_fantome"] }))).toContain("BLOCK_FIELD_UNKNOWN");
  });
});

describe("E2 — la sémantique du scope est fail-closed", () => {
  it("🟢 CONTRÔLE : scope valide (reference vers l'entité de l'écran) passe", () => {
    expect(codes(doc({ scopeFieldId: "fld_trajet_route" }))).toEqual([]);
  });

  it("🔴 écran SANS detail_header : pas de parent → REFUSÉ", () => {
    expect(codes(doc({ scopeFieldId: "fld_trajet_route" }, { sansEntete: true })))
      .toContain("BLOCK_SCOPE_INVALID");
  });

  it("🔴 champ non-reference → REFUSÉ", () => {
    expect(codes(doc({ scopeFieldId: "fld_trajet_route" }, { champScope: { type: "string" } })))
      .toContain("BLOCK_SCOPE_INVALID");
  });

  it("🔴 reference vers la MAUVAISE entité → REFUSÉ", () => {
    expect(codes(doc({ scopeFieldId: "fld_trajet_route" }, { champScope: { cible: "ent_autre" } })))
      .toContain("BLOCK_SCOPE_INVALID");
  });
});
