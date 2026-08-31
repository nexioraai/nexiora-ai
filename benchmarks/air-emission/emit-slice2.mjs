// ÉMISSION DE L'AIR DU VERTICAL SLICE 2 (Phase 10, D-042).
//
// Domaine HORS-TEMPLATE : suivi de conteneurs maritimes (arbitrage
// propriétaire du 2026-08-29).
//
// PROTOCOLE : celui de la campagne du corpus v2 (D-025), à l'identique —
// mêmes 5 sections dans le même ordre, même prompt système, mêmes niveaux
// de dégradation de schéma, même passe de réparation BORNÉE à 1.
// L'identité du prompt n'est pas affirmée : elle est VÉRIFIÉE au démarrage
// en relisant `emit-v2.mjs`. Si le texte diverge d'un octet, ce script
// REFUSE de s'exécuter — sans quoi « même protocole » serait une promesse
// invérifiable, et le slice 2 ne serait pas comparable au slice 1.
//
// DIFFÉRENCES ASSUMÉES, toutes consignées :
//  · UNE seule intention (le domaine tranché) au lieu de 12 ;
//  · sortie dans `slices/conteneurs/` — le CORPUS GELÉ n'est jamais touché ;
//  · plafond de dépense abaissé à 5 $ (D-018 : l'option la moins chère
//    d'abord ; la campagne des 12 documents avait coûté ~17 $).
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

const airSchema = await import(join(REPO, "packages/air-schema/src/index.ts"));
const registry = await import(join(REPO, "packages/capability-registry/src/index.ts"));
const blocksRegistry = await import(join(REPO, "packages/blocks/src/registry.ts"));

function apiKey() {
  const env = readFileSync(join(REPO, "apps/web/.env.local"), "utf8");
  const m = env.match(/^ANTHROPIC_API_KEY=("?)([^"\n]+)\1$/m);
  if (!m) throw new Error("ANTHROPIC_API_KEY introuvable dans apps/web/.env.local");
  return m[2].trim();
}

const MODEL = "claude-opus-5";
const MAX_TOKENS = 8000;
const PLAFOND_USD = 5;
const PRIX = { in: 5, cacheWrite: 6.25, cacheRead: 0.5, out: 25 };
const coutUSD = (u) =>
  ((u.input_tokens ?? 0) * PRIX.in +
    (u.cache_creation_input_tokens ?? 0) * PRIX.cacheWrite +
    (u.cache_read_input_tokens ?? 0) * PRIX.cacheRead +
    (u.output_tokens ?? 0) * PRIX.out) / 1e6;

// --- INTENTION DU SLICE 2 (texte FIXE, la campagne est rejouable) ---
const INTENTION = {
  slug: "suivi-conteneurs",
  commerce: "none",
  text:
    "Je dirige une petite société de transit à Abidjan. Mes clients importateurs veulent " +
    "suivre leurs conteneurs depuis leur téléphone : numéro de conteneur, navire, port de " +
    "départ et port d'arrivée, date d'arrivée estimée et statut du dédouanement. Je veux " +
    "qu'ils soient prévenus par notification dès qu'un statut change, et qu'ils puissent " +
    "consulter la liste même sans réseau, parce qu'au port la connexion est mauvaise. " +
    "Aucun paiement dans l'application. En français.",
};

const PARTS = [
  {
    name: "base",
    keys: [
      "airSchemaVersion",
      "projectId",
      "app",
      "navigation",
      "design",
      "network",
      "native",
      "compliance",
    ],
  },
  { name: "donnees", keys: ["entities", "relations", "datasets", "rules", "slots"] },
  { name: "ecrans", keys: ["screens"] },
  { name: "comportement", keys: ["actions", "capabilities", "permissions"] },
  { name: "cablage", keys: ["integrations", "expectedTests"] },
];

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
function makeLevels(jsonSchema) {
  const base = oneOfToAnyOf(jsonSchema);
  const L1 = stripKeys(base, ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]);
  const L2 = stripKeys(L1, ["minLength", "maxLength", "minItems", "maxItems"]);
  const L3 = stripKeys(L2, ["pattern", "format"]);
  return [
    { name: "sans-bornes-numeriques", schema: L1 },
    { name: "sans-longueurs", schema: L2 },
    { name: "sans-patterns", schema: L3 },
  ];
}
for (const part of PARTS) {
  const pick = Object.fromEntries(part.keys.map((k) => [k, true]));
  part.zod = airSchema.projectAirSchema.pick(pick);
  part.levels = makeLevels(z.toJSONSchema(part.zod, { target: "draft-2020-12" }));
  part.levelIndex = 0;
}

