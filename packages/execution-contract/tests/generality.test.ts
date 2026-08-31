// CLIQUETS DE GÉNÉRALITÉ — I5 (invariance au renommage) et I6 (amplitude).
//
// POURQUOI CE FICHIER EXISTE.
// Le moteur possède déjà des cliquets d'agnosticité de DOMAINE (aucun
// vocabulaire métier, aucun identifiant d'instance en dur). Il n'en possédait
// aucun sur deux autres axes, et l'absence était mesurable :
//
//  · AMPLITUDE — les 13 documents disponibles portent TOUS exactement
//    3 entités et 3 à 4 écrans. Aucune forme extrême n'avait jamais été
//    éprouvée : 0 entité, 12 entités, 15 écrans, `many_to_many`,
//    auto-référence, plusieurs datasets pour une même entité. Un moteur peut
//    être parfaitement agnostique au DOMAINE et rester spécialisé à la FORME
//    de son corpus.
//
//  · INVARIANCE AU RENOMMAGE — si renommer mécaniquement tous les
//    identifiants d'un document change la STRUCTURE du résultat, c'est
//    qu'une dépendance sémantique cachée existe. Le test est presque
//    gratuit et rien ne le faisait.
import { describe, expect, it } from "vitest";
import type { ProjectAir } from "@deribfy/air-schema";
import { EXECUTION_ENVELOPE_V1 } from "../src/envelope.ts";
import { analyzeFeasibility } from "../src/feasibility.ts";
import { L, P, air, dataset, entity } from "./fixtures.ts";

// ---------------------------------------------------------------- AMPLITUDE

const editorial = (): ProjectAir => air();

const large = (screens: number, entities: number): ProjectAir => {
  const ents = Array.from({ length: entities }, (_, i) => entity(`ent_e${i}`, 4));
  const scr = Array.from({ length: screens }, (_, i) => ({
    id: `scr_s${i}`,
    title: L(`S${i}`),
    blocks: [
      { id: `blk_s${i}_h`, blockType: "header", props: P({ title: `S${i}` }) },
      {
        id: `blk_s${i}_l`,
        blockType: "list",
        entityId: `ent_e${i % entities}`,
        props: P({ titleFieldId: `fld_e${i % entities}_f0` }),
      },
    ],
  }));
  return air({
    screens: scr,
    navigation: {
      entryScreenId: "scr_s0",
      routes: scr.map((s, i) => ({ id: `nav_r${i}`, screenId: s.id })),
    },
    entities: ents,
    datasets: ents.map((e, i) => dataset(`data_d${i}`, e.id, i + 1)),
  });
};

const selfReferencing = (): ProjectAir =>
  air({
    screens: [
      {
        id: "scr_a",
        title: L("A"),
        blocks: [
          { id: "blk_a_l", blockType: "list", entityId: "ent_p", props: P({ titleFieldId: "fld_p_f0" }) },
        ],
      },
    ],
    entities: [
      {
        id: "ent_p",
        name: "p",
        fields: [
          { id: "fld_p_f0", name: "f0", type: "string", required: true },
          { id: "fld_p_up", name: "up", type: "reference", required: false, referencesEntityId: "ent_p" },
        ],
      },
      entity("ent_q"),
    ],
    relations: [{ id: "rel_m", fromEntityId: "ent_p", toEntityId: "ent_q", kind: "many_to_many" }],
    datasets: [dataset("data_p", "ent_p", 5), dataset("data_q", "ent_q", 5)],
  });

