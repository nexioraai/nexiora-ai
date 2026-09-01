// CONSERVATION DES PREUVES PAYÉES — cas-tueurs.
//
// CAUSE RACINE : la génération P9 a payé 1,7718 $ sur 7 appels, puis a reçu un
// `529 Overloaded` PENDANT la réparation. L'émission était protégée depuis
// D-103 ; la réparation ne l'était pas — elle accumulait dans une variable
// LOCALE, que l'erreur a emportée avec la pile. Les sections déjà réparées et
// déjà FACTURÉES ont été détruites.
//
// Deuxième défaut, indépendant : cette erreur technique a été classée
// `terminee`, l'état le plus favorable, parce que le classifieur n'en
// connaissait pas d'autre.
//
// Troisième défaut, indépendant : les artefacts portaient un nom FIXE. Le
// reliquat de P8 a survécu à P9 sous un nom que rien ne distinguait.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { issueGeneration } from "../src/budget-usd.ts";
import {
  CLE_EMISSION,
  CLE_REPARATION,
  PHASES_ARTEFACT,
  TravailInterrompuError,
  attacherPartiel,
  avecPreservation,
  estExploitable,
  nomArtefact,
  partielDeLErreur,
  provenanceDuNom,
  reparationPartielleVierge,
  type ReparationPartielle,
} from "../src/preservation.ts";

const DOC = { base: { id: "coach-fitness" }, entities: [], screens: [], actions: [] };

/**
 * Rejoue la MÉCANIQUE EXACTE de la réparation de P9 : des sections réémises
 * une par une, puis une panne d'infrastructure au milieu.
 */
async function reparationQuiTombe(
  partiel: ReparationPartielle,
  sectionsAvantPanne: readonly string[],
): Promise<never> {
  for (const section of sectionsAvantPanne) {
    // Chaque tour représente un appel API RÉELLEMENT FACTURÉ : la section
    // n'entre dans la preuve qu'une fois l'appel revenu, comme dans le harnais.
    await Promise.resolve();
    Object.assign(partiel.document, { [section]: `contenu réparé de ${section}` });
    partiel.sectionsReemises.push(section);
  }
  throw new Error("529 Overloaded");
}

