// E3.2 (D-130) — LA RÈGLE ABSOLUE DE VÉRITÉ : `liveData` ne naît pas de la
// syntaxe. Un `sourceKind: "remote"` déclaré (forme aplanie 1.7.1, D-131)
// n'allume rien ; une exigence « live »
// satisfaite sans capacité est réfutée ; la déclarer en citant le fait TIENT.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrateAirDocument } from "@deribfy/air-schema";
import { EXECUTION_ENVELOPE_V1 } from "@deribfy/execution-contract";
import { capacitesAbsentesEngagees, evaluateIntentCoverage } from "../src/intent.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus");
const bus = () =>
  migrateAirDocument(
    JSON.parse(readFileSync(join(CORPUS, "corpus-v3", "bus-intercites.air.json"), "utf8")),
  );

const avecRemote = () => {
  const d = bus();
  return {
    ...d,
    datasets: d.datasets.map((x, i) =>
      i !== 0
        ? x
        : {
            ...x,
            sourceKind: "remote" as const,
            sourceIntegrationId: d.integrations[0]?.id ?? "intg_x",
            sourceDomain: d.network.allowedDomains[0] ?? "api.deribfy.app",
          },
    ),
  };
};

describe("F — la présence syntaxique ne produit JAMAIS le fait", () => {
  it("🔴 un document PORTE `sourceKind: \"remote\"`… et `liveData` reste false", () => {
    expect(avecRemote().datasets.some((d) => d.sourceKind === "remote")).toBe(true);
    expect(EXECUTION_ENVELOPE_V1.liveData).toBe(false); // le fait ne bouge qu'avec E3.3 et ses preuves
  });
});

describe("A — seed n'est pas live · la trace distingue", () => {
  it("seed : aucune trace remote ; remote synthétique : trace présente", () => {
    expect(bus().datasets.every((d) => d.sourceKind === undefined)).toBe(true);
    expect(avecRemote().datasets.some((d) => d.sourceKind === "remote")).toBe(true);
  });
});

describe("H — aucune exigence live ne peut être `satisfied` sans capacité", () => {
  it("🔴 KILLER : besoin « suivre le bus en temps réel » satisfait → RÉFUTÉ (capacité ❌)", () => {
    const d = avecRemote(); // même AVEC la trace syntaxique !
    const doc = {
      ...d,
      intent: {
        ...d.intent,
        needs: [
          ...(d.intent?.needs ?? []),
          {
            id: "need_suivi_temps_reel",
            statement: "Le voyageur suit la position du bus en temps réel.",
            resolution: { kind: "satisfied" as const, nodeIds: [d.screens[0]?.id ?? "scr_x"] },
          },
        ],
      },
    };
    const c = evaluateIntentCoverage(doc as never, EXECUTION_ENVELOPE_V1);
    const v = c.verdicts.find((x) => x.needId === "need_suivi_temps_reel");
    expect(v?.state).toBe("satisfaction_non_prouvee");
    expect(v?.motif).toContain("liveData");
    expect(v?.motif).toContain("ABSENTE");
  });

  it("🟢 CONTRÔLE : le même besoin DÉCLARÉ en citant `liveData` TIENT", () => {
    const d = bus();
    const doc = {
      ...d,
      intent: {
        ...d.intent,
        needs: [
          ...(d.intent?.needs ?? []),
          {
            id: "need_suivi_temps_reel",
            statement: "Le voyageur suit la position du bus en temps réel.",
            resolution: { kind: "unexpressible" as const, reason: "le moteur ne consomme pas encore de source distante (liveData: false) : aucun suivi en temps réel ne peut être rendu" },
          },
        ],
      },
    };
    const c = evaluateIntentCoverage(doc as never, EXECUTION_ENVELOPE_V1);
    expect(c.verdicts.find((x) => x.needId === "need_suivi_temps_reel")?.state).toBe("inexprimable");
  });

  it("précision des sujets : « livraison » n'engage pas `live`", () => {
    expect(capacitesAbsentesEngagees("Livraison de fruits à domicile", EXECUTION_ENVELOPE_V1))
      .toEqual([]);
  });
});
