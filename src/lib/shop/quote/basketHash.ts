import 'server-only';

// ============================================================
// EMPREINTE D'UN PANIER FOURNISSEUR.
//
// Sert de cle de cache pour le devis CJ du panier REEL
// (`shipping_quote_cache.basket_hash`).
//
// POURQUOI CETTE CLE EXISTE -- mesure du 2026-08-22, 203 options CJ, pays CA :
//   * le tarif CJ est fortement DEGRESSIF : le ratio prix(q) / (q x prix(1))
//     descend jusqu'a 0,15. Extrapoler un tarif unitaire surfacture donc
//     l'acheteur des DEUX unites ;
//   * un devis PANIER coute 25 a 50 % de moins que la somme des devis
//     unitaires des memes produits.
// L'unite de mise en cache passe du PRODUIT au PANIER : c'est cette empreinte
// qui l'identifie.
//
// L'ORDRE DES LIGNES N'EST PAS SIGNIFICATIF ICI, et c'est une difference
// VOULUE avec `checkoutSignature.buildQuoteHash`, ou il l'est. Les deux
// repondent a deux questions distinctes :
//   buildQuoteHash    "est-ce le meme DEVIS ?" -- `line_items` est un tableau
//                     ordonne cote Stripe : deux ordres produisent deux
//                     requetes differentes.
//   buildBasketHash   "CJ facturerait-il la meme chose ?" -- CJ tarifie un
//                     ensemble de (vid, quantite). Presenter deux fois le meme
//                     ensemble dans un ordre different ne peut pas changer son
//                     prix. Trier est donc ici la seule modelisation fidele ;
//                     ne pas le faire multiplierait les entrees de cache et
//                     donc les appels CJ, sans rien distinguer de reel.
//
// Le hachage est duplique depuis `checkoutSignature.ts` (une dizaine de
// lignes) plutot qu'importe : ce fichier est gele, et y exporter un helper
// serait le modifier hors perimetre. La duplication est assumee et locale.
// ============================================================

/** FNV-1a 32 bits. Deux graines distinctes -> 64 bits effectifs. */
function fnv1a(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export type BasketLine = { supplier_product_id: string; quantity: number };

/**
 * Empreinte stable d'un panier fournisseur.
 *
 * Les lignes sont AGREGEES par identifiant avant tri : deux lignes portant le
 * meme `supplier_product_id` designent le meme produit commande deux fois, et
 * CJ le facturera comme une quantite cumulee. Les traiter separement
 * produirait deux empreintes pour un panier que CJ tarife identiquement.
 *
 * Une quantite non finie ou <= 0 ecarte la ligne : elle ne peut pas etre
 * envoyee a CJ, et la laisser entrer dans l'empreinte creerait une cle pour
 * un panier qui ne sera jamais cote.
 *
 * La longueur canonique entre dans l'empreinte : deux paniers de longueurs
 * canoniques differentes ne peuvent pas collisionner sur les seuls 64 bits.
 */
export function buildBasketHash(lines: BasketLine[]): string {
  const byId = new Map<string, number>();
  for (const l of lines) {
    const id = String(l?.supplier_product_id ?? '').trim();
    const q = Number(l?.quantity);
    if (!id || !Number.isFinite(q) || q <= 0) continue;
    byId.set(id, (byId.get(id) ?? 0) + q);
  }

  const canonical = [...byId.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([id, q]) => `${id}:${q}`)
    .join('|');

  const a = fnv1a(canonical, 0x811c9dc5).toString(16).padStart(8, '0');
  const b = fnv1a(canonical, 0x9e3779b1).toString(16).padStart(8, '0');
  return `b_v1_${canonical.length.toString(36)}_${a}${b}`;
}
