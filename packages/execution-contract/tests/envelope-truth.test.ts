// CLIQUET DE VÉRACITÉ DE L'ENVELOPPE — le test le plus important du paquet.
//
// Une enveloppe est une DÉCLARATION : elle peut mentir, et un mensonge y
// serait pire que le silence qu'elle remplace, puisqu'il serait scellé dans
// un rapport hashé. Ce cliquet confronte chaque affirmation de l'enveloppe
// au CODE RÉEL du moteur. Même patron que les `sourcesHash` du release
// train : on ne fait jamais confiance à une déclaration.
//
// Quand le moteur gagnera une capacité, CE FICHIER échouera en premier —
// c'est voulu : élargir l'enveloppe devient une ÉDITION CONSCIENTE, jamais
// une dérive.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXECUTION_ENVELOPE_V1 } from "../src/envelope.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..", "..");
const read = (rel: string): string => readFileSync(join(PKG, rel), "utf8");

const RUNTIME = read("compiler/runtime/air-runtime.tsx");
const DATA_PROVIDER = read("compiler/runtime/data-provider.tsx");
const EMIT_PROJECT = read("compiler/src/emit-project.ts");
const EMIT_MANIFESTS = read("compiler/src/emit-manifests.ts");
const TEMPLATE_PKG = read("compiler/template/package.json");

describe("véracité de l'enveloppe — effets", () => {
  // ÉDITION CONSCIENTE (2026-08-31, D-059) : le dispatcher a gagné une branche
  // `capability` — l'effet n'est plus AVALÉ, il est PRÉSENTÉ à un fournisseur.
  //
  // Mais **présenter n'est pas exécuter**, et `capability` N'ENTRE PAS dans
  // `effects` : le fournisseur par défaut REFUSE et trace, aucune capability
  // n'étant implémentée (`capabilitiesEmitCode: false`). L'y ajouter ferait
  // basculer les 61 promesses de capability du corpus de mortes à vivantes sans
  // qu'une seule ligne ne s'exécute — le faux vert exact que ce paquet existe
  // pour empêcher.
  //
  // Le test cesse donc d'exiger l'ÉGALITÉ branches = effets. Il exige la
  // propriété qui compte vraiment : tout effet DÉCLARÉ exécutable a sa branche,
  // et toute branche EN PLUS est justifiée par un refus explicite.
  it("tout effet déclaré a sa branche, et toute branche en plus REFUSE explicitement", () => {
    const branches = new Set(
      [...RUNTIME.matchAll(/effect\??\.kind === "(\w+)"/g)].flatMap((m) =>
        m[1] === undefined ? [] : [m[1]],
      ),
    );
    for (const effet of EXECUTION_ENVELOPE_V1.effects) expect(branches).toContain(effet);
    const enPlus = [...branches].filter(
      (b) => !(EXECUTION_ENVELOPE_V1.effects as readonly string[]).includes(b),
    );
    expect(enPlus).toEqual(["capability"]);
    // La branche en plus route vers un fournisseur dont le DÉFAUT refuse.
    expect(RUNTIME).toContain("capabilities.invoke");
    expect(read("compiler/runtime/capability-provider.tsx")).toContain("return false;");
    expect(EXECUTION_ENVELOPE_V1.capabilitiesEmitCode).toBe(false);
  });

  it("les effets hors enveloppe sont explicitement documentés comme non-opérations", () => {
    expect(RUNTIME).toContain("non-opération v1");
  });
});

describe("véracité de l'enveloppe — déclencheurs", () => {
  it("seul le déclencheur `ui` atteint un composant", () => {
    // L'émetteur ne construit une table de déclencheurs que pour `ui` ;
    // aucun autre `trigger.kind` n'est lu par le chemin d'émission.
    expect(EMIT_PROJECT).toContain('action.trigger.kind === "ui"');
    expect(EMIT_PROJECT).not.toContain('action.trigger.kind === "lifecycle"');
    expect(EMIT_PROJECT).not.toContain('action.trigger.kind === "data"');
    expect(EXECUTION_ENVELOPE_V1.triggers).toEqual(["ui"]);
  });
});

