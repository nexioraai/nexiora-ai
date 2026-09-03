// DÉMONSTRATION — le MÊME moteur, un document RICHE écrit à la main.
// Aucune dépense LLM. But : isoler la cause. Si l'app sort riche, le moteur
// n'est pas le plafond — c'est ce qu'on demande au générateur.
const R = "/Users/yia/Documents/woorri/";
const { assertValidAir } = await import(R + "packages/air-schema/src/index.ts");
const { compileProject } = await import(R + "packages/compiler/src/index.ts");
const L = (t) => [{ locale: "fr-FR", text: t }];
const P = (o) => Object.entries(o).map(([key, value]) => ({ key, value }));
const h = (s) => { let x = 0n; for (const c of s) x = (x * 131n + BigInt(c.codePointAt(0))) % (2n ** 64n);
  return x.toString(16).padStart(64, "0").slice(0, 64); };
const F = (e, n, t, req = false) => ({ id: `fld_${e}_${n}`, name: n, type: t, required: req });

const entities = [
  { id: "ent_plat", name: "plat", fields: [
    F("plat","nom","string",true), F("plat","description","text"), F("plat","prix","number",true),
    {...F("plat","categorie","reference"), referencesEntityId:"ent_categorie"}, F("plat","allergenes","text"), F("plat","disponible","boolean",true),
    F("plat","temps_preparation","number"), F("plat","photo","asset") ] },
  { id: "ent_categorie", name: "categorie", fields: [
    F("categorie","nom","string",true), F("categorie","ordre","number",true) ] },
  { id: "ent_commande", name: "commande", fields: [
    F("commande","numero","string",true), {...F("commande","statut","enum",true), enumValues:["recue","en_preparation","prete","retiree"]}, F("commande","total","number",true),
    F("commande","passee_le","datetime",true), F("commande","retrait_prevu","datetime"), F("commande","note","text") ] },
  { id: "ent_ligne", name: "ligne", fields: [
    {...F("ligne","plat","reference",true), referencesEntityId:"ent_plat",
      // D-064 : le panier affichait « ent_plat_003 ». Il affiche le NOM du plat.
      referenceDisplayFieldId:"fld_plat_nom"}, F("ligne","quantite","number",true), F("ligne","prix_ligne","number",true) ] },
  { id: "ent_client", name: "client", fields: [
    F("client","nom","string",true), F("client","telephone","string",true), F("client","email","string") ] },
];
const datasets = entities.map((e, i) => ({ id: `data_${e.name}`, entityId: e.id, contentHash: h(e.id), rowCount: [12,4,3,7,1][i] }));

