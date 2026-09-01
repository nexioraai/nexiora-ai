// REJEU DU CAS RÉEL P5 (D-093) — sur les artefacts d'une génération PAYÉE.
//
// Ce test ne simule rien : il rejoue les 17 diagnostics et les 16 réparations
// réellement produites par le modèle le 2026-09-01, et exige qu'elles soient
// désormais acceptées. Une régression du périmètre le fera échouer sur des
// données que nous ne pourrons pas reproduire sans repayer.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { amputationsHorsPerimetre, mutationsHorsPerimetre } from "../src/repair-scope.ts";

const P5 = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "elite-protocol", "evidence", "p5");
const journal = JSON.parse(readFileSync(join(P5, "journal.jsonl"), "utf8").trim()) as {
  attempt1: { diagnostics: { code: string; path: string }[] };
  amputationsRejetees: string[];
};
const attempt1 = JSON.parse(readFileSync(join(P5, "attempt1.air.json"), "utf8")) as {
  expectedTests: { id: string; targetId: string }[];
  entities: { id: string; fields: { id: string; type: string }[] }[];
};

/** Reconstitue la réparation depuis les signatures consignées au journal. */
const reparation = () => {
  const d = structuredClone(attempt1);
  let n = 0;
  for (const r of journal.amputationsRejetees) {
    const m = /^(\S+) \(promesse:(\S+) → promesse:(\S+)\)$/.exec(r);
    if (m === null) continue;
    const t = d.expectedTests.find((x) => x.id === m[1]);
    if (t !== undefined) {
      t.targetId = m[3] ?? t.targetId;
      n += 1;
    }
  }
  return { document: d, appliquees: n };
};

describe("rejeu du cas RÉEL P5", () => {
  it("les 16 réparations du journal sont reconstituables", () => {
    expect(reparation().appliquees).toBe(16);
  });

  it("🟢 la réparation RÉELLE est désormais ACCEPTÉE — 0 rejet", () => {
    const { document } = reparation();
    const diags = journal.attempt1.diagnostics;
    expect([
      ...amputationsHorsPerimetre(attempt1, document, diags),
      ...mutationsHorsPerimetre(attempt1, document, diags).map((m) => m.id),
    ]).toEqual([]);
  });

  it("🔴 CONTRÔLE NÉGATIF : la même réparation + une amputation reste REFUSÉE", () => {
    // Sans lui, « tout accepter » ferait passer le test précédent.
    const { document } = reparation();
    const premiere = document.entities[0];
    if (premiere === undefined) throw new Error("fixture P5 vide");
    premiere.fields = [];
    const diags = journal.attempt1.diagnostics;
    expect(
      [
        ...amputationsHorsPerimetre(attempt1, document, diags),
        ...mutationsHorsPerimetre(attempt1, document, diags).map((m) => m.id),
      ].length,
    ).toBeGreaterThan(0);
  });

  it("le journal porte bien 17 diagnostics et 16 rejets", () => {
    expect(journal.attempt1.diagnostics).toHaveLength(17);
    expect(journal.amputationsRejetees).toHaveLength(16);
  });
});
