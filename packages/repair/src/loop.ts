// BOUCLE DE RÉPARATION (Phase 9 — ARCHITECTURE §10).
//
//   FAIL → DIAGNOSE → CLASSIFY → PLAN → IMPACT ANALYSIS → SIMULATE
//        → POLICY GATE → APPLY → VERIFY → COMMIT   (sinon ROLLBACK)
//
// Cœur PUR : aucun SDK, aucun réseau, aucune horloge, aucun fs. L'auteur
// (LLM ou déterministe), le juge (Oracle) et le simulateur (compilateur)
// sont des PORTS injectés — la boucle ne peut donc ni écrire un artefact,
// ni se juger elle-même.
//
// Trois refus structurels, tous vérifiés ici :
//  1. juge = auteur      → la boucle ne démarre pas (non-négociable #5) ;
//  2. hors périmètre     → un patch touchant blocs/structure est refusé
//                          AVANT toute application (§3, §10) ;
//  3. hors diagnostic    → tout nœud d'AIR modifié en dehors des cibles
//                          désignées par le diagnostic fait refuser la
//                          proposition, et toute divergence entre les
//                          fichiers de slots DÉCLARÉS et ceux réellement
//                          émis aussi. C'est la parade au patch qui « fait
//                          autre chose en plus » (§27, injection indirecte).
// Et un refus de qualité : toute dégradation de la grille A++ annule la
// réparation, même si elle restaure la fonction (amendement D-039).
import { checkPatchScope, checkSlotBundle } from "@deribfy/slots";
import type { SlotDeclaration } from "@deribfy/slots";
import {
  type ApxxSnapshot,
  type ApxxState,
  type ImpactAnalysis,
  type RepairAuthor,
  type RepairEvent,
  type RepairOutcome,
  type RepairSimulator,
  type RepairState,
  type RepairStatus,
  type RepairVerifier,
  type FailureSignal,
  RepairContractError,
} from "./contracts.ts";
import { assertBudget, canAttempt, EMPTY_LEDGER, isExhausted, spend, type RepairBudget } from "./budget.ts";
import { changedJsonPaths, formatPath, pathCrossesBlock, pathIsSlots } from "./air-delta.ts";
import { diagnose } from "./diagnose.ts";

export interface RepairInput {
  readonly signal: FailureSignal;
  readonly state: RepairState;
  /**
   * Dernier état RÉPUTÉ BON (artefact précédent du store). Il fournit la
   * grille A++ de référence : sans lui, un état en panne qui ne compile pas
   * ne produit aucune grille, et la non-régression deviendrait vacuous —
   * un « vert » obtenu par absence de mesure, exactement ce que le
   * protocole de preuve interdit. Quand il manque, la boucle le DIT.
   */
  readonly reference?: RepairState;
  readonly budget: RepairBudget;
  readonly author: RepairAuthor;
  readonly verifier: RepairVerifier;
  readonly simulator: RepairSimulator;
}

const RANK: Readonly<Record<ApxxState, number>> = {
  non_conforme: 0,
  non_determinee: 1,
  conforme: 2,
};

/**
 * Dimensions DÉGRADÉES entre deux relevés de grille. Une dette déjà ouverte
 * avant la réparation ne bloque rien ; seule une DÉGRADATION bloque.
 */
export function apxxRegressions(
  before: readonly ApxxSnapshot[],
  after: readonly ApxxSnapshot[],
): readonly string[] {
  const byKey = new Map(before.map((d) => [d.dimension, d]));
  return after
    .filter((d) => {
      const previous = byKey.get(d.dimension);
      return previous !== undefined && RANK[d.state] < RANK[previous.state];
    })
    .map((d) => d.dimension);
}

const slotDeclarations = (air: unknown): readonly SlotDeclaration[] => {
  if (typeof air !== "object" || air === null) return [];
  const slots = (air as { slots?: unknown }).slots;
  return Array.isArray(slots) ? (slots as readonly SlotDeclaration[]) : [];
};

function impactOf(
  before: { rootHash: string; paths: readonly string[] },
  after: { rootHash: string; paths: readonly string[] },
  changedPaths: readonly string[],
): ImpactAnalysis {
  const beforeSet = new Set(before.paths);
  const afterSet = new Set(after.paths);
  return {
    rootHashBefore: before.rootHash,
    rootHashAfter: after.rootHash,
    added: after.paths.filter((p) => !beforeSet.has(p)).sort(),
    removed: before.paths.filter((p) => !afterSet.has(p)).sort(),
    changed: [...changedPaths].sort(),
  };
}

