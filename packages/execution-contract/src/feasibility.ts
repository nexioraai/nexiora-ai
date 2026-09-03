// RÉCONCILIATION AIR ∩ ENVELOPPE — le rapport de faisabilité (Étape 1).
//
// POURQUOI CE MODULE EXISTE.
// L'architecture de référence place déjà un gate au bon endroit :
//   « STORE POLICY GATE — placé APRÈS la résolution AIR/capabilities, AVANT
//     toute dépense de compilation/sandbox […] refus motivé avant tout coût »
//   (ARCHITECTURE §5)
// Ce gate ne vérifie que la LICÉITÉ (domaine interdit, IAP, 4.2.6,
// permissions, a11y). Il ne pose jamais la question technique : « ce document
// demande-t-il quelque chose que je suis capable de produire ? ». Ce module
// apporte cette dimension manquante, au même endroit et avec les mêmes
// propriétés : déterministe, pur, fail-closed, avant toute dépense.
//
// ATTRIBUTION — la propriété la plus importante de ce rapport.
// Chaque écart est imputé à un PROPRIÉTAIRE :
//   · "document" — l'AIR est mal spécifié ; un autre AIR n'aurait pas l'écart ;
//   · "moteur"   — le moteur ne sait pas exécuter ce que l'AIR déclare
//                  légitimement ; TOUS les AIR ont l'écart ;
//   · "contrat"  — l'AIR ne peut pas exprimer ce qu'il faudrait ; aucun AIR
//                  ne peut éviter l'écart.
// Confondre ces trois causes est exactement ce qui a permis de corriger des
// documents là où le moteur était en cause, et d'attendre du moteur ce que le
// contrat ne sait pas dire. La colonne `owner` interdit cette confusion.
//
// MODES (fail-closed dans les deux cas, jamais silencieux) :
//   · "strict"            — le moindre écart REFUSE le document ;
//   · "declared_degraded" — le document compile, mais le rapport est émis et
//                           scellé : la dégradation devient un FAIT PORTÉ par
//                           l'artefact, jamais une omission.
// Le corpus GELÉ ne peut pas être réécrit (provenance modèle, D-025) : il
// vit en "declared_degraded". Il reste byte-identique sur disque, mais il
// cesse d'être silencieux.

import { canonicalJson, sha256Hex, type ProjectAir } from "@deribfy/air-schema";
// Import par le sous-chemin `/registry` — DÉLIBÉRÉ : l'index de `@deribfy/blocks`
// ré-exporte les composants React Native. Ce paquet doit rester exécutable en
// Node pur (patron identique à `resolve-lock.ts`, qui importe le même chemin).
import { getBlock } from "@deribfy/blocks/registry";
import {
  EXECUTION_ENVELOPE_V1,
  type EffectKind,
  type ExecutionEnvelope,
  type TriggerKind,
} from "./envelope.ts";
import {
  controls,
  dataBindings,
  detailScreens,
  rawReferences,
  reachableScreens,
} from "./graph.ts";

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** À qui incombe l'écart — jamais déduit, toujours déterminé par la nature. */
export type GapOwner = "document" | "moteur" | "contrat";

export interface FeasibilityGap {
  readonly code: string;
  readonly path: string;
  readonly owner: GapOwner;
  readonly detail: string;
}

export interface FeasibilityMetrics {
  readonly effectsDeclared: number;
  readonly effectsExecuted: number;
  readonly screensDeclared: number;
  /** Atteignables sous un moteur complet — mesure le DOCUMENT. */
  readonly screensReachableDeclared: number;
  /** Atteignables sous l'enveloppe réelle — mesure ce que l'utilisateur voit. */
  readonly screensReachableEffective: number;
  readonly controlsVisible: number;
  /** Contrôles visibles sans effet : la métrique la plus discriminante. */
  readonly ghostControls: number;
  readonly dataBoundBlocks: number;
  readonly dataBoundBlocksWithSource: number;
  readonly blockStatesDeclared: number;
  readonly blockStatesReachable: number;
  readonly capabilitiesDeclared: number;
  readonly capabilitiesWired: number;
  readonly slotsDeclared: number;
  readonly slotsInvoked: number;
  readonly rulesDeclared: number;
  readonly rulesEnforced: number;
  readonly rawReferencesRendered: number;
}

export type FeasibilityVerdict = "realizable" | "degraded" | "refused";

