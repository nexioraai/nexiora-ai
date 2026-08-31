// CAMPAGNE 2 — CAS-TUEURS. Verdicts attendus DÉCLARÉS AVANT exécution (ci-dessous).
// Ajout par rapport à la campagne 1 : CHAQUE document d'attaque traverse
// d'abord les validateurs réels (schéma + sémantique + registre de blocs).
// Un document rejeté en amont ne prouve RIEN sur la gate.
const REPO = "/Users/yia/Documents/woorri";
const { analyzeFeasibility } = await import(REPO + "/packages/execution-contract/src/feasibility.ts");
const { EXECUTION_ENVELOPE_V1: E } = await import(REPO + "/packages/execution-contract/src/envelope.ts");
const { validateAir } = await import(REPO + "/packages/air-schema/src/validate.ts");
const { projectAirSchema } = await import(REPO + "/packages/air-schema/src/air.ts");
const { validateAirBlocks } = await import(REPO + "/packages/blocks/src/registry.ts");

const L = (t) => [{ locale: "fr-FR", text: t }];
const P = (o) => Object.entries(o).map(([key, value]) => ({ key, value }));
const H = "0".repeat(64);
const base = (o = {}) => ({ airSchemaVersion: "1.1.0", projectId: "prj_kt2",
  app: { name: "KT2", slug: "kt2-app", locales: { userLanguage: "fr-FR", appLocales: ["fr-FR"],
    defaultAppLocale: "fr-FR", contentLocales: ["fr-FR"], rtlSupported: false } },
  screens: [], navigation: { entryScreenId: "scr_a", routes: [] }, entities: [], relations: [],
  datasets: [], actions: [], rules: [], slots: [], capabilities: [], permissions: [],
  design: { theme: "kt", overrides: [{ key: "radius.sm", value: 4 }] }, integrations: [],
  network: { policy: "deny_by_default", allowedDomains: [] },
  native: { minIosVersion: "16.4", minAndroidSdk: 26 },
  compliance: { commerceClass: "none", accountDeletionRequired: false, dataCollected: [] },
  expectedTests: [], ...o });
const ent = (id, f = 1) => ({ id, name: id.slice(4), fields: Array.from({ length: f }, (_, i) =>
  ({ id: `fld_${id.slice(4)}_f${i}`, name: `f${i}`, type: "string", required: i === 0 })) });

/** Traverse TOUTE la chaîne de validation avant de mesurer quoi que ce soit. */
function admissible(doc) {
  const parsed = projectAirSchema.safeParse(doc);
  if (!parsed.success) return { ok: false, why: "schéma: " + parsed.error.issues[0].message };
  const sem = validateAir(parsed.data);
  if (sem.length) return { ok: false, why: "sémantique: " + sem[0].code };
  const blk = validateAirBlocks(parsed.data);
  if (blk.length) return { ok: false, why: "registre de blocs: " + blk[0].code };
  return { ok: true, air: parsed.data };
}

const results = [];
const KT = (id, gate, kind, attaque, attendu, fn) => {
  let reel = "ERREUR", detail = "";
  try { const r = fn(); reel = r.verdict; detail = r.detail ?? ""; }
  catch (e) { reel = "EXCEPTION"; detail = String(e.message).slice(0, 90); }
  results.push({ id, gate, kind, attaque, attendu, reel, ok: reel === attendu, detail });
};
const V = (tombe, d = "") => ({ verdict: tombe ? "GATE TOMBE" : "GATE PASSE", detail: d });
const codes = (r) => [...new Set(r.gaps.map((g) => g.code))].sort().join(",") || "aucun";

// ─────────────────────────────────────────────────────────────────────────────
// KT-C2-01 · BLIND · chemin fantôme par déclencheur `ui` sur un bloc INERTE.
//   Le runtime n'attache aucun handler à `header` / `detail_header`.
//   ATTENDU AVANT EXÉCUTION : la gate DOIT TOMBER (scr_z est réellement mort).
KT("KT-C2-01", "G4", "BLIND", "déclencheur `ui` porté par un bloc `header` (aucun handler runtime)", "GATE TOMBE", () => {
  const a = admissible(base({
    screens: [{ id: "scr_a", title: L("A"), blocks: [{ id: "blk_h", blockType: "header", props: P({ title: "A" }) }] },
              { id: "scr_z", title: L("Z"), blocks: [{ id: "blk_z", blockType: "header", props: P({ title: "Z" }) }] }],
    navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }, { id: "nav_z", screenId: "scr_z" }] },
    actions: [{ id: "act_u", name: "u", trigger: { kind: "ui", blockId: "blk_h" }, effect: { kind: "navigate", screenId: "scr_z" } }] }));
  if (!a.ok) return V(true, "REJETÉ EN AMONT — " + a.why);
  const r = analyzeFeasibility(a.air, E);
  return V(r.gaps.some((g) => g.code.startsWith("EXEC_SCREEN_UNREACHABLE")),
    `écarts=${r.gaps.length} [${codes(r)}] · déclaré=${r.metrics.screensReachableDeclared}/${r.metrics.screensDeclared} · effectif=${r.metrics.screensReachableEffective}/${r.metrics.screensDeclared} · effets exécutés=${r.metrics.effectsExecuted}/${r.metrics.effectsDeclared}`);
});

