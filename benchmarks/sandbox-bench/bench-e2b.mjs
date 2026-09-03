// P-002 BANC — ADAPTATEUR E2B (E1-E5). Journaux JSONL versionnés.
// Secrets : ~/.deribfy-sandbox-bench.env (600), jamais journalisés.
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  EGRESS_PROBES,
  HERE,
  PIPELINE,
  SECRET_PROBES,
  fixtureBytes,
  parseCode,
} from "./bench-lib.mjs";

mkdirSync(join(HERE, "results"), { recursive: true });
const LOG = join(HERE, "results", "e2b-bench.jsonl");
const log = (o) => {
  appendFileSync(LOG, JSON.stringify({ provider: "e2b", ...o }) + "\n");
  console.log(JSON.stringify({ provider: "e2b", ...o }));
};

const FILE = join(homedir(), ".deribfy-sandbox-bench.env");
if ((statSync(FILE).mode & 0o777) !== 0o600) throw new Error("env ≠ 600");
const apiKey = readFileSync(FILE, "utf8").match(/^E2B_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) throw new Error("E2B_API_KEY absente");

const { Sandbox } = await import("e2b");
const TIMEOUT = 600_000;

// E2B `commands.run` LÈVE sur exit≠0 [mesuré] — on normalise en
// {exitCode, stdout, stderr} pour que le harnais récupère la vraie cause
// au lieu d'un throw opaque.
async function sh(sbx, cmd, timeoutMs = TIMEOUT) {
  try {
    const r = await sbx.commands.run(cmd, { timeoutMs });
    return { exitCode: r.exitCode, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  } catch (e) {
    return {
      exitCode: typeof e?.exitCode === "number" ? e.exitCode : 1,
      stdout: e?.result?.stdout ?? "",
      stderr: String(e?.result?.stderr ?? e?.message ?? "").slice(0, 300),
    };
  }
}

async function uploadFixture(sbx) {
  const bytes = fixtureBytes();
  await sbx.files.write("/tmp/fixture.tgz", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

// ===== E1 — pipeline complet (cold), N runs, temps par étape =====
async function e1(n) {
  for (let run = 1; run <= n; run += 1) {
    let sbx;
    try {
      const t0 = Date.now();
      sbx = await Sandbox.create({ apiKey, timeoutMs: TIMEOUT });
      const coldMs = Date.now() - t0;
      await uploadFixture(sbx);
      const steps = {};
      let ok = true;
      for (const step of PIPELINE) {
        const s0 = Date.now();
        const r = await sh(sbx, step.cmd);
        steps[step.name] = { ms: Date.now() - s0, exit: r.exitCode };
        if (r.exitCode !== 0) {
          ok = false;
          log({ epreuve: "E1", run, echecEtape: step.name, stderr: String(r.stderr).slice(0, 200) });
          break;
        }
      }
      log({ epreuve: "E1", run, coldStartMs: coldMs, steps, ok });
    } catch (e) {
      log({ epreuve: "E1", run, ERREUR: String(e?.message ?? e).slice(0, 200) });
    } finally {
      if (sbx !== undefined) await sbx.kill();
    }
  }
}

// ===== E2 — cache npm inter-jobs (même sandbox, npm ci répété) =====
async function e2() {
  let sbx;
  try {
    sbx = await Sandbox.create({ apiKey, timeoutMs: TIMEOUT });
    await uploadFixture(sbx);
    await sh(sbx, PIPELINE[0].cmd); // extract
    const timings = [];
    for (let i = 1; i <= 3; i += 1) {
      await sh(sbx, "rm -rf /tmp/build/node_modules");
      const s0 = Date.now();
      const r = await sh(sbx, PIPELINE[2].cmd); // npm ci
      timings.push({ i, ms: Date.now() - s0, exit: r.exitCode });
    }
    log({ epreuve: "E2", mecanisme: "cache npm ~/.npm dans la même sandbox", timings });
  } catch (e) {
    log({ epreuve: "E2", ERREUR: String(e?.message ?? e).slice(0, 200) });
  } finally {
    if (sbx !== undefined) await sbx.kill();
  }
}

// ===== E3 — egress par tentative (allowlist registre npm) =====
async function e3() {
  // Sans accès internet du tout : tout accès sortant doit être BLOQUÉ.
  let sbx;
  try {
    sbx = await Sandbox.create({ apiKey, timeoutMs: TIMEOUT, allowInternetAccess: false });
    const results = [];
    for (const probe of EGRESS_PROBES) {
      const r = await sh(sbx, probe.cmd, 30_000);
      results.push({ probe: probe.name, code: parseCode(r.stdout || r.stderr) });
    }
    const tousBloques = results.every((r) => r.code === "BLOCKED" || /^0/.test(r.code));
    log({ epreuve: "E3", mode: "allowInternetAccess=false", results, tousBloques });
  } catch (e) {
    log({ epreuve: "E3", ERREUR: String(e?.message ?? e).slice(0, 200) });
  } finally {
    if (sbx !== undefined) await sbx.kill();
  }
}

// ===== E4 — secrets par tentative (aucun secret injecté) =====
async function e4() {
  let sbx;
  try {
    sbx = await Sandbox.create({ apiKey, timeoutMs: TIMEOUT });
    const results = [];
    for (const probe of SECRET_PROBES) {
      const r = await sh(sbx, probe.cmd, 20_000);
      results.push({ probe: probe.name, out: parseCode(r.stdout || r.stderr) });
    }
    const propre = results.every((r) => r.out === "NONE" || r.out === "BLOCKED" || /^0/.test(r.out) || r.out === "401" || r.out === "403");
    log({ epreuve: "E4", results, aucunSecretLisible: propre });
  } catch (e) {
    log({ epreuve: "E4", ERREUR: String(e?.message ?? e).slice(0, 200) });
  } finally {
    if (sbx !== undefined) await sbx.kill();
  }
}

// ===== E5 — lifecycle : création/destruction ×N, zéro orphelin =====
async function e5(n) {
  const ids = [];
  let allKilled = true;
  for (let i = 0; i < n; i += 1) {
    const sbx = await Sandbox.create({ apiKey, timeoutMs: 60_000 });
    ids.push(sbx.sandboxId);
    await sbx.kill();
  }
  const paginator = Sandbox.list({ apiKey });
  const running = await paginator.nextItems();
  const orphelins = ids.filter((id) => running.some((s) => s.sandboxId === id));
  allKilled = orphelins.length === 0;
  log({ epreuve: "E5", crees: n, actifsRestants: running.length, orphelins: orphelins.length, zeroOrphelin: allKilled });
}

log({ debut: true, ts_local: process.env.BENCH_TS ?? "n/a" });
await e1(3);
await e2();
await e3();
await e4();
await e5(20);
log({ fin: true });
