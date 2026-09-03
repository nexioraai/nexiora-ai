// CAMPAGNE 2 — SÉMANTIQUE RUNTIME vs SÉMANTIQUE VALIDATEUR.
// Lecture seule sur le dépôt. Aucun fichier produit modifié.
// Objet : calculer Δ = RuntimeGraph − ValidatorGraph et Δ' = Validator − Runtime
// sur le CORPUS RÉEL (13 documents), avec l'instrument réel.
import { readFileSync, readdirSync } from "node:fs";
const REPO = "/Users/yia/Documents/woorri";
const { reachableScreens } = await import(REPO + "/packages/execution-contract/src/graph.ts");
const { EXECUTION_ENVELOPE_V1: E } = await import(REPO + "/packages/execution-contract/src/envelope.ts");
const { analyzeFeasibility } = await import(REPO + "/packages/execution-contract/src/feasibility.ts");
const { validateAir } = await import(REPO + "/packages/air-schema/src/validate.ts");
const { migrateAirDocument } = await import(REPO + "/packages/air-schema/src/migrations.ts");

const ALL = ["ui", "lifecycle", "data"];
const DISPATCH_BY_PROP = new Set(["button", "empty_state"]);   // AirButton / AirEmptyState : props.actionId
const DISPATCH_BY_TRIGGER = new Set(["list", "form"]);          // AirList / AirForm : uiActionsByBlock
const NO_DISPATCH = new Set(["header", "detail_header"]);       // aucun handler dans le runtime

const prop = (b, k) => (b.props ?? []).find((p) => p.key === k)?.value;
const rows = (air) => {
  const m = new Map();
  for (const d of air.datasets) m.set(d.entityId, (m.get(d.entityId) ?? 0) + d.rowCount);
  return m;
};
// Satisfiabilité de visibleWhen d'après les datasets DÉCLARÉS (le provider de
// preview ne consomme que les fixtures : D-013/D-030).
const visible = (b, r) => {
  const c = b.visibleWhen;
  if (c === undefined) return true;
  const n = r.get(c.entityId) ?? 0;
  return c.kind === "entity_empty" ? n === 0 : n > 0;
};

/**
 * GRAPHE RUNTIME : arête S→T ssi il existe un SITE DE DISPATCH sur S.
 * Conditions extraites de packages/compiler/runtime/air-runtime.tsx.
 */
function runtimeEdges(air) {
  const r = rows(air);
  const byId = new Map(air.actions.map((a) => [a.id, a]));
  const out = [];
  for (const s of air.screens) {
    for (const b of s.blocks) {
      const vis = visible(b, r);
      if (DISPATCH_BY_PROP.has(b.blockType)) {
        const aid = prop(b, "actionId");
        const a = typeof aid === "string" ? byId.get(aid) : undefined;
        if (a?.effect.kind === "navigate")
          out.push({ from: s.id, to: a.effect.screenId, actionId: a.id, site: b.blockType, blockId: b.id, live: vis, why: vis ? "ok" : "bloc jamais visible" });
      }
      if (DISPATCH_BY_TRIGGER.has(b.blockType)) {
        const a = air.actions.find((x) => x.trigger.kind === "ui" && x.trigger.blockId === b.id);
        if (a?.effect.kind === "navigate") {
          // AirList n'expose onItemPress que sur des ITEMS : 0 ligne ⇒ rien à presser.
          const hasRow = b.blockType !== "list" || (r.get(b.entityId) ?? 0) > 0;
          const live = vis && hasRow;
          out.push({ from: s.id, to: a.effect.screenId, actionId: a.id, site: b.blockType, blockId: b.id, live, why: !vis ? "bloc jamais visible" : !hasRow ? "liste sans ligne" : "ok" });
        }
      }
    }
  }
  return out;
}

/** Fermeture transitive sur les arêtes VIVANTES du runtime. */
function runtimeReachable(air) {
  const edges = runtimeEdges(air).filter((e) => e.live);
  const ids = new Set(air.screens.map((s) => s.id));
  const seen = new Set(ids.has(air.navigation.entryScreenId) ? [air.navigation.entryScreenId] : []);
  let grew = true;
  while (grew) { grew = false;
    for (const e of edges) if (seen.has(e.from) && ids.has(e.to) && !seen.has(e.to)) { seen.add(e.to); grew = true; } }
  return seen;
}