const screens = [
  { id:"scr_menu", title:L("Menu"), blocks:[
    { id:"blk_menu_header", blockType:"header", props:P({ title:"Notre carte", subtitle:"Cuisine maison, préparée à la commande" }) },
    { id:"blk_menu_liste", blockType:"list", entityId:"ent_plat", props:P({ title:"Plats du jour",
      titleFieldId:"fld_plat_nom", subtitleFieldId:"fld_plat_description", trailingFieldId:"fld_plat_prix",
      emptyTitle:"Carte indisponible", emptyMessage:"Le service reprend à 11h30." , loadingTitle:"Chargement de la carte", errorTitle:"Carte indisponible", errorMessage:"Vérifiez votre connexion."}) },
    { id:"blk_menu_panier", blockType:"button", props:P({ label:"Voir mon panier", actionId:"act_ouvrir_panier", kind:"primary" }) },
    { id:"blk_menu_commandes", blockType:"button", props:P({ label:"Mes commandes", actionId:"act_ouvrir_commandes", kind:"ghost" }) } ] },
  { id:"scr_plat", title:L("Le plat"), blocks:[
    { id:"blk_plat_entete", blockType:"detail_header", entityId:"ent_plat", props:P({
      titleFieldId:"fld_plat_nom", subtitleFieldId:"fld_plat_description",
      trailingFieldId:"fld_plat_prix", badgeFieldIds:["fld_plat_temps_preparation"] }) },
    { id:"blk_plat_ajouter", blockType:"button", props:P({ label:"Ajouter au panier", actionId:"act_ajouter_panier", kind:"primary" }) },
    { id:"blk_plat_retour", blockType:"button", props:P({ label:"Retour à la carte", actionId:"act_retour_menu", kind:"ghost" }) } ] },
  { id:"scr_panier", title:L("Panier"), blocks:[
    { id:"blk_panier_header", blockType:"header", props:P({ title:"Votre panier", subtitle:"Vérifiez avant de commander" }) },
    { id:"blk_panier_lignes", blockType:"list", entityId:"ent_ligne", props:P({ titleFieldId:"fld_ligne_plat",
      subtitleFieldId:"fld_ligne_quantite", trailingFieldId:"fld_ligne_prix_ligne" }) },
    { id:"blk_panier_vide", blockType:"empty_state", visibleWhen:{ kind:"entity_empty", entityId:"ent_ligne" },
      props:P({ title:"Panier vide", message:"Ajoutez un plat depuis la carte.", actionLabel:"Voir la carte", actionId:"act_retour_menu" }) },
    { id:"blk_panier_commander", blockType:"button", props:P({ label:"Commander", actionId:"act_ouvrir_form", kind:"primary" }) } ] },
  { id:"scr_form", title:L("Vos coordonnées"), blocks:[
    { id:"blk_form_header", blockType:"header", props:P({ title:"Pour vous prévenir", subtitle:"Quand la commande est prête" }) },
    { id:"blk_form_client", blockType:"form", entityId:"ent_client", props:P({ title:"Vos coordonnées",
      fieldIds:["fld_client_nom","fld_client_telephone","fld_client_email"], submitLabel:"Valider la commande" }) } ] },
  { id:"scr_confirmation", title:L("Commande envoyée"), blocks:[
    { id:"blk_conf_entete", blockType:"detail_header", entityId:"ent_commande", props:P({
      titleFieldId:"fld_commande_numero", subtitleFieldId:"fld_commande_statut", trailingFieldId:"fld_commande_total" }) },
    { id:"blk_conf_suivi", blockType:"button", props:P({ label:"Suivre ma commande", actionId:"act_ouvrir_commandes", kind:"primary" }) } ] },
  { id:"scr_commandes", title:L("Mes commandes"), blocks:[
    { id:"blk_cmd_header", blockType:"header", props:P({ title:"Mes commandes", subtitle:"En cours et passées" }) },
    { id:"blk_cmd_liste", blockType:"list", entityId:"ent_commande", props:P({ titleFieldId:"fld_commande_numero",
      subtitleFieldId:"fld_commande_statut", trailingFieldId:"fld_commande_total", badgeFieldId:"fld_commande_statut",
      emptyTitle:"Aucune commande", emptyMessage:"Vos commandes apparaîtront ici." }) },
    { id:"blk_cmd_vide", blockType:"empty_state", visibleWhen:{ kind:"entity_empty", entityId:"ent_commande" },
      props:P({ title:"Aucune commande", message:"Passez votre première commande.", actionLabel:"Voir la carte", actionId:"act_retour_menu" }) } ] },
  { id:"scr_commande", title:L("Détail de la commande"), blocks:[
    { id:"blk_det_entete", blockType:"detail_header", entityId:"ent_commande", props:P({
      titleFieldId:"fld_commande_numero", subtitleFieldId:"fld_commande_note",
      trailingFieldId:"fld_commande_total", badgeFieldIds:["fld_commande_statut"] }) },
    { id:"blk_det_lignes", blockType:"list", entityId:"ent_ligne", props:P({ title:"Ce que vous avez commandé",
      titleFieldId:"fld_ligne_plat", subtitleFieldId:"fld_ligne_quantite", trailingFieldId:"fld_ligne_prix_ligne" }) } ] },
];
const actions = [
  { id:"act_ouvrir_plat", name:"ouvrir un plat", trigger:{kind:"ui",blockId:"blk_menu_liste"}, effect:{kind:"navigate",screenId:"scr_plat"} },
  { id:"act_ouvrir_panier", name:"ouvrir le panier", trigger:{kind:"ui",blockId:"blk_menu_panier"}, effect:{kind:"navigate",screenId:"scr_panier"} },
  { id:"act_ouvrir_commandes", name:"mes commandes", trigger:{kind:"ui",blockId:"blk_menu_commandes"}, effect:{kind:"navigate",screenId:"scr_commandes"} },
  { id:"act_ajouter_panier", name:"ajouter au panier", trigger:{kind:"ui",blockId:"blk_plat_ajouter"}, effect:{kind:"navigate",screenId:"scr_panier"} },
  { id:"act_retour_menu", name:"retour carte", trigger:{kind:"ui",blockId:"blk_plat_retour"}, effect:{kind:"navigate",screenId:"scr_menu"} },
  { id:"act_ouvrir_form", name:"ouvrir le formulaire", trigger:{kind:"ui",blockId:"blk_panier_commander"}, effect:{kind:"navigate",screenId:"scr_form"} },
  // D-070 : « Valider » CRÉE la commande, puis confirme. Avant, il ne faisait
  // que changer d'écran — le document promettait de commander, l'app naviguait.
  { id:"act_valider", name:"valider", trigger:{kind:"ui",blockId:"blk_form_client"},
    effect:{kind:"mutation", entityId:"ent_client", operation:"create", thenScreenId:"scr_confirmation"} },
  { id:"act_suivre", name:"suivre", trigger:{kind:"ui",blockId:"blk_conf_suivi"}, effect:{kind:"navigate",screenId:"scr_commandes"} },
  { id:"act_ouvrir_commande", name:"ouvrir une commande", trigger:{kind:"ui",blockId:"blk_cmd_liste"}, effect:{kind:"navigate",screenId:"scr_commande"} },
];
// INTENTION (AIR 1.2.0, D-056) — la demande du client, conservée VERBATIM,
// et chacun de ses besoins tranché : porté par des nœuds, ou DÉCLARÉ hors de
// portée avec motif. Aucun besoin ne peut plus s'évaporer en silence.
const intent = {
  request: "Je veux une application pour mon restaurant : la carte avec des photos et les prix, "
    + "pouvoir chercher un plat, un panier, passer commande en laissant mes coordonnées, "
    + "et pouvoir suivre mes commandes.",
  requestLocale: "fr-FR",
  needs: [
    { id:"need_carte", statement:"voir la carte du restaurant",
      resolution:{ kind:"satisfied", nodeIds:["scr_menu","ent_plat"] } },
    { id:"need_prix", statement:"voir les prix des plats",
      resolution:{ kind:"satisfied", nodeIds:["ent_plat","scr_plat"] } },
    { id:"need_panier", statement:"un panier",
      resolution:{ kind:"satisfied", nodeIds:["scr_panier","act_ajouter_panier"] } },
    { id:"need_commander", statement:"passer commande en laissant mes coordonnées",
      resolution:{ kind:"satisfied", nodeIds:["scr_form","act_valider","scr_confirmation"] } },
    { id:"need_suivi", statement:"suivre mes commandes",
      resolution:{ kind:"satisfied", nodeIds:["scr_commandes","scr_commande","ent_commande"] } },
    // LES DEUX BESOINS QUI DISPARAISSAIENT. Ils sont désormais DITS.
    { id:"need_photos", statement:"des photos sur les plats de la carte",
      resolution:{ kind:"unexpressible",
        reason:"le registre de Smart Blocks v1.0.0 est GELE a 6 types (header, list, "
          + "detail_header, form, button, empty_state) et ne comporte aucun bloc image. "
          + "Leve par le registre v2 (LOT D) ; jusque-la, le besoin est porte au document, "
          + "pas a l'application." } },
    { id:"need_recherche", statement:"chercher un plat",
      resolution:{ kind:"unexpressible",
        reason:"aucun bloc de recherche au registre gele, et l'enveloppe d'execution "
          + "n'expose aucune operation de filtrage (dataOperations = list, get)." } },
  ],
};

