// CAMPAGNE 2 · MESURE C — RÉFUTATION DU CLIQUET DE VÉRACITÉ DE L'ENVELOPPE.
// Proposition testée (envelope-truth.test.ts) : « seul le déclencheur `ui`
// atteint un composant ».  Chemin contradictoire : emit-project ajoute à
// `screen.actions` TOUTE action référencée par `props.actionId`, sans lire
// `trigger.kind` ; AirButton/AirEmptyState dispatchent par `props.actionId`.
import { readFileSync, readdirSync } from "node:fs";
const REPO = "/Users/yia/Documents/woorri";
const { migrateAirDocument } = await import(REPO + "/packages/air-schema/src/migrations.ts");
const { analyzeFeasibility } = await import(REPO + "/packages/execution-contract/src/feasibility.ts");
const { EXECUTION_ENVELOPE_V1: E } = await import(REPO + "/packages/execution-contract/src/envelope.ts");

const prop = (b, k) => (b.props ?? []).find((p) => p.key === k)?.value;
const files = [
  ...readdirSync(REPO + "/packages/golden-corpus/corpus-v2").filter((f) => f.endsWith(".air.json"))
    .map((f) => [f.replace(".air.json", ""), REPO + "/packages/golden-corpus/corpus-v2/" + f]),
  ["slice-conteneurs", REPO + "/slices/conteneurs/air/suivi-conteneurs.air.json"]];

let refByProp = 0, liveDespiteInert = 0, ghosts = 0, falseGhosts = 0, inertTrig = 0, gapsTotal = 0;
let capGaps = 0, slotGaps = 0, ruleGaps = 0, critGaps = 0;
const hits = [];
for (const [name, path] of files) {
  const air = migrateAirDocument(JSON.parse(readFileSync(path, "utf8")));
  const byId = new Map(air.actions.map((a) => [a.id, a]));
  const r = analyzeFeasibility(air, E);
  gapsTotal += r.gaps.length;
  ghosts += r.metrics.ghostControls;
  for (const g of r.gaps) {
    if (g.code === "EXEC_CAPABILITY_NOT_WIRED") capGaps += 1;
    else if (g.code === "EXEC_SLOT_NOT_INVOKED") slotGaps += 1;
    else if (g.code === "EXEC_RULE_NOT_ENFORCED") ruleGaps += 1;
    else if (/UNREACHABLE_DECLARED|GHOST_CONTROL|DETAIL_WITHOUT|DATA_SOURCE_EMPTY/.test(g.code)) critGaps += 1;
    if (g.code === "EXEC_TRIGGER_INERT") inertTrig += 1;
  }
  for (const s of air.screens) for (const b of s.blocks) {
    const aid = prop(b, "actionId");
    if (typeof aid !== "string") continue;
    const a = byId.get(aid); if (a === undefined) continue;
    refByProp += 1;
    if (a.trigger.kind !== "ui") {           // l'enveloppe le dit INERTE…
      liveDespiteInert += 1;
      const live = a.effect.kind === "navigate";   // …mais le runtime dispatche
      if (live) { falseGhosts += 1;
        hits.push(`${name} · ${s.id}/${b.id} → ${a.id} trigger=${a.trigger.kind} effet=navigate — DÉCLARÉ INERTE, RÉELLEMENT DISPATCHÉ`); }
      else hits.push(`${name} · ${s.id}/${b.id} → ${a.id} trigger=${a.trigger.kind} effet=${a.effect.kind} — atteint le dispatcher, no-op par l'effet`);
    }
  }
}
console.log("═".repeat(84));
console.log("RÉFUTATION DU CLIQUET « seul le déclencheur ui atteint un composant »");
console.log("═".repeat(84));
console.log(`actions référencées par props.actionId ......... ${refByProp}`);
console.log(`  dont trigger ≠ ui (déclaré HORS enveloppe) ... ${liveDespiteInert}`);
console.log(`  dont réellement DISPATCHÉES (effet navigate) . ${falseGhosts}`);
console.log(`écarts EXEC_TRIGGER_INERT émis ................. ${inertTrig}`);
console.log(`contrôles fantômes déclarés .................... ${ghosts}`);
console.log("\n── SÉVÉRITÉ / AGRÉGATION — composition des écarts du corpus");
console.log(`écarts totaux ................................. ${gapsTotal}`);
console.log(`  capabilities non câblées (retrait gratuit) ... ${capGaps}`);
console.log(`  slots non invoqués (retrait gratuit) ......... ${slotGaps}`);
console.log(`  règles non appliquées (retrait gratuit) ...... ${ruleGaps}`);
console.log(`  écarts de CLASSE CRITIQUE .................... ${critGaps}`);
console.log(`  ⇒ part retirable sans toucher au produit ..... ${(100*(capGaps+slotGaps+ruleGaps)/gapsTotal).toFixed(1)} %`);
console.log("\n── OCCURRENCES (" + hits.length + ")");
for (const h of hits.slice(0, 25)) console.log("   " + h);
