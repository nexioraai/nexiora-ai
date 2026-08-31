import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProjectAir } from "@deribfy/air-schema";
import {
  AIR_SCHEMA_VERSION,
  migrateAirDocument,
  projectAirSchema,
  validateAir,
} from "@deribfy/air-schema";
import { validateAirCapabilities } from "@deribfy/capability-registry";
// Le point d'entrée de @deribfy/blocks ré-exporte les composants UI
// (react-native) ; ce test node importe le module PUR du registre par
// chemin direct — le paquet GELÉ (D-024) reste intouché. Exposer un
// sous-chemin d'export serait une évolution consciente du paquet gelé.
import { listBlockIds, validateAirBlocks } from "../../blocks/src/registry.ts";

// GOLDEN CORPUS v2 (D-025) — corpus ACTIF pour le critère dur de la Phase 4.
// Émis par LLM (structured outputs, campagne 2026-08-28, digests registre de
// capabilities + registre de SMART BLOCKS au prompt), validé ici de façon
// déterministe et SANS RÉSEAU par les QUATRE validateurs. Le corpus v1
// (../corpus) reste GELÉ, byte-identique — témoin de la Phase 2 (L2).
const CORPUS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "corpus-v2");

const files = readdirSync(CORPUS_DIR)
  .filter((name) => name.endsWith(".air.json"))
  .sort();

// ÉDITION CONSCIENTE (D-044) : les documents du corpus sont GELÉS et
// déclarent `airSchemaVersion: "1.0.0"` — ils restent byte-identiques sur
// disque. Le schéma courant étant 1.1.0, ils sont MIGRÉS en mémoire avant
// validation, par le mécanisme prévu depuis la Phase 2 et câblé en D-044.
// La propriété vérifiée est inchangée : le corpus passe les quatre
// validateurs, sans aucune retouche de fichier.
const load = (name: string): ProjectAir =>
  projectAirSchema.parse(
    migrateAirDocument(JSON.parse(readFileSync(join(CORPUS_DIR, name), "utf8"))),
  );

describe("golden corpus v2 (D-025)", () => {
  it("contient les 12 domaines (un fichier = un domaine, mêmes intentions que v1)", () => {
    expect(files.length).toBe(12);
    const v1 = readdirSync(join(CORPUS_DIR, "..", "corpus"))
      .filter((name) => name.endsWith(".air.json"))
      .sort();
    expect(files).toEqual(v1);
  });

  it.each(files)("%s — conforme au schéma strict AIR v1", (name) => {
    expect(load(name).airSchemaVersion).toBe(AIR_SCHEMA_VERSION);
  });

  it.each(files)("%s — zéro diagnostic du validateur sémantique", (name) => {
    expect(validateAir(load(name))).toEqual([]);
  });

  it.each(files)("%s — zéro diagnostic du registre de capabilities", (name) => {
    expect(validateAirCapabilities(load(name))).toEqual([]);
  });

  it.each(files)("%s — zéro diagnostic du registre de SMART BLOCKS (D-023/D-024)", (name) => {
    expect(validateAirBlocks(load(name))).toEqual([]);
  });

  it.each(files)("%s — design.overrides absent ou vide (D-025)", (name) => {
    const overrides = load(name).design.overrides;
    expect(overrides === undefined || overrides.length === 0).toBe(true);
  });

  it("le vocabulaire de blocs émis est STRICTEMENT dans le registre gelé", () => {
    const used = new Set(
      files.flatMap((f) => load(f).screens.flatMap((s) => s.blocks.map((b) => b.blockType))),
    );
    for (const t of used) expect(listBlockIds()).toContain(t);
  });

  it("identités uniques et trois classes commerce couvertes", () => {
    const airs = files.map(load);
    expect(new Set(airs.map((a) => a.projectId)).size).toBe(airs.length);
    expect(new Set(airs.map((a) => a.app.slug)).size).toBe(airs.length);
    expect(new Set(airs.map((a) => a.compliance.commerceClass))).toEqual(
      new Set(["none", "digital", "physical_or_offapp"]),
    );
  });
});
