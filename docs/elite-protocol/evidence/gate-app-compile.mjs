// GATE RACINE — TOUTE APPLICATION ÉMISE DOIT COMPILER.
//
// Défaut de fond mesuré le 2026-08-31 : 659 tests verts et l'app émise
// échouait à `tsc` dès qu'elle portait un slot. **Les tests vérifiaient le
// TEXTE produit, jamais qu'il COMPILE.** Corriger l'adaptateur de slot était
// couper une tête ; la racine est l'absence de cette gate.
//
// Ici : chaque document du corpus est compilé, écrit sur disque, et soumis au
// VRAI `tsc` avec les vraies dépendances. Aucune simulation.
const R = "/Users/yia/Documents/woorri/";
const { mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync, readdirSync, readFileSync } =
  await import("node:fs");
const { execFileSync } = await import("node:child_process");
const { migrateAirDocument } = await import(R + "packages/air-schema/src/migrations.ts");
const { compileProject } = await import(R + "packages/compiler/src/index.ts");

const BASE = R + "slices/resto-riche/app/node_modules";
if (!existsSync(BASE)) { console.error("prérequis : node_modules de resto-riche"); process.exit(2); }
const OUT = "/private/tmp/claude-501/-Users-yia/gate-compile/";
rmSync(OUT, { recursive: true, force: true });

const docs = [
  ...readdirSync(R + "packages/golden-corpus/corpus-v2").filter((f) => f.endsWith(".air.json"))
    .map((f) => [f.replace(".air.json", ""), R + "packages/golden-corpus/corpus-v2/" + f]),
  ["slice-conteneurs", R + "slices/conteneurs/air/suivi-conteneurs.air.json"],
  ["resto-riche", R + "slices/resto-riche/chez-nous.air.json"],
].filter(([, p]) => existsSync(p));

// Un slot d'auteur MINIMAL pour chaque slot déclaré : sans lui, le registre
// n'est pas émis et la gate ne testerait jamais le chemin qui a cassé.
const slotBidon = (id) => ({
  slotId: id,
  source: `export function runSlot(entrees: { valeur?: string }): { resultat: string } {\n  return { resultat: String(entrees.valeur ?? "") };\n}\n`,
  authorId: "gate",
});

console.log("═".repeat(78));
console.log("GATE RACINE — l'application émise COMPILE-T-ELLE ?");
console.log("═".repeat(78));
console.log("\n  document                 fichiers   slots   tsc");
console.log("  " + "─".repeat(72));

let echecs = 0;
for (const [nom, chemin] of docs) {
  const air = migrateAirDocument(JSON.parse(readFileSync(chemin, "utf8")));
  const slots = air.slots.map((s) => slotBidon(s.id));
  let c;
  try { c = compileProject(air, undefined, slots.length > 0 ? { slots } : undefined); }
  catch (e) { console.log(`  ${nom.padEnd(24)} 🔴 COMPILATION REFUSÉE : ${String(e.message).slice(0, 40)}`); echecs++; continue; }

  const dir = OUT + nom + "/";
  for (const [f, contenu] of c.files) {
    const p = dir + f;
    mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true });
    writeFileSync(p, contenu);
  }
  symlinkSync(BASE, dir + "node_modules", "dir");

  let verdict = "🟢 EXIT=0";
  try {
    execFileSync("npx", ["tsc", "--noEmit"], { cwd: dir, stdio: "pipe", timeout: 180000 });
  } catch (e) {
    const sortie = String(e.stdout ?? "") + String(e.stderr ?? "");
    const lignes = sortie.split("\n").filter((l) => l.includes("error TS"));
    verdict = `🔴 ${lignes.length} erreur(s) — ${lignes[0]?.slice(0, 60) ?? ""}`;
    echecs++;
  }
  console.log(`  ${nom.padEnd(24)} ${String(c.files.size).padStart(6)}  ${String(slots.length).padStart(5)}   ${verdict}`);
}
console.log(`\n  ${docs.length - echecs}/${docs.length} applications compilent.`);
process.exitCode = echecs === 0 ? 0 : 1;
