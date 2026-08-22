/**
 * Cle d'idempotence de checkout, derivee du panier lui-meme.
 *
 * CAUSE RACINE (audit final, phase 2) : `stripe.ts` derive trois cles
 * d'idempotence Stripe (`:tax`, `:notax`, `:coupon`) de `checkoutNonce`, et
 * `checkout/route.ts` accepte ce champ -- mais `CartDrawer.tsx`, seul
 * appelant reel de la route, ne l'a JAMAIS envoye. Les trois cles valaient
 * donc `undefined` en production : le correctif documente comme protegeant du
 * double-clic / des deux onglets etait entierement inerte. Meme classe de
 * defaut que P-1 (remise promo affichee mais jamais transmise).
 *
 * POURQUOI UNE CLE DERIVEE, ET NON UN ALEA PERSISTE
 * Un nonce aleatoire conserve cote navigateur pose un probleme que la clé
 * derivee n'a pas : Stripe REJETTE (`idempotency_error`) une meme cle rejouee
 * avec des parametres differents. Si le client modifie son panier ou son code
 * promo puis resoumet, un nonce persiste identique casserait le checkout.
 * En derivant la cle du contenu exact qui determine la session Stripe :
 *   - deux soumissions du MEME panier  -> meme cle -> Stripe renvoie la MEME
 *     session, jamais une seconde charge ;
 *   - le moindre changement (article, quantite, pays, palier, code promo)
 *     -> cle differente -> nouvelle session, jamais d'`idempotency_error`.
 *
 * L'ordre des articles n'est deliberement PAS normalise : il determine
 * `line_items` cote Stripe, donc deux ordres differents sont bien deux jeux
 * de parametres differents et doivent produire deux cles differentes.
 *
 * Les cles d'idempotence Stripe expirent d'elles-memes apres 24 h : un panier
 * identique repris plus tard repart naturellement sur une nouvelle session.
 */

export type CheckoutNonceItem = {
  id?: string | null;
  priceNumber?: number | null;
  currency?: string | null;
  quantity?: number | null;
  customDesignUrl?: string | null;
  // Structure reelle : Record<string, number> (coordonnees), pas une chaine --
  // serialisee telle quelle plutot que typee etroitement, pour que ce module
  // n'ait pas a suivre l'evolution du modele de design.
  customDesignPosition?: unknown;
  customDesigns?: unknown;
};

export type CheckoutNonceInput = {
  slug: string;
  countryCode?: string | null;
  stateCode?: string | null;
  shipmentTier?: string | null;
  promoCode?: string | null;
  items: CheckoutNonceItem[];
};

/** Serialisation deterministe des seuls champs qui determinent la session. */
function canonical(input: CheckoutNonceInput): string {
  const items = input.items
    .map((i) =>
      [
        i.id ?? '',
        i.priceNumber ?? '',
        i.currency ?? '',
        i.quantity ?? '',
        i.customDesignUrl ?? '',
        i.customDesignPosition ? JSON.stringify(i.customDesignPosition) : '',
        i.customDesigns ? JSON.stringify(i.customDesigns) : '',
      ].join('~')
    )
    .join('|');

  return [
    input.slug,
    input.countryCode ?? '',
    input.stateCode ?? '',
    input.shipmentTier ?? '',
    input.promoCode ?? '',
    items,
  ].join('#');
}

/** FNV-1a 32 bits. Deux graines distinctes -> 64 bits effectifs. */
function fnv1a(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Cle stable, courte (bien en deca de la borne de 200 caracteres appliquee
 * par `checkout/route.ts`) et sans dependance : utilisable en composant
 * client sans `crypto.subtle` (asynchrone, et indisponible hors contexte
 * securise).
 *
 * Une collision produirait un `idempotency_error` visible cote Stripe, jamais
 * une charge silencieusement erronee -- la longueur canonique est incluse dans
 * la cle pour rendre ce cas encore plus improbable.
 */
export function checkoutNonceFor(input: CheckoutNonceInput): string {
  const c = canonical(input);
  const a = fnv1a(c, 0x811c9dc5).toString(16).padStart(8, '0');
  const b = fnv1a(c, 0x9e3779b1).toString(16).padStart(8, '0');
  return `co_${c.length.toString(36)}_${a}${b}`;
}
