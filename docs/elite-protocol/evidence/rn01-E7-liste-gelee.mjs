// ÉTAPE 7 · LISTE GELÉE DES HYPOTHÈSES — R-GRAN-2 (D-1 → D-15).
// Implémentation de référence = exécutant A′ de l'étape 5 rejouée, étendue au périmètre.
// Énumération MÉCANIQUE. Aucun chemin n'est lu, interprété ni commenté.
// Reproductible : node docs/elite-protocol/evidence/rn01-E7-liste-gelee.mjs
const REPO = "/Users/yia/Documents/woorri/";
const ts = (await import(REPO + "node_modules/typescript/lib/typescript.js")).default;
const { readFileSync, writeFileSync } = await import("node:fs");

// ══ PÉRIMÈTRE DÉCLARÉ (D-2 : source uniquement ; ni généré, ni copie, ni codegen) ══
export const PERIMETRE_MODULES = [
  "packages/execution-contract/src/graph.ts",
  "packages/execution-contract/src/feasibility.ts",
  "packages/execution-contract/src/envelope.ts",
  "packages/air-schema/src/air.ts",
  "packages/air-schema/src/validate.ts",
  "packages/air-schema/src/ids.ts",
  "packages/air-schema/src/lock.ts",
  "packages/air-schema/src/deployment-state.ts",
  "packages/blocks/src/registry.ts",
  "packages/blocks/src/definitions.ts",
  "packages/compiler/runtime/air-runtime.tsx",
  "packages/compiler/runtime/data-provider.tsx",
  "packages/compiler/src/emit-project.ts",
  "packages/design-tokens/src/schema.ts",
];
export const PERIMETRE_RACINES = [
  ["projectAirSchema", "packages/air-schema/src/air.ts"],
  ["projectLockSchema", "packages/air-schema/src/lock.ts"],
  ["deploymentStateSchema", "packages/air-schema/src/deployment-state.ts"],
  ["designTokensSchema", "packages/design-tokens/src/schema.ts"],
];

const parse = (f) => ts.createSourceFile(f, readFileSync(REPO + f, "utf8"), ts.ScriptTarget.ES2022, true,
  f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const NOMMEE = (p) => (ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p) || ts.isInterfaceDeclaration(p) ||
  ts.isTypeAliasDeclaration(p) || ts.isVariableDeclaration(p) || ts.isMethodDeclaration(p)) && p.name;
const portee = (n, sf) => { const v = []; for (let p = n.parent; p; p = p.parent) if (NOMMEE(p)) v.unshift(p.name.getText(sf));
  return v.length ? v.join("/") : "«module»"; };
const G = { [ts.SyntaxKind.IfStatement]:"B1", [ts.SyntaxKind.ConditionalExpression]:"B2",
  [ts.SyntaxKind.CaseClause]:"B4", [ts.SyntaxKind.DefaultClause]:"B4", [ts.SyntaxKind.ForStatement]:"B5",
  [ts.SyntaxKind.ForOfStatement]:"B5", [ts.SyntaxKind.ForInStatement]:"B5", [ts.SyntaxKind.WhileStatement]:"B5",
  [ts.SyntaxKind.DoStatement]:"B5", [ts.SyntaxKind.CatchClause]:"B7" };
const OP = { [ts.SyntaxKind.AmpersandAmpersandToken]:"B3&&", [ts.SyntaxKind.BarBarToken]:"B3||",
  [ts.SyntaxKind.QuestionQuestionToken]:"B3??" };
const genre = (n) => G[n.kind] ?? (ts.isBinaryExpression(n) ? OP[n.operatorToken.kind] : undefined)
  ?? (n.questionDotToken !== undefined ? "B6" : undefined)
  ?? (((ts.isParameter(n) || ts.isBindingElement(n)) && n.initializer !== undefined) ? "B8" : undefined);
const MEMBRE = (m) => ts.isPropertySignature(m) || ts.isMethodSignature(m) || ts.isPropertyAssignment(m) ||
  ts.isMethodDeclaration(m) || ts.isShorthandPropertyAssignment(m);

