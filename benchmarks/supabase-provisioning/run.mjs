// BANC SUPABASE PROVISIONING (Volet 3) — voir protocole.md (écrit AVANT
// mesure). MODES : --simulate (DÉFAUT : zéro appel réseau, plan complet
// imprimé) · --execute (exécution réelle — UNIQUEMENT après GO explicite
// du propriétaire sur le rapport de simulation).
// GARDE-FOUS CODÉS EN DUR : plan Free exigé (plafond 0 $) · allowlist
// d'org · le script ne supprime QUE le ref créé par lui dans CE run ·
// teardown en finally · aucun secret journalisé · ≥1,1 s entre appels.
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(homedir(), ".deribfy-supabase-bench.env");
const API = "https://api.supabase.com";
const PROJECT_NAME = "supabase-provisioning-bench";
const REGION = "us-east-1"; // = région de nexiora-ai (validé propriétaire)
const PLAFOND_USD = 0; // plan Free exigé — tout autre plan = STOP
const POLL_TIMEOUT_MS = 15 * 60_000;
const CALL_SPACING_MS = 1100;

const EXECUTE = process.argv.includes("--execute");
mkdirSync(join(HERE, "results"), { recursive: true });
const LOG = join(
  HERE,
  "results",
  `${EXECUTE ? "execution" : "simulation"}-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`,
);
const log = (o) => {
  appendFileSync(LOG, JSON.stringify(o) + "\n");
  console.log(JSON.stringify(o));
};

// --- Secrets : fichier local mode 600, JAMAIS journalisé.
function readEnvFile() {
  let stat;
  try {
    stat = statSync(ENV_FILE);
  } catch {
    return { present: false };
  }
  const mode = stat.mode & 0o777;
  if (mode !== 0o600) {
    return { present: true, mode: mode.toString(8), permissionsOk: false };
  }
  const content = readFileSync(ENV_FILE, "utf8");
  const get = (k) => content.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
  return {
    present: true,
    permissionsOk: true,
    token: get("SUPABASE_ACCESS_TOKEN"),
    orgSlug: get("SUPABASE_TEST_ORG_SLUG"),
  };
}

const PLAN = [
  { etape: 1, appel: "GET /v1/organizations", facturable: false, but: "vérifier slug d'org (allowlist) + PLAN FREE (sinon STOP avant toute création)" },
  { etape: 2, appel: "POST /v1/projects", facturable: "0 $ SI plan Free (vérifié à l'étape 1) — SEUL appel créateur", but: `créer '${PROJECT_NAME}' en ${REGION} ; t0 = envoi, t1 = acceptation ; relever X-RateLimit-*` },
  { etape: 3, appel: "GET /v1/projects/{ref} (sondage ≤15 min, 1 appel/5 s)", facturable: false, but: "t2 = ACTIVE_HEALTHY" },
  { etape: 4, appel: "GET /v1/projects/{ref}/api-keys puis GET https://{ref}.supabase.co/rest/v1/", facturable: false, but: "t3 = première réponse PostgREST servie (<500 avec clé anon)" },
  { etape: 5, appel: "DELETE /v1/projects/{ref} (ref créé à l'étape 2 UNIQUEMENT)", facturable: false, but: "t4 = teardown ; en FINALLY même si 3-4 échouent" },
  { etape: 6, appel: "GET /v1/projects/{ref} (404 attendu) + GET /v1/projects (relisting)", facturable: false, but: "preuve d'absence — teardown prouvé" },
];

const env = readEnvFile();

if (!EXECUTE) {
  // ---------- SIMULATION À BLANC : AUCUN APPEL RÉSEAU ----------
  log({ mode: "SIMULATION", reseau: "AUCUN APPEL ÉMIS", protocole: "protocole.md" });
  log({
    parametres: { projet: PROJECT_NAME, region: REGION, plafondUsd: PLAFOND_USD },
    gardeFous: [
      "plan Free vérifié par API AVANT création, sinon STOP",
      "allowlist d'org (slug du fichier d'env)",
      "DELETE limité au ref créé par CE run (nexiora-ai hors d'atteinte par construction)",
      "teardown en finally + vérification 404 + relisting",
      "timeout sondage 15 min",
      "≥1,1 s entre appels Management API",
      "aucun secret journalisé",
    ],
  });
  for (const p of PLAN) log(p);
  log({
    analyseFacturation:
      "Seule l'étape 2 crée une ressource. Sur plan Free (vérifié étape 1) : 0 $ — le projet occupe la place libre (1 seul actif : nexiora-ai) et est détruit en fin de run. Tout plan ≠ free ⇒ STOP avant l'étape 2.",
  });
  log({
    preconditions: {
      fichierEnv: ENV_FILE,
      present: env.present === true,
      permissions600: env.permissionsOk === true,
      tokenFourni: typeof env.token === "string" && env.token.length > 0,
      orgSlugFourni: typeof env.orgSlug === "string" && env.orgSlug.length > 0,
    },
  });
  const ready =
    env.present === true &&
    env.permissionsOk === true &&
    typeof env.token === "string" &&
    typeof env.orgSlug === "string";
  log({
    verdictSimulation: ready
      ? "PRÉCONDITIONS COMPLÈTES — exécution possible après GO propriétaire (--execute)"
      : "PRÉCONDITIONS INCOMPLÈTES — fournir le fichier d'env (mode 600) avant tout GO",
  });
  process.exit(0);
}

