// GATE KILLER TESTS — verdicts attendus DÉCLARÉS AVANT exécution.
// Lecture seule sur le dépôt ; AIR construits en mémoire.
const REPO="/Users/yia/Documents/woorri";
const {analyzeFeasibility,EXECUTION_ENVELOPE_V1:E}=await import(REPO+"/packages/execution-contract/src/index.ts");
const L=t=>[{locale:"fr-FR",text:t}], P=o=>Object.entries(o).map(([key,value])=>({key,value}));
const H="0".repeat(64);
const base=(o={})=>({airSchemaVersion:"1.1.0",projectId:"prj_kt",
 app:{name:"KT",slug:"kt-app",locales:{userLanguage:"fr-FR",appLocales:["fr-FR"],
  defaultAppLocale:"fr-FR",contentLocales:["fr-FR"],rtlSupported:false}},
 screens:[],navigation:{entryScreenId:"scr_a",routes:[]},entities:[],relations:[],
 datasets:[],actions:[],rules:[],slots:[],capabilities:[],permissions:[],
 design:{theme:"kt",overrides:[{key:"radius.sm",value:4}]},integrations:[],
 network:{policy:"deny_by_default",allowedDomains:[]},
 native:{minIosVersion:"16.4",minAndroidSdk:26},
 compliance:{commerceClass:"none",accountDeletionRequired:false,dataCollected:[]},
 expectedTests:[],...o});
const ent=(id,f=1)=>({id,name:id.slice(4),fields:Array.from({length:f},(_,i)=>
  ({id:`fld_${id.slice(4)}_f${i}`,name:`f${i}`,type:"string",required:i===0}))});
const has=(r,c)=>r.gaps.some(g=>g.code===c);
const results=[];
const KT=(id,gate,attaque,kind,attendu,fn)=>{
  let reel="ERREUR", ok=false, detail="";
  try{ const r=fn(); reel=r.verdict?r.verdict:String(r); ok=(reel===attendu); detail=r.detail??""; }
  catch(e){ reel="EXCEPTION: "+String(e.message).slice(0,60); }
  results.push({id,gate,attaque,kind,attendu,reel,ok,detail});
};
const V=(cond,d="")=>({verdict:cond?"GATE TOMBE":"GATE PASSE",detail:d});

// ══════ KNOWN KILLER TESTS (défauts déjà connus — jamais comptés Blind) ══════

KT("KT-G05-001","G5","bouton dont l'effet est capability (contrôle fantôme)","KNOWN","GATE TOMBE",()=>{
  const a=base({screens:[{id:"scr_a",title:L("A"),blocks:[
      {id:"blk_b",blockType:"button",props:P({label:"X",actionId:"act_c"})}]}],
    navigation:{entryScreenId:"scr_a",routes:[{id:"nav_a",screenId:"scr_a"}]},
    capabilities:[{capability:"share"}],
    actions:[{id:"act_c",name:"c",trigger:{kind:"ui",blockId:"blk_b"},
      effect:{kind:"capability",capability:"share",method:"open"}}]});
  return V(has(analyzeFeasibility(a,E),"EXEC_GHOST_CONTROL"));});

KT("KT-G01-001","G1","effet mutation hors enveloppe","KNOWN","GATE TOMBE",()=>{
  const a=base({screens:[{id:"scr_a",title:L("A"),blocks:[
      {id:"blk_f",blockType:"form",entityId:"ent_x",props:P({fieldIds:["fld_x_f0"],submitLabel:"OK"})}]}],
    navigation:{entryScreenId:"scr_a",routes:[{id:"nav_a",screenId:"scr_a"}]},
    entities:[ent("ent_x")],datasets:[{id:"data_x",entityId:"ent_x",contentHash:H,rowCount:3}],
    actions:[{id:"act_m",name:"m",trigger:{kind:"ui",blockId:"blk_f"},
      effect:{kind:"mutation",entityId:"ent_x",operation:"create"}}]});
  return V(has(analyzeFeasibility(a,E),"EXEC_EFFECT_INERT"));});

