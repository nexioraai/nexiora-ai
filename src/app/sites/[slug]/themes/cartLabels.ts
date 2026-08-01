// Labels panier (B0.4) — isolés du fichier i18n principal.
// 5 langues : FR (défaut), EN, ES, AR, + repli EN.

export type CartLabels = {
  addToCart: string;
  cartTitle: string;
  empty: string;
  total: string;
  checkout: string;
  continue: string;
  promoPlaceholder: string;
  promoInvalid: string;
  promoError: string;
};

const DICT: Record<string, CartLabels> = {
  fr: {
    addToCart: 'Ajouter au panier',
    cartTitle: 'Panier',
    empty: 'Votre panier est vide',
    total: 'Total',
    checkout: 'Passer la commande',
    continue: 'Continuer mes achats',
    promoPlaceholder: 'Code promo',
    promoInvalid: 'Code invalide',
    promoError: 'Erreur',
  },
  en: {
    addToCart: 'Add to cart',
    cartTitle: 'Cart',
    empty: 'Your cart is empty',
    total: 'Total',
    checkout: 'Checkout',
    continue: 'Continue shopping',
    promoPlaceholder: 'Promo code',
    promoInvalid: 'Invalid code',
    promoError: 'Error',
  },
  es: {
    addToCart: 'Añadir al carrito',
    cartTitle: 'Carrito',
    empty: 'Tu carrito está vacío',
    total: 'Total',
    checkout: 'Finalizar compra',
    continue: 'Seguir comprando',
    promoPlaceholder: 'Código promocional',
    promoInvalid: 'Código no válido',
    promoError: 'Error',
  },
  ar: {
    addToCart: 'أضف إلى السلة',
    cartTitle: 'السلة',
    empty: 'سلتك فارغة',
    total: 'المجموع',
    checkout: 'إتمام الطلب',
    continue: 'متابعة التسوق',
    promoPlaceholder: 'رمز الخصم',
    promoInvalid: 'رمز غير صالح',
    promoError: 'خطأ',
  },
};

export function getCartLabels(lang?: string): CartLabels {
  return DICT[lang ?? 'fr'] ?? DICT.en;
}
