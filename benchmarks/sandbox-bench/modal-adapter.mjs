// ADAPTATEUR MODAL (6.3, D-033/D-034) — implémente le contrat
// `SandboxProvider` de `@deribfy/sandbox` en s'appuyant sur le SDK `modal`.
// C'est le SEUL point qui connaît Modal ; il est INJECTÉ dans le runner de
// pipeline provider-agnostic du moteur. Le remplacer par un adaptateur E2B
// ne toucherait pas le cœur (cliquet provider-agnostic vert).
// Réside HORS des workspaces (harnais de banc) : le monorepo reste sans
// dépendance à `modal`. Normalise exec (Modal ne lève pas ; timeout géré).
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export class ModalSandboxProvider {
  name = "modal";

  constructor({ client, app, image }) {
    this._client = client;
    this._app = app;
    this._image = image;
  }

  async create(spec) {
    const params = {
      timeoutMs: spec.timeoutMs,
      cpu: spec.vcpu ?? 2,
      memoryMiB: spec.memoryMiB ?? 4096,
    };
    // Politique réseau (§8) mappée sur les primitives Modal.
    if (spec.network.mode === "block_all") {
      params.blockNetwork = true;
    } else if (spec.network.mode === "allowlist") {
      params.outboundDomainAllowlist = [...spec.network.domains];
    }
    const sbx = await this._client.sandboxes.create(this._app, this._image, params);
    this._byId ??= new Map();
    this._byId.set(sbx.sandboxId, sbx);
    return { id: sbx.sandboxId };
  }

  async upload(handle, files) {
    const sbx = this._byId.get(handle.id);
    for (const f of files) {
      const local = join(tmpdir(), `up-${randomBytes(6).toString("hex")}`);
      writeFileSync(local, Buffer.from(f.bytes));
      await sbx.filesystem.copyFromLocal(local, f.path);
    }
  }

  async exec(handle, command, opts) {
    const sbx = this._byId.get(handle.id);
    const t0 = Date.now();
    let timedOut = false;
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
      return { exitCode, stdout, stderr, durationMs: Date.now() - t0, timedOut };
    } catch (e) {
      timedOut = /timeout/i.test(String(e?.message ?? e));
      return {
        exitCode: 1,
        stdout: "",
        stderr: String(e?.message ?? e).slice(0, 300),
        durationMs: Date.now() - t0,
        timedOut,
      };
    }
  }

  async terminate(handle) {
    const sbx = this._byId.get(handle.id);
    if (sbx !== undefined) await sbx.terminate();
  }

  async isAbsent(handle) {
    const listed = [];
    for await (const s of this._client.sandboxes.list()) listed.push(s.sandboxId);
    return !listed.includes(handle.id);
  }
}
