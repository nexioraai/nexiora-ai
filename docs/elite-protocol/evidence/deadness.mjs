// CAMPAGNE 2 · MESURE B — MORTALITÉ STRUCTURELLE SUR LE CORPUS RÉEL.
// Trois propriétés jamais dérivées par le protocole, toutes calculables sur
// l'AIR seul : site de dispatch mort · visibleWhen insatisfiable · événement
// `data` non productible.  Lecture seule.
import { readFileSync, readdirSync } from "node:fs";
const REPO = "/Users/yia/Documents/woorri";
const { migrateAirDocument } = await import(REPO + "/packages/air-schema/src/migrations.ts");
const { EXECUTION_ENVELOPE_V1: E } = await import(REPO + "/packages/execution-contract/src/envelope.ts");
const { reachableScreens } = await import(REPO + "/packages/execution-contract/src/graph.ts");

const prop = (b, k) => (b.props ?? []).find((p) => p.key === k)?.value;
const NO_DISPATCH = new Set(["header", "detail_header"]);

const files = [
  ...readdirSync(REPO + "/packages/golden-corpus/corpus-v2").filter((f) => f.endsWith(".air.json"))
    .map((f) => [f.replace(".air.json", ""), REPO + "/packages/golden-corpus/corpus-v2/" + f]),
  ["slice-conteneurs", REPO + "/slices/conteneurs/air/suivi-conteneurs.air.json"],
];

let T = { blocks: 0, cond: 0, deadEnv: 0, deadAbs: 0, sites: 0, deadSites: 0,
          dataTrig: 0, dataNonProd: 0, lifeTrig: 0, uiInert: 0 };
const detail = [];

for (const [name, path] of files) {
  const air = migrateAirDocument(JSON.parse(readFileSync(path, "utf8")));
  const rows = new Map();
  for (const d of air.datasets) rows.set(d.entityId, (rows.get(d.entityId) ?? 0) + d.rowCount);
  const eff = new Set(reachableScreens(air, E.triggers));

  // Opérations de mutation DÉCLARÉES par entité (sous un moteur complet).
  const mut = new Map(); // entityId -> Set(create|update|delete)
  for (const a of air.actions) {
    if (a.effect.kind !== "mutation") continue;
    if (!mut.has(a.effect.entityId)) mut.set(a.effect.entityId, new Set());
    mut.get(a.effect.entityId).add(a.effect.operation);
  }
  const canEmpty = (e) => (rows.get(e) ?? 0) === 0 || mut.get(e)?.has("delete") === true;
  const canFill  = (e) => (rows.get(e) ?? 0) > 0  || mut.get(e)?.has("create") === true;

  for (const s of air.screens) for (const b of s.blocks) {
    T.blocks += 1;
    const c = b.visibleWhen;
    if (c === undefined) continue;
    T.cond += 1;
    const n = rows.get(c.entityId) ?? 0;
    const satEnv = c.kind === "entity_empty" ? n === 0 : n > 0;          // enveloppe v1 : 0 écriture
    const satAbs = c.kind === "entity_empty" ? canEmpty(c.entityId) : canFill(c.entityId); // moteur complet
    if (!satEnv) { T.deadEnv += 1;
      detail.push(`${name} · ${s.id}/${b.id} [${b.blockType}] visibleWhen=${c.kind}(${c.entityId}, rows=${n}) — MORT sous enveloppe v1${satAbs ? "" : " ET sous moteur complet"}`); }
    if (!satAbs) T.deadAbs += 1;
  }

  // Sites de dispatch morts : affordance câblée qui ne peut jamais être activée.
  for (const s of air.screens) for (const b of s.blocks) {
    const c = b.visibleWhen; const n = c ? (rows.get(c.entityId) ?? 0) : 0;
    const vis = c === undefined ? true : c.kind === "entity_empty" ? n === 0 : n > 0;
    const aid = prop(b, "actionId");
    const trig = air.actions.find((x) => x.trigger.kind === "ui" && x.trigger.blockId === b.id);
    const isSite = (["button","empty_state"].includes(b.blockType) && typeof aid === "string")
                || (["list","form"].includes(b.blockType) && trig !== undefined);
    if (!isSite) continue;
    T.sites += 1;
    const hasRow = b.blockType !== "list" || (rows.get(b.entityId) ?? 0) > 0;
    if (!vis || !hasRow || !eff.has(s.id)) { T.deadSites += 1;
      detail.push(`${name} · ${s.id}/${b.id} [${b.blockType}] SITE MORT — ${!eff.has(s.id) ? "écran inatteignable" : !vis ? "bloc jamais visible" : "liste sans ligne"}`); }
  }

  // Déclencheurs : productibilité de l'événement.
  for (const a of air.actions) {
    if (a.trigger.kind === "data") { T.dataTrig += 1;
      const ops = mut.get(a.trigger.entityId);
      const need = a.trigger.event === "created" ? "create" : a.trigger.event === "updated" ? "update" : "delete";
      if (ops?.has(need) !== true) { T.dataNonProd += 1;
        detail.push(`${name} · ${a.id} trigger data:${a.trigger.event}(${a.trigger.entityId}) — AUCUNE action \`mutation ${need}\` n'existe : événement NON PRODUCTIBLE même sous moteur complet`); } }
    if (a.trigger.kind === "lifecycle") T.lifeTrig += 1;
    if (a.trigger.kind === "ui") {
      const o = air.screens.flatMap((s) => s.blocks).find((b) => b.id === a.trigger.blockId);
      if (o && NO_DISPATCH.has(o.blockType)) { T.uiInert += 1;
        detail.push(`${name} · ${a.id} trigger ui sur bloc \`${o.blockType}\` — le runtime n'y attache aucun handler`); }
    }
  }
}

console.log("═".repeat(86));
console.log("MORTALITÉ STRUCTURELLE — 13 documents réels, propriétés dérivables de l'AIR seul");
console.log("═".repeat(86));
console.log(`blocs .......................... ${T.blocks}`);
console.log(`  dont conditionnels ........... ${T.cond}`);
console.log(`  🔴 condition MORTE (env. v1) . ${T.deadEnv}`);
console.log(`  🔴 condition MORTE (moteur complet) ${T.deadAbs}`);
console.log(`sites de dispatch .............. ${T.sites}`);
console.log(`  🔴 sites MORTS ............... ${T.deadSites}`);
console.log(`déclencheurs data .............. ${T.dataTrig}   dont événement NON productible : ${T.dataNonProd}`);
console.log(`déclencheurs lifecycle ......... ${T.lifeTrig}`);
console.log(`déclencheurs ui sur bloc inerte  ${T.uiInert}`);
console.log("\n── DÉTAIL (" + detail.length + " occurrences)");
for (const d of detail) console.log("   " + d);
