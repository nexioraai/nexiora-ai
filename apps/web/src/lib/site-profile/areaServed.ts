// ============================================================
// CHANTIER 5 (MODE 1) -- `area_served` : DEUX PORTES, DEUX ROLES.
//
// LE CHAMP. Texte geographique libre (« Montréal », « Grand Montréal »,
// « N'Djamena et le Sahel », « الدار البيضاء »). Sa forme libre n'est pas
// une negligence : `geoNuance` (`marketing/generate:38`) la passe en
// minuscules et la confronte a des expressions de noms de lieux pour choisir
// la population representee sur les visuels generes. Une structure rigide
// pays/region detruirait cette semantique.
//
// POURQUOI DEUX FONCTIONS ET NON UNE.
//
//   1. `validateAreaServed` -- PORTE D'ECRITURE. Elle borne ce que l'agent
//      peut faire entrer. Elle REFUSE plutot que de reparer : une valeur
//      silencieusement tronquee ferait croire au marchand qu'il a ecrit ce
//      qu'il a demande.
//
//   2. `sanitizeAreaServedForPrompt` -- PORTE DE PROMPT. Elle NETTOIE, et
//      c'est deliberement l'inverse : elle doit fonctionner sur les valeurs
//      DEJA EN BASE, ecrites avant ce chantier par le generateur, qu'aucune
//      borne n'a jamais filtrees. Refuser la, ce serait faire echouer la
//      generation marketing d'un site existant. Elle est appliquee AU POINT
//      D'ENTREE du prompt -- pas a l'ecriture -- precisement pour couvrir ces
//      valeurs historiques.
//
// CE QU'ELLE PROTEGE, ET CE QU'ELLE NE PROTEGE PAS -- DIT SANS EMBELLIR.
// Elle supprime ce qui permet de RESTRUCTURER un prompt : sauts de ligne
// (une valeur multi-lignes se lit comme de nouvelles consignes), accents
// graves (ouverture d'un bloc de code), accolades (les trois prompts
// concernes se terminent par un gabarit JSON) et chevrons. Elle ne protege
// PAS contre la persuasion en texte plat : « ignore les consignes
// precedentes » ne contient aucun de ces caracteres. Borner et mettre sur
// une seule ligne reduit la surface ; cela ne l'annule pas.
//
// DENYLIST STRUCTURELLE, JAMAIS ALLOWLIST DE CARACTERES. Une allowlist de
// lettres latines effacerait « الدار البيضاء » ou « 東京 » -- or `sites.lang`
// admet l'arabe depuis le chantier 3. On retire ce qui casse la structure,
// on garde tout ce qui nomme un lieu : lettres accentuees, apostrophes
// (« Côte d'Ivoire »), traits d'union (« Rive-Sud »), virgules.
// ============================================================

/**
 * Borne de longueur. Le generateur demande explicitement « Short »
 * (`chat/route.ts:464`, exemples « Montréal », « Grand Montréal ») et toutes
 * les expressions reconnues par `geoNuance` sont des noms de lieux courts.
 * 120 laisse largement place a une enumeration reelle -- « Grand Montréal et
 * la Rive-Sud, incluant Longueuil et Brossard » fait 62 caracteres -- tout en
 * fermant la porte a un paragraphe injecte. Constante unique et testee :
 * la deplacer est un changement d'une ligne.
 */
export const AREA_SERVED_MAX_LENGTH = 120;

/** Caracteres capables de RESTRUCTURER un prompt. Aucun ne nomme un lieu.
 *  U+2028 et U+2029 sont ecrits en sequences d'echappement, JAMAIS en
 *  litteraux : ce sont des terminateurs de ligne JavaScript -- les poser
 *  tels quels casse le parseur avant meme l'execution (mesure ici, et
 *  deja documente dans `JsonLdScript.tsx`). */
const PROMPT_STRUCTURAL = /[\r\n\u2028\u2029\t`{}<>]/g;

export type AreaServedValidation =
  | { ok: true; value: string }
  | { ok: false; message: string };

/**
 * PORTE D'ECRITURE. Le `trim` de bord est conserve -- c'est de la mise en
 * forme, pas du contenu -- mais rien d'autre n'est repare en silence.
 */
export function validateAreaServed(raw: unknown): AreaServedValidation {
  if (typeof raw !== 'string') {
    return { ok: false, message: "La zone desservie doit etre du texte. Aucun changement n'a ete fait." };
  }
  const value = raw.trim();
  if (value === '') {
    return { ok: false, message: "La zone desservie ne peut pas etre vide. Aucun changement n'a ete fait." };
  }
  if (value.length > AREA_SERVED_MAX_LENGTH) {
    return {
      ok: false,
      message: `La zone desservie ne peut pas depasser ${AREA_SERVED_MAX_LENGTH} caracteres (recu : ${value.length}). Aucun changement n'a ete fait : donne une zone courte, comme "Grand Montreal".`,
    };
  }
  if (PROMPT_STRUCTURAL.test(value)) {
    // `test` avec un regex /g garde un `lastIndex` : on le remet a zero,
    // sinon l'appel suivant reprendrait au milieu de la chaine precedente.
    PROMPT_STRUCTURAL.lastIndex = 0;
    return {
      ok: false,
      message: "La zone desservie ne peut contenir ni saut de ligne ni caractere de mise en forme. Aucun changement n'a ete fait : donne un simple nom de ville ou de region.",
    };
  }
  PROMPT_STRUCTURAL.lastIndex = 0;
  return { ok: true, value };
}

/**
 * PORTE DE PROMPT. Tolerante par construction : elle rend TOUJOURS une
 * chaine, y compris `''` pour une valeur absente ou d'un autre type -- les
 * trois interpolations concernees ecrivaient deja `site.area_served || ''`.
 */
export function sanitizeAreaServedForPrompt(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(PROMPT_STRUCTURAL, ' ')
    // Espaces multiples reduits : sans cela, un saut de ligne remplace
    // laisserait un trou visible dans la ligne du prompt.
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, AREA_SERVED_MAX_LENGTH)
    .trim();
}
