// CAMPAGNE RÉELLE DU FIX v2 (2.4-H) — 12 rejeux depuis le corpus versionné.
// Moteur : transcribe-lib.mjs (VALIDÉ À BLANC — écrans un par un, comptes du
// rendu, refus fail-closed). Ce fichier n'est que le TRANSPORT réel (API
// structured outputs) + la journalisation exhaustive exigée.
//
// Usage : node replay-v2.mjs [slug...]   (défaut : les 12 du corpus)
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  CALL_PLAN,
  TranscriptionRefusedError,
  screenSchema,
  transcribeAirV2,
} from "./transcribe-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const airSchema = await import(join(REPO, "packages/air-schema/src/index.ts"));

function apiKey() {
  const env = readFileSync(join(REPO, "apps/web/.env.local"), "utf8");
  const m = env.match(/^ANTHROPIC_API_KEY=("?)([^"\n]+)\1$/m);
  if (!m) throw new Error("ANTHROPIC_API_KEY introuvable");
  return m[2].trim();
}
const client = new Anthropic({ apiKey: apiKey() });
const MODEL = "claude-opus-5";

const PRIX = { in: 5, cacheWrite: 6.25, cacheRead: 0.5, out: 25 };
const coutUSD = (u) =>
  ((u.input_tokens ?? 0) * PRIX.in +
    (u.cache_creation_input_tokens ?? 0) * PRIX.cacheWrite +
    (u.cache_read_input_tokens ?? 0) * PRIX.cacheRead +
    (u.output_tokens ?? 0) * PRIX.out) / 1e6;

// Sous-ensemble JSON Schema accepté par l'API [mesuré campagne 2.4].
function stripKeys(n, keys) {
  if (Array.isArray(n)) return n.map((x) => stripKeys(x, keys));
  if (n !== null && typeof n === "object") {
    const o = {};
    for (const [a, b] of Object.entries(n)) {
      if (keys.includes(a)) continue;
      o[a] = stripKeys(b, keys);
    }
    return o;
  }
  return n;
}
function o2a(n) {
  if (Array.isArray(n)) return n.map(o2a);
  if (n !== null && typeof n === "object") {
    const o = {};
    for (const [a, b] of Object.entries(n)) o[a === "oneOf" ? "anyOf" : a] = o2a(b);
    return o;
  }
  return n;
}
const sanitize = (s) =>
  stripKeys(o2a(s), ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]);

const PART_SCHEMAS = new Map(
  CALL_PLAN.map((p) => [p.name, sanitize(z.toJSONSchema(p.zod, { target: "draft-2020-12" }))]),
);
const SCREEN_JSON = sanitize(
  z.toJSONSchema(z.strictObject({ screen: screenSchema }), { target: "draft-2020-12" }),
);

const SYSTEM_TRANSCRIBE = `Tu reçois (dans ce contexte système) le rendu texte DÉTERMINISTE et COMPLET d'une spécification AIR existante. Tu transcris par appels ciblés : à chaque appel, émets UNIQUEMENT ce qui est demandé, en JSON strictement conforme au schéma fourni.

RÈGLE ABSOLUE : reproduction à l'IDENTIQUE. Chaque identifiant, chaque valeur, chaque ordre de liste, chaque texte localisé doit être repris VERBATIM depuis le rendu. Les valeurs entre backticks sont des littéraux exacts ; les objets/tableaux JSON inclus dans le rendu sont à recopier tels quels. N'ajoute rien, n'omets rien, ne reformule rien, ne "corrige" rien. Un champ optionnel absent du rendu reste absent du JSON.

ANCRAGE DES IDENTIFIANTS : chaque identifiant entre backticks doit réapparaître CARACTÈRE PAR CARACTÈRE. Inventer, renommer ou « améliorer » un identifiant est une FAUTE.

COMPLÉTUDE : le contrat de chaque appel précise les COMPTES EXACTS attendus (sections, blocs, éléments). Une sortie schéma-valide mais INCOMPLÈTE est une FAUTE : émets TOUS les éléments annoncés, sans en résumer ni en omettre aucun.`;

function partContract(name, keys, expected) {
  const c = expected.counts;
  const details = {
    base: `navigation.routes : EXACTEMENT ${expected.routes} routes.`,
    donnees: `entities : EXACTEMENT ${c.entities} (champs par entité : ${expected.entities.map((e) => `${e.id}=${e.fields}`).join(", ")}) · relations : ${c.relations} · datasets : ${c.datasets} · rules : ${c.rules} · slots : ${c.slots}.`,
    comportement: `actions : EXACTEMENT ${c.actions} · capabilities : ${c.capabilities} · permissions : ${c.permissions}.`,
    cablage: `integrations : EXACTEMENT ${c.integrations} · expectedTests : ${c.expectedTests}.`,
  };
  return `SECTIONS À ÉMETTRE MAINTENANT : ${keys.join(", ")}.\nCONTRAT DE COMPLÉTUDE : ${details[name]}`;
}

async function apiCall(schema, instruction, rendered, stats) {
  for (let apiAttempt = 0; ; apiAttempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: [
          { type: "text", text: SYSTEM_TRANSCRIBE, cache_control: { type: "ephemeral" } },
          { type: "text", text: `RENDU À TRANSCRIRE :\n\n${rendered}`, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: instruction }],
        output_config: { format: { type: "json_schema", schema } },
      });
      return response;
    } catch (error) {
      const status = error?.status ?? 0;
      const transient = status === 429 || status >= 500 || /overloaded/i.test(String(error?.message));
      if (transient && apiAttempt === 0) {
        stats.apiRetries++;
        await new Promise((r) => setTimeout(r, 20000));
        continue;
      }
      throw error;
    }
  }
}

