// EXP-1 · SONDES D'HYPOTHÈSES (étape 3) + MONOTONIE DE L'AGRÉGATION (étape 8).
// Chaque sonde teste UNE hypothèse gelée, sur un document qui ne contient
// NI le motif de D004 NI celui de D005. Lecture seule.
const REPO = "/Users/yia/Documents/woorri";
const { analyzeFeasibility } = await import(REPO + "/packages/execution-contract/src/feasibility.ts");
const { reachableScreens } = await import(REPO + "/packages/execution-contract/src/graph.ts");
const { EXECUTION_ENVELOPE_V1: E } = await import(REPO + "/packages/execution-contract/src/envelope.ts");
const { validateAir } = await import(REPO + "/packages/air-schema/src/validate.ts");
const { projectAirSchema } = await import(REPO + "/packages/air-schema/src/air.ts");
const { validateAirBlocks } = await import(REPO + "/packages/blocks/src/registry.ts");

const L = (t) => [{ locale: "fr-FR", text: t }];
const P = (o) => Object.entries(o).map(([key, value]) => ({ key, value }));
const H = "0".repeat(64);
const base = (o = {}) => ({ airSchemaVersion: "1.1.0", projectId: "prj_exp1",
  app: { name: "E", slug: "e-app", locales: { userLanguage: "fr-FR", appLocales: ["fr-FR"],
    defaultAppLocale: "fr-FR", contentLocales: ["fr-FR"], rtlSupported: false } },
  screens: [], navigation: { entryScreenId: "scr_a", routes: [] }, entities: [], relations: [],
  datasets: [], actions: [], rules: [], slots: [], capabilities: [], permissions: [],
  design: { theme: "e", overrides: [{ key: "radius.sm", value: 4 }] }, integrations: [],
  network: { policy: "deny_by_default", allowedDomains: [] },
  native: { minIosVersion: "16.4", minAndroidSdk: 26 },
  compliance: { commerceClass: "none", accountDeletionRequired: false, dataCollected: [] },
  expectedTests: [], ...o });
const ent = (id) => ({ id, name: id.slice(4), fields: [{ id: `fld_${id.slice(4)}_f0`, name: "f0", type: "string", required: true }] });
const ok = (doc) => { const p = projectAirSchema.safeParse(doc);
  if (!p.success) return { ok: false, why: "schéma:" + p.error.issues[0].path.join(".") };
  const s = validateAir(p.data); if (s.length) return { ok: false, why: "sémantique:" + s[0].code };
  const b = validateAirBlocks(p.data); if (b.length) return { ok: false, why: "blocs:" + b[0].code };
  return { ok: true, air: p.data }; };

const out = [];
const probe = (h, nom, attendu, fn) => { let r; try { r = fn(); } catch (e) { r = { verdict: "EXCEPTION", d: String(e.message).slice(0, 70) }; }
  out.push({ h, nom, attendu, reel: r.verdict, d: r.d ?? "", ok: r.verdict === attendu }); };
const V = (tombe, d) => ({ verdict: tombe ? "DÉTECTÉ" : "NON DÉTECTÉ", d });

// ── H-B · « screens = routes » : un écran sans route n'est pas un écran du navigateur.
probe("H-B", "écran cible SANS entrée dans navigation.routes", "DÉTECTÉ", () => {
  const a = ok(base({
    screens: [{ id: "scr_a", title: L("A"), blocks: [{ id: "blk_b", blockType: "button", props: P({ label: "go", actionId: "act_g" }) }] },
              { id: "scr_z", title: L("Z"), blocks: [{ id: "blk_z", blockType: "header", props: P({ title: "Z" }) }] }],
    navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }] },   // scr_z SANS route
    actions: [{ id: "act_g", name: "g", trigger: { kind: "ui", blockId: "blk_b" }, effect: { kind: "navigate", screenId: "scr_z" } }] }));
  if (!a.ok) return V(true, "rejeté en amont — " + a.why);
  const r = analyzeFeasibility(a.air, E);
  return V(r.gaps.some((g) => /ROUTE/i.test(g.code)),
    `écarts=${r.gaps.length} · effectif=${r.metrics.screensReachableEffective}/${r.metrics.screensDeclared} · scr_z compté atteignable sans être un écran du Stack`); });

