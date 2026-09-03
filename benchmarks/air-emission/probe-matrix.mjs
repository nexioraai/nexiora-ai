// MATRICE DISCRIMINANTE X1-X4 (2.4-H) — AUTORISÉE, BUDGET DUR $0,55.
// Diagnostic pur : AUCUNE correction. Base = A1/A2 (répliques tronquées ×2,
// campagne ×3) : écran boutique-mode/scr_article, prose, schéma courant.
// Chaque bras modifie UNE variable. PRÉDICTIONS DÉCLARÉES AVANT EXÉCUTION :
//   X4 props REQUISES ......... M-PIÈGE ⇒ complet ; si déraille DANS les
//                               props ⇒ M-PIÈGE réfuté comme cœur.
//   X3' ordre naturel du schéma M-PIÈGE(géométrie d'ordre) ⇒ complet ;
//       (id,blockType,entityId,props) sinon ordre insuffisant.
//   X1 blocs en JSON inline ... M-PRÉSENTATION ⇒ complet (et réfute
//                               « densité suffit », densité constante).
//   X2 labels alignés (prose) . M-VOCAB(H-I) ⇒ complet ; M-PIÈGE ⇒ ÉCHEC
//                               (bras conçu pour réfuter ma propre H-I).
// Réplication : tout bras montrant une transition (complet là où la base
// tronque) est rejoué ×1 (=×2 total), dans la limite du budget.
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
const MODEL = "claude-opus-5";
const BUDGET_MAX = 0.55;

const PRIX = { in: 5, cacheWrite: 6.25, cacheRead: 0.5, out: 25 };
const coutUSD = (u) =>
  ((u.input_tokens ?? 0) * PRIX.in +
    (u.cache_creation_input_tokens ?? 0) * PRIX.cacheWrite +
    (u.cache_read_input_tokens ?? 0) * PRIX.cacheRead +
    (u.output_tokens ?? 0) * PRIX.out) / 1e6;

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

// Schéma de base {screen: ...} identique à replay-v2 / sonde A.
const BASE = sanitize(z.toJSONSchema(z.strictObject({ screen: screenSchema }), { target: "draft-2020-12" }));
const blockNode = (schema) => schema.properties.screen.properties.blocks.items;

function schemaX4() {
  const s = structuredClone(BASE);
  const b = blockNode(s);
  if (!b.required.includes("props")) b.required = [...b.required, "props"];
  return s; // UNIQUE changement : props passe de optionnelle à requise
}
function schemaX3prime() {
  const s = structuredClone(BASE);
  const b = blockNode(s);
  const p = b.properties;
  b.properties = { id: p.id, blockType: p.blockType, entityId: p.entityId, props: p.props };
  return s; // UNIQUE changement : ordre de déclaration = ordre naturel observé (A3)
}

// Rendus variants : modification LIMITÉE aux lignes de blocs de scr_article.
const air = airSchema.projectAirSchema.parse(
  JSON.parse(readFileSync(join(REPO, "packages/golden-corpus/corpus", "boutique-mode.air.json"), "utf8")),
);
const original = air.screens.find((s) => s.id === "scr_article");
const RENDERED = airSchema.renderAirToText(air);

function replaceArticleBlockLines(mapper) {
  const lines = RENDERED.split("\n");
  const start = lines.findIndex((l) => l.startsWith("### Écran `scr_article`"));
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith("### ") && !lines[end].startsWith("## ")) end++;
  let blockIndex = 0;
  for (let i = start + 1; i < end; i++) {
    if (lines[i].startsWith("- bloc ")) {
      lines[i] = mapper(original.blocks[blockIndex], blockIndex + 1);
      blockIndex++;
    }
  }
  return lines.join("\n");
}
// X1 : bloc en JSON inline, clés dans L'ORDRE DU SCHÉMA (pas d'ordre nouveau
// introduit — seule la PRÉSENTATION change, densité et contenu constants).
const RENDERED_X1 = replaceArticleBlockLines((b, k) => {
  const ordered = { id: b.id, blockType: b.blockType };
  if (b.props !== undefined) ordered.props = b.props;
  if (b.entityId !== undefined) ordered.entityId = b.entityId;
  return `- bloc ${k}: ${JSON.stringify(ordered)}`;
});
// X2 : prose conservée, seuls les LABELS changent (type→blockType, entité→entityId).
const RENDERED_X2 = replaceArticleBlockLines((b, k) => {
  const props = b.props === undefined ? "" : ` · props: ${airSchema.canonicalJson(b.props)}`;
  const ent = b.entityId === undefined ? "" : ` · entityId \`${b.entityId}\``;
  return `- bloc ${k}: \`${b.id}\` · blockType \`${b.blockType}\`${ent}${props}`;
});

