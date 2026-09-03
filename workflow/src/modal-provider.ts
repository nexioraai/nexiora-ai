// ADAPTATEUR MODAL pour l'exécution cloud (7.2) — implémente le contrat
// `SandboxProvider` de `@deribfy/sandbox` (provider-agnostic) depuis
// l'intérieur d'une tâche durable. Les credentials viennent de
// l'environnement CHIFFRÉ du moteur d'orchestration (syncEnvVars), jamais
// du dépôt ; ils ne sont jamais journalisés. Ajoute `packProject` :
// empaquetage tar du projet compilé, en mémoire (pas de dépendance au
// système de fichiers du dépôt).
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type {
  ExecOptions,
  ExecResult,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
  UploadEntry,
} from "../../packages/sandbox/src/index.ts";

interface ModalSandboxLike {
  sandboxId: string;
  exec: (cmd: string[], params: Record<string, unknown>) => Promise<{
    stdout: { readText: () => Promise<string> };
    stderr: { readText: () => Promise<string> };
    wait: () => Promise<number>;
  }>;
  terminate: () => Promise<void>;
  filesystem: { copyFromLocal: (local: string, remote: string) => Promise<void> };
}

export class ModalSandboxProvider implements SandboxProvider {
  readonly name = "modal";
  private readonly byId = new Map<string, ModalSandboxLike>();

  private constructor(
    private readonly client: {
      sandboxes: {
        create: (app: unknown, image: unknown, params: Record<string, unknown>) => Promise<ModalSandboxLike>;
        list: () => AsyncIterable<{ sandboxId: string }>;
      };
    },
    private readonly app: unknown,
    private readonly image: unknown,
  ) {}

  static async connect(): Promise<ModalSandboxProvider> {
    const { ModalClient } = (await import("modal")) as {
      ModalClient: new (o: { tokenId: string; tokenSecret: string }) => {
        apps: { fromName: (n: string, o: { createIfMissing: boolean }) => Promise<unknown> };
        images: { fromRegistry: (r: string) => Promise<unknown> };
        sandboxes: {
          create: (app: unknown, image: unknown, params: Record<string, unknown>) => Promise<ModalSandboxLike>;
          list: () => AsyncIterable<{ sandboxId: string }>;
        };
      };
    };
    const tokenId = process.env.MODAL_TOKEN_ID;
    const tokenSecret = process.env.MODAL_TOKEN_SECRET;
    if (tokenId === undefined || tokenSecret === undefined) {
      throw new Error("credentials sandbox absents de l'environnement");
    }
    const client = new ModalClient({ tokenId, tokenSecret });
    const app = await client.apps.fromName("deribfy-phase7", { createIfMissing: true });
    const image = await client.images.fromRegistry("node:24-bookworm-slim");
    return new ModalSandboxProvider(client, app, image);
  }

  /** Projet compilé (Map chemin→contenu) → une entrée tar unique. */
  packProject(files: ReadonlyMap<string, string>): Promise<UploadEntry[]> {
    const stage = mkdtempSync(join(tmpdir(), "p7-"));
    for (const [rel, content] of files) {
      mkdirSync(join(stage, dirname(rel)), { recursive: true });
      writeFileSync(join(stage, rel), content);
    }
    const tgz = join(tmpdir(), `p7-${Date.now().toString(36)}.tgz`);
    execFileSync("tar", ["czf", tgz, "-C", stage, "."]);
    const bytes = new Uint8Array(readFileSync(tgz));
    rmSync(stage, { recursive: true, force: true });
    rmSync(tgz, { force: true });
    return Promise.resolve([{ path: "/tmp/fixture.tgz", bytes }]);
  }

  async create(spec: SandboxSpec): Promise<SandboxHandle> {
    const params: Record<string, unknown> = {
      timeoutMs: spec.timeoutMs,
      cpu: spec.vcpu ?? 2,
      memoryMiB: spec.memoryMiB ?? 4096,
    };
    if (spec.network.mode === "block_all") params.blockNetwork = true;
    else params.outboundDomainAllowlist = [...spec.network.domains];
    const sbx = await this.client.sandboxes.create(this.app, this.image, params);
    this.byId.set(sbx.sandboxId, sbx);
    return { id: sbx.sandboxId };
  }

  async upload(handle: SandboxHandle, files: readonly UploadEntry[]): Promise<void> {
    const sbx = this.byId.get(handle.id);
    if (sbx === undefined) throw new Error("sandbox inconnu");
    for (const f of files) {
      const local = join(tmpdir(), `up-${Date.now().toString(36)}`);
      writeFileSync(local, Buffer.from(f.bytes));
      await sbx.filesystem.copyFromLocal(local, f.path);
      rmSync(local, { force: true });
    }
  }

  async exec(handle: SandboxHandle, command: string, opts?: ExecOptions): Promise<ExecResult> {
    const sbx = this.byId.get(handle.id);
    if (sbx === undefined) throw new Error("sandbox inconnu");
    const t0 = Date.now();
    try {
      const proc = await sbx.exec(["bash", "-lc", command], {
        mode: "text",
        timeoutMs: opts?.timeoutMs,
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        proc.stdout.readText(),
        proc.stderr.readText(),
        proc.wait(),
      ]);
      return { exitCode, stdout, stderr, durationMs: Date.now() - t0, timedOut: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        exitCode: 1,
        stdout: "",
        stderr: msg.slice(0, 300),
        durationMs: Date.now() - t0,
        timedOut: /timeout/i.test(msg),
      };
    }
  }

  async terminate(handle: SandboxHandle): Promise<void> {
    await this.byId.get(handle.id)?.terminate();
  }

  async isAbsent(handle: SandboxHandle): Promise<boolean> {
    const listed: string[] = [];
    for await (const s of this.client.sandboxes.list()) listed.push(s.sandboxId);
    return !listed.includes(handle.id);
  }
}
