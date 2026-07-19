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

/** En dessous de ce seuil, la marge est viable mais fragile : alerte sans blocage. */
export const LOW_MARGIN_PERCENT = 30;

/** Profit marchand pour un cout fournisseur et une marge donnes (hors shipping). */
export function merchantProfit(costPrice: number, marginPercent: number, roundMode: string): number {
  const sell = calcSellPrice(costPrice, marginPercent, roundMode);
  const commission = sell * (NEXIORA_COMMISSION_PERCENT / 100);
  return Math.round((sell - costPrice - commission) * 100) / 100;
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
  const marked = Math.round(costPrice * (1 + marginPercent / 100) * 100) / 100;
  return apply99(marked, roundMode);
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
  if (!Number.isNaN(override) && override > 0) return override;
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
