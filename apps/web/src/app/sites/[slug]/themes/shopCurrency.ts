// ============================================================
// M2-04 -- LA DEVISE D'UNE BOUTIQUE, OU RIEN.
//
// LE DEFAUT CORRIGE. `PromoBanner` ecrivait `$` EN DUR : `-20$`,
// `(min. 50$)`. Une boutique Mode 2 en EUR annoncait donc publiquement
// « min. 50$ » -- faux sur un montant, pas seulement mal traduit. Le panier,
// lui, affiche la vraie devise (`CartDrawer` la tient de `useCart()`).
//
// POURQUOI LA BANNIERE NE POUVAIT PAS S'EN SORTIR SEULE. Elle est montee
// HORS de `CartShell`, donc hors de `CartProvider` : `useCart()` lui est
// inaccessible. Et meme accessible, il ne servirait a rien -- la banniere
// s'affiche AVANT tout ajout, or `CartContext` derive la devise du PREMIER
// ARTICLE du panier (`items[0]?.currency ?? 'CAD'`). Un panier vide n'en a
// aucune.
//
// D'OU CETTE RESOLUTION, ET SA REGLE : les produits du site font foi.
//
// FAIL-SOFT, JAMAIS FAIL-INVENT. Il n'existe AUCUNE colonne de devise au
// niveau du site : chaque ligne de `shop_products` porte la sienne. Rien
// n'interdit donc structurellement qu'elles divergent -- le checkout le
// refuse au panier (`i.currency !== resolvedCurrency` -> 409 « Panier
// incoherent »), mais ce refus est en aval, pas une garantie en amont.
// Quand la devise n'est pas UNANIME, cette fonction rend `undefined`, et
// l'appelant affiche le montant NU plutot qu'une devise fausse. Annoncer
// « 50 » est imprecis ; annoncer « 50$ » a une boutique en euros est FAUX.
//
// Aucune dependance : ce module est pur, et n'a donc besoin d'aucun mock.
// ============================================================

/** Le strict minimum lu -- ni un site complet, ni une ligne de base. */
export type ProduitAvecDevise = { currency?: string | null };

/**
 * La devise commune aux produits d'une boutique, ou `undefined` si elle
 * n'est pas etablissable : aucun produit, aucune devise renseignee, ou
 * plusieurs devises differentes.
 */
export function resolveShopCurrency(
  products: readonly ProduitAvecDevise[] | null | undefined
): string | undefined {
  if (!Array.isArray(products) || products.length === 0) return undefined;
  const devises = new Set<string>();
  for (const p of products) {
    const c = typeof p?.currency === 'string' ? p.currency.trim().toUpperCase() : '';
    if (c === '') continue;
    devises.add(c);
    // Deux devises suffisent a rendre la question sans reponse : inutile de
    // parcourir le reste, et surtout inutile de choisir.
    if (devises.size > 1) return undefined;
  }
  return devises.size === 1 ? [...devises][0] : undefined;
}
