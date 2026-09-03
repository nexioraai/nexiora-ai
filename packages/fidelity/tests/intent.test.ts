// CAS-TUEURS DE LA GATE DE COUVERTURE — critère F4 de la PHASE 10B.
//
// Le cas de référence est celui qui a produit la découverte : *« menu avec
// photos »*, un besoin que le registre de blocs ne sait pas porter. Avant
// AIR 1.2.0, il disparaissait sans trace. Ici, il DOIT ressortir — soit
// satisfait, soit déclaré inexprimable avec motif. Jamais absent.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrateAirDocument, type ProjectAir } from "@deribfy/air-schema";
import { EXECUTION_ENVELOPE_V1, controls, reachableScreens } from "@deribfy/execution-contract";
import { evaluateIntentCoverage } from "../src/intent.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus", "corpus-v2");
const base = (): ProjectAir =>
  migrateAirDocument(JSON.parse(readFileSync(join(CORPUS, "resto-quartier.air.json"), "utf8")));

const intention = (needs: NonNullable<ProjectAir["intent"]>["needs"]) => ({
  request: "Je veux une app pour mon restaurant : la carte avec photos et prix, et suivre mes commandes.",
  requestLocale: "fr-FR",
  needs,
});

describe("gate de couverture — CONTRÔLE POSITIF", () => {
  it("un besoin porté par un écran VIVANT est satisfait", () => {
    const air = base();
    const ecran = reachableScreens(air, EXECUTION_ENVELOPE_V1.triggers)[0];
    expect(ecran).toBeDefined();
    const r = evaluateIntentCoverage(
      {
        ...air,
        intent: intention([
          {
            id: "need_carte",
            statement: "voir la carte du restaurant",
            resolution: { kind: "satisfied", nodeIds: [ecran ?? ""] },
          },
        ]),
      },
      EXECUTION_ENVELOPE_V1,
    );
    expect(r.passed).toBe(true);
    expect(r.satisfaits).toBe(1);
  });

  it("L'HONNÊTETÉ PASSE : un besoin déclaré inexprimable AVEC MOTIF ne fait pas échouer", () => {
    // C'est le cœur de la correction. « avec photos » ne peut pas être porté —
    // le registre de blocs gelé n'a pas de bloc image. Le dire est la bonne
    // réponse ; le taire était le défaut.
    const r = evaluateIntentCoverage(
      {
        ...base(),
        intent: intention([
          {
            id: "need_photos",
            statement: "des photos sur chaque plat de la carte",
            resolution: {
              kind: "unexpressible",
              reason: "le registre de Smart Blocks v1.0.0 ne comporte aucun bloc image",
            },
          },
        ]),
      },
      EXECUTION_ENVELOPE_V1,
    );
    expect(r.passed).toBe(true);
    expect(r.inexprimables).toBe(1);
    expect(r.verdicts[0]?.motif).toContain("aucun bloc image");
  });

  it("le rapport publie TOUJOURS le résidu qu'il ne couvre pas", () => {
    const r = evaluateIntentCoverage(base(), EXECUTION_ENVELOPE_V1);
    expect(r.limites[0]).toContain("JAMAIS ÉNUMÉRÉ");
  });
});

describe("gate de couverture — CAS-TUEURS (elle doit ÉCHOUER)", () => {
  it("KT-7 · AUCUNE INTENTION : tout le corpus historique tombe ici", () => {
    // FAIT : les 12 documents du corpus gelé n'ont pas d'intention, et la
    // migration s'interdit de leur en inventer une. Ils ne peuvent donc pas
    // être certifiés fidèles — c'est le constat, pas une régression.
    const r = evaluateIntentCoverage(base(), EXECUTION_ENVELOPE_V1);
    expect(r.present).toBe(false);
    expect(r.passed).toBe(false);
    expect(r.failures[0]).toContain("AUCUNE INTENTION");
  });

  it("KT-8 · besoin rattaché à un nœud INEXISTANT", () => {
    const r = evaluateIntentCoverage(
      {
        ...base(),
        intent: intention([
          {
            id: "need_fantome",
            statement: "un écran de fidélité client",
            resolution: { kind: "satisfied", nodeIds: ["scr_nexiste_pas"] },
          },
        ]),
      },
      EXECUTION_ENVELOPE_V1,
    );
    expect(r.passed).toBe(false);
    expect(r.verdicts[0]?.state).toBe("reference_brisee");
  });

  it("KT-9 · besoin rattaché à un nœud qui EXISTE mais ne FONCTIONNE PAS", () => {
    // Le défaut le plus retors : le document PROUVE qu'il a répondu au besoin
    // en pointant un nœud réel — mais ce nœud est mort. Sans ce contrôle, la
    // couverture serait satisfaite par de la façade.
    const air = base();
    const mort = controls(air, EXECUTION_ENVELOPE_V1).find((c) => !c.executed)?.actionId;
    expect(mort, "le corpus doit contenir une action non exécutée").toBeDefined();
    const r = evaluateIntentCoverage(
      {
        ...air,
        intent: intention([
          {
            id: "need_commander",
            statement: "pouvoir passer commande",
            resolution: { kind: "satisfied", nodeIds: [mort ?? ""] },
          },
        ]),
      },
      EXECUTION_ENVELOPE_V1,
    );
    expect(r.passed).toBe(false);
    expect(r.verdicts[0]?.state).toBe("satisfait_par_du_mort");
    expect(r.verdicts[0]?.motif).toContain("NE FONCTIONNENT PAS");
  });

  it("KT-10 · un seul besoin défaillant suffit — aucune compensation", () => {
    const air = base();
    const ecran = reachableScreens(air, EXECUTION_ENVELOPE_V1.triggers)[0] ?? "";
    const r = evaluateIntentCoverage(
      {
        ...air,
        intent: intention([
          { id: "need_ok", statement: "voir la carte", resolution: { kind: "satisfied", nodeIds: [ecran] } },
          { id: "need_ko", statement: "un écran de fidélité", resolution: { kind: "satisfied", nodeIds: ["ent_absent"] } },
        ]),
      },
      EXECUTION_ENVELOPE_V1,
    );
    expect(r.satisfaits).toBe(1);
    expect(r.passed).toBe(false);
  });
});
