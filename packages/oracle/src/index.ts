// @deribfy/oracle — Oracle v1 (Phase 6, D-034).
export { runOracleLevel1 } from "./level1.ts";
export type { OracleCheck, OracleOptions, OracleVerdict } from "./level1.ts";
export {
  MIN_TAP_TARGET,
  WCAG_AA_RATIO,
  apxxRegressions,
  contrastRatio,
  TEXT_FOREGROUNDS,
  evaluateApxxGrid,
  textForegrounds,
  wcagFailures,
  relativeLuminance,
} from "./apxx-grid.ts";
export type { ApxxReport, DimensionKey, DimensionState, DimensionVerdict } from "./apxx-grid.ts";
export {
  VISUAL_FILES,
  evaluateAntiTemplate,
  structuralSignature,
  visualSignature,
} from "./anti-template.ts";
export type { AntiTemplateReport, DomainSample } from "./anti-template.ts";
export { generateMaestroFlows } from "./e2e-flows.ts";
export { lirePreuveAppareil, PREUVE_APPAREIL_SCHEMA, CIBLE_TACTILE_MIN_DP, LIGNES_MIN_POUR_VIRTUALISATION, FENETRE_RENDU_EN_ECRANS } from "./preuve-appareil.ts";
export type { PreuveAppareil, CaptureAppareil, NoeudHierarchie, LecturePreuve, VerdictMesure } from "./preuve-appareil.ts";
export type { GeneratedFlows } from "./e2e-flows.ts";
