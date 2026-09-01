// CAMPAGNE D'ÉMISSION AIR v3 — CORRECTIF DE PROMPT (2026-08-30).
//
// emit.mjs (v1) et emit-v2.mjs (v2) sont CONSERVÉS INTACTS : ce sont les
// enregistrements des campagnes qui ont produit les corpus. Ce fichier est
// leur successeur, PAS leur remplacement.
//
// CAUSE RACINE CORRIGÉE ICI — diagnostic du 2026-08-30 :
//   Les 12 documents du corpus ont TOUS 4 écrans (3 pour un seul) et TOUS
//   exactement 3 entités. Ce n'était ni une limite du modèle, ni une limite
//   du schéma, ni une limite du moteur : la règle 10 du prompt disait
//   « Sois complet mais sobre : 2 à 4 écrans, 1 à 3 entités ».
//   Le modèle a SATURÉ le plafond qu'on lui donnait, 12 fois sur 12.
//   [VÉRIFIÉ] un AIR écrit à la main à 12 écrans / 8 entités est accepté par
//   les validateurs et compilé sans erreur — le plafond n'était que le prompt.
//
// TROIS CORRECTIFS :
//   1. règle 10 — dimensionner sur le BESOIN, plus sur un plafond ; et exiger
//      que tout écran déclaré soit atteignable (18 écrans du corpus ne le sont pas) ;
//   2. règle E — besoin non exprimable : le déclarer au lieu de le perdre en
//      silence (12 documents déclarent 17 champs `asset` qu'aucun bloc ne rend) ;
//   3. règle F — conditionner l'état vide (17 duplications mesurées au corpus).
//
// NON EXÉCUTÉ. Lancer cette campagne consomme du budget LLM : décision propriétaire.

// DE SMART BLOCKS (D-023/D-024). Mêmes 12 intentions, même pipeline par
// sections que la campagne 2.4 (emit.mjs, INTOUCHÉ), mêmes contraintes API.
// Différences consignées en D-025 : + allowlist de blocs au prompt et
// validateAirBlocks en validation locale · design.overrides ABSENT ·
// round-trip SUPPRIMÉ (garantie D-019 structurelle au schéma inchangé) ·
// sortie corpus-v3/ (v1 ET v2 gelés, byte-identiques) · PLAFOND DUR 25 $.
// Usage : node emit-v2.mjs [debut] [fin]
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { INTENTIONS } from "./intentions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

const airSchema = await import(join(REPO, "packages/air-schema/src/index.ts"));
const registry = await import(join(REPO, "packages/capability-registry/src/index.ts"));
const blocksRegistry = await import(join(REPO, "packages/blocks/src/registry.ts"));
const repairScope = await import(join(REPO, "packages/repair/src/repair-scope.ts"));
const budgetUsd = await import(join(REPO, "packages/repair/src/budget-usd.ts"));
const preservation = await import(join(REPO, "packages/repair/src/preservation.ts"));
const executionContract = await import(join(REPO, "packages/execution-contract/src/envelope.ts"));

// D-088 — LE PROMPT LIT L'ENVELOPPE, IL NE LA PARAPHRASE PLUS.
//
// CAUSE RACINE MESURÉE : le prompt REDISAIT en prose ce que le moteur sait
// faire. Quand le moteur a gagné les images et la recherche, la prose est
// restée. Le générateur a donc appris — et répété dans 12 documents sur 12 —
// que le registre était dépourvu de visuel et de recherche. 42 promesses
// `test_besoin_non_rendable_*` et 19 motifs d'inexprimabilité en découlent.
// Une prose ne peut pas dériver si elle est CALCULÉE depuis l'objet.
const ENV = executionContract.EXECUTION_ENVELOPE_V1;
const surfaceEnveloppe = () => {
  const faits = [
    ["imageRendering", "AFFICHER DES IMAGES", "`imageFieldId` sur `list` (vignette) et sur `detail_header` (visuel d'en-tête)"],
    ["listSearch", "UNE RECHERCHE QUI FILTRE", "`searchFieldId` + `searchPlaceholder` sur `list` — le filtrage est RÉEL, pas décoratif"],
    ["primaryNavigation", "UNE BARRE PERSISTANTE", "`navigation.primary` — 3 à 5 destinations, présentes sur chaque écran"],
    ["listFiltering", "TRIER, FILTRER, BORNER", "`sortFieldId`/`sortDirection`, `filterFieldId`/`filterOperator`/`filterValue`, `pageSize`"],
    ["relationTraversal", "AFFICHER UNE RÉFÉRENCE LISIBLE", "`referenceDisplayFieldId` sur le champ de référence"],
    ["crossScreenFormState", "CONSERVER UN FORMULAIRE ENTRE ÉCRANS", "l'état saisi survit à une navigation"],
    ["rulesEnforced", "VALIDER AVANT ÉCRITURE", "`air.rules` est appliquée"],
    ["slotsInvoked", "INVOQUER UN CODE SLOT", "un slot lié est réellement appelé"],
  ];
  const sait = faits.filter(([f]) => ENV[f] === true);
  const nesaitpas = faits.filter(([f]) => ENV[f] !== true);
  return (
    "CE QUE LE MOTEUR SAIT FAIRE (enveloppe " + ENV.version + ", mesurée — non négociable) :\n" +
    sait.map(([f, quoi, comment]) => `   ✅ ${quoi} — ${comment}   [${f}]`).join("\n") +
    "\n   ✅ EFFETS D'ACTION : " + ENV.effects.join(", ") +
    "\n   ✅ DONNÉES : " + ENV.dataOperations.join(", ") +
    (nesaitpas.length > 0
      ? "\n\nCE QUE LE MOTEUR NE SAIT PAS ENCORE FAIRE :\n" +
        nesaitpas.map(([f, quoi]) => `   ❌ ${quoi}   [${f}: false]`).join("\n")
      : "") +
    "\n   ❌ EXÉCUTER UN EFFET `capability` (caméra, GPS, carte, notifications)   [capabilitiesEmitCode: " +
    String(ENV.capabilitiesEmitCode) +
    "]\n\nCes drapeaux sont les SEULS faits qu'un motif d'inexprimabilité peut invoquer, " +
    "et il doit les nommer EXACTEMENT. Un motif qui invoque un fait ✅ est REJETÉ par le validateur."
  );
};

// --- Clé : lue depuis apps/web/.env.local, jamais journalisée. ---
function apiKey() {
  const env = readFileSync(join(REPO, "apps/web/.env.local"), "utf8");
  const m = env.match(/^ANTHROPIC_API_KEY=("?)([^"\n]+)\1$/m);
  if (!m) throw new Error("ANTHROPIC_API_KEY introuvable dans apps/web/.env.local");
  return m[2].trim();
}

