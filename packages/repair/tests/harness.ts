// HARNAIS DES TESTS DE LA BOUCLE — ports RÉELS (compilateur + Oracle) et
// scénario de panne DÉRIVÉ du corpus gelé.
//
// Le corpus n'est JAMAIS modifié : la panne est injectée dans une COPIE
// profonde en mémoire. C'est la seule façon d'éprouver la boucle sur le
// vrai slice sans toucher à l'artefact gelé de la Phase 2.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileProject } from "@deribfy/compiler";
import { evaluateApxxGrid, runOracleLevel1 } from "@deribfy/oracle";
import type { ProjectAir } from "@deribfy/air-schema";
import type {
  RepairSimulator,
  RepairState,
  RepairVerifier,
  SimulationResult,
  VerificationReport,
} from "../src/contracts.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CORPUS = join(HERE, "..", "..", "golden-corpus", "corpus-v2");

export const loadAir = (file: string): unknown =>
  JSON.parse(readFileSync(join(CORPUS, file), "utf8"));

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Bloc « Mes commandes » du slice 1 — le bouton de la panne provoquée. */
export const BOUTON_COMMANDES = "blk_menu_bouton_commandes";

interface MutableAir {
  screens: { id: string; blocks: { id: string; props?: { key: string; value: unknown }[] }[] }[];
}

/**
 * PANNE PROVOQUÉE : le bouton pointe une action qui n'existe pas. Le bouton
 * est rendu, il est cliquable, et il ne fait RIEN — c'est la panne décrite
 * par la ROADMAP (« le bouton Commander ne fonctionne pas »).
 */
export function provoquerBoutonMort(air: unknown, blockId = BOUTON_COMMANDES): unknown {
  const copy = clone(air) as MutableAir;
  for (const screen of copy.screens) {
    for (const block of screen.blocks) {
      if (block.id !== blockId) continue;
      const prop = (block.props ?? []).find((p) => p.key === "actionId");
      if (prop === undefined) throw new Error(`fixture : ${blockId} ne porte pas d'actionId`);
      prop.value = `${String(prop.value)}_v2`;
      return copy;
    }
  }
  throw new Error(`fixture : bloc ${blockId} introuvable`);
}

export const simulator: RepairSimulator = {
  simulate(state: RepairState): SimulationResult {
    try {
      const compiled = compileProject(state.air, undefined, { slots: state.slots });
      return { ok: true, rootHash: compiled.rootHash, paths: [...compiled.files.keys()].sort() };
    } catch (e) {
      return { ok: false, rootHash: "", paths: [], error: String(e).slice(0, 160) };
    }
  },
};

/** Juge = Oracle L1 déterministe + grille A++ rejouée sur l'artefact. */
export const oracleVerifier: RepairVerifier = {
  id: "oracle-l1",
  verify(state: RepairState): VerificationReport {
    const verdict = runOracleLevel1(state.air, undefined, { slots: state.slots });
    let apxx: VerificationReport["apxx"] = [];
    try {
      const compiled = compileProject(state.air, undefined, { slots: state.slots });
      apxx = evaluateApxxGrid(compiled.files, state.air as ProjectAir).dimensions.map((d) => ({
        dimension: d.dimension,
        state: d.state,
      }));
    } catch {
      apxx = [];
    }
    return { passed: verdict.passed, checks: [...verdict.checks], apxx };
  },
};

export const oracleSignal = (state: RepairState) => {
  const verdict = runOracleLevel1(state.air, undefined, { slots: state.slots });
  return { source: "oracle" as const, checks: [...verdict.checks] };
};