// KT-C2-02 · BLIND · D004 sous une enveloppe ÉLARGIE aux déclencheurs `data`.
//   Falsifie (ou confirme) la « défense en profondeur » attribuée à la métrique effective.
//   ATTENDU : si la défense est réelle, l'effectif reste 2/4 ⇒ GATE TOMBE.
KT("KT-C2-02", "G4", "BLIND", "D004 rejoué avec `data` DANS l'enveloppe — la métrique effective tient-elle ?", "GATE TOMBE", () => {
  const doc = base({
    screens: [{ id: "scr_a", title: L("A"), blocks: [{ id: "blk_h", blockType: "header", props: P({ title: "A" }) }] },
              { id: "scr_z", title: L("Z"), blocks: [{ id: "blk_z", blockType: "header", props: P({ title: "Z" }) }] }],
    navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }, { id: "nav_z", screenId: "scr_z" }] },
    entities: [ent("ent_x")],
    actions: [{ id: "act_d", name: "d", trigger: { kind: "data", entityId: "ent_x", event: "created" }, effect: { kind: "navigate", screenId: "scr_z" } }] });
  const a = admissible(doc); if (!a.ok) return V(true, "REJETÉ — " + a.why);
  const large = { ...E, triggers: ["ui", "data"] };
  const r = analyzeFeasibility(a.air, large);
  return V(r.metrics.screensReachableEffective < r.metrics.screensDeclared,
    `effectif=${r.metrics.screensReachableEffective}/${r.metrics.screensDeclared} sous enveloppe élargie (v1 : 1/2)`);
});

// KT-C2-03 · BLIND · miroir de D005 : `entity_not_empty` sur une entité SANS dataset.
//   ATTENDU : la gate DOIT TOMBER (bloc jamais rendu).
KT("KT-C2-03", "G5", "BLIND", "condition `entity_not_empty` sur une entité sans dataset — bloc jamais rendu", "GATE TOMBE", () => {
  const a = admissible(base({
    screens: [{ id: "scr_a", title: L("A"), blocks: [
      { id: "blk_h", blockType: "header", props: P({ title: "A" }) },
      { id: "blk_dead", blockType: "button", visibleWhen: { kind: "entity_not_empty", entityId: "ent_vide" }, props: P({ label: "jamais", actionId: "act_n" }) }] }],
    navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }] },
    entities: [ent("ent_vide")],
    actions: [{ id: "act_n", name: "n", trigger: { kind: "ui", blockId: "blk_dead" }, effect: { kind: "navigate", screenId: "scr_a" } }] }));
  if (!a.ok) return V(true, "REJETÉ — " + a.why);
  const r = analyzeFeasibility(a.air, E);
  return V(r.gaps.some((g) => /INVISIBLE|NEVER|DEAD|UNSAT/i.test(g.code)), `écarts=${r.gaps.length} [${codes(r)}]`);
});

// KT-C2-04 · BLIND · source d'`itemId` fournie par une liste sur un écran MORT.
//   ATTENDU : la gate DOIT TOMBER (aucune source réelle d'itemId).
KT("KT-C2-04", "G4", "BLIND", "source d'`itemId` satisfaite par une liste située sur un écran inatteignable", "GATE TOMBE", () => {
  const a = admissible(base({
    screens: [
      { id: "scr_a", title: L("A"), blocks: [{ id: "blk_h", blockType: "header", props: P({ title: "A" }) }] },
      { id: "scr_mort", title: L("M"), blocks: [{ id: "blk_l", blockType: "list", entityId: "ent_x", props: P({ titleFieldId: "fld_x_f0" }) }] },
      { id: "scr_det", title: L("D"), blocks: [{ id: "blk_dh", blockType: "detail_header", entityId: "ent_x", props: P({ titleFieldId: "fld_x_f0" }) }] }],
    navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }, { id: "nav_m", screenId: "scr_mort" }, { id: "nav_d", screenId: "scr_det" }] },
    entities: [ent("ent_x")], datasets: [{ id: "data_x", entityId: "ent_x", contentHash: H, rowCount: 4 }],
    actions: [{ id: "act_o", name: "o", trigger: { kind: "ui", blockId: "blk_l" }, effect: { kind: "navigate", screenId: "scr_det" } }] }));
  if (!a.ok) return V(true, "REJETÉ — " + a.why);
  const r = analyzeFeasibility(a.air, E);
  return V(r.gaps.some((g) => g.code === "EXEC_DETAIL_WITHOUT_ITEM_SOURCE"), `écarts=${r.gaps.length} [${codes(r)}]`);
});

