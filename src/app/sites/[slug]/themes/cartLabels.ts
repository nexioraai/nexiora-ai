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
  promoExpired: string;
  promoDepleted: string;
  promoMinOrder: string;
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
    promoExpired: 'Code expiré',
    promoDepleted: 'Code épuisé',
    promoMinOrder: 'Minimum {min} requis',
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
    promoExpired: 'Code expired',
    promoDepleted: 'Code used up',
    promoMinOrder: 'Minimum {min} required',
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
    promoExpired: 'Código caducado',
    promoDepleted: 'Código agotado',
    promoMinOrder: 'Mínimo {min} requerido',
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
    promoExpired: 'انتهت صلاحية الرمز',
    promoDepleted: 'استُنفد الرمز',
    promoMinOrder: 'الحد الأدنى {min}',
  },
};

/** Expose pour le cliquet : ce dictionnaire ne doit couvrir que le contrat. */
export const CART_LABEL_CODES: readonly string[] = Object.keys(DICT);

// ============================================================
// CHANTIER 8 (MODE 1) -- LE PANIER SUIT ENFIN LA MEME REGLE QUE LA PAGE.
//
// L'ASYMETRIE MESUREE. Deux fonctions decidaient de la langue d'une meme
// page, et elles ne disaient pas la meme chose :
//
//   getDict(lang)        (i18n.ts:480)  (lang || 'en').slice(0, 2).toLowerCase()
//   getCartLabels(lang)  (ici, avant)   DICT[lang ?? 'fr']
//
// Deux divergences, toutes deux atteignables :
//   * AUCUNE NORMALISATION. Une valeur historique `'fr-FR'` ou `'FR'` --
//     formes que la porte d'ecriture du chantier 3 refuse mais que la base
//     peut porter -- donnait une page en FRANCAIS (getDict normalise) et un
//     panier en ANGLAIS (repli). Sur la meme page, au meme instant.
//   * REPLI DIFFERENT. `lang` absent donnait une page en ANGLAIS et un
//     panier en FRANCAIS.
//
// `getDict` est l'autorite de ce que la page rend ; le panier s'y aligne,
// mot pour mot. Il ne s'agit pas d'harmoniser par gout : deux reponses
// differentes a la meme question sur la meme page sont un defaut.
//
// CE QUE CELA CHANGE, DIT SANS DETOUR : un site dont `lang` est NULL voyait
// un panier francais, il verra un panier anglais -- comme le reste de sa
// page depuis toujours.
// ============================================================
export function getCartLabels(lang?: unknown): CartLabels {
  const code = (typeof lang === 'string' ? lang : 'en').slice(0, 2).toLowerCase();
  return DICT[code] || DICT.en;
}