/** Arêtes comptées par le VALIDATEUR (graph.ts) mais sans site de dispatch runtime. */
function validatorOnlyEdges(air) {
  const rtKeys = new Set(runtimeEdges(air).filter((e) => e.live).map((e) => e.actionId));
  const out = [];
  const blockScreen = new Map();
  for (const s of air.screens) for (const b of s.blocks) blockScreen.set(b.id, { screen: s.id, type: b.blockType, block: b });
  const r = rows(air);
  for (const a of air.actions) {
    if (a.effect.kind !== "navigate") continue;
    if (rtKeys.has(a.id)) continue;
    const t = a.trigger;
    let cls;
    if (t.kind === "data") cls = "D-DATA · déclencheur data : aucun mécanisme runtime, événement jamais prouvé productible";
    else if (t.kind === "lifecycle") cls = "D-LIFECYCLE · déclencheur lifecycle : aucun mécanisme runtime";
    else {
      const o = blockScreen.get(t.blockId);
      if (o === undefined) cls = "D-DANGLING · blockId inconnu (fermé par le validateur sémantique)";
      else if (NO_DISPATCH.has(o.type)) cls = `D-INERT-BLOCK · déclencheur ui sur un bloc \`${o.type}\` : le runtime n'y attache AUCUN handler`;
      else if (!visible(o.block, r)) cls = "D-INVISIBLE · bloc jamais rendu (visibleWhen insatisfiable)";
      else if (o.type === "list" && (r.get(o.block.entityId) ?? 0) === 0) cls = "D-EMPTY-LIST · liste sans ligne : aucun item à presser";
      else if (DISPATCH_BY_PROP.has(o.type) && prop(o.block, "actionId") !== a.id) cls = `D-PROP-MISMATCH · bloc \`${o.type}\` : props.actionId pointe ailleurs, le déclencheur ui n'est pas lu`;
      else cls = "D-AUTRE";
    }
    out.push({ actionId: a.id, to: a.effect.screenId, trigger: t.kind, cls });
  }
  return out;
}

/** Arêtes EXÉCUTABLES au runtime que l'atteignabilité EFFECTIVE ne compte pas. */
function runtimeOnlyEdges(air) {
  const byId = new Map(air.actions.map((a) => [a.id, a]));
  const out = [];
  for (const e of runtimeEdges(air).filter((x) => x.live)) {
    const a = byId.get(e.actionId);
    if (!E.triggers.includes(a.trigger.kind)) out.push({ ...e, trigger: a.trigger.kind,
      cls: `R-UNDECLARED · dispatch par props.actionId alors que trigger=\`${a.trigger.kind}\` hors enveloppe : exécutable, compté inerte` });
  }
  return out;
}

const files = [
  ...readdirSync(REPO + "/packages/golden-corpus/corpus-v2").filter((f) => f.endsWith(".air.json"))
    .map((f) => [f.replace(".air.json", ""), REPO + "/packages/golden-corpus/corpus-v2/" + f]),
  ["slice-conteneurs", REPO + "/slices/conteneurs/air/suivi-conteneurs.air.json"],
];

console.log("═".repeat(88));
console.log("CAMPAGNE 2 · Δ RUNTIME vs VALIDATEUR — corpus réel (" + files.length + " documents)");
console.log("═".repeat(88));
const tally = new Map();
let totScreens = 0, totRt = 0, totDecl = 0, totEff = 0, docsWithDelta = 0;
for (const [name, path] of files) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const air = migrateAirDocument(raw);
  const diags = validateAir(air);
  const decl = new Set(reachableScreens(air, ALL));
  const eff = new Set(reachableScreens(air, E.triggers));
  const rt = runtimeReachable(air);
  const vOnly = validatorOnlyEdges(air);
  const rOnly = runtimeOnlyEdges(air);
  for (const d of [...vOnly.map((x) => x.cls), ...rOnly.map((x) => x.cls)]) {
    const k = d.split(" · ")[0]; tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  totScreens += air.screens.length; totRt += rt.size; totDecl += decl.size; totEff += eff.size;
  const gapEff = [...eff].filter((s) => !rt.has(s));
  if (gapEff.length > 0) docsWithDelta += 1;
  console.log(`\n── ${name}  (${air.screens.length} écrans · validateur sémantique : ${diags.length} diagnostic(s))`);
  console.log(`   atteignables  déclaré=${decl.size}  effectif=${eff.size}  RUNTIME=${rt.size}`);
  if (gapEff.length) console.log(`   🔴 Δ' effectif−runtime : ${gapEff.join(", ")}`);
  for (const v of vOnly) console.log(`   · [Δ'] ${v.actionId} → ${v.to}  ${v.cls}`);
  for (const v of rOnly) console.log(`   · [Δ ] ${v.actionId} → ${v.to}  ${v.cls}`);
}
console.log("\n" + "═".repeat(88));
console.log(`TOTAUX · écrans=${totScreens}  atteignables déclaré=${totDecl}  effectif=${totEff}  RUNTIME=${totRt}`);
console.log(`Documents où l'atteignabilité EFFECTIVE surestime le runtime : ${docsWithDelta}/${files.length}`);
console.log("Classes de divergence observées :");
for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(16)} ${n}`);