// ── H-H · « une liste est pressable indépendamment de son nombre de lignes ».
probe("H-H", "liste à 0 ligne comme seul chemin vers un écran", "DÉTECTÉ", () => {
  const a = ok(base({
    screens: [{ id: "scr_a", title: L("A"), blocks: [{ id: "blk_l", blockType: "list", entityId: "ent_x", props: P({ titleFieldId: "fld_x_f0" }) }] },
              { id: "scr_z", title: L("Z"), blocks: [{ id: "blk_z", blockType: "header", props: P({ title: "Z" }) }] }],
    navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }, { id: "nav_z", screenId: "scr_z" }] },
    entities: [ent("ent_x")], datasets: [{ id: "data_x", entityId: "ent_x", contentHash: H, rowCount: 0 }],
    actions: [{ id: "act_o", name: "o", trigger: { kind: "ui", blockId: "blk_l" }, effect: { kind: "navigate", screenId: "scr_z" } }] }));
  if (!a.ok) return V(true, "rejeté — " + a.why);
  const r = analyzeFeasibility(a.air, E);
  const unreach = r.gaps.some((g) => g.path === "screens.scr_z" && g.code.startsWith("EXEC_SCREEN_UNREACHABLE"));
  return V(unreach, `écarts=${r.gaps.length} [${[...new Set(r.gaps.map(g=>g.code))].join(",")}] · effectif=${r.metrics.screensReachableEffective}/2 — scr_z réputé atteignable via une liste vide`); });

// ── H-G · « props.actionId et trigger.blockId désignent la même action ».
probe("H-G", "bouton dont props.actionId ≠ action au déclencheur ui", "DÉTECTÉ", () => {
  const a = ok(base({
    screens: [{ id: "scr_a", title: L("A"), blocks: [{ id: "blk_b", blockType: "button", props: P({ label: "x", actionId: "act_reste" }) }] },
              { id: "scr_z", title: L("Z"), blocks: [{ id: "blk_z", blockType: "header", props: P({ title: "Z" }) }] }],
    navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }, { id: "nav_z", screenId: "scr_z" }] },
    actions: [{ id: "act_reste", name: "r", trigger: { kind: "lifecycle", event: "app_start" }, effect: { kind: "navigate", screenId: "scr_a" } },
              { id: "act_z", name: "z", trigger: { kind: "ui", blockId: "blk_b" }, effect: { kind: "navigate", screenId: "scr_z" } }] }));
  if (!a.ok) return V(true, "rejeté — " + a.why);
  const r = analyzeFeasibility(a.air, E);
  return V(r.gaps.some((g) => /MISMATCH|CONFLICT|AMBIG/i.test(g.code)),
    `écarts=${r.gaps.length} [${[...new Set(r.gaps.map(g=>g.code))].join(",")}] · effectif=${r.metrics.screensReachableEffective}/2 — au runtime le bouton dispatche act_reste, jamais act_z`); });

// ── H-M · « le graphe runtime ne contient que les arêtes déclarées » (pile native ⇒ retour).
probe("H-M", "arête retour de la pile native, jamais déclarée dans l'AIR", "DÉTECTÉ", () => {
  const a = ok(base({
    screens: [{ id: "scr_a", title: L("A"), blocks: [{ id: "blk_b", blockType: "button", props: P({ label: "go", actionId: "act_g" }) }] },
              { id: "scr_z", title: L("Z"), blocks: [{ id: "blk_z", blockType: "header", props: P({ title: "Z" }) }] }],
    navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }, { id: "nav_z", screenId: "scr_z" }] },
    actions: [{ id: "act_g", name: "g", trigger: { kind: "ui", blockId: "blk_b" }, effect: { kind: "navigate", screenId: "scr_z" } }] }));
  if (!a.ok) return V(true, "rejeté — " + a.why);
  const decl = reachableScreens(a.air, ["ui", "lifecycle", "data"]);
  return V(false, `le validateur énumère ${decl.length} écrans et 1 arête ; le Stack natif offre en plus scr_z→scr_a (retour), jamais modélisée`); });