export interface FeasibilityReport {
  readonly envelopeVersion: string;
  readonly airSchemaVersion: string;
  readonly projectId: string;
  readonly mode: FeasibilityMode;
  readonly verdict: FeasibilityVerdict;
  readonly metrics: FeasibilityMetrics;
  /** Écarts TRIÉS (path, code) — même AIR ⇒ même liste, octet pour octet. */
  readonly gaps: readonly FeasibilityGap[];
  /** Empreinte canonique du rapport — scelle la dégradation déclarée. */
  readonly reportHash: string;
}

export type FeasibilityMode = "strict" | "declared_degraded";

export class FeasibilityRefusedError extends Error {
  readonly report: FeasibilityReport;

  constructor(report: FeasibilityReport) {
    super(
      `faisabilité refusée (fail-closed) : ${report.gaps.length} écart(s) — ` +
        report.gaps
          .slice(0, 3)
          .map((g) => `${g.owner}:${g.code}@${g.path}`)
          .join(" · "),
    );
    this.name = "FeasibilityRefusedError";
    this.report = report;
  }
}

const ALL_TRIGGERS: readonly TriggerKind[] = ["ui", "lifecycle", "data"];

/**
 * AIR validé + enveloppe → rapport de faisabilité. Fonction PURE et
 * DÉTERMINISTE : aucun fs, aucun réseau, aucune horloge — même document ⇒
 * même rapport, octet pour octet (même exigence que le lock, D-027).
 *
 * L'AIR est supposé DÉJÀ VALIDE : ce module réconcilie, il ne re-valide pas.
 * L'intégrité référentielle reste l'affaire des quatre validateurs, dont la
 * précision de diagnostic ne doit pas être diluée ici (patron D-044).
 */
