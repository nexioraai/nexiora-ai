// CYCLE RÉEL DU BACKEND PROVISIONER (5.3/5.4, D-032) — critères de sortie
// Phase 5 : cycle provision → vérification automatisée fail-closed →
// teardown prouvé · test d'isolation PAR TENTATIVE (A↛B, B↛A, A↛CŒUR en
// lecture seule) · SQL archivé au store SHA-256 (réutilise 4.6).
// Org de banc DÉDIÉE (free vérifié par le provider avant création, 0 $) ;
// le provider ne peut supprimer QUE les refs créés par ce run
// (`nexiora-ai` hors d'atteinte par construction) ; teardown en finally.
// Usage : node run.mjs
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const { generateProvisioningSql } = await import(
  join(REPO, "packages/provisioner/src/sql-gen.ts")
);
const { SupabaseProvider } = await import(
  join(REPO, "packages/provisioner/src/provider.ts")
);
const { LocalArtifactStore } = await import(
  join(REPO, "packages/compiler/src/artifact-store.ts")
);

const ENV_FILE = join(homedir(), ".deribfy-supabase-bench.env");
// URL PUBLIQUE (client-side) du projet cœur — utilisée UNIQUEMENT pour une
// tentative de LECTURE avec une clé étrangère (échec attendu, exigé par la
// ROADMAP : « ni du cœur (preuve par tentative) »). Aucune modification.
const CORE_REST = "https://lefumezaxfsttigpmzhr.supabase.co/rest/v1/";
const HEALTHY_TIMEOUT_MS = 15 * 60_000;

mkdirSync(join(HERE, "results"), { recursive: true });
const LOG = join(
  HERE,
  "results",
  `cycle-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`,
);
const log = (o) => {
  appendFileSync(LOG, JSON.stringify(o) + "\n");
  console.log(JSON.stringify(o));
};

const stat = statSync(ENV_FILE);
if ((stat.mode & 0o777) !== 0o600) throw new Error("env file: permissions ≠ 600");
const envContent = readFileSync(ENV_FILE, "utf8");
const get = (k) => envContent.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const provider = new SupabaseProvider({
  token: get("SUPABASE_ACCESS_TOKEN"),
  orgSlug: get("SUPABASE_TEST_ORG_SLUG"),
});

const store = new LocalArtifactStore(join(HERE, "store"));
const CORPUS = join(REPO, "packages/golden-corpus/corpus-v2");
const APPS = [
  { label: "A", doc: "resto-quartier.air.json", name: "prov-cycle-a-resto" },
  { label: "B", doc: "agence-immo.air.json", name: "prov-cycle-b-agence" },
];

// Clé anon PUBLIQUE du cœur (client-side) — utilisée UNIQUEMENT pour une
// tentative de lecture contre NOS projets de banc (jamais contre le cœur).
const CORE_ANON = readFileSync(join(REPO, "apps/web/.env.local"), "utf8")
  .match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim();

const rows = (r) => (Array.isArray(r) ? r : []);
const created = [];
let verdictOk = true;
const check = (name, ok, detail) => {
  log({ verification: name, ok, ...(detail === undefined ? {} : { detail }) });
  if (!ok) verdictOk = false;
};