// SLOT LIÉ (1.3.0, D-058) — la démonstration que le code d'auteur est
// réellement APPELÉ : il calcule le total du panier depuis les lignes réelles,
// et sa sortie remplace le sous-titre de l'en-tête du panier.
const slots = [{
  id: "slot_total_panier",
  description: "Calcule le total du panier depuis les lignes et le formate en FCFA.",
  inputs: [{ name: "lignes", type: "json" }, { name: "devise", type: "string" }],
  outputs: [{ name: "totalAffiche", type: "string" }],
  allowedImports: [],
}];
const actionSlot = {
  id: "act_total_panier",
  name: "Calcul du total du panier",
  trigger: { kind: "lifecycle", event: "screen_open", screenId: "scr_panier" },
  effect: {
    kind: "slot",
    slotId: "slot_total_panier",
    binding: {
      inputs: [
        { port: "lignes", source: { kind: "entity_rows", entityId: "ent_ligne" } },
        { port: "devise", source: { kind: "literal", value: "FCFA" } },
      ],
      outputs: [{ port: "totalAffiche", blockId: "blk_panier_header", prop: "subtitle" }],
    },
  },
};

const air = { airSchemaVersion:"1.5.0", projectId:"prj_resto_riche", intent,
  app:{ name:"Chez Nous", slug:"chez-nous", locales:{ userLanguage:"fr-FR", appLocales:["fr-FR"],
    defaultAppLocale:"fr-FR", contentLocales:["fr-FR"], rtlSupported:false } },
  screens, navigation:{ entryScreenId:"scr_menu", routes: screens.map((s)=>({ id:`nav_${s.id.slice(4)}`, screenId:s.id })) },
  entities, relations:[], datasets, actions:[...actions, actionSlot], rules:[{ id:"rule_client_tel", description:"Le téléphone est obligatoire pour rappeler le client.",
    kind:"validation", entityId:"ent_client",
    assertions:[{ fieldId:"fld_client_telephone", operator:"required" }] }], slots, capabilities:[], permissions:[],
  design:{ theme:"chez_nous", overrides:[{key:"radius.sm",value:10},{key:"color.light.primary",value:"#0B5E8A"}] },
  integrations:[], network:{ policy:"deny_by_default", allowedDomains:[] },
  native:{ minIosVersion:"16.4", minAndroidSdk:26 },
  compliance:{ commerceClass:"none", accountDeletionRequired:false, dataCollected:[] },
  // PROMESSES — uniquement ce que le moteur peut RÉELLEMENT tenir aujourd'hui.
  // Règle d'honnêteté : on ne déclare pas une promesse dont la cible est morte.
  expectedTests:[
    { id:"test_e2e_menu_ouvre_plat", kind:"e2e", targetId:"scr_plat",
      description:"Depuis la carte, appuyer sur un plat ouvre sa fiche détaillée." },
    { id:"test_e2e_plat_vers_panier", kind:"e2e", targetId:"scr_panier",
      description:"Depuis la fiche d'un plat, « Ajouter au panier » ouvre le panier." },
    { id:"test_e2e_panier_vers_form", kind:"e2e", targetId:"scr_form",
      description:"Depuis le panier, « Commander » ouvre la saisie des coordonnées." },
    { id:"test_e2e_form_vers_confirmation", kind:"e2e", targetId:"scr_confirmation",
      description:"La validation du formulaire mène à l'écran de confirmation." },
    { id:"test_e2e_confirmation_vers_suivi", kind:"e2e", targetId:"scr_commandes",
      description:"Depuis la confirmation, « Suivre ma commande » ouvre la liste des commandes." },
    { id:"test_e2e_commandes_vers_detail", kind:"e2e", targetId:"scr_commande",
      description:"Appuyer sur une commande ouvre son détail avec ses lignes." },
    { id:"test_e2e_retour_carte", kind:"e2e", targetId:"scr_menu",
      description:"Depuis la fiche d'un plat, « Retour à la carte » ramène à la carte." },
    { id:"test_action_ouvrir_plat", kind:"contract", targetId:"act_ouvrir_plat",
      description:"L'ouverture d'un plat est câblée sur le bloc liste de la carte." },
    { id:"test_donnees_plats", kind:"contract", targetId:"ent_plat",
      description:"La carte affiche les plats avec leur nom, leur description et leur prix." },
    { id:"test_donnees_commandes", kind:"contract", targetId:"ent_commande",
      description:"L'historique affiche les commandes avec leur numéro, leur statut et leur total." },
  ] };