const MODEL = "claude-opus-5";
// PORTÉ À 16000 (D-078) — mesuré, pas supposé : la campagne a échoué sur son
// PREMIER domaine avec « Unexpected end of JSON input » après 202 s et 0,53 $.
// La réponse était TRONQUÉE. Les sept règles ajoutées demandent bien plus de
// JSON qu'avant — intention avec un besoin par écran, liaison de chaque slot,
// titres d'état sur chaque bloc lié — et 8000 jetons ne suffisaient plus.
const MAX_TOKENS = 16000;
// DÉLAI ET REPRISES (D-080) — la campagne a perdu deux domaines sur
// « Request timed out » : le SDK abandonne à 10 minutes par défaut, et les
// sections lourdes (actions avec liaisons, écrans avec titres d'état) les
// dépassent. Un abandon coûte le domaine ENTIER et ce qui a déjà été facturé
// (1,47 $ perdu sur `boutique-mode`). 20 minutes et deux reprises : le SDK
// rejoue lui-même, sans relancer toute la campagne.
const client = new Anthropic({
  apiKey: apiKey(),
  timeout: 20 * 60 * 1000,
  maxRetries: 2,
});

// Tarifs publics claude-opus-5, $/MTok (mêmes valeurs que le banc coûts).
const PRIX = { in: 5, cacheWrite: 6.25, cacheRead: 0.5, out: 25 };
const coutUSD = (u) =>
  ((u.input_tokens ?? 0) * PRIX.in +
    (u.cache_creation_input_tokens ?? 0) * PRIX.cacheWrite +
    (u.cache_read_input_tokens ?? 0) * PRIX.cacheRead +
    (u.output_tokens ?? 0) * PRIX.out) / 1e6;

// --- Découpage en sections : 5 groupes, chacun ACCEPTÉ par la grammaire
// structured outputs (sondé section par section puis par groupes —
// probe-grammar.mjs). Ordre de dépendance : base → données → écrans →
// comportement → câblage. ---
const PARTS = [
  {
    name: "base",
    keys: [
      "airSchemaVersion",
      "projectId",
      "app",
      "navigation",
      "design",
      "network",
      "native",
      "compliance",
    ],
  },
  { name: "donnees", keys: ["entities", "relations", "datasets", "rules", "slots"] },
  { name: "ecrans", keys: ["screens"] },
  // DÉCOUPAGE (D-078) — mesuré, pas supposé : « The compiled grammar is too
  // large » sur `base` ET `comportement`. Les liaisons de slot et `thenScreenId`
  // ont grossi le schéma des actions au-delà de la limite des sorties
  // structurées, même au niveau le plus dégradé. Chaque section porte désormais
  // une grammaire que le service accepte.
  { name: "actions", keys: ["actions"] },
  { name: "capacites", keys: ["capabilities", "permissions"] },
  { name: "cablage", keys: ["integrations", "expectedTests"] },
  // INTENTION EN DERNIER — ses `nodeIds` désignent des écrans, actions et
  // entités : on ne peut dire QUELS nœuds portent un besoin qu'une fois ces
  // nœuds émis. La placer en tête aurait forcé le modèle à référencer ce qui
  // n'existe pas encore.
  { name: "intention", keys: ["intent"] },
];

function stripKeys(node, keys) {
  if (Array.isArray(node)) return node.map((n) => stripKeys(n, keys));
  if (node !== null && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (keys.includes(k)) continue;
      out[k] = stripKeys(v, keys);
    }
    return out;
  }
  return node;
}
function oneOfToAnyOf(node) {
  if (Array.isArray(node)) return node.map(oneOfToAnyOf);
  if (node !== null && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k === "oneOf" ? "anyOf" : k] = oneOfToAnyOf(v);
    return out;
  }
  return node;
}
function makeLevels(jsonSchema) {
  const base = oneOfToAnyOf(jsonSchema);
  const L1 = stripKeys(base, ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]);
  const L2 = stripKeys(L1, ["minLength", "maxLength", "minItems", "maxItems"]);
  const L3 = stripKeys(L2, ["pattern", "format"]);
  return [
    { name: "sans-bornes-numeriques", schema: L1 },
    { name: "sans-longueurs", schema: L2 },
    { name: "sans-patterns", schema: L3 },
  ];
}

for (const part of PARTS) {
  const pick = Object.fromEntries(part.keys.map((k) => [k, true]));
  part.zod = airSchema.projectAirSchema.pick(pick);
  part.levels = makeLevels(z.toJSONSchema(part.zod, { target: "draft-2020-12" }));
  part.levelIndex = 0;
}

// --- Digest du registre pour le prompt : le LLM demande, le registre décide. ---
function registryDigest() {
  const lines = [];
  for (const c of registry.CAPABILITIES) {
    const perms = c.inducedPermissions.map((p) => `${p.platform}:${p.permission}`).join(", ");
    lines.push(
      `- \`${c.id}\` — ${c.title}` +
        (c.commerceConstraint === "none" ? "" : ` [classe commerce EXIGÉE : ${c.commerceConstraint}]`) +
        (c.dependencies.capabilities.length ? ` [dépend de : ${c.dependencies.capabilities.join(", ")}]` : "") +
        (perms ? ` [permissions à DÉCLARER dans l'AIR : ${perms}]` : ""),
    );
  }
  return lines.join("\n");
}

