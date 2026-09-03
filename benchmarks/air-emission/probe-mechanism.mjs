// SONDE 2.4-H — MÉCANISME EXACT DE LA SOUS-ÉMISSION (D-018 : diagnostic
// discriminant AVANT toute correction). NE PAS LANCER SANS AUTORISATION
// PROPRIÉTAIRE (dépense API réelle, ~$0,30-0,45).
//
// 6 bras sur UN écran fautif (défaut : boutique-mode/scr_article — le plus
// petit échec : 7 blocs, ~2,3 k chars) ; TOUT le matériel brut est conservé
// (results/probe-mechanism/), y compris ce que le harnais v2 refusait.
//
// Hypothèses discriminées :
//   H-A grammaire : la décodage contraint (structured outputs) induit la
//       clôture précoce  → bras A3 (même prompt SANS grammaire).
//   H-B contexte : le rendu COMPLET en système induit l'arrêt → bras A4
//       (rendu réduit à la seule section de l'écran).
//   H-C contenu : certains blocs déclenchent l'arrêt quel que soit le
//       cadre → point de troncature stable entre A1/A2 (répliques) et
//       persistance à travers A3/A4.
//   H-D modèle : spécifique à claude-opus-5 → bras A5 (claude-sonnet-5).
//   Contraste intra-document : bras A6 (écran voisin qui passe).
//
// Usage : node probe-mechanism.mjs [slug] [screenId] [screenTemoinId]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { screenSchema } from "./transcribe-lib.mjs";

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

const PRIX = {
  "claude-opus-5": { in: 5, cacheWrite: 6.25, cacheRead: 0.5, out: 25 },
  "claude-sonnet-5": { in: 3, cacheWrite: 3.75, cacheRead: 0.3, out: 15 },
};
const coutUSD = (m, u) =>
  ((u.input_tokens ?? 0) * PRIX[m].in +
    (u.cache_creation_input_tokens ?? 0) * PRIX[m].cacheWrite +
    (u.cache_read_input_tokens ?? 0) * PRIX[m].cacheRead +
    (u.output_tokens ?? 0) * PRIX[m].out) / 1e6;

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
const SCREEN_JSON = stripKeys(
  o2a(z.toJSONSchema(z.strictObject({ screen: screenSchema }), { target: "draft-2020-12" })),
  ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"],
);

// Système IDENTIQUE à replay-v2.mjs — la sonde réplique le chemin réel.
const SYSTEM_TRANSCRIBE = `Tu reçois (dans ce contexte système) le rendu texte DÉTERMINISTE et COMPLET d'une spécification AIR existante. Tu transcris par appels ciblés : à chaque appel, émets UNIQUEMENT ce qui est demandé, en JSON strictement conforme au schéma fourni.

RÈGLE ABSOLUE : reproduction à l'IDENTIQUE. Chaque identifiant, chaque valeur, chaque ordre de liste, chaque texte localisé doit être repris VERBATIM depuis le rendu. Les valeurs entre backticks sont des littéraux exacts ; les objets/tableaux JSON inclus dans le rendu sont à recopier tels quels. N'ajoute rien, n'omets rien, ne reformule rien, ne "corrige" rien. Un champ optionnel absent du rendu reste absent du JSON.

ANCRAGE DES IDENTIFIANTS : chaque identifiant entre backticks doit réapparaître CARACTÈRE PAR CARACTÈRE. Inventer, renommer ou « améliorer » un identifiant est une FAUTE.

COMPLÉTUDE : le contrat de chaque appel précise les COMPTES EXACTS attendus (sections, blocs, éléments). Une sortie schéma-valide mais INCOMPLÈTE est une FAUTE : émets TOUS les éléments annoncés, sans en résumer ni en omettre aucun.`;

const slug = process.argv[2] ?? "boutique-mode";
const screenId = process.argv[3] ?? "scr_article";
const temoinId = process.argv[4] ?? "scr_catalogue";

const air = airSchema.projectAirSchema.parse(
  JSON.parse(readFileSync(join(REPO, "packages/golden-corpus/corpus", `${slug}.air.json`), "utf8")),
);
const rendered = airSchema.renderAirToText(air);
const screen = air.screens.find((s) => s.id === screenId);
const temoin = air.screens.find((s) => s.id === temoinId);
const index = air.screens.findIndex((s) => s.id === screenId);