/**
 * Exécute la boucle. Ne lève QUE sur violation de contrat (budget invalide,
 * juge = auteur) : toute autre issue est un statut, jamais une exception —
 * un échec de réparation doit rester exploitable par l'appelant et lisible
 * par un humain.
 */
export function runRepairLoop(input: RepairInput): RepairOutcome {
  const { author, verifier, simulator, budget } = input;
  assertBudget(budget);
  if (author.id === verifier.id) {
    throw new RepairContractError(
      "REPAIR_JUDGE_IS_AUTHOR",
      `l'auteur et le juge portent la même identité ("${author.id}") — interdit (non-négociable #5)`,
    );
  }

  const journal: RepairEvent[] = [];
  const log = (stage: RepairEvent["stage"], attempt: number, ok: boolean, detail: string): void => {
    journal.push({ stage, attempt, ok, detail });
  };

  // Relevé de RÉFÉRENCE : grille A++ AVANT toute réparation — mesurée sur
  // le dernier état bon connu s'il est fourni, sinon sur l'état en panne.
  const baseline = verifier.verify(input.reference ?? input.state);
  const baseSimulation = simulator.simulate(input.state);

  let state = input.state;
  let ledger = EMPTY_LEDGER;
  const refusals: string[] = [];
  let sawGateRefusal = false;
  let status: RepairStatus = "not_repairable";
  let impact: ImpactAnalysis | undefined;

  while (canAttempt(budget, ledger)) {
    const attempt = ledger.attempts + 1;

    // --- DIAGNOSE + CLASSIFY (sur l'état COURANT, jamais sur un souvenir).
    const diagnosis = diagnose(input.signal, state);
    log("diagnose", attempt, diagnosis.repairClass !== "UNKNOWN", diagnosis.evidence.join(" | "));
    log("classify", attempt, diagnosis.repairClass !== "UNKNOWN", diagnosis.repairClass);
    if (diagnosis.repairClass === "UNKNOWN") {
      status = "not_repairable";
      break;
    }

    // --- PLAN (port auteur : il propose, il n'applique rien).
    const proposal = author.propose({
      diagnosis,
      state,
      attempt,
      previousRefusals: [...refusals],
    });
    if (proposal === null) {
      log("plan", attempt, false, "l'auteur ne propose plus de correction");
      status = sawGateRefusal ? "refused_by_gate" : "not_repairable";
      break;
    }
    ledger = spend(ledger, proposal.tokens);
    log("plan", attempt, true, `${proposal.rationale} (${String(proposal.tokens)} jetons)`);

    // --- IMPACT ANALYSIS (déclaré par l'auteur) puis SIMULATE (observé).
    const declared = proposal.edits.map((e) => e.path).sort();
    log("impact", attempt, true, `édition déclarée : ${declared.join(", ") || "aucune"}`);

    const after = simulator.simulate(proposal.next);
    if (!after.ok) {
      const reason = `simulation en échec : ${after.error ?? "inconnue"}`;
      log("simulate", attempt, false, reason);
      refusals.push(reason);
      continue; // ROLLBACK implicite : `state` n'a pas bougé.
    }
    const observedChanged = after.paths.filter((p) => !baseSimulation.paths.includes(p));
    const candidateImpact = impactOf(baseSimulation, after, observedChanged);
    // Honnêteté du relevé : si l'état EN PANNE ne compile pas, il n'existe
    // aucun artefact de référence — le dire, plutôt que présenter tous les
    // fichiers du projet comme des « ajouts » de la réparation.
    log(
      "simulate",
      attempt,
      true,
      baseSimulation.ok
        ? `rootHash ${candidateImpact.rootHashBefore.slice(0, 12)} → ${candidateImpact.rootHashAfter.slice(0, 12)} ; ` +
          `+${String(candidateImpact.added.length)} / -${String(candidateImpact.removed.length)}`
        : `aucun artefact de référence (l'état en panne ne compile pas) ; ` +
          `artefact réparé ${candidateImpact.rootHashAfter.slice(0, 12)} en ${String(after.paths.length)} fichiers`,
    );

    // --- POLICY GATE (déterministe, AVANT toute adoption).
    // 1. périmètre des éditions déclarées : `slots/` et rien d'autre ;
    const scope = checkPatchScope(proposal.edits);
    // 2. périmètre des nœuds d'AIR réellement modifiés : uniquement les
    //    cibles désignées par le DIAGNOSTIC (ou la liste de slots) ;
    const airOutside = changedJsonPaths(state.air, proposal.next.air)
      .filter(
        (path) =>
          !pathIsSlots(path) &&
          !diagnosis.targets.some(
            (t) => t.blockId !== undefined && pathCrossesBlock(proposal.next.air, path, t.blockId),
          ),
      )
      .map(formatPath);
    // 3. fichiers de slots RÉELLEMENT émis == fichiers déclarés par l'auteur ;
    const emittedSlotFiles = after.paths.filter((p) => p.startsWith("slots/") && p !== "slots/index.ts");
    const declaredSlotFiles = declared.filter((p) => p.startsWith("slots/"));
    const slotMismatch =
      JSON.stringify(emittedSlotFiles) !== JSON.stringify([...declaredSlotFiles].sort());
    // 4. politique AST sur le bundle proposé.
    const slotVerdict = checkSlotBundle(
      proposal.next.slots.map((s) => ({ slotId: s.slotId, source: s.source, authorId: s.authorId })),
      slotDeclarations(proposal.next.air),
    );
    const gateProblems: string[] = [
      ...scope.violations.map((v) => `${v.code}@${v.path}`),
      ...slotVerdict.violations.map((v) => `${v.code}@${v.slotId}`),
      ...(airOutside.length > 0 ? [`PATCH_AIR_OUT_OF_TARGET@${airOutside.join(",")}`] : []),
      ...(slotMismatch
        ? [`PATCH_UNDECLARED_SLOT_EFFECT@émis=[${emittedSlotFiles.join(",")}] déclaré=[${declaredSlotFiles.join(",")}]`]
        : []),
    ];
    if (gateProblems.length > 0) {
      const reason = gateProblems.join(" ; ");
      log("policy_gate", attempt, false, reason);
      refusals.push(reason);
      sawGateRefusal = true;
      continue; // ROLLBACK.
    }
    log("policy_gate", attempt, true, "périmètre, politique AST et effets déclarés conformes");

    // --- APPLY (adoption CANDIDATE : l'état n'est validé qu'au COMMIT).
    const candidate = proposal.next;
    log("apply", attempt, true, "état candidat adopté (non committé)");

    // --- VERIFY : trois conditions CUMULATIVES.
    //     (a) le juge indépendant accepte l'artefact ;
    //     (b) la CAUSE DIAGNOSTIQUÉE a réellement disparu — sans quoi une
    //         « réparation » partielle passerait pour un succès dès lors
    //         qu'aucun contrôle ne la contredit (le juge ne sait pas ce
    //         qu'on cherchait à réparer, c'est à la boucle de le vérifier) ;
    //     (c) aucune dimension A++ n'est dégradée (amendement D-039).
    const report = verifier.verify(candidate);
    const residual = diagnose(input.signal, candidate);
    const sameTargets = residual.targets.some((rt) =>
      diagnosis.targets.some((dt) => JSON.stringify(rt) === JSON.stringify(dt)),
    );
    const causePersists = residual.repairClass === diagnosis.repairClass && sameTargets;
    const regressions = apxxRegressions(baseline.apxx, report.apxx);
    // Absence de grille de référence : DITE dans le journal, jamais passée
    // sous silence — un « vert » obtenu par absence de mesure n'en est pas un.
    const noteGrille =
      baseline.apxx.length === 0
        ? " ; non-régression A++ NON ÉVALUABLE (aucune grille de référence)"
        : "";
    if (causePersists) {
      const reason = `cause diagnostiquée toujours présente (${residual.repairClass}) : ${residual.evidence.slice(-1).join("")}`;
      log("verify", attempt, false, reason);
      refusals.push(reason);
      continue; // ROLLBACK.
    }
    if (!report.passed || regressions.length > 0) {
      const reason = !report.passed
        ? `juge : ${report.checks
            .filter((c) => !c.passed)
            .map((c) => `${c.name}(${c.detail})`)
            .join(", ")}`
        : `régression A++ sur ${regressions.join(", ")} — réparation REFUSÉE malgré la fonction restaurée`;
      log("verify", attempt, false, reason);
      refusals.push(reason);
      continue; // ROLLBACK : `state` reste l'état d'avant.
    }
    log(
      "verify",
      attempt,
      true,
      `juge "${verifier.id}" : ${String(report.checks.length)} contrôles verts, cause diagnostiquée disparue` +
        (noteGrille === "" ? ", grille A++ non dégradée" : noteGrille),
    );

    // --- COMMIT.
    state = candidate;
    impact = candidateImpact;
    status = "repaired";
    log("commit", attempt, true, `réparation committée (${String(ledger.tokens)} jetons consommés)`);
    break;
  }

  if (status !== "repaired" && isExhausted(budget, ledger)) {
    status = "budget_exhausted";
  }

  return {
    status,
    attempts: ledger.attempts,
    tokensSpent: ledger.tokens,
    journal,
    ...(status === "repaired" ? { state, ...(impact === undefined ? {} : { impact }) } : {}),
  };
}
