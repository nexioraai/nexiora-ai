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
