// ÉTAPE 7 · AUDIT DE LA LISTE GELÉE. Lecture seule.
// node docs/elite-protocol/evidence/rn01-E7-audit.mjs <chemin liste.json>
const REPO = "/Users/yia/Documents/woorri/";
const { readFileSync } = await import("node:fs");
const L = JSON.parse(readFileSync(process.argv[2] ?? (REPO + "docs/elite-protocol/evidence/rn01-E7-liste-gelee.json"), "utf8"));
const U = L.unites;
const ligne = "─".repeat(84);

console.log("═".repeat(84));
console.log("AUDIT DE LA LISTE GELÉE — R-GRAN-2");
console.log("═".repeat(84));

// ── 1. IDENTITÉ : unicité (condition de validité)
const vus = new Map(); const doublons = [];
for (const u of U) { if (vus.has(u.id)) doublons.push(u.id); else vus.set(u.id, u); }
console.log(`\n1 · IDENTITÉ`);
console.log(`   unités : ${U.length}   identités distinctes : ${vus.size}   DOUBLONS : ${doublons.length}`);
console.log(`   verdict : ${doublons.length === 0 ? "🟢 identités uniques" : "🔴 COLLISION D'IDENTITÉ"}`);
[...new Set(doublons)].slice(0, 5).forEach((d) => console.log(`      🔴 ${d}`));

// ── 2. COUVERTURE par espace et par module/racine
console.log(`\n2 · COUVERTURE`);
const parEspace = new Map(), parModule = new Map();
for (const u of U) {
  parEspace.set(u.espace, (parEspace.get(u.espace) ?? 0) + 1);
  const k = u.module ?? u.racine; parModule.set(k, (parModule.get(k) ?? 0) + 1);
}
for (const [e, n] of parEspace) console.log(`   ${e.padEnd(18)} ${String(n).padStart(4)}`);
console.log(ligne);
for (const [k, n] of [...parModule].sort((a, b) => b[1] - a[1]))
  console.log(`   ${String(n).padStart(4)}  ${k}`);
const vides = [...L.perimetre.modules].filter((m) => !parModule.has(m));
console.log(`   modules du périmètre sans aucune unité : ${vides.length}${vides.length ? " — " + vides.join(", ") : ""}`);

// ── 3. RECOUVREMENT inter-espaces (D-9 : R-RATT sous-rattache par construction)
console.log(`\n3 · RECOUVREMENT INTER-ESPACES`);
const REPRESENTABLE = new Set(["ENUM", "LITERAL", "NULLABLE"]);   // D-9, ensemble clos
const val = U.filter((u) => u.espace === "VALUE-CONSTRAINT");
const rattachables = val.filter((u) => REPRESENTABLE.has(u.genre));
const strict = val.filter((u) => u.genre === "STRICTNESS");
console.log(`   unités VALUE-CONSTRAINT ......................... ${val.length}`);
console.log(`   dont genre appartenant à l'ensemble clos D-9 .... ${rattachables.length} (candidates au rattachement)`);
console.log(`   dont STRICTNESS — jamais rattachable (L-C2) ..... ${strict.length}`);
console.log(`   dont CHECK:* — jamais rattachable par construction ${val.filter((u) => u.genre.startsWith("CHECK:")).length}`);
const chemins = new Set(val.map((u) => `${u.racine}::${u.chemin}`));
console.log(`   chemins distincts couverts ..................... ${chemins.size}  ⇒ ${val.length} unités sur ${chemins.size} chemins`);
console.log(`   ⚠️  les totaux par espace NE S'ADDITIONNENT PAS : recouvrement réel, non partitionné`);

// ── 4. OBSERVABILITÉ (D-4 : annotation APRÈS gel, jamais un filtre)
console.log(`\n4 · OBSERVABILITÉ — annotation, jamais un filtre`);
const artefacts = {
  designTokensSchema: [
    ["packages/design-tokens/tokens.json", true],
    ["slices/conteneurs/app/lib/tokens/theme.generated.ts", false],
    ["slices/restaurant/app/lib/tokens/theme.generated.ts", false]],
};
const at = (o, p) => p === "" ? o : p.split(".").reduce((a, k) => (a === undefined || a === null ? undefined : a[k]), o);
let reelle = 0, analytique = 0, sansReferent = 0;
for (const u of val) {
  const arts = artefacts[u.racine];
  if (!arts) { sansReferent++; continue; }
  let vu = false, vuNonGarde = false;
  for (const [chemin, garde] of arts) {
    let obj;
    try { obj = chemin.endsWith(".json") ? JSON.parse(readFileSync(REPO + chemin, "utf8")) : (await import(REPO + chemin)).theme; }
    catch { continue; }
    if (at(obj, u.chemin) !== undefined) { vu = true; if (!garde) vuNonGarde = true; }
  }
  if (vuNonGarde) reelle++; else if (vu) analytique++; else sansReferent++;
}
console.log(`   VALUE-CONSTRAINT — ÉPREUVE RÉELLE possible ..... ${reelle}`);
console.log(`   VALUE-CONSTRAINT — VRAI ANALYTIQUEMENT seul .... ${analytique}`);
console.log(`   VALUE-CONSTRAINT — sans référent / non calculé .. ${sansReferent}`);
console.log(`   🔴 EXECUTION (${parEspace.get("EXECUTION")}) et DECLARATIVE (${parEspace.get("DECLARATIVE")}) :`);
console.log(`      AUCUN critère mécanique d'observabilité n'a jamais été établi pour ces deux espaces.`);
console.log(`      L'annotation N'EST PAS CALCULABLE aujourd'hui. Aucune unité n'est retirée (D-4).`);

// ── 5. RÉPARTITION par genre
console.log(`\n5 · RÉPARTITION PAR GENRE`);
const parGenre = new Map();
for (const u of U) { const g = u.genre ?? (u.espace === "DECLARATIVE" ? "MEMBRE" : "?");
  parGenre.set(g, (parGenre.get(g) ?? 0) + 1); }
for (const [g, n] of [...parGenre].sort((a, b) => b[1] - a[1]).slice(0, 14))
  console.log(`   ${String(n).padStart(4)}  ${g}`);