try {
  for (const app of APPS) {
    const air = JSON.parse(readFileSync(join(CORPUS, app.doc), "utf8"));
    const { sql, summary, lock } = generateProvisioningSql(air);
    // SQL ARCHIVÉ COMME ARTEFACT (critère ROADMAP) — store SHA-256 de 4.6.
    const sqlHash = store.put(sql);
    log({ app: app.label, etape: "sql-genere", sqlHash, airHash: lock.airHash, summary });

    const t0 = Date.now();
    const project = await provider.createProject(app.name);
    created.push({ ...app, ...project });
    await provider.waitHealthy(project.ref, HEALTHY_TIMEOUT_MS);
    log({ app: app.label, etape: "provision", ref: project.ref, dureeMs: Date.now() - t0 });

    // Relevé AVANT (patron §7).
    const before = await provider.executeSql(
      project.ref,
      "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public';",
    );
    log({ app: app.label, releveAvant: rows(before)[0] });

    // Application du SQL généré (les BARRIÈRES internes lèvent en cas
    // d'écart — l'appel échoue alors : fail-closed).
    const t1 = Date.now();
    await provider.executeSql(project.ref, sql);
    log({ app: app.label, etape: "sql-applique", dureeMs: Date.now() - t1 });

    // Vérifications automatisées INDÉPENDANTES (relevés APRÈS).
    const tables = rows(
      await provider.executeSql(
        project.ref,
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;",
      ),
    ).map((r) => r.tablename);
    const expectedTables = [...summary.tables, ...summary.joinTables].sort();
    check(`${app.label}:tables`, JSON.stringify(tables) === JSON.stringify(expectedTables), {
      attendu: expectedTables,
      obtenu: tables,
    });

    const rls = rows(
      await provider.executeSql(
        project.ref,
        "SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity;",
      ),
    )[0]?.n;
    check(`${app.label}:rls-partout`, rls === expectedTables.length, { rls, attendu: expectedTables.length });

    for (const [table, expected] of Object.entries(summary.seedRowsByTable)) {
      const n = rows(
        await provider.executeSql(project.ref, `SELECT count(*)::int AS n FROM "${table}";`),
      )[0]?.n;
      check(`${app.label}:seed:${table}`, n === expected, { n, expected });
    }

    // REJOUABILITÉ (patron §7) : même script une 2e fois ⇒ succès,
    // comptes inchangés.
    await provider.executeSql(project.ref, sql);
    const replayCount = rows(
      await provider.executeSql(
        project.ref,
        "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public';",
      ),
    )[0]?.n;
    check(`${app.label}:rejouable`, replayCount === expectedTables.length, { replayCount });

    // ===== 5.4 (volet réalisable avec UN projet vivant — limite de 2
    // projets free actifs PAR COMPTE, démontrée par l'API) =====
    const anon = await provider.getAnonKey(project.ref);
    const attempt = async (nom, url, key) => {
      const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      let body;
      try {
        body = await r.json();
      } catch {
        body = undefined;
      }
      return { nom, status: r.status, rows: Array.isArray(body) ? body.length : undefined };
    };
    const table = summary.tables[0];
    // Clé de l'app contre le CŒUR (LECTURE SEULE, échec attendu — ROADMAP).
    const vsCore = await attempt(`cle-${app.label}-contre-COEUR-lecture`, CORE_REST, anon);
    check(`isolation:${app.label}-ne-lit-pas-le-coeur`, vsCore.status === 401 || vsCore.status === 403, vsCore);
    // Clé PUBLIQUE du cœur contre l'app générée (requête vers l'APP, pas
    // vers le cœur) : refus attendu (JWT étranger).
    if (typeof CORE_ANON === "string") {
      const coreVsApp = await attempt(`cle-coeur-contre-${app.label}`, `${project.restUrl}${table}?select=id`, CORE_ANON);
      check(`isolation:le-coeur-ne-lit-pas-${app.label}`, coreVsApp.status === 401 || coreVsApp.status === 403, coreVsApp);
    }
    // Deny-by-default dans SON PROPRE projet : anon valide ⇒ 200, 0 ligne.
    const own = await attempt(`cle-${app.label}-dans-${app.label}`, `${project.restUrl}${table}?select=id`, anon);
    check(`isolation:deny-by-default-${app.label}`, own.status === 200 && own.rows === 0, own);

    // Les apps restent VIVANTES pour le croisé strict (org Pro — GO
    // propriétaire 2026-08-28) ; teardown des deux en finally.
    app.anon = anon;
    app.restUrl = project.restUrl;
    app.firstTable = table;
    app.ref = project.ref;
  }

  // ===== 5.4 — CROISÉ STRICT A↔B (2 apps GÉNÉRÉES simultanées) =====
  const [A, B] = APPS;
  const attempt2 = async (nom, url, key) => {
    const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    let body;
    try {
      body = await r.json();
    } catch {
      body = undefined;
    }
    return { nom, status: r.status, rows: Array.isArray(body) ? body.length : undefined };
  };
  const aVsB = await attempt2("cle-A-contre-projet-B", `${B.restUrl}${B.firstTable}?select=id`, A.anon);
  check("isolation:A-ne-lit-pas-B", aVsB.status === 401 || aVsB.status === 403, aVsB);
  const bVsA = await attempt2("cle-B-contre-projet-A", `${A.restUrl}${A.firstTable}?select=id`, B.anon);
  check("isolation:B-ne-lit-pas-A", bVsA.status === 401 || bVsA.status === 403, bVsA);

} catch (e) {
  log({ ERREUR: String(e.message ?? e) });
  verdictOk = false;
} finally {
  // TEARDOWN SYSTÉMATIQUE des refs créés par CE run (et eux seuls).
  for (const p of created) {
    try {
      await provider.deleteProject(p.ref);
      const absent = await provider.isAbsent(p.ref);
      check(`teardown:${p.label}`, absent, { ref: p.ref });
    } catch (e) {
      log({ ALERTE_ROUGE: `teardown ${p.label} en échec — supprimer '${p.name}' manuellement`, detail: String(e.message ?? e) });
      verdictOk = false;
    }
  }
  log({ VERDICT: verdictOk ? "CYCLE + ISOLATION : VERTS" : "ÉCHEC", journal: LOG });
  process.exitCode = verdictOk ? 0 : 1;
}
