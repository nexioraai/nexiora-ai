// P-002 BANC — ADAPTATEUR MODAL (E1-E5). Symétrique de bench-e2b.mjs.
// Image node:24-bookworm-slim (node 24 + npm ; curl/tar présents).
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import {
  EGRESS_PROBES,
  HERE,
  PIPELINE,
  SECRET_PROBES,
  fixtureBytes,
  parseCode,
} from "./bench-lib.mjs";

mkdirSync(join(HERE, "results"), { recursive: true });
const LOG = join(HERE, "results", "modal-bench.jsonl");
const log = (o) => {
  appendFileSync(LOG, JSON.stringify({ provider: "modal", ...o }) + "\n");
  console.log(JSON.stringify({ provider: "modal", ...o }));
};

const FILE = join(homedir(), ".deribfy-sandbox-bench.env");
if ((statSync(FILE).mode & 0o777) !== 0o600) throw new Error("env ≠ 600");
const env = readFileSync(FILE, "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const tokenId = get("MODAL_TOKEN_ID");
const tokenSecret = get("MODAL_TOKEN_SECRET");
if (!tokenId || !tokenSecret) throw new Error("tokens Modal absents");

const { ModalClient } = await import("modal");
const client = new ModalClient({ tokenId, tokenSecret });
const app = await client.apps.fromName("deribfy-p002-bench", { createIfMissing: true });
const IMAGE = await client.images.fromRegistry("node:24-bookworm-slim");
const LOCAL_TGZ = join(tmpdir(), "deribfy-fixture.tgz");
writeFileSync(LOCAL_TGZ, fixtureBytes());

async function exec(sbx, cmd, timeoutMs = 600_000) {
  const proc = await sbx.exec(["bash", "-lc", cmd], { mode: "text", timeoutMs });
  const [stdout, stderr, exit] = await Promise.all([
    proc.stdout.readText(),
    proc.stderr.readText(),
    proc.wait(),
  ]);
  return { stdout, stderr, exitCode: exit };
}

async function uploadFixture(sbx) {
  await sbx.filesystem.copyFromLocal(LOCAL_TGZ, "/tmp/fixture.tgz");
}

async function e1(n) {
  for (let run = 1; run <= n; run += 1) {
    let sbx;
    try {
      const t0 = Date.now();
      sbx = await client.sandboxes.create(app, IMAGE, { timeoutMs: 600_000, cpu: 2, memoryMiB: 4096 });
      const coldMs = Date.now() - t0;
      await uploadFixture(sbx);
      const steps = {};
      let ok = true;
      for (const step of PIPELINE) {
        const s0 = Date.now();
        const r = await exec(sbx, step.cmd);
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
      if (sbx !== undefined) await sbx.terminate();
    }
  }
}

async function e2() {
  let sbx;
  try {
    sbx = await client.sandboxes.create(app, IMAGE, { timeoutMs: 600_000, cpu: 2, memoryMiB: 4096 });
    await uploadFixture(sbx);
    await exec(sbx, PIPELINE[0].cmd);
    const timings = [];
    for (let i = 1; i <= 3; i += 1) {
      await exec(sbx, "rm -rf /tmp/build/node_modules");
      const s0 = Date.now();
      const r = await exec(sbx, PIPELINE[2].cmd);
      timings.push({ i, ms: Date.now() - s0, exit: r.exitCode });
    }
    log({ epreuve: "E2", mecanisme: "cache npm ~/.npm dans la même sandbox", timings });
  } catch (e) {
    log({ epreuve: "E2", ERREUR: String(e?.message ?? e).slice(0, 200) });
  } finally {
    if (sbx !== undefined) await sbx.terminate();
  }
}

async function e3() {
  let sbx;
  try {
    sbx = await client.sandboxes.create(app, IMAGE, { timeoutMs: 300_000, cpu: 1, memoryMiB: 1024, blockNetwork: true });
    const results = [];
    for (const probe of EGRESS_PROBES) {
      const r = await exec(sbx, probe.cmd, 30_000);
      results.push({ probe: probe.name, code: parseCode(r.stdout || r.stderr) });
    }
    const tousBloques = results.every((r) => r.code === "BLOCKED" || /^0/.test(r.code));
    log({ epreuve: "E3", mode: "blockNetwork=true", results, tousBloques });
  } catch (e) {
    log({ epreuve: "E3", ERREUR: String(e?.message ?? e).slice(0, 200) });
  } finally {
    if (sbx !== undefined) await sbx.terminate();
  }
}

async function e4() {
  let sbx;
  try {
    sbx = await client.sandboxes.create(app, IMAGE, { timeoutMs: 120_000, cpu: 1, memoryMiB: 1024 });
    const results = [];
    for (const probe of SECRET_PROBES) {
      const r = await exec(sbx, probe.cmd, 20_000);
      results.push({ probe: probe.name, out: parseCode(r.stdout || r.stderr) });
    }
    const propre = results.every((r) => r.out === "NONE" || r.out === "BLOCKED" || /^0/.test(r.out) || r.out === "401" || r.out === "403");
    log({ epreuve: "E4", results, aucunSecretLisible: propre });
  } catch (e) {
    log({ epreuve: "E4", ERREUR: String(e?.message ?? e).slice(0, 200) });
  } finally {
    if (sbx !== undefined) await sbx.terminate();
  }
}

async function e5(n) {
  const ids = [];
  for (let i = 0; i < n; i += 1) {
    const sbx = await client.sandboxes.create(app, IMAGE, { timeoutMs: 60_000, cpu: 1, memoryMiB: 512 });
    ids.push(sbx.sandboxId);
    await sbx.terminate();
  }
  const listed = [];
  for await (const s of client.sandboxes.list()) listed.push(s.sandboxId);
  const orphelins = ids.filter((id) => listed.includes(id));
  log({ epreuve: "E5", crees: n, actifsRestants: listed.length, orphelins: orphelins.length, zeroOrphelin: orphelins.length === 0 });
}

log({ debut: true });
await e1(3);
await e2();
await e3();
await e4();
await e5(20);
try { client.close(); } catch { /* best-effort */ }
log({ fin: true });