function extractJson(response) {
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const cleaned = text.startsWith("```") ? text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "") : text;
  return JSON.parse(cleaned);
}

function makeTransport(rendered, stats) {
  return async (call) => {
    if (call.attempt > 0) stats.contentRetries++;
    const isPart = call.kind === "part";
    const schema = isPart ? PART_SCHEMAS.get(call.name) : SCREEN_JSON;
    const spec = isPart ? null : call.expected.screens[call.index];
    const instruction = isPart
      ? partContract(call.name, call.keys, call.expected)
      : `Émets UNIQUEMENT l'écran \`${call.screenId}\` (écran ${call.index + 1}/${call.expected.screens.length} du rendu), enveloppé dans {"screen": …}.\nCONTRAT DE COMPLÉTUDE : id "${call.screenId}" à l'identique · EXACTEMENT ${spec.blocks} bloc(s), tous recopiés intégralement (props comprises).`;
    const response = await apiCall(schema, instruction, rendered, stats);
    stats.usage.push(response.usage);
    stats.calls.push({
      name: call.name,
      attempt: call.attempt,
      stop: response.stop_reason,
      in: response.usage.input_tokens ?? 0,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
      cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
      out: response.usage.output_tokens ?? 0,
      // Règle propriétaire (validation D-019) : TOUT le brut est conservé,
      // y compris les émissions que le moteur refusera ensuite.
      raw: response.content.filter((b) => b.type === "text").map((b) => b.text).join(""),
    });
    if (response.stop_reason === "refusal") {
      stats.refusals++;
      throw new Error(`refus classifieur sur ${call.name}`);
    }
    return extractJson(response);
  };
}

const CORPUS = join(REPO, "packages/golden-corpus/corpus");
const DUMP_DIR = join(HERE, "results", "roundtrips-v2");
mkdirSync(DUMP_DIR, { recursive: true });
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const JOURNAL = join(HERE, "results", `rejeux-v2-${RUN_ID}.jsonl`);

const SLUGS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(CORPUS).filter((f) => f.endsWith(".air.json")).map((f) => f.replace(".air.json", "")).sort();

let cumul = 0;
const bilan = [];
for (const slug of SLUGS) {
  const t0 = Date.now();
  const stats = { usage: [], calls: [], contentRetries: 0, apiRetries: 0, refusals: 0 };
  const entry = { slug };
  try {
    const original = airSchema.projectAirSchema.parse(
      JSON.parse(readFileSync(join(CORPUS, `${slug}.air.json`), "utf8")),
    );
    const rendered = airSchema.renderAirToText(original);
    const { air, hash } = await transcribeAirV2({
      rendered,
      transport: makeTransport(rendered, stats),
      maxRetries: 1,
    });
    const hashOriginal = airSchema.hashCanonical(original);
    entry.ok = true;
    entry.schemaValid = true;
    entry.semanticDiagnostics = 0; // garanti par le refus fail-closed du moteur
    entry.identical = hash === hashOriginal;
    entry.hashOriginal = hashOriginal;
    entry.hashTranscrit = hash;
    writeFileSync(
      join(DUMP_DIR, `${slug}.v2.json`),
      JSON.stringify({ identical: entry.identical, document: air }, null, 2),
    );
  } catch (error) {
    entry.ok = false;
    entry.identical = false;
    if (error instanceof TranscriptionRefusedError) {
      entry.refus = { code: error.code, stage: error.stage, message: error.message.slice(0, 300) };
    } else {
      entry.erreur = String(error?.message ?? error).slice(0, 300);
    }
  }
  entry.appels = stats.calls.length;
  entry.contentRetries = stats.contentRetries;
  entry.apiRetries = stats.apiRetries;
  entry.refusals = stats.refusals;
  entry.detailAppels = stats.calls;
  const cout = stats.usage.reduce((s, u) => s + coutUSD(u ?? {}), 0);
  entry.coutUSD = Number(cout.toFixed(4));
  cumul += cout;
  entry.cumulUSD = Number(cumul.toFixed(2));
  entry.dureeMs = Date.now() - t0;
  appendFileSync(JOURNAL, JSON.stringify(entry) + "\n");
  bilan.push(entry);
  console.log(
    `[${slug}] identical=${entry.identical} appels=${entry.appels} retriesContenu=${entry.contentRetries} retriesAPI=${entry.apiRetries} ` +
      `$${entry.coutUSD} (cumul $${entry.cumulUSD}) ${Math.round(entry.dureeMs / 1000)}s` +
      (entry.refus ? ` REFUS[${entry.refus.code}@${entry.refus.stage}]` : "") +
      (entry.erreur ? ` ERREUR: ${entry.erreur}` : ""),
  );
}

const identiques = bilan.filter((e) => e.identical).length;
const valides = bilan.filter((e) => e.ok).length;
console.log(
  `\nBILAN v2 : ${identiques}/${bilan.length} IDENTIQUES · ${valides}/${bilan.length} documents complets valides · ` +
    `coût total ~$${cumul.toFixed(2)} · journal ${JOURNAL}`,
);
