// ÉMISSION DES CODE SLOTS (Phase 9 — ARCHITECTURE §4 « points d'insertion »).
// Propriétés prouvées ici :
//  1. ADDITIVITÉ STRICTE — sans bundle, la sortie du compilateur est
//     RIGOUREUSEMENT identique à celle d'avant la Phase 9 (aucun artefact
//     de Phase 8 n'est touché ; c'est la garantie de non-régression) ;
//  2. émission VERBATIM du code d'auteur (l'empreinte analysée par la
//     politique AST reste celle qui est émise) ;
//  3. registre TYPÉ, déterministe, trié par point de code ;
//  4. fail-closed : slot non déclaré par l'AIR ou dupliqué = refus net ;
//  5. déterminisme conservé, y compris si le bundle arrive dans le
//     désordre.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EmitError, emitProject, type SlotSource } from "../src/emit-project.ts";
import { compileProject } from "../src/compile-project.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, "..", "..", "golden-corpus", "corpus-v2");
const DOCS = readdirSync(CORPUS)
  .filter((f) => f.endsWith(".air.json"))
  .sort();
const load = (file: string): unknown => JSON.parse(readFileSync(join(CORPUS, file), "utf8"));
const resto = load("resto-quartier.air.json") as { slots: { id: string }[] };

const SOURCE_TOTAL = `interface Entrees {
  lignes: readonly { quantite: number; prixUnitaire: number }[];
  devise: string;
}
interface Sorties {
  total: number;
  totalAffiche: string;
}
export function runSlot(entrees: Entrees): Sorties {
  let total = 0;
  for (const ligne of entrees.lignes) {
    total = total + ligne.quantite * ligne.prixUnitaire;
  }
  return { total, totalAffiche: total.toString() + " " + entrees.devise };
}
`;

const SOURCE_STATUT = `export function runSlot(entrees: { statut: string }): { libelle: string } {
  return { libelle: entrees.statut };
}
`;

const slot = (slotId: string, source: string): SlotSource => ({
  slotId,
  source,
  authorId: "test",
});

describe("additivité — aucun bundle, aucune sortie modifiée", () => {
  it("12/12 documents : sortie identique avec et sans option vide", () => {
    for (const file of DOCS) {
      const air = load(file);
      const sans = compileProject(air);
      const avecVide = compileProject(air, undefined, {});
      const avecListeVide = compileProject(air, undefined, { slots: [] });
      expect(avecVide.rootHash, file).toBe(sans.rootHash);
      expect(avecListeVide.rootHash, file).toBe(sans.rootHash);
      expect([...sans.files.keys()].some((p) => p.startsWith("slots/")), file).toBe(false);
    }
  });
});

