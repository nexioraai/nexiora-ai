// CRITÈRE DE SORTIE PHASE 10 — « liste mesurée des capabilities manquantes → registre v2 »
// Mesure EXÉCUTABLE, lecture seule.
const R = "/Users/yia/Documents/woorri/";
const { readFileSync, readdirSync } = await import("node:fs");
const { listCapabilities, getCapability } = await import(R + "packages/capability-registry/src/index.ts");
const { normalizeAir } = await import(R + "packages/compiler/src/index.ts");

const DOCS = [
  ...readdirSync(R + "packages/golden-corpus/corpus-v2").filter((f) => f.endsWith(".air.json"))
    .map((f) => [f.replace(".air.json", ""), R + "packages/golden-corpus/corpus-v2/" + f]),
  ["slice-conteneurs", R + "slices/conteneurs/air/suivi-conteneurs.air.json"],
];
// CORRECTIF D'INSTRUMENT : `listCapabilities()` retourne des DÉFINITIONS
// (objets à `id`), jamais des chaînes. La version initiale imprimait
// [object Object] et comparait des objets à des clés.
const REGISTRE = [...listCapabilities()].map((c) => c.id).sort();
console.log("═".repeat(86));
console.log("CRITÈRE PHASE 10 — CAPABILITIES MANQUANTES");
console.log("═".repeat(86));
console.log(`\nregistre v1 GELÉ : ${REGISTRE.length} capabilities`);
console.log("   " + REGISTRE.join(" · "));

// 1. ce que les documents DÉCLARENT
const declarees = new Map();
let horsRegistre = [];
for (const [nom, chemin] of DOCS) {
  const air = normalizeAir(JSON.parse(readFileSync(chemin, "utf8")));
  for (const c of air.capabilities ?? []) {
    const k = c.capability;
    if (!declarees.has(k)) declarees.set(k, new Set());
    declarees.get(k).add(nom);
    if (getCapability(k) === undefined) horsRegistre.push(`${nom}:${k}`);
  }
}
console.log(`\n1 · DÉCLARÉ PAR LES ${DOCS.length} DOCUMENTS`);
const parUsage = [...declarees].sort((a, b) => b[1].size - a[1].size);
for (const [k, docs] of parUsage) console.log(`   ${String(docs.size).padStart(2)}/13  ${k}`);
console.log(`   → ${declarees.size} capabilities distinctes déclarées`);

// 2. capabilities du registre JAMAIS employées
const jamais = REGISTRE.filter((k) => !declarees.has(k));
console.log(`\n2 · AU REGISTRE MAIS JAMAIS DÉCLARÉES : ${jamais.length}`);
if (jamais.length) console.log("   " + jamais.join(" · "));

// 3. capabilities déclarées HORS registre
console.log(`\n3 · DÉCLARÉES HORS REGISTRE : ${horsRegistre.length}`);
if (horsRegistre.length) console.log("   " + horsRegistre.join(" · "));
else console.log("   aucune — attendu : l'allowlist est POSITIVE, un document ne peut pas en déclarer une inconnue");

// 4. LE POINT CRITIQUE : peut-on MESURER un manque depuis les documents ?
console.log(`\n4 · LA LISTE DES MANQUANTES EST-ELLE MESURABLE ICI ?`);
console.log(`   L'allowlist est POSITIVE et fail-closed : \`validateAirCapabilities\` refuse net toute`);
console.log(`   capability hors registre. Un document ne PEUT donc pas exprimer un besoin non couvert.`);
console.log(`   ⇒ le corpus est FILTRÉ par le registre qu'il devrait servir à évaluer.`);
console.log(`   ⇒ « capabilities manquantes » n'est PAS dérivable des 13 documents.`);
