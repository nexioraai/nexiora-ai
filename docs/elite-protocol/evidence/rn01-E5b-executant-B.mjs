// ÉTAPE 5 (rejeu) · EXÉCUTANT B — R-GRAN-2 avec D-13, D-14, D-15.
// Stratégie B, distincte de A :
//  · parcours ITÉRATIF par pile (préfixe imposé par D-15) ;
//  · portée PROPAGÉE VERS LE BAS pendant le parcours (jamais en remontant les parents) ;
//  · DECL en DEUX PASSES : collecte des conteneurs, puis émission des membres TRIÉS ;
//  · VAL en largeur, clés triées, racines en ordre inverse.
const REPO = "/Users/yia/Documents/woorri/";
const ts = (await import(REPO + "node_modules/typescript/lib/typescript.js")).default;
const { readFileSync } = await import("node:fs");
const CORPUS = { execution: ["packages/blocks/src/registry.ts"],
  declarative: ["packages/compiler/runtime/data-provider.tsx"],
  value: [["designTokensSchema","packages/design-tokens/src/schema.ts"],
          ["projectLockSchema","packages/air-schema/src/lock.ts"],
          ["deploymentStateSchema","packages/air-schema/src/deployment-state.ts"]] };
const lire = (f) => ts.createSourceFile(f, readFileSync(REPO + f, "utf8"), ts.ScriptTarget.ES2022, true,
  f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const estNommee = (n) => (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isInterfaceDeclaration(n) ||
  ts.isTypeAliasDeclaration(n) || ts.isVariableDeclaration(n) || ts.isMethodDeclaration(n)) && n.name;
const fmtPortee = (v) => (v.length ? v.join("/") : "«module»");

/** Parcours PRÉFIXE itératif, portée propagée vers le bas. */
function* preordre(sf) {
  const pile = [{ n: sf, portee: [] }];
  while (pile.length) {
    const { n, portee } = pile.pop();
    yield { n, portee };
    const suivante = estNommee(n) ? [...portee, n.name.getText(sf)] : portee;
    const enfants = []; ts.forEachChild(n, (c) => { enfants.push(c); });
    for (let i = enfants.length - 1; i >= 0; i--) pile.push({ n: enfants[i], portee: suivante });
  }
}
const TABLE = new Map([[ts.SyntaxKind.IfStatement,"B1"],[ts.SyntaxKind.ConditionalExpression,"B2"],
  [ts.SyntaxKind.CaseClause,"B4"],[ts.SyntaxKind.DefaultClause,"B4"],[ts.SyntaxKind.ForStatement,"B5"],
  [ts.SyntaxKind.ForOfStatement,"B5"],[ts.SyntaxKind.ForInStatement,"B5"],[ts.SyntaxKind.WhileStatement,"B5"],
  [ts.SyntaxKind.DoStatement,"B5"],[ts.SyntaxKind.CatchClause,"B7"]]);
const OPS = new Map([[ts.SyntaxKind.AmpersandAmpersandToken,"B3&&"],[ts.SyntaxKind.BarBarToken,"B3||"],
  [ts.SyntaxKind.QuestionQuestionToken,"B3??"]]);
function categorie(n) {
  if (TABLE.has(n.kind)) return TABLE.get(n.kind);
  if (ts.isBinaryExpression(n) && OPS.has(n.operatorToken.kind)) return OPS.get(n.operatorToken.kind);
  if (n.questionDotToken) return "B6";
  if ((ts.isParameter(n) || ts.isBindingElement(n)) && n.initializer) return "B8";
  return null;
}
function execB(f) { const sf = lire(f), vus = new Map(), res = [];
  for (const { n, portee } of preordre(sf)) { const g = categorie(n); if (!g) continue;
    const p = fmtPortee(portee), cle = p + "::" + g, i = (vus.get(cle) ?? 0) + 1; vus.set(cle, i);
    res.push(`EXEC::${f}::${p}::${g}#${i}`); }
  return res; }

const estMembre = (m) => [ts.SyntaxKind.PropertySignature, ts.SyntaxKind.MethodSignature,
  ts.SyntaxKind.PropertyAssignment, ts.SyntaxKind.MethodDeclaration, ts.SyntaxKind.ShorthandPropertyAssignment]
  .includes(m.kind);
function declB(f) {
  const sf = lire(f);
  // PASSE 1 — collecte des conteneurs, dans l'ordre préfixe (l'ordinal anonyme en dépend)
  const conteneurs = [];
  for (const { n, portee } of preordre(sf)) {
    if (ts.isInterfaceDeclaration(n)) conteneurs.push({ nom: n.name.getText(sf), membres: n.members });
    else if (ts.isTypeLiteralNode(n)) {
      if (ts.isTypeAliasDeclaration(n.parent)) conteneurs.push({ nom: n.parent.name.getText(sf), membres: n.members });
      else conteneurs.push({ anonPortee: fmtPortee(portee), membres: n.members });
    } else if (ts.isObjectLiteralExpression(n) && ts.isVariableDeclaration(n.parent))
      conteneurs.push({ nom: n.parent.name.getText(sf), membres: n.properties });
  }
  // PASSE 2 — adresses puis membres TRIÉS par nom
  const anon = new Map(), res = [];
  for (const c of conteneurs) {
    let adresse = c.nom;
    if (adresse === undefined) { const i = (anon.get(c.anonPortee) ?? 0) + 1; anon.set(c.anonPortee, i);
      adresse = `${c.anonPortee}/{}#${i}`; }
    const noms = [...c.membres].filter(estMembre).map((m) => m.name.getText(sf)).sort();
    for (const nm of noms) res.push(`DECL::${f}::${adresse}::${nm}`);
  }
  return res;
}

const def = (x) => x?._zod?.def ?? x?.def; const cdef = (c) => c?._zod?.def ?? c?.def ?? c;
function valB(racine, schema) {
  const res = [], file = [{ s: schema, p: "", vus: new Set() }];
  while (file.length) {
    const { s, p, vus } = file.shift(); const d = def(s); if (!d || vus.has(s)) continue;
    const v2 = new Set(vus); v2.add(s);
    for (const c of d.checks ?? []) { const x = cdef(c);
      res.push(`VAL::${racine}::${p}::CHECK:${x.check}::${String(x.pattern ?? x.value ?? x.minimum ?? x.maximum ?? "")}`); }
    const t = d.type;
    if (t === "object") { res.push(`VAL::${racine}::${p}::STRICTNESS::${d.catchall === undefined ? "ouvert" : "strict"}`);
      for (const k of Object.keys(d.shape ?? {}).sort()) file.push({ s: d.shape[k], p: p ? `${p}.${k}` : k, vus: v2 }); }
    else if (t === "array") file.push({ s: d.element, p: `${p}[]`, vus: v2 });
    else if (t === "optional") file.push({ s: d.innerType, p, vus: v2 });
    else if (t === "nullable") { res.push(`VAL::${racine}::${p}::NULLABLE::`); file.push({ s: d.innerType, p, vus: v2 }); }
    else if (t === "default") { res.push(`VAL::${racine}::${p}::DEFAULT::${String(d.defaultValue)}`); file.push({ s: d.innerType, p, vus: v2 }); }
    else if (t === "union" || t === "discriminatedUnion") (d.options ?? []).forEach((o, i) => file.push({ s: o, p: `${p}|${i}`, vus: v2 }));
    else if (t === "enum") res.push(`VAL::${racine}::${p}::ENUM::${Object.values(d.entries ?? {}).join(",")}`);
    else if (t === "literal") res.push(`VAL::${racine}::${p}::LITERAL::${String((d.values ?? [])[0])}`);
  }
  return res;
}
const R = { execution: [], declarative: [], value: [] };
for (const f of [...CORPUS.execution].reverse()) R.execution.push(...execB(f));
for (const f of [...CORPUS.declarative].reverse()) R.declarative.push(...declB(f));
for (const [e, f] of [...CORPUS.value].reverse()) { const m = await import(REPO + f); R.value.push(...valB(e, m[e])); }
console.log(JSON.stringify(R));
