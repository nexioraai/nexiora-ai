// AMB-3 — IDENTITÉ CANONIQUE D'UNE UNITÉ. Épreuve : invariance au REFORMATAGE.
// node docs/elite-protocol/evidence/rn01-AMB3-identite.mjs   (lecture seule)
const REPO = "/Users/yia/Documents/woorri/";
const ts = (await import(REPO + "node_modules/typescript/lib/typescript.js")).default;
const { readFileSync } = await import("node:fs");

/** Chaîne des déclarations NOMMÉES englobantes, de la plus externe à la plus interne. */
function portee(n, sf) {
  const noms = [];
  for (let p = n.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p) || ts.isInterfaceDeclaration(p) ||
         ts.isTypeAliasDeclaration(p) || ts.isVariableDeclaration(p) || ts.isMethodDeclaration(p)) && p.name)
      noms.unshift(p.name.getText(sf));
  }
  return noms.length ? noms.join("/") : "«module»";
}
const GENRES = {
  [ts.SyntaxKind.IfStatement]: "B1", [ts.SyntaxKind.ConditionalExpression]: "B2",
  [ts.SyntaxKind.CaseClause]: "B4", [ts.SyntaxKind.DefaultClause]: "B4",
  [ts.SyntaxKind.ForStatement]: "B5", [ts.SyntaxKind.ForOfStatement]: "B5",
  [ts.SyntaxKind.ForInStatement]: "B5", [ts.SyntaxKind.WhileStatement]: "B5",
  [ts.SyntaxKind.DoStatement]: "B5", [ts.SyntaxKind.CatchClause]: "B7",
};
const OPLOG = { [ts.SyntaxKind.AmpersandAmpersandToken]: "B3&&", [ts.SyntaxKind.BarBarToken]: "B3||",
  [ts.SyntaxKind.QuestionQuestionToken]: "B3??" };
const genreDe = (n) => {
  if (GENRES[n.kind]) return GENRES[n.kind];
  if (ts.isBinaryExpression(n) && OPLOG[n.operatorToken.kind]) return OPLOG[n.operatorToken.kind];
  if (n.questionDotToken !== undefined) return "B6";
  if ((ts.isParameter(n) || ts.isBindingElement(n)) && n.initializer !== undefined) return "B8";
  return null;
};

/** PARCOURS PRÉFIXE IMPOSÉ (voir D-15) — l'ordinal en dépend. */
function prefixe(sf) { const out = []; const v = (n) => { out.push(n); ts.forEachChild(n, (c) => { v(c); }); }; v(sf); return out; }

function identitesEXEC(mod, texte) {
  const sf = ts.createSourceFile(mod, texte, ts.ScriptTarget.ES2022, true,
    mod.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const compteur = new Map(), out = [];
  for (const n of prefixe(sf)) {
    const g = genreDe(n); if (!g) continue;
    const p = portee(n, sf), cle = `${p}::${g}`;
    const i = (compteur.get(cle) ?? 0) + 1; compteur.set(cle, i);
    out.push(`EXEC::${mod}::${p}::${g}#${i}`);
  }
  return out;
}
function identitesDECL(mod, texte) {
  const sf = ts.createSourceFile(mod, texte, ts.ScriptTarget.ES2022, true,
    mod.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const anon = new Map(), out = [];
  const adresse = (conteneur) => {
    if (ts.isInterfaceDeclaration(conteneur) || ts.isTypeAliasDeclaration(conteneur)) return conteneur.name.getText(sf);
    if (ts.isObjectLiteralExpression(conteneur) && ts.isVariableDeclaration(conteneur.parent))
      return conteneur.parent.name.getText(sf);
    const p = portee(conteneur, sf);                       // littéral de type ANONYME
    const i = (anon.get(p) ?? 0) + 1; anon.set(p, i);
    return `${p}/{}#${i}`;
  };
  for (const n of prefixe(sf)) {
    let membres = null, conteneur = null;
    if (ts.isInterfaceDeclaration(n)) { membres = n.members; conteneur = n; }
    else if (ts.isTypeLiteralNode(n)) { membres = n.members; conteneur = ts.isTypeAliasDeclaration(n.parent) ? n.parent : n; }
    else if (ts.isObjectLiteralExpression(n) && ts.isVariableDeclaration(n.parent)) { membres = n.properties; conteneur = n; }
    if (!membres) continue;
    const a = adresse(conteneur);
    for (const m of membres) {
      if (!(ts.isPropertySignature(m) || ts.isMethodSignature(m) || ts.isPropertyAssignment(m) ||
            ts.isMethodDeclaration(m) || ts.isShorthandPropertyAssignment(m))) continue;
      out.push(`DECL::${mod}::${a}::${m.name.getText(sf)}`);
    }
  }
  return out;
}

// ── ÉPREUVE : reformatage (indentation doublée + lignes vides) — le SENS est inchangé
const reformate = (t) => t.split("\n").map((l) => (l.trim() === "" ? "" : "  " + l)).join("\n\n");
console.log("═".repeat(80));
console.log("AMB-3 — invariance de l'identité canonique au REFORMATAGE");
console.log("═".repeat(80));
for (const [mod, fn] of [["packages/blocks/src/registry.ts", identitesEXEC],
                         ["packages/compiler/runtime/data-provider.tsx", identitesDECL]]) {
  const t = readFileSync(REPO + mod, "utf8");
  const a = fn(mod, t), b = fn(mod, reformate(t));
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(`\n── ${mod.split("/").pop()}  (${fn === identitesEXEC ? "EXEC" : "DECL"})`);
  console.log(`   identités : ${a.length}  ·  après reformatage : ${b.length}  ·  identiques : ${ok ? "🟢 OUI" : "🔴 NON"}`);
  a.slice(0, 4).forEach((x) => console.log(`      ${x}`));
  if (!ok) [...a].filter((x) => !b.includes(x)).slice(0, 3).forEach((x) => console.log(`      🔴 perdue : ${x}`));
}
// ── contre-épreuve : une identité par ligne:colonne survivrait-elle ?
{
  const mod = "packages/blocks/src/registry.ts", t = readFileSync(REPO + mod, "utf8");
  const parLigne = (txt) => { const sf = ts.createSourceFile(mod, txt, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    return prefixe(sf).filter(genreDe).map((n) => { const c = sf.getLineAndCharacterOfPosition(n.getStart(sf));
      return `${mod}@${c.line + 1}:${c.character + 1}`; }); };
  const same = JSON.stringify(parLigne(t)) === JSON.stringify(parLigne(reformate(t)));
  console.log(`\n── CONTRE-ÉPREUVE · identité « fichier@ligne:colonne » survit au reformatage : ${same ? "oui" : "🔴 NON"}`);
}
