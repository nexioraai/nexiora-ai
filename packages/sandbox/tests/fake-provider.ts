// Provider FACTICE en mémoire — sert à tester la LOGIQUE du runner sans
// réseau ni dépense. Prouve aussi que l'interface est implémentable sans
// aucun SDK (donc réellement agnostique).
import type {
  ExecOptions,
  ExecResult,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
  UploadEntry,
} from "../src/contracts.ts";

export type FakeScript = Record<string, { exitCode: number; stdout?: string; stderr?: string; timedOut?: boolean }>;

export class FakeProvider implements SandboxProvider {
  readonly name = "fake";
  readonly created: string[] = [];
  readonly terminated: string[] = [];
  readonly uploaded = new Map<string, number>();
  private counter = 0;
  constructor(private readonly script: FakeScript = {}) {}

  create(spec: SandboxSpec): Promise<SandboxHandle> {
    void spec;
    this.counter += 1;
    const id = `fake-${this.counter}`;
    this.created.push(id);
    return Promise.resolve({ id });
  }
  upload(handle: SandboxHandle, files: readonly UploadEntry[]): Promise<void> {
    this.uploaded.set(handle.id, files.length);
    return Promise.resolve();
  }
  exec(handle: SandboxHandle, command: string, opts?: ExecOptions): Promise<ExecResult> {
    void handle;
    void opts;
    const hit = Object.entries(this.script).find(([k]) => command.includes(k))?.[1];
    return Promise.resolve({
      exitCode: hit?.exitCode ?? 0,
      stdout: hit?.stdout ?? "",
      stderr: hit?.stderr ?? "",
      durationMs: 1,
      timedOut: hit?.timedOut ?? false,
    });
  }
  terminate(handle: SandboxHandle): Promise<void> {
    this.terminated.push(handle.id);
    return Promise.resolve();
  }
  isAbsent(handle: SandboxHandle): Promise<boolean> {
    return Promise.resolve(this.terminated.includes(handle.id));
  }
}