const SYSTEM_TRANSCRIBE = `Tu reçois (dans ce contexte système) le rendu texte DÉTERMINISTE et COMPLET d'une spécification AIR existante. Tu transcris par appels ciblés : à chaque appel, émets UNIQUEMENT ce qui est demandé, en JSON strictement conforme au schéma fourni.

RÈGLE ABSOLUE : reproduction à l'IDENTIQUE. Chaque identifiant, chaque valeur, chaque ordre de liste, chaque texte localisé doit être repris VERBATIM depuis le rendu. Les valeurs entre backticks sont des littéraux exacts ; les objets/tableaux JSON inclus dans le rendu sont à recopier tels quels. N'ajoute rien, n'omets rien, ne reformule rien, ne "corrige" rien. Un champ optionnel absent du rendu reste absent du JSON.

ANCRAGE DES IDENTIFIANTS : chaque identifiant entre backticks doit réapparaître CARACTÈRE PAR CARACTÈRE. Inventer, renommer ou « améliorer » un identifiant est une FAUTE.

COMPLÉTUDE : le contrat de chaque appel précise les COMPTES EXACTS attendus (sections, blocs, éléments). Une sortie schéma-valide mais INCOMPLÈTE est une FAUTE : émets TOUS les éléments annoncés, sans en résumer ni en omettre aucun.`;

const INSTRUCTION = `Émets UNIQUEMENT l'écran \`scr_article\` (écran 2/4 du rendu), enveloppé dans {"screen": …}.\nCONTRAT DE COMPLÉTUDE : id "scr_article" à l'identique · EXACTEMENT 7 bloc(s), tous recopiés intégralement (props comprises).`;

const ARMS = [
  { name: "X4-props-requises", schema: schemaX4(), render: RENDERED },
  { name: "X3p-ordre-naturel", schema: schemaX3prime(), render: RENDERED },
  { name: "X1-json-inline", schema: BASE, render: RENDERED_X1 },
  { name: "X2-labels-alignes", schema: BASE, render: RENDERED_X2 },
];

const OUT = join(HERE, "results", "probe-matrix");
mkdirSync(OUT, { recursive: true });

let total = 0;
const results = [];
async function runArm(arm, suffix) {
  if (total >= BUDGET_MAX * 0.9) {
    console.log(`[${arm.name}${suffix}] SAUTÉ — garde budget ($${total.toFixed(2)})`);
    return null;
  }
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: [
      { type: "text", text: SYSTEM_TRANSCRIBE, cache_control: { type: "ephemeral" } },
      { type: "text", text: `RENDU À TRANSCRIRE :\n\n${arm.render}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: INSTRUCTION }],
    output_config: { format: { type: "json_schema", schema: arm.schema } },
  });
  const raw = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const cout = coutUSD(response.usage);
  total += cout;
  const record = { arm: arm.name + suffix, stop: response.stop_reason, usage: response.usage, coutUSD: Number(cout.toFixed(4)), raw };
  try {
    const doc = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""));
    const s = doc.screen;
    record.blocsEmis = s.blocks.length;
    record.propsPresentes = s.blocks.filter((b) => b.props !== undefined).length;
    // Fidélité canonique bloc à bloc contre l'ORIGINAL (indépendant du rendu variant)
    record.blocsVerbatim = s.blocks.filter(
      (b, i) => i < original.blocks.length && airSchema.canonicalJson(b) === airSchema.canonicalJson(original.blocks[i]),
    ).length;
    record.ecranIdentique = airSchema.canonicalJson(s) === airSchema.canonicalJson(original);
  } catch (e) {
    record.parseError = String(e.message).slice(0, 150);
  }
  writeFileSync(join(OUT, `${arm.name}${suffix}.json`), JSON.stringify(record, null, 2));
  results.push(record);
  console.log(
    `[${record.arm}] blocs=${record.blocsEmis ?? "?"}/7 verbatim=${record.blocsVerbatim ?? "?"} props=${record.propsPresentes ?? "?"} identique=${record.ecranIdentique ?? false} stop=${record.stop} $${record.coutUSD} (cumul $${total.toFixed(2)})`,
  );
  return record;
}

for (const arm of ARMS) {
  const first = await runArm(arm, "");
  // Réplication des bras en TRANSITION (complets là où la base tronque).
  if (first && first.blocsEmis === 7) {
    await runArm(arm, "-replication");
  }
}
console.log(`\nMATRICE : coût total ~$${total.toFixed(2)} (plafond $${BUDGET_MAX}) · bruts dans results/probe-matrix/`);
