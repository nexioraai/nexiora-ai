// DÉCOUVERTE AVEUGLE — je pars des 44 champs de schéma JAMAIS visités
// par une obligation, et je cherche lesquels sont trahis par les artefacts.
// Aucun défaut connu n'est utilisé comme point de départ. LECTURE SEULE.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const REPO="/Users/yia/Documents/woorri";
const {migrateAirDocument}=await import(REPO+"/packages/air-schema/src/index.ts");
const {generateProvisioningSql}=await import(REPO+"/packages/provisioner/src/index.ts");
const C=join(REPO,"packages/golden-corpus/corpus-v2");
const docs=[...readdirSync(C).filter(f=>f.endsWith(".air.json")).sort().map(f=>({n:f.replace(".air.json",""),p:join(C,f)})),
 {n:"suivi-conteneurs",p:join(REPO,"slices/conteneurs/air/suivi-conteneurs.air.json")}];
const prop=(b,k)=>(b.props??[]).find(p=>p.key===k)?.value;

let H1={n:0,docs:new Set(),ex:[]}, H2={n:0,docs:new Set(),ex:[]}, H3={n:0,docs:new Set(),ex:[]}, H4={n:0,docs:new Set(),ex:[]};
for(const d of docs){
  const a=migrateAirDocument(JSON.parse(readFileSync(d.p,"utf8")));
  const F={}; for(const e of a.entities) for(const f of e.fields) F[f.id]=f;

  // H1 — `unique: true` déclaré dans l'AIR : le SQL le fait-il respecter ?
  const uniques=a.entities.flatMap(e=>e.fields.filter(f=>f.unique).map(f=>({e:e.id,f:f.id})));
  if(uniques.length){
    const sql=generateProvisioningSql(a).sql;
    for(const u of uniques){
      const applique=new RegExp(`UNIQUE[^;]*"${u.f}"|"${u.f}"[^;]*UNIQUE`,"i").test(sql);
      if(!applique){H1.n++;H1.docs.add(d.n);if(H1.ex.length<4)H1.ex.push(`${d.n}/${u.e}.${u.f}`);}
    }
  }
  // H2 — un champ AFFICHÉ dont la fixture est TOUJOURS vide (asset/json)
  for(const s of a.screens) for(const b of s.blocks){
    for(const k of ["titleFieldId","subtitleFieldId","trailingFieldId","badgeFieldId"]){
      const v=prop(b,k); if(typeof v!=="string") continue;
      const t=F[v]?.type;
      if(t==="asset"||t==="json"){H2.n++;H2.docs.add(d.n);if(H2.ex.length<4)H2.ex.push(`${d.n}/${s.id}/${b.id}.${k}→${t}`);}
    }
  }
  // H3 — MÊME entité, titres différents selon l'écran (incohérence inter-écrans)
  const parEntite={};
  for(const s of a.screens) for(const b of s.blocks){
    if(!b.entityId) continue; const v=prop(b,"titleFieldId");
    if(typeof v!=="string") continue;
    (parEntite[b.entityId]??=new Set()).add(v);
  }
  for(const [e,set] of Object.entries(parEntite))
    if(set.size>1){H3.n++;H3.docs.add(d.n);if(H3.ex.length<4)H3.ex.push(`${d.n}/${e} → ${[...set].join(" vs ")}`);}

  // H4 — champ `required` dont la fixture peut produire du VIDE → NULL en base
  for(const e of a.entities) for(const f of e.fields)
    if(f.required && (f.type==="asset"||(f.type==="reference"))){
      H4.n++;H4.docs.add(d.n);if(H4.ex.length<4)H4.ex.push(`${d.n}/${e.id}.${f.id}(${f.type})`);}
}
const R=(t,h)=>{console.log(`\n${t}`);console.log(`   occurrences : ${h.n} · documents : ${h.docs.size}`);
  if(h.n) console.log("   ex. : "+h.ex.join(" · "));};
console.log("=== SONDES AVEUGLES SUR LES CHAMPS DE SCHÉMA NON COUVERTS ===");
R("H1 · `unique: true` déclaré dans l'AIR — contrainte UNIQUE absente du SQL généré", H1);
R("H2 · champ AFFICHÉ dont la fixture est structurellement VIDE (asset/json)", H2);
R("H3 · même entité titrée par des champs DIFFÉRENTS selon l'écran", H3);
R("H4 · champ `required` dont la fixture peut produire NULL", H4);