function registryDigest() {
  const lines = [];
  for (const c of registry.CAPABILITIES) {
    const perms = c.inducedPermissions.map((p) => `${p.platform}:${p.permission}`).join(", ");
    lines.push(
      `- \`${c.id}\` — ${c.title}` +
        (c.commerceConstraint === "none" ? "" : ` [classe commerce EXIGÉE : ${c.commerceConstraint}]`) +
        (c.dependencies.capabilities.length ? ` [dépend de : ${c.dependencies.capabilities.join(", ")}]` : "") +
        (perms ? ` [permissions à DÉCLARER dans l'AIR : ${perms}]` : ""),
    );
  }
  return lines.join("\n");
}

// Le prompt système est REPRIS de emit-v2.mjs. La copie est vérifiée
// ci-dessous contre la source : aucune dérive silencieuse n'est possible.
const SYSTEM_EMIT_SOURCE = readFileSync(join(HERE, "emit-v2.mjs"), "utf8");
const extraitPrompt = (source) => {
  const debut = source.indexOf("const SYSTEM_EMIT = `");
  if (debut < 0) throw new Error("SYSTEM_EMIT introuvable");
  const apres = debut + "const SYSTEM_EMIT = `".length;
  const fin = source.indexOf("`;", apres);
  return source.slice(apres, fin);
};
const TEMPLATE_V2 = extraitPrompt(SYSTEM_EMIT_SOURCE);

// SUBSTITUTION CHIRURGICALE (P-007, design system v2) : la règle D de la
// campagne du corpus interdisait `design.overrides` — contrainte de la
// campagne D-025, jamais une règle du schéma (le champ existe dans l'AIR
// 1.0.0). La v2 rend ce canal EFFECTIF ; le slice 2 doit donc pouvoir
// déclarer son identité visuelle. Une seule phrase est remplacée, et son
// texte exact est VÉRIFIÉ avant substitution : si le prompt de référence
// changeait, ce script s'arrêterait au lieu de dériver en silence.
const REGLE_V1 = "D. design.overrides : NE PAS ÉMETTRE ce champ (absent).";
if (!TEMPLATE_V2.includes(REGLE_V1)) {
  throw new Error("règle D introuvable dans le prompt de référence — refus fail-closed");
}
// SUBSTITUTION 2 (D-044) : le schéma est passé en 1.1.0 et porte le champ
// `visibleWhen`. La règle 10 fixait la version à 1.0.0 — on la met à jour, et
// on INSTRUIT le modèle sur la condition de visibilité. Là encore, le texte
// exact est vérifié avant remplacement.
const REGLE_VERSION_V1 = '10. airSchemaVersion = "1.0.0".';
if (!TEMPLATE_V2.includes(REGLE_VERSION_V1)) {
  throw new Error("règle 10 introuvable dans le prompt de référence — refus fail-closed");
}
const REGLE_VERSION_V2 = [
  '10. airSchemaVersion = "1.1.0".',
  "",
  "CONDITION DE VISIBILITÉ (1.1.0) : un bloc peut porter `visibleWhen`,",
  "`{ kind: \"entity_empty\" | \"entity_not_empty\", entityId }`. Un bloc",
  "`empty_state` posé sur un écran qui porte AUSSI une liste DOIT porter",
  "`visibleWhen` avec `entity_empty` et l'entityId de cette liste — sans quoi",
  "l'état vide s'afficherait alors que des données sont présentes. Un CTA qui",
  "n'a de sens qu'avec des données porte `entity_not_empty`. N'ajoute pas de",
  "condition ailleurs.",
].join("\n");
const REGLE_V2 = [
  "D. design.overrides : ÉMETS 3 à 5 surcharges donnant à l'app une identité",
  "visuelle propre, cohérente avec son domaine. Clés AUTORISÉES, aucune autre :",
  "`color.light.primary`, `color.dark.primary` (couleurs `#RRGGBB`) et",
  "`radius.sm`, `radius.md`, `radius.lg` (entiers positifs). N'émets JAMAIS",
  "`color.*.primaryText` : c'est un token DÉRIVÉ, calculé par le moteur pour",
  "garantir le contraste — le fixer à la main serait refusé.",
].join("\n");
const SYSTEM_EMIT = TEMPLATE_V2.replace(REGLE_V1, REGLE_V2)
  .replace(REGLE_VERSION_V1, REGLE_VERSION_V2)
  .replace("${registryDigest()}", registryDigest());
