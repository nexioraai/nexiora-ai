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
  CLE_CORPS_TRONQUE,
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

describe("corps d'une réponse TRONQUÉE — la preuve payée survit", () => {
  // CAUSE RACINE : une réponse arrêtée par `max_tokens` était levée en erreur
  // AVANT tout traitement de son contenu. Les jetons de sortie — FACTURÉS —
  // disparaissaient. Mesuré sur `toiletteur-chiens` : 16 000 jetons produits,
  // jetés, et le facteur de sur-production est resté indéterminé faute de trace.
  const corpsTronque = { label: "x:ecrans", jetonsSortie: 16000, corps: '{"screens":[{"id":"scr_a"' };

  it("🔴 CAS-TUEUR : le corps voyage avec l'erreur de troncature", () => {
    const erreur = new Error("RÉPONSE TRONQUÉE");
    attacherPartiel(erreur, CLE_CORPS_TRONQUE, corpsTronque);
    const relu = partielDeLErreur(erreur, CLE_CORPS_TRONQUE) as typeof corpsTronque;
    expect(relu).toBeDefined();
    expect(relu.corps).toBe(corpsTronque.corps);
    expect(relu.jetonsSortie).toBe(16000);
  });

  it("🔴 CONTRÔLE NÉGATIF : SANS attache, le corps est PERDU — l'état d'avant", () => {
    const erreur = new Error("RÉPONSE TRONQUÉE");
    expect(partielDeLErreur(erreur, CLE_CORPS_TRONQUE)).toBeUndefined();
  });

  it("🔴 le corps est conservé VERBATIM — aucune réparation silencieuse", () => {
    const erreur = new Error("t");
    attacherPartiel(erreur, CLE_CORPS_TRONQUE, corpsTronque);
    const relu = partielDeLErreur(erreur, CLE_CORPS_TRONQUE) as typeof corpsTronque;
    // Le JSON est COUPÉ : il doit le rester. Conserver sert à comprendre,
    // jamais à faire passer.
    expect(() => {
      JSON.parse(relu.corps);
    }).toThrow();
    expect(relu.corps.endsWith('"scr_a"')).toBe(true);
  });

  it("un corps VIDE ne provoque aucune exception secondaire", () => {
    const erreur = new Error("t");
    attacherPartiel(erreur, CLE_CORPS_TRONQUE, { label: "y", jetonsSortie: 0, corps: "" });
    const relu = partielDeLErreur(erreur, CLE_CORPS_TRONQUE) as typeof corpsTronque;
    expect(relu.corps).toBe("");
  });

  it("les trois preuves ne se confondent pas — trois clés distinctes", () => {
    const erreur = new Error("t");
    attacherPartiel(erreur, CLE_CORPS_TRONQUE, corpsTronque);
    expect(partielDeLErreur(erreur, CLE_CORPS_TRONQUE)).toBeDefined();
    expect(partielDeLErreur(erreur, CLE_EMISSION)).toBeUndefined();
    expect(partielDeLErreur(erreur, CLE_REPARATION)).toBeUndefined();
  });

  it("🔴 une troncature ne devient JAMAIS un succès : l'issue reste `echec-technique`", () => {
    const r = issueGeneration({
      interrompuBudget: false,
      erreurTechnique: true,
      reparationRejetee: false,
      sansDiagnostic: false,
    });
    expect(r.issue).toBe("echec-technique");
    expect(r.valid).toBe(false);
  });

  it("la phase d'artefact existe et se relit depuis le nom seul", () => {
    const nom = nomArtefact({
      slug: "x",
      runId: "2026-09-01T18-24-05-841Z",
      phase: "reponse-tronquee",
    });
    expect(provenanceDuNom(nom)?.phase).toBe("reponse-tronquee");
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

  it("🔴 le corps d'une réponse TRONQUÉE est attaché à l'erreur, pas jeté", () => {
    expect(code).toContain("preservation.CLE_CORPS_TRONQUE");
    // L'attache se fait AVANT le `throw`, sur l'erreur de troncature elle-même.
    const bloc = code.slice(code.indexOf('stop_reason === "max_tokens"'));
    expect(bloc.slice(0, 1400)).toContain("preservation.attacherPartiel(tronquee");
    // Et le rattrapage le relit pour le déposer.
    expect(code).toContain("preservation.partielDeLErreur(error, preservation.CLE_CORPS_TRONQUE)");
  });

  it("🔴 le corps conservé est VERBATIM — `texteBrut` ne répare rien", () => {
    const fn = code.slice(code.indexOf("function texteBrut"), code.indexOf("function extractJson"));
    expect(fn).toContain(".join(\"\")");
    // `extractJson` répare pour parser ; `texteBrut` ne doit RIEN faire de tel.
    expect(fn).not.toContain(".trim()");
    expect(fn).not.toContain("replace(");
    expect(fn).not.toContain("JSON.parse");
  });

  it("🟢 le chemin NOMINAL est inchangé — `extractJson` reste seul à parser", () => {
    expect(occurrences("JSON.parse(cleaned)")).toBe(1);
    expect(occurrences("function extractJson")).toBe(1);
  });

  it("🔴 UN APPEL FACTURÉ EST COMPTÉ, TRONQUÉ OU NON — l'ordre le garantit", () => {
    // La comptabilité doit précéder la branche de troncature. Avant correction,
    // le `throw` la précédait : 16 000 jetons facturés, comptés nulle part.
    const corps = code.slice(code.indexOf("async function callPart"));
    const iPush = corps.indexOf("usage.push(response.usage)");
    const iAjout = corps.indexOf("etatDepense = budgetUsd.ajouter");
    const iTronc = corps.indexOf('stop_reason === "max_tokens"');
    expect(iPush, "usage.push absent de callPart").toBeGreaterThan(-1);
    expect(iPush, "la comptabilité doit PRÉCÉDER la troncature").toBeLessThan(iTronc);
    expect(iAjout, "le cumul doit PRÉCÉDER la troncature").toBeLessThan(iTronc);
  });

  it("🔴 `callPart` est le SEUL propriétaire — aucun appelant ne compte plus", () => {
    // Deux compteurs alimentés à deux endroits pouvaient diverger : c'est
    // exactement ce qui est arrivé. Un seul point de comptabilisation le rend
    // structurellement impossible.
    expect(occurrences("usage.push(response.usage)")).toBe(1);
    expect(occurrences("etatDepense = budgetUsd.ajouter")).toBe(1);
    // Et CHAQUE site d'appel transmet le compteur — aucun ne peut l'oublier.
    const sites = code.split("await callPart(").slice(1);
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      expect(site.slice(0, site.indexOf(";")), "un appel sans `usage`").toContain(", usage)");
    }
  });

  it("🔴 une erreur API AVANT réponse ne comptabilise rien", () => {
    // La comptabilité est APRÈS le `await` : un 400 n'y parvient jamais.
    // Aucune dépense fictive n'est donc inventée pour une requête refusée.
    const corps = code.slice(code.indexOf("async function callPart"));
    const iAwait = corps.indexOf("await client.messages.create");
    expect(iAwait).toBeLessThan(corps.indexOf("usage.push(response.usage)"));
  });

  it("🔴 D et la comptabilité coexistent : corps conservé ET dépense comptée", () => {
    const corps = code.slice(code.indexOf("async function callPart"));
    const iPush = corps.indexOf("usage.push(response.usage)");
    const iAttache = corps.indexOf("preservation.attacherPartiel(tronquee");
    expect(iPush).toBeLessThan(iAttache);
    // L'erreur est toujours levée : jamais transformée en succès.
    expect(corps.slice(iAttache - 200, iAttache + 200)).toContain("throw");
  });

  it("🔴 un document n'hérite JAMAIS de la dégradation d'un autre", () => {
    // `PARTS` est construit UNE FOIS au chargement : sans remise à zéro, un
    // refus rencontré sur le document 1 laissait la part en position dégradée
    // pour tous les suivants. Chaque `part` a bien son propre `levelIndex` —
    // la contamination était entre DOCUMENTS, pas entre parts.
    expect(code).toContain("for (const part of PARTS) part.levelIndex = 0;");
    // Et la remise à zéro doit précéder le corps de l'intention.
    const boucle = code.slice(code.indexOf("for (const intention of INTENTIONS"));
    const iReset = boucle.indexOf("part.levelIndex = 0");
    const iTravail = boucle.indexOf("await emitSectionsAvecPartiel");
    expect(iReset).toBeGreaterThan(-1);
    expect(iReset).toBeLessThan(iTravail);
  });

  it("🔴 l'échelle de dégradation vit dans un module PUR, testable", () => {
    // Tant que ces fonctions vivaient dans le harnais — qui exécute sa campagne
    // au chargement — seul un cliquet textuel pouvait les voir, jamais leur
    // comportement.
    expect(code).toContain('await import(join(HERE, "schema-levels.mjs"))');
    expect(occurrences("function makeLevels")).toBe(0);
    expect(occurrences("function clampMinItems")).toBe(0);
  });

  it("🔴 tout artefact déposé porte son `runId` et ne peut pas en écraser un autre", () => {
    expect(code).toContain("preservation.nomArtefact({ slug, runId: RUN_ID, phase })");
    expect(code).toContain('flag: "wx"');
    // Une seule écriture vers `results/`, et elle passe par `ecrireArtefact`.
    expect(occurrences("writeFileSync(join(RESULTS_DIR")).toBe(1);
  });
});
