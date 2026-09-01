// @deribfy/execution-contract — Contrat d'exécution (Étapes 0-1).
//
// Referme l'UNIQUE chemin fail-open du moteur. L'AIR décrit ce que l'app doit
// être (face DESCRIPTION, déjà construite) ; l'enveloppe décrit ce que le
// moteur sait faire (face CAPACITÉ) ; la faisabilité les réconcilie (face
// RÉCONCILIATION). Un effet non exécutable n'est plus ignoré : il est NOMMÉ,
// IMPUTÉ à un propriétaire, et SCELLÉ dans un rapport hashé.
export {
  EXECUTION_ENVELOPE_V1,
  EXECUTION_ENVELOPE_VERSION,
} from "./envelope.ts";
export type {
  DataOperation,
  EffectKind,
  ExecutionEnvelope,
  TriggerKind,
} from "./envelope.ts";
export {
  SCREEN_TRAITS,
  controls,
  dataBindings,
  detailScreens,
  formulairesSansAction,
  rawReferences,
  reachableScreens,
  screenTraits,
} from "./graph.ts";
export type {
  ControlFinding,
  DataBindingFinding,
  DetailScreenFinding,
  FormulaireSansActionFinding,
  RawReferenceFinding,
  ScreenTrait,
  ScreenTraitFinding,
} from "./graph.ts";
export {
  FeasibilityRefusedError,
  analyzeFeasibility,
  assertFeasible,
} from "./feasibility.ts";
export type {
  FeasibilityGap,
  FeasibilityMetrics,
  FeasibilityMode,
  FeasibilityReport,
  FeasibilityVerdict,
  GapOwner,
} from "./feasibility.ts";
