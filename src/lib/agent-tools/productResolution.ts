
/**
 * ETAPE 7 du chantier catalogue canonique -- COMMENT UN OUTIL IA DESIGNE UN
 * PRODUIT SANS JAMAIS INVENTER D'IDENTIFIANT.
 *
 * LE PROBLEME MESURE (N7). Le contexte envoye au modele
 * (`agent/[slug]/chat/route.ts`, bloc CURRENT SITE STATE) est bati depuis la
 * table `sites` SEULE : il ne contient AUCUN produit. Un outil qui prendrait
 * un `product_id` serait donc litteralement ininvocable -- le modele n'a aucun
 * moyen d'en connaitre un, et la seule facon d'en produire un serait de
 * l'halluciner.
 *
 * LES DEUX SOLUTIONS ECARTEES, ET POURQUOI.
 *   * Injecter tout `shop_products` dans le contexte : le cout croit avec le
 *     catalogue, il est paye a CHAQUE tour (y compris "change mon titre"), et
 *     tronquer rendrait certaines cibles invisibles SANS que le modele le
 *     sache -- un echec silencieux, la pire forme d'echec.
 *   * Creer un outil de lecture : `AIAgentChat.hasPendingTools()` bloque toute
 *     nouvelle saisie tant qu'un `tool_use` n'est pas approuve. Le marchand
 *     devrait donc approuver que l'IA REGARDE son propre catalogue.
 *
 * LA SOLUTION RETENUE. Le modele ne designe pas un identifiant : il repete le
 * NOM que le marchand vient lui-meme de prononcer. La resolution nom -> id se
 * fait cote serveur, dans `/apply`, a partir de la liste reellement possedee.
 * Le modele n'a donc rien a savoir, rien a memoriser, et rien a inventer.
 *
 * CE MODULE NE FAIT QUE L'APPARIEMENT. Il ne lit pas la base, ne verifie
 * aucune propriete, n'ecrit rien. Il recoit une liste DEJA restreinte au site
 * du marchand par une route gardee, et rend un verdict. C'est ce qui le rend
 * verifiable d'un seul regard -- et reutilisable tel quel a l'etape 8 pour
 * `set_price`, `set_currency` et `set_for_sale`.
 */

/**
 * ÉTAPE 8, VOLET B — LE MINIMUM STRUCTUREL QUE CE MODULE LIT RÉELLEMENT.
 *
 * Ce type n'était pas paramétré : il exigeait un `ShopProduct` complet alors
 * que l'appariement ne consulte QUE `name`. Le Mode 1 gère son catalogue dans
 * `sites.products` (jsonb : `{name, price, description}`, sans identifiant) —
 * des objets qui ne satisfont pas `ShopProduct` mais que la même règle doit
 * pouvoir résoudre.
 *
 * L'élargissement ne relâche rien : il rend le module HONNÊTE sur ce dont il
 * dépend. Écrire une seconde résolution locale au jsonb aurait dupliqué la
 * règle d'ambiguïté — exactement la divergence entre implémentations que
 * `requireProductOwner` a servi à défaire. Une seule règle, un seul endroit.
 *
 * `product` et `candidates` conservent le type EXACT reçu : un appelant qui
 * passe des `ShopProduct` récupère des `ShopProduct`, avec leur `id`.
 */
export type NamedProduct = { name?: string | null };

export type ProductResolution<T extends NamedProduct = NamedProduct> =
  | { ok: true; product: T }
  | { ok: false; reason: 'not_found'; query: string }
  | { ok: false; reason: 'ambiguous'; query: string; candidates: T[] };

/**
 * Normalisation d'un nom pour l'appariement.
 *
 * `trim` + minuscules, et RIEN D'AUTRE. Pas de suppression d'accents ("cafe"
 * ne doit pas apparier "cafépress"), pas de suppression de ponctuation, pas de
 * repli phonetique : chaque normalisation supplementaire fait CONVERGER des
 * noms distincts, donc augmente le risque d'ecrire sur le mauvais produit.
 *
 * `toLocaleLowerCase()` et non `toLowerCase()` : le repli par defaut de
 * JavaScript est deja correct pour le turc, l'allemand et le grec, la ou
 * `toLowerCase()` traite mal certaines paires.
 */
function normalize(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/**
 * Resout un nom donne par le marchand vers UN produit de sa boutique.
 *
 * EGALITE STRICTE APRES NORMALISATION. Jamais de sous-chaine, jamais de
 * prefixe, jamais d'approximation. Un appariement par sous-chaine parait plus
 * serviable et est en realite dangereux : "Mug" apparierait "Mug Grand" seul
 * si "Mug Petit" n'existe pas encore, et l'ecriture partirait sur un produit
 * que le marchand n'a pas designe -- silencieusement, avec une confirmation
 * qui aurait l'air juste.
 *
 * L'INSENSIBILITE A LA CASSE NE PEUT PAS CAUSER D'ERREUR DE CIBLE. Elle ne
 * fait qu'ELARGIR l'ensemble des candidats ; si cet elargissement en produit
 * deux, la regle d'ambiguite refuse. Le pire cas est donc un refus, jamais une
 * ecriture sur le mauvais produit. (Meme choix que `deactivate_promo_code`,
 * qui apparie les codes promo en `ilike`.)
 *
 * PLUSIEURS RESULTATS = AUCUNE ECRITURE. `shop_products.name` n'a aucune
 * contrainte d'unicite (mesure : PK + FK uniquement). Deux produits homonymes
 * sont donc parfaitement legaux, et "prendre le premier" -- par position, par
 * date, par quoi que ce soit -- reviendrait a choisir a la place du marchand
 * sur une donnee qu'il est le seul a pouvoir departager.
 */
export function resolveProductByName<T extends NamedProduct>(
  products: T[],
  rawName: unknown
): ProductResolution<T> {
  const query = typeof rawName === 'string' ? rawName : '';
  const needle = normalize(query);

  // Un nom vide n'apparie RIEN, meme si un produit portait un nom vide : sans
  // cette garde, `resolveProductByName(products, '')` pourrait devenir une
  // selection accidentelle.
  if (needle === '') return { ok: false, reason: 'not_found', query };

  const matches = products.filter((p) => normalize(p.name ?? '') === needle);

  if (matches.length === 0) return { ok: false, reason: 'not_found', query };
  if (matches.length > 1) return { ok: false, reason: 'ambiguous', query, candidates: matches };
  return { ok: true, product: matches[0] };
}

/**
 * Message rendu au MODELE (jamais au client final) quand la resolution echoue.
 *
 * Il est explicite a dessein : le modele doit pouvoir reformuler sa demande au
 * marchand sans deviner ce qui a echoue. Aucune ecriture n'a eu lieu quand ce
 * message est produit.
 */
export function resolutionMessage(r: Extract<ProductResolution<NamedProduct>, { ok: false }>): string {
  if (r.reason === 'not_found') {
    return `Aucun produit nomme "${r.query}" dans cette boutique. Aucun changement n'a ete fait. Demande au marchand le nom exact tel qu'il apparait dans sa liste de produits.`;
  }
  const names = r.candidates.map((p) => `"${p.name}"`).join(', ');
  return `${r.candidates.length} produits portent le nom "${r.query}" (${names}). Aucun changement n'a ete fait : demande au marchand lequel il vise avant de recommencer.`;
}