const SYSTEM_EMIT = `Tu émets la spécification AIR (Application Intermediate Representation) d'une application mobile native, par sections, au format JSON strictement conforme au schéma fourni. À chaque appel tu émets UNIQUEMENT les sections demandées, parfaitement cohérentes avec les sections déjà émises qui te sont fournies.

${surfaceEnveloppe()}

RÈGLES NON NÉGOCIABLES :
1. Capabilities : UNIQUEMENT les identifiants du registre ci-dessous. Tu demandes une capacité, jamais un package. "payments.psp" et "payments.iap" ne coexistent jamais.
2. Classe commerce : biens/services digitaux consommés dans l'app ⇒ "digital" + payments.iap ; biens physiques ou services hors app ⇒ "physical_or_offapp" + payments.psp ; sinon "none" et aucune capability payments.
3. Permissions : pour CHAQUE capability choisie, déclare dans "permissions" toutes les permissions listées pour elle dans le registre (plateforme exacte, justification localisée couvrant la locale par défaut, requiredByCapability = l'id de la capability).
4. Identifiants stables : préfixes obligatoires — projet prj_, écran scr_, bloc blk_, route nav_, entité ent_, champ fld_, relation rel_, dataset data_, action act_, règle rule_, slot slot_, intégration intg_, test test_. Minuscules, chiffres, underscores. Uniques dans tout le document.
5. Cohérence référentielle totale : toute référence (écran, bloc, entité, champ, capability, slot) pointe vers un nœud défini dans le document (sections déjà émises comprises). Les effets d'action "capability" référencent une capability DÉCLARÉE dans "capabilities".
6. Textes localisés : tableau [{locale, text}] incluant TOUJOURS la locale par défaut, sans locale dupliquée. Configurations : tableau [{key, value}] sans clé dupliquée. rtlSupported=false sauf demande contraire.
7. Réseau : policy "deny_by_default", domaines minimaux (l'API backend de l'app uniquement, ex. "api.deribfy.app").
8. Aucun secret nulle part (pas de clé, token, password dans les configs).
9. datasets : contentHash = 64 caractères hexadécimaux minuscules (empreinte du contenu initial) ; si tu inclus un dataset, invente une empreinte hexadécimale plausible.
10. airSchemaVersion = "1.6.0". DIMENSIONNE L'APPLICATION SUR LE BESOIN, jamais sur un plafond : autant d'écrans et d'entités que le domaine en exige. Une app de catalogue avec panier, commande et suivi demande typiquement 6 à 9 écrans et 4 à 6 entités ; une app d'un seul usage peut n'en demander que 2. Le moteur compile sans difficulté 12 écrans et 8 entités [vérifié]. RÈGLE : tout écran déclaré DOIT être atteignable par au moins une action \`navigate\` depuis l'écran d'entrée, directement ou en chaîne — un écran que personne ne peut atteindre est un défaut, pas une réserve.

REGISTRE DES CAPABILITIES (allowlist fermée) :
${registryDigest()}

REGISTRE DES SMART BLOCKS (allowlist FERMÉE — blockType UNIQUEMENT parmi ces 6 ; props STRICTES : toute clé hors liste = refus) :
- \`header\` — tête d'écran éditoriale. entityId : INTERDIT. Props : title (string, REQUIS), subtitle (string, optionnel).
- \`list\` — liste d'instances d'une entité. entityId : REQUIS. Props : titleFieldId (fld_*, REQUIS), subtitleFieldId?, trailingFieldId?, badgeFieldId? (fld_*), title?, emptyTitle?, emptyMessage? (strings).
- \`detail_header\` — tête d'écran de détail. entityId : REQUIS. Props : titleFieldId (fld_*, REQUIS), subtitleFieldId?, trailingFieldId? (fld_*), badgeFieldIds? (tableau de fld_*, NON VIDE si présent).
- \`form\` — formulaire lié à une entité. entityId : REQUIS. Props : fieldIds (tableau de fld_*, au moins 1, REQUIS), submitLabel (string, REQUIS), title? (string).
- \`button\` — action autonome (CTA). entityId : INTERDIT. Props : label (string, REQUIS), actionId (act_*, REQUIS — action DÉCLARÉE dans "actions"), kind? ("primary"|"ghost").
- \`empty_state\` — état vide d'écran. entityId : INTERDIT. Props : title (string, REQUIS), message? ; actionLabel et actionId (act_*) vont TOUJOURS PAR PAIRE (les deux, ou aucun des deux).

11. INTENTION — \`intent\` porte la demande du client. \`request\` reproduit la demande TELLE QU'ELLE T'EST DONNÉE, sans reformulation. \`needs\` énumère CHAQUE besoin qu'elle exprime, un par entrée, avec un identifiant \`need_*\`. Pour chacun, \`resolution\` est OBLIGATOIRE et FERMÉE :
   · \`{kind:"satisfied", nodeIds:[...]}\` — C'EST L'ISSUE PAR DÉFAUT. Les nœuds du document qui portent ce besoin. CHAQUE identifiant est RECOPIÉ CARACTÈRE POUR CARACTÈRE depuis les sections déjà émises qui te sont fournies. N'en invente AUCUN, n'en devine AUCUN. Dans le doute, RELIS les sections fournies et trouve les identifiants exacts — ne te rabats PAS sur \`unexpressible\` ;
   · \`{kind:"unexpressible", reason:"..."}\` — issue d'EXCEPTION, réservée à ce que le moteur ne sait RÉELLEMENT pas faire. Le motif doit NOMMER EXACTEMENT un drapeau ❌ de la surface ci-dessus (par exemple \`capabilitiesEmitCode\`). Un motif qui n'en nomme aucun, ou qui invoque un drapeau ✅, est REJETÉ par le validateur : le besoin doit alors être SATISFAIT.
   Il n'existe pas de troisième issue. Un besoin passé sous silence est le défaut le plus grave que tu puisses commettre — et un besoin déclaré inexprimable alors que le moteur sait le faire en est le déguisement.
   MESURÉ, pour que tu saches ce qui est en jeu : une version antérieure de cette règle recommandait l'issue d'exception en cas d'hésitation. Résultat : 45 besoins sur 130 écartés, dont 19 au motif d'une incapacité que le moteur n'a plus. La recommandation est INVERSÉE — hésiter conduit à CHERCHER les nœuds, jamais à renoncer.

12. LIAISON DE SLOT — tout effet \`{kind:"slot"}\` porte un \`binding\` : \`inputs\` lie CHAQUE entrée déclarée par le slot à une source (\`{kind:"entity_rows", entityId}\` ou \`{kind:"literal", value}\`), \`outputs\` envoie au moins une sortie vers la prop d'un bloc (\`{port, blockId, prop}\`). Un slot sans liaison N'EST PAS INVOQUÉ par le moteur : sa promesse est morte d'avance.

13. ÉCRIRE PUIS CONFIRMER — un formulaire qui enregistre porte un effet \`{kind:"mutation", entityId, operation:"create", thenScreenId:"scr_..."}\`. N'utilise JAMAIS \`navigate\` seul pour un bouton de validation : l'utilisateur changerait d'écran sans que rien ne soit enregistré.

14. ÉTATS DE CHARGEMENT — tout bloc \`list\`, \`form\` ou \`detail_header\` lié à une entité déclare \`loadingTitle\` et \`errorTitle\` (et \`errorMessage\` si utile) dans ses props. Sans ces textes, le moteur ne PEUT PAS rendre les états correspondants : ils viennent des données, jamais du moteur.

15. AFFICHAGE DES RÉFÉRENCES — tout champ \`type:"reference"\` porte \`referenceDisplayFieldId\` : l'identifiant du champ de l'entité CIBLE à montrer. Sans lui, l'écran affiche un identifiant brut (« ent_plat_003 ») au lieu d'un nom.

16. ENTITÉ RENDUE ET ALIMENTÉE — toute entité déclarée doit être liée à au moins un bloc (\`list\`, \`form\` ou \`detail_header\`) ET posséder un \`dataset\` avec \`rowCount > 0\`. Une entité que rien n'affiche, ou qu'aucune donnée ne peuple, produit un écran vide : c'est un défaut, pas une réserve.

17. HONNÊTETÉ SUR LES CAPABILITIES — le moteur N'EXÉCUTE PAS ENCORE les effets \`capability\` (\`capabilitiesEmitCode: false\`, mesuré). Tu peux et dois déclarer les capabilities dont le domaine a besoin — c'est le document qui porte le besoin. Mais :
   · N'ÉCRIS AUCUN \`expectedTests\` dont le \`targetId\` est une action à effet \`capability\`. Ce serait promettre un comportement que rien ne tient.
   · Le besoin correspondant va dans \`intent.needs\` avec \`{kind:"unexpressible", reason:"le moteur n'exécute pas encore les effets capability (capabilitiesEmitCode: false)"}\`.
   Déclarer le besoin est juste ; le promettre est un mensonge. Le premier est exigé, le second interdit.
   PORTÉE STRICTE : cette règle ne vaut QUE pour les effets \`capability\` — prise de vue, position GPS, carte, notifications. Elle n'autorise RIEN d'autre à être déclaré inexprimable. AFFICHER une image déjà présente dans les données, RECHERCHER dans une liste, NAVIGUER : le moteur sait faire, la surface ci-dessus le dit, et ces besoins DOIVENT être satisfaits. Ne généralise jamais cette règle au-delà de son objet.

18. LIGNE DE LISTE PRESSABLE — quand une entité possède un écran de détail, la LIGNE de la liste ouvre ce détail : déclare une action \`{trigger:{kind:"ui",blockId:<le bloc list>}, effect:{kind:"navigate",screenId:<le détail>}}\`. N'ÉCRIS JAMAIS un bouton « Voir le détail de X » pour cela. Mesuré sur le corpus précédent : 103 navigations sur 108 partaient d'un bouton, UNE SEULE d'une ligne de liste — l'inverse de ce qu'attend un utilisateur d'application mobile.

19. ARCHITECTURE — tu es responsable de transformer l'intention en ARCHITECTURE, pas seulement en liste d'écrans. Identifie l'archétype, puis déduis les destinations principales, leur rôle et leur ORDRE. Références conceptuelles, à ADAPTER au besoin réellement exprimé — jamais à recopier :
   · Restaurant   : Accueil | Menu | Commandes | Offres | Compte
   · Boutique     : Accueil | Produits | Panier | Commandes | Compte
   · Réservation  : Accueil | Services | Réservations | Compte
   « Accueil » est le point commun structurel des trois. N'INVENTE AUCUNE destination que le besoin n'exige pas : une app sans programme de fidélité n'a pas d'onglet « Offres ».

20. NAVIGATION PRINCIPALE — déclare \`navigation.primary.destinations\` : 3 à 5 entrées, chacune \`{routeId, label, order}\`, \`order\` contigu depuis 0. Le compilateur en fait une BARRE PERSISTANTE EN BAS DE L'ÉCRAN, comme toute application mobile de référence. RÈGLE GÉNÉRALE : **les destinations principales d'une application mobile sont regroupées dans une navigation persistante située en bas de l'écran ; elles ne doivent jamais être représentées par des boutons de navigation empilés dans le contenu.**

21. INTERDICTION DU DOUBLON — un \`button\` placé SUR un écran qui est lui-même une destination de \`primary\`, et menant à une AUTRE destination de \`primary\`, est INTERDIT : la barre est déjà sous le doigt de l'utilisateur. C'est le défaut exact que la règle 20 supprime — « Mon panier » empilé sous la liste des plats alors que Panier est un onglet. Le validateur REFUSE le document (\`AIR_NAV_TAB_DUPLICATE\`).
   EN REVANCHE, depuis un écran de FLUX (un détail, une étape de parcours), un bouton menant à un onglet est LÉGITIME : il fait avancer l'utilisateur — « Débloquer avec l'abonnement » depuis la fiche d'un programme verrouillé, « Commander » depuis un panier. Ne confonds pas une redondance avec une conversion.

22. DESTINATION VIVANTE — chaque destination de \`primary\` doit mener à un écran qui porte au moins un bloc lié à une entité OU au moins une action. Le validateur REFUSE le document sinon. Une barre de navigation qui mène à un écran vide est pire que quatre boutons : elle est belle.

23. IMAGES — RÈGLE SANS EXCEPTION. Une image déclarée et jamais affichée est un DÉFAUT. Mesuré : 23 champs d'image sur 12 documents, RENDUS NULLE PART ; puis, malgré une première version de cette règle, 3 champs encore orphelins sur \`plombier-urgence\` — le mot « pertinent » y servait de porte de sortie. Il est retiré.
   OBLIGATION : dès qu'une entité porte un champ \`type:"asset"\` ET qu'un bloc de ton document affiche cette entité, ce champ DOIT être affiché. Aucun jugement de pertinence n'est demandé : si tu déclares une photo sur une entité que tu montres, tu la montres. Si une entité n'a réellement aucun visuel dans le domaine, alors ne lui invente pas de champ image dès le départ — mais NE RETIRE JAMAIS un champ image déjà déclaré pour faire taire ce diagnostic : la réponse attendue est de l'AFFICHER. La suppression est détectée et la réparation rejetée.
   Concrètement :
   · le bloc \`list\` qui montre cette entité porte \`imageFieldId\` — la ligne affiche alors sa vignette à gauche, le texte au centre, le prix ou l'action à droite ;
   · le bloc \`detail_header\` de sa fiche porte \`imageFieldId\` — une fiche de plat, de bien ou d'article sans visuel n'est pas une fiche.
   C'est la composition d'un catalogue moderne : rien n'est centré, rien ne reste étroit.

24. RECHERCHE — quand une liste présente un CATALOGUE (plats, produits, biens, services, annonces), déclare \`searchFieldId\` sur le bloc liste, plus \`searchPlaceholder\`. Le champ est rendu EN TÊTE de la liste, donc en haut de l'écran de catalogue. N'en mets PAS sur une liste courte et fermée (les 3 étapes d'une commande, un historique de 5 lignes) : une recherche inutile encombre.

25. DENSITÉ ET COMPOSITION — un écran principal ne se limite pas à deux blocs centrés. Compose comme les applications de référence du domaine — catalogue, marketplace, restauration, livraison, réservation : en-tête porteur de contexte, recherche si pertinente, liste dense qui exploite la largeur, actions attachées à leur contexte. Utilise \`pageSize\` quand une liste serait trop longue, \`sortFieldId\` quand un ordre a du sens (prix, date, popularité). EXTRAIS LES PRINCIPES de ces applications — hiérarchie, emplacement, densité, relation liste→détail — NE COPIE NI LEUR DESIGN NI LEUR CONTENU.

26. LISTE → DÉTAIL → ACTION — le parcours doit être complet : la liste montre, la ligne ouvre le détail (règle 18), le détail présente davantage d'informations ET porte l'action pertinente. L'action dépend du modèle commercial RÉELLEMENT exprimé : commande et paiement quand ils existent, prise de contact quand le commerce fonctionne ainsi. N'invente aucune fonction que l'intention n'exprime pas.

27. INTERDICTION DE RÉSOUDRE UN DÉFAUT EN SUPPRIMANT — RÈGLE TRANSVERSE, elle prime sur toute autre lecture.
   Chaque règle ci-dessus décrit une chose à CONSTRUIRE. Aucune ne s'obtient en retirant ce qu'elle désigne.
   INTERDIT, sans exception :
   · retirer un champ \`asset\` au lieu de l'afficher (règle 23) ;
   · retirer un \`expectedTests\` au lieu de créer sa cible ;
   · retirer une entité, un écran, un bloc ou une action au lieu de le relier ;
   · retirer une destination de \`primary\` au lieu de lui donner un écran vivant (règle 22) ;
   · déplacer un besoin vers \`unexpressible\` au lieu de le satisfaire (règle 11) ;
   · retirer un besoin de \`intent.needs\` — la demande du client ne se raccourcit pas.
   MESURÉ : la boucle de réparation ne réémettait que la section où le défaut s'OBSERVE, jamais celle qui porte
   le correctif ; supprimer était donc la seule issue offerte. Ce n'est plus vrai — la section corrective t'est
   désormais fournie. Et toute disparition qu'aucun diagnostic ne nomme est DÉTECTÉE : la réparation est alors
   REJETÉE en bloc et le document fautif conservé. Supprimer ne te fait plus passer ; cela te fait échouer.

RÈGLES BLOCS NON NÉGOCIABLES :
A. Tout *FieldId d'un bloc référence un champ (fld_*) DE L'ENTITÉ LIÉE à ce bloc.
B. Tout actionId référence une action DÉCLARÉE dans la section "actions".

B-bis. UN DÉCLENCHEUR \`ui\` EXIGE UN BLOC ACTIONNABLE. \`{trigger:{kind:"ui", blockId:X}}\`
   n'est valide que si X est un \`button\`, un \`list\`, un \`form\` ou un \`empty_state\` —
   les seuls blocs que l'utilisateur peut presser. \`header\` et \`detail_header\` n'exposent
   AUCUN gestionnaire : une action déclenchée depuis eux n'apparaît même pas dans
   l'application compilée. MESURÉ : trois actions ainsi déclarées sur des \`detail_header\`
   étaient valides au schéma et TOTALEMENT MORTES. Le validateur les refuse désormais.
   L'action d'un écran de détail se place sur un \`button\` de cet écran, jamais sur son en-tête.

B-ter. COHÉRENCE DU DISPATCH — \`button\` et \`empty_state\`. Ces deux blocs portent une prop
   \`actionId\`, et c'est ELLE que l'application exécute ; le \`trigger\` n'y sert qu'à déclarer
   l'origine. Les deux DOIVENT donc désigner la MÊME action :
   \`{id:"blk_x", blockType:"button", props:[{key:"actionId", value:"act_y"}]}\`
   va avec \`{id:"act_y", trigger:{kind:"ui", blockId:"blk_x"}}\` — jamais avec une autre.
   MESURÉ : 17 actions du corpus déclaraient un \`trigger\` vers un bloc dont la prop pointait
   AILLEURS. Elles étaient valides, et JAMAIS exécutées — l'utilisateur presse, une autre action
   part, et celle-ci n'existe que sur le papier.
   Un même \`actionId\` peut être réutilisé par PLUSIEURS blocs (c'est légitime : plusieurs boutons
   ouvrent le même écran) ; ce qui est interdit, c'est qu'un \`trigger\` vise un bloc qui en
   dispatche une autre. \`form\` et \`list\` ne sont PAS concernés : eux sont résolus par le
   \`trigger\`, et n'ont pas de prop \`actionId\`.
C. list/form/detail_header portent TOUJOURS entityId ; header/button/empty_state n'en portent JAMAIS.
D. design.overrides : NE PAS ÉMETTRE ce champ (absent). design.tokensVersion : NE PAS ÉMETTRE non plus. Le train de release fixe la version des tokens ; un document qui en exige une autre est REFUSÉ à la compilation (mesuré : « le document exige les tokens 1.5.0, le train embarque 1.2.0 » — le modèle avait recopié la version du SCHÉMA, qui n'a aucun rapport).

E. BESOIN NON EXPRIMABLE — RÈGLE D'HONNÊTETÉ, CORRIGÉE.
   Une version antérieure de cette règle décrivait le registre comme dépourvu de visuel et
   de recherche. Cette description est PÉRIMÉE, et elle a coûté cher : 42 promesses
   \`test_besoin_non_rendable_*\` dans 12 documents sur 12, dont beaucoup portaient sur des
   photos et des recherches que le moteur RENDAIT DÉJÀ.
   N'utilise AUCUNE description du moteur venue d'ailleurs : la surface d'exécution donnée
   plus haut est calculée depuis le contrat réel, et elle seule fait foi.
   · « menu avec photos », « photos des biens » → \`imageFieldId\`. SATISFAIT.
   · « rechercher un article », « trouver un service » → \`searchFieldId\`. SATISFAIT.
   · « par catégorie » → \`filterFieldId\` + \`filterValue\`, ou un écran par catégorie. SATISFAIT.
   N'ÉCRIS un test \`test_besoin_non_rendable_<sujet>\` QUE pour un besoin dont un drapeau
   ❌ de la surface démontre l'impossibilité. Pour tout le reste : construis-le.

F. Un bloc \`empty_state\` placé sur le même écran qu'un bloc \`list\` lié à la MÊME entité
   DOIT porter \`visibleWhen: {kind:"entity_empty", entityId:"<la même entité>"}\` — sinon
   l'état vide s'affiche pendant que des données sont présentes.`;

