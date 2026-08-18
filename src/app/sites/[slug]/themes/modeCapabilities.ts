// src/app/sites/[slug]/themes/modeCapabilities.ts
//
// Traduit le numero de mode (donnee brute sur `sites.mode`) en capacites
// explicites que le reste du systeme doit consulter -- plus jamais de
// `mode !== 1 && (...)` recopie independamment a plusieurs endroits.
// Cette duplication existait deja et avait produit une vraie divergence :
// le calcul de ctaHref dans EditorialTheme.tsx oubliait le cas mode===1,
// contrairement a celui de VifTheme.tsx, pour une expression censee etre
// identique. Ce module devient la source unique de verite.

export type ModeCapabilitiesInput = {
  mode?: number | null;
  products?: unknown[] | null;
};

export type ModeCapabilities = {
  /**
   * Vrai si ce site doit afficher une section Shop et disposer d'un panier
   * (CartShell). Mode 1 (vitrine) : jamais, par definition du produit.
   * Mode 3 (dropshipping) : toujours, meme avant le premier produit charge.
   * Mode 2 (boutique) : seulement s'il possede reellement au moins un
   * produit -- un panier vide sans rien a y mettre n'a pas de raison d'etre
   * monte.
   */
  hasShop: boolean;
};

export function getModeCapabilities(site: ModeCapabilitiesInput): ModeCapabilities {
  const mode = site.mode || 1;
  const hasProducts = Array.isArray(site.products) && site.products.length > 0;
  const hasShop = mode !== 1 && (hasProducts || mode === 3);
  return { hasShop };
}
