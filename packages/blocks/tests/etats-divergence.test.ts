// F5 — SOURCE UNIQUE DES ÉTATS DE BLOC (D-095).
//
// HISTORIQUE, conservé parce qu'il explique la garantie actuelle.
// Trois sources parlaient des états :
//   1. CONTRAT   `contracts.ts` — ce que le composant sait RENDRE
//   2. ENVELOPPE `reachableBlockStates` — ce que le runtime ATTEINT (mesuré)
//   3. REGISTRE  `BLOCKS[].states` — une RECOPIE À LA MAIN de (1)
//
// La copie avait dérivé : `detail_header` déclarait 1 état sur 4, `form` 3 sur
// 5. Six « divergences » en découlaient, et `feasibility` en tirait des
// diagnostics faux. La cause n'était pas le moteur : c'était la duplication.
//
// CE TEST A CHANGÉ D'OBJET (édition consciente). Il figeait la divergence pour
// qu'elle ne soit pas oubliée ; elle est désormais SUPPRIMÉE À LA SOURCE. Il
// prouve maintenant que la duplication ne peut pas revenir.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXECUTION_ENVELOPE_V1 } from "@deribfy/execution-contract";
import { BLOCKS } from "../src/definitions.ts";
import {
  DETAIL_HEADER_BLOCK_STATES,
  FORM_BLOCK_STATES,
  LIST_BLOCK_STATES,
} from "../src/contracts.ts";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

describe("F5 — la duplication est supprimée à la source", () => {
  it("le registre POINTE sur les tableaux du contrat — aucune liste littérale", () => {
    // LE cliquet : redéclarer une liste à la main ferait échouer ce test.
    const defs = readFileSync(join(SRC, "definitions.ts"), "utf8");
    const litterales = defs.match(/states: \[\s*"/g) ?? [];
    expect(litterales, "une liste d'états littérale est réapparue au registre").toEqual([]);
    expect(defs).toContain("from \"./contracts.ts\"");
  });

  it("chaque bloc expose EXACTEMENT le tableau canonique de son contrat", () => {
    const attendu: Record<string, readonly string[]> = {
      list: LIST_BLOCK_STATES,
      form: FORM_BLOCK_STATES,
      detail_header: DETAIL_HEADER_BLOCK_STATES,
    };
    for (const [id, tableau] of Object.entries(attendu)) {
      const b = BLOCKS.find((x) => x.id === id);
      expect(b?.states, id).toBe(tableau); // IDENTITÉ de référence, pas égalité
    }
  });

  it("🟢 L'INVARIANT F5 : atteignable ⊆ rendable, sur les 6 blocs", () => {
    const violations: string[] = [];
    for (const b of BLOCKS) {
      const atteignables = EXECUTION_ENVELOPE_V1.reachableBlockStates[b.id] ?? [];
      for (const s of atteignables) {
        if (!b.states.includes(s)) violations.push(`${b.id}.${s}`);
      }
    }
    expect(violations, "un état est ATTEIGNABLE sans être RENDABLE").toEqual([]);
  });

  it("🟢 `form.submitting` reste RENDABLE sans être ATTEIGNABLE — et c'est légitime", () => {
    // Un état transitoire d'écriture que le runtime n'entre pas encore. Le
    // contrat le rend, l'enveloppe ne prétend pas l'atteindre : les deux
    // disent vrai. C'est la seule asymétrie restante, et elle est correcte.
    expect(FORM_BLOCK_STATES).toContain("submitting");
    expect(EXECUTION_ENVELOPE_V1.reachableBlockStates.form).not.toContain("submitting");
  });

  it("CONTRÔLE NÉGATIF : le cliquet sait détecter une liste réintroduite", () => {
    // Sans lui, un `match` qui ne trouve jamais rien passerait pour une preuve.
    expect(('    states: ["ready"],'.match(/states: \[\s*"/g) ?? []).length).toBe(1);
  });

  it("aucun bloc n'échappe au croisement", () => {
    for (const b of BLOCKS) {
      expect(EXECUTION_ENVELOPE_V1.reachableBlockStates[b.id], b.id).toBeDefined();
    }
  });
});