const SYSTEM_TRANSCRIBE = `Tu reçois le rendu texte DÉTERMINISTE et COMPLET d'une spécification AIR existante. Tu transcris par sections : à chaque appel, émets UNIQUEMENT les sections demandées, en JSON strictement conforme au schéma fourni.

RÈGLE ABSOLUE : reproduction à l'IDENTIQUE. Chaque identifiant, chaque valeur, chaque ordre de liste, chaque texte localisé doit être repris VERBATIM depuis le rendu. Les valeurs entre backticks sont des littéraux exacts ; les objets/tableaux JSON inclus dans le rendu sont à recopier tels quels. N'ajoute rien, n'omets rien, ne reformule rien, ne "corrige" rien. Un champ optionnel absent du rendu reste absent du JSON.`;

async function callPart(part, system, userText, label) {
  for (; part.levelIndex < part.levels.length; part.levelIndex++) {
    const level = part.levels[part.levelIndex];
    // D-103 · AVANT L'APPEL — on refuse d'ENGAGER un appel dont le coût
    // MAXIMAL ferait franchir le plafond. Le pire cas est calculé, jamais
    // supposé : sortie bornée par `max_tokens`, entrée bornée par la longueur
    // du prompt. Un garde qui sous-estime ne garde rien.
    budgetUsd.assertPeutAppeler(
      PLAFOND_USD,
      etatDepense,
      budgetUsd.coutMaxAppel(system.length + userText.length, MAX_TOKENS, TARIFS),
      label,
    );
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userText }],
        output_config: { format: { type: "json_schema", schema: level.schema } },
      });
      // TRONCATURE DÉTECTÉE ICI (D-078) — jamais plus confondue avec une erreur
      // de parsing. La campagne a échoué sur son premier domaine avec
      // « Unexpected end of JSON input » : le JSON n'était pas invalide, il
      // était COUPÉ. Nommer la cause au bon endroit évite de chercher un défaut
      // de schéma là où il n'y a qu'un plafond de jetons.
      if (response.stop_reason === "max_tokens") {
        throw new Error(
          `RÉPONSE TRONQUÉE sur "${label}" : plafond de ${String(MAX_TOKENS)} jetons atteint ` +
            `(sortie ${String(response.usage?.output_tokens ?? "?")} jetons).`,
        );
      }
      // D-103 · APRÈS L'APPEL — le coût RÉEL est ajouté immédiatement, puis le
      // plafond est revérifié. Un appel déjà facturé n'est jamais « oublié »
      // jusqu'à la fin de l'intention.
      etatDepense = budgetUsd.ajouter(
        etatDepense,
        budgetUsd.coutUSD(response.usage ?? {}, TARIFS),
      );
      budgetUsd.assertNonDepasse(PLAFOND_USD, etatDepense, label);
      return response;
    } catch (error) {
      const msg = String(error?.message ?? error);
      if (error?.status === 400 && part.levelIndex < part.levels.length - 1) {
        console.log(`  [${label}] niveau "${level.name}" refusé — dégradation : ${msg.slice(0, 140)}`);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`tous les niveaux de schéma refusés pour ${part.name}`);
}