describe("réparation interrompue — le travail payé survit à la panne", () => {
  it("🔴 CAS-TUEUR P9 : un 529 pendant la réparation ne détruit plus les sections payées", async () => {
    const partiel = reparationPartielleVierge(DOC);
    const erreur = await avecPreservation(CLE_REPARATION, partiel, () =>
      reparationQuiTombe(partiel, ["entities", "screens"]),
    ).catch((e: unknown) => e);

    const conserve = partielDeLErreur(erreur, CLE_REPARATION) as ReparationPartielle;
    expect(conserve, "la preuve payée voyage avec l'erreur").toBeDefined();
    expect(conserve.sectionsReemises).toEqual(["entities", "screens"]);
    expect(conserve.document.entities).toBe("contenu réparé de entities");
    expect(conserve.document.screens).toBe("contenu réparé de screens");
    // Le document de départ est conservé, pas seulement le correctif.
    expect(conserve.document.base).toEqual(DOC.base);
    expect(estExploitable(conserve)).toBe(true);
  });

  it("🔴 CONTRÔLE NÉGATIF : SANS le garde, ce même travail est PERDU", async () => {
    // Reproduit la version d'avant la correction — accumulateur local, aucune
    // attache. Sans ce contrôle, le test ci-dessus pourrait passer sur un
    // mécanisme qui ne prouve rien.
    const erreur = await (async () => {
      const local = reparationPartielleVierge(DOC);
      return reparationQuiTombe(local, ["entities", "screens"]);
    })().catch((e: unknown) => e);

    expect(partielDeLErreur(erreur, CLE_REPARATION)).toBeUndefined();
  });

  it("l'erreur est TOUJOURS relancée — ce garde conserve, il n'avale rien", async () => {
    const partiel = reparationPartielleVierge(DOC);
    await expect(
      avecPreservation(CLE_REPARATION, partiel, () => reparationQuiTombe(partiel, ["entities"])),
    ).rejects.toThrow("529 Overloaded");
  });

  it("panne AVANT toute réparation : rien n'est inventé, et le fait est lisible", async () => {
    const partiel = reparationPartielleVierge(DOC);
    const erreur = await avecPreservation(CLE_REPARATION, partiel, () =>
      reparationQuiTombe(partiel, []),
    ).catch((e: unknown) => e);
    const conserve = partielDeLErreur(erreur, CLE_REPARATION) as ReparationPartielle;
    expect(conserve.sectionsReemises).toEqual([]);
    expect(estExploitable(conserve), "aucun artefact ne doit être déposé").toBe(false);
  });

  it("🟢 CONTRÔLE POSITIF : un travail qui aboutit n'attache rien", async () => {
    const partiel = reparationPartielleVierge(DOC);
    const r = await avecPreservation(CLE_REPARATION, partiel, () => Promise.resolve("fini"));
    expect(r).toBe("fini");
  });

  it("émission et réparation ne se confondent pas : deux clés distinctes", async () => {
    const partiel = reparationPartielleVierge(DOC);
    const erreur = await avecPreservation(CLE_REPARATION, partiel, () =>
      reparationQuiTombe(partiel, ["entities"]),
    ).catch((e: unknown) => e);
    expect(partielDeLErreur(erreur, CLE_REPARATION)).toBeDefined();
    expect(partielDeLErreur(erreur, CLE_EMISSION)).toBeUndefined();
  });

  it("un partiel déjà attaché n'est JAMAIS écrasé — la première preuve prime", () => {
    const erreur = new Error("529");
    attacherPartiel(erreur, CLE_REPARATION, { sectionsReemises: ["entities"] });
    attacherPartiel(erreur, CLE_REPARATION, { sectionsReemises: [] });
    expect(
      (partielDeLErreur(erreur, CLE_REPARATION) as ReparationPartielle).sectionsReemises,
    ).toEqual(["entities"]);
  });

  it("une erreur qui n'est pas un objet ne fait plus perdre la preuve", async () => {
    const partiel = reparationPartielleVierge(DOC);
    const erreur = await avecPreservation(CLE_REPARATION, partiel, () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "panne réseau brute";
    }).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(TravailInterrompuError);
    expect((erreur as TravailInterrompuError).causeBrute).toBe("panne réseau brute");
    expect(partielDeLErreur(erreur, CLE_REPARATION)).toBeDefined();
  });
});

describe("classification de l'échec — une panne n'est jamais une réussite", () => {
  it("🔴 CAS-TUEUR P9 : une erreur technique n'est JAMAIS classée `terminee`", () => {
    for (const reparationRejetee of [true, false]) {
      for (const sansDiagnostic of [true, false]) {
        const r = issueGeneration({
          interrompuBudget: false,
          erreurTechnique: true,
          reparationRejetee,
          sansDiagnostic,
        });
        expect(r.issue, "le 529 de P9 était journalisé « terminee »").toBe("echec-technique");
        expect(r.valid).toBe(false);
      }
    }
  });

  it("précédence énoncée : un arrêt budgétaire prime sur l'erreur technique", () => {
    const r = issueGeneration({
      interrompuBudget: true,
      erreurTechnique: true,
      reparationRejetee: false,
      sansDiagnostic: false,
    });
    expect(r.issue).toBe("interrompue-budget");
  });

  it("l'erreur technique prime sur le rejet de réparation", () => {
    const r = issueGeneration({
      interrompuBudget: false,
      erreurTechnique: true,
      reparationRejetee: true,
      sansDiagnostic: false,
    });
    expect(r.issue).toBe("echec-technique");
  });

  it("🟢 CONTRÔLE POSITIF : sans panne, `terminee` reste atteignable", () => {
    const r = issueGeneration({
      interrompuBudget: false,
      erreurTechnique: false,
      reparationRejetee: false,
      sansDiagnostic: true,
    });
    expect(r.issue).toBe("terminee");
    expect(r.valid).toBe(true);
  });
});

