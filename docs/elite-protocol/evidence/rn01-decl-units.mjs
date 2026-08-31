// AUDIT UNITÉ DÉCLARATIVE — énumérateur mécanique. Lecture seule.
// PISTE TESTÉE (non présupposée) : PropertySignature | PropertyAssignment.
// DÉTECTEUR DE TROU : constructions porteuses d'assertion qui ne sont NI l'une NI l'autre,
// définies elles aussi par prédicat AST, jamais par jugement.
import ts from "/Users/yia/Documents/woorri/node_modules/typescript/lib/typescript.js";
import { readFileSync } from "node:fs";
const R = "/Users/yia/Documents/woorri/";

const load = (f) => {
  const src = readFileSync(R + f, "utf8");
  return ts.createSourceFile(f, src, ts.ScriptTarget.ES2022, true,
    f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
};
const nameOf = (n) => {
  try { return n.name ? n.name.getText(n.getSourceFile()) : "—"; } catch { return "—"; }
};

// ── PISTE : les deux genres candidats, À TOUTE PROFONDEUR.
const isCandidate = (n) => ts.isPropertySignature(n) || ts.isPropertyAssignment(n);

// ── TROU : prédicats AST purs, aucune sémantique.
const holeKind = (n) => {
  const p = n.parent;
  if (ts.isLiteralTypeNode(n) && p && ts.isUnionTypeNode(p)) return "T1 membre d'union littérale";
  if (ts.isObjectLiteralExpression(n) && p && ts.isArrayLiteralExpression(p)) return "T2 entrée d'un tableau d'objets";
  if ((ts.isStringLiteral(n) || ts.isNumericLiteral(n)) && p && ts.isArrayLiteralExpression(p))
    return "T3 littéral en élément de tableau";
  if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression))
    return "T4 contrainte en chaîne de méthode";
  return null;
};

function scan(f, from, to, label) {
  const sf = load(f);
  const cand = [], holes = [];
  const visit = (n) => {
    const L = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    if (L >= from && L <= to) {
      if (isCandidate(n)) {
        let depth = 0;
        for (let p = n.parent; p; p = p.parent)
          if (ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) depth++;
        cand.push({ L, k: ts.isPropertySignature(n) ? "PropSig " : "PropAssg", d: depth, name: nameOf(n) });
      }
      const h = holeKind(n);
      if (h) holes.push({ L, h, t: n.getText(sf).replace(/\s+/g, " ").slice(0, 46) });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  console.log(`\n${"═".repeat(80)}\n${label} — ${f.split("/").pop()}:${from}-${to}\n${"═".repeat(80)}`);
  console.log("  ── PISTE : PropertySignature / PropertyAssignment");
  cand.forEach((c, i) => console.log(`   ${String(i + 1).padStart(2)}. L${String(c.L).padEnd(4)} ${c.k} prof.${c.d}  ${c.name}`));
  console.log(`   → ${cand.length} unité(s) candidate(s)`);
  console.log("  ── TROU : assertions portées par AUCUN des deux genres");
  holes.forEach((h, i) => console.log(`   ${String(i + 1).padStart(2)}. L${String(h.L).padEnd(4)} ${h.h.padEnd(34)} ${h.t}`));
  console.log(`   → ${holes.length} assertion(s) non ancrée(s)`);
  return [cand.length, holes.length];
}

const [c1, h1] = scan("packages/blocks/src/definitions.ts", 27, 45, "PORTION NEUTRE A — interface BlockDefinition");
const [c2, h2] = scan("packages/blocks/src/definitions.ts", 46, 63, "PORTION NEUTRE B — entrée de registre `button`");
console.log(`\nTOTAL PORTION NEUTRE : ${c1 + c2} unités candidates · ${h1 + h2} assertions non ancrées`);

// ── Couverture à l'échelle des modules déclaratifs.
console.log(`\n${"═".repeat(80)}\nCOUVERTURE PAR MODULE (fichier entier)\n${"═".repeat(80)}`);
for (const f of ["packages/execution-contract/src/envelope.ts", "packages/compiler/runtime/data-provider.tsx",
                 "packages/air-schema/src/air.ts", "packages/blocks/src/definitions.ts",
                 "packages/execution-contract/src/feasibility.ts"]) {
  const sf = load(f); let c = 0, h = 0;
  const v = (n) => { if (isCandidate(n)) c++; if (holeKind(n)) h++; ts.forEachChild(n, v); };
  v(sf);
  console.log(`  ${String(c).padStart(4)} unités · ${String(h).padStart(4)} non ancrées   ${f}`);
}
