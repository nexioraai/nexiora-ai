// FIX v2 (2.4-H) — MOTEUR DE TRANSCRIPTION À TRANSPORT INJECTABLE.
// Cause confirmée par dumps : troncature schema-valide des sections longues.
// Réponse : (a) transcription des écrans UN PAR UN (sorties courtes),
// (b) CONTRÔLE DÉTERMINISTE DE COMPLÉTUDE — les comptes attendus sont
// extraits DU RENDU TEXTE LUI-MÊME (jamais de l'AIR original : le
// round-trip reste honnête), (c) refus fail-closed de toute sortie
// incomplète ou incohérente — JAMAIS de document partiel retourné.
//
// AUCUN appel réseau ici : le `transport` est injecté (vrai appel API pour
// le banc payant, transports scriptés pour la simulation à blanc).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

const airSchema = await import(join(REPO, "packages/air-schema/src/index.ts"));
const registry = await import(join(REPO, "packages/capability-registry/src/index.ts"));

export class TranscriptionRefusedError extends Error {
  constructor(code, stage, message) {
    super(`[${code}] ${stage} : ${message}`);
    this.name = "TranscriptionRefusedError";
    this.code = code;
    this.stage = stage;
  }
}

// --- Extraction des comptes attendus depuis le RENDU (déterministe). Toutes
// les lignes du rendu sont mono-lignes par construction (valeurs JSON
// échappées) : le parsing par préfixe de ligne est sans ambiguïté. ---
export function parseRenderCounts(rendered) {
  const lines = rendered.split("\n");
  const sectionCount = (title) => {
    const line = lines.find((l) => l.startsWith(`## ${title} (`));
    if (line === undefined) {
      throw new TranscriptionRefusedError("RENDER_PARSE", "comptes", `section "${title}" introuvable dans le rendu`);
    }
    return Number(line.slice(line.lastIndexOf("(") + 1, line.lastIndexOf(")")));
  };

  // Écrans : ids en ordre de rendu + nombre de blocs par écran + GARDE
  // 2.4-H : nombre de pairs de props par bloc (null = bloc sans props).
  // Ferme le trou prouvé par les bruts A2/A4 : des props supprimées restent
  // schema-valides (optionnelles) et passaient les comptes de blocs.
  const propsPairsOf = (line) => {
    const idx = line.indexOf("· props: ");
    if (idx === -1) return null;
    const parsed = JSON.parse(line.slice(idx + "· props: ".length));
    if (!Array.isArray(parsed)) {
      throw new TranscriptionRefusedError("RENDER_PARSE", "comptes", "props non-tableau dans le rendu");
    }
    return parsed.length;
  };
  const screens = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^### Écran `([^`]+)`/);
    if (m) {
      current = { id: m[1], blocks: 0, propsPairs: [] };
      screens.push(current);
      continue;
    }
    if (line.startsWith("### ") || (line.startsWith("## ") && current !== null)) {
      current = null;
    }
    if (current !== null && line.startsWith("- bloc ")) {
      current.blocks++;
      current.propsPairs.push(propsPairsOf(line));
    }
  }

  // Entités : ids + nombre de champs par entité.
  const entities = [];
  let entity = null;
  for (const line of lines) {
    const m = line.match(/^### Entité `([^`]+)`/);
    if (m) {
      entity = { id: m[1], fields: 0 };
      entities.push(entity);
      continue;
    }
    if (line.startsWith("### ") && !line.startsWith("### Entité") || (line.startsWith("## ") && entity !== null)) {
      entity = null;
    }
    if (entity !== null && line.startsWith("- champ ")) {
      entity.fields++;
    }
  }

  const routes = lines.filter((l) => l.startsWith("- route ")).length;

  return {
    screens,
    entities,
    routes,
    counts: {
      screens: sectionCount("Écrans"),
      entities: sectionCount("Entités"),
      relations: sectionCount("Relations"),
      datasets: sectionCount("Jeux de données initiaux"),
      actions: sectionCount("Actions"),
      rules: sectionCount("Règles métier"),
      slots: sectionCount("Code Slots"),
      capabilities: sectionCount("Capabilities"),
      permissions: sectionCount("Permissions"),
      integrations: sectionCount("Intégrations"),
      expectedTests: sectionCount("Tests attendus"),
    },
  };
}

// --- Plan d'appels : 4 parties + 1 appel PAR ÉCRAN. ---
const PART_DEFS = [
  { name: "base", keys: ["airSchemaVersion", "projectId", "app", "navigation", "design", "network", "native", "compliance"] },
  { name: "donnees", keys: ["entities", "relations", "datasets", "rules", "slots"] },
  { name: "comportement", keys: ["actions", "capabilities", "permissions"] },
  { name: "cablage", keys: ["integrations", "expectedTests"] },
];
for (const part of PART_DEFS) {
  part.zod = airSchema.projectAirSchema.pick(Object.fromEntries(part.keys.map((k) => [k, true])));
}
export const screenSchema = airSchema.projectAirSchema.shape.screens.element;
export const CALL_PLAN = PART_DEFS;

function checkArrayCount(stage, label, actual, expected) {
  if (actual !== expected) {
    throw new TranscriptionRefusedError(
      "SECTION_COUNT",
      stage,
      `${label} : ${actual} élément(s) émis, ${expected} attendus d'après le rendu`,
    );
  }
}

