// 6.3/6.5 — CYCLE RÉEL PHASE 6 : le runner de pipeline PROVIDER-AGNOSTIC du
// moteur (`@deribfy/sandbox`) joue le pipeline §8 sur l'app témoin RÉELLE
// dans un sandbox Modal (adaptateur injecté). Puis :
//  - 6.3 : pipeline install→typecheck→bundle vert dans le sandbox, temps
//    par étape mesurés, teardown prouvé ;
//  - Oracle L1 (moteur) exécuté sur l'AIR témoin (verdict déterministe) ;
//  - 6.5 : preuve « sandbox SANS SECRETS » par tentative (aucun secret
//    injecté → lecture env/metadata = vide/refus).
// Secrets Modal hors dépôt (600), jamais journalisés. Budget : crédits.
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
// Runner + contrat = MOTEUR (provider-agnostic), importés par chemin direct.
const { runPipeline, defaultPipeline } = await import(join(REPO, "packages/sandbox/src/index.ts"));
const { runOracleLevel1 } = await import(join(REPO, "packages/oracle/src/index.ts"));
const { compileProject } = await import(join(REPO, "packages/compiler/src/compile-project.ts"));
const { ModalSandboxProvider } = await import(join(HERE, "modal-adapter.mjs"));

const LOG = join(HERE, "results", `phase6-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
mkdirSync(join(HERE, "results"), { recursive: true });
const log = (o) => { appendFileSync(LOG, JSON.stringify(o) + "\n"); console.log(JSON.stringify(o)); };

const ENV = join(homedir(), ".deribfy-sandbox-bench.env");
if ((statSync(ENV).mode & 0o777) !== 0o600) throw new Error("env ≠ 600");
const env = readFileSync(ENV, "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();

const { ModalClient } = await import("modal");
const client = new ModalClient({ tokenId: get("MODAL_TOKEN_ID"), tokenSecret: get("MODAL_TOKEN_SECRET") });
const app = await client.apps.fromName("deribfy-phase6", { createIfMissing: true });
const image = await client.images.fromRegistry("node:24-bookworm-slim");
const provider = new ModalSandboxProvider({ client, app, image });

// --- Fixture = app témoin RÉELLE compilée (resto-quartier).
const air = JSON.parse(readFileSync(join(REPO, "packages/golden-corpus/corpus-v2/resto-quartier.air.json"), "utf8"));
const compiled = compileProject(air);
log({ etape: "compile", rootHash: compiled.rootHash, fichiers: compiled.files.size });

// Empaqueter le projet compilé -> un seul tar uploadé, extrait en /tmp/build.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync as rf } from "node:fs";
const stage = mkdtempSync(join(homedir(), ".p6-"));
for (const [rel, content] of compiled.files) {
  mkdirSync(join(stage, dirname(rel)), { recursive: true });
  writeFileSync(join(stage, rel), content);
}
const tgz = join(stage, "..", "p6-fixture.tgz");
execFileSync("tar", ["czf", tgz, "-C", stage, "."]);
const bytes = new Uint8Array(rf(tgz));

// --- 6.3 : pipeline §8 dans le sandbox, via le runner AGNOSTIQUE.
const spec = {
  label: "temoin-resto",
  network: { mode: "allowlist", domains: ["registry.npmjs.org", "*.npmjs.org"] },
  vcpu: 2,
  memoryMiB: 4096,
  timeoutMs: 600_000,
};
const files = [{ path: "/tmp/fixture.tgz", bytes }];
const steps = [
  { name: "extract", command: "mkdir -p /tmp/build && tar xzf /tmp/fixture.tgz -C /tmp/build" },
  ...defaultPipeline("/tmp/build"),
];
const report = await runPipeline(provider, spec, files, steps);
log({ etape: "6.3-pipeline", ok: report.ok, failedStep: report.failedStep, teardownProved: report.teardownProved, totalMs: report.totalDurationMs, steps: report.steps });

// --- Oracle L1 (moteur) sur l'AIR témoin.
const verdict = runOracleLevel1(air, compiled.rootHash);
log({ etape: "oracle-L1", passed: verdict.passed, checks: verdict.checks });

// --- 6.5 : « sandbox SANS SECRETS » par tentative (aucun secret injecté).
const h = await provider.create({ label: "secrets", network: { mode: "block_all" }, vcpu: 1, memoryMiB: 1024, timeoutMs: 120_000 });
// Motifs de VRAIS secrets (une affectation `*TOKEN=`, `*SECRET=`,
// `*API_KEY=`, `*PASSWORD=`, `*CREDENTIAL=`). MODAL_IMAGE_ID (identifiant
// d'image, métadonnée publique) est volontairement EXCLU — ce n'est pas un
// secret. La preuve §8 est l'absence de nos jetons/identifiants.
const envProbe = await provider.exec(h, "env | grep -iE '(TOKEN|SECRET|API_KEY|PASSWORD|CREDENTIAL)=' || echo NONE", { timeoutMs: 20_000 });
const metaProbe = await provider.exec(h, "curl -sS -m 5 -o /dev/null -w '%{http_code}' http://169.254.169.254/ || echo BLOCKED", { timeoutMs: 20_000 });
await provider.terminate(h);
const secretsAbsent = /NONE/.test(envProbe.stdout) && !/MODAL_TOKEN|API_KEY|SUPABASE/.test(envProbe.stdout);
const absent2 = await provider.isAbsent(h);
log({ etape: "6.5-sans-secrets", envProbe: envProbe.stdout.trim().slice(0, 40), metaProbe: (metaProbe.stdout || metaProbe.stderr).trim().slice(-12), secretsAbsent, teardownProved: absent2 });

const globalOk = report.ok && report.teardownProved && verdict.passed && secretsAbsent && absent2;
log({ VERDICT: globalOk ? "PHASE 6.3+6.5 : VERT" : "ÉCHEC", journal: LOG });
try { client.close(); } catch { /* best-effort */ }
process.exitCode = globalOk ? 0 : 1;
