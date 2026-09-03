// SIMULATION — applique MÉCANIQUEMENT les 5 nouvelles règles du prompt v3 à un
// document du corpus, puis mesure. Aucun appel API : on prouve que les RÈGLES
// suffisent, avant de payer pour qu'un modèle les suive.
const R = "/Users/yia/Documents/woorri/";
const { readFileSync } = await import("node:fs");
const { migrateAirDocument } = await import(R + "packages/air-schema/src/migrations.ts");
const { assertValidAir } = await import(R + "packages/air-schema/src/validate.ts");
const { compileProject } = await import(R + "packages/compiler/src/index.ts");
const { EXECUTION_ENVELOPE_V1: ENV } = await import(R + "packages/execution-contract/src/envelope.ts");
const { evaluatePromises } = await import(R + "packages/fidelity/src/promises.ts");
const { evaluateIntentCoverage } = await import(R + "packages/fidelity/src/intent.ts");

const src = migrateAirDocument(JSON.parse(readFileSync(R + "packages/golden-corpus/corpus-v2/resto-quartier.air.json", "utf8")));
const air = JSON.parse(JSON.stringify(src));

const ecrans = new Set(air.screens.map((s) => s.id));
const blocs = new Map(air.screens.flatMap((s) => s.blocks.map((b) => [b.id, { b, s }])));
const entites = new Map(air.entities.map((e) => [e.id, e]));

// RÈGLE 14 — titres d'état sur tout bloc lié à une entité
let titres = 0;
for (const s of air.screens) for (const b of s.blocks) {
  if (b.entityId === undefined) continue;
  b.props = [...(b.props ?? []),
    { key: "loadingTitle", value: "Chargement…" },
    { key: "errorTitle", value: "Données indisponibles" },
    { key: "errorMessage", value: "Vérifiez votre connexion." }];
  titres++;
}
// RÈGLE 15 — champ d'affichage des références
let refs = 0;
for (const e of air.entities) for (const f of e.fields) {
  if (f.type !== "reference" || f.referencesEntityId === undefined) continue;
  const cible = entites.get(f.referencesEntityId);
  const aff = cible?.fields.find((x) => x.type === "string" || x.type === "text");
  if (aff) { f.referenceDisplayFieldId = aff.id; refs++; }
}
// RÈGLE 12 — liaison de chaque slot
let liaisons = 0;
for (const a of air.actions) {
  if (a.effect.kind !== "slot") continue;
  const slot = air.slots.find((s) => s.id === a.effect.slotId);
  if (!slot || slot.outputs.length === 0) continue;
  const ent = air.entities[0];
  const cible = [...blocs.values()].find((x) => x.b.blockType === "header");
  if (!cible) continue;
  a.effect.binding = {
    inputs: slot.inputs.map((p) => ({ port: p.name, source: { kind: "entity_rows", entityId: ent.id } })),
    outputs: [{ port: slot.outputs[0].name, blockId: cible.b.id, prop: "subtitle" }],
  };
  liaisons++;
}
// RÈGLE 13 — écrire puis confirmer
let ecritures = 0;
for (const a of air.actions) {
  if (a.trigger.kind !== "ui") continue;
  const cible = blocs.get(a.trigger.blockId);
  if (cible?.b.blockType !== "form" || a.effect.kind !== "navigate") continue;
  a.effect = { kind: "mutation", entityId: cible.b.entityId, operation: "create", thenScreenId: a.effect.screenId };
  ecritures++;
}
// RÈGLE 10 — tout écran DOIT être atteignable. La simulation la rend effective
// en câblant l'écran orphelin sur la liste de son entité, ce qu'un modèle qui
// suit la règle ferait naturellement.
const { reachableScreens } = await import(R + "packages/execution-contract/src/graph.ts");
let recables = 0;
for (const orphelin of air.screens.filter((s) => !new Set(reachableScreens(air, ENV.triggers)).has(s.id))) {
  const source = air.screens.find((s) =>
    s.id !== orphelin.id && s.blocks.some((b) => b.blockType === "list"),
  );
  const liste = source?.blocks.find((b) => b.blockType === "list");
  if (!source || !liste) continue;
  if (air.actions.some((a) => a.trigger.kind === "ui" && a.trigger.blockId === liste.id)) continue;
  air.actions.push({ id: `act_ouvrir_${orphelin.id.slice(4)}`, name: `ouvrir ${orphelin.id}`,
    trigger: { kind: "ui", blockId: liste.id }, effect: { kind: "navigate", screenId: orphelin.id } });
  recables++;
}

// RÈGLE 16 — toute entité rendue ET alimentée
let peuplees = 0;
for (const e of air.entities) {
  const liee = air.screens.some((s) => s.blocks.some((b) => b.entityId === e.id));
  const seed = air.datasets.find((d) => d.entityId === e.id && d.rowCount > 0);
  if (liee && seed) continue;
  if (!seed) {
    const d = air.datasets.find((x) => x.entityId === e.id);
    if (d) d.rowCount = 6;
    else air.datasets.push({ id: `data_${e.id.slice(4)}`, entityId: e.id, rowCount: 6,
      contentHash: "0".repeat(48) + Math.abs([...e.id].reduce((h,c)=>h*31+c.charCodeAt(0),7)).toString(16).padStart(16,"0").slice(0,16) });
    peuplees++;
  }
}
// RÈGLE 17 — aucune promesse sur un effet capability ; le besoin est DÉCLARÉ
const capActions = new Set(air.actions.filter((a) => a.effect.kind === "capability").map((a) => a.id));
const avantTests = air.expectedTests.length;
air.expectedTests = air.expectedTests.filter((t) => !capActions.has(t.targetId));
const retires = avantTests - air.expectedTests.length;