// ---------- EXÉCUTION RÉELLE (uniquement après GO propriétaire) ----------
if (env.present !== true || env.permissionsOk !== true || !env.token || !env.orgSlug) {
  log({ ARRET: "préconditions manquantes (fichier d'env absent/permissions/champs)" });
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;
async function mgmt(method, path, body) {
  const wait = lastCall + CALL_SPACING_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const rate = {};
  for (const [k, v] of res.headers.entries()) {
    if (k.toLowerCase().startsWith("x-ratelimit")) rate[k] = v;
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, json, rate };
}

let createdRef; // SEUL ref que ce script a le droit de supprimer.
const t = {};
try {
  // 1. Org + plan (fail-closed).
  const orgs = await mgmt("GET", "/v1/organizations");
  log({ etape: 1, status: orgs.status, rate: orgs.rate });
  const org = Array.isArray(orgs.json)
    ? orgs.json.find((o) => o.slug === env.orgSlug)
    : undefined;
  if (org === undefined) throw new Error("STOP: slug d'org introuvable (allowlist)");
  const plan = (org.plan ?? org.tier ?? "").toString().toLowerCase();
  log({ etape: 1, orgTrouvee: true, plan });
  if (plan !== "" && plan !== "free") {
    throw new Error(`STOP AVANT CRÉATION: plan '${plan}' ≠ free (plafond ${PLAFOND_USD} $)`);
  }
  if (plan === "") {
    log({ avertissement: "plan non exposé par l'API — STOP par prudence (plafond 0 $)" });
    throw new Error("STOP AVANT CRÉATION: plan indéterminé");
  }

  // 2. Création (l'acte mesuré).
  t.t0_envoi = Date.now();
  const created = await mgmt("POST", "/v1/projects", {
    name: PROJECT_NAME,
    organization_id: org.id,
    region: REGION,
    db_pass: randomBytes(24).toString("base64url"),
  });
  t.t1_acceptation = Date.now();
  log({ etape: 2, status: created.status, rate: created.rate });
  if (created.status >= 300 || !created.json?.id) {
    throw new Error(`création refusée (${created.status})`);
  }
  createdRef = created.json.id;
  log({ etape: 2, refCree: createdRef, region: REGION });

  // 3. Sondage ACTIVE_HEALTHY.
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let status = "";
  while (Date.now() < deadline) {
    const p = await mgmt("GET", `/v1/projects/${createdRef}`);
    status = p.json?.status ?? `HTTP_${p.status}`;
    if (status === "ACTIVE_HEALTHY") break;
    await sleep(5000);
  }
  if (status !== "ACTIVE_HEALTHY") throw new Error(`timeout sondage (dernier statut: ${status})`);
  t.t2_healthy = Date.now();
  log({ etape: 3, statut: status, dureeCreationMs: t.t2_healthy - t.t0_envoi });

  // 4. Première réponse PostgREST.
  const keys = await mgmt("GET", `/v1/projects/${createdRef}/api-keys`);
  const anon = Array.isArray(keys.json)
    ? keys.json.find((k) => k.name === "anon")?.api_key
    : undefined;
  if (typeof anon !== "string") throw new Error("clé anon introuvable");
  let served = false;
  const restDeadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < restDeadline) {
    try {
      const r = await fetch(`https://${createdRef}.supabase.co/rest/v1/`, {
        headers: { apikey: anon },
      });
      if (r.status < 500) {
        served = true;
        t.t3_postgrest = Date.now();
        log({ etape: 4, postgrestStatus: r.status });
        break;
      }
    } catch {
      // service pas encore joignable — on continue de sonder.
    }
    await sleep(3000);
  }
  if (!served) throw new Error("PostgREST jamais servi avant timeout");
  log({
    MESURE_1: "création → PostgREST servie",
    totalMs: t.t3_postgrest - t.t0_envoi,
    detail: {
      acceptationMs: t.t1_acceptation - t.t0_envoi,
      healthyMs: t.t2_healthy - t.t0_envoi,
      postgrestMs: t.t3_postgrest - t.t0_envoi,
    },
  });
} catch (e) {
  log({ ERREUR: String(e.message ?? e) });
  process.exitCode = 1;
} finally {
  // 5-6. TEARDOWN GARANTI du seul ref créé par CE run.
  if (createdRef !== undefined) {
    try {
      const t4a = Date.now();
      const del = await mgmt("DELETE", `/v1/projects/${createdRef}`);
      const check = await mgmt("GET", `/v1/projects/${createdRef}`);
      const listing = await mgmt("GET", "/v1/projects");
      const stillListed =
        Array.isArray(listing.json) && listing.json.some((p) => p.id === createdRef);
      const proved = del.status < 300 && check.status === 404 && !stillListed;
      log({
        MESURE_2: "teardown",
        deleteStatus: del.status,
        get404: check.status,
        relistingAbsent: !stillListed,
        dureeMs: Date.now() - t4a,
        teardownProuve: proved,
      });
      if (!proved) {
        log({
          ALERTE_ROUGE: `TEARDOWN NON PROUVÉ — supprimer manuellement le projet '${PROJECT_NAME}' (ref ${createdRef}) au dashboard`,
        });
        process.exitCode = 1;
      }
    } catch (e) {
      log({
        ALERTE_ROUGE: `TEARDOWN EN ÉCHEC (${String(e.message ?? e)}) — supprimer manuellement '${PROJECT_NAME}' (ref ${createdRef})`,
      });
      process.exitCode = 1;
    }
  }
  log({ fin: true, journal: LOG });
}
