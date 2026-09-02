// E3.2 (D-130) puis E3.3 (D-132) — LA RÈGLE ABSOLUE DE VÉRITÉ, dans ses
// DEUX sens. Né FALSE : la syntaxe (`sourceKind: "remote"`, 1.7.1) n'allume
// rien — seule la preuve au rendu (gate:e33-remote) a autorisé la bascule.
// Devenu TRUE : un besoin « live » satisfait exige la TRACE (dataset remote),
// et un motif d'inexprimabilité citant `liveData` est désormais RÉFUTÉ —
// la capacité existe. Le fait couvre le POLLING consommé selon contrat,
// JAMAIS le temps réel poussé (réserves séparées : fil réel, appareil).
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

describe("F — le fait est adossé aux PREUVES E3.3, jamais à la syntaxe", () => {
  it("🟢 l'enveloppe porte `liveData: true` — constante MOTEUR (gate:e33-remote), indifférente au document", () => {
    // Un document SANS remote et un document AVEC remote regardent la même
    // enveloppe : la valeur vient des preuves du moteur, pas du texte.
    expect(bus().datasets.every((d) => d.sourceKind === undefined)).toBe(true);
    expect(avecRemote().datasets.some((d) => d.sourceKind === "remote")).toBe(true);
    expect(EXECUTION_ENVELOPE_V1.liveData).toBe(true); // bascule E3.3 (D-132), preuve au rendu citée
  });
});

describe("A — seed n'est pas live · la trace distingue", () => {
  it("seed : aucune trace remote ; remote synthétique : trace présente", () => {
    expect(bus().datasets.every((d) => d.sourceKind === undefined)).toBe(true);
    expect(avecRemote().datasets.some((d) => d.sourceKind === "remote")).toBe(true);
  });
});

describe("H — aucune exigence live ne peut être `satisfied` sans TRACE", () => {
  it("🔴 KILLER : besoin « temps réel » satisfait SANS dataset remote → non prouvé (trace absente)", () => {
    const d = bus(); // AUCUNE provenance distante dans le document
    const doc = {
      ...d,
      intent: {
        ...d.intent,
        needs: [
          ...(d.intent?.needs ?? []),
          {
            id: "need_suivi_temps_reel",
            // RESTITUTION live (« affichés » lève le veto d'acquisition D-098) : le
            // suivi GPS de position, lui, reste classé acquisition (doctrine D-122,
            // volet appareil/E4) et n'est PAS le sujet de ce garde.
            statement: "Les horaires des départs affichés se mettent à jour en temps réel.",
            resolution: { kind: "satisfied" as const, nodeIds: [d.screens[0]?.id ?? "scr_x"] },
          },
        ],
      },
    };
    const c = evaluateIntentCoverage(doc as never, EXECUTION_ENVELOPE_V1);
    const v = c.verdicts.find((x) => x.needId === "need_suivi_temps_reel");
    expect(v?.state).toBe("satisfaction_non_prouvee");
    expect(v?.motif).toContain("liveData");
    expect(v?.motif).toContain("aucune trace");
  });

  it("🟢 le MÊME besoin satisfait AVEC un dataset remote (trace) n'est plus bloqué par liveData", () => {
    const d = avecRemote();
    const doc = {
      ...d,
      intent: {
        ...d.intent,
        needs: [
          ...(d.intent?.needs ?? []),
          {
            id: "need_suivi_temps_reel",
            // RESTITUTION live (« affichés » lève le veto d'acquisition D-098) : le
            // suivi GPS de position, lui, reste classé acquisition (doctrine D-122,
            // volet appareil/E4) et n'est PAS le sujet de ce garde.
            statement: "Les horaires des départs affichés se mettent à jour en temps réel.",
            resolution: { kind: "satisfied" as const, nodeIds: [d.screens[0]?.id ?? "scr_x"] },
          },
        ],
      },
    };
    const c = evaluateIntentCoverage(doc as never, EXECUTION_ENVELOPE_V1);
    const v = c.verdicts.find((x) => x.needId === "need_suivi_temps_reel");
    expect(v?.state).not.toBe("satisfaction_non_prouvee");
    expect(v?.motif ?? "").not.toContain("liveData");
  });

  it("🔴 INVERSION CONSCIENTE (D-132) : citer `liveData` comme motif d'inexprimabilité est RÉFUTÉ — la capacité existe", () => {
    // Avant E3.3 ce même motif TENAIT (fait ❌, D-130). La bascule inverse
    // l'exigence : un besoin « live » s'EXPRIME désormais (dataset remote),
    // il ne se déclare plus hors de portée en citant liveData.
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
    const v = c.verdicts.find((x) => x.needId === "need_suivi_temps_reel");
    expect(v?.state).toBe("motif_refute");
    expect(v?.motif).toContain("liveData");
  });

  it("précision des sujets : « livraison » n'engage pas `live`", () => {
    expect(capacitesAbsentesEngagees("Livraison de fruits à domicile", EXECUTION_ENVELOPE_V1))
      .toEqual([]);
  });
});
