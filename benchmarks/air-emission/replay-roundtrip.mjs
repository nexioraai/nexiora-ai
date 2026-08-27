// REJEU D'UN ROUND-TRIP depuis un AIR du corpus versionné (diagnostic 2.4).
// Ne refait PAS l'émission : lit packages/golden-corpus/corpus/<slug>.air.json,
// rend le texte, re-transcrit par sections (structured outputs), valide, et
// DUMPE le document transcrit + les diagnostics dans results/roundtrips/.
//
// Usage : node replay-roundtrip.mjs <slug> [<slug>...]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const airSchema = await import(join(REPO, "packages/air-schema/src/index.ts"));
const registry = await import(join(REPO, "packages/capability-registry/src/index.ts"));

function apiKey() {
  const env = readFileSync(join(REPO, "apps/web/.env.local"), "utf8");
  const m = env.match(/^ANTHROPIC_API_KEY=("?)([^"\n]+)\1$/m);
  if (!m) throw new Error("ANTHROPIC_API_KEY introuvable");
  return m[2].trim();
}
const client = new Anthropic({ apiKey: apiKey() });
const MODEL = "claude-opus-5";

const PARTS = [
  { name: "base", keys: ["airSchemaVersion", "projectId", "app", "navigation", "design", "network", "native", "compliance"] },
  { name: "donnees", keys: ["entities", "relations", "datasets", "rules", "slots"] },
  { name: "ecrans", keys: ["screens"] },
  { name: "comportement", keys: ["actions", "capabilities", "permissions"] },
  { name: "cablage", keys: ["integrations", "expectedTests"] },
];
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
for (const part of PARTS) {
  const pick = Object.fromEntries(part.keys.map((k) => [k, true]));
  part.schema = stripKeys(
    o2a(z.toJSONSchema(airSchema.projectAirSchema.pick(pick), { target: "draft-2020-12" })),
    ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"],
  );
}

// 2.4-H : fix minimal validé par le propriétaire. NOTE [mesuré 2026-08-27] :
// `temperature` est DÉPRÉCIÉ et refusé (400) sur claude-opus-5 — le levier
// d'échantillonnage n'existe plus sur la famille Claude 5 ; le fix repose
// donc sur l'ancrage explicite des identifiants ci-dessous.
const SYSTEM_TRANSCRIBE = `Tu reçois le rendu texte DÉTERMINISTE et COMPLET d'une spécification AIR existante. Tu transcris par sections : à chaque appel, émets UNIQUEMENT les sections demandées, en JSON strictement conforme au schéma fourni.

RÈGLE ABSOLUE : reproduction à l'IDENTIQUE. Chaque identifiant, chaque valeur, chaque ordre de liste, chaque texte localisé doit être repris VERBATIM depuis le rendu. Les valeurs entre backticks sont des littéraux exacts ; les objets/tableaux JSON inclus dans le rendu sont à recopier tels quels. N'ajoute rien, n'omets rien, ne reformule rien, ne "corrige" rien. Un champ optionnel absent du rendu reste absent du JSON.

ANCRAGE DES IDENTIFIANTS : chaque identifiant entre backticks (préfixes prj_, scr_, blk_, nav_, ent_, fld_, rel_, data_, act_, rule_, slot_, intg_, test_) doit réapparaître CARACTÈRE PAR CARACTÈRE dans le JSON émis. Inventer, renommer ou « améliorer » un identifiant est une FAUTE. Avant d'émettre une section, repère dans le rendu les identifiants exacts qu'elle doit contenir et recopie-les tels quels — y compris ceux définis dans d'autres sections et simplement référencés ici.`;

function extractJson(response) {
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const cleaned = text.startsWith("```") ? text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "") : text;
  return JSON.parse(cleaned);
}

const DUMP_DIR = join(HERE, "results", "roundtrips");
mkdirSync(DUMP_DIR, { recursive: true });

// Surveillance budgétaire (2.4-H) : coût affiché par rejeu et cumulé.
const PRIX = { in: 5, cacheWrite: 6.25, cacheRead: 0.5, out: 25 };
const coutUSD = (u) =>
  ((u.input_tokens ?? 0) * PRIX.in +
    (u.cache_creation_input_tokens ?? 0) * PRIX.cacheWrite +
    (u.cache_read_input_tokens ?? 0) * PRIX.cacheRead +
    (u.output_tokens ?? 0) * PRIX.out) / 1e6;
let totalUSD = 0;

for (const slug of process.argv.slice(2)) {
  const usage = [];
  const air = airSchema.projectAirSchema.parse(
    JSON.parse(readFileSync(join(REPO, "packages/golden-corpus/corpus", `${slug}.air.json`), "utf8")),
  );
  const rendered = airSchema.renderAirToText(air);
  const assembled = {};
  for (const part of PARTS) {
    const user =
      `RENDU TEXTE DE LA SPÉCIFICATION À TRANSCRIRE :\n\n${rendered}\n\n` +
      `SECTIONS À ÉMETTRE MAINTENANT : ${part.keys.join(", ")}.` +
      (Object.keys(assembled).length
        ? `\n\nSECTIONS DÉJÀ ÉMISES (à respecter strictement, ne pas réémettre) :\n${JSON.stringify(assembled)}`
        : "");
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: [{ type: "text", text: SYSTEM_TRANSCRIBE, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema: part.schema } },
    });
    if (response.stop_reason === "refusal") throw new Error(`refus sur ${part.name}`);
    usage.push(response.usage);
    Object.assign(assembled, extractJson(response));
  }
  const parsed = airSchema.projectAirSchema.safeParse(assembled);
  const diagnostics = parsed.success
    ? [...airSchema.validateAir(parsed.data), ...registry.validateAirCapabilities(parsed.data)]
    : parsed.error.issues.map((i) => ({ code: "SCHEMA", path: i.path.join("."), message: i.message }));
  const identical =
    parsed.success && airSchema.hashCanonical(parsed.data) === airSchema.hashCanonical(air);
  writeFileSync(
    join(DUMP_DIR, `${slug}.transcrit.json`),
    JSON.stringify({ identical, schemaValid: parsed.success, diagnostics, document: assembled }, null, 2),
  );
  const cout = usage.reduce((s, u) => s + coutUSD(u ?? {}), 0);
  totalUSD += cout;
  console.log(
    `[${slug}] schemaValid=${parsed.success} diagnostics=${diagnostics.length} identical=${identical} $${cout.toFixed(3)} (cumul $${totalUSD.toFixed(2)}) → results/roundtrips/${slug}.transcrit.json`,
  );
}
console.log(`\nBILAN REJEUX : coût total ~$${totalUSD.toFixed(2)}`);