export function analyzeFeasibility(
  air: ProjectAir,
  envelope: ExecutionEnvelope = EXECUTION_ENVELOPE_V1,
  mode: FeasibilityMode = "declared_degraded",
): FeasibilityReport {
  const gaps: FeasibilityGap[] = [];
  const push = (code: string, path: string, owner: GapOwner, detail: string): void => {
    gaps.push({ code, path, owner, detail });
  };

  const executableEffects = new Set<EffectKind>(envelope.effects);
  const activableTriggers = new Set<TriggerKind>(envelope.triggers);

  // --- 1. EFFETS ET DÉCLENCHEURS (propriétaire : moteur).
  //     L'AIR a parfaitement le droit de déclarer une mutation : c'est le
  //     moteur qui ne sait pas l'exécuter. Imputer cela au document serait
  //     l'erreur d'attribution qui a coûté le plus cher au chantier.
  let effectsExecuted = 0;
  for (const action of [...air.actions].sort((a, b) => byCodeUnit(a.id, b.id))) {
    const effectOk = executableEffects.has(action.effect.kind);
    const triggerOk = activableTriggers.has(action.trigger.kind);
    if (effectOk && triggerOk) {
      effectsExecuted += 1;
      continue;
    }
    if (!effectOk) {
      push(
        "EXEC_EFFECT_INERT",
        `actions.${action.id}.effect`,
        "moteur",
        `effet "${action.effect.kind}" hors enveloppe ${envelope.version} — déclaré, jamais exécuté`,
      );
    }
    if (!triggerOk) {
      push(
        "EXEC_TRIGGER_INERT",
        `actions.${action.id}.trigger`,
        "moteur",
        `déclencheur "${action.trigger.kind}" hors enveloppe ${envelope.version} — aucun mécanisme d'activation`,
      );
    }
  }

  // --- 2. ATTEIGNABILITÉ (deux mesures, deux propriétaires distincts).
  const declared = new Set(reachableScreens(air, ALL_TRIGGERS));
  const effective = new Set(reachableScreens(air, envelope.triggers));
  for (const screen of [...air.screens].sort((a, b) => byCodeUnit(a.id, b.id))) {
    if (!declared.has(screen.id)) {
      // Aucun moteur, si complet soit-il, ne peut atteindre cet écran :
      // le document ne porte aucun chemin vers lui.
      push(
        "EXEC_SCREEN_UNREACHABLE_DECLARED",
        `screens.${screen.id}`,
        "document",
        "aucune action `navigate` ne mène à cet écran, et ce n'est pas l'écran d'entrée",
      );
    } else if (!effective.has(screen.id)) {
      push(
        "EXEC_SCREEN_UNREACHABLE_ENGINE",
        `screens.${screen.id}`,
        "moteur",
        "atteignable en théorie, mais le déclencheur du chemin est hors enveloppe",
      );
    }
  }

  // --- 3. ÉCRANS DE DÉTAIL SANS SOURCE D'IDENTIFIANT (contrat).
  //     Le schéma ne porte AUCUN moyen de déclarer « cette liste ouvre ce
  //     détail avec l'élément pressé » : l'`itemId` est DÉDUIT d'un
  //     déclencheur ui porté par un bloc `list`. Quand la déduction échoue,
  //     le provider retombe silencieusement sur la première ligne.
  for (const detail of detailScreens(air)) {
    if (detail.hasItemIdSource) continue;
    push(
      "EXEC_DETAIL_WITHOUT_ITEM_SOURCE",
      `screens.${detail.screenId}.${detail.blockId}`,
      "contrat",
      "aucune action `ui` portée par un bloc `list` ne mène ici — l'écran affichera toujours la PREMIÈRE ligne",
    );
  }

  // --- 4. SOURCES DE DONNÉES VIDES (document).
  //     Une entité sans `dataset` n'a aucune ligne en preview (D-013/D-030) :
  //     un bloc `list` qui s'y lie affiche son état vide pour toujours.
  const bindings = dataBindings(air);
  for (const binding of bindings) {
    if (binding.seeded) continue;
    push(
      "EXEC_DATA_SOURCE_EMPTY",
      `screens.${binding.screenId}.${binding.blockId}`,
      "document",
      `entité "${binding.entityId}" sans dataset — le bloc \`${binding.blockType}\` n'aura jamais de donnée en preview`,
    );
  }

  // --- 5. CONTRÔLES FANTÔMES (moteur).
  const allControls = controls(air, envelope);
  const ghosts = allControls.filter((c) => !c.executed);
  for (const ghost of ghosts) {
    push(
      "EXEC_GHOST_CONTROL",
      `screens.${ghost.screenId}.${ghost.blockId}`,
      "moteur",
      `contrôle visible câblé à "${ghost.actionId}" (effet ${ghost.effectKind}) — pressé, il ne produit RIEN, sans message ni état`,
    );
  }

  // --- 6. RÉFÉRENCES RENDUES BRUTES (contrat).
  const raws = rawReferences(air);
  for (const raw of raws) {
    push(
      "EXEC_REFERENCE_RENDERED_RAW",
      `screens.${raw.screenId}.${raw.blockId}.${raw.propKey}`,
      "contrat",
      `champ \`reference\` "${raw.fieldId}" affiché — rendu en identifiant brut ; aucune syntaxe ne permet d'afficher un champ de "${raw.targetEntityId}"`,
    );
  }

  // --- 7. ÉTATS DÉCLARÉS INATTEIGNABLES (moteur).
  //     Le registre GELÉ en Phase 3 déclare des états que la Phase 4 n'a
  //     jamais câblés : `list` promet loading/error, `form` promet
  //     submitting/error. La capacité a été construite, puis perdue.
  let blockStatesDeclared = 0;
  let blockStatesReachable = 0;
  const usedTypes = [
    ...new Set(air.screens.flatMap((s) => s.blocks.map((b) => b.blockType))),
  ].sort(byCodeUnit);
  for (const blockType of usedTypes) {
    const all = getBlock(blockType)?.states ?? [];
    const reachable = envelope.reachableBlockStates[blockType] ?? [];
    blockStatesDeclared += all.length;
    blockStatesReachable += reachable.length;
    const lost = all.filter((s) => !reachable.includes(s)).sort(byCodeUnit);
    if (lost.length === 0) continue;
    push(
      "EXEC_BLOCK_STATE_UNREACHABLE",
      `blocks.${blockType}.states`,
      "moteur",
      `états déclarés au registre mais INATTEIGNABLES : ${lost.join(", ")}`,
    );
  }

  // --- 8. CAPABILITIES NON CÂBLÉES (moteur).
  const capabilities = [...air.capabilities].sort((a, b) =>
    byCodeUnit(a.capability, b.capability),
  );
  if (!envelope.capabilitiesEmitCode) {
    for (const entry of capabilities) {
      push(
        "EXEC_CAPABILITY_NOT_WIRED",
        `capabilities.${entry.capability}`,
        "moteur",
        "déclarée et résolue au lock, mais n'émet ni dépendance, ni module, ni empreinte native",
      );
    }
  }

  // --- 9. SLOTS NON INVOQUÉS (contrat) — DET-018, textuellement.
  if (!envelope.slotsInvoked) {
    for (const slot of [...air.slots].sort((a, b) => byCodeUnit(a.id, b.id))) {
      push(
        "EXEC_SLOT_NOT_INVOKED",
        `slots.${slot.id}`,
        "contrat",
        "signature déclarée, module émis, registre typé — mais aucune convention de liaison n'existe dans le schéma : l'app ne l'appelle jamais",
      );
    }
  }

  // --- 10. RÈGLES NON APPLIQUÉES (moteur).
  if (!envelope.rulesEnforced) {
    for (const rule of [...air.rules].sort((a, b) => byCodeUnit(a.id, b.id))) {
      push(
        "EXEC_RULE_NOT_ENFORCED",
        `rules.${rule.id}`,
        "moteur",
        `règle \`${rule.kind}\` déclarée sur "${rule.entityId}" — aucun étage ne l'applique`,
      );
    }
  }

  // --- 11. DRAPEAUX ET DÉCLARATIONS INERTES (moteur).
  if (air.app.locales.rtlSupported && !envelope.rtlFlagEffective) {
    push(
      "EXEC_RTL_FLAG_INERT",
      "app.locales.rtlSupported",
      "moteur",
      "RTL déclaré — mesuré : l'artefact est byte-identique avec et sans le drapeau (non-négociable #16 non tenu)",
    );
  }
  const hasOverrides = (air.design.overrides ?? []).length > 0;
  if (!hasOverrides && !envelope.themeNameEffective) {
    push(
      "EXEC_THEME_NAME_INERT",
      "design.theme",
      "moteur",
      `thème "${air.design.theme}" déclaré sans \`design.overrides\` — aucune identité visuelle propre n'est émise`,
    );
  }

  // --- 12. ÉTAT DE FORMULAIRE PERDU ENTRE ÉCRANS (contrat).
  //     Deux écrans ou plus portant un `form` décrivent un parcours ; le
  //     runtime porte un état LOCAL, remis à zéro à chaque montage.
  const formScreens = air.screens.filter((s) => s.blocks.some((b) => b.blockType === "form"));
  if (formScreens.length > 1 && !envelope.crossScreenFormState) {
    push(
      "EXEC_CROSS_SCREEN_FORM_STATE",
      "screens",
      "contrat",
      `${String(formScreens.length)} écrans portent un formulaire — aucun état ne survit à une transition (parcours multi-étapes impossible)`,
    );
  }

  gaps.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : byCodeUnit(a.code, b.code),
  );

  const metrics: FeasibilityMetrics = {
    effectsDeclared: air.actions.length,
    effectsExecuted,
    screensDeclared: air.screens.length,
    screensReachableDeclared: declared.size,
    screensReachableEffective: effective.size,
    controlsVisible: allControls.length,
    ghostControls: ghosts.length,
    dataBoundBlocks: bindings.length,
    dataBoundBlocksWithSource: bindings.filter((b) => b.seeded).length,
    blockStatesDeclared,
    blockStatesReachable,
    capabilitiesDeclared: capabilities.length,
    capabilitiesWired: envelope.capabilitiesEmitCode ? capabilities.length : 0,
    slotsDeclared: air.slots.length,
    // Compte les slots RÉELLEMENT invoqués dans CE document : le moteur doit en
    // être capable (enveloppe) ET le document doit porter une liaison (1.3.0).
    // Multiplier `air.slots.length` par le booléen d'enveloppe faisait passer
    // les 44 slots du corpus gelé de 0 à 44 sans qu'aucun ne soit lié — faux
    // vert attrapé par le cliquet `corpus.test.ts`.
    slotsInvoked: envelope.slotsInvoked
      ? new Set(
          air.actions
            .filter((a) => a.effect.kind === "slot" && a.effect.binding !== undefined)
            .map((a) => (a.effect as { slotId: string }).slotId),
        ).size
      : 0,
    rulesDeclared: air.rules.length,
    rulesEnforced: envelope.rulesEnforced ? air.rules.length : 0,
    rawReferencesRendered: raws.length,
  };

  const verdict: FeasibilityVerdict =
    gaps.length === 0 ? "realizable" : mode === "strict" ? "refused" : "degraded";

  const body = {
    airSchemaVersion: air.airSchemaVersion,
    envelopeVersion: envelope.version,
    gaps,
    metrics,
    mode,
    projectId: air.projectId,
    verdict,
  };
  return { ...body, reportHash: sha256Hex(canonicalJson(body)) };
}

/**
 * Point d'entrée FAIL-CLOSED : refuse le document en mode strict.
 * Le rapport voyage AVEC l'erreur — un refus sans diagnostic serait une
 * régression par rapport au silence qu'il remplace.
 */
export function assertFeasible(
  air: ProjectAir,
  envelope: ExecutionEnvelope = EXECUTION_ENVELOPE_V1,
  mode: FeasibilityMode = "declared_degraded",
): FeasibilityReport {
  const report = analyzeFeasibility(air, envelope, mode);
  if (report.verdict === "refused") throw new FeasibilityRefusedError(report);
  return report;
}
