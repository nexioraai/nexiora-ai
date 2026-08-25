// src/lib/agent-tools/galleryResolution.ts
//
// DETTE 4 (volet gallery) — COMMENT L'IA DÉSIGNE UNE IMAGE SANS INVENTER
// D'INDEX.
//
// LE DÉFAUT MESURÉ. `propose_gallery_remove` adressait par INDEX de tableau,
// alors que `gallery` est ABSENT des 16 champs de CURRENT SITE STATE. Le
// modèle ne pouvait donc que DEVINER, et `/apply` n'opposait qu'un contrôle
// d'intervalle : une devinette dans les bornes supprimait la mauvaise image.
// La carte d'approbation affichait « Remove gallery image #2 » — un numéro
// nu — là où l'éditeur (Navbar) montre l'image elle-même.
//
// POURQUOI CE MODULE N'EST PAS `productResolution.ts`.
// Ce n'est pas une duplication par confort : la NORMALISATION diffère, et
// pour une raison mesurable. `resolveProductByName` passe en minuscules —
// correct pour un nom de produit tapé par un humain, DANGEREUX pour une URL.
// Une demande de `/A.jpg` sur une galerie contenant `/a.jpg` y trouverait UN
// appariement et supprimerait une image que le marchand n'a pas désignée.
// Une URL se compare exactement, ou pas du tout.
//
// CE QUI EST PARTAGÉ, EN REVANCHE, C'EST LA DISCIPLINE : égalité stricte,
// jamais de sous-chaîne, et REFUS sur toute ambiguïté. Aucune écriture ne
// peut résulter d'un doute.

/**
 * Extrait l'URL adressable d'un élément de galerie.
 *
 * DEUX FORMES ADMISES, et c'est un constat, pas une souplesse gratuite :
 *   * `string`        — la forme réelle en production (`chat/route.ts` écrase
 *                       systématiquement `parsed.gallery` par le résultat de
 *                       `fetchPexelsImages()`).
 *   * `{ url: string }` — le schéma Zod l'autorise (`z.array(z.any())`),
 *                       `Navbar.tsx:601` la reconnaît déjà, et
 *                       `gallerySchema.test.ts` documente un INCIDENT RÉEL où
 *                       le modèle a produit des objets.
 *
 * Toute autre forme rend `null` : NON ADRESSABLE. On ne devine pas une URL
 * dans un objet dont on ne connaît pas la convention — la deviner reviendrait
 * à choisir une cible au hasard.
 */
export function galleryUrlOf(entry: unknown): string | null {
  if (typeof entry === 'string') {
    const url = entry.trim()
    return url === '' ? null : url
  }
  if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
    const brut = (entry as { url?: unknown }).url
    if (typeof brut === 'string') {
      const url = brut.trim()
      return url === '' ? null : url
    }
  }
  return null
}

export type GalleryResolution =
  | { ok: true; index: number }
  | { ok: false; reason: 'not_found'; query: string }
  | { ok: false; reason: 'ambiguous'; query: string; count: number }

/**
 * Résout une URL vers LA position d'une image dans `sites.gallery`.
 *
 * ÉGALITÉ STRICTE APRÈS `trim` — et rien d'autre. Pas de minuscules (les
 * chemins d'URL y sont sensibles), pas de sous-chaîne, pas d'approximation.
 *
 * PLUSIEURS OCCURRENCES = AUCUNE ÉCRITURE. Rien n'empêche la même image
 * d'apparaître deux fois dans une galerie. « Prendre la première » — par
 * position, par forme, par quoi que ce soit — reviendrait à choisir à la
 * place du marchand sur une donnée qu'il est seul à pouvoir départager.
 *
 * Rend l'INDEX, pas l'élément : le tableau se réécrit par position, et les
 * éléments peuvent être des primitives (deux chaînes identiques ne sont pas
 * distinguables par référence).
 */
export function resolveGalleryImage(gallery: unknown, rawUrl: unknown): GalleryResolution {
  const query = typeof rawUrl === 'string' ? rawUrl.trim() : ''

  // Une URL vide n'apparie RIEN, même si la galerie contenait une entrée
  // vide : sans cette garde, une requête vide deviendrait une sélection
  // accidentelle.
  if (query === '') return { ok: false, reason: 'not_found', query }

  const entries = Array.isArray(gallery) ? gallery : []
  const positions: number[] = []
  entries.forEach((entry, i) => {
    if (galleryUrlOf(entry) === query) positions.push(i)
  })

  if (positions.length === 0) return { ok: false, reason: 'not_found', query }
  if (positions.length > 1) return { ok: false, reason: 'ambiguous', query, count: positions.length }
  return { ok: true, index: positions[0] }
}

