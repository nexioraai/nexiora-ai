// GATE FIDÉLITÉ (D-088 · D5) — PHASE 10B, F1 · F4 · F5 · intention due.
//
// LA LACUNE QUE CETTE GATE FERME : `evaluatePromises` et `evaluateIntentCoverage`
// existaient, étaient testés, étaient cités comme SATISFAITS dans la ROADMAP —
// et n'étaient appelés PAR AUCUNE gate, PAR AUCUNE CI, PAR AUCUN Oracle. La
// ROADMAP le disait elle-même : « les deux gates sont exécutables et prouvées,
// elles ne sont pas câblées ». Un instrument que rien n'exécute ne garantit rien.
//
// Les cinq gates de la CI mesuraient le MOTEUR — il compile, il se rend, il
// navigue. Aucune ne mesurait la FIDÉLITÉ : le document tient-il ce que la
// demande exprimait ? C'est exactement l'objet de la Phase 10B.
const { readdirSync, readFileSync, existsSync } = await import("node:fs");
const { join } = await import("node:path");
const { fileURLToPath } = await import("node:url");
const R = join(fileURLToPath(import.meta.url), "..", "..", "..", "..") + "/";

const { migrateAirDocument, validateAirIntentRequirement } = await import(
  R + "packages/air-schema/src/index.ts"
);
const { EXECUTION_ENVELOPE_V1: ENV } = await import(R + "packages/execution-contract/src/envelope.ts");
const { evaluatePromises } = await import(R + "packages/fidelity/src/promises.ts");
const { evaluateIntentCoverage } = await import(R + "packages/fidelity/src/intent.ts");
const { BLOCKS } = await import(R + "packages/blocks/src/definitions.ts");

const SOURCES = [
  ["v2", R + "packages/golden-corpus/corpus-v2/"],
  ["v3", R + "packages/golden-corpus/corpus-v3/"],
].filter(([, d]) => existsSync(d));

const documents = [];
for (const [v, dir] of SOURCES) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".air.json"))) {
    documents.push([`${v}/${f.replace(".air.json", "")}`, JSON.parse(readFileSync(dir + f, "utf8"))]);
  }
}

console.log("═".repeat(96));
console.log("GATE FIDÉLITÉ — PHASE 10B · F1 promesses · F4 couverture · F5 états · intention due");
console.log("═".repeat(96));

// ── F5 — INVESTIGATION CAUSALE (D-090), et non plus simple constat.
//
// F5 demande : « aucun état n'est déclaré atteignable sans l'être ».
// La formulation précédente comparait `BLOCKS[].states` à
// `reachableBlockStates` et signalait 6 divergences. C'était mesurer la
// mauvaise chose : ces deux listes ne parlent PAS de la même propriété.
//
// TROIS SOURCES, causalement distinctes :
//   1. CONTRAT   `contracts.ts` — les unions `*BlockState`. Ce que le composant
//                sait RENDRE. Tenu par le compilateur : source canonique.
//   2. ENVELOPPE `reachableBlockStates` — ce que le runtime ATTEINT réellement,
//                établi par observation (D-060). Autre propriété, autre source.
//   3. REGISTRE  `BLOCKS[].states` — une RECOPIE À LA MAIN de (1), gelée en
//                Phase 3 et jamais remise à jour. C'est la source périmée, et
//                la seule cause des 6 « divergences ».
//
// L'INVARIANT RÉEL est : atteignable ⊆ rendable. On ne peut pas atteindre un
// état qu'on ne sait pas rendre. C'est LUI que F5 doit mesurer.
//
// MESURÉ : l'invariant est TENU sur les 6 blocs. `form.submitting` est
// rendable et non atteignable — c'est LÉGITIME, pas un défaut : l'enveloppe
// ne prétend pas l'atteindre. La péremption du registre reste signalée
// séparément, parce qu'une source de vérité dupliquée est un défaut en soi.
console.log("\n── F5 · états de bloc");
const CONTRATS = readFileSync(R + "packages/blocks/src/contracts.ts", "utf8");
const unionDuContrat = (nom) => {
  const i = CONTRATS.indexOf(`export type ${nom}`);
  if (i < 0) return null;
  const j = CONTRATS.indexOf("export ", i + 10);
  const bloc = CONTRATS.slice(i, j < 0 ? CONTRATS.length : j);
  const discrimine = (bloc.match(/kind: "([a-z]+)"/g) ?? []).map((x) => /"([a-z]+)"/.exec(x)[1]);
  const litteral = (/= ("[a-z]+"\s*\|\s*)+"[a-z]+"/.exec(bloc)?.[0].match(/"[a-z]+"/g) ?? []).map(
    (x) => x.replaceAll('"', ""),
  );
  const tous = [...new Set([...discrimine, ...litteral])];
  return tous.length > 0 ? tous : null;
};
const TYPE_ETAT = { list: "ListBlockState", form: "FormBlockState", detail_header: "DetailHeaderBlockState" };

