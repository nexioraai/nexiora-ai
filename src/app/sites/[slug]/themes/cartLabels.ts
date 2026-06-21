// Labels panier (B0.4) — isolés du fichier i18n principal.
// 5 langues : FR (défaut), EN, ES, AR, + repli EN.

export type CartLabels = {
  addToCart: string;
  cartTitle: string;
  empty: string;
  total: string;
  checkout: string;
  continue: string;
};

const DICT: Record<string, CartLabels> = {
  fr: {
    addToCart: 'Ajouter au panier',
    cartTitle: 'Panier',
    empty: 'Votre panier est vide',
    total: 'Total',
    checkout: 'Passer la commande',
    continue: 'Continuer mes achats',
  },
  en: {
    addToCart: 'Add to cart',
    cartTitle: 'Cart',
    empty: 'Your cart is empty',
    total: 'Total',
    checkout: 'Checkout',
    continue: 'Continue shopping',
  },
  es: {
    addToCart: 'Añadir al carrito',
    cartTitle: 'Carrito',
    empty: 'Tu carrito está vacío',
    total: 'Total',
    checkout: 'Finalizar compra',
    continue: 'Seguir comprando',
  },
  ar: {
    addToCart: 'أضف إلى السلة',
    cartTitle: 'السلة',
    empty: 'سلتك فارغة',
    total: 'المجموع',
    checkout: 'إتمام الطلب',
    continue: 'متابعة التسوق',
  },
};

export function getCartLabels(lang?: string): CartLabels {
  return DICT[lang ?? 'fr'] ?? DICT.en;
}
