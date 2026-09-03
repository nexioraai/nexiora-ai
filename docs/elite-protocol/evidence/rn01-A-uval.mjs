// ARBITRAGE A — U-VAL reformulé : test de FALSIFIABILITÉ sur zone neutre.
// Zone : design-tokens (ni chemin D004, ni chemin D005). Lecture seule.
const REPO = "/Users/yia/Documents/woorri/";
const D = (s) => s?._zod?.def ?? s?.def;
const chk = (c) => c?._zod?.def ?? c?.def ?? c;

/** Unités U-VAL : (racine, chemin, contrainte). */
function walk(s, p, o, seen = new Set()) {
  const d = D(s); if (!d || seen.has(s)) return; seen = new Set(seen); seen.add(s);
  for (const c of d.checks ?? []) { const cd = chk(c);
    o.push({ p, check: cd.check, pattern: cd.pattern, min: cd.value ?? cd.minimum, max: cd.maximum }); }
  switch (d.type) {
    case "object": for (const [k, v] of Object.entries(d.shape ?? {})) walk(v, p ? `${p}.${k}` : k, o, seen); break;
    case "array": walk(d.element, `${p}[]`, o, seen); break;
    case "optional": case "nullable": case "default": walk(d.innerType, p, o, seen); break;
  }
}
const at = (obj, path) => path.split(".").reduce((a, k) => (a === undefined ? undefined : a[k]), obj);

const m = await import(REPO + "packages/design-tokens/src/schema.ts");
const units = []; walk(m.designTokensSchema, "", units);
const patternUnits = units.filter((u) => u.check === "string_format" && u.pattern);

// ── ARTEFACTS DU PÉRIMÈTRE D'OBSERVATION
const { readFileSync } = await import("node:fs");
const source = JSON.parse(readFileSync(REPO + "packages/design-tokens/tokens.json", "utf8"));
const derived = {};
for (const s of ["conteneurs", "restaurant"]) {
  try { const t = await import(REPO + `slices/${s}/app/lib/tokens/theme.generated.ts`); derived[s] = t.theme; }
  catch (e) { derived[s] = null; }
}

const ART = [
  { nom: "tokens.json", obj: source, gated: true,  why: "produit UNIQUEMENT via designTokensSchema.parse()" },
  { nom: "slice conteneurs · theme.generated.ts", obj: derived.conteneurs, gated: false, why: "produit par codegen APRÈS validation — jamais re-validé par ce schéma" },
  { nom: "slice restaurant · theme.generated.ts", obj: derived.restaurant, gated: false, why: "idem" },
];

console.log("═".repeat(88));
console.log("A · U-VAL REFORMULÉ — épreuve de falsifiabilité");
console.log("Énoncé testé : « dans tout artefact du périmètre déclaré, toute valeur");
console.log("occupant ce chemin satisfait cette contrainte »");
console.log("═".repeat(88));
console.log(`unités à motif dans la racine : ${patternUnits.length}\n`);

for (const a of ART) {
  if (!a.obj) { console.log(`── ${a.nom} : ARTEFACT ABSENT\n`); continue; }
  let testables = 0, viol = 0, absents = 0; const details = [];
  for (const u of patternUnits) {
    const v = at(a.obj, u.p);
    if (v === undefined) { absents++; continue; }
    testables++;
    if (!new RegExp(u.pattern.source ?? u.pattern).test(String(v))) { viol++; details.push(`${u.p} = ${JSON.stringify(v)}`); }
  }
  console.log(`── ${a.nom}`);
  console.log(`   provenance : ${a.why}`);
  console.log(`   chemins présents : ${testables} · absents de cet artefact : ${absents} · VIOLATIONS : ${viol}`);
  console.log(`   statut de l'énoncé : ${a.gated ? "🟠 VRAI ANALYTIQUEMENT (l'artefact ne franchit que ce schéma)" : (viol ? "🔴 RÉFUTÉ" : "🟢 NON RÉFUTÉ — épreuve réelle, artefact non gardé par le schéma")}`);
  details.slice(0, 5).forEach((d) => console.log("      violation : " + d));
  console.log("");
}

// ── Contre-épreuve : l'énoncé est-il capable de détecter une violation ?
const faux = JSON.parse(JSON.stringify(derived.conteneurs ?? {}));
if (faux?.color?.light) { faux.color.light.bg = "rouge"; }
let d2 = 0;
for (const u of patternUnits) { const v = at(faux, u.p);
  if (v !== undefined && !new RegExp(u.pattern.source ?? u.pattern).test(String(v))) d2++; }
console.log("── CONTRE-ÉPREUVE (mutation d'un artefact en mémoire, aucun fichier touché)");
console.log(`   violation injectée à color.light.bg → détectée : ${d2 > 0 ? "🟢 OUI" : "🔴 NON"} (${d2} violation(s))`);
