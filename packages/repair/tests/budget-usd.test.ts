// GOUVERNEUR DE DÉPENSE (D-103) — cas-tueurs.
//
// CAUSE RACINE : le plafond du harnais d'émission était vérifié UNE FOIS, au
// début de chaque intention, et le coût additionné APRÈS l'intention entière.
// Une intention unique comparait donc le plafond à ZÉRO puis courait sans
// contrôle. Mesuré : P6 a coûté 2,7396 $ pour 2,50 $ annoncés, et l'exposition
// réelle d'un lancement était ~16,80 $ — 28 appels, 16 000 jetons chacun.
import { describe, expect, it } from "vitest";
import {
  BudgetEpuiseError,
  DEPENSE_INITIALE,
  ajouter,
  assertNonDepasse,
  assertPeutAppeler,
  coutMaxAppel,
  coutUSD,
  issueGeneration,
  peutAppeler,
} from "../src/budget-usd.ts";

const TARIFS = { entree: 5, ecritureCache: 6.25, lectureCache: 0.5, sortie: 25 };

describe("garde budgétaire — AVANT l'appel", () => {
  it("🔴 refuse d'ENGAGER un appel dont le coût maximal franchirait le plafond", () => {
    const etat = { depense: 2.4, appels: 8 };
    const coutMax = coutMaxAppel(30_000, 16_000, TARIFS);
    expect(peutAppeler(2.5, etat, coutMax)).toBe(false);
    expect(() => {
      assertPeutAppeler(2.5, etat, coutMax, "section:ecrans");
    }).toThrow(BudgetEpuiseError);
  });

  it("🟢 CONTRÔLE POSITIF : un appel qui tient est autorisé", () => {
    const coutMax = coutMaxAppel(30_000, 16_000, TARIFS);
    expect(peutAppeler(25, DEPENSE_INITIALE, coutMax)).toBe(true);
    expect(() => {
      assertPeutAppeler(25, DEPENSE_INITIALE, coutMax, "x");
    }).not.toThrow();
  });

  it("le coût maximal est PESSIMISTE : sortie bornée + entrée bornée", () => {
    // 16 000 jetons de sortie à 25 $/MTok = 0,40 $, plus l'entrée.
    const c = coutMaxAppel(0, 16_000, TARIFS);
    expect(c).toBeCloseTo(0.4, 5);
    expect(coutMaxAppel(30_000, 16_000, TARIFS)).toBeGreaterThan(c);
  });
});

describe("garde budgétaire — APRÈS l'appel", () => {
  it("🔴 détecte le franchissement une fois le coût RÉEL comptabilisé", () => {
    const apres = ajouter({ depense: 2.4, appels: 8 }, coutUSD({ output_tokens: 16_000 }, TARIFS));
    expect(apres.depense).toBeCloseTo(2.8, 5);
    expect(() => {
      assertNonDepasse(2.5, apres, "section:actions");
    }).toThrow(BudgetEpuiseError);
  });

  it("🟢 CONTRÔLE POSITIF : sous le plafond, aucune interruption", () => {
    const apres = ajouter(DEPENSE_INITIALE, coutUSD({ output_tokens: 4_000 }, TARIFS));
    expect(() => {
      assertNonDepasse(2.5, apres, "x");
    }).not.toThrow();
    expect(apres.appels).toBe(1);
  });

  it("le coût réel suit les quatre postes de facturation", () => {
    expect(
      coutUSD(
        { input_tokens: 1e6, cache_creation_input_tokens: 1e6, cache_read_input_tokens: 1e6, output_tokens: 1e6 },
        TARIFS,
      ),
    ).toBeCloseTo(5 + 6.25 + 0.5 + 25, 5);
  });
});

describe("garde budgétaire — le RETRY est soumis au même contrôle", () => {
  it("🔴 un retry de section est refusé si le budget ne le permet plus", () => {
    // Le retry passe par le MÊME `assertPeutAppeler` que l'appel initial :
    // il ne peut donc pas s'exécuter sur un budget épuisé.
    const etat = { depense: 2.49, appels: 12 };
    expect(() => {
      assertPeutAppeler(2.5, etat, coutMaxAppel(30_000, 16_000, TARIFS), "section:base#retry");
    }).toThrow(/refusé AVANT appel/);
  });
});

describe("issue de génération — trois états, jamais confondus", () => {
  it("🔴 `valid` est IMPOSSIBLE après une interruption budgétaire", () => {
    for (const sansDiagnostic of [true, false]) {
      const r = issueGeneration({ interrompuBudget: true, reparationRejetee: false, sansDiagnostic });
      expect(r.issue).toBe("interrompue-budget");
      expect(r.valid, "un document partiel ne certifie rien").toBe(false);
    }
  });

  it("une réparation rejetée donne `rejetee`, jamais `terminee`", () => {
    const r = issueGeneration({ interrompuBudget: false, reparationRejetee: true, sansDiagnostic: true });
    expect(r.issue).toBe("rejetee");
    expect(r.valid).toBe(false);
  });

  it("🟢 CONTRÔLE POSITIF : sans interruption ni rejet, `terminee` et `valid`", () => {
    const r = issueGeneration({ interrompuBudget: false, reparationRejetee: false, sansDiagnostic: true });
    expect(r.issue).toBe("terminee");
    expect(r.valid).toBe(true);
  });

  it("terminée mais avec diagnostics restants : `terminee` et NON valide", () => {
    const r = issueGeneration({ interrompuBudget: false, reparationRejetee: false, sansDiagnostic: false });
    expect(r.issue).toBe("terminee");
    expect(r.valid).toBe(false);
  });
});

describe("exposition maximale — le chiffre qui motivait ce garde", () => {
  it("28 appels sans garde dépassaient largement un budget de 3,50 $", () => {
    let etat = DEPENSE_INITIALE;
    for (let i = 0; i < 28; i++) etat = ajouter(etat, coutUSD({ input_tokens: 40_000, output_tokens: 16_000 }, TARIFS));
    expect(etat.depense).toBeGreaterThan(16);
  });

  it("🟢 avec le garde, le dépassement est borné par UN appel, et la course s'arrête", () => {
    // LA GARANTIE EXACTE, énoncée telle qu'elle est — ni plus, ni moins.
    // Le contrôle AVANT s'appuie sur une ESTIMATION de l'entrée ; si l'appel
    // réel coûte davantage, le plafond peut être franchi. C'est précisément
    // pourquoi le contrôle APRÈS existe : il détecte le franchissement et
    // interrompt. La dépense est donc bornée par « plafond + un appel », jamais
    // par les 28 appels que l'absence de garde autorisait.
    const plafond = 3.5;
    const coutReel = coutUSD({ input_tokens: 40_000, output_tokens: 16_000 }, TARIFS);
    let etat = DEPENSE_INITIALE;
    let appels = 0;
    let interrompu = false;
    for (let i = 0; i < 28; i++) {
      if (!peutAppeler(plafond, etat, coutMaxAppel(30_000, 16_000, TARIFS))) break;
      etat = ajouter(etat, coutReel);
      appels += 1;
      try {
        assertNonDepasse(plafond, etat, `appel ${String(i)}`);
      } catch {
        interrompu = true;
        break;
      }
    }
    expect(etat.depense).toBeLessThanOrEqual(plafond + coutReel);
    expect(appels).toBeLessThan(28); // la dérive des 28 appels est fermée
    expect(appels).toBeGreaterThan(0); // le garde n'empêche pas de travailler
    expect(interrompu, "le franchissement est DÉTECTÉ, pas subi").toBe(true);
  });
});
