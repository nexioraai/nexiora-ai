// CARTOGRAPHIE — relevé NON PRÉSUPPOSÉ du vocabulaire de contraintes.
// N'impose aucune liste : compte tous les noms de méthode en position de chaîne
// sur une expression dont la racine est `z`, plus les appels `z.*` directs.
import ts from "/Users/yia/Documents/woorri/node_modules/typescript/lib/typescript.js";
import { readFileSync } from "node:fs";
const R="/Users/yia/Documents/woorri/";
const FILES=["packages/air-schema/src/air.ts","packages/air-schema/src/ids.ts",
 "packages/air-schema/src/lock.ts","packages/air-schema/src/deployment-state.ts",
 "packages/blocks/src/definitions.ts","packages/design-tokens/src/schema.ts",
 "packages/capability-registry/src/definitions.ts"];
const rootIsZ=(e)=>{let c=e;while(ts.isPropertyAccessExpression(c)||ts.isCallExpression(c))
  c=ts.isCallExpression(c)?c.expression:c.expression; return ts.isIdentifier(c)&&c.text==="z";};
const tally=new Map(), perFile=new Map();
for(const f of FILES){
  let src; try{src=readFileSync(R+f,"utf8");}catch{continue;}
  const sf=ts.createSourceFile(f,src,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);
  let n=0;
  const v=(x)=>{ if(ts.isCallExpression(x)&&ts.isPropertyAccessExpression(x.expression)&&rootIsZ(x.expression)){
      const m=x.expression.name.text; tally.set(m,(tally.get(m)??0)+1); n++; }
    ts.forEachChild(x,v); };
  v(sf); perFile.set(f,n);
}
console.log("VOCABULAIRE RÉELLEMENT EMPLOYÉ (appels de méthode sur une racine `z`)");
console.log("─".repeat(64));
for(const [m,c] of [...tally].sort((a,b)=>b[1]-a[1])) console.log(`  ${String(c).padStart(4)}  .${m}()`);
console.log("─".repeat(64));
console.log("  TOTAL", [...tally.values()].reduce((a,b)=>a+b,0), "appels ·", tally.size, "noms distincts");
console.log("\nPAR FICHIER");
for(const [f,n] of perFile) console.log(`  ${String(n).padStart(4)}  ${f}`);