console.log("DOCUMENT ÉCRIT À LA MAIN — restaurant « Chez Nous »");
console.log("  écrans:", screens.length, "· entités:", entities.length, "· blocs:", screens.flatMap(s=>s.blocks).length,
  "· actions:", actions.length, "· champs:", entities.flatMap(e=>e.fields).length);
let v; try { v = assertValidAir(air); console.log("① validateurs .......... 🟢 ACCEPTÉ"); }
catch (e) { console.log("① validateurs .......... 🔴", e.message?.slice(0,300)); for(const d of (e.diagnostics??[])) console.log("   ",d.code,d.path,d.message); process.exit(1); }
// IMPLÉMENTATION du slot — code d'auteur, soumis à la politique AST de
// l'Oracle comme n'importe quel slot. Il est désormais RÉELLEMENT APPELÉ.
const sourceSlot = `export function runSlot(entrees: { lignes: { fld_ligne_prix_ligne?: string }[]; devise: string }): { totalAffiche: string } {
  const total = entrees.lignes.reduce((s, l) => s + Number(l.fld_ligne_prix_ligne ?? 0), 0);
  return { totalAffiche: \`Total : \${total.toLocaleString("fr-FR")} \${entrees.devise}\` };
}
`;
const c = compileProject(v, undefined, {
  slots: [{ slotId: "slot_total_panier", source: sourceSlot, authorId: "demo" }],
});
console.log("② compilation .......... 🟢", c.files.size, "fichiers · rootHash", c.rootHash.slice(0,12)+"…");
const { writeFileSync, mkdirSync } = await import("node:fs");
const OUT = R + "slices/resto-riche/app/";
for (const [f, contenu] of c.files) { const p = OUT + f; mkdirSync(p.slice(0, p.lastIndexOf("/")), {recursive:true}); writeFileSync(p, contenu); }
writeFileSync(R + "slices/resto-riche/chez-nous.air.json", JSON.stringify(v, null, 2));
console.log("③ projet écrit ......... slices/resto-riche/app/ —", c.files.size, "fichiers");
