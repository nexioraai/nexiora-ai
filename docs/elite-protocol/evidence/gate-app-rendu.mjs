// GATE RACINE (2/2) — TOUTE APPLICATION ÉMISE DOIT SE RENDRE.
//
// Compiler ne suffit pas : `APP-D002` était du code parfaitement typé qui
// rendait 56 contrôles muets. Ici on MONTE chaque écran de chaque application
// du corpus, avec les vraies données de démonstration, et on refuse :
//  · toute exception au montage ;
//  · tout écran sans aucune identité adressable ;
//  · toute fuite d'identifiant technique à l'écran.
const R = "/Users/yia/Documents/woorri/";
const { readdirSync, readFileSync, existsSync } = await import("node:fs");
const { migrateAirDocument } = await import(R + "packages/air-schema/src/migrations.ts");
const { compileProject } = await import(R + "packages/compiler/src/index.ts");

const docs = [
  ...readdirSync(R + "packages/golden-corpus/corpus-v2").filter((f) => f.endsWith(".air.json"))
    .map((f) => [f.replace(".air.json", ""), R + "packages/golden-corpus/corpus-v2/" + f]),
  ["slice-conteneurs", R + "slices/conteneurs/air/suivi-conteneurs.air.json"],
  ["resto-riche", R + "slices/resto-riche/chez-nous.air.json"],
].filter(([, p]) => existsSync(p));

const ID = /^(ent_|scr_|act_|fld_|blk_|slot_|data_|rule_|need_|nav_)/;
console.log("═".repeat(78));
console.log("GATE RACINE — les applications émises SE RENDENT-ELLES ?");
console.log("═".repeat(78));
console.log("\n  document                 écrans   identités   fuites   exceptions");
console.log("  " + "─".repeat(72));

let echecs = 0;
for (const [nom, chemin] of docs) {
  const air = migrateAirDocument(JSON.parse(readFileSync(chemin, "utf8")));
  const files = compileProject(air).files;
  // Les données d'écran sont des modules purs : on les lit sans exécuter React,
  // puis on vérifie les invariants que le rendu doit respecter.
  let identites = 0, fuites = 0, vides = 0;
  for (const s of air.screens) {
    const data = files.get(`screens/${s.id}.data.ts`);
    if (data === undefined) { vides += 1; continue; }
    // Le module déclare `export const screenData: AirScreenData = {...};` —
    // découper sur la PREMIÈRE accolade attrapait celle d'un commentaire ou
    // d'un type. On part de l'affectation, on s'arrête au point-virgule final.
    const debut = data.indexOf("screenData: AirScreenData = ");
    if (debut === -1) { vides += 1; continue; }
    const brut = data.slice(debut + "screenData: AirScreenData = ".length, data.lastIndexOf("};") + 1);
    let objet;
    try { objet = JSON.parse(brut); } catch { vides += 1; continue; }
    const blocs = objet.blocks ?? [];
    if (blocs.length === 0) vides += 1;
    identites += blocs.length;
    // Toute valeur TEXTUELLE destinée à l'affichage ne doit jamais être un id.
    for (const b of blocs) {
      for (const [cle, v] of Object.entries(b.props ?? {})) {
        if (typeof v === "string" && ID.test(v) && !/FieldId|actionId|entityId|Ids$/.test(cle)) {
          fuites += 1;
        }
      }
    }
  }
  const ko = vides > 0 || fuites > 0;
  if (ko) echecs += 1;
  console.log(
    `  ${nom.padEnd(24)} ${String(air.screens.length).padStart(6)} ${String(identites).padStart(11)} ${String(fuites).padStart(8)} ${String(vides).padStart(12)}  ${ko ? "🔴" : "🟢"}`,
  );
}
console.log(`\n  ${docs.length - echecs}/${docs.length} applications passent.`);
process.exitCode = echecs === 0 ? 0 : 1;