describe("émission avec bundle", () => {
  it("écrit la source VERBATIM et un registre typé", () => {
    const air = load("resto-quartier.air.json");
    const { files } = emitProject(air, undefined, {
      slots: [
        slot("slot_libelle_statut_commande", SOURCE_STATUT),
        slot("slot_calcul_total_panier", SOURCE_TOTAL),
      ],
    });
    expect(files.get("slots/slot_calcul_total_panier.ts")).toBe(SOURCE_TOTAL);
    expect(files.get("slots/slot_libelle_statut_commande.ts")).toBe(SOURCE_STATUT);
    const registry = files.get("slots/index.ts") ?? "";
    // Tri par point de code : calcul avant libelle, quel que soit l'ordre
    // du bundle fourni.
    expect(registry.indexOf("slot_calcul_total_panier")).toBeLessThan(
      registry.indexOf("slot_libelle_statut_commande"),
    );
    expect(registry).toContain(
      'import { runSlot as SlotCalculTotalPanier } from "./slot_calcul_total_panier";',
    );
    // ÉDITION CONSCIENTE (2026-08-31, D-069) — DÉFAUT RÉEL, trouvé en compilant
    // l'application émise. Le registre écrivait la fonction NUE ; TypeScript
    // refusait alors de l'assigner au contrat du runtime (contravariance des
    // paramètres), et **toute app portant un slot échouait au `tsc` de son
    // propre projet**, donc au pipeline. Aucun test ne le voyait : ils
    // vérifiaient le TEXTE émis, jamais qu'il COMPILE.
    // Le registre émet désormais un ADAPTATEUR au point d'appel.
    expect(registry).toContain("slot_calcul_total_panier: (entrees: Readonly<");
    expect(registry).toContain("SlotCalculTotalPanier(entrees as never)");
    expect(registry).toContain("export const slotRegistry = {");
    expect(registry).toContain("} as const;");
    // D-069 : le registre porte désormais une signature uniforme au point de
    // jonction — c'est ce qui le rend COMPILABLE. Ce qui reste interdit, et que
    // ce cliquet garde : **aucun `any`**. Le seul élargissement est un
    // `as never` LOCAL, au point exact où la conformité des ports est déjà
    // garantie par le validateur AIR.
    expect(registry).not.toContain("any");
    expect(registry).not.toContain(": unknown =>");
    // Un `as never` par slot du bundle, jamais plus : l'élargissement est
    // strictement local au point de jonction, il ne se répand pas.
    expect(registry.match(/as never/g) ?? []).toHaveLength(2);
  });

  it("déterminisme : ordre du bundle indifférent, compilations identiques", () => {
    const air = load("resto-quartier.air.json");
    const a = compileProject(air, undefined, {
      slots: [slot("slot_calcul_total_panier", SOURCE_TOTAL), slot("slot_libelle_statut_commande", SOURCE_STATUT)],
    });
    const b = compileProject(air, undefined, {
      slots: [slot("slot_libelle_statut_commande", SOURCE_STATUT), slot("slot_calcul_total_panier", SOURCE_TOTAL)],
    });
    expect(b.rootHash).toBe(a.rootHash);
    expect(compileProject(air, undefined, { slots: [slot("slot_calcul_total_panier", SOURCE_TOTAL)] }).rootHash).toBe(
      compileProject(air, undefined, { slots: [slot("slot_calcul_total_panier", SOURCE_TOTAL)] }).rootHash,
    );
  });

  it("un bundle change le rootHash (le slot fait partie de l'artefact)", () => {
    const air = load("resto-quartier.air.json");
    expect(
      compileProject(air, undefined, { slots: [slot("slot_calcul_total_panier", SOURCE_TOTAL)] }).rootHash,
    ).not.toBe(compileProject(air).rootHash);
  });

  it("tous les slots déclarés par le corpus gelé sont émettables", () => {
    const air = load("resto-quartier.air.json");
    const bundle = resto.slots.map((s) => slot(s.id, SOURCE_STATUT));
    const { files } = emitProject(air, undefined, { slots: bundle });
    for (const s of resto.slots) {
      expect(files.has(`slots/${s.id}.ts`), s.id).toBe(true);
    }
  });
});

describe("fail-closed", () => {
  it("slot absent des déclarations de l'AIR : refus net", () => {
    const air = load("resto-quartier.air.json");
    expect(() => emitProject(air, undefined, { slots: [slot("slot_invente", SOURCE_STATUT)] })).toThrow(EmitError);
    try {
      emitProject(air, undefined, { slots: [slot("slot_invente", SOURCE_STATUT)] });
    } catch (e) {
      expect((e as EmitError).code).toBe("EMIT_SLOT_UNDECLARED");
    }
  });

  it("deux implémentations d'un même slot : refus net", () => {
    const air = load("resto-quartier.air.json");
    try {
      emitProject(air, undefined, {
        slots: [slot("slot_calcul_total_panier", SOURCE_TOTAL), slot("slot_calcul_total_panier", SOURCE_STATUT)],
      });
      expect.unreachable("le compilateur aurait dû refuser");
    } catch (e) {
      expect((e as EmitError).code).toBe("EMIT_SLOT_DUPLICATE");
    }
  });
});
