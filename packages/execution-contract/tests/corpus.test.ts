// MESURE SUR LE CORPUS GELÉ — le chiffre remplace l'opinion.
//
// Ce fichier transforme en CLIQUET ce qui n'était jusqu'ici qu'un constat de
// session : l'ampleur exacte de l'écart entre ce que les documents déclarent
// et ce que le moteur exécute. Les nombres ci-dessous ne sont pas des cibles,
// ce sont des MESURES de l'état du 2026-08-29. Ils doivent BAISSER à mesure
// que le moteur gagne des capacités — jamais monter en silence.
//
// Le corpus reste GELÉ et byte-identique : il est migré en mémoire (patron
// D-044), jamais réécrit.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrateAirDocument, type ProjectAir } from "@deribfy/air-schema";
import { EXECUTION_ENVELOPE_V1 } from "../src/envelope.ts";
import { analyzeFeasibility } from "../src/feasibility.ts";

const CORPUS = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "golden-corpus",
  "corpus-v2",
);

const documents: readonly { name: string; air: ProjectAir }[] = readdirSync(CORPUS)
  .filter((f) => f.endsWith(".air.json"))
  .sort()
  .map((f) => ({
    name: f.replace(".air.json", ""),
    air: migrateAirDocument(JSON.parse(readFileSync(join(CORPUS, f), "utf8"))),
  }));

const reports = documents.map((d) => ({
  name: d.name,
  report: analyzeFeasibility(d.air, EXECUTION_ENVELOPE_V1),
}));

const sum = (pick: (m: (typeof reports)[number]["report"]["metrics"]) => number): number =>
  reports.reduce((total, r) => total + pick(r.report.metrics), 0);

describe("corpus gelé — couverture", () => {
  it("les 12 documents du corpus v2 sont analysés", () => {
    expect(documents).toHaveLength(12);
  });

  it("AUCUN document n'est réalisable sous l'enveloppe v1", () => {
    // C'est le résultat attendu, et c'est le point de tout l'étage : le
    // moteur cesse de prétendre produire ce qu'il ne produit pas.
    expect(reports.every((r) => r.report.verdict === "degraded")).toBe(true);
  });
});

describe("corpus gelé — mesures d'exécution (cliquets, état 2026-08-29)", () => {
  // ÉDITION CONSCIENTE (2026-08-31, D-061) : 26 -> 48. Les 22 effets `mutation`
  // du corpus passent de non exécutés à EXÉCUTÉS — le dispatcher présente
  // désormais l'écriture au fournisseur de données. Le nombre MONTE, ce qui est
  // le sens souhaité de ce cliquet : « ils doivent BAISSER quand le moteur
  // gagne des capacités » vaut pour les ÉCARTS, pas pour les effets exécutés.
  it("effets déclarés vs exécutés", () => {
    expect(sum((m) => m.effectsDeclared)).toBe(180);
    // D-068 : 48 -> 49. Le déclencheur `lifecycle` est honoré ; l'action
    // `mutation` déclenchée au cycle de vie s'exécute désormais. Les 61 autres
    // actions lifecycle restent mortes — leur EFFET (`capability`, `slot` sans
    // liaison) est encore hors enveloppe. Honorer le déclencheur ne rend pas
    // vivant ce que l'effet ne sait pas faire.
    expect(sum((m) => m.effectsExecuted)).toBe(49);
  });

  it("écrans déclarés, atteignables en théorie, atteignables en pratique", () => {
    expect(sum((m) => m.screensDeclared)).toBe(47);
    expect(sum((m) => m.screensReachableDeclared)).toBe(25);
    expect(sum((m) => m.screensReachableEffective)).toBe(25);
  });

    // ÉDITION CONSCIENTE (D-061) : 67 -> 45 contrôles fantômes. Les 22 boutons
  // et formulaires à effet `mutation` ont CESSÉ d'être muets.
it("contrôles visibles et contrôles FANTÔMES", () => {
    expect(sum((m) => m.controlsVisible)).toBe(103);
    expect(sum((m) => m.ghostControls)).toBe(45);
  });

  it("blocs liés à une entité RÉELLEMENT pourvue de données", () => {
    expect(sum((m) => m.dataBoundBlocks)).toBe(62);
    expect(sum((m) => m.dataBoundBlocksWithSource)).toBe(44);
  });

  // ÉDITION CONSCIENTE (2026-08-31, D-062) : le titre ne peut plus dire « aucun
  // consommé ». Les 67 règles déclarées sont désormais APPLIQUÉES. Restent
  // inconsommés : les 73 capabilities (aucun code émis) et les 44 slots (aucune
  // liaison dans le corpus gelé — le moteur les invoque, mais eux ne le
  // demandent pas).
  it("capabilities et slots encore inconsommés ; les RÈGLES sont appliquées", () => {
    expect(sum((m) => m.capabilitiesDeclared)).toBe(73);
    expect(sum((m) => m.capabilitiesWired)).toBe(0);
    expect(sum((m) => m.slotsDeclared)).toBe(44);
    expect(sum((m) => m.slotsInvoked)).toBe(0);
    expect(sum((m) => m.rulesDeclared)).toBe(67);
    expect(sum((m) => m.rulesEnforced)).toBe(67);
  });

  it("champs `reference` rendus en identifiant brut", () => {
    expect(sum((m) => m.rawReferencesRendered)).toBe(6);
  });
});

describe("corpus gelé — attribution", () => {
  it("chaque écart porte un propriétaire, et les trois natures sont présentes", () => {
    const owners = new Set(reports.flatMap((r) => r.report.gaps.map((g) => g.owner)));
    expect([...owners].sort()).toEqual(["contrat", "document", "moteur"]);
  });

  it("la MAJORITÉ des écarts est imputable au MOTEUR, pas aux documents", () => {
    // Résultat non trivial : il réfute l'hypothèse selon laquelle les
    // documents seraient mal spécifiés. Ils décrivent des applications
    // légitimes ; c'est le moteur qui ne sait pas les réaliser.
    const all = reports.flatMap((r) => r.report.gaps);
    const moteur = all.filter((g) => g.owner === "moteur").length;
    expect(moteur / all.length).toBeGreaterThan(0.5);
  });
});

describe("corpus gelé — déterminisme du rapport", () => {
  it("deux analyses successives donnent la même empreinte sur les 12 documents", () => {
    for (const { air } of documents) {
      const a = analyzeFeasibility(air, EXECUTION_ENVELOPE_V1);
      const b = analyzeFeasibility(air, EXECUTION_ENVELOPE_V1);
      expect(a.reportHash).toBe(b.reportHash);
    }
  });
});
