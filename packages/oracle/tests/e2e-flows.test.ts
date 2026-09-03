// ORACLE L2 — générateur de flows (6.4) : flows GÉNÉRÉS DEPUIS L'AIR sur le
// corpus v2 — testID = identités stables (screenId/blockId), écran d'entrée
// asserté, chaque action ui→navigate couverte, variante RTL présente,
// aucun texte de langue naturelle dans le flow. CI sans réseau.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { projectAirSchema } from "@deribfy/air-schema";
import { normalizeAir } from "@deribfy/compiler";
import { generateMaestroFlows } from "../src/index.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus", "corpus-v2");
const docs = readdirSync(CORPUS).filter((f) => f.endsWith(".air.json")).sort();
// ÉDITION CONSCIENTE (D-044) : documents du corpus GELÉ en 1.0.0, migrés en
// mémoire vers la version courante avant parse. Fichiers inchangés.
const load = (f: string) =>
  projectAirSchema.parse(normalizeAir(JSON.parse(readFileSync(join(CORPUS, f), "utf8"))));

describe("générateur de flows E2E (Oracle L2)", () => {
  for (const file of docs) {
    it(`flows générés conformes : ${file}`, () => {
      const air = load(file);
      const flows = generateMaestroFlows(air, "com.example.app");
      // Écran d'entrée asserté dans les deux flows.
      expect(flows.navigation).toContain(`id: "${air.navigation.entryScreenId}"`);
      expect(flows.rtl).toContain("forceRTL: true");
      // Chaque action de navigation de couverture apparaît (tap + cible).
      for (const n of flows.coverage.navActions) {
        expect(flows.navigation).toContain(`id: "${n.blockId}"`);
        expect(flows.navigation).toContain(`id: "${n.targetScreenId}"`);
      }
      // testID = identités stables uniquement (préfixes scr_/blk_).
      const ids = [...flows.navigation.matchAll(/id: "([^"]+)"/g)].map((m) => m[1]);
      for (const id of ids) {
        expect(/^(scr_|blk_)/.test(id ?? ""), id).toBe(true);
      }
      // Déterminisme : re-génération identique.
      expect(generateMaestroFlows(air, "com.example.app").navigation).toBe(flows.navigation);
    });
  }

  it("resto-quartier : couvre les 2 nav de l'écran d'entrée", () => {
    const air = load("resto-quartier.air.json");
    const flows = generateMaestroFlows(air, "com.deribfy.preview.maquis");
    expect(flows.coverage.entryScreenId).toBe("scr_menu");
    expect(flows.coverage.navActions.map((n) => n.targetScreenId).sort()).toEqual(["scr_commandes", "scr_panier"]);
  });
});
