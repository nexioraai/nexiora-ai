// DIAGNOSE + CLASSIFY (Phase 9 — ARCHITECTURE §10, protocole de preuve
// D-018).
//
// Règle de méthode appliquée ici : le diagnostic ne RECOPIE JAMAIS le
// message d'échec. Il s'en sert comme d'un indice, puis RE-DÉRIVE les faits
// depuis l'AIR lui-même. Un message d'erreur est une observation ; la cause
// doit être établie sur la structure réelle. C'est ce qui permet d'affirmer
// « la cause est X » sans conjecture — et c'est ce qui rend la correction
// candidate DÉDUITE plutôt que devinée.
//
// La classification est une ALLOWLIST POSITIVE : une panne hors des classes
// connues n'est pas « tentée quand même », elle est escaladée (non-négociable
// #8 — jamais de modification arbitraire).
import type { Diagnosis, DiagnosisTarget, FailureSignal, RepairState, SlotSource } from "./contracts.ts";

interface AirLike {
  readonly screens: readonly {
    readonly id: string;
    readonly blocks: readonly {
      readonly id: string;
      readonly props?: readonly { readonly key: string; readonly value: unknown }[];
    }[];
  }[];
  readonly actions: readonly {
    readonly id: string;
    readonly trigger: { readonly kind: string; readonly blockId?: string };
    readonly effect: { readonly kind: string; readonly slotId?: string };
  }[];
  readonly slots: readonly { readonly id: string }[];
}

const asAir = (value: unknown): AirLike | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const air = value as Partial<AirLike>;
  if (!Array.isArray(air.screens) || !Array.isArray(air.actions) || !Array.isArray(air.slots)) {
    return undefined;
  }
  return air as AirLike;
};

const propValue = (
  block: AirLike["screens"][number]["blocks"][number],
  key: string,
): string | undefined => {
  const found = (block.props ?? []).find((p) => p.key === key);
  return typeof found?.value === "string" ? found.value : undefined;
};

/**
 * DIAGNOSE : établit la cause sur des FAITS de l'AIR, puis CLASSIFY la range
 * dans une classe réparable connue. Fonction PURE et déterministe.
 */
export function diagnose(signal: FailureSignal, state: RepairState): Diagnosis {
  const air = asAir(state.air);
  if (air === undefined) {
    return { repairClass: "UNKNOWN", evidence: ["AIR illisible ou non conforme au schéma"], targets: [] };
  }
  const failed = signal.checks.filter((c) => !c.passed);
  if (failed.length === 0) {
    return { repairClass: "UNKNOWN", evidence: ["aucun contrôle en échec dans le signal"], targets: [] };
  }
  const evidence: string[] = failed.map((c) => `signal:${c.name}`);

  // --- Classe 1 : référence d'action pendante (« le bouton ne fait rien »).
  //     Fait re-dérivé : un bloc porte un `actionId` qui n'existe pas dans
  //     `actions`. Correction candidate : l'action dont le DÉCLENCHEUR UI
  //     vise précisément ce bloc — cette information est déjà dans l'AIR,
  //     elle n'est donc pas inventée.
  const actionIds = new Set(air.actions.map((a) => a.id));
  const dangling: DiagnosisTarget[] = [];
  for (const screen of air.screens) {
    for (const block of screen.blocks) {
      const actionId = propValue(block, "actionId");
      if (actionId === undefined || actionIds.has(actionId)) continue;
      const trigger = air.actions.find(
        (a) => a.trigger.kind === "ui" && a.trigger.blockId === block.id,
      );
      dangling.push({
        screenId: screen.id,
        blockId: block.id,
        actionId,
        ...(trigger === undefined ? {} : { candidate: trigger.id }),
      });
    }
  }
  if (dangling.length > 0) {
    for (const t of dangling) {
      evidence.push(
        `air:${String(t.screenId)}.${String(t.blockId)}.actionId="${String(t.actionId)}" absent de actions[]` +
          (t.candidate === undefined
            ? " (aucune action à déclencheur ui ne vise ce bloc)"
            : ` ; action à déclencheur ui visant ce bloc = "${t.candidate}"`),
      );
    }
    return { repairClass: "AIR_ACTION_DANGLING", evidence, targets: dangling };
  }

  // --- Classe 2/3 : slots. Fait re-dérivé : quels slots sont RÉFÉRENCÉS par
  //     une action, et lesquels ont réellement une implémentation.
  const referenced = new Set(
    air.actions
      .filter((a) => a.effect.kind === "slot" && typeof a.effect.slotId === "string")
      .map((a) => String(a.effect.slotId)),
  );
  const implemented = new Set(state.slots.map((s: SlotSource) => s.slotId));
  const policyFailed = failed.find((c) => c.name === "slots_politique_ast");
  if (policyFailed !== undefined && state.slots.length > 0) {
    const offenders = state.slots
      .map((s) => s.slotId)
      .filter((id) => policyFailed.detail.includes(id));
    const targets = (offenders.length > 0 ? offenders : state.slots.map((s) => s.slotId)).map(
      (slotId) => ({ slotId }),
    );
    evidence.push(`slots:politique AST en échec sur ${String(targets.length)} module(s) émis`);
    return { repairClass: "SLOT_POLICY_VIOLATION", evidence, targets };
  }
  const missing = [...referenced].filter((id) => !implemented.has(id)).sort();
  if (missing.length > 0) {
    for (const slotId of missing) {
      const action = air.actions.find((a) => a.effect.slotId === slotId);
      evidence.push(`air:action "${String(action?.id)}" référence le slot "${slotId}" sans implémentation`);
    }
    return {
      repairClass: "SLOT_IMPLEMENTATION_MISSING",
      evidence,
      targets: missing.map((slotId) => ({ slotId })),
    };
  }

  return { repairClass: "UNKNOWN", evidence, targets: [] };
}