/**
 * Message rendu au MODÈLE (jamais au visiteur) quand la résolution échoue.
 *
 * Explicite à dessein : le modèle doit pouvoir reformuler sa demande sans
 * deviner ce qui a échoué. Aucune écriture n'a eu lieu quand ce message est
 * produit.
 */
export function galleryResolutionMessage(r: Extract<GalleryResolution, { ok: false }>): string {
  if (r.reason === 'not_found') {
    return `Aucune image de galerie ne porte l'URL "${r.query}". Aucun changement n'a ete fait. Demande au marchand l'URL exacte, telle qu'elle apparait dans sa galerie.`
  }
  return `${r.count} images de la galerie portent la meme URL "${r.query}". Aucun changement n'a ete fait : demande au marchand laquelle il vise avant de recommencer.`
}

// ============================================================
// CHANTIER 7 (MODE 1) -- CE QU'UNE IMAGE AJOUTEE DOIT ETRE.
//
// LA MESURE QUI COMMANDE TOUT. Les QUATRE themes filtrent leur galerie de
// la meme facon avant de rendre quoi que ce soit :
//     (site.gallery || []).filter(u => typeof u === 'string'
//                                   && u.length > 0
//                                   && u.startsWith('http'))
// (`VifTheme:32`, `NoirTheme:169`, `EditorialTheme:74`, `AuroraTheme:37`).
//
// Consequence directe : une entree qui n'est pas une CHAINE en `http` est
// ecrite, stockee, et rendue par AUCUN theme. L'agent repondrait « c'est
// fait », la base changerait, la page non. C'est exactement la classe de
// defaut corrigee au chantier 1 pour `services` -- une ecriture qui reussit
// sans que rien ne bouge. On refuse donc a l'ECRITURE ce qu'aucun theme ne
// saurait afficher, plutot que de le decouvrir en production.
//
// POURQUOI CETTE PORTE EST PLUS STRICTE QUE `galleryUrlOf`. Ce dernier
// tolere `{ url }` parce qu'il LIT une donnee historique dont il ne
// choisit pas la forme. Ici on ECRIT : la forme est la notre, et c'est la
// seule que les themes rendent. Meme asymetrie deliberee qu'aux chantiers 3
// et 5 -- porte d'ecriture stricte, porte de lecture tolerante.
//
// ALLOWLIST DE SCHEMES, jamais `startsWith`. `'javascript:alert(1)'` et
// `'data:text/html,...'` seraient refuses par les themes, mais s'appuyer sur
// ce filtrage-la reviendrait a faire d'un detail de rendu une protection.
// `new URL()` donne le schema reel, et seuls deux sont admis.
// ============================================================

const GALLERY_URL_SCHEMES = new Set<unknown>(['http:', 'https:']);

export type GalleryUrlValidation =
  | { ok: true; value: string }
  | { ok: false; message: string };

export function validateGalleryUrl(raw: unknown): GalleryUrlValidation {
  if (typeof raw !== 'string') {
    return {
      ok: false,
      message: "L'adresse de l'image doit etre du texte. Aucun changement n'a ete fait : demande au marchand l'URL exacte de son image.",
    };
  }
  const value = raw.trim();
  if (value === '') {
    return {
      ok: false,
      message: "L'adresse de l'image ne peut pas etre vide. Aucun changement n'a ete fait.",
    };
  }
  let scheme: string;
  try {
    scheme = new URL(value).protocol;
  } catch {
    return {
      ok: false,
      message: `"${value}" n'est pas une adresse d'image valide. Aucun changement n'a ete fait : il faut une URL complete commencant par https://`,
    };
  }
  if (!GALLERY_URL_SCHEMES.has(scheme)) {
    return {
      ok: false,
      message: `"${value}" n'est pas une adresse d'image utilisable (seules les adresses http:// et https:// le sont). Aucun changement n'a ete fait.`,
    };
  }
  return { ok: true, value };
}