// ═══════════ ÉTAPE 8 · MONOTONIE ET SUPERADDITIVITÉ DE L'AGRÉGATION ═══════════
const scr = (id, t, blocks = []) => ({ id, title: L(t), blocks: blocks.length ? blocks : [{ id: "blk_" + id, blockType: "header", props: P({ title: t }) }] });
const nav = (ids) => ({ entryScreenId: "scr_a", routes: ids.map((s) => ({ id: "nav_" + s.slice(4), screenId: s })) });
// A : deux écrans morts (défaut CRITIQUE seul).
const A = ok(base({ screens: [scr("scr_a", "A"), scr("scr_y", "Y"), scr("scr_z", "Z")], navigation: nav(["scr_a", "scr_y", "scr_z"]) }));
// B : quatre déclencheurs `data` inertes vers des écrans EXISTANTS et déjà atteignables (défaut TRIVIAL seul).
const Bdoc = base({ screens: [scr("scr_a", "A")], navigation: nav(["scr_a"]), entities: [ent("ent_x")],
  actions: Array.from({ length: 4 }, (_, i) => ({ id: `act_d${i}`, name: "d", trigger: { kind: "data", entityId: "ent_x", event: "created" }, effect: { kind: "navigate", screenId: "scr_a" } })) });
const B = ok(Bdoc);
// A ∪ B : les mêmes déclencheurs `data`, pointant cette fois vers les écrans morts.
const AB = ok(base({ screens: [scr("scr_a", "A"), scr("scr_y", "Y"), scr("scr_z", "Z")], navigation: nav(["scr_a", "scr_y", "scr_z"]), entities: [ent("ent_x")],
  actions: [{ id: "act_dy", name: "dy", trigger: { kind: "data", entityId: "ent_x", event: "created" }, effect: { kind: "navigate", screenId: "scr_y" } },
            { id: "act_dz", name: "dz", trigger: { kind: "data", entityId: "ent_x", event: "created" }, effect: { kind: "navigate", screenId: "scr_z" } }] }));

console.log("═".repeat(92));
console.log("EXP-1 · SONDES D'HYPOTHÈSES (documents sans motif D004 ni D005)");
console.log("═".repeat(92));
for (const r of out) console.log(`${r.h.padEnd(5)} ${r.ok ? "🟢" : "🔴"} ${r.reel.padEnd(13)} ${r.nom}\n         ${r.d}`);

console.log("\n" + "═".repeat(92));
console.log("ÉTAPE 8 · L'AGRÉGATION PEUT-ELLE REPRÉSENTER severity(A+B) > max(severity(A), severity(B)) ?");
console.log("═".repeat(92));
const show = (n, r) => { const crit = r.gaps.filter((g) => g.code.startsWith("EXEC_SCREEN_UNREACHABLE")).length;
  console.log(`${n.padEnd(8)} écarts=${String(r.gaps.length).padStart(2)}  dont écrans morts=${crit}  verdict=${r.verdict}  atteignables déclaré=${r.metrics.screensReachableDeclared}/${r.metrics.screensDeclared}`);
  return { n: r.gaps.length, crit }; };
const rA = show("A seul", analyzeFeasibility(A.air, E));
const rB = show("B seul", analyzeFeasibility(B.air, E));
const rAB = show("A ∪ B", analyzeFeasibility(AB.air, E));
console.log(`\ncomptage   : A=${rA.n}  B=${rB.n}  A∪B=${rAB.n}   ${rAB.n < rA.n + rB.n ? "🔴 SOUS-ADDITIF" : "additif"}`);
console.log(`criticité  : A=${rA.crit}  B=${rB.crit}  A∪B=${rAB.crit}  ${rAB.crit < Math.max(rA.crit, rB.crit) ? "🔴 NON MONOTONE — l'union efface un défaut critique présent dans A" : "monotone"}`);

console.log("\n" + "═".repeat(92));
console.log("ÉTAPE 8b · NATURE EXACTE DE LA TRANSFORMATION — codes et PROPRIÉTAIRES");
console.log("═".repeat(92));
for (const [n, d] of [["A seul", A], ["B seul", B], ["A ∪ B", AB]]) {
  const r = analyzeFeasibility(d.air, E);
  console.log(`\n${n} :`);
  for (const g of r.gaps) console.log(`   owner=${g.owner.padEnd(9)} ${g.code.padEnd(34)} ${g.path}`);
}
