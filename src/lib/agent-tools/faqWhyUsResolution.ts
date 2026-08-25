// ============================================================
// CHANTIER 4 (MODE 1) -- ADRESSAGE ET VALIDATION DE `faq` ET `whyus`.
//
// CE QUE CE MODULE N'EST PAS. Ce n'est pas un mecanisme generique d'edition
// de tableaux. `faq` et `whyus` sont DEUX entites concretes, aux deux seules
// formes que le generateur produit et que les quatre themes rendent :
//   faq   = { question, answer }[]
//   whyus = { title, text }[]
// Chacune a sa fonction, nommee, avec son message d'erreur : un resolveur
// parametre par un nom de champ deplacerait l'allowlist du code vers le
// modele -- le raisonnement deja tenu pour `set_price` / `set_currency` /
// `set_for_sale`, qui sont trois outils et non un `set_product_field`.
//
// ADRESSAGE PAR CONTENU, JAMAIS PAR INDEX. C'est la discipline de la dette 4
// et du chantier 1 : `propose_testimonial_remove` adresse encore par index,
// et une devinette dans les bornes supprime le mauvais temoignage sans
// erreur. On n'ouvre pas une quatrieme liste sur ce modele.
//
// NORMALISATION : `trim` + minuscules -- comme les titres de sections
// (`sectionItemResolution`), et a la difference des URLs de galerie, dont la
// casse est signifiante. Une question posee « MOQ? » et rappelee « moq? »
// designe la meme entree.
//
// PLUSIEURS OCCURRENCES = AUCUNE ECRITURE. Rien n'interdit deux questions
// identiques en base. « Prendre la premiere » choisirait a la place du
// marchand sur une donnee que lui seul peut departager.
// ============================================================

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export type ListResolution =
  | { ok: true; index: number }
  | { ok: false; reason: 'not_found'; query: string }
  | { ok: false; reason: 'ambiguous'; query: string; count: number };

/** Lit la cle d'adressage d'une entree, ou `null` si l'entree est inadressable. */
function keyOf(entry: unknown, key: string): string | null {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const brut = (entry as Record<string, unknown>)[key];
  if (typeof brut !== 'string') return null;
  const v = brut.trim();
  return v === '' ? null : v;
}

function resolveBy(list: unknown, key: string, raw: unknown): ListResolution {
  const query = typeof raw === 'string' ? raw.trim() : '';
  // Une requete vide n'apparie RIEN, meme si une entree vide existait.
  //
  // REDONDANCE MESUREE, ET CONSERVEE SCIEMMENT. La campagne de mutation du
  // chantier 4 a retire cette ligne : la suite est restee VERTE. C'est un
  // mutant EQUIVALENT, pas un trou de test -- `keyOf` rend deja `null` pour
  // toute cle vide ou blanche, donc aucune entree ne peut porter la cle ''.
  // La garde est gardee parce qu'elle rend l'intention lisible et qu'elle
  // survivrait a un assouplissement de `keyOf` ; elle est signalee ici pour
  // qu'on ne la prenne pas pour une protection active.
  if (query === '') return { ok: false, reason: 'not_found', query };

  const entries = Array.isArray(list) ? list : [];
  const cible = normalize(query);
  const positions: number[] = [];
  entries.forEach((entry, i) => {
    const k = keyOf(entry, key);
    if (k !== null && normalize(k) === cible) positions.push(i);
  });

  if (positions.length === 0) return { ok: false, reason: 'not_found', query };
  if (positions.length > 1) return { ok: false, reason: 'ambiguous', query, count: positions.length };
  return { ok: true, index: positions[0] };
}

/** Resout une question vers SA position dans `sites.faq`. */
export function resolveFaqEntry(faq: unknown, rawQuestion: unknown): ListResolution {
  return resolveBy(faq, 'question', rawQuestion);
}

/** Resout un titre vers SA position dans `sites.whyus`. */
export function resolveWhyUsEntry(whyus: unknown, rawTitle: unknown): ListResolution {
  return resolveBy(whyus, 'title', rawTitle);
}

/** Message rendu au MODELE (jamais au visiteur). Aucune ecriture n'a eu lieu. */
export function faqResolutionMessage(r: Extract<ListResolution, { ok: false }>): string {
  if (r.reason === 'not_found') {
    return `Aucune question de la FAQ ne correspond a "${r.query}". Aucun changement n'a ete fait. Demande au marchand la question exacte, telle qu'elle apparait sur son site.`;
  }
  return `${r.count} questions de la FAQ portent le meme libelle "${r.query}". Aucun changement n'a ete fait : demande au marchand laquelle il vise avant de recommencer.`;
}

export function whyUsResolutionMessage(r: Extract<ListResolution, { ok: false }>): string {
  if (r.reason === 'not_found') {
    return `Aucun argument "Pourquoi nous" ne porte le titre "${r.query}". Aucun changement n'a ete fait. Demande au marchand le titre exact, tel qu'il apparait sur son site.`;
  }
  return `${r.count} arguments "Pourquoi nous" portent le meme titre "${r.query}". Aucun changement n'a ete fait : demande au marchand lequel il vise avant de recommencer.`;
}

// ---- Validation des valeurs ECRITES ----
//
// LA REGLE, ET SA LIMITE ASSUMEE. On refuse ce qui CASSE le rendu ou le
// JSON-LD : une non-chaine (les themes passent `item.question` en enfant
// React, un objet y leve), et une chaine vide ou blanche (elle produirait une
// entree invisible mais inadressable -- donc ineffacable par l'agent).
//
// ON N'IMPOSE AUCUNE BORNE DE LONGUEUR, et c'est deliberé : l'editeur
// (`Navbar.tsx:619`) accepte n'importe quelle longueur. Un plafond pose ici
// seul ferait refuser a l'agent ce que le marchand vient d'ecrire a la main.
//
// ON N'ECHAPPE RIEN ICI NON PLUS. Le seul contexte dangereux est le JSON-LD,
// et `JsonLdScript` en est le point d'entree unique et deja verrouille (M1-01).
// Ajouter un second echappement en amont produirait du texte double-echappe
// dans le rendu HTML, ou personne n'en a besoin : React echappe deja.

export type EntryValidation = { ok: true; value: string } | { ok: false; message: string };

export function validateEntryText(raw: unknown, champ: string): EntryValidation {
  if (typeof raw !== 'string') {
    return { ok: false, message: `Le champ "${champ}" doit etre du texte. Aucun changement n'a ete fait.` };
  }
  const value = raw.trim();
  if (value === '') {
    return { ok: false, message: `Le champ "${champ}" ne peut pas etre vide. Aucun changement n'a ete fait.` };
  }
  return { ok: true, value };
}
