// CONTRAT D'EXÉCUTION — INSTRUMENT DE MESURE (Étape 1).
//
// Rôle EXCLUSIF : produire, depuis les documents réels et le moteur réel, la
// mesure de l'écart entre ce que les AIR DÉCLARENT et ce que le moteur sait
// EXÉCUTER. Aucun chiffre n'est saisi à la main ; le rapport est recalculé
// intégralement à chaque exécution.
//
// POURQUOI CET INSTRUMENT EST LE LIVRABLE DE L'ÉTAPE 1.
// L'étape suivante (AIR 2.0) doit combler les manques d'EXPRESSIVITÉ du
// contrat. Décider de ces manques d'intuition reproduirait l'erreur d'origine :
// le schéma a été gelé en Phase 2 avant qu'aucun consommateur complet
// n'existe. Cette mesure produit la spécification À LA PLACE de l'intuition —
// elle nomme, sur des documents réels, ce que le contrat ne sait pas dire.
//
// Il MESURE, il ne juge pas, il ne bloque rien. Le blocage est l'affaire de
// l'Oracle et du gate ; leur durcissement relève d'une décision consignée.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CORPUS = join(REPO, "packages/golden-corpus/corpus-v2");
const SLICE = join(REPO, "slices/conteneurs/air/suivi-conteneurs.air.json");

const { migrateAirDocument } = await import(join(REPO, "packages/air-schema/src/index.ts"));
const { analyzeFeasibility, EXECUTION_ENVELOPE_V1 } = await import(
  join(REPO, "packages/execution-contract/src/index.ts")
);

const documents = [
  ...readdirSync(CORPUS)
    .filter((f) => f.endsWith(".air.json"))
    .sort()
    .map((f) => ({ nom: f.replace(".air.json", ""), origine: "corpus gelé", chemin: join(CORPUS, f) })),
];
try {
  readFileSync(SLICE);
  documents.push({ nom: "suivi-conteneurs", origine: "slice 2 hors-template", chemin: SLICE });
} catch {
  // Le slice n'est pas versionné : son absence ne doit jamais faire échouer
  // la mesure du corpus, qui est la partie stable.
}

const rapports = documents.map((d) => {
  const air = migrateAirDocument(JSON.parse(readFileSync(d.chemin, "utf8")));
  return { ...d, rapport: analyzeFeasibility(air, EXECUTION_ENVELOPE_V1) };
});

const somme = (cle) => rapports.reduce((t, r) => t + r.rapport.metrics[cle], 0);
const ecarts = rapports.flatMap((r) => r.rapport.gaps);

const parCode = {};
for (const g of ecarts) {
  parCode[g.code] ??= { total: 0, owner: g.owner };
  parCode[g.code].total += 1;
}
const parProprietaire = {};
for (const g of ecarts) parProprietaire[g.owner] = (parProprietaire[g.owner] ?? 0) + 1;

// SPÉCIFICATION DE L'AIR 2.0, DÉRIVÉE DE LA MESURE.
// Chaque entrée est un manque d'EXPRESSIVITÉ constaté sur des documents
// réels — jamais une idée. Un manque non observé n'entre pas dans la liste.
const CODE_TO_BESOIN = {
  EXEC_REFERENCE_RENDERED_RAW:
    "traversée de relation : afficher un champ de l'entité CIBLE d'une référence",
  EXEC_DETAIL_WITHOUT_ITEM_SOURCE:
    "liaison explicite liste → écran de détail (transport de l'identifiant d'élément)",
  EXEC_CROSS_SCREEN_FORM_STATE:
    "état de parcours partagé entre écrans (formulaire multi-étapes)",
  EXEC_SLOT_NOT_INVOKED:
    "point d'ancrage d'un Code Slot (liaison entrées/sorties à un site d'exécution)",
};
const specAir2 = Object.entries(parCode)
  .filter(([code, v]) => v.owner === "contrat" && CODE_TO_BESOIN[code] !== undefined)
  .map(([code, v]) => ({
    besoin: CODE_TO_BESOIN[code],
    code,
    occurrences: v.total,
    documentsTouches: rapports.filter((r) => r.rapport.gaps.some((g) => g.code === code)).length,
  }))
  .sort((a, b) => b.occurrences - a.occurrences);