KT("KT-G04-001","G4","écran sans aucun chemin de navigation","KNOWN","GATE TOMBE",()=>{
  const a=base({screens:[{id:"scr_a",title:L("A"),blocks:[{id:"blk_h",blockType:"header",props:P({title:"A"})}]},
      {id:"scr_z",title:L("Z"),blocks:[{id:"blk_z",blockType:"header",props:P({title:"Z"})}]}],
    navigation:{entryScreenId:"scr_a",routes:[{id:"nav_a",screenId:"scr_a"},{id:"nav_z",screenId:"scr_z"}]}});
  return V(has(analyzeFeasibility(a,E),"EXEC_SCREEN_UNREACHABLE_DECLARED"));});

KT("KT-G22-001","G22","application minimaliste : promettre peu et tout tenir","KNOWN","GATE TOMBE",()=>{
  const a=base({screens:[{id:"scr_a",title:L("A"),blocks:[
      {id:"blk_l",blockType:"list",entityId:"ent_x",props:P({titleFieldId:"fld_x_f0"})},
      {id:"blk_b",blockType:"button",props:P({label:"R",actionId:"act_s"})}]}],
    navigation:{entryScreenId:"scr_a",routes:[{id:"nav_a",screenId:"scr_a"}]},
    entities:[ent("ent_x")],datasets:[{id:"data_x",entityId:"ent_x",contentHash:H,rowCount:5}],
    actions:[{id:"act_s",name:"s",trigger:{kind:"ui",blockId:"blk_b"},
      effect:{kind:"navigate",screenId:"scr_a"}}]});
  const r=analyzeFeasibility(a,E);
  return V(r.gaps.length>0, `${r.gaps.length} écart(s)`);});

// ══════════════════ BLIND KILLER TESTS (attaques inédites) ══════════════════

KT("KT-G04-B01","G4","déclarer un déclencheur `data` vers un écran mort → l'origine devient indéterminée","BLIND","GATE TOMBE",()=>{
  const a=base({screens:[{id:"scr_a",title:L("A"),blocks:[{id:"blk_h",blockType:"header",props:P({title:"A"})}]},
      {id:"scr_z",title:L("Z"),blocks:[{id:"blk_z",blockType:"header",props:P({title:"Z"})}]}],
    navigation:{entryScreenId:"scr_a",routes:[{id:"nav_a",screenId:"scr_a"},{id:"nav_z",screenId:"scr_z"}]},
    entities:[ent("ent_x")],
    actions:[{id:"act_d",name:"d",trigger:{kind:"data",entityId:"ent_x",event:"created"},
      effect:{kind:"navigate",screenId:"scr_z"}}]});
  const r=analyzeFeasibility(a,E);
  return V(has(r,"EXEC_SCREEN_UNREACHABLE_DECLARED"),
    `atteignables déclarés ${r.metrics.screensReachableDeclared}/${r.metrics.screensDeclared}`);});

KT("KT-G05-B02","G5","bloc JAMAIS visible : condition `entity_empty` sur une entité toujours peuplée","BLIND","GATE TOMBE",()=>{
  const a=base({screens:[{id:"scr_a",title:L("A"),blocks:[
      {id:"blk_l",blockType:"list",entityId:"ent_x",props:P({titleFieldId:"fld_x_f0"})},
      {id:"blk_dead",blockType:"button",visibleWhen:{kind:"entity_empty",entityId:"ent_x"},
       props:P({label:"jamais visible",actionId:"act_n"})}]}],
    navigation:{entryScreenId:"scr_a",routes:[{id:"nav_a",screenId:"scr_a"}]},
    entities:[ent("ent_x")],datasets:[{id:"data_x",entityId:"ent_x",contentHash:H,rowCount:9}],
    actions:[{id:"act_n",name:"n",trigger:{kind:"ui",blockId:"blk_dead"},
      effect:{kind:"navigate",screenId:"scr_a"}}]});
  const r=analyzeFeasibility(a,E);
  return V(r.gaps.some(g=>/INVISIBLE|NEVER|DEAD/i.test(g.code)),
    `codes: ${[...new Set(r.gaps.map(g=>g.code))].join(",")||"aucun"}`);});

