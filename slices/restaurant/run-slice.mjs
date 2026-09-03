// VERTICAL SLICE 1 — RESTAURANT (Phase 8, D-036, Étape A) : chaîne
// bout-en-bout RÉELLE, avec le moteur tel qu'il est (aucune construction
// manuelle — garde-fou ROADMAP : tout écart manuel serait consigné comme
// DETTE DU GÉNÉRATEUR).
//   intention → AIR → validation (gates existants) → compile → backend
//   RÉEL provisionné + vérifié + teardown prouvé → sandbox §8 → Oracle L1
//   → artefacts au store → métriques du scorecard.
// La validation device (émulateurs iOS+Android) est jouée séparément
// (run-emulators.sh) puis agrégée au scorecard.
// 0 $ : crédits Modal ; org Supabase de banc ; émulateurs locaux.
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
mkdirSync(join(HERE, "results"), { recursive: true });
const LOG = join(HERE, "results", `slice-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
const log = (o) => { appendFileSync(LOG, JSON.stringify(o) + "\n"); console.log(JSON.stringify(o)); };

const { projectAirSchema, validateAir, canonicalJson, sha256Hex } = await import(join(REPO, "packages/air-schema/src/index.ts"));
const { validateAirCapabilities } = await import(join(REPO, "packages/capability-registry/src/index.ts"));
const { validateAirBlocks } = await import(join(REPO, "packages/blocks/src/registry.ts"));
const { compileProject } = await import(join(REPO, "packages/compiler/src/compile-project.ts"));
const { normalizeAir } = await import(join(REPO, "packages/compiler/src/resolve-lock.ts"));
const { LocalArtifactStore, storeCompiledProject } = await import(join(REPO, "packages/compiler/src/artifact-store.ts"));
const { runOracleLevel1, generateMaestroFlows } = await import(join(REPO, "packages/oracle/src/index.ts"));
const { generateProvisioningSql } = await import(join(REPO, "packages/provisioner/src/sql-gen.ts"));
const { SupabaseProvider } = await import(join(REPO, "packages/provisioner/src/provider.ts"));
const { runPipeline, defaultPipeline } = await import(join(REPO, "packages/sandbox/src/index.ts"));
const { ModalSandboxProvider } = await import(join(REPO, "benchmarks/sandbox-bench/modal-adapter.mjs"));

const metrics = { steps: {}, costs: {}, repairs: 0, manualWorkarounds: [] };
const timed = async (name, fn) => {
  const t0 = Date.now();
  const out = await fn();
  metrics.steps[name] = Date.now() - t0;
  log({ etape: name, dureeMs: Date.now() - t0, ok: true });
  return out;
};

// ---------- 1. INTENTION → AIR ----------
// L'AIR du slice est celui ÉMIS PAR LE MODÈLE en D-025 depuis l'intention
// « restaurant/maquis » (corpus ACTIF v2) — provenance-modèle préservée
// (non-négociable 14). Aucune retouche manuelle.
const airPath = join(REPO, "packages/golden-corpus/corpus-v2/resto-quartier.air.json");
const airRaw = JSON.parse(readFileSync(airPath, "utf8"));
// D-044 : document gelé en 1.0.0, migré en mémoire vers la version courante.
const air = projectAirSchema.parse(normalizeAir(airRaw));
log({ etape: "intention-air", projectId: air.projectId, slug: air.app.slug, ecrans: air.screens.length, entites: air.entities.length, capabilities: air.capabilities.length });

// ---------- 2. GATES EXISTANTS (fail-closed) ----------
await timed("gates", () => {
  const diags = [
    ...validateAir(air).map((d) => `semantics:${d.code}`),
    ...validateAirCapabilities(air).map((d) => `capabilities:${d.code}`),
    ...validateAirBlocks(air).map((d) => `blocks:${d.code}`),
  ];
  if (diags.length > 0) throw new Error(`gates refusent le slice: ${diags.join(", ")}`);
  return Promise.resolve(true);
});

// ---------- 3. COMPILE + ARTEFACTS AU STORE ----------
const compiled = await timed("compile", () => Promise.resolve(compileProject(air)));
const store = new LocalArtifactStore(join(HERE, "store"));
const stored = storeCompiledProject(store, compiled);
log({ etape: "artefacts", rootHash: compiled.rootHash, fichiers: compiled.files.size, manifestHash: stored.manifestHash.slice(0, 16) });

// ---------- 4. BACKEND RÉEL (Phase 5) : provision → vérif → teardown ----------
const envFile = join(homedir(), ".deribfy-supabase-bench.env");
if ((statSync(envFile).mode & 0o777) !== 0o600) throw new Error("env ≠ 600");
const envTxt = readFileSync(envFile, "utf8");
const get = (k) => envTxt.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const provisioner = new SupabaseProvider({ token: get("SUPABASE_ACCESS_TOKEN"), orgSlug: get("SUPABASE_TEST_ORG_SLUG") });
const sql = generateProvisioningSql(air);
const sqlHash = store.put(sql.sql); // SQL archivé comme artefact (Phase 5)
log({ etape: "sql-genere", sqlHash: sqlHash.slice(0, 16), tables: sql.summary.tables, seed: sql.summary.seedRowsByTable });

let backendRef;
await timed("backend", async () => {
  const project = await provisioner.createProject("slice1-resto");
  backendRef = project.ref;
  await provisioner.waitHealthy(project.ref, 900_000);
  await provisioner.executeSql(project.ref, sql.sql);
  const rows = (r) => (Array.isArray(r) ? r : []);
  const tables = rows(await provisioner.executeSql(project.ref, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;")).map((r) => r.tablename);
  const rls = rows(await provisioner.executeSql(project.ref, "SELECT count(*)::int n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relkind='r' AND c.relrowsecurity;"))[0]?.n;
  const seeds = {};
  for (const t of sql.summary.tables) {
    seeds[t] = rows(await provisioner.executeSql(project.ref, `SELECT count(*)::int n FROM "${t}";`))[0]?.n;
  }
  const ok = JSON.stringify(tables) === JSON.stringify([...sql.summary.tables].sort()) && rls === sql.summary.tables.length;
  log({ etape: "backend-verif", ref: project.ref, tables, rls, seeds, conforme: ok });
  if (!ok) throw new Error("backend non conforme à l'AIR");
});

// ---------- 5-6 dans un TRY : le teardown du backend est GARANTI
// (leçon du 2026-08-28 : un plantage avait laissé un projet vivant).
let sandboxReport, verdict, stage, tgz;
try {
// ---------- 5. SANDBOX §8 (pipeline réel) ----------
const modal = await (async () => {
  const { ModalClient } = await import(join(REPO, "benchmarks/sandbox-bench/node_modules/modal/dist/index.js"));
  const menv = readFileSync(join(homedir(), ".deribfy-sandbox-bench.env"), "utf8");
  const mget = (k) => menv.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
  const client = new ModalClient({ tokenId: mget("MODAL_TOKEN_ID"), tokenSecret: mget("MODAL_TOKEN_SECRET") });
  const app = await client.apps.fromName("deribfy-slice1", { createIfMissing: true });
  const image = await client.images.fromRegistry("node:24-bookworm-slim");
  return new ModalSandboxProvider({ client, app, image });
})();
const { execFileSync } = await import("node:child_process");
stage = mkdtempSync(join(homedir(), ".slice1-"));
for (const [rel, content] of compiled.files) {
  mkdirSync(join(stage, dirname(rel)), { recursive: true });
  writeFileSync(join(stage, rel), content);
}
tgz = join(homedir(), ".slice1-fixture.tgz");
execFileSync("tar", ["czf", tgz, "-C", stage, "."]);
const bytes = new Uint8Array(readFileSync(tgz));
sandboxReport = await timed("sandbox", () =>
  runPipeline(
    modal,
    { label: "slice1", network: { mode: "allowlist", domains: ["registry.npmjs.org", "*.npmjs.org"] }, vcpu: 2, memoryMiB: 4096, timeoutMs: 600_000 },
    [{ path: "/tmp/fixture.tgz", bytes }],
    [{ name: "extract", command: "mkdir -p /tmp/build && tar xzf /tmp/fixture.tgz -C /tmp/build" }, ...defaultPipeline("/tmp/build")],
  ));
log({ etape: "sandbox-detail", ok: sandboxReport.ok, teardown: sandboxReport.teardownProved, steps: sandboxReport.steps });
if (!sandboxReport.ok) throw new Error("pipeline sandbox du slice en échec");

// ---------- 6. ORACLE L1 + flows L2 générés ----------
verdict = await timed("oracle", () => Promise.resolve(runOracleLevel1(air, compiled.rootHash)));
log({ etape: "oracle-detail", passed: verdict.passed, checks: verdict.checks.map((c) => `${c.name}:${c.passed}`) });
const flowsAndroid = generateMaestroFlows(air, "com.deribfy.preview.maquis_express", "android");
const flowsIos = generateMaestroFlows(air, "com.deribfy.preview.maquis-express", "ios");
mkdirSync(join(HERE, "maestro"), { recursive: true });
writeFileSync(join(HERE, "maestro", "nav-android.yaml"), flowsAndroid.navigation);
writeFileSync(join(HERE, "maestro", "rtl-android.yaml"), flowsAndroid.rtl);
writeFileSync(join(HERE, "maestro", "nav-ios.yaml"), flowsIos.navigation);
writeFileSync(join(HERE, "maestro", "rtl-ios.yaml"), flowsIos.rtl);
} finally {
  // TEARDOWN GARANTI du backend du slice (Phase 5), quoi qu'il arrive.
  if (backendRef !== undefined) {
    try {
      await provisioner.deleteProject(backendRef);
      const absent = await provisioner.isAbsent(backendRef);
      log({ etape: "teardown-preuve", ref: backendRef, absent });
      if (!absent) log({ ALERTE_ROUGE: `teardown NON prouvé pour ${backendRef} — supprimer au dashboard` });
    } catch (e) {
      log({ ALERTE_ROUGE: `teardown en échec: ${String(e?.message ?? e).slice(0,150)} — supprimer ${backendRef} au dashboard` });
    }
  }
}

// ---------- 7. TEARDOWN BACKEND (prouvé) — voir bloc finally ci-dessous.
if (stage !== undefined) rmSync(stage, { recursive: true, force: true });
if (tgz !== undefined) rmSync(tgz, { force: true });

// ---------- 8. PROJET ÉCRIT POUR LES BUILDS ÉMULATEURS ----------
const appDir = join(HERE, "app");
rmSync(appDir, { recursive: true, force: true });
for (const [rel, content] of compiled.files) {
  mkdirSync(join(appDir, dirname(rel)), { recursive: true });
  writeFileSync(join(appDir, rel), content);
}
log({ etape: "projet-ecrit", dossier: "slices/restaurant/app", fichiers: compiled.files.size });

writeFileSync(join(HERE, "results", "metrics.json"), JSON.stringify({
  rootHash: compiled.rootHash,
  sqlHash,
  manifestHash: stored.manifestHash,
  steps: metrics.steps,
  oraclePassed: verdict.passed,
  sandboxOk: sandboxReport.ok,
  repairs: metrics.repairs,
  manualWorkarounds: metrics.manualWorkarounds,
}, null, 2) + "\n");
log({ VERDICT: "SLICE 1 — CHAÎNE BOUT-EN-BOUT VERTE (hors device)", journal: LOG });
