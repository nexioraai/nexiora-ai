// MESURE CROSS-DOMAIN — DIMENSION H (Phase 10, D-039/D-041).
//
// Rend REPRODUCTIBLE la mesure de la variété anti-template : structure ET
// identité visuelle, sur tous les domaines disponibles. Le jour où un
// second slice existe, il suffit de l'ajouter à l'échantillon : le verdict
// se recalcule sans changer une ligne d'instrument.
//
// Aucun réseau, aucune horloge dans la mesure elle-même (l'horodatage ne
// sert qu'au nom du journal).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const { compileProject } = await import(join(REPO, "packages/compiler/src/index.ts"));
const { evaluateAntiTemplate, evaluateApxxGrid, structuralSignature, visualSignature } =
  await import(join(REPO, "packages/oracle/src/index.ts"));

const CORPUS = join(REPO, "packages/golden-corpus/corpus-v2");
const samples = readdirSync(CORPUS)
  .filter((f) => f.endsWith(".air.json"))
  .sort()
  .map((f) => {
    const air = JSON.parse(readFileSync(join(CORPUS, f), "utf8"));
    return { domain: f.replace(".air.json", ""), air, files: compileProject(air).files };
  });

const report = evaluateAntiTemplate(samples);
const grille = evaluateApxxGrid(samples[0].files, samples[0].air, samples);

const detail = samples.map((s) => ({
  domaine: s.domain,
  theme: s.air.design.theme,
  ecrans: s.air.screens.length,
  silhouette: structuralSignature(s.air).slice(0, 16),
  identiteVisuelle: visualSignature(s.files).slice(0, 16),
}));

const sortie = {
  phase: 10,
  mesure: "dimension H — variété anti-template (§22)",
  domaines: report.domains,
  verdict: report.state,
  detail: report.detail,
  axeStructurel: {
    silhouettesDistinctes: new Set(detail.map((d) => d.silhouette)).size,
    collisions: report.structuralCollisions,
  },
  axeVisuel: {
    themesDeclares: report.declaredThemes.length,
    identitesVisuellesDistinctes: report.visualVariants,
    verdict: report.visualVariants > 1 ? "variété effective" : "variété DÉCLARÉE mais INERTE",
  },
  grilleApxx: grille.dimensions.map((d) => ({ dimension: d.dimension, etat: d.state, detail: d.detail })),
  parDomaine: detail,
  reserve:
    "Les 12 domaines proviennent tous du corpus gelé, émis par le MÊME modèle sur des intentions de type service/commerce. La mesure établit la variété INTERNE à cette famille ; elle ne prouve pas la généralisation à un domaine hors-template (critère de sortie de la Phase 10, bloqué sur P-006).",
};

mkdirSync(join(HERE, "results"), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(join(HERE, "results", `anti-template-${stamp}.json`), JSON.stringify(sortie, null, 2) + "\n");
writeFileSync(join(HERE, "results", "anti-template-latest.json"), JSON.stringify(sortie, null, 2) + "\n");
console.log(JSON.stringify({ verdict: sortie.verdict, ...sortie.axeStructurel, ...sortie.axeVisuel }, null, 2));
for (const d of detail) {
  console.log(`  ${d.domaine.padEnd(24)} ${String(d.ecrans).padStart(2)} écrans  thème=${d.theme.padEnd(18)} silhouette=${d.silhouette}  visuel=${d.identiteVisuelle}`);
}
