// SIMULATION À BLANC DU FIX v2 (2.4-H) — AUCUN APPEL API, AUCUN SDK IMPORTÉ.
// Le moteur de transcription (transcribe-lib.mjs) reçoit des transports
// SCRIPTÉS qui rejouent chaque mode de défaillance observé ou envisagé ;
// on vérifie que le système REFUSE toute sortie incomplète/incohérente
// (fail-closed, jamais de document partiel) et que les cas sains restent
// identiques au hash canonique (non-régression sur les 12 AIR du corpus).
//
// Usage : node simulate-fix-v2.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TranscriptionRefusedError,
  parseRenderCounts,
  transcribeAirV2,
} from "./transcribe-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const airSchema = await import(join(REPO, "packages/air-schema/src/index.ts"));

const CORPUS = join(REPO, "packages/golden-corpus/corpus");
const loadAir = (slug) =>
  airSchema.projectAirSchema.parse(JSON.parse(readFileSync(join(CORPUS, `${slug}.air.json`), "utf8")));

const SLUGS = [
  "agence-immo", "billetterie-concerts", "boutique-mode", "coach-fitness",
  "cours-cuisine", "livraison-fruits", "plombier-urgence", "resto-quartier",
  "salon-coiffure", "suivi-chantier", "toiletteur-chiens", "tuteur-langues",
];

// Transport honnête : rejoue fidèlement le contenu original (simule un
// modèle parfaitement obéissant). Toute variante défaillante l'enveloppe.
function honestTransport(air, counter = { calls: 0 }) {
  return async ({ kind, keys, screenId }) => {
    counter.calls++;
    if (kind === "part") {
      return structuredClone(Object.fromEntries(keys.map((k) => [k, air[k]])));
    }
    const screen = air.screens.find((s) => s.id === screenId);
    return structuredClone({ screen });
  };
}

async function expectRefusal(name, promise, code) {
  let result;
  try {
    result = await promise;
  } catch (error) {
    assert.ok(error instanceof TranscriptionRefusedError, `${name} : erreur inattendue ${error}`);
    assert.equal(error.code, code, `${name} : code ${error.code} ≠ ${code} attendu`);
    console.log(`  PASS ${name} → REFUS [${code}]`);
    return;
  }
  assert.fail(`${name} : un document a été retourné (${result?.hash}) au lieu d'un refus ${code}`);
}

let failures = 0;
async function scenario(name, fn) {
  try {
    await fn();
  } catch (error) {
    failures++;
    console.log(`  FAIL ${name} : ${error.message}`);
  }
}

console.log("== 1. NON-RÉGRESSION : transport honnête sur les 12 AIR du corpus ==");
for (const slug of SLUGS) {
  await scenario(`honnête ${slug}`, async () => {
    const air = loadAir(slug);
    const rendered = airSchema.renderAirToText(air);
    const counter = { calls: 0 };
    const { air: out, hash } = await transcribeAirV2({ rendered, transport: honestTransport(air, counter) });
    assert.equal(hash, airSchema.hashCanonical(air), "hash différent");
    assert.deepEqual(out.screens.map((s) => s.id), air.screens.map((s) => s.id), "ordre des écrans");
    assert.equal(counter.calls, 4 + air.screens.length, "nombre d'appels inattendu");
    console.log(`  PASS ${slug} — identique (${counter.calls} appels simulés)`);
  });
}

const air = loadAir("resto-quartier"); // le plus gros échec réel de campagne
const rendered = airSchema.renderAirToText(air);

console.log("\n== 2. DÉFAILLANCES : chaque sortie incomplète/incohérente doit être REFUSÉE ==");

await scenario("écran tronqué (persistant — mode observé en campagne)", async () => {
  const t = honestTransport(air);
  const transport = async (call) => {
    const out = await t(call);
    if (call.kind === "screen" && call.index === 1) out.screen.blocks = out.screen.blocks.slice(0, 2);
    return out;
  };
  await expectRefusal("écran tronqué persistant", transcribeAirV2({ rendered, transport }), "SECTION_COUNT");
});

await scenario("écran tronqué transitoire → récupéré par retry", async () => {
  const t = honestTransport(air);
  const transport = async (call) => {
    const out = await t(call);
    if (call.kind === "screen" && call.index === 2 && call.attempt === 0) out.screen.blocks = [];
    return out;
  };
  const { hash } = await transcribeAirV2({ rendered, transport });
  assert.equal(hash, airSchema.hashCanonical(air));
  console.log("  PASS transitoire récupéré par retry — hash identique");
});

await scenario("mauvais écran retourné (échange d'ids)", async () => {
  const t = honestTransport(air);
  const transport = async (call) => {
    if (call.kind === "screen" && call.index === 0) {
      return structuredClone({ screen: air.screens[1] });
    }
    return t(call);
  };
  await expectRefusal("échange d'écrans", transcribeAirV2({ rendered, transport }), "SCREEN_ID_MISMATCH");
});

await scenario("nombre d'écrans incorrect dans le rendu (en-tête ≠ détail)", async () => {
  const altered = rendered.replace("## Écrans (4)", "## Écrans (3)");
  await expectRefusal("comptes incohérents du rendu", transcribeAirV2({ rendered: altered, transport: honestTransport(air) }), "SECTION_COUNT");
});

