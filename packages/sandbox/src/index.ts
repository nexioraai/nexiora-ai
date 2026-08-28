// @deribfy/sandbox — couche sandbox v1 (Phase 6, D-034). Le point d'entrée
// n'exporte QUE le contrat provider-agnostic et le runner de pipeline —
// AUCUN adaptateur de provider concret (Modal/E2B sont injectés par la
// couche de composition, jamais importés par le cœur ; cliquet ci-après).
export type {
  ExecOptions,
  ExecResult,
  NetworkPolicy,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
  UploadEntry,
} from "./contracts.ts";
export { SandboxProviderError } from "./contracts.ts";
export {
  defaultPipeline,
  runPipeline,
} from "./pipeline.ts";
export type {
  PipelineReport,
  PipelineStep,
  StepReport,
} from "./pipeline.ts";