function espaceEXEC(f) { const sf = parse(f), c = new Map(), out = [];
  const rec = (n) => { const g = genre(n);
    if (g) { const p = portee(n, sf), k = `${p}::${g}`, i = (c.get(k) ?? 0) + 1; c.set(k, i);
      out.push({ id: `EXEC::${f}::${p}::${g}#${i}`, espace: "EXECUTION", module: f, portee: p, genre: g }); }
    ts.forEachChild(n, (x) => { rec(x); }); };
  rec(sf); return out; }

function espaceDECL(f) { const sf = parse(f), anon = new Map(), out = [];
  const rec = (n) => { let membres = null, cont = null;
    if (ts.isInterfaceDeclaration(n)) { membres = n.members; cont = n; }
    else if (ts.isTypeLiteralNode(n)) { membres = n.members; cont = ts.isTypeAliasDeclaration(n.parent) ? n.parent : n; }
    else if (ts.isObjectLiteralExpression(n) && ts.isVariableDeclaration(n.parent)) { membres = n.properties; cont = n; }
    if (membres) { let a;
      if (ts.isInterfaceDeclaration(cont) || ts.isTypeAliasDeclaration(cont)) a = cont.name.getText(sf);
      else if (ts.isObjectLiteralExpression(cont) && ts.isVariableDeclaration(cont.parent)) a = cont.parent.name.getText(sf);
      else { const p = portee(cont, sf), i = (anon.get(p) ?? 0) + 1; anon.set(p, i); a = `${p}/{}#${i}`; }
      for (const m of membres) if (MEMBRE(m))
        out.push({ id: `DECL::${f}::${a}::${m.name.getText(sf)}`, espace: "DECLARATIVE", module: f, contrat: a, membre: m.name.getText(sf) }); }
    ts.forEachChild(n, (x) => { rec(x); }); };
  rec(sf); return out; }

const D = (x) => x?._zod?.def ?? x?.def; const CK = (c) => c?._zod?.def ?? c?.def ?? c;
function espaceVAL(r, s0) { const out = [];
  const rec = (s, p, vus) => { const d = D(s); if (!d || vus.has(s)) return; const v2 = new Set(vus); v2.add(s);
    const add = (g, det) => out.push({ id: `VAL::${r}::${p}::${g}::${det}`, espace: "VALUE-CONSTRAINT", racine: r, chemin: p, genre: g, detail: det });
    for (const c of d.checks ?? []) { const x = CK(c);
      add(`CHECK:${x.check}`, String(x.pattern ?? x.value ?? x.minimum ?? x.maximum ?? "")); }
    const t = d.type;
    if (t === "object") { add("STRICTNESS", d.catchall === undefined ? "ouvert" : "strict");
      for (const [k, v] of Object.entries(d.shape ?? {})) rec(v, p ? `${p}.${k}` : k, v2); }
    else if (t === "array") rec(d.element, `${p}[]`, v2);
    else if (t === "optional") rec(d.innerType, p, v2);                       // D-12
    else if (t === "nullable") { add("NULLABLE", ""); rec(d.innerType, p, v2); }
    else if (t === "default") { add("DEFAULT", String(d.defaultValue)); rec(d.innerType, p, v2); }
    else if (t === "union" || t === "discriminatedUnion") (d.options ?? []).forEach((o, i) => rec(o, `${p}|${i}`, v2));
    else if (t === "enum") add("ENUM", Object.values(d.entries ?? {}).join(","));
    else if (t === "literal") add("LITERAL", String((d.values ?? [])[0])); };
  rec(s0, "", new Set()); return out; }

const unites = [];
for (const f of PERIMETRE_MODULES) { unites.push(...espaceEXEC(f)); unites.push(...espaceDECL(f)); }
for (const [e, f] of PERIMETRE_RACINES) { const m = await import(REPO + f); unites.push(...espaceVAL(e, m[e])); }

const sortie = process.argv[2];
if (sortie) writeFileSync(sortie, JSON.stringify({ regle: "R-GRAN-2", decisions: "D-1 → D-15",
  perimetre: { modules: PERIMETRE_MODULES, racines: PERIMETRE_RACINES }, unites }, null, 1));
const parEspace = new Map();
for (const u of unites) parEspace.set(u.espace, (parEspace.get(u.espace) ?? 0) + 1);
console.log("LISTE R-GRAN-2 —", unites.length, "unités");
for (const [e, n] of parEspace) console.log("  ", e.padEnd(18), n);
