// LES 207 PROMESSES — combien l'application en tient-elle ?
// Chaque `expectedTests[]` déclaré par un document est confronté à l'état RÉEL
// de sa cible dans l'artefact émis. Aucun vert par défaut : une promesse dont
// la cible fonctionne mais dont l'énoncé n'est pas mécaniquement vérifiable
// reste NON DÉTERMINÉE — jamais tenue.
const R = "/Users/yia/Documents/woorri/";
const { readFileSync, readdirSync, existsSync } = await import("node:fs");
const { migrateAirDocument } = await import(R + "packages/air-schema/src/migrations.ts");
const { reachableScreens, controls, dataBindings } = await import(R + "packages/execution-contract/src/graph.ts");
const { EXECUTION_ENVELOPE_V1: ENV } = await import(R + "packages/execution-contract/src/envelope.ts");

const DOCS = [
  ...readdirSync(R + "packages/golden-corpus/corpus-v2").filter((f) => f.endsWith(".air.json"))
    .map((f) => [f.replace(".air.json", ""), R + "packages/golden-corpus/corpus-v2/" + f]),
  ["slice-conteneurs", R + "slices/conteneurs/air/suivi-conteneurs.air.json"],
  ["resto-riche (écrit à la main)", R + "slices/resto-riche/chez-nous.air.json"],
].filter(([, p]) => existsSync(p));

const VERDICTS = new Map();
const detail = [];
for (const [nom, chemin] of DOCS) {
  const air = migrateAirDocument(JSON.parse(readFileSync(chemin, "utf8")));
  const atteignables = new Set(reachableScreens(air, ENV.triggers));
  const recensement = controls(air, ENV);
  const actionsVivantes = new Set(recensement.filter((c) => c.executed).map((c) => c.actionId));
  const actionsById = new Map(air.actions.map((a) => [a.id, a]));
  const liaisons = dataBindings(air);
  const entitesRendues = new Set(liaisons.filter((b) => b.seeded).map((b) => b.entityId));
  const ecrans = new Set(air.screens.map((s) => s.id));

  for (const t of air.expectedTests ?? []) {
    let v, motif;
    if (t.targetId.startsWith("scr_")) {
      if (!ecrans.has(t.targetId)) { v = "CIBLE INEXISTANTE"; motif = "écran non déclaré"; }
      else if (!atteignables.has(t.targetId)) { v = "CIBLE MORTE"; motif = "écran inatteignable"; }
      else { v = "CIBLE VIVANTE"; motif = "écran atteignable"; }
    } else if (t.targetId.startsWith("act_")) {
      const a = actionsById.get(t.targetId);
      if (!a) { v = "CIBLE INEXISTANTE"; motif = "action non déclarée"; }
      else if (!actionsVivantes.has(t.targetId)) {
        v = "CIBLE MORTE";
        motif = `effet \`${a.effect.kind}\` / déclencheur \`${a.trigger.kind}\` — hors enveloppe, rien ne s'exécute`;
      } else { v = "CIBLE VIVANTE"; motif = "action exécutée par le moteur"; }
    } else if (t.targetId.startsWith("ent_")) {
      if (!air.entities.some((e) => e.id === t.targetId)) { v = "CIBLE INEXISTANTE"; motif = "entité non déclarée"; }
      else if (!entitesRendues.has(t.targetId)) { v = "CIBLE MORTE"; motif = "entité liée à aucun bloc rendu, ou sans donnée"; }
      else { v = "CIBLE VIVANTE"; motif = "entité rendue avec des données"; }
    } else { v = "CIBLE INEXISTANTE"; motif = `préfixe inconnu : ${t.targetId}`; }
    VERDICTS.set(v, (VERDICTS.get(v) ?? 0) + 1);
    detail.push({ doc: nom, id: t.id, kind: t.kind, cible: t.targetId, v, motif, d: t.description });
  }
}

console.log("═".repeat(90));
console.log("LES PROMESSES DÉCLARÉES — leur cible fonctionne-t-elle seulement ?");
console.log("═".repeat(90));
console.log(`\ntotal de promesses déclarées : ${detail.length}\n`);
for (const [v, n] of [...VERDICTS].sort((a, b) => b[1] - a[1]))
  console.log(`   ${v.padEnd(20)} ${String(n).padStart(4)}   ${(100 * n / detail.length).toFixed(1)} %`);

console.log("\n── par NATURE de promesse");
const parKind = new Map();
for (const d of detail) {
  const k = `${d.kind}|${d.v}`;
  parKind.set(k, (parKind.get(k) ?? 0) + 1);
}
console.log("   nature".padEnd(20) + "VIVANTE".padStart(10) + "MORTE".padStart(10) + "INEXISTANTE".padStart(14));
for (const k of ["deterministic", "e2e", "contract"])
  console.log(`   ${k.padEnd(17)}` +
    String(parKind.get(`${k}|CIBLE VIVANTE`) ?? 0).padStart(10) +
    String(parKind.get(`${k}|CIBLE MORTE`) ?? 0).padStart(10) +
    String(parKind.get(`${k}|CIBLE INEXISTANTE`) ?? 0).padStart(14));

console.log("\n── les 6 premières promesses à CIBLE MORTE");
detail.filter((d) => d.v === "CIBLE MORTE").slice(0, 6)
  .forEach((d) => console.log(`   🔴 ${d.doc}/${d.id}\n      « ${d.d.slice(0, 84)} »\n      ${d.motif}`));

console.log("\n── comparaison : corpus généré  vs  document écrit à la main");
for (const nom of ["resto-quartier", "resto-riche (écrit à la main)"]) {
  const s = detail.filter((d) => d.doc === nom);
  if (!s.length) { console.log(`   ${nom.padEnd(32)} aucune promesse déclarée`); continue; }
  const vv = s.filter((d) => d.v === "CIBLE VIVANTE").length;
  console.log(`   ${nom.padEnd(32)} ${s.length} promesses · ${vv} à cible vivante (${(100*vv/s.length).toFixed(0)} %)`);
}
console.log("\n🔴 AUCUNE promesse n'est déclarée TENUE : ce relevé n'établit qu'une");
console.log("   CONDITION NÉCESSAIRE — que la cible existe et fonctionne. L'énoncé");
console.log("   lui-même (« le total additionne correctement ») n'est pas vérifié ici.");
