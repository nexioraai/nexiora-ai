// ÉCHELLE DE DÉGRADATION DU SCHÉMA — cas-tueurs.
//
// CAUSE RACINE MESURÉE (2026-09-01) : l'API refuse un schéma de sortie portant
// un `minItems` autre que 0 ou 1. Sur le schéma AIR complet, **une seule**
// contrainte est dans ce cas — `minItems: 3` sur
// `$.navigation.primary.destinations` (D-086). Les 16 autres valent 1.
//
// L'échelle répondait à cette unique incompatibilité en descendant d'un cran
// qui détruit **35 contraintes**, dont les DEUX seules bornes hautes du
// schéma : `maxItems: 5` et `maxLength: 80`.
//
// 🔴 CE FICHIER NE DÉMONTRE RIEN SUR LA TRONCATURE de `toiletteur-chiens` :
// `$.screens` ne porte AUCUN `maxItems`, à aucun niveau. La cause de la
// sur-production reste NON DÉMONTRÉE.
import { describe, expect, it } from "vitest";
import {
  clampMinItems,
  makeLevels,
  stripKeys,
  type NiveauSchema,
} from "../../../benchmarks/air-emission/schema-levels.mjs";

type Noeud = Record<string, unknown>;

/** Le niveau nommé, ou un échec explicite — jamais une assertion non nulle muette. */
const niveau = (schema: Noeud, nom: string): NiveauSchema => {
  const trouve = makeLevels(schema).find((n) => n.name === nom);
  if (trouve === undefined) throw new Error(`niveau absent : ${nom}`);
  return trouve;
};

/** Schéma miniature portant EXACTEMENT le cas réel : un minItems fautif, deux bornes hautes. */
const SCHEMA: Noeud = {
  type: "object",
  properties: {
    destinations: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
    screens: { type: "array", minItems: 1, items: { type: "string" } },
    name: { type: "string", minLength: 1, maxLength: 80, pattern: "^[a-z]+$" },
    seuil: { type: "number", minimum: 0, maximum: 300 },
  },
};

const trouver = (n: unknown, cle: string): unknown[] => {
  const out: unknown[] = [];
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) {
      x.forEach(walk);
      return;
    }
    if (x !== null && typeof x === "object") {
      for (const [k, v] of Object.entries(x)) {
        if (k === cle) out.push(v);
        walk(v);
      }
    }
  };
  walk(n);
  return out;
};

describe("le premier niveau règle l'incompatibilité SANS tout sacrifier", () => {
  it("🔴 CAS-TUEUR : `minItems: 3` est ramené à 1, `maxItems` et `maxLength` SURVIVENT", () => {
    const premier = niveau(SCHEMA, "minItems-ramene");
    // L'incompatibilité disparaît : plus aucun minItems hors {0, 1}.
    expect(trouver(premier.schema, "minItems").filter((v) => Number(v) > 1)).toEqual([]);
    // Et les bornes hautes — que l'ancien repli détruisait — sont intactes.
    expect(trouver(premier.schema, "maxItems")).toEqual([5]);
    expect(trouver(premier.schema, "maxLength")).toEqual([80]);
  });

  it("🔴 CONTRÔLE NÉGATIF : l'ancien repli DÉTRUISAIT ces deux bornes", () => {
    // Sans ce contrôle, le test précédent pourrait passer sur une échelle qui
    // n'a rien changé. `sans-longueurs` reste dans l'échelle comme filet.
    const filet = niveau(SCHEMA, "sans-longueurs");
    expect(trouver(filet.schema, "maxItems")).toEqual([]);
    expect(trouver(filet.schema, "maxLength")).toEqual([]);
  });

  it("les contraintes SANS rapport avec l'incompatibilité sont conservées", () => {
    const premier = niveau(SCHEMA, "minItems-ramene");
    expect(trouver(premier.schema, "pattern")).toEqual(["^[a-z]+$"]);
    expect(trouver(premier.schema, "minLength")).toEqual([1]);
    // `minItems: 1` était déjà accepté : il ne doit pas être touché.
    expect(trouver(premier.schema, "minItems").sort()).toEqual([1, 1]);
  });

  it("les niveaux de repli subsistent, dans l'ordre, du plus doux au plus large", () => {
    expect(makeLevels(SCHEMA).map((n) => n.name)).toEqual([
      "minItems-ramene",
      "sans-bornes-numeriques",
      "sans-longueurs",
      "sans-patterns",
    ]);
  });

  it("🟢 COMPORTEMENT NOMINAL : sans incompatibilité, le premier niveau ne change RIEN", () => {
    const sain: Noeud = {
      type: "object",
      properties: { a: { type: "array", minItems: 1, maxItems: 9, items: { type: "string" } } },
    };
    const premier = niveau(sain, "minItems-ramene");
    expect(trouver(premier.schema, "minItems")).toEqual([1]);
    expect(trouver(premier.schema, "maxItems")).toEqual([9]);
  });
});

describe("`clampMinItems` — ciblé, jamais large", () => {
  it("ne touche QUE `minItems`, et seulement au-delà de 1", () => {
    const avant = { minItems: 7, maxItems: 7, minLength: 7, autre: 7, imbrique: { minItems: 1 } };
    expect(clampMinItems(avant)).toEqual({
      minItems: 1,
      maxItems: 7,
      minLength: 7,
      autre: 7,
      imbrique: { minItems: 1 },
    });
  });

  it("descend dans les tableaux et les objets imbriqués", () => {
    const r = clampMinItems({ anyOf: [{ minItems: 4 }, { x: { minItems: 2 } }] }) as {
      anyOf: [{ minItems: number }, { x: { minItems: number } }];
    };
    expect(r.anyOf[0].minItems).toBe(1);
    expect(r.anyOf[1].x.minItems).toBe(1);
  });

  it("une valeur non numérique n'est pas convertie en silence", () => {
    expect(clampMinItems({ minItems: "3" })).toEqual({ minItems: "3" });
  });

  it("`stripKeys` reste intact — le filet n'a pas été altéré", () => {
    expect(stripKeys({ a: 1, b: { a: 2, c: 3 } }, ["a"])).toEqual({ b: { c: 3 } });
  });
});
