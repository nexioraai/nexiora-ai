// CAMPAGNE D'ÉMISSION AIR v3 — CORRECTIF DE PROMPT (2026-08-30).
//
// emit.mjs (v1) et emit-v2.mjs (v2) sont CONSERVÉS INTACTS : ce sont les
// enregistrements des campagnes qui ont produit les corpus. Ce fichier est
// leur successeur, PAS leur remplacement.
//
// CAUSE RACINE CORRIGÉE ICI — diagnostic du 2026-08-30 :
//   Les 12 documents du corpus ont TOUS 4 écrans (3 pour un seul) et TOUS
//   exactement 3 entités. Ce n'était ni une limite du modèle, ni une limite
//   du schéma, ni une limite du moteur : la règle 10 du prompt disait
//   « Sois complet mais sobre : 2 à 4 écrans, 1 à 3 entités ».
//   Le modèle a SATURÉ le plafond qu'on lui donnait, 12 fois sur 12.
//   [VÉRIFIÉ] un AIR écrit à la main à 12 écrans / 8 entités est accepté par
//   les validateurs et compilé sans erreur — le plafond n'était que le prompt.
//
// TROIS CORRECTIFS :
//   1. règle 10 — dimensionner sur le BESOIN, plus sur un plafond ; et exiger
//      que tout écran déclaré soit atteignable (18 écrans du corpus ne le sont pas) ;
//   2. règle E — besoin non exprimable : le déclarer au lieu de le perdre en
//      silence (12 documents déclarent 17 champs `asset` qu'aucun bloc ne rend) ;
//   3. règle F — conditionner l'état vide (17 duplications mesurées au corpus).
//
// NON EXÉCUTÉ. Lancer cette campagne consomme du budget LLM : décision propriétaire.

// DE SMART BLOCKS (D-023/D-024). Mêmes 12 intentions, même pipeline par
// sections que la campagne 2.4 (emit.mjs, INTOUCHÉ), mêmes contraintes API.
// Différences consignées en D-025 : + allowlist de blocs au prompt et
// validateAirBlocks en validation locale · design.overrides ABSENT ·
// round-trip SUPPRIMÉ (garantie D-019 structurelle au schéma inchangé) ·
// sortie corpus-v2/ (v1 gelé, byte-identique) · PLAFOND DUR 25 $.
// Usage : node emit-v2.mjs [debut] [fin]
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { INTENTIONS } from "./intentions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

const airSchema = await import(join(REPO, "packages/air-schema/src/index.ts"));
const registry = await import(join(REPO, "packages/capability-registry/src/index.ts"));
const blocksRegistry = await import(join(REPO, "packages/blocks/src/registry.ts"));

// --- Clé : lue depuis apps/web/.env.local, jamais journalisée. ---
function apiKey() {
  const env = readFileSync(join(REPO, "apps/web/.env.local"), "utf8");
  const m = env.match(/^ANTHROPIC_API_KEY=("?)([^"\n]+)\1$/m);
  if (!m) throw new Error("ANTHROPIC_API_KEY introuvable dans apps/web/.env.local");
  return m[2].trim();
}

const MODEL = "claude-opus-5";
const MAX_TOKENS = 8000;
const client = new Anthropic({ apiKey: apiKey() });

// Tarifs publics claude-opus-5, $/MTok (mêmes valeurs que le banc coûts).
const PRIX = { in: 5, cacheWrite: 6.25, cacheRead: 0.5, out: 25 };
const coutUSD = (u) =>
  ((u.input_tokens ?? 0) * PRIX.in +
    (u.cache_creation_input_tokens ?? 0) * PRIX.cacheWrite +
    (u.cache_read_input_tokens ?? 0) * PRIX.cacheRead +
    (u.output_tokens ?? 0) * PRIX.out) / 1e6;

// --- Découpage en sections : 5 groupes, chacun ACCEPTÉ par la grammaire
// structured outputs (sondé section par section puis par groupes —
// probe-grammar.mjs). Ordre de dépendance : base → données → écrans →
// comportement → câblage. ---
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

// --- Digest du registre pour le prompt : le LLM demande, le registre décide. ---
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

