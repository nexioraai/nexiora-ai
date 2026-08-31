import ts from "/Users/yia/Documents/woorri/node_modules/typescript/lib/typescript.js";
import { readFileSync } from "node:fs";
const f="/Users/yia/Documents/woorri/packages/design-tokens/src/schema.ts";
const sf=ts.createSourceFile(f,readFileSync(f,"utf8"),ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);
const VAL=new Set(["min","max","regex","int","positive","negative","gt","lt","gte","lte","length","email","url","datetime","uuid","multipleOf","nonempty","startsWith","endsWith","includes"]);
const hits=[]; const v=(n)=>{ if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)){
  const m=n.expression.name.text; if(VAL.has(m)) hits.push({L:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,m});}
  ts.forEachChild(n,v);}; v(sf);
console.log("SITES SYNTAXIQUES de contrainte de valeur dans la zone neutre :");
hits.forEach(h=>console.log(`   L${h.L}  .${h.m}()`));
console.log("   → ",hits.length,"site(s) syntaxique(s)");