// Validation de complétude d'une PARTIE contre les comptes du rendu.
function validatePart(part, data, expected) {
  const parsed = part.zod.safeParse(data);
  if (!parsed.success) {
    throw new TranscriptionRefusedError("PART_SCHEMA", part.name, parsed.error.issues[0]?.message ?? "schéma invalide");
  }
  const d = parsed.data;
  if (part.name === "base") {
    checkArrayCount(part.name, "navigation.routes", d.navigation.routes.length, expected.routes);
  }
  if (part.name === "donnees") {
    checkArrayCount(part.name, "entities", d.entities.length, expected.counts.entities);
    checkArrayCount(part.name, "relations", d.relations.length, expected.counts.relations);
    checkArrayCount(part.name, "datasets", d.datasets.length, expected.counts.datasets);
    checkArrayCount(part.name, "rules", d.rules.length, expected.counts.rules);
    checkArrayCount(part.name, "slots", d.slots.length, expected.counts.slots);
    d.entities.forEach((e, i) => {
      const exp = expected.entities[i];
      if (exp === undefined || e.id !== exp.id) {
        throw new TranscriptionRefusedError("ENTITY_ID_MISMATCH", part.name, `entité ${i} : "${e.id}" ≠ "${exp?.id}" attendu (ordre du rendu)`);
      }
      checkArrayCount(part.name, `entities[${i}].fields`, e.fields.length, exp.fields);
    });
  }
  if (part.name === "comportement") {
    checkArrayCount(part.name, "actions", d.actions.length, expected.counts.actions);
    checkArrayCount(part.name, "capabilities", d.capabilities.length, expected.counts.capabilities);
    checkArrayCount(part.name, "permissions", d.permissions.length, expected.counts.permissions);
  }
  if (part.name === "cablage") {
    checkArrayCount(part.name, "integrations", d.integrations.length, expected.counts.integrations);
    checkArrayCount(part.name, "expectedTests", d.expectedTests.length, expected.counts.expectedTests);
  }
  return parsed.data;
}

function validateScreen(index, expectedScreen, data) {
  const parsed = screenSchema.safeParse(data?.screen);
  if (!parsed.success) {
    throw new TranscriptionRefusedError("SCREEN_SCHEMA", `ecran[${index}]`, parsed.error.issues[0]?.message ?? "schéma invalide");
  }
  const s = parsed.data;
  if (s.id !== expectedScreen.id) {
    throw new TranscriptionRefusedError("SCREEN_ID_MISMATCH", `ecran[${index}]`, `"${s.id}" ≠ "${expectedScreen.id}" attendu (ordre du rendu)`);
  }
  checkArrayCount(`ecran[${index}]`, `blocks de ${s.id}`, s.blocks.length, expectedScreen.blocks);
  // GARDE 2.4-H : les props de chaque bloc doivent exister et compter
  // EXACTEMENT les pairs annoncées par le rendu (null = pas de props).
  s.blocks.forEach((b, j) => {
    const attendu = expectedScreen.propsPairs[j];
    const emis = b.props === undefined ? null : b.props.length;
    if (attendu !== emis) {
      throw new TranscriptionRefusedError(
        "PROPS_COUNT",
        `ecran[${index}]`,
        `bloc "${b.id}" : props ${emis === null ? "absentes" : `${emis} pair(s)`} vs ${attendu === null ? "aucune" : `${attendu} pair(s)`} attendu d'après le rendu`,
      );
    }
  });
  return s;
}

async function attempt(stage, maxRetries, run) {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await run(i);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof TranscriptionRefusedError) throw lastError;
  throw new TranscriptionRefusedError("CALL_FAILED", stage, String(lastError?.message ?? lastError));
}

// --- Transcription complète v2. `transport({kind, name, schema, expected,
// rendered, assembled, attempt})` retourne l'objet JSON de l'appel. Refus
// fail-closed : toute incomplétude/incohérence lève, rien n'est retourné. ---
export async function transcribeAirV2({ rendered, transport, maxRetries = 1 }) {
  const expected = parseRenderCounts(rendered);
  checkArrayCount("rendu", "écrans (en-tête vs blocs détaillés)", expected.screens.length, expected.counts.screens);

  const assembled = {};
  for (const part of PART_DEFS) {
    const data = await attempt(part.name, maxRetries, async (attemptIndex) => {
      const raw = await transport({ kind: "part", name: part.name, keys: part.keys, zod: part.zod, expected, rendered, assembled: { ...assembled }, attempt: attemptIndex });
      return validatePart(part, raw, expected);
    });
    Object.assign(assembled, data);
  }

  const screens = [];
  for (let i = 0; i < expected.screens.length; i++) {
    const spec = expected.screens[i];
    const screen = await attempt(`ecran[${i}]`, maxRetries, async (attemptIndex) => {
      const raw = await transport({ kind: "screen", name: `ecran:${spec.id}`, screenId: spec.id, index: i, zod: screenSchema, expected, rendered, assembled: { ...assembled }, attempt: attemptIndex });
      return validateScreen(i, spec, raw);
    });
    screens.push(screen); // ordre du RENDU, quel que soit le transport
  }
  assembled.screens = screens;

  // Validation finale fail-closed du document COMPLET.
  const parsed = airSchema.projectAirSchema.safeParse(assembled);
  if (!parsed.success) {
    throw new TranscriptionRefusedError("FINAL_SCHEMA", "assemblage", parsed.error.issues[0]?.message ?? "schéma invalide");
  }
  const diagnostics = [
    ...airSchema.validateAir(parsed.data),
    ...registry.validateAirCapabilities(parsed.data),
  ];
  if (diagnostics.length > 0) {
    throw new TranscriptionRefusedError("FINAL_SEMANTIC", "assemblage", `${diagnostics.length} diagnostic(s) — premier : ${diagnostics[0].code} ${diagnostics[0].path}`);
  }
  return { air: parsed.data, hash: airSchema.hashCanonical(parsed.data) };
}
