import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProjectAir } from "@deribfy/air-schema";
import {
  AIR_SCHEMA_VERSION,
  projectAirSchema,
  validateAir,
} from "@deribfy/air-schema";
import { validateAirCapabilities } from "@deribfy/capability-registry";

// GOLDEN CORPUS (ROADMAP Phase 2) : chaque AIR du corpus a été ÉMIS par LLM
// via structured outputs (campagne benchmarks/air-emission), puis est validé
// ici de façon déterministe et SANS RÉSEAU — schéma strict, sémantique,
// registre. Critère de sortie Phase 2 : 100 % de conformité sur le corpus.
const CORPUS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "corpus");

const files = readdirSync(CORPUS_DIR)
  .filter((name) => name.endsWith(".air.json"))
  .sort();

// État bootstrap : corpus vide tant que la campagne d'émission (2.4) n'a pas
// abouti — bloquée sur crédits API au 2026-08-27. Dès le premier fichier
// versionné, TOUTE la suite s'active (dont le critère ≥ 10).
const bootstrap = files.length === 0;

const load = (name: string): ProjectAir =>
  projectAirSchema.parse(JSON.parse(readFileSync(join(CORPUS_DIR, name), "utf8")));

describe.skipIf(bootstrap)("golden corpus", () => {
  it("contient au moins 10 AIR de domaines distincts (un fichier = un domaine)", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(new Set(files).size).toBe(files.length);
  });

  it.each(files)("%s — conforme au schéma strict AIR v1", (name) => {
    const air = load(name);
    expect(air.airSchemaVersion).toBe(AIR_SCHEMA_VERSION);
  });

  it.each(files)("%s — zéro diagnostic du validateur sémantique", (name) => {
    expect(validateAir(load(name))).toEqual([]);
  });

  it.each(files)("%s — zéro diagnostic du registre de capabilities", (name) => {
    expect(validateAirCapabilities(load(name))).toEqual([]);
  });

  it("les identités de projet et slugs sont uniques dans le corpus", () => {
    const airs = files.map(load);
    expect(new Set(airs.map((a) => a.projectId)).size).toBe(airs.length);
    expect(new Set(airs.map((a) => a.app.slug)).size).toBe(airs.length);
  });

  it("le corpus couvre les trois classes commerce", () => {
    const classes = new Set(files.map(load).map((a) => a.compliance.commerceClass));
    expect(classes).toEqual(new Set(["none", "digital", "physical_or_offapp"]));
  });
});
