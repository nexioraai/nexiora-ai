// SONDE : quelles sections de l'AIR l'API structured outputs accepte-t-elle,
// seules puis groupées ? max_tokens minimal — on ne mesure que l'acceptation
// du schéma (400 = grammaire refusée), pas la génération.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const airSchema = await import(join(REPO, "packages/air-schema/src/index.ts"));

function apiKey() {
  const env = readFileSync(join(REPO, "apps/web/.env.local"), "utf8");
  const m = env.match(/^ANTHROPIC_API_KEY=("?)([^"\n]+)\1$/m);
  if (!m) throw new Error("clé introuvable");
  return m[2].trim();
}
const client = new Anthropic({ apiKey: apiKey() });

function stripKeys(node, keys) {
  if (Array.isArray(node)) return node.map((n) => stripKeys(n, keys));
  if (node !== null && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (keys.includes(k)) continue;
      out[k] = stripKeys(v, keys);
    }
    return out;
  }
  return node;
}
function oneOfToAnyOf(node) {
  if (Array.isArray(node)) return node.map(oneOfToAnyOf);
  if (node !== null && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k === "oneOf" ? "anyOf" : k] = oneOfToAnyOf(v);
    return out;
  }
  return node;
}
const sanitize = (s) =>
  stripKeys(oneOfToAnyOf(s), ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]);

async function accepts(pickKeys) {
  const pick = Object.fromEntries(pickKeys.map((k) => [k, true]));
  const schema = sanitize(
    z.toJSONSchema(airSchema.projectAirSchema.pick(pick), { target: "draft-2020-12" }),
  );
  try {
    await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1,
      messages: [{ role: "user", content: "{}" }],
      output_config: { format: { type: "json_schema", schema } },
    });
    return "OK";
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (/too large/i.test(msg)) return "TROP-LARGE";
    if (/optional parameters/i.test(msg)) return "TROP-OPTIONNELS";
    return `400: ${msg.slice(80, 200)}`;
  }
}

const KEYS = Object.keys(airSchema.projectAirSchema.shape);
for (const key of KEYS) {
  console.log(`${key}: ${await accepts([key])}`);
}