KT("KT-G05-B03","G5","contrôle fantôme masqué : action câblée par `props.actionId` + déclencheur lifecycle","BLIND","GATE TOMBE",()=>{
  const a=base({screens:[{id:"scr_a",title:L("A"),blocks:[
      {id:"blk_b",blockType:"button",props:P({label:"X",actionId:"act_l"})}]}],
    navigation:{entryScreenId:"scr_a",routes:[{id:"nav_a",screenId:"scr_a"}]},
    actions:[{id:"act_l",name:"l",trigger:{kind:"lifecycle",event:"screen_open",screenId:"scr_a"},
      effect:{kind:"navigate",screenId:"scr_a"}}]});
  return V(has(analyzeFeasibility(a,E),"EXEC_GHOST_CONTROL"));});

KT("KT-G01-B04","G1","dataset à rowCount 0 : entité « semée » mais vide","BLIND","GATE TOMBE",()=>{
  const a=base({screens:[{id:"scr_a",title:L("A"),blocks:[
      {id:"blk_l",blockType:"list",entityId:"ent_x",props:P({titleFieldId:"fld_x_f0"})}]}],
    navigation:{entryScreenId:"scr_a",routes:[{id:"nav_a",screenId:"scr_a"}]},
    entities:[ent("ent_x")],datasets:[{id:"data_x",entityId:"ent_x",contentHash:H,rowCount:0}]});
  return V(has(analyzeFeasibility(a,E),"EXEC_DATA_SOURCE_EMPTY"));});

// ══════════════════════ FALSE FAIL TESTS (vrais positifs) ══════════════════════

KT("KT-FF-001","G5","bloc décoratif sans action ne doit PAS compter comme fantôme","KNOWN","GATE PASSE",()=>{
  const a=base({screens:[{id:"scr_a",title:L("A"),blocks:[
      {id:"blk_h",blockType:"header",props:P({title:"Bonjour"})}]}],
    navigation:{entryScreenId:"scr_a",routes:[{id:"nav_a",screenId:"scr_a"}]}});
  const r=analyzeFeasibility(a,E);
  return V(has(r,"EXEC_GHOST_CONTROL"),`contrôles visibles: ${r.metrics.controlsVisible}`);});

KT("KT-FF-002","G4","app à UN écran : l'entrée ne doit PAS être déclarée inatteignable","KNOWN","GATE PASSE",()=>{
  const a=base({screens:[{id:"scr_a",title:L("A"),blocks:[{id:"blk_h",blockType:"header",props:P({title:"A"})}]}],
    navigation:{entryScreenId:"scr_a",routes:[{id:"nav_a",screenId:"scr_a"}]}});
  return V(has(analyzeFeasibility(a,E),"EXEC_SCREEN_UNREACHABLE_DECLARED"));});

// ═════════════════════════════════ RAPPORT ═════════════════════════════════
console.log("ID".padEnd(14)+"GATE".padEnd(6)+"TYPE".padEnd(7)+"ATTENDU".padEnd(13)+"RÉEL".padEnd(13)+"RÉSULTAT");
console.log("-".repeat(76));
for(const r of results)
  console.log(r.id.padEnd(14)+r.gate.padEnd(6)+r.kind.padEnd(7)+r.attendu.padEnd(13)+r.reel.padEnd(13)+(r.ok?"🟢 conforme":"🔴 ÉCHEC"));
const ko=results.filter(r=>!r.ok);
console.log(`\n${results.length-ko.length}/${results.length} conformes · ${ko.length} ÉCHEC(S)`);
if(ko.length){console.log("\n🔴 ÉCHECS — détail :");
  for(const r of ko) console.log(`   ${r.id} · ${r.attaque}\n      attendu ${r.attendu} · obtenu ${r.reel} ${r.detail?"· "+r.detail:""}`);}