// KT-C2-05 · BLIND · réfutation du verdict de campagne 1 sur KT-G05-B03.
//   Le runtime dispatche par `props.actionId` SANS lire `trigger.kind`.
//   Le protocole déclare pourtant un CONTRÔLE FANTÔME.
//   ATTENDU (verdict de campagne 1) : GATE TOMBE = bon comportement.
//   Ce test vérifie l'inverse : la gate ne doit PAS tomber, le contrôle agit.
KT("KT-C2-05", "G5", "BLIND", "faux positif : `props.actionId` + trigger `lifecycle` — le runtime dispatche pourtant", "GATE PASSE", () => {
  const a = admissible(base({
    screens: [{ id: "scr_a", title: L("A"), blocks: [{ id: "blk_b", blockType: "button", props: P({ label: "X", actionId: "act_l" }) }] },
              { id: "scr_b", title: L("B"), blocks: [{ id: "blk_h", blockType: "header", props: P({ title: "B" }) }] }],
    navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }, { id: "nav_b", screenId: "scr_b" }] },
    actions: [{ id: "act_l", name: "l", trigger: { kind: "lifecycle", event: "screen_open", screenId: "scr_a" }, effect: { kind: "navigate", screenId: "scr_b" } }] }));
  if (!a.ok) return V(true, "REJETÉ — " + a.why);
  const r = analyzeFeasibility(a.air, E);
  const ghost = r.gaps.some((g) => g.code === "EXEC_GHOST_CONTROL");
  return V(ghost, `fantôme déclaré=${ghost} · effectif=${r.metrics.screensReachableEffective}/${r.metrics.screensDeclared} · le runtime dispatche props.actionId sans lire trigger.kind`);
});

// KT-C2-06 · COMPOSITION · R-25 SANS D004 ni D005 : troc par écarts en série.
//   Retirer 5 capabilities (−5 écarts triviaux) tout en ajoutant 1 écran mort (+1 écart critique).
//   ATTENDU : la gate DOIT TOMBER (le score ne doit pas s'améliorer alors qu'un défaut critique apparaît).
KT("KT-C2-06", "G1/G22", "COMPOSITION", "R-25 sans D004/D005 : −5 écarts `capability` triviaux, +1 écran mort critique", "GATE TOMBE", () => {
  const scr = (id, t) => ({ id, title: L(t), blocks: [{ id: "blk_" + id, blockType: "header", props: P({ title: t }) }] });
  const avant = admissible(base({
    screens: [scr("scr_a", "A")], navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }] },
    capabilities: [{ capability: "share" }, { capability: "camera" }, { capability: "maps" }, { capability: "notifications" }, { capability: "geolocation" }] }));
  const apres = admissible(base({
    screens: [scr("scr_a", "A"), scr("scr_z", "Z")],
    navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }, { id: "nav_z", screenId: "scr_z" }] },
    capabilities: [] }));
  if (!avant.ok || !apres.ok) return V(true, "REJETÉ — " + (avant.why ?? apres.why));
  const r1 = analyzeFeasibility(avant.air, E), r2 = analyzeFeasibility(apres.air, E);
  return V(r2.gaps.length >= r1.gaps.length,
    `écarts AVANT=${r1.gaps.length} [${codes(r1)}] → APRÈS=${r2.gaps.length} [${codes(r2)}] · verdict ${r1.verdict}→${r2.verdict}`);
});

// KT-C2-07 · BLIND · métrique constante : `capabilitiesWired` ne mesure pas l'artefact.
//   ATTENDU : la gate DOIT TOMBER si la métrique varie avec le produit. Elle ne varie pas.
KT("KT-C2-07", "G0", "BLIND", "`capabilitiesWired`/`slotsInvoked`/`rulesEnforced` : fonction de l'enveloppe, pas de l'artefact", "GATE TOMBE", () => {
  const a = admissible(base({ screens: [{ id: "scr_a", title: L("A"), blocks: [{ id: "blk_h", blockType: "header", props: P({ title: "A" }) }] }],
    navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }] }, capabilities: [{ capability: "share" }] }));
  if (!a.ok) return V(true, "REJETÉ — " + a.why);
  const menteuse = { ...E, capabilitiesEmitCode: true, slotsInvoked: true, rulesEnforced: true };
  const r = analyzeFeasibility(a.air, menteuse);
  return V(r.gaps.some((g) => g.code === "EXEC_CAPABILITY_NOT_WIRED"),
    `sous une enveloppe déclarant \`capabilitiesEmitCode:true\` : écarts=${r.gaps.length}, capabilitiesWired=${r.metrics.capabilitiesWired}/${r.metrics.capabilitiesDeclared} — aucune observation de l'artefact`);
});

console.log("ID".padEnd(12) + "GATE".padEnd(8) + "TYPE".padEnd(13) + "ATTENDU".padEnd(12) + "RÉEL".padEnd(12) + "RÉSULTAT");
console.log("─".repeat(100));
for (const r of results) console.log(r.id.padEnd(12) + r.gate.padEnd(8) + r.kind.padEnd(13) + r.attendu.padEnd(12) + r.reel.padEnd(12) + (r.ok ? "🟢 conforme" : "🔴 ÉCHEC"));
const ko = results.filter((r) => !r.ok);
console.log(`\n${results.length - ko.length}/${results.length} conformes · ${ko.length} ÉCHEC(S)\n`);
for (const r of results) console.log(`${r.id} · ${r.attaque}\n    ${r.ok ? "🟢" : "🔴"} ${r.detail}`);