await scenario("section actions tronquée (schema-valide mais incomplète)", async () => {
  const t = honestTransport(air);
  const transport = async (call) => {
    const out = await t(call);
    if (call.kind === "part" && call.name === "comportement") out.actions = out.actions.slice(0, 5);
    return out;
  };
  await expectRefusal("actions tronquées", transcribeAirV2({ rendered, transport }), "SECTION_COUNT");
});

await scenario("routes de navigation tronquées", async () => {
  const t = honestTransport(air);
  const transport = async (call) => {
    const out = await t(call);
    if (call.kind === "part" && call.name === "base") out.navigation.routes = out.navigation.routes.slice(0, 1);
    return out;
  };
  await expectRefusal("routes tronquées", transcribeAirV2({ rendered, transport }), "SECTION_COUNT");
});

await scenario("champs d'entité tronqués", async () => {
  const t = honestTransport(air);
  const transport = async (call) => {
    const out = await t(call);
    if (call.kind === "part" && call.name === "donnees") out.entities[0].fields = out.entities[0].fields.slice(0, 1);
    return out;
  };
  await expectRefusal("champs tronqués", transcribeAirV2({ rendered, transport }), "SECTION_COUNT");
});

await scenario("clé étrangère dans une partie (objet non strict)", async () => {
  const t = honestTransport(air);
  const transport = async (call) => {
    const out = await t(call);
    if (call.kind === "part" && call.name === "cablage") out.extra = true;
    return out;
  };
  await expectRefusal("clé étrangère", transcribeAirV2({ rendered, transport }), "PART_SCHEMA");
});

await scenario("échec transitoire d'un appel individuel → récupéré", async () => {
  const t = honestTransport(air);
  const transport = async (call) => {
    if (call.kind === "screen" && call.index === 3 && call.attempt === 0) throw new Error("panne réseau simulée");
    return t(call);
  };
  const { hash } = await transcribeAirV2({ rendered, transport });
  assert.equal(hash, airSchema.hashCanonical(air));
  console.log("  PASS panne transitoire récupérée — hash identique");
});

await scenario("échec persistant d'un appel → refus, jamais d'assemblage partiel", async () => {
  const t = honestTransport(air);
  const transport = async (call) => {
    if (call.kind === "part" && call.name === "cablage") throw new Error("panne persistante simulée");
    return t(call);
  };
  await expectRefusal("panne persistante", transcribeAirV2({ rendered, transport }), "CALL_FAILED");
});

await scenario("incohérence sémantique finale (référence cassée à comptes égaux)", async () => {
  const t = honestTransport(air);
  const transport = async (call) => {
    const out = await t(call);
    if (call.kind === "part" && call.name === "comportement") {
      const ui = out.actions.find((a) => a.trigger.kind === "ui");
      ui.trigger.blockId = "blk_invente_hors_document";
    }
    return out;
  };
  await expectRefusal("référence cassée", transcribeAirV2({ rendered, transport }), "FINAL_SEMANTIC");
});

console.log("\n== 3. LIMITE RÉSIDUELLE DOCUMENTÉE : divergence de CONTENU à comptes égaux ==");
await scenario("props modifiées (comptes égaux) → non refusé, mais DÉTECTÉ par le hash du banc", async () => {
  const t = honestTransport(air);
  const transport = async (call) => {
    const out = await t(call);
    if (call.kind === "screen" && call.index === 0) {
      const withProps = out.screen.blocks.find((b) => b.props !== undefined);
      if (withProps) withProps.props = [{ key: "altere", value: true }];
    }
    return out;
  };
  const { hash } = await transcribeAirV2({ rendered, transport });
  assert.notEqual(hash, airSchema.hashCanonical(air), "le hash aurait dû différer");
  console.log("  PASS divergence de contenu : document valide retourné, hash ≠ → détectée par la comparaison du banc (limite consignée : non REFUSÉE par les comptes)");
});

console.log("\n== 4. PARSING DU RENDU : comptes extraits = réalité des 12 AIR ==");
for (const slug of SLUGS) {
  await scenario(`comptes ${slug}`, async () => {
    const a = loadAir(slug);
    const expected = parseRenderCounts(airSchema.renderAirToText(a));
    assert.equal(expected.counts.screens, a.screens.length);
    assert.deepEqual(expected.screens.map((s) => s.id), a.screens.map((s) => s.id));
    assert.deepEqual(expected.screens.map((s) => s.blocks), a.screens.map((s) => s.blocks.length));
    assert.equal(expected.counts.actions, a.actions.length);
    assert.deepEqual(expected.entities.map((e) => [e.id, e.fields]), a.entities.map((e) => [e.id, e.fields.length]));
    assert.equal(expected.routes, a.navigation.routes.length);
  });
}
console.log("  PASS comptes exacts sur les 12 AIR");

if (failures > 0) {
  console.log(`\nSIMULATION : ${failures} ÉCHEC(S)`);
  process.exit(1);
}
console.log("\nSIMULATION : TOUS LES SCÉNARIOS PASSENT");
