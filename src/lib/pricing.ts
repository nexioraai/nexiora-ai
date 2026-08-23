/**
 * Source unique de verite pour le calcul du prix de vente catalogue.
 * Utilise par : themes (affichage), search, image-search, checkout (validation).
 * Toute modification ici s'applique partout - ne jamais dupliquer cette logique.
 */

export const DEFAULT_MARGIN_PERCENT = 100;

/** Commission Nexiora prelevee sur le prix de vente (mode 3 uniquement). */
export const NEXIORA_COMMISSION_PERCENT = 6;

/**
 * Marge minimale pour que le marchand ne vende pas a perte.
 * Le shipping est paye par l'acheteur et reverse au fournisseur : neutre pour le marchand.
 * profit = vente - cout - (vente x commission)
 * Seuil : m/100 = commission x (1 + m/100)  =>  m = 100c / (100 - c)
 */
export const BREAKEVEN_MARGIN_PERCENT =
  (100 * NEXIORA_COMMISSION_PERCENT) / (100 - NEXIORA_COMMISSION_PERCENT);

/**
 * Plancher dur applique au marchand.
 * Au-dessus du point mort (~6.4%) : a ce seuil le profit couvre les remboursements,
 * litiges et colis perdus, qui n'entrent pas dans le calcul du point mort.
 */
export const MIN_MARGIN_PERCENT = 15;

/**
 * Prix de vente plancher, en devise. Sur un produit a tres bas cout, une marge
 * en pourcentage ne couvre pas le fixe Stripe (~0,30 par transaction) : un
 * article a 0,50 fait perdre de l'argent au marchand a chaque vente. Ce plancher
 * garantit un profit net positif quel que soit le cout, et protege la
 * credibilite de la boutique (pas d'articles a quelques centimes).
 * S'applique au prix calcule ET au prix fixe manuellement.
 */
export const MIN_SELL_PRICE = 4.99;

/** En dessous de ce seuil, la marge est viable mais fragile : alerte sans blocage. */
export const LOW_MARGIN_PERCENT = 30;

/**
 * Arrondi monetaire au centime -- convention UNIQUE du depot, deja appliquee
 * implicitement ici (merchantProfit, calcSellPrice) et dans
 * shop/shipping/calculate. Nommee ici plutot que re-ecrite a chaque site de
 * calcul, pour que "montant monetaire" et "arrondi au centime" soient une
 * seule et meme decision.
 *
 * LOT 1 -- cause racine : checkout/route.ts calculait `nexiora_commission`,
 * `supplier_cost` et `merchant_profit` SANS cet arrondi, puis les ecrivait
 * tels quels dans shop_orders. Deux consequences distinctes, souvent
 * confondues :
 *   1. DERIVE IEEE754 -- `30 * (6/100)` vaut 1.7999999999999998, pas 1.8.
 *      La valeur derivee etait persistee et contaminait toute agregation
 *      comptable en aval (admin/stats, finances).
 *   2. VALEUR SOUS-LE-CENTIME -- `59.97 * 0.06` vaut 3.5982, qui n'est PAS
 *      un nombre entier de centimes. Stripe, lui, ne peut facturer qu'en
 *      centimes entiers (`Math.round(fee * 100)`) : la base enregistrait
 *      donc un montant que le systeme de paiement ne pouvait pas prelever.
 * Arrondir a la source aligne la base sur ce qui est REELLEMENT charge.
 *
 * Ne remplace PAS l'arrondi de la frontiere Stripe (`Math.round(x * 100)`,
 * centimes entiers) : les deux sont complementaires, pas redondants.
 */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Profit marchand pour un cout fournisseur et une marge donnes (hors shipping). */
export function merchantProfit(costPrice: number, marginPercent: number, roundMode: string): number {
  const sell = calcSellPrice(costPrice, marginPercent, roundMode);
  const commission = sell * (NEXIORA_COMMISSION_PERCENT / 100);
  return roundMoney(sell - costPrice - commission);
}
export const DEFAULT_ROUND_MODE = 'off';

export function apply99(price: number, mode: string): number {
  const floorInt = Math.floor(price);
  const lower = floorInt - 1 + 0.99;
  const upper = floorInt + 0.99;
  if (mode === 'up') return upper;
  if (mode === 'down') return lower < 0 ? upper : lower;
  return price;
}

export function calcSellPrice(costPrice: number, marginPercent: number, roundMode: string): number {
  const marked = roundMoney(costPrice * (1 + marginPercent / 100));
  const rounded = apply99(marked, roundMode);
  return Math.max(rounded, MIN_SELL_PRICE);
}

/**
 * Prix affiche pour un produit du catalogue.
 * Regle unique : un prix saisi manuellement (sell_price) prime toujours.
 * Sinon le prix est calcule depuis le cout fournisseur et la marge du site.
 * Utilise par la boutique et la recherche : ne jamais dupliquer cette logique.
 */
export function resolveDisplayPrice(
  costPrice: number,
  overridePrice: number | string | null | undefined,
  marginPercent: number,
  roundMode: string
): number {
  const override = overridePrice != null && overridePrice !== '' ? Number(overridePrice) : NaN;
  // Le plancher s'applique aussi au prix manuel : le marchand ne peut pas se
  // saborder en fixant un prix sous le seuil de rentabilite.
  if (!Number.isNaN(override) && override > 0) return Math.max(override, MIN_SELL_PRICE);
  if (costPrice > 0) return calcSellPrice(costPrice, marginPercent, roundMode);
  return 0;
}

/** Lit marge et arrondi depuis une ligne `sites`, avec les defauts unifies. */
export function sitePricing(site: { cj_margin_percent?: number | null; cj_round_mode?: string | null }) {
  return {
    margin: site.cj_margin_percent ?? DEFAULT_MARGIN_PERCENT,
    roundMode: site.cj_round_mode || DEFAULT_ROUND_MODE,
  };
}