let f5Violations = 0;
let registrePerime = 0;
for (const b of BLOCKS) {
  const rendable = TYPE_ETAT[b.id] === undefined ? null : unionDuContrat(TYPE_ETAT[b.id]);
  const atteignable = ENV.reachableBlockStates[b.id] ?? [];
  // L'INVARIANT : on n'atteint pas un état qu'on ne sait pas rendre.
  if (rendable !== null) {
    const impossibles = atteignable.filter((s) => !rendable.includes(s));
    f5Violations += impossibles.length;
    if (impossibles.length > 0) {
      console.log(`   ${b.id.padEnd(15)}🔴 ATTEIGNABLE SANS ÊTRE RENDABLE : ${impossibles.join(", ")}`);
    }
  }
  // La péremption du registre : défaut distinct, pas F5.
  const perimes = (rendable ?? []).filter((s) => !b.states.includes(s));
  registrePerime += perimes.length;
  if (perimes.length > 0) {
    console.log(
      `   ${b.id.padEnd(15)}🟠 registre périmé — le contrat rend ${perimes.join(", ")}, ` +
        "le registre ne les déclare pas",
    );
  }
}
console.log(
  `   invariant « atteignable ⊆ rendable » : ${f5Violations === 0 ? "🟢 TENU sur les 6 blocs" : `🔴 ${f5Violations} violation(s)`}`,
);
console.log(
  `   ${registrePerime} état(s) où le registre a dérivé du contrat` +
    (registrePerime > 0 ? "  — source de vérité DUPLIQUÉE, cause unique de l'alarme F5 d'origine" : ""),
);
if (registrePerime > 0) {
  // DIAGNOSTIC, pas seulement constat : investigué composant par composant.
  console.log(
    "   ⤷ SOURCE PÉRIMÉE : le registre. `DetailHeaderBlock` branche sur `state.kind`\n" +
      "     et rend ready/loading/empty/error ; `FormBlock` branche sur `state === …`\n" +
      "     et rend loading/empty/error/submitting. `BLOCKS[].states` sous-déclare les\n" +
      "     deux. Le registre est GELÉ (revue propriétaire) : la mise à jour de `states`\n" +
      "     est une décision du propriétaire, pas une correction technique.\n" +
      "     Divergence figée par `packages/blocks/tests/etats-divergence.test.ts`.",
  );
}

