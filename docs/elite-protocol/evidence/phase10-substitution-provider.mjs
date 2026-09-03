// CRITÈRE DE SORTIE PHASE 10 — « preuve de substitution de provider sans changement d'AIR »
// Mesure EXÉCUTABLE, lecture seule. node docs/elite-protocol/evidence/phase10-substitution-provider.mjs
const R = "/Users/yia/Documents/woorri/";
const { readFileSync } = await import("node:fs");
const { projectAirSchema, canonicalJson, sha256Hex } = await import(R + "packages/air-schema/src/index.ts");
const { compileProject, normalizeAir } = await import(R + "packages/compiler/src/index.ts");
const { requiredProviderClasses, selectProviders, getProviderClass } =
  await import(R + "packages/provider-registry/src/index.ts");

const CIBLES = [
  ["slice conteneurs", R + "slices/conteneurs/air/suivi-conteneurs.air.json"],
  ["suivi-chantier",   R + "packages/golden-corpus/corpus-v2/suivi-chantier.air.json"],
];
const ligne = "─".repeat(88);
console.log("═".repeat(88));
console.log("CRITÈRE PHASE 10 — SUBSTITUTION DE PROVIDER SANS CHANGEMENT D'AIR");
console.log("═".repeat(88));

let verdictGlobal = true, artefactChange = false;
for (const [nom, chemin] of CIBLES) {
  const brut = JSON.parse(readFileSync(chemin, "utf8"));
  const air = projectAirSchema.parse(normalizeAir(brut));
  const airHashAvant = sha256Hex(canonicalJson(air));

  // 1. classes requises, dérivées des intégrations du document
  const classes = requiredProviderClasses(air);
  const defaut = selectProviders(air, {});
  // 2. substitution : forcer le mock partout où le registre l'autorise
  const overrides = {};
  for (const c of classes) {
    const def = getProviderClass(c);
    // CORRECTIF D'INSTRUMENT : `ProviderDefinition` expose `id`, jamais `provider`
    // (`provider` n'existe que sur `ResolvedProvider`). La version initiale lisait
    // `p.provider` — undefined partout — et ne trouvait donc aucune alternative.
    const courant = defaut.find((d) => d.providerClass === c)?.provider;
    const alt = (def?.providers ?? []).map((p) => p.id).find((id) => id !== courant);
    if (alt !== undefined) overrides[c] = alt;
  }
  const substitue = selectProviders(air, overrides);

  // 3. compiler AVANT / APRÈS — le document n'est PAS retouché
  const A = compileProject(air);
  const B = compileProject(air, undefined, { providerOverrides: overrides });
  const airHashApres = sha256Hex(canonicalJson(air));

  // 4. l'artefact ÉMIS change-t-il ?
  const diff = [];
  for (const [f, c] of A.files) if (B.files.get(f) !== c) diff.push(f);
  for (const f of B.files.keys()) if (!A.files.has(f)) diff.push(f + " (nouveau)");

  const airIntact = airHashAvant === airHashApres;
  const providerRemplace = JSON.stringify(defaut) !== JSON.stringify(substitue);
  if (diff.length) artefactChange = true;

  console.log(`\n── ${nom}`);
  console.log(`   intégrations déclarées ......... ${air.integrations.length}`);
  console.log(`   classes de provider requises ... ${classes.length}  [${classes.join(", ")}]`);
  console.log(`   substitutions demandées ........ ${Object.keys(overrides).length}  ${JSON.stringify(overrides)}`);
  console.log(`   ─`);
  console.log(`   AIR intact (hash avant = après)  ${airIntact ? "🟢 OUI" : "🔴 NON"}   ${airHashAvant.slice(0,12)}…`);
  console.log(`   provider RÉELLEMENT remplacé ... ${providerRemplace ? "🟢 OUI" : "🔴 NON"}`);
  console.log(`      défaut     : ${defaut.map(p=>p.providerClass+"="+p.provider).join(" · ")}`);
  console.log(`      substitué  : ${substitue.map(p=>p.providerClass+"="+p.provider).join(" · ")}`);
  console.log(`   rootHash    A=${A.rootHash.slice(0,12)}…  B=${B.rootHash.slice(0,12)}…  ${A.rootHash===B.rootHash?"IDENTIQUES":"DIFFÉRENTS"}`);
  console.log(`   fichiers émis DIFFÉRENTS ....... ${diff.length}  ${diff.slice(0,4).join(", ")}`);
  if (!airIntact || !providerRemplace) verdictGlobal = false;
}
console.log("\n" + ligne);
console.log("SYNTHÈSE");
console.log(`   substitution possible sans toucher au document ... ${verdictGlobal ? "🟢 OUI" : "🔴 NON"}`);
console.log(`   la substitution CHANGE l'artefact émis ........... ${artefactChange ? "🟢 OUI" : "🔴 NON — elle n'a aucun effet observable sur le projet généré"}`);