describe("amplitude — formes qu'aucun document du corpus ne contient", () => {
  const cases: readonly (readonly [string, ProjectAir])[] = [
    ["0 entité (application éditoriale)", editorial()],
    ["1 écran / 1 entité", large(1, 1)],
    ["15 écrans / 12 entités", large(15, 12)],
    ["auto-référence + many_to_many", selfReferencing()],
  ];

  for (const [label, document] of cases) {
    it(`analyse sans exception : ${label}`, () => {
      const report = analyzeFeasibility(document, EXECUTION_ENVELOPE_V1);
      expect(report.reportHash).toMatch(/^[0-9a-f]{64}$/);
      expect(["realizable", "degraded"]).toContain(report.verdict);
    });

    it(`déterministe : ${label}`, () => {
      expect(analyzeFeasibility(document, EXECUTION_ENVELOPE_V1).reportHash).toBe(
        analyzeFeasibility(document, EXECUTION_ENVELOPE_V1).reportHash,
      );
    });
  }

  it("les métriques SUIVENT la forme du document (elles ne sont pas constantes)", () => {
    // Contre-épreuve indispensable : un analyseur qui renverrait toujours la
    // même chose passerait tous les tests ci-dessus sans rien mesurer.
    const petit = analyzeFeasibility(large(1, 1), EXECUTION_ENVELOPE_V1).metrics;
    const grand = analyzeFeasibility(large(15, 12), EXECUTION_ENVELOPE_V1).metrics;
    expect(petit.screensDeclared).toBe(1);
    expect(grand.screensDeclared).toBe(15);
    expect(grand.dataBoundBlocks).toBeGreaterThan(petit.dataBoundBlocks);
  });

  it("un écran isolé dans une grande app est vu comme INATTEIGNABLE", () => {
    // 15 écrans déclarés, aucune action `navigate` : seul l'écran d'entrée
    // est atteignable. La mesure doit le dire, quelle que soit la taille.
    const report = analyzeFeasibility(large(15, 12), EXECUTION_ENVELOPE_V1);
    expect(report.metrics.screensReachableDeclared).toBe(1);
    expect(
      report.gaps.filter((g) => g.code === "EXEC_SCREEN_UNREACHABLE_DECLARED"),
    ).toHaveLength(14);
  });
});

// -------------------------------------------------- INVARIANCE AU RENOMMAGE

/** Renomme MÉCANIQUEMENT tous les identifiants et libellés du document. */
function rename(document: ProjectAir): ProjectAir {
  const map = new Map<string, string>();
  let next = 0;
  const swap = (value: string): string => {
    const prefix = value.slice(0, value.indexOf("_"));
    const existing = map.get(value);
    if (existing !== undefined) return existing;
    const replacement = `${prefix}_z${String(next++)}`;
    map.set(value, replacement);
    return replacement;
  };
  const ID = /^(prj|scr|blk|nav|ent|fld|rel|data|act|rule|slot|intg|test)_[a-z0-9_]+$/;
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return ID.test(node) ? swap(node) : node;
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === "object") {
      return Object.fromEntries(
        Object.entries(node).map(([k, v]) => [k, k === "name" && typeof v === "string" ? v : walk(v)]),
      );
    }
    return node;
  };
  return walk(document) as ProjectAir;
}

describe("invariance au renommage (I5)", () => {
  const original = selfReferencing();
  const renamed = rename(original);

  it("le renommage change bien les identifiants (contrôle de l'instrument)", () => {
    expect(JSON.stringify(renamed)).not.toBe(JSON.stringify(original));
    expect(renamed.screens[0]?.id).not.toBe(original.screens[0]?.id);
  });

  it("les MÉTRIQUES sont strictement identiques après renommage", () => {
    // Si une métrique bougeait, une dépendance au NOM existerait quelque
    // part dans l'analyse — c'est exactement ce que ce cliquet interdit.
    expect(analyzeFeasibility(renamed, EXECUTION_ENVELOPE_V1).metrics).toEqual(
      analyzeFeasibility(original, EXECUTION_ENVELOPE_V1).metrics,
    );
  });

  it("les CODES et PROPRIÉTAIRES d'écarts sont identiques après renommage", () => {
    const shape = (d: ProjectAir): string =>
      analyzeFeasibility(d, EXECUTION_ENVELOPE_V1)
        .gaps.map((g) => `${g.owner}:${g.code}`)
        .sort()
        .join("|");
    expect(shape(renamed)).toBe(shape(original));
  });

  it("l'EMPREINTE diffère — le rapport reste bien lié à SON document", () => {
    // Propriété duale : la structure est invariante, l'identité ne l'est pas.
    // Sans cela, deux applications distinctes partageraient un même sceau.
    expect(analyzeFeasibility(renamed, EXECUTION_ENVELOPE_V1).reportHash).not.toBe(
      analyzeFeasibility(original, EXECUTION_ENVELOPE_V1).reportHash,
    );
  });
});