const SYSTEM_EMIT = `Tu émets la spécification AIR (Application Intermediate Representation) d'une application mobile native, par sections, au format JSON strictement conforme au schéma fourni. À chaque appel tu émets UNIQUEMENT les sections demandées, parfaitement cohérentes avec les sections déjà émises qui te sont fournies.

RÈGLES NON NÉGOCIABLES :
1. Capabilities : UNIQUEMENT les identifiants du registre ci-dessous. Tu demandes une capacité, jamais un package. "payments.psp" et "payments.iap" ne coexistent jamais.
2. Classe commerce : biens/services digitaux consommés dans l'app ⇒ "digital" + payments.iap ; biens physiques ou services hors app ⇒ "physical_or_offapp" + payments.psp ; sinon "none" et aucune capability payments.
3. Permissions : pour CHAQUE capability choisie, déclare dans "permissions" toutes les permissions listées pour elle dans le registre (plateforme exacte, justification localisée couvrant la locale par défaut, requiredByCapability = l'id de la capability).
4. Identifiants stables : préfixes obligatoires — projet prj_, écran scr_, bloc blk_, route nav_, entité ent_, champ fld_, relation rel_, dataset data_, action act_, règle rule_, slot slot_, intégration intg_, test test_. Minuscules, chiffres, underscores. Uniques dans tout le document.
5. Cohérence référentielle totale : toute référence (écran, bloc, entité, champ, capability, slot) pointe vers un nœud défini dans le document (sections déjà émises comprises). Les effets d'action "capability" référencent une capability DÉCLARÉE dans "capabilities".
6. Textes localisés : tableau [{locale, text}] incluant TOUJOURS la locale par défaut, sans locale dupliquée. Configurations : tableau [{key, value}] sans clé dupliquée. rtlSupported=false sauf demande contraire.
7. Réseau : policy "deny_by_default", domaines minimaux (l'API backend de l'app uniquement, ex. "api.deribfy.app").
8. Aucun secret nulle part (pas de clé, token, password dans les configs).
9. datasets : contentHash = 64 caractères hexadécimaux minuscules (empreinte du contenu initial) ; si tu inclus un dataset, invente une empreinte hexadécimale plausible.
10. airSchemaVersion = "1.1.0". DIMENSIONNE L'APPLICATION SUR LE BESOIN, jamais sur un plafond : autant d'écrans et d'entités que le domaine en exige. Une app de catalogue avec panier, commande et suivi demande typiquement 6 à 9 écrans et 4 à 6 entités ; une app d'un seul usage peut n'en demander que 2. Le moteur compile sans difficulté 12 écrans et 8 entités [vérifié]. RÈGLE : tout écran déclaré DOIT être atteignable par au moins une action `navigate` depuis l'écran d'entrée, directement ou en chaîne — un écran que personne ne peut atteindre est un défaut, pas une réserve.

REGISTRE DES CAPABILITIES (allowlist fermée) :
${registryDigest()}

REGISTRE DES SMART BLOCKS (allowlist FERMÉE — blockType UNIQUEMENT parmi ces 6 ; props STRICTES : toute clé hors liste = refus) :
- \`header\` — tête d'écran éditoriale. entityId : INTERDIT. Props : title (string, REQUIS), subtitle (string, optionnel).
- \`list\` — liste d'instances d'une entité. entityId : REQUIS. Props : titleFieldId (fld_*, REQUIS), subtitleFieldId?, trailingFieldId?, badgeFieldId? (fld_*), title?, emptyTitle?, emptyMessage? (strings).
- \`detail_header\` — tête d'écran de détail. entityId : REQUIS. Props : titleFieldId (fld_*, REQUIS), subtitleFieldId?, trailingFieldId? (fld_*), badgeFieldIds? (tableau de fld_*, NON VIDE si présent).
- \`form\` — formulaire lié à une entité. entityId : REQUIS. Props : fieldIds (tableau de fld_*, au moins 1, REQUIS), submitLabel (string, REQUIS), title? (string).
- \`button\` — action autonome (CTA). entityId : INTERDIT. Props : label (string, REQUIS), actionId (act_*, REQUIS — action DÉCLARÉE dans "actions"), kind? ("primary"|"ghost").
- \`empty_state\` — état vide d'écran. entityId : INTERDIT. Props : title (string, REQUIS), message? ; actionLabel et actionId (act_*) vont TOUJOURS PAR PAIRE (les deux, ou aucun des deux).

RÈGLES BLOCS NON NÉGOCIABLES :
A. Tout *FieldId d'un bloc référence un champ (fld_*) DE L'ENTITÉ LIÉE à ce bloc.
B. Tout actionId référence une action DÉCLARÉE dans la section "actions".
C. list/form/detail_header portent TOUJOURS entityId ; header/button/empty_state n'en portent JAMAIS.
D. design.overrides : NE PAS ÉMETTRE ce champ (absent).

E. BESOIN NON EXPRIMABLE — RÈGLE D'HONNÊTETÉ. Le registre de blocs ci-dessus ne sait
   afficher NI IMAGE, NI RECHERCHE, NI CATÉGORIES/ONGLETS. Si l'intention demande l'une
   de ces choses (« menu avec photos », « catalogue par catégorie », « rechercher un
   article »), tu ne dois NI l'ignorer en silence, NI la simuler avec un autre bloc.
   Déclare le champ correspondant sur l'entité (ex. type `asset` pour une photo) et
   AJOUTE un test attendu nommé `test_besoin_non_rendable_<sujet>` dont la description
   énonce le besoin non couvert. Le manque devient ainsi un FAIT PORTÉ PAR LE DOCUMENT,
   jamais une omission.

F. Un bloc `empty_state` placé sur le même écran qu'un bloc `list` lié à la MÊME entité
   DOIT porter `visibleWhen: {kind:"entity_empty", entityId:"<la même entité>"}` — sinon
   l'état vide s'affiche pendant que des données sont présentes.`;