describe("véracité de l'enveloppe — opérations de données", () => {
  it("l'interface DataProvider expose EXACTEMENT les opérations déclarées", () => {
    const methods = [...DATA_PROVIDER.matchAll(/^ {2}(\w+)\(/gm)].map((m) => m[1]).sort();
    expect(methods).toEqual(["getInstance", "listInstances"]);
    expect([...EXECUTION_ENVELOPE_V1.dataOperations].sort()).toEqual(["get", "list"]);
  });

  it("aucune méthode d'écriture n'existe dans le contrat de données", () => {
    for (const write of ["create(", "update(", "delete(", "mutate(", "observe("]) {
      expect(DATA_PROVIDER).not.toContain(write);
    }
  });
});

describe("véracité de l'enveloppe — états de blocs", () => {
  it("AirForm code son état EN DUR : `submitting` et `error` sont inatteignables", () => {
    expect(RUNTIME).toContain('state="ready"');
    expect(EXECUTION_ENVELOPE_V1.reachableBlockStates.form).toEqual(["ready"]);
  });

  it("AirList ne calcule que `empty` et `ready`", () => {
    expect(RUNTIME).toContain('{ kind: "empty"');
    expect(RUNTIME).toContain('{ kind: "ready" }');
    expect(RUNTIME).not.toContain('kind: "loading"');
    expect(RUNTIME).not.toContain('kind: "error"');
    expect([...(EXECUTION_ENVELOPE_V1.reachableBlockStates.list ?? [])].sort()).toEqual([
      "empty",
      "ready",
    ]);
  });
});

describe("véracité de l'enveloppe — capabilities", () => {
  it("l'émetteur de manifestes déclare lui-même n'implémenter aucune capability", () => {
    expect(EMIT_MANIFESTS).toContain("AUCUNE implémentation de capability");
    expect(EXECUTION_ENVELOPE_V1.capabilitiesEmitCode).toBe(false);
  });

  it("aucune dépendance d'implémentation de capability n'entre dans le projet émis", () => {
    // Les paquets déclarés par le registre v1 (expo-notifications, expo-sqlite,
    // @supabase/supabase-js, react-native-maps…) sont ABSENTS du gabarit.
    const deps = Object.keys(
      (JSON.parse(TEMPLATE_PKG) as { dependencies: Record<string, string> }).dependencies,
    );
    for (const pkg of [
      "expo-notifications",
      "expo-sqlite",
      "expo-sharing",
      "expo-camera",
      "react-native-maps",
      "@supabase/supabase-js",
    ]) {
      expect(deps).not.toContain(pkg);
    }
  });
});

describe("véracité de l'enveloppe — slots, règles, RTL, thème", () => {
  // ÉDITION CONSCIENTE (2026-08-31, D-058) : ce test constatait `DET-018` — le
  // compilateur ÉMETTAIT le code des slots, l'Oracle en refusait les
  // exfiltrations, et RIEN NE LES APPELAIT. 44 des 152 promesses mortes du
  // corpus visaient un slot. Le fait a changé : le runtime invoque désormais un
  // slot LIÉ. Le test ne vérifie plus une absence, il vérifie la CONDITION
  // EXACTE de l'invocation — sans quoi `slotsInvoked: true` deviendrait une
  // surdéclaration comme une autre.
  it("le runtime invoque un slot LIÉ, et lui seul (D-058)", () => {
    expect(RUNTIME).toContain("useSlotRegistry");
    expect(EXECUTION_ENVELOPE_V1.slotsInvoked).toBe(true);
    // La liaison est la condition : sans `binding`, aucune invocation n'est
    // possible puisque le compilateur n'émet alors AUCUNE `slotInvocations`.
    expect(EMIT_PROJECT).toContain("binding === undefined");
    // Et l'invocation reste hors du dispatcher : un slot n'est pas un effet de
    // pression, il est calculé au rendu. `effects` ne doit donc pas le porter.
    expect(EXECUTION_ENVELOPE_V1.effects).not.toContain("slot");
  });

  it("aucun étage d'émission ne lit `air.rules`", () => {
    expect(EMIT_PROJECT).not.toContain("air.rules");
    expect(RUNTIME).not.toContain(".rules");
    expect(EXECUTION_ENVELOPE_V1.rulesEnforced).toBe(false);
  });

  it("aucun étage d'émission ne lit `rtlSupported` (non-négociable #16 non tenu)", () => {
    expect(EMIT_PROJECT).not.toContain("rtlSupported");
    expect(EMIT_MANIFESTS).not.toContain("rtlSupported");
    expect(RUNTIME).not.toContain("rtlSupported");
    expect(EXECUTION_ENVELOPE_V1.rtlFlagEffective).toBe(false);
  });

  it("`design.theme` n'est LU par aucun étage d'émission (seul `overrides` agit)", () => {
    // Assertion PRÉCISE : on vise l'ACCÈS À LA PROPRIÉTÉ, pas la chaîne —
    // `emit-project.ts` mentionne « design.theme transporté sans effet » dans
    // un commentaire ÉMIS, ce qui est vrai et ne doit pas faire échouer le
    // cliquet. Le contraste avec `air.design.overrides`, lui bien lu, prouve
    // que la mesure discrimine réellement.
    const emitters = [EMIT_PROJECT, EMIT_MANIFESTS, read("compiler/src/emit-theme.ts")];
    for (const source of emitters) expect(source).not.toContain("air.design.theme");
    expect(read("compiler/src/emit-theme.ts")).toContain("air.design.overrides");
    expect(EXECUTION_ENVELOPE_V1.themeNameEffective).toBe(false);
  });

  it("l'état d'un formulaire est LOCAL au composant", () => {
    expect(RUNTIME).toContain("useState<Readonly<Record<string, string>>>({})");
    expect(EXECUTION_ENVELOPE_V1.crossScreenFormState).toBe(false);
  });
});

describe("véracité de l'enveloppe — traversée de relation et filtrage", () => {
  it("aucun bloc n'accepte de champ de l'entité CIBLE d'une référence", () => {
    const defs = read("blocks/src/definitions.ts");
    // Toutes les props de champ sont typées `fieldRef` — un motif unique,
    // sans notion de chemin ni de cible.
    expect(defs).toContain("const fieldRef = z.string()");
    expect(defs).not.toContain("targetFieldId");
    expect(defs).not.toContain("relationPath");
    expect(EXECUTION_ENVELOPE_V1.relationTraversal).toBe(false);
  });

  it("aucun bloc n'accepte de filtre, de tri ou de pagination", () => {
    const defs = read("blocks/src/definitions.ts");
    for (const prop of ["filter", "sortBy", "orderBy", "pageSize", "limit"]) {
      expect(defs).not.toContain(prop);
    }
    expect(EXECUTION_ENVELOPE_V1.listFiltering).toBe(false);
  });
});