if (SYSTEM_EMIT.includes("${")) {
  throw new Error("interpolation non résolue dans le prompt repris — refus fail-closed");
}
console.log(`[protocole] prompt système repris de emit-v2.mjs (${TEMPLATE_V2.length} caractères) — règle D substituée (v2), reste IDENTIQUE`);

const client = new Anthropic({ apiKey: apiKey() });

async function callPart(part, system, userText, label) {
  for (; part.levelIndex < part.levels.length; part.levelIndex++) {
    const level = part.levels[part.levelIndex];
    try {
      return await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userText }],
        output_config: { format: { type: "json_schema", schema: level.schema } },
      });
    } catch (error) {
      const msg = String(error?.message ?? error);
      if (error?.status === 400 && part.levelIndex < part.levels.length - 1) {
        console.log(`  [${label}] niveau "${level.name}" refusé — dégradation : ${msg.slice(0, 140)}`);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`tous les niveaux de schéma refusés pour ${part.name}`);
}

function extractJson(response) {
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const cleaned = text.startsWith("```")
    ? text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")
    : text;
  return JSON.parse(cleaned);
}

function validateLocal(document) {
  const parsed = airSchema.projectAirSchema.safeParse(document);
  if (!parsed.success) {
    return {
      air: null,
      diagnostics: parsed.error.issues.map((issue) => ({
        code: "SCHEMA",
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }
  const diagnostics = [
    ...airSchema.validateAir(parsed.data),
    ...registry.validateAirCapabilities(parsed.data),
    ...blocksRegistry.validateAirBlocks(parsed.data),
  ];
  return { air: parsed.data, diagnostics };
}

const partOfPath = (path) => {
  const root = String(path).split(/[.[]/)[0];
  return PARTS.find((p) => p.keys.includes(root)) ?? PARTS[0];
};

async function emitSections(contextText, label, usage, refusals) {
  const assembled = {};
  for (const part of PARTS) {
    const user =
      `${contextText}\n\nSECTIONS À ÉMETTRE MAINTENANT : ${part.keys.join(", ")}.` +
      (Object.keys(assembled).length
        ? `\n\nSECTIONS DÉJÀ ÉMISES (à respecter strictement, ne pas réémettre) :\n${JSON.stringify(assembled)}`
        : "");
    let response = await callPart(part, SYSTEM_EMIT, user, `${label}:${part.name}`);
    usage.push(response.usage);
    if (response.stop_reason === "refusal") {
      refusals.count++;
      response = await callPart(part, SYSTEM_EMIT, user, `${label}:${part.name}#retry`);
      usage.push(response.usage);
      if (response.stop_reason === "refusal") {
        refusals.count++;
        throw new Error(`refus persistant sur ${part.name}`);
      }
    }
    Object.assign(assembled, extractJson(response));
    console.log(`  [${label}] section "${part.name}" émise`);
  }
  return assembled;
}

async function repairSections(document, diagnostics, intentionText, label, usage, refusals) {
  const failing = [...new Set(diagnostics.map((d) => partOfPath(d.path).name))];
  const repaired = { ...document };
  for (const part of PARTS.filter((p) => failing.includes(p.name))) {
    const subset = diagnostics.filter((d) => partOfPath(d.path).name === part.name);
    const user =
      `${intentionText}\n\nDocument complet actuel :\n${JSON.stringify(repaired)}\n\n` +
      `Les validateurs déterministes signalent ces incohérences dans les sections ${part.keys.join(", ")} :\n` +
      `${JSON.stringify(subset, null, 2)}\n\n` +
      `Réémets UNIQUEMENT les sections ${part.keys.join(", ")}, corrigées : corrige ce que les diagnostics signalent, conserve tout le reste à l'identique.`;
    const response = await callPart(part, SYSTEM_EMIT, user, `${label}:${part.name}#repair`);
    usage.push(response.usage);
    if (response.stop_reason === "refusal") {
      refusals.count++;
      continue;
    }
    Object.assign(repaired, extractJson(response));
    console.log(`  [${label}] section "${part.name}" RÉPARÉE`);
  }
  return repaired;
}

const SLICE_DIR = join(REPO, "slices", "conteneurs");
const RESULTS_DIR = join(HERE, "results");
mkdirSync(join(SLICE_DIR, "air"), { recursive: true });
mkdirSync(RESULTS_DIR, { recursive: true });
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const JOURNAL = join(RESULTS_DIR, `slice2-${RUN_ID}.jsonl`);

const t0 = Date.now();
const journal = { intention: INTENTION.slug, commerce: INTENTION.commerce, protocole: "D-025 (vérifié)" };
const usage = [];
const refusals = { count: 0 };
try {
  let document = await emitSections(`DEMANDE DU CLIENT :\n${INTENTION.text}`, INTENTION.slug, usage, refusals);
  let { air, diagnostics } = validateLocal(document);
  journal.diagnosticsPremierePasse = diagnostics.length;
  journal.attempts = 1;
  if (air === null || diagnostics.length > 0) {
    console.log(`  diagnostics 1re passe : ${diagnostics.length} → réparation bornée`);
    journal.attempts = 2;
    document = await repairSections(document, diagnostics, `DEMANDE DU CLIENT :\n${INTENTION.text}`, INTENTION.slug, usage, refusals);
    ({ air, diagnostics } = validateLocal(document));
    journal.diagnosticsApresReparation = diagnostics.length;
  }
  journal.valid = air !== null && diagnostics.length === 0;
  if (journal.valid) {
    journal.commerceEmis = air.compliance.commerceClass;
    journal.commerceAttendu = INTENTION.commerce;
    const out = JSON.stringify(JSON.parse(airSchema.canonicalJson(air)), null, 2) + "\n";
    writeFileSync(join(SLICE_DIR, "air", `${INTENTION.slug}.air.json`), out);
    journal.fichier = `slices/conteneurs/air/${INTENTION.slug}.air.json`;
    journal.airHash = airSchema.hashCanonical(air);
    journal.ecrans = air.screens.length;
    journal.entites = air.entities.length;
    journal.capabilities = air.capabilities.map((c) => c.capability);
    journal.overrides = air.design.overrides ?? [];
  } else {
    journal.diagnosticsRestants = diagnostics.slice(0, 12);
  }
} catch (error) {
  journal.erreur = String(error?.message ?? error).slice(0, 400);
  journal.valid = false;
}
journal.refusals = refusals.count;
journal.coutUSD = Number(usage.reduce((s, u) => s + coutUSD(u ?? {}), 0).toFixed(4));
journal.plafondUSD = PLAFOND_USD;
journal.dureeMs = Date.now() - t0;
appendFileSync(JOURNAL, JSON.stringify(journal) + "\n");
console.log(`\n[slice2] valid=${journal.valid} tentatives=${journal.attempts ?? "-"} refus=${refusals.count} $${journal.coutUSD} ${Math.round(journal.dureeMs / 1000)}s`);
if (journal.erreur) console.log("ERREUR:", journal.erreur);
if (journal.diagnosticsRestants) console.log(JSON.stringify(journal.diagnosticsRestants, null, 2));
if (journal.valid) console.log(`AIR écrit : ${journal.fichier} · ${journal.ecrans} écrans · ${journal.entites} entités · ${journal.capabilities.join(", ")}`);
