// RUNNER DE PIPELINE (6.1, D-034 — ARCHITECTURE §8). Logique du MOTEUR,
// PROVIDER-AGNOSTIC : prend un SandboxProvider quelconque, joue le pipeline
// éphémère (upload → étapes → destruction garantie), retourne un rapport
// structuré (temps par étape, exit codes) que l'Oracle L1 (6.2) lira.
// N'importe AUCUN SDK de provider — seulement le contrat. Destruction en
// finally (le sandbox est toujours détruit, même en cas d'échec ou de
// timeout). `--ignore-scripts` est porté par les étapes (politique §8).
import type {
  ExecResult,
  SandboxProvider,
  SandboxSpec,
  UploadEntry,
} from "./contracts.ts";

export interface PipelineStep {
  readonly name: string;
  readonly command: string;
  /** Timeout spécifique à l'étape (sinon celui du spec). */
  readonly timeoutMs?: number;
}

export interface StepReport {
  readonly name: string;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly timedOut: boolean;
}

export interface PipelineReport {
  readonly provider: string;
  readonly sandboxId: string;
  readonly ok: boolean;
  readonly steps: readonly StepReport[];
  readonly failedStep: string | null;
  readonly totalDurationMs: number;
  readonly teardownProved: boolean;
  /** stderr de l'étape en échec (borné) — matière de diagnostic Oracle. */
  readonly failureStderr: string | null;
}

/** Pipeline §8 par défaut pour un projet Expo généré, dans `workdir`. */
export function defaultPipeline(workdir: string): readonly PipelineStep[] {
  return [
    { name: "npm_ci", command: `cd ${workdir} && npm ci --ignore-scripts --no-audit --no-fund` },
    { name: "typecheck", command: `cd ${workdir} && npx tsc --noEmit` },
    { name: "bundle", command: `cd ${workdir} && npx expo export --platform ios --platform android --output-dir dist` },
  ];
}

/**
 * Joue un pipeline dans un sandbox éphémère fourni par `provider`.
 * Le sandbox est TOUJOURS détruit (finally) et son absence prouvée.
 * S'arrête à la première étape non nulle (fail-fast), la consigne, et
 * poursuit jusqu'au teardown.
 */
export async function runPipeline(
  provider: SandboxProvider,
  spec: SandboxSpec,
  files: readonly UploadEntry[],
  steps: readonly PipelineStep[],
): Promise<PipelineReport> {
  const handle = await provider.create(spec);
  const stepReports: StepReport[] = [];
  let failedStep: string | null = null;
  let failureStderr: string | null = null;
  const t0 = Date.now();
  try {
    await provider.upload(handle, files);
    for (const step of steps) {
      const r: ExecResult = await provider.exec(handle, step.command, {
        timeoutMs: step.timeoutMs ?? spec.timeoutMs,
      });
      stepReports.push({
        name: step.name,
        exitCode: r.exitCode,
        durationMs: r.durationMs,
        timedOut: r.timedOut,
      });
      if (r.exitCode !== 0) {
        failedStep = step.name;
        failureStderr = r.stderr.slice(0, 500);
        break;
      }
    }
  } finally {
    await provider.terminate(handle).catch(() => undefined);
  }
  const teardownProved = await provider.isAbsent(handle).catch(() => false);
  return {
    provider: provider.name,
    sandboxId: handle.id,
    ok: failedStep === null,
    steps: stepReports,
    failedStep,
    totalDurationMs: Date.now() - t0,
    teardownProved,
    failureStderr,
  };
}
