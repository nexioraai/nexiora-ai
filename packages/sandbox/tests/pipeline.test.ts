// RUNNER DE PIPELINE (6.1) — logique testée sur provider FACTICE (aucune
// dépense, aucun réseau) : succès, fail-fast, teardown TOUJOURS, preuve
// d'absence, upload.
import { describe, expect, it } from "vitest";
import { defaultPipeline, runPipeline } from "../src/index.ts";
import type { ExecOptions, SandboxHandle, SandboxSpec, UploadEntry } from "../src/index.ts";
import { FakeProvider } from "./fake-provider.ts";

const SPEC: SandboxSpec = {
  label: "test",
  network: { mode: "allowlist", domains: ["registry.npmjs.org"] },
  timeoutMs: 60_000,
};
const FILES: readonly UploadEntry[] = [{ path: "app/x", bytes: new Uint8Array([1, 2, 3]) }];
const STEPS = defaultPipeline("/tmp/build");

describe("runPipeline (provider agnostique)", () => {
  it("pipeline vert : toutes les étapes exit 0, teardown prouvé", async () => {
    const p = new FakeProvider();
    const r = await runPipeline(p, SPEC, FILES, STEPS);
    expect(r.ok).toBe(true);
    expect(r.failedStep).toBeNull();
    expect(r.steps.map((s) => s.name)).toEqual(["npm_ci", "typecheck", "bundle"]);
    expect(r.teardownProved).toBe(true);
    expect(p.terminated).toEqual(p.created); // détruit ce qu'il a créé
    expect(p.uploaded.get(r.sandboxId)).toBe(1);
  });

  it("fail-fast : s'arrête à l'étape en échec, mais TERMINE quand même", async () => {
    const p = new FakeProvider({ "tsc --noEmit": { exitCode: 2, stderr: "TS error" } });
    const r = await runPipeline(p, SPEC, FILES, STEPS);
    expect(r.ok).toBe(false);
    expect(r.failedStep).toBe("typecheck");
    expect(r.steps).toHaveLength(2); // npm_ci puis typecheck, bundle jamais atteint
    expect(r.failureStderr).toContain("TS error");
    expect(r.teardownProved).toBe(true); // destruction garantie même en échec
  });

  it("destruction garantie même si une étape LÈVE (finally)", async () => {
    const p = new FakeProvider();
    const orig = p.exec.bind(p);
    let calls = 0;
    p.exec = (h: SandboxHandle, c: string, o?: ExecOptions) => {
      calls += 1;
      if (calls === 1) throw new Error("réseau interrompu");
      return orig(h, c, o);
    };
    await expect(runPipeline(p, SPEC, FILES, STEPS)).rejects.toThrow();
    expect(p.terminated).toEqual(p.created); // terminé malgré l'exception
  });
});
