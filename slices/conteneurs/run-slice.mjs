// VERTICAL SLICE 2 — SUIVI DE CONTENEURS MARITIMES (Phase 10, D-042).
// Domaine HORS-TEMPLATE. Chaîne bout-en-bout RÉELLE, avec le moteur tel
// qu'il est — aucun écart construit à la main (garde-fou ROADMAP : tout
// contournement manuel est consigné comme DETTE DU GÉNÉRATEUR).
//   AIR (émis par le modèle, protocole D-025) → gates → compile → backend
//   RÉEL provisionné/vérifié/démonté → sandbox §8 → Oracle L1 → flows E2E
//   → grille A++ → dimension H sur les DEUX slices.
// Différence assumée avec le slice 1 : le backend passe désormais par
// l'ABSTRACTION PROVIDER de la Phase 10 (`runProvisioning`), pas par une
// orchestration écrite dans le script — c'est ce qui « exerce » l'interface.
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
mkdirSync(join(HERE, "results"), { recursive: true });
const LOG = join(HERE, "results", `slice2-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
const log = (o) => { appendFileSync(LOG, JSON.stringify(o) + "\n"); console.log(JSON.stringify(o)); };

const { projectAirSchema, validateAir } = await import(join(REPO, "packages/air-schema/src/index.ts"));
const { validateAirCapabilities } = await import(join(REPO, "packages/capability-registry/src/index.ts"));
const { validateAirBlocks } = await import(join(REPO, "packages/blocks/src/registry.ts"));
const { compileProject, previewIdentity, normalizeAir } = await import(join(REPO, "packages/compiler/src/index.ts"));
const { LocalArtifactStore, storeCompiledProject } = await import(join(REPO, "packages/compiler/src/artifact-store.ts"));
const { runOracleLevel1, generateMaestroFlows, evaluateApxxGrid, evaluateAntiTemplate } =
  await import(join(REPO, "packages/oracle/src/index.ts"));
const { generateProvisioningSql, SupabaseProvider, runProvisioning } =
  await import(join(REPO, "packages/provisioner/src/index.ts"));
const { runPipeline, defaultPipeline } = await import(join(REPO, "packages/sandbox/src/index.ts"));
const { ModalSandboxProvider } = await import(join(REPO, "benchmarks/sandbox-bench/modal-adapter.mjs"));

const metrics = { steps: {}, repairs: 0, manualWorkarounds: [] };
const timed = async (name, fn) => {
  const t0 = Date.now();
  const out = await fn();
  metrics.steps[name] = Date.now() - t0;
  log({ etape: name, dureeMs: Date.now() - t0, ok: true });
  return out;
};

// ---------- 1. AIR ÉMIS PAR LE MODÈLE (provenance préservée) ----------
const airPath = join(HERE, "air", "suivi-conteneurs.air.json");
const air = projectAirSchema.parse(normalizeAir(JSON.parse(readFileSync(airPath, "utf8"))));
log({ etape: "air", projectId: air.projectId, slug: air.app.slug, theme: air.design.theme,
      ecrans: air.screens.length, entites: air.entities.length, capabilities: air.capabilities.map(c=>c.capability),
      slots: air.slots.length, actions: air.actions.length });

// ---------- 2. GATES (fail-closed) ----------
await timed("gates", () => {
  const diags = [
    ...validateAir(air).map((d) => `semantics:${d.code}`),
    ...validateAirCapabilities(air).map((d) => `capabilities:${d.code}`),
    ...validateAirBlocks(air).map((d) => `blocks:${d.code}`),
  ];
  if (diags.length > 0) throw new Error(`gates refusent le slice 2 : ${diags.join(", ")}`);
  return Promise.resolve(true);
});

// ---------- 3. COMPILE + ARTEFACTS ----------
const compiled = await timed("compile", () => Promise.resolve(compileProject(air)));
const store = new LocalArtifactStore(join(HERE, "store"));
const stored = storeCompiledProject(store, compiled);
const hashes = Array.from({ length: 5 }, () => compileProject(air).rootHash);
log({ etape: "artefacts", rootHash: compiled.rootHash, fichiers: compiled.files.size,
      manifestHash: stored.manifestHash.slice(0, 16), determinisme: `${new Set(hashes).size === 1 ? "5/5" : "INSTABLE"}`,
      providers: compiled.lock.resolved.providers });
if (new Set(hashes).size !== 1) throw new Error("compilation non déterministe");

// ---------- 4. BACKEND RÉEL via l'ABSTRACTION PROVIDER (Phase 10) ----------
const envFile = join(homedir(), ".deribfy-supabase-bench.env");
if ((statSync(envFile).mode & 0o777) !== 0o600) throw new Error("env ≠ 600");
const envTxt = readFileSync(envFile, "utf8");
const get = (k) => envTxt.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const provider = new SupabaseProvider({ token: get("SUPABASE_ACCESS_TOKEN"), orgSlug: get("SUPABASE_TEST_ORG_SLUG") });
const sql = generateProvisioningSql(air);
const sqlHash = store.put(sql.sql);
log({ etape: "sql-genere", sqlHash: sqlHash.slice(0, 16), tables: sql.summary.tables, seed: sql.summary.seedRowsByTable });

const rows = (r) => (Array.isArray(r) ? r : []);
const backend = await timed("backend", () =>
  runProvisioning(provider, {
    name: "slice2-conteneurs",
    sql: sql.sql,
    healthTimeoutMs: 900_000,
    // Vérification métier INJECTÉE dans le flux : le démontage reste garanti
    // même si elle échoue (leçon Phase 8, prouvée par test).
    verify: async (p, ref) => {
      const tables = rows(await p.executeSql(ref, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;")).map((r) => r.tablename);
      const rls = rows(await p.executeSql(ref, "SELECT count(*)::int n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relkind='r' AND c.relrowsecurity;"))[0]?.n;
      const seeds = {};
      for (const t of sql.summary.tables) {
        seeds[t] = rows(await p.executeSql(ref, `SELECT count(*)::int n FROM "${t}";`))[0]?.n;
      }
      const attendu = [...sql.summary.tables].sort();
      const ok = JSON.stringify(tables) === JSON.stringify(attendu) && rls === attendu.length;
      log({ etape: "backend-verif", ref, tables, rlsActives: rls, seeds, conforme: ok });
      return { ok, detail: `${tables.length} tables, RLS ${rls}/${attendu.length}` };
    },
  }));
log({ etape: "backend-detail", ok: backend.ok, ref: backend.ref, demonte: backend.tornDown, steps: backend.steps });
// DÉFAUT CORRIGÉ (incident du 2026-08-29) : l'alerte de démontage était
// placée APRÈS le `throw` — un backend en échec masquait donc l'alerte
// rouge d'un projet resté vivant. L'alerte passe en premier.
if (!backend.tornDown && backend.ref) {
  log({ ALERTE_ROUGE: `teardown NON prouvé pour ${backend.ref} — vérifier et supprimer au dashboard` });
}
if (!backend.ok) throw new Error(`backend en échec : ${JSON.stringify(backend.steps.filter(s=>!s.ok))}`);

// ---------- 5. SANDBOX §8 (pipeline réel) ----------
let stage, tgz, sandboxReport;
try {
  const modal = await (async () => {
    const { ModalClient } = await import(join(REPO, "benchmarks/sandbox-bench/node_modules/modal/dist/index.js"));
    const menv = readFileSync(join(homedir(), ".deribfy-sandbox-bench.env"), "utf8");
    const mget = (k) => menv.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
    const client = new ModalClient({ tokenId: mget("MODAL_TOKEN_ID"), tokenSecret: mget("MODAL_TOKEN_SECRET") });
    const app = await client.apps.fromName("deribfy-slice2", { createIfMissing: true });
    const image = await client.images.fromRegistry("node:24-bookworm-slim");
    return new ModalSandboxProvider({ client, app, image });
  })();
  const { execFileSync } = await import("node:child_process");
  stage = mkdtempSync(join(homedir(), ".slice2-"));
  for (const [rel, content] of compiled.files) {
    mkdirSync(join(stage, dirname(rel)), { recursive: true });
    writeFileSync(join(stage, rel), content);
  }
  tgz = join(homedir(), ".slice2-fixture.tgz");
  execFileSync("tar", ["czf", tgz, "-C", stage, "."]);
  const bytes = new Uint8Array(readFileSync(tgz));
  sandboxReport = await timed("sandbox", () =>
    runPipeline(
      modal,
      { label: "slice2", network: { mode: "allowlist", domains: ["registry.npmjs.org", "*.npmjs.org"] }, vcpu: 2, memoryMiB: 4096, timeoutMs: 600_000 },
      [{ path: "/tmp/fixture.tgz", bytes }],
      [{ name: "extract", command: "mkdir -p /tmp/build && tar xzf /tmp/fixture.tgz -C /tmp/build" }, ...defaultPipeline("/tmp/build")],
    ));
  log({ etape: "sandbox-detail", ok: sandboxReport.ok, teardown: sandboxReport.teardownProved,
        // `StepReport` ne porte PAS de champ `ok` (contrat lu dans
        // packages/sandbox/src/pipeline.ts) : le succès d'une étape est son
        // code de sortie. Journaliser `s.ok` produisait un journal FAUX,
        // affichant « ECHEC » pour des étapes réussies.
        steps: sandboxReport.steps.map(s => `${s.name}:${s.exitCode === 0 && !s.timedOut ? "ok" : "ECHEC"}(${s.exitCode})`) });
  if (!sandboxReport.ok) throw new Error("pipeline sandbox du slice 2 en échec");
} finally {
  if (stage !== undefined) rmSync(stage, { recursive: true, force: true });
  if (tgz !== undefined) rmSync(tgz, { force: true });
}

// ---------- 6. ORACLE L1 + flows E2E générés ----------
const verdict = await timed("oracle", () => Promise.resolve(runOracleLevel1(air, compiled.rootHash)));
log({ etape: "oracle-detail", passed: verdict.passed, checks: verdict.checks.map((c) => `${c.name}:${c.passed}`) });
if (!verdict.passed) throw new Error(`Oracle L1 refuse le slice 2 : ${JSON.stringify(verdict.checks.filter(c=>!c.passed))}`);

const ids = previewIdentity(air.app.slug);
const flowsAndroid = generateMaestroFlows(air, ids.android, "android");
const flowsIos = generateMaestroFlows(air, ids.ios, "ios");
mkdirSync(join(HERE, "maestro"), { recursive: true });
writeFileSync(join(HERE, "maestro", "nav-android.yaml"), flowsAndroid.navigation);
writeFileSync(join(HERE, "maestro", "rtl-android.yaml"), flowsAndroid.rtl);
writeFileSync(join(HERE, "maestro", "nav-ios.yaml"), flowsIos.navigation);
writeFileSync(join(HERE, "maestro", "rtl-ios.yaml"), flowsIos.rtl);
log({ etape: "flows-e2e", identifiants: ids, fichiers: 4 });

// ---------- 7. GRILLE A++ + DIMENSION H SUR LES DEUX SLICES ----------
const slice1Air = projectAirSchema.parse(normalizeAir(JSON.parse(readFileSync(join(REPO, "packages/golden-corpus/corpus-v2/resto-quartier.air.json"), "utf8"))));
const echantillon = [
  { domain: "restaurant (slice 1)", air: slice1Air, files: compileProject(slice1Air).files },
  { domain: "conteneurs (slice 2)", air, files: compiled.files },
];
const anti = evaluateAntiTemplate(echantillon);
const grille = evaluateApxxGrid(compiled.files, air, echantillon);
log({ etape: "apxx", dimensions: grille.dimensions.map((d) => `${d.dimension}:${d.state}`),
      details: grille.dimensions.map((d) => `${d.dimension}=${d.detail}`) });
log({ etape: "dimension-H-2-slices", verdict: anti.state, detail: anti.detail,
      silhouettes: anti.structuralSignatures.map((s) => `${s.domain}=${s.signature.slice(0, 12)}`),
      collisions: anti.structuralCollisions, identitesVisuelles: anti.visualVariants, themes: anti.declaredThemes });

// ---------- 8. PROJET ÉCRIT (builds ultérieurs) ----------
const appDir = join(HERE, "app");
rmSync(appDir, { recursive: true, force: true });
for (const [rel, content] of compiled.files) {
  mkdirSync(join(appDir, dirname(rel)), { recursive: true });
  writeFileSync(join(appDir, rel), content);
}
log({ etape: "projet-ecrit", dossier: "slices/conteneurs/app", fichiers: compiled.files.size });

writeFileSync(join(HERE, "results", "metrics.json"), JSON.stringify({
  slice: "conteneurs-maritimes", domaine: "hors-template", phase: 10,
  airHash: compiled.lock.airHash, rootHash: compiled.rootHash, sqlHash,
  manifestHash: stored.manifestHash, fichiers: compiled.files.size,
  determinisme: "5/5", steps: metrics.steps,
  backend: { ok: backend.ok, demonte: backend.tornDown },
  sandboxOk: sandboxReport.ok, oraclePassed: verdict.passed,
  apxx: grille.dimensions.map((d) => ({ dimension: d.dimension, etat: d.state, detail: d.detail })),
  dimensionH: { verdict: anti.state, detail: anti.detail },
  repairs: metrics.repairs, manualWorkarounds: metrics.manualWorkarounds,
}, null, 2) + "\n");
console.log("\nSLICE 2 — CHAÎNE COMPLÈTE : OK");
