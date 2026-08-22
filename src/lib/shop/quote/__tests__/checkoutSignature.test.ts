import { describe, it, expect } from 'vitest';
import { buildCheckoutSignature, type CheckoutSignatureInput } from '../checkoutSignature';

// ============================================================
// LOT 3 -- la cle d'idempotence doit satisfaire DEUX proprietes opposees :
//   STABILITE    meme etat commercial -> meme cle (sinon : double session,
//                donc double charge possible au double-clic) ;
//   SENSIBILITE  etat commercial different -> cle differente (sinon : Stripe
//                rejette le rejeu avec d'autres parametres, ou pire, sert la
//                session d'un autre acheteur).
// Un test qui ne verifierait qu'une des deux laisserait passer l'autre.
// ============================================================

const BASE: CheckoutSignatureInput = {
  buyerNonce: 'buyer-aaa',
  siteId: 'site-1',
  currency: 'usd',
  origin: 'https://www.deribfy.com',
  shippingAmount: 3.6,
  shipmentTier: 'standard',
  promoId: null,
  discountAmount: 0,
  applicationFee: 15.4,
  lines: [
    { cartId: 'catalog-cat-1', quantity: 1, unitPrice: 30 },
    { cartId: 'p2', quantity: 2, unitPrice: 9.99 },
  ],
};

const clone = (o: CheckoutSignatureInput): CheckoutSignatureInput => JSON.parse(JSON.stringify(o));
const key = (mut: (i: CheckoutSignatureInput) => void = () => {}) => {
  const i = clone(BASE);
  mut(i);
  return buildCheckoutSignature(i);
};

describe('LOT 3 -- stabilite (protection double-clic / deux onglets)', () => {
  it('1 -- meme panier, meme quantite, meme livraison, meme promo -> MEME cle', () => {
    expect(key()).toBe(key());
  });

  it('8 -- deux calculs successifs sur des objets distincts -> cle strictement identique', () => {
    const a = buildCheckoutSignature(clone(BASE));
    const b = buildCheckoutSignature(clone(BASE));
    const c = buildCheckoutSignature(clone(BASE));
    expect(new Set([a, b, c]).size).toBe(1);
  });

  it('9 -- une derive flottante sur un meme montant au centime ne produit PAS deux cles', () => {
    // 3.5999999999999996 et 3.6 valent tous deux 360 centimes.
    const drifted = key((i) => { i.shippingAmount = 3.5999999999999996; i.applicationFee = 15.399999999999999; });
    expect(drifted).toBe(key());
  });

  it('10 -- seuls les champs declares participent : deux entrees identiques champ a champ coincident', () => {
    // `source` et `logisticName` du devis ne sont deliberement PAS des
    // entrees : ils ne sont transmis a Stripe nulle part. Les inclure ferait
    // varier la cle -- donc creerait une session inutile -- lorsqu'un cache
    // expire alors que le live renvoie exactement le meme montant.
    const rebuilt: CheckoutSignatureInput = {
      buyerNonce: 'buyer-aaa', siteId: 'site-1', currency: 'usd',
      origin: 'https://www.deribfy.com', shippingAmount: 3.6,
      shipmentTier: 'standard', promoId: null, discountAmount: 0, applicationFee: 15.4,
      lines: [
        { cartId: 'catalog-cat-1', quantity: 1, unitPrice: 30 },
        { cartId: 'p2', quantity: 2, unitPrice: 9.99 },
      ],
    };
    expect(buildCheckoutSignature(rebuilt)).toBe(key());
  });
});

describe('LOT 3 -- sensibilite (evite idempotency_error et collisions)', () => {
  const variants: Array<[string, (i: CheckoutSignatureInput) => void]> = [
    ['2 -- quantite differente', (i) => { i.lines[0].quantity = 3; }],
    ['3 -- palier de livraison different', (i) => { i.shipmentTier = 'express'; }],
    ['4 -- montant de livraison different', (i) => { i.shippingAmount = 4.8; }],
    ['5 -- promo appliquee differente (identifiant)', (i) => { i.promoId = 'promo-x'; }],
    ['5b -- montant de remise different', (i) => { i.discountAmount = 6; }],
    ['6 -- total different (prix unitaire serveur)', (i) => { i.lines[0].unitPrice = 31; }],
    ['produit different', (i) => { i.lines[0].cartId = 'catalog-autre'; }],
    ['variante differente du meme produit', (i) => { i.lines[0].cartId = 'catalog-cat-1::v2'; }],
    ['article ajoute', (i) => { i.lines.push({ cartId: 'p3', quantity: 1, unitPrice: 5 }); }],
    ['article retire', (i) => { i.lines.pop(); }],
    ['devise differente', (i) => { i.currency = 'cad'; }],
    ['site different', (i) => { i.siteId = 'site-2'; }],
    ['origin different (success_url / cancel_url)', (i) => { i.origin = 'https://boutique.example'; }],
    ['commission Nexiora differente', (i) => { i.applicationFee = 16; }],
    ['design personnalise ajoute', (i) => { i.lines[0].designUrls = ['https://x/y.png']; }],
    ['design personnalise different', (i) => { i.lines[0].designUrls = ['https://x/z.png']; }],
  ];

  it.each(variants)('%s -> cle DIFFERENTE', (_n, mut) => {
    expect(key(mut)).not.toBe(key());
  });

  it("CRITIQUE -- deux ACHETEURS au panier identique obtiennent des cles differentes", () => {
    // Defaut corrige par ce lot : la cle precedente etait derivee du seul
    // contenu du panier. Deux acheteurs anonymes avec le meme panier
    // recevaient la MEME session Stripe -- le second payait dans la commande
    // du premier. C'est le test qui protege contre une reintroduction.
    expect(key((i) => { i.buyerNonce = 'buyer-bbb'; })).not.toBe(key());
  });

  it("7 -- l'ORDRE des articles change la cle, deliberement", () => {
    // `line_items` est un TABLEAU ORDONNE cote Stripe : deux ordres sont deux
    // requetes differentes. Ignorer l'ordre dans la cle sans trier aussi ce
    // qui est envoye a Stripe provoquerait une `idempotency_error` -- une
    // panne de checkout. Une cle differente ne cree qu'une session
    // supplementaire, jamais une erreur.
    expect(key((i) => { i.lines.reverse(); })).not.toBe(key());
  });
});

describe('LOT 3 -- contraintes de format', () => {
  it('reste tres en deca de la limite de 255 caracteres de Stripe, suffixe compris', () => {
    const big = clone(BASE);
    big.lines = Array.from({ length: 300 }, (_, n) => ({
      cartId: `catalog-produit-au-nom-tres-long-${n}::variante-${n}`,
      quantity: n + 1,
      unitPrice: 12.34,
      designUrls: [`https://exemple.test/designs/${n}/chemin/tres/long.png`],
    }));
    const k = buildCheckoutSignature(big);
    expect(k.length).toBeLessThanOrEqual(200);   // + ':notax' reste < 255
    expect(k).toMatch(/^co_v1_/);
  });

  it('panier vide : signature produite sans erreur', () => {
    expect(buildCheckoutSignature({ ...clone(BASE), lines: [] })).toMatch(/^co_v1_/);
  });
});