function extractJson(response) {
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const cleaned = text.startsWith("```")
    ? text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")
    : text;
  return JSON.parse(cleaned);
}

// Validation locale fail-closed sur le document COMPLET assemblé.
function validateLocal(document) {
  const parsed = airSchema.projectAirSchema.safeParse(document);
  if (!parsed.success) {
    return {
      air: null,
      diagnostics: parsed.error.issues.map((issue) => ({
        code: "SCHEMA",
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }
  const diagnostics = [
    ...airSchema.validateAir(parsed.data),
    ...registry.validateAirCapabilities(parsed.data),
    ...blocksRegistry.validateAirBlocks(parsed.data),
  ];
  const overrides = parsed.data.design?.overrides;
  if (overrides !== undefined && overrides.length > 0) {
    diagnostics.push({
      code: "OVERRIDES_NON_VIDE",
      path: "design.overrides",
      message: "D-025 : design.overrides doit être absent en corpus-v2",
    });
  }
  return { air: parsed.data, diagnostics };
}

async function emitSections(system, contextText, label, usage, refusals, accumulateur) {
  const assembled = accumulateur ?? {};
  for (const part of PARTS) {
    const user =
      `${contextText}\n\nSECTIONS À ÉMETTRE MAINTENANT : ${part.keys.join(", ")}.` +
      (Object.keys(assembled).length
        ? `\n\nSECTIONS DÉJÀ ÉMISES (à respecter strictement, ne pas réémettre) :\n${JSON.stringify(assembled)}`
        : "");
    let response = await callPart(part, system, user, `${label}:${part.name}`);
    usage.push(response.usage);
    if (response.stop_reason === "refusal") {
      refusals.count++;
      response = await callPart(part, system, user, `${label}:${part.name}#retry`);
      usage.push(response.usage);
      if (response.stop_reason === "refusal") {
        refusals.count++;
        throw new Error(`refus persistant sur ${part.name}`);
      }
    }
    Object.assign(assembled, extractJson(response));
  }
  return assembled;
}

/**
 * D-103 — AUCUN TRAVAIL DÉJÀ PAYÉ N'EST PERDU. Si l'émission s'interrompt en
 * cours — budget épuisé, refus persistant, troncature — les sections déjà
 * obtenues ont été FACTURÉES. Les jeter reviendrait à payer sans conserver la
 * preuve. L'assemblage partiel voyage donc avec l'erreur.
 */
async function emitSectionsAvecPartiel(system, contextText, label, usage, refusals) {
  const partiel = {};
  return preservation.avecPreservation(preservation.CLE_EMISSION, partiel, () =>
    emitSections(system, contextText, label, usage, refusals, partiel),
  );
}

async function repairSections(
  document,
  diagnostics,
  intentionText,
  label,
  usage,
  refusals,
  accumulateur,
) {
  // Réparation BORNÉE (1 passe) et CIBLÉE. D-088 · D1 : les sections réémises
  // sont celles qui PORTENT LE CORRECTIF, plus seulement celle où le défaut
  // s'observe. Mesuré : sur 3 classes de défauts sur 4, la section
  // d'observation ne pouvait pas porter le correctif — la seule issue laissée
  // au modèle était de SUPPRIMER la référence fautive.
  const failing = repairScope.sectionsAReemettre(diagnostics);
  // P9 · LE TRAVAIL DE RÉPARATION VIT DÉSORMAIS HORS DE CETTE PILE. Tant que
  // `repaired` était une variable locale, une erreur technique l'emportait
  // avec elle : les sections déjà réémises — et déjà PAYÉES — disparaissaient.
  const partiel = accumulateur ?? preservation.reparationPartielleVierge(document);
  const repaired = partiel.document;
  for (const part of PARTS.filter((p) => failing.includes(p.name))) {
    // Tous les diagnostics dont CETTE section peut porter le correctif.
    const subset = diagnostics.filter((d) =>
      repairScope.sectionsAReemettre([d]).includes(part.name),
    );
    if (subset.length === 0) continue;
    const user =
      `${intentionText}\n\nDocument complet actuel :\n${JSON.stringify(repaired)}\n\n` +
      `Les validateurs déterministes signalent ces incohérences dans les sections ${part.keys.join(", ")} :\n` +
      `${JSON.stringify(subset, null, 2)}\n\n` +
      `Réémets UNIQUEMENT les sections ${part.keys.join(", ")}, corrigées : corrige ce que les diagnostics signalent, conserve tout le reste à l'identique.\n\n` +
      "INTERDIT — RÉPARER EN SUPPRIMANT. Un nœud que les diagnostics ne nomment " +
      "pas NE PEUT PAS disparaître : ni entité, ni champ, ni écran, ni bloc, ni " +
      "action, ni promesse. Faire taire un diagnostic en retirant ce qu'il " +
      "désigne indirectement est un ÉCHEC, pas une réparation — la suppression " +
      "est détectée et la réparation REJETÉE. Si une exigence te semble " +
      "impossible à tenir, construis-la quand même dans la section qui la porte.";
    let response = await callPart(part, SYSTEM_EMIT, user, `${label}:${part.name}#repair`);
    usage.push(response.usage);
    if (response.stop_reason === "refusal") {
      refusals.count++;
      continue;
    }
    Object.assign(repaired, extractJson(response));
    // La section est réémise ET payée : elle entre dans la preuve AVANT que
    // l'appel suivant ait la moindre occasion d'échouer.
    partiel.sectionsReemises.push(part.name);
  }

  // GARANTIE INTRA-EXÉCUTION (D-088 · D1). Comparer deux GÉNÉRATIONS est mal
  // fondé — le modèle a le droit de remodeler. Comparer l'attempt 1 et
  // l'attempt 2 ne l'est pas : même document, même demande, consigne explicite
  // de tout conserver. Ce qui disparaît sans qu'un diagnostic le nomme est une
  // amputation, et la réparation est REJETÉE — le document d'origine est
  // conservé pour que le défaut reste VISIBLE au lieu d'être maquillé.
  // Deux disparitions, pas une : le nœud RETIRÉ, et le nœud DÉNATURÉ — un champ
  // `asset` retypé en `string` garde son identifiant et perd tout ce qu'il
  // promettait. Les deux rejettent la réparation.
  // TROIS disparitions, pas une. Le nœud RETIRÉ ; le nœud DÉNATURÉ (un champ
  // `asset` retypé) ; et le nœud DÉPLACÉ — un champ passé sous une autre entité
  // garde son identifiant et perd toute obligation d'affichage. L'empreinte
  // sémantique couvre les deux derniers, plus l'inversion de relation, le
  // changement d'effet d'action, la bascule de résolution d'un besoin et la
  // modification de `airSchemaVersion` en cours de réparation.
  const ampute = [
    ...repairScope.amputationsHorsPerimetre(document, repaired, diagnostics),
    ...repairScope
      .mutationsHorsPerimetre(document, repaired, diagnostics)
      .map((m) => `${m.id} (${m.avant} → ${m.apres})`),
  ];
  // D-093 · D8 — LA PREUVE N'EST JAMAIS JETÉE. Lors du rejet précédent, le
  // document RÉPARÉ a été perdu : impossible, après coup, de savoir ce que le
  // modèle avait réellement produit, ni si le rejet était fondé. Il a fallu le
  // reconstituer depuis les signatures du journal. Le document réparé est
  // désormais rendu dans TOUS les cas, retenu ou non.
  return { document: ampute.length > 0 ? document : repaired, repaired, ampute };
}

/**
 * P9 — SYMÉTRIQUE DE `emitSectionsAvecPartiel`, ET POUR LA MÊME RAISON.
 * L'émission était protégée depuis D-103 ; la réparation ne l'était pas. Le
 * `529 Overloaded` de P9 a frappé exactement là : 1,7718 $ payés, sections
 * réparées perdues. Ce qui est payé est conservé, quelle que soit la phase.
 */
async function repairSectionsAvecPartiel(document, diagnostics, intentionText, label, usage, refusals) {
  const partiel = preservation.reparationPartielleVierge(document);
  return preservation.avecPreservation(preservation.CLE_REPARATION, partiel, () =>
    repairSections(document, diagnostics, intentionText, label, usage, refusals, partiel),
  );
}

async function roundTrip(air, slug, usage, refusals) {
  const rendered = airSchema.renderAirToText(air);
  const context = `RENDU TEXTE DE LA SPÉCIFICATION À TRANSCRIRE :\n\n${rendered}`;
  const document = await emitSectionsAvecPartiel(SYSTEM_TRANSCRIBE, context, `${slug}#rt`, usage, refusals);
  const { air: air2, diagnostics } = validateLocal(document);
  if (air2 === null || diagnostics.length > 0) {
    return { ok: false, schemaValid: air2 !== null, diagnosticsCount: diagnostics.length };
  }
  const h1 = airSchema.hashCanonical(air);
  const h2 = airSchema.hashCanonical(air2);
  return { ok: true, identical: h1 === h2, hash1: h1, hash2: h2 };
}

function corpusJson(air) {
  return JSON.stringify(JSON.parse(airSchema.canonicalJson(air)), null, 2) + "\n";
}

const RESULTS_DIR = join(HERE, "results");
// SORTIE EN corpus-v3 (D-078) — la version précédente écrivait dans
// `corpus-v2`, LE CORPUS GELÉ. Elle l'aurait ÉCRASÉ, détruisant du même coup la
// base de comparaison de toutes les mesures historiques (D-025) et le
// avant/après que cette campagne existe pour produire. Le gel n'est pas une
// formalité : c'est ce qui rend un « avant » opposable.
const CORPUS_DIR = join(REPO, "packages/golden-corpus/corpus-v3");
mkdirSync(CORPUS_DIR, { recursive: true });
mkdirSync(RESULTS_DIR, { recursive: true });
mkdirSync(CORPUS_DIR, { recursive: true });
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const JOURNAL = join(RESULTS_DIR, `campagne-v2-${RUN_ID}.jsonl`);

/**
 * P9 · UN ARTEFACT PORTE SA GÉNÉRATION, OU N'EST PAS UNE PREUVE.
 *
 * CAUSE RACINE : les artefacts portaient un nom FIXE, réécrit à chaque
 * campagne. `coach-fitness.attempt2.air.json` produit par P8 a survécu à P9
 * sous un nom que rien ne distinguait d'un artefact de P9 — et une lecture
 * rapide l'a effectivement pris pour tel.
 *
 * Le nom porte maintenant le `RUN_ID`, le même que celui du journal : un
 * artefact se rattache à sa campagne SANS contexte, par son seul nom. Et
 * l'écriture est en `wx` — deux campagnes ne peuvent pas se recouvrir, et un
 * artefact déjà déposé ne peut pas être remplacé en silence.
 */
function ecrireArtefact(slug, phase, contenu) {
  const fichier = preservation.nomArtefact({ slug, runId: RUN_ID, phase });
  writeFileSync(join(RESULTS_DIR, fichier), JSON.stringify(contenu, null, 2) + "\n", {
    flag: "wx",
  });
  return fichier;
}

const start = Number(process.argv[2] ?? 0);
const end = Number(process.argv[3] ?? INTENTIONS.length);

// ── D-103 · LE PLAFOND MORD ENTRE CHAQUE APPEL, PLUS SEULEMENT ENTRE INTENTIONS.
//
// Il était vérifié UNE FOIS, au début de chaque intention, et le coût n'était
// additionné qu'APRÈS l'intention entière. Une intention unique comparait donc
// le plafond à ZÉRO puis courait sans contrôle : P6 a coûté 2,7396 $ pour
// 2,50 $ annoncés, et l'exposition réelle d'un lancement était ~16,80 $.
//
// `BUDGET_USD` est réglable par l'appelant : `BUDGET_USD=3.5 node emit-v3.mjs 2 3`.
// À défaut, le plafond historique de 25 $ (D-025) s'applique.
const PLAFOND_USD = Number(process.env.BUDGET_USD ?? 25);
let etatDepense = budgetUsd.DEPENSE_INITIALE;
const TARIFS = {
  entree: PRIX.in,
  ecritureCache: PRIX.cacheWrite,
  lectureCache: PRIX.cacheRead,
  sortie: PRIX.out,
};
const summary = [];
for (const intention of INTENTIONS.slice(start, end)) {
  if (etatDepense.depense >= PLAFOND_USD) {
    console.log(
      `PLAFOND ${PLAFOND_USD}$ ATTEINT — ARRÊT (D-025). Dépensé: $${etatDepense.depense.toFixed(4)}`,
    );
    break;
  }
  const t0 = Date.now();
  const journal = { runId: RUN_ID, intention: intention.slug, commerce: intention.commerce };
  const usage = [];
  const refusals = { count: 0 };
  try {
    let document = await emitSectionsAvecPartiel(
      SYSTEM_EMIT,
      `DEMANDE DU CLIENT :\n${intention.text}`,
      intention.slug,
      usage,
      refusals,
    );
    let { air, diagnostics } = validateLocal(document);
    journal.diagnosticsPremierePasse = diagnostics.length;
    journal.attempts = 1;

    if (air === null || diagnostics.length > 0) {
      journal.attempts = 2;

      // D-088 · D8 — L'ATTEMPT 1 NE DISPARAÎT PLUS SANS TRACE.
      // La campagne précédente n'a journalisé qu'un NOMBRE de diagnostics :
      // impossible, après coup, de dire si le modèle avait réparé en
      // construisant ou en supprimant. La preuve la plus chère était détruite
      // à l'écriture du journal. Aucun secret n'entre ici : l'AIR est refusé
      // par `AIR_INTEGRATION_SECRET_LIKE_KEY` s'il en portait.
      const fichierAttempt1 = ecrireArtefact(intention.slug, "attempt1", document);
      journal.attempt1 = {
        fichier: fichierAttempt1,
        diagnostics: diagnostics.map((d) => ({ code: d.code, path: d.path })),
        sectionsReemises: repairScope.sectionsAReemettre(diagnostics),
        raisonDuRetry: air === null ? "schema-invalide" : "diagnostics-semantiques",
      };

      const avantReparation = document;
      const resultat = await repairSectionsAvecPartiel(
        document,
        diagnostics,
        `DEMANDE DU CLIENT :\n${intention.text}`,
        intention.slug,
        usage,
        refusals,
      );
      document = resultat.document;
      journal.amputationsRejetees = resultat.ampute;

      // Trois artefacts DISTINCTS et tous conservés, même quand ils diffèrent :
      //   generatedAttempt — ce que le modèle a écrit seul ;
      //   repairedAttempt  — ce qu'il a produit en réparant ;
      //   acceptedDocument — ce que le pipeline a finalement retenu.
      const fichierAttempt2 = ecrireArtefact(intention.slug, "attempt2", resultat.repaired);
      journal.attempt2 = {
        fichier: fichierAttempt2,
        retenu: resultat.ampute.length === 0,
        motifDuRejet: resultat.ampute.length > 0 ? resultat.ampute : undefined,
      };
      journal.artefacts = {
        generatedAttempt: journal.attempt1.fichier,
        repairedAttempt: fichierAttempt2,
        acceptedDocument: resultat.ampute.length === 0 ? fichierAttempt2 : journal.attempt1.fichier,
      };
      if (resultat.ampute.length > 0) {
        // La réparation a été REJETÉE : le document d'origine est conservé et
        // le défaut reste visible. Ne jamais maquiller une amputation en
        // succès — c'est exactement ce que ce chantier ferme.
        console.log(
          `  [${intention.slug}] RÉPARATION REJETÉE — amputation hors périmètre : ${resultat.ampute.join(", ")}`,
        );
      }
      ({ air, diagnostics } = validateLocal(document));
      journal.diagnosticsApresReparation = diagnostics.length;
      journal.diagnosticsRestantsCodes = [...new Set(diagnostics.map((d) => d.code))];
      journal.identiqueAvantApres = avantReparation === document;
    }

    const bilan = budgetUsd.issueGeneration({
      interrompuBudget: false,
      // Ce chemin est celui où AUCUNE erreur n'a été levée : le seul où
      // `terminee` peut être dit sans mentir.
      erreurTechnique: false,
      reparationRejetee: (journal.amputationsRejetees?.length ?? 0) > 0,
      sansDiagnostic: air !== null && diagnostics.length === 0,
    });
    journal.issue = bilan.issue;
    journal.valid = bilan.valid;
    // D-103 — L'EMPREINTE EST CONSIGNÉE MÊME EN ÉCHEC. Elle ne l'était que si
    // le document était valide : une génération rejetée ne laissait donc aucune
    // empreinte du document effectivement retenu, et P5 a dû être reconstituée
    // depuis les signatures du journal. Le hash canonique n'exige pas la
    // validité sémantique, seulement la conformité au schéma.
    if (air !== null) journal.airHash = airSchema.hashCanonical(air);
    if (journal.valid) {
      journal.commerceEmis = air.compliance.commerceClass;
      journal.commerceAttendu = intention.commerce;
      writeFileSync(join(CORPUS_DIR, `${intention.slug}.air.json`), corpusJson(air));
      journal.corpusFile = `${intention.slug}.air.json`;
    } else {
      journal.diagnosticsRestants = diagnostics.slice(0, 12);
    }
  } catch (error) {
    // D-103 · QUATRE ISSUES DISTINCTES, jamais confondues. Un arrêt budgétaire
    // n'est ni un succès ni une erreur technique : c'est un ÉCHEC PROPRE, et
    // `valid` ne peut pas être vrai — le document est partiel.
    //
    // P9 · TOUTE ERREUR NON BUDGÉTAIRE ARRIVÉE ICI EST UN ÉCHEC TECHNIQUE.
    // Elle était classée `terminee` — l'état le plus favorable — parce que le
    // classifieur n'en connaissait pas d'autre. Le `529 Overloaded` de P9 a
    // donc été journalisé comme une génération TERMINÉE.
    const budgetaire = error instanceof budgetUsd.BudgetEpuiseError;
    const technique = !budgetaire;
    journal.erreur = String(error?.message ?? error).slice(0, 400);
    journal.interrompuBudget = budgetaire;
    journal.erreurTechnique = technique;

    // ── CE QUI A ÉTÉ PAYÉ EST CONSERVÉ — LES DEUX PHASES, PAS UNE SEULE.
    const partiel = preservation.partielDeLErreur(error, preservation.CLE_EMISSION);
    if (partiel !== undefined && Object.keys(partiel).length > 0) {
      journal.assemblagePartiel = {
        fichier: ecrireArtefact(intention.slug, "emission-partielle", partiel),
        sectionsObtenues: Object.keys(partiel).sort(),
      };
    }
    // P9 — LA RÉPARATION AUSSI. C'est là que le 529 a frappé, et c'est
    // exactement ce travail-là qui a été perdu.
    const partielReparation = preservation.partielDeLErreur(error, preservation.CLE_REPARATION);
    if (partielReparation !== undefined) {
      journal.reparationPartielle = {
        sectionsReemises: [...partielReparation.sectionsReemises],
        // Zéro section réémise : la panne a frappé avant qu'aucune réparation
        // ne soit produite. Le fait est consigné, aucun artefact n'est inventé.
        fichier: preservation.estExploitable(partielReparation)
          ? ecrireArtefact(intention.slug, "reparation-partielle", partielReparation.document)
          : undefined,
      };
    }

    const { issue, valid } = budgetUsd.issueGeneration({
      interrompuBudget: budgetaire,
      erreurTechnique: technique,
      reparationRejetee: (journal.amputationsRejetees?.length ?? 0) > 0,
      sansDiagnostic: false,
    });
    journal.issue = issue;
    journal.valid = valid;
    const conserves = JSON.stringify({
      ...(journal.artefacts ?? { generatedAttempt: journal.attempt1?.fichier }),
      emissionPartielle: journal.assemblagePartiel?.fichier,
      reparationPartielle: journal.reparationPartielle?.fichier,
    });
    if (budgetaire) {
      console.log(
        `  [${intention.slug}] INTERROMPUE POUR BUDGET — ${error.message}\n` +
          `  artefacts conservés : ${conserves}`,
      );
    } else {
      console.log(
        `  [${intention.slug}] ÉCHEC TECHNIQUE — ${journal.erreur}\n` +
          `  issue=${issue} (JAMAIS « terminee ») · artefacts conservés : ${conserves}`,
      );
    }
  }
  journal.refusals = refusals.count;
  const cost = usage.reduce((s, u) => s + coutUSD(u ?? {}), 0);
  journal.depenseCumulee = Number(etatDepense.depense.toFixed(4));
  journal.appelsAPI = etatDepense.appels;
  journal.coutUSD = Number(cost.toFixed(4));
  journal.dureeMs = Date.now() - t0;
  appendFileSync(JOURNAL, JSON.stringify(journal) + "\n");
  summary.push(journal);
  console.log(
    `[${intention.slug}] valid=${journal.valid} attempts=${journal.attempts ?? "-"} refus=${refusals.count} ` +
      `rt=${journal.roundTrip ? (journal.roundTrip.identical ? "IDENTIQUE" : journal.roundTrip.ok ? "valide-non-identique" : "invalide") : "-"} ` +
      `$${journal.coutUSD} ${Math.round(journal.dureeMs / 1000)}s ${journal.erreur ? "ERREUR: " + journal.erreur : ""}`,
  );
}

const valid = summary.filter((j) => j.valid).length;
const identical = summary.filter((j) => j.roundTrip?.identical).length;
const rtValid = summary.filter((j) => j.roundTrip?.ok).length;
console.log(
  `\nBILAN tranche [${start},${end}) : ${valid}/${summary.length} AIR valides · ` +
    `round-trip conformes ${rtValid}/${valid} · identiques ${identical}/${valid} · ` +
    `coût ~$${etatDepense.depense.toFixed(4)} · ${etatDepense.appels} appels · journal ${JOURNAL}`,
);