// Rendu minimal pour le bras A4 : uniquement la section de l'écran cible.
const lines = rendered.split("\n");
const start = lines.findIndex((l) => l.startsWith(`### Écran \`${screenId}\``));
let end = start + 1;
while (end < lines.length && !lines[end].startsWith("### ") && !lines[end].startsWith("## ")) end++;
const renderedMinimal = `# EXTRAIT DE SPÉCIFICATION — un seul écran\n## Écrans (1)\n${lines.slice(start, end).join("\n")}`;

const instruction = (sid, blocs, i, total) =>
  `Émets UNIQUEMENT l'écran \`${sid}\` (écran ${i}/${total} du rendu), enveloppé dans {"screen": …}.\nCONTRAT DE COMPLÉTUDE : id "${sid}" à l'identique · EXACTEMENT ${blocs} bloc(s), tous recopiés intégralement (props comprises).`;

const ARMS = [
  { name: "A1-replique", model: "claude-opus-5", render: rendered, grammar: true, sid: screenId, blocs: screen.blocks.length, i: index + 1, total: air.screens.length },
  { name: "A2-replique-bis", model: "claude-opus-5", render: rendered, grammar: true, sid: screenId, blocs: screen.blocks.length, i: index + 1, total: air.screens.length },
  { name: "A3-sans-grammaire", model: "claude-opus-5", render: rendered, grammar: false, sid: screenId, blocs: screen.blocks.length, i: index + 1, total: air.screens.length },
  { name: "A4-rendu-minimal", model: "claude-opus-5", render: renderedMinimal, grammar: true, sid: screenId, blocs: screen.blocks.length, i: 1, total: 1 },
  { name: "A5-sonnet", model: "claude-sonnet-5", render: rendered, grammar: true, sid: screenId, blocs: screen.blocks.length, i: index + 1, total: air.screens.length },
  { name: "A6-ecran-temoin", model: "claude-opus-5", render: rendered, grammar: true, sid: temoinId, blocs: temoin.blocks.length, i: air.screens.findIndex((s) => s.id === temoinId) + 1, total: air.screens.length },
];

const OUT = join(HERE, "results", "probe-mechanism");
mkdirSync(OUT, { recursive: true });

let total = 0;
const bilan = [];
for (const arm of ARMS) {
  const request = {
    model: arm.model,
    max_tokens: 8000,
    system: [
      { type: "text", text: SYSTEM_TRANSCRIBE, cache_control: { type: "ephemeral" } },
      { type: "text", text: `RENDU À TRANSCRIRE :\n\n${arm.render}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: arm.grammar ? instruction(arm.sid, arm.blocs, arm.i, arm.total) : `${instruction(arm.sid, arm.blocs, arm.i, arm.total)}\nRéponds UNIQUEMENT par le JSON (aucun texte autour).` }],
  };
  if (arm.grammar) request.output_config = { format: { type: "json_schema", schema: SCREEN_JSON } };
  let record = { arm: arm.name, model: arm.model, grammar: arm.grammar, sid: arm.sid, blocsAttendus: arm.blocs };
  try {
    const response = await client.messages.create(request);
    const raw = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    record.stop = response.stop_reason;
    record.usage = response.usage;
    record.coutUSD = Number(coutUSD(arm.model, response.usage).toFixed(4));
    total += record.coutUSD;
    record.raw = raw; // MATÉRIEL BRUT INTÉGRAL — la donnée qui manquait
    try {
      const doc = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""));
      const blocks = doc?.screen?.blocks ?? doc?.blocks ?? [];
      record.blocsEmis = blocks.length;
      record.idsEmis = blocks.map((b) => b?.id);
      record.dernierBlocEmis = blocks.at(-1)?.id ?? null;
    } catch (e) {
      record.parseError = String(e.message).slice(0, 120);
    }
  } catch (error) {
    record.apiError = String(error?.message ?? error).slice(0, 300);
  }
  writeFileSync(join(OUT, `${arm.name}.json`), JSON.stringify(record, null, 2));
  bilan.push(record);
  console.log(
    `[${arm.name}] blocs=${record.blocsEmis ?? "?"}/${arm.blocs} dernier=${record.dernierBlocEmis ?? "-"} stop=${record.stop ?? "-"} $${record.coutUSD ?? 0}${record.apiError ? " API-ERREUR: " + record.apiError : ""}${record.parseError ? " PARSE: " + record.parseError : ""}`,
  );
}
console.log(`\nSONDE : coût total ~$${total.toFixed(2)} · matériel brut dans results/probe-mechanism/`);