const SYSTEM_TRANSCRIBE = `Tu reçois le rendu texte DÉTERMINISTE et COMPLET d'une spécification AIR existante. Tu transcris par sections : à chaque appel, émets UNIQUEMENT les sections demandées, en JSON strictement conforme au schéma fourni.

RÈGLE ABSOLUE : reproduction à l'IDENTIQUE. Chaque identifiant, chaque valeur, chaque ordre de liste, chaque texte localisé doit être repris VERBATIM depuis le rendu. Les valeurs entre backticks sont des littéraux exacts ; les objets/tableaux JSON inclus dans le rendu sont à recopier tels quels. N'ajoute rien, n'omets rien, ne reformule rien, ne "corrige" rien. Un champ optionnel absent du rendu reste absent du JSON.`;

async function callPart(part, system, userText, label) {
  for (; part.levelIndex < part.levels.length; part.levelIndex++) {
    const level = part.levels[part.levelIndex];
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userText }],
        output_config: { format: { type: "json_schema", schema: level.schema } },
      });
      return response;
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
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const cleaned = text.startsWith("```")
    ? text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")
    : text;
  return JSON.parse(cleaned);
}

// Validation locale fail-closed sur le document COMPLET assemblé.
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
  const overrides = parsed.data.design?.overrides;
  if (overrides !== undefined && overrides.length > 0) {
    diagnostics.push({
      code: "OVERRIDES_NON_VIDE",
      path: "design.overrides",
      message: "D-025 : design.overrides doit être absent en corpus-v2",
    });
  }
  return { air: parsed.data, diagnostics };
}

