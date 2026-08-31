// CLIQUET D'AGNOSTICITÉ ET DE PURETÉ (patron `core-agnostic` du paquet
// repair, `provider-agnostic` du paquet sandbox).
//
// Ce que ce cliquet protège. Cet étage a le pouvoir de REFUSER un document :
// c'est exactement le genre de module où une exception « juste pour ce
// cas-là » finit par s'écrire. Trois invariants l'interdisent
// mécaniquement :
//  1. aucun vocabulaire de domaine, aucun identifiant d'instance en dur —
//     l'étage ne peut pas reconnaître une application particulière ;
//  2. aucune dépendance au compilateur, à l'Oracle ou au provisioner — la
//     réconciliation reste en amont de toute production, et ne peut pas
//     devenir juge d'elle-même ;
//  3. aucun fs, réseau, horloge ni aléa — fonction pure, donc rapport
//     reproductible et scellable (même exigence que le lock, D-027).
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const sources = readdirSync(SRC)
  .filter((f) => f.endsWith(".ts"))
  .sort()
  .map((f) => ({ file: f, code: readFileSync(join(SRC, f), "utf8") }));

const IMPORTS_INTERDITS = [
  "@deribfy/compiler",
  "@deribfy/oracle",
  "@deribfy/provisioner",
  "@deribfy/sandbox",
  "@deribfy/repair",
  "@anthropic-ai/sdk",
  "node:fs",
  "node:path",
  "node:http",
  "node:https",
  "node:crypto",
];

// Vocabulaire des 13 domaines connus. Aucun ne doit apparaître : ni dans le
// code, ni dans les commentaires — un commentaire qui raisonnerait sur un
// domaine serait le premier pas vers une branche qui le fait.
const DOMAINES = [
  "restaurant",
  "resto",
  "maquis",
  "bistro",
  "conteneur",
  "navire",
  "maritime",
  "immo",
  "coiffure",
  "fitness",
  "concert",
  "plombier",
  "toiletteur",
  "cuisine",
  "boutique",
];

// COLLISION DE VOCABULAIRE ASSUMÉE. « chantier » est à la fois un domaine du
// corpus (`suivi-chantier`) et le mot que ce projet emploie pour se désigner
// lui-même (« le chantier mobile », CLAUDE.md). Le rechercher nu produirait
// un faux positif permanent ; ne pas le rechercher du tout laisserait passer
// une vraie fuite. Il est donc cherché sous ses FORMES D'IDENTIFIANT
// uniquement — la seule manière dont il pourrait spécialiser du code.
const DOMAINES_AMBIGUS = ["suivi-chantier", "suivi_chantier", "ent_chantier", "chantier_"];

describe("agnosticité de domaine", () => {
  it("aucun vocabulaire de domaine dans les sources", () => {
    for (const { file, code } of sources) {
      const lower = code.toLowerCase();
      for (const mot of [...DOMAINES, ...DOMAINES_AMBIGUS]) {
        expect(lower.includes(mot), `${file} → « ${mot} »`).toBe(false);
      }
    }
  });

  it("le cliquet DISCRIMINE réellement (contre-épreuve de l'instrument)", () => {
    // Un cliquet qui ne mordrait jamais serait indistinguable d'un cliquet
    // absent. On vérifie donc qu'il détecte bien une fuite fabriquée.
    const fuite = 'const seuil = air.projectId === "prj_resto" ? 4 : 3;';
    expect(DOMAINES.some((m) => fuite.toLowerCase().includes(m))).toBe(true);
  });

  it("aucun identifiant d'INSTANCE en dur (scr_, ent_, act_, blk_, fld_)", () => {
    // Les motifs de PRÉFIXE sont légitimes (ils décrivent la grammaire) ;
    // un identifiant complet ne l'est jamais — il désignerait une app.
    for (const { file, code } of sources) {
      const found = [...code.matchAll(/"(scr|ent|act|blk|fld|rule|slot)_[a-z0-9_]+"/g)];
      expect(found.map((m) => m[0]), file).toEqual([]);
    }
  });

  it("aucune conditionnelle sur un NOMBRE d'écrans, d'entités ou d'actions", () => {
    // Un seuil codé en dur (« si plus de 4 écrans… ») spécialiserait l'étage
    // à la forme du corpus actuel, dont les 13 documents portent tous
    // exactement 3 entités et 3 à 4 écrans.
    for (const { file, code } of sources) {
      const found = [
        ...code.matchAll(/\.(screens|entities|actions|datasets|blocks)\.length\s*(===|==|>|<|>=|<=)\s*\d/g),
      ];
      expect(found.map((m) => m[0]), file).toEqual([]);
    }
  });
});

describe("pureté et indépendance", () => {
  it("aucune source n'importe un producteur ni un juge", () => {
    for (const { file, code } of sources) {
      for (const specifier of IMPORTS_INTERDITS) {
        expect(code.includes(`from "${specifier}"`), `${file} → ${specifier}`).toBe(false);
      }
    }
  });

  it("aucun accès au temps, à l'aléa, au réseau ni au système de fichiers", () => {
    for (const { file, code } of sources) {
      for (const interdit of ["Date.now", "new Date", "Math.random", "fetch(", "process.env"]) {
        expect(code.includes(interdit), `${file} → ${interdit}`).toBe(false);
      }
    }
  });

  it("l'étage de réconciliation n'IMPORTE que la description et les registres", () => {
    // Le contrat d'exécution se place AVANT toute dépense (ARCHITECTURE §5) :
    // il ne peut donc dépendre d'aucun étage de production.
    const autorises = new Set([
      "@deribfy/air-schema",
      "@deribfy/blocks/registry",
      "./envelope.ts",
      "./feasibility.ts",
      "./graph.ts",
    ]);
    for (const { file, code } of sources) {
      for (const match of code.matchAll(/from "([^"]+)"/g)) {
        expect(autorises.has(match[1] ?? ""), `${file} → ${match[1]}`).toBe(true);
      }
    }
  });
});