const rapport = {
  mesure: "contrat d'exécution — écart déclaré / exécuté",
  etape: 1,
  enveloppe: EXECUTION_ENVELOPE_V1.version,
  documents: rapports.length,
  totaux: {
    effetsDeclares: somme("effectsDeclared"),
    effetsExecutes: somme("effectsExecuted"),
    ecransDeclares: somme("screensDeclared"),
    ecransAtteignablesDeclare: somme("screensReachableDeclared"),
    ecransAtteignablesEffectif: somme("screensReachableEffective"),
    controlesVisibles: somme("controlsVisible"),
    controlesFantomes: somme("ghostControls"),
    blocsLiesAUneEntite: somme("dataBoundBlocks"),
    blocsAvecSourceDeDonnees: somme("dataBoundBlocksWithSource"),
    etatsDeclares: somme("blockStatesDeclared"),
    etatsAtteignables: somme("blockStatesReachable"),
    capabilitiesDeclarees: somme("capabilitiesDeclared"),
    capabilitiesCablees: somme("capabilitiesWired"),
    slotsDeclares: somme("slotsDeclared"),
    slotsInvoques: somme("slotsInvoked"),
    reglesDeclarees: somme("rulesDeclared"),
    reglesAppliquees: somme("rulesEnforced"),
    referencesRenduesBrutes: somme("rawReferencesRendered"),
  },
  ecarts: { total: ecarts.length, parProprietaire, parCode },
  lecture: {
    moteur:
      "Le moteur ne sait pas exécuter ce que le document déclare LÉGITIMEMENT. Tous les AIR portent l'écart ; aucun document ne peut l'éviter. Relève des étapes d'exécution.",
    contrat:
      "Le schéma AIR ne permet pas d'exprimer ce qu'il faudrait. Aucun AIR ne peut éviter l'écart, même parfaitement rédigé. Relève de l'AIR 2.0.",
    document:
      "Le document est mal spécifié ; un autre AIR du même domaine n'aurait pas l'écart. Relève de la génération d'AIR, jamais du moteur.",
  },
  specificationAir2: specAir2,
  parDocument: rapports.map((r) => ({
    document: r.nom,
    origine: r.origine,
    verdict: r.rapport.verdict,
    sceau: r.rapport.reportHash.slice(0, 16),
    ecarts: r.rapport.gaps.length,
    effets: `${r.rapport.metrics.effectsExecuted}/${r.rapport.metrics.effectsDeclared}`,
    ecransAtteignables: `${r.rapport.metrics.screensReachableEffective}/${r.rapport.metrics.screensDeclared}`,
    controlesFantomes: `${r.rapport.metrics.ghostControls}/${r.rapport.metrics.controlsVisible}`,
  })),
};

mkdirSync(join(HERE, "results"), { recursive: true });
const sortie = join(HERE, "results", "execution-contract-latest.json");
writeFileSync(sortie, JSON.stringify(rapport, null, 2) + "\n", "utf8");

const t = rapport.totaux;
const pct = (a, b) => (b === 0 ? "—" : `${Math.round((100 * a) / b)} %`);
console.log(`CONTRAT D'EXÉCUTION — ${rapport.documents} documents · enveloppe ${rapport.enveloppe}\n`);
console.log("  effets exécutés          ", `${t.effetsExecutes}/${t.effetsDeclares}`.padStart(9), pct(t.effetsExecutes, t.effetsDeclares));
console.log("  écrans atteignables      ", `${t.ecransAtteignablesEffectif}/${t.ecransDeclares}`.padStart(9), pct(t.ecransAtteignablesEffectif, t.ecransDeclares));
console.log("  contrôles NON fantômes   ", `${t.controlesVisibles - t.controlesFantomes}/${t.controlesVisibles}`.padStart(9), pct(t.controlesVisibles - t.controlesFantomes, t.controlesVisibles));
console.log("  blocs avec données       ", `${t.blocsAvecSourceDeDonnees}/${t.blocsLiesAUneEntite}`.padStart(9), pct(t.blocsAvecSourceDeDonnees, t.blocsLiesAUneEntite));
console.log("  états atteignables       ", `${t.etatsAtteignables}/${t.etatsDeclares}`.padStart(9), pct(t.etatsAtteignables, t.etatsDeclares));
console.log("  capabilities câblées     ", `${t.capabilitiesCablees}/${t.capabilitiesDeclarees}`.padStart(9), pct(t.capabilitiesCablees, t.capabilitiesDeclarees));
console.log("  slots invoqués           ", `${t.slotsInvoques}/${t.slotsDeclares}`.padStart(9), pct(t.slotsInvoques, t.slotsDeclares));
console.log("  règles appliquées        ", `${t.reglesAppliquees}/${t.reglesDeclarees}`.padStart(9), pct(t.reglesAppliquees, t.reglesDeclarees));
console.log(`\n  écarts : ${rapport.ecarts.total} — ${JSON.stringify(parProprietaire)}`);
console.log("\n  SPÉCIFICATION AIR 2.0 (dérivée de la mesure, non de l'intuition) :");
for (const b of specAir2) {
  console.log(`    · ${b.besoin}`);
  console.log(`        ${b.occurrences} occurrence(s) sur ${b.documentsTouches} document(s)`);
}
console.log(`\n  → ${sortie}`);