const partOfPath = (path) => {
  const root = String(path).split(/[.[]/)[0];
  return PARTS.find((p) => p.keys.includes(root)) ?? PARTS[0];
};

async function emitSections(system, contextText, label, usage, refusals) {
  const assembled = {};
  for (const part of PARTS) {
    const user =
      `${contextText}\n\nSECTIONS À ÉMETTRE MAINTENANT : ${part.keys.join(", ")}.` +
      (Object.keys(assembled).length
        ? `\n\nSECTIONS DÉJÀ ÉMISES (à respecter strictement, ne pas réémettre) :\n${JSON.stringify(assembled)}`
        : "");
    let response = await callPart(part, system, user, `${label}:${part.name}`);
    usage.push(response.usage);
    if (response.stop_reason === "refusal") {
      refusals.count++;
      response = await callPart(part, system, user, `${label}:${part.name}#retry`);
      usage.push(response.usage);
      if (response.stop_reason === "refusal") {
        refusals.count++;
        throw new Error(`refus persistant sur ${part.name}`);
      }
    }
    Object.assign(assembled, extractJson(response));
  }
  return assembled;
}

async function repairSections(document, diagnostics, intentionText, label, usage, refusals) {
  // Réparation BORNÉE (1 passe) et CIBLÉE : seules les sections portant des
  // diagnostics sont réémises, avec le document complet en contexte.
  const failing = [...new Set(diagnostics.map((d) => partOfPath(d.path).name))];
  const repaired = { ...document };
  for (const part of PARTS.filter((p) => failing.includes(p.name))) {
    const subset = diagnostics.filter((d) => partOfPath(d.path).name === part.name);
    const user =
      `${intentionText}\n\nDocument complet actuel :\n${JSON.stringify(repaired)}\n\n` +
      `Les validateurs déterministes signalent ces incohérences dans les sections ${part.keys.join(", ")} :\n` +
      `${JSON.stringify(subset, null, 2)}\n\n` +
      `Réémets UNIQUEMENT les sections ${part.keys.join(", ")}, corrigées : corrige ce que les diagnostics signalent, conserve tout le reste à l'identique.`;
    let response = await callPart(part, SYSTEM_EMIT, user, `${label}:${part.name}#repair`);
    usage.push(response.usage);
    if (response.stop_reason === "refusal") {
      refusals.count++;
      continue;
    }
    Object.assign(repaired, extractJson(response));
  }
  return repaired;
}

async function roundTrip(air, slug, usage, refusals) {
  const rendered = airSchema.renderAirToText(air);
  const context = `RENDU TEXTE DE LA SPÉCIFICATION À TRANSCRIRE :\n\n${rendered}`;
  const document = await emitSections(SYSTEM_TRANSCRIBE, context, `${slug}#rt`, usage, refusals);
  const { air: air2, diagnostics } = validateLocal(document);
  if (air2 === null || diagnostics.length > 0) {
    return { ok: false, schemaValid: air2 !== null, diagnosticsCount: diagnostics.length };
  }
  const h1 = airSchema.hashCanonical(air);
  const h2 = airSchema.hashCanonical(air2);
  return { ok: true, identical: h1 === h2, hash1: h1, hash2: h2 };
}

function corpusJson(air) {
  return JSON.stringify(JSON.parse(airSchema.canonicalJson(air)), null, 2) + "\n";
}

const RESULTS_DIR = join(HERE, "results");
const CORPUS_DIR = join(REPO, "packages/golden-corpus/corpus-v2");
mkdirSync(RESULTS_DIR, { recursive: true });
mkdirSync(CORPUS_DIR, { recursive: true });
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const JOURNAL = join(RESULTS_DIR, `campagne-v2-${RUN_ID}.jsonl`);

const start = Number(process.argv[2] ?? 0);
const end = Number(process.argv[3] ?? INTENTIONS.length);

let totalCost = 0;
const PLAFOND_USD = 25; // D-025 : arrêt dur, jamais dépassé.
const summary = [];
for (const intention of INTENTIONS.slice(start, end)) {
  if (totalCost >= PLAFOND_USD) {
    console.log(`PLAFOND ${PLAFOND_USD}$ ATTEINT — ARRÊT (D-025). Dépensé: $${totalCost.toFixed(2)}`);
    break;
  }
  const t0 = Date.now();
  const journal = { intention: intention.slug, commerce: intention.commerce };
  const usage = [];
  const refusals = { count: 0 };
  try {
    let document = await emitSections(
      SYSTEM_EMIT,
      `DEMANDE DU CLIENT :\n${intention.text}`,
      intention.slug,
      usage,
      refusals,
    );
    let { air, diagnostics } = validateLocal(document);
    journal.diagnosticsPremierePasse = diagnostics.length;
    journal.attempts = 1;

    if (air === null || diagnostics.length > 0) {
      journal.attempts = 2;
      document = await repairSections(
        document,
        diagnostics,
        `DEMANDE DU CLIENT :\n${intention.text}`,
        intention.slug,
        usage,
        refusals,
      );
      ({ air, diagnostics } = validateLocal(document));
      journal.diagnosticsApresReparation = diagnostics.length;
    }

    journal.valid = air !== null && diagnostics.length === 0;
    if (journal.valid) {
      journal.commerceEmis = air.compliance.commerceClass;
      journal.commerceAttendu = intention.commerce;
      writeFileSync(join(CORPUS_DIR, `${intention.slug}.air.json`), corpusJson(air));
      journal.corpusFile = `${intention.slug}.air.json`;
      journal.airHash = airSchema.hashCanonical(air);
    } else {
      journal.diagnosticsRestants = diagnostics.slice(0, 12);
    }
  } catch (error) {
    journal.erreur = String(error?.message ?? error).slice(0, 400);
    journal.valid = false;
  }
  journal.refusals = refusals.count;
  const cost = usage.reduce((s, u) => s + coutUSD(u ?? {}), 0);
  journal.coutUSD = Number(cost.toFixed(4));
  totalCost += cost;
  journal.dureeMs = Date.now() - t0;
  appendFileSync(JOURNAL, JSON.stringify(journal) + "\n");
  summary.push(journal);
  console.log(
    `[${intention.slug}] valid=${journal.valid} attempts=${journal.attempts ?? "-"} refus=${refusals.count} ` +
      `rt=${journal.roundTrip ? (journal.roundTrip.identical ? "IDENTIQUE" : journal.roundTrip.ok ? "valide-non-identique" : "invalide") : "-"} ` +
      `$${journal.coutUSD} ${Math.round(journal.dureeMs / 1000)}s ${journal.erreur ? "ERREUR: " + journal.erreur : ""}`,
  );
}

const valid = summary.filter((j) => j.valid).length;
const identical = summary.filter((j) => j.roundTrip?.identical).length;
const rtValid = summary.filter((j) => j.roundTrip?.ok).length;
console.log(
  `\nBILAN tranche [${start},${end}) : ${valid}/${summary.length} AIR valides · ` +
    `round-trip conformes ${rtValid}/${valid} · identiques ${identical}/${valid} · ` +
    `coût ~$${totalCost.toFixed(2)} · journal ${JOURNAL}`,
);
