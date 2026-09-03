// EXP-1 · étape 8 — reprise à construction ÉGALE (2 actions dans B comme dans A∪B).
const REPO = "/Users/yia/Documents/woorri";
const { analyzeFeasibility } = await import(REPO + "/packages/execution-contract/src/feasibility.ts");
const { EXECUTION_ENVELOPE_V1: E } = await import(REPO + "/packages/execution-contract/src/envelope.ts");
const { assertValidAir } = await import(REPO + "/packages/air-schema/src/validate.ts");
const L = (t) => [{ locale: "fr-FR", text: t }], P = (o) => Object.entries(o).map(([key, value]) => ({ key, value }));
const base = (o) => assertValidAir({ airSchemaVersion: "1.1.0", projectId: "prj_e",
  app: { name: "E", slug: "e-app", locales: { userLanguage: "fr-FR", appLocales: ["fr-FR"], defaultAppLocale: "fr-FR", contentLocales: ["fr-FR"], rtlSupported: false } },
  screens: [], navigation: { entryScreenId: "scr_a", routes: [] }, entities: [], relations: [], datasets: [], actions: [],
  rules: [], slots: [], capabilities: [], permissions: [], design: { theme: "e", overrides: [{ key: "radius.sm", value: 4 }] },
  integrations: [], network: { policy: "deny_by_default", allowedDomains: [] }, native: { minIosVersion: "16.4", minAndroidSdk: 26 },
  compliance: { commerceClass: "none", accountDeletionRequired: false, dataCollected: [] }, expectedTests: [], ...o });
const scr = (id, t) => ({ id, title: L(t), blocks: [{ id: "blk_" + id.slice(4), blockType: "header", props: P({ title: t }) }] });
const nav = (ids) => ({ entryScreenId: "scr_a", routes: ids.map((s) => ({ id: "nav_" + s.slice(4), screenId: s })) });
const ent = { id: "ent_x", name: "x", fields: [{ id: "fld_x_f0", name: "f0", type: "string", required: true }] };
const dact = (i, target) => ({ id: `act_d${i}`, name: "d", trigger: { kind: "data", entityId: "ent_x", event: "created" }, effect: { kind: "navigate", screenId: target } });

const A  = base({ screens: [scr("scr_a","A"), scr("scr_y","Y"), scr("scr_z","Z")], navigation: nav(["scr_a","scr_y","scr_z"]) });
const B  = base({ screens: [scr("scr_a","A")], navigation: nav(["scr_a"]), entities: [ent], actions: [dact(0,"scr_a"), dact(1,"scr_a")] });
const AB = base({ screens: [scr("scr_a","A"), scr("scr_y","Y"), scr("scr_z","Z")], navigation: nav(["scr_a","scr_y","scr_z"]),
                  entities: [ent], actions: [dact(0,"scr_y"), dact(1,"scr_z")] });

const stat = (n, air) => { const r = analyzeFeasibility(air, E);
  const doc = r.gaps.filter((g) => g.owner === "document").length, mot = r.gaps.filter((g) => g.owner === "moteur").length;
  console.log(`${n.padEnd(8)} total=${String(r.gaps.length).padStart(2)}  owner:document=${doc}  owner:moteur=${mot}  verdict=${r.verdict}`);
  return { t: r.gaps.length, doc, mot }; };
console.log("CONSTRUCTION ÉGALE — A : 2 écrans morts · B : 2 déclencheurs data inertes · A∪B : les mêmes 2, redirigés\n");
const a = stat("A", A), b = stat("B", B), ab = stat("A ∪ B", AB);
console.log(`\ncomptage total   : ${a.t} + ${b.t} = ${a.t + b.t}   observé A∪B = ${ab.t}   ⇒ ${ab.t === a.t + b.t ? "STRICTEMENT ADDITIF" : ab.t < a.t + b.t ? "sous-additif" : "sur-additif"}`);
console.log(`écarts imputés au DOCUMENT : A=${a.doc}  B=${b.doc}  A∪B=${ab.doc}   ⇒ ${ab.doc < a.doc ? "🔴 TRANSFERT D'IMPUTATION : le document est disculpé" : "conservé"}`);
console.log(`écarts imputés au MOTEUR   : A=${a.mot}  B=${b.mot}  A∪B=${ab.mot}`);