describe("provenance — un artefact porte sa génération, ou n'est pas une preuve", () => {
  const P8 = "2026-09-01T07-58-00-000Z";
  const P9 = "2026-09-01T09-01-00-000Z";

  it("🔴 CAS-TUEUR P8/P9 : deux campagnes ne peuvent plus produire le même nom", () => {
    const a = nomArtefact({ slug: "coach-fitness", runId: P8, phase: "attempt2" });
    const b = nomArtefact({ slug: "coach-fitness", runId: P9, phase: "attempt2" });
    expect(a).not.toBe(b);
    expect(a).toContain(P8);
    expect(b).toContain(P9);
  });

  it("la provenance se relit depuis le NOM SEUL, sans journal ni contexte", () => {
    for (const phase of PHASES_ARTEFACT) {
      const nom = nomArtefact({ slug: "coach-fitness", runId: P9, phase });
      expect(provenanceDuNom(nom)).toEqual({ slug: "coach-fitness", runId: P9, phase });
    }
  });

  it("🔴 le nom FIXE d'avant la correction n'est PAS reconnu comme une preuve", () => {
    // C'est exactement le fichier que P8 avait laissé et qu'une lecture rapide
    // a pris pour un artefact de P9.
    expect(provenanceDuNom("coach-fitness.attempt2.air.json")).toBeNull();
    expect(provenanceDuNom("coach-fitness.partiel.air.json")).toBeNull();
  });

  it("une phase inconnue ou un nom tronqué ne produit pas de provenance", () => {
    expect(provenanceDuNom(`coach-fitness.${P9}.brouillon.air.json`)).toBeNull();
    expect(provenanceDuNom(`coach-fitness.${P9}.attempt2.json`)).toBeNull();
    expect(provenanceDuNom("")).toBeNull();
  });

  it("🔴 on REFUSE d'écrire un nom illisible plutôt que de déposer un doute", () => {
    expect(() => nomArtefact({ slug: "coach.fitness", runId: P9, phase: "attempt1" })).toThrow(
      /contient un point/,
    );
    expect(() =>
      nomArtefact({ slug: "coach-fitness", runId: "2026-09-01T09:01.000Z", phase: "attempt1" }),
    ).toThrow(/contient un point/);
    expect(() => nomArtefact({ slug: "", runId: P9, phase: "attempt1" })).toThrow(/vide/);
  });
});

describe("cliquet de véracité — le harnais d'émission RÉEL est confronté au code", () => {
  // Un module pur prouvé ne prouve rien si le harnais ne l'appelle pas. Ce
  // cliquet lit le SOURCE de `emit-v3.mjs` : il tombe si un chemin payé
  // redevient nu, ou si une issue cesse de dire la vérité.
  const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const HARNAIS = join(REPO, "benchmarks", "air-emission", "emit-v3.mjs");
  const code = readFileSync(HARNAIS, "utf8");
  const occurrences = (motif: string): number => code.split(motif).length - 1;

  it("🔴 AUCUN chemin de réparation payé n'est appelé sans garde", () => {
    // 2 exactement : la définition, et l'appel DEPUIS le wrapper protégé.
    expect(occurrences("repairSections(")).toBe(2);
    expect(code).toContain("repairSectionsAvecPartiel(document, diagnostics");
    const wrapper = code.slice(code.indexOf("async function repairSectionsAvecPartiel"));
    expect(wrapper.slice(0, 600)).toContain("preservation.avecPreservation(preservation.CLE_REPARATION");
  });

  it("🔴 AUCUN chemin d'émission payé n'est appelé sans garde", () => {
    expect(occurrences("emitSections(")).toBe(2);
    expect(code).toContain("preservation.avecPreservation(preservation.CLE_EMISSION");
  });

  it("🔴 toute issue de génération déclare si une erreur technique a eu lieu", () => {
    expect(occurrences("issueGeneration({")).toBe(occurrences("erreurTechnique:"));
    expect(occurrences("issueGeneration({")).toBeGreaterThan(1);
  });

  it("🔴 les DEUX partiels sont relus dans le rattrapage d'erreur", () => {
    expect(code).toContain("preservation.partielDeLErreur(error, preservation.CLE_EMISSION)");
    expect(code).toContain("preservation.partielDeLErreur(error, preservation.CLE_REPARATION)");
  });

  it("🔴 tout artefact déposé porte son `runId` et ne peut pas en écraser un autre", () => {
    expect(code).toContain("preservation.nomArtefact({ slug, runId: RUN_ID, phase })");
    expect(code).toContain('flag: "wx"');
    // Une seule écriture vers `results/`, et elle passe par `ecrireArtefact`.
    expect(occurrences("writeFileSync(join(RESULTS_DIR")).toBe(1);
  });
});