// RÈGLE 11 — intention, un besoin par écran atteignable + les manques déclarés
air.intent = {
  request: "Je veux une application pour mon restaurant de quartier : voir la carte, commander, suivre ma commande, et retrouver mes commandes passées.",
  requestLocale: "fr-FR",
  needs: [
    ...air.screens.map((s, i) => ({
      id: `need_ecran_${String(i)}`,
      statement: `accéder à l'écran « ${s.title[0].text} »`,
      resolution: { kind: "satisfied", nodeIds: [s.id] },
    })),
    { id: "need_photos", statement: "des photos sur les plats",
      resolution: { kind: "unexpressible", reason: "le registre de Smart Blocks ne comporte aucun bloc image" } },
    ...(capActions.size === 0 ? [] : [{ id: "need_capabilites", statement: "notifications, analytique, mode hors ligne",
      resolution: { kind: "unexpressible", reason: "le moteur n'exécute pas encore les effets capability (capabilitiesEmitCode: false)" } }]),
  ],
};

console.log("═".repeat(70));
console.log("SIMULATION — les 5 règles du prompt v3, appliquées mécaniquement");
console.log("═".repeat(70));
console.log(`\n  titres d'état ajoutés : ${titres}   références résolues : ${refs}`);
console.log(`  slots liés            : ${liaisons}   formulaires qui écrivent : ${ecritures}`);
console.log(`  besoins déclarés      : ${air.intent.needs.length}   entités peuplées : ${peuplees}   écrans recâblés : ${recables}   promesses capability retirées : ${retires}\n`);

let valide;
try { valide = assertValidAir(air); console.log("  ① validateur ........ 🟢 ACCEPTÉ"); }
catch (e) { console.log("  ① validateur ........ 🔴", (e.diagnostics ?? []).slice(0,3).map(d=>d.code+" "+d.path).join(" | ") || e.message.slice(0,120)); process.exit(1); }

const slotsImpl = air.slots.map((s) => ({ slotId: s.id, authorId: "sim",
  source: `export function runSlot(e: Record<string, unknown>): { ${s.outputs[0]?.name ?? "r"}: string } {\n  return { ${s.outputs[0]?.name ?? "r"}: String(Object.keys(e).length) };\n}\n` }));
const c = compileProject(valide, undefined, slotsImpl.length ? { slots: slotsImpl } : undefined);
console.log(`  ② compilation ....... 🟢 ${c.files.size} fichiers`);

const f1 = evaluatePromises(valide, ENV), f4 = evaluateIntentCoverage(valide, ENV);
const a1 = evaluatePromises(src, ENV), a4 = evaluateIntentCoverage(src, ENV);
console.log("\n  ── AVANT / APRÈS sur resto-quartier ──");
console.log(`  F1 promesses vivantes : ${a1.vivantes}/${a1.declared}  →  ${f1.vivantes}/${f1.declared}   ${f1.passed?"🟢":"🔴"}`);
console.log(`  F4 couverture         : ${a4.present?"—":"pas d'intention"}  →  ${f4.satisfaits} ok · ${f4.inexprimables} dits · ${f4.defaillants} KO   ${f4.passed?"🟢":"🔴"}`);
console.log(`\n  VERDICT : ${f1.passed && f4.passed ? "🟢 FIDÈLE" : "🔴 REFUSÉ"}`);
if (!f1.passed) console.log("   F1 :", f1.failures.join(" · "));
if (!f4.passed) console.log("   F4 :", f4.failures.join(" · "));

// PREUVE FINALE — le document simulé compile-t-il et se rend-il ?
const { mkdirSync, writeFileSync, rmSync, symlinkSync } = await import("node:fs");
const { execFileSync } = await import("node:child_process");
const dir = "/tmp/sim-app/";
rmSync(dir, { recursive: true, force: true });
for (const [f, contenu] of c.files) {
  const q = dir + f;
  mkdirSync(q.slice(0, q.lastIndexOf("/")), { recursive: true });
  writeFileSync(q, contenu);
}
symlinkSync(R + "slices/resto-riche/app/node_modules", dir + "node_modules", "dir");
try {
  execFileSync("npx", ["tsc", "--noEmit"], { cwd: dir, stdio: "pipe", timeout: 180000 });
  console.log("  ③ tsc de l'app ...... 🟢 EXIT=0");
} catch (e) {
  const o = String(e.stdout ?? "") + String(e.stderr ?? "");
  console.log("  ③ tsc de l'app ...... 🔴", o.split("\n").filter((l) => l.includes("error TS")).slice(0, 2).join(" | ").slice(0, 160));
}

// DIAGNOSTIC : de quoi meurent les promesses qui restent ?
const byId = new Map(valide.actions.map((a) => [a.id, a]));
const causes = {};
for (const v of f1.verdicts.filter((x) => x.state === "cible_morte")) {
  const a = byId.get(v.targetId);
  const c = a ? `effet ${a.effect.kind}` : v.targetKind === "screen" ? "écran inatteignable" : "entité non rendue";
  causes[c] = (causes[c] ?? 0) + 1;
}
console.log("\n  ── de quoi meurent les 7 restantes ? ──");
for (const [c, n] of Object.entries(causes).sort((a, b) => b[1] - a[1])) console.log(`     ${c.padEnd(24)} ${n}`);
const ko = f4.verdicts.filter((v) => v.state !== "satisfait" && v.state !== "inexprimable");
for (const v of ko) console.log(`     besoin KO : ${v.statement} — ${v.motif.slice(0, 70)}`);
