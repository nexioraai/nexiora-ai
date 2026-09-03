// GÉNÉRATEUR SQL (5.1) — corpus ACTIF v2 12/12, déterminisme, structure
// (patron §7 : idempotent, barrières fail-closed, RLS partout, seed =
// fixtures D-030), fail-closed. CI SANS RÉSEAU. La preuve du cycle RÉEL
// (application sur projet Supabase, isolation) : benchmarks/
// provisioning-cycle/results/.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex } from "@deribfy/air-schema";
import { LockResolutionError, buildDemoFixtures, normalizeAir } from "@deribfy/compiler";
import { generateProvisioningSql, seedOrder } from "../src/sql-gen.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS_V2 = join(HERE, "..", "..", "golden-corpus", "corpus-v2");
const v2Docs = readdirSync(CORPUS_V2).filter((f) => f.endsWith(".air.json")).sort();
const loadDoc = (f: string): unknown =>
  JSON.parse(readFileSync(join(CORPUS_V2, f), "utf8"));

const reverseKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).reverse().map(([k, v]) => [k, reverseKeys(v)]),
    );
  }
  return value;
};

describe("générateur SQL — corpus ACTIF v2", () => {
  for (const file of v2Docs) {
    it(`SQL conforme au patron : ${file}`, () => {
      const doc = loadDoc(file) as {
        entities: { id: string; fields: { type: string }[] }[];
        relations: { kind: string }[];
        datasets: { entityId: string; rowCount: number }[];
      };
      const { lock, sql, summary } = generateProvisioningSql(doc);

      // En-tête lié à l'AIR (airHash du lock re-calculé indépendamment).
      // ÉDITION CONSCIENTE (D-044) : le document du corpus déclare 1.0.0 et
      // est MIGRÉ en mémoire vers la version courante avant résolution — le
      // hash porte donc sur le document normalisé. Le contre-calcul reste
      // indépendant : il refait le chemin depuis le fichier source.
      expect(sql).toContain(`-- airHash: ${sha256Hex(canonicalJson(normalizeAir(doc)))}`);
      expect(lock.resolved.releaseTrain.id).toBe("rt-2026.08");

      // Une table par entité + RLS partout + barrières par section.
      for (const e of doc.entities) {
        expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "${e.id}"`);
        expect(sql).toContain(`ALTER TABLE "${e.id}" ENABLE ROW LEVEL SECURITY;`);
      }
      expect(summary.joinTables.length).toBe(
        doc.relations.filter((r) => r.kind === "many_to_many").length,
      );
      expect((sql.match(/RAISE EXCEPTION 'BARRIER:/g) ?? []).length).toBeGreaterThanOrEqual(
        4 + Object.keys(summary.seedRowsByTable).length - 1,
      );

      // Idempotence textuelle : jamais de CREATE nu ; aucun horodatage de
      // GÉNÉRATION dans l'en-tête (les datetime des seeds sont des données
      // déterministes D-030 — le déterminisme est prouvé par rejeux).
      expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
      expect(sql).not.toMatch(/CREATE INDEX (?!IF NOT EXISTS)/);
      expect(sql.split("\n").slice(0, 6).join("\n")).not.toMatch(/\d{4}-\d{2}-\d{2}T/);

    });
  }

  it("seed = comptes exacts des fixtures, 12/12", async () => {
    const { projectAirSchema } = await import("@deribfy/air-schema");
    for (const file of v2Docs) {
      const doc = loadDoc(file);
      const { summary, sql } = generateProvisioningSql(doc);
      const fixtures = buildDemoFixtures(projectAirSchema.parse(normalizeAir(doc)));
      for (const [entityId, rows] of Object.entries(fixtures)) {
        expect(summary.seedRowsByTable[entityId], `${file}:${entityId}`).toBe(rows.length);
        expect((sql.match(new RegExp(`INSERT INTO "${entityId}" `, "g")) ?? []).length).toBe(
          rows.length,
        );
      }
    }
  });

  it("déterminisme : 3 rejeux + permutation ⇒ SQL byte-identique 12/12", () => {
    for (const file of v2Docs) {
      const doc = loadDoc(file);
      const hashes = new Set(
        [
          generateProvisioningSql(doc).sql,
          generateProvisioningSql(doc).sql,
          generateProvisioningSql(reverseKeys(doc)).sql,
        ].map((s) => sha256Hex(s)),
      );
      expect(hashes.size, file).toBe(1);
    }
  });

  it("fail-closed : document invalide ⇒ LockResolutionError avant émission", () => {
    const doc = loadDoc("resto-quartier.air.json") as {
      screens: { blocks: { blockType: string }[] }[];
    };
    const block = doc.screens[0]?.blocks[0];
    if (block === undefined) throw new Error("fixture inattendue");
    block.blockType = "hero_carousel";
    expect(() => generateProvisioningSql(doc)).toThrow(LockResolutionError);
  });

  it("échappement SQL : les apostrophes des fixtures sont doublées", () => {
    const { sql } = generateProvisioningSql(loadDoc("resto-quartier.air.json"));
    // Aucune séquence `'` non doublée à l'intérieur d'un littéral n'est
    // détectable simplement ; on vérifie l'absence de fin de littéral
    // prématurée évidente : chaque INSERT se termine par DO NOTHING;.
    for (const line of sql.split("\n").filter((l) => l.startsWith("INSERT INTO"))) {
      expect(line.endsWith(`ON CONFLICT ("id") DO NOTHING;`), line.slice(0, 80)).toBe(true);
    }
  });
});

describe("ordre d'insertion du seed — intégrité référentielle (Phase 10)", () => {
  // Défaut MESURÉ sur le slice 2 : PostgreSQL a refusé le seed avec
  // `23503 violates foreign key constraint`, parce que les INSERT étaient
  // ordonnés alphabétiquement (`ent_conteneur` avant `ent_navire`). Les
  // VALEURS étaient bonnes : seul l'ORDRE était faux.
  const air = (entities: { id: string; fields: { id: string; referencesEntityId?: string }[] }[]) =>
    ({ entities }) as never;

  it("une entité référençante est insérée APRÈS sa cible", () => {
    // Ordre alphabétique : a_enfant, z_parent. Ordre correct : l'inverse.
    const ordre = seedOrder(
      air([
        { id: "a_enfant", fields: [{ id: "f", referencesEntityId: "z_parent" }] },
        { id: "z_parent", fields: [{ id: "g" }] },
      ]),
      ["a_enfant", "z_parent"],
    );
    expect(ordre).toEqual(["z_parent", "a_enfant"]);
  });

  it("déterministe : ensemble prêt trié, pas d'ordre dépendant de l'entrée", () => {
    const graphe = air([
      { id: "b", fields: [{ id: "f", referencesEntityId: "d" }] },
      { id: "a", fields: [{ id: "f" }] },
      { id: "d", fields: [{ id: "f" }] },
      { id: "c", fields: [{ id: "f", referencesEntityId: "a" }] },
    ]);
    const attendu = seedOrder(graphe, ["a", "b", "c", "d"]);
    expect(seedOrder(graphe, ["d", "c", "b", "a"])).toEqual(attendu);
    expect(attendu.indexOf("d")).toBeLessThan(attendu.indexOf("b"));
    expect(attendu.indexOf("a")).toBeLessThan(attendu.indexOf("c"));
  });

  it("un cycle ne bloque pas la génération (la barrière de seed tranchera)", () => {
    const ordre = seedOrder(
      air([
        { id: "x", fields: [{ id: "f", referencesEntityId: "y" }] },
        { id: "y", fields: [{ id: "f", referencesEntityId: "x" }] },
      ]),
      ["x", "y"],
    );
    expect([...ordre].sort()).toEqual(["x", "y"]);
  });

  it("les références vers une entité NON semée n'imposent aucun ordre", () => {
    expect(seedOrder(air([{ id: "a", fields: [{ id: "f", referencesEntityId: "absent" }] }]), ["a"])).toEqual(["a"]);
  });

  it("corpus v2 : aucun INSERT ne précède la table qu'il référence", () => {
    for (const file of v2Docs) {
      const doc = loadDoc(file) as {
        entities: { id: string; fields: { referencesEntityId?: string }[] }[];
      };
      const { sql, summary } = generateProvisioningSql(doc);
      const position = (id: string) => sql.indexOf(`INSERT INTO "${id}"`);
      for (const entity of doc.entities) {
        const p = position(entity.id);
        if (p < 0) continue;
        for (const field of entity.fields) {
          const cible = field.referencesEntityId;
          if (cible === undefined || !summary.tables.includes(cible)) continue;
          const pc = position(cible);
          if (pc < 0) continue;
          expect(pc, `${file}: ${entity.id} → ${cible}`).toBeLessThan(p);
        }
      }
    }
  });
});
