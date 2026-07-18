/**
 * Source unique de verite pour le calcul du prix de vente catalogue.
 * Utilise par : themes (affichage), search, image-search, checkout (validation).
 * Toute modification ici s'applique partout - ne jamais dupliquer cette logique.
 */

export const DEFAULT_MARGIN_PERCENT = 100;
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

/** Lit marge et arrondi depuis une ligne `sites`, avec les defauts unifies. */
export function sitePricing(site: { cj_margin_percent?: number | null; cj_round_mode?: string | null }) {
  return {
    margin: site.cj_margin_percent ?? DEFAULT_MARGIN_PERCENT,
    roundMode: site.cj_round_mode || DEFAULT_ROUND_MODE,
  };
}
