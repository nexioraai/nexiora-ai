// ÉPREUVE G22 — un générateur MINIMALISTE bat-il le protocole ? (lecture seule)
import { readFileSync } from "node:fs";
const REPO="/Users/yia/Documents/woorri";
const {migrateAirDocument}=await import(REPO+"/packages/air-schema/src/index.ts");
const {analyzeFeasibility,EXECUTION_ENVELOPE_V1}=await import(REPO+"/packages/execution-contract/src/index.ts");
const L=t=>[{locale:"fr-FR",text:t}], P=o=>Object.entries(o).map(([key,value])=>({key,value}));

// L'app MINIMALISTE : 1 écran, 1 entité, 1 liste, 1 bouton qui navigue vers lui-même.
// Elle ne PROMET presque rien — donc elle ne peut presque rien trahir.
const minimal={airSchemaVersion:"1.1.0",projectId:"prj_min",
 app:{name:"Min",slug:"min-app",locales:{userLanguage:"fr-FR",appLocales:["fr-FR"],
   defaultAppLocale:"fr-FR",contentLocales:["fr-FR"],rtlSupported:false}},
 screens:[{id:"scr_a",title:L("A"),blocks:[
   {id:"blk_a_l",blockType:"list",entityId:"ent_x",props:P({titleFieldId:"fld_x_nom"})},
   {id:"blk_a_b",blockType:"button",props:P({label:"Rafraîchir",actionId:"act_self"})}]}],
 navigation:{entryScreenId:"scr_a",routes:[{id:"nav_a",screenId:"scr_a"}]},
 entities:[{id:"ent_x",name:"x",fields:[{id:"fld_x_nom",name:"nom",type:"string",required:true}]}],
 relations:[],datasets:[{id:"data_x",entityId:"ent_x",contentHash:"0".repeat(64),rowCount:5}],
 actions:[{id:"act_self",name:"self",trigger:{kind:"ui",blockId:"blk_a_b"},
   effect:{kind:"navigate",screenId:"scr_a"}}],
 rules:[],slots:[],capabilities:[],permissions:[],
 design:{theme:"min",overrides:[{key:"color.light.primary",value:"#0B5E8A"}]},
 integrations:[],network:{policy:"deny_by_default",allowedDomains:[]},
 native:{minIosVersion:"16.4",minAndroidSdk:26},
 compliance:{commerceClass:"none",accountDeletionRequired:false,dataCollected:[]},
 expectedTests:[]};

const riche=migrateAirDocument(JSON.parse(readFileSync(REPO+"/slices/conteneurs/air/suivi-conteneurs.air.json","utf8")));
const A=analyzeFeasibility(minimal,EXECUTION_ENVELOPE_V1);
const B=analyzeFeasibility(riche,EXECUTION_ENVELOPE_V1);
const pct=(a,b)=>b===0?"n/a":Math.round(100*a/b)+" %";
const row=(n,f)=>console.log("  "+n.padEnd(34)+String(f(A)).padStart(14)+String(f(B)).padStart(18));
console.log("MÉTRIQUE".padEnd(36)+"MINIMALISTE".padStart(12)+"CONTENEURS (riche)".padStart(20));
console.log("  "+"-".repeat(64));
row("verdict",()=>0===0?"":"");
console.log("  verdict".padEnd(36)+A.verdict.padStart(12)+B.verdict.padStart(20));
row("écarts TOTAUX",x=>x.gaps.length);
row("effets exécutés",x=>pct(x.metrics.effectsExecuted,x.metrics.effectsDeclared));
row("écrans atteignables",x=>pct(x.metrics.screensReachableEffective,x.metrics.screensDeclared));
row("contrôles NON fantômes",x=>pct(x.metrics.controlsVisible-x.metrics.ghostControls,x.metrics.controlsVisible));
row("blocs avec données",x=>pct(x.metrics.dataBoundBlocksWithSource,x.metrics.dataBoundBlocks));
row("capabilities câblées",x=>pct(x.metrics.capabilitiesWired,x.metrics.capabilitiesDeclared));
row("slots invoqués",x=>pct(x.metrics.slotsInvoked,x.metrics.slotsDeclared));
row("règles appliquées",x=>pct(x.metrics.rulesEnforced,x.metrics.rulesDeclared));
console.log("\n  → G22 CONFIRMÉE ?", A.gaps.length < B.gaps.length ? "OUI — le minimaliste a MOINS d'écarts" : "non");