// ── F1 / F4 / intention due, document par document.
console.log("\n  document                    intention    F1 promesses        F4 couverture");
console.log("  " + "─".repeat(92));
let sansIntention = 0;
let f1KO = 0;
let f4KO = 0;
let motifsRefutes = 0;
for (const [nom, brut] of documents) {
  // Trois états DISTINCTS, jamais confondus : l'intention est due et présente,
  // due et absente (défaut), ou hors contrat (artefact gelé antérieur à 1.2.0
  // — légitimement dépourvu, et la migration s'interdit d'en inventer une).
  const manqueIntention = validateAirIntentRequirement(brut).length > 0;
  const horsContrat = brut.intent === undefined && !manqueIntention;
  if (manqueIntention) sansIntention++;
  const colonneIntention = manqueIntention
    ? "🔴 DUE     "
    : horsContrat
      ? `— ${String(brut.airSchemaVersion).padEnd(9)}`
      : "🟢 portée  ";
  let air;
  try {
    air = migrateAirDocument(brut);
  } catch {
    console.log(`  ${nom.padEnd(27)} 🔴 DOCUMENT INVALIDE — non évaluable`);
    f1KO++;
    f4KO++;
    continue;
  }
  const f1 = evaluatePromises(air, ENV);
  const f4 = evaluateIntentCoverage(air, ENV);
  const refutes = f4.verdicts.filter((v) => v.state === "motif_refute").length;
  motifsRefutes += refutes;
  if (!f1.passed) f1KO++;
  // B (arbitrage 2026-09-04) — F4 mesure « tout besoin EXPRIMÉ est satisfait
  // ou déclaré inexprimable » : un artefact gelé antérieur à 1.2.0, que ce
  // fichier reconnaît déjà « légitimement dépourvu » d'intention (l. 134-135
  // ci-dessus, où il est EXCLU de `sansIntention`), n'exprime aucun besoin et
  // ne peut donc en perdre aucun. Le compter en échec F4 était une
  // CONTRADICTION INTERNE de cette gate — le même fichier excusait puis
  // sanctionnait le même fait —, pas une exigence de la ROADMAP.
  // F1 RESTE INCHANGÉ sur ces mêmes documents (l. 154) : leurs promesses
  // mortes sont RÉELLES, mesurées, et demeurent un échec bloquant.
  if (!f4.passed && !horsContrat) f4KO++;
  console.log(
    `  ${nom.padEnd(27)} ${colonneIntention} ` +
      `${f1.passed ? "🟢" : "🔴"} ${`${f1.vivantes}/${f1.declared} vivantes`.padEnd(18)}` +
      `${f4.passed ? "🟢" : "🔴"} ${
        f4.present
          ? `${f4.satisfaits} ok · ${f4.inexprimables} dits · ${refutes} motifs réfutés`
          : "aucune intention"
      }`,
  );
}

console.log("\n" + "─".repeat(96));
const echecs = [];
if (sansIntention > 0) echecs.push(`${sansIntention} document(s) doivent une intention et n'en portent pas`);
if (f1KO > 0) echecs.push(`F1 : ${f1KO} document(s) promettent sur des cibles mortes ou absentes`);
if (f4KO > 0) echecs.push(`F4 : ${f4KO} document(s) perdent ou écartent un besoin à tort`);
if (motifsRefutes > 0) echecs.push(`${motifsRefutes} motif(s) d'inexprimabilité RÉFUTÉS par l'enveloppe`);
if (f5Violations > 0) echecs.push(`F5 : ${f5Violations} état(s) ATTEIGNABLE(S) SANS ÊTRE RENDABLE(S)`);
if (registrePerime > 0) {
  echecs.push(
    `SOURCE DUPLIQUÉE : \`BLOCKS[].states\` recopie le contrat et a dérivé sur ${registrePerime} état(s)`,
  );
}

// AUCUN PLAFOND. Cette gate mesure la FIDÉLITÉ, pas une dette tolérée : un
// plafond y transformerait « le générateur perd des besoins » en budget.
if (echecs.length === 0) {
  console.log("  🟢 FIDÉLITÉ TENUE sur les deux corpus.");
  process.exit(0);
}
for (const e of echecs) console.log(`  🔴 ${e}`);
console.log("\n  🔴 ÉCHEC — la fidélité n'est pas tenue. Aucun plafond : ce sont des défauts, pas une dette.");
process.exit(1);
