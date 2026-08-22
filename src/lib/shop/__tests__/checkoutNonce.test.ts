import { describe, it, expect } from 'vitest';
import { checkoutNonceFor, type CheckoutNonceInput } from '../checkoutNonce';

// Audit final (phase 2) -- ces tests verrouillent les DEUX proprietes dont
// depend l'idempotence Stripe, et qui se contredisent si l'une est mal
// implementee :
//   1. panier identique -> MEME cle (sinon : double session, double charge
//      possible sur un double-clic ou deux onglets) ;
//   2. panier different -> cle DIFFERENTE (sinon : Stripe rejette la cle
//      rejouee avec d'autres parametres -- `idempotency_error` -- et le
//      checkout casse des que le client modifie son panier).

const base: CheckoutNonceInput = {
  slug: 'cosmopo',
  countryCode: 'CA',
  stateCode: 'QC',
  shipmentTier: 'standard',
  promoCode: 'ETE20',
  items: [
    { id: 'p1', priceNumber: 49.99, currency: 'CAD', quantity: 2 },
    { id: 'p2', priceNumber: 15, currency: 'CAD', quantity: 1 },
  ],
};

/** Copie profonde : garantit qu'aucun test ne compare deux fois le meme objet. */
const clone = (o: CheckoutNonceInput): CheckoutNonceInput => JSON.parse(JSON.stringify(o));

describe('checkoutNonceFor — stabilite (protection double-clic)', () => {
  it('deux appels sur un panier identique produisent la MEME cle', () => {
    expect(checkoutNonceFor(clone(base))).toBe(checkoutNonceFor(clone(base)));
  });

  it("le nom d'article n'entre pas dans la cle (il ne change pas le montant facture)", () => {
    const a = clone(base);
    const b = clone(base);
    (b.items[0] as Record<string, unknown>).name = 'Titre marketing modifie';
    expect(checkoutNonceFor(a)).toBe(checkoutNonceFor(b));
  });
});

describe('checkoutNonceFor — sensibilite (evite idempotency_error)', () => {
  const variantes: Array<[string, (i: CheckoutNonceInput) => void]> = [
    ['quantite', (i) => { i.items[0].quantity = 3; }],
    ['prix', (i) => { i.items[0].priceNumber = 59.99; }],
    ['devise', (i) => { i.items[0].currency = 'USD'; }],
    ['identifiant article', (i) => { i.items[0].id = 'p9'; }],
    ['pays', (i) => { i.countryCode = 'US'; }],
    ['province', (i) => { i.stateCode = 'ON'; }],
    ['palier de livraison', (i) => { i.shipmentTier = 'express'; }],
    ['code promo', (i) => { i.promoCode = 'HIVER50'; }],
    ['retrait du code promo', (i) => { i.promoCode = undefined; }],
    ['slug (autre boutique)', (i) => { i.slug = 'autre-boutique'; }],
    ['ajout d’un article', (i) => { i.items.push({ id: 'p3', priceNumber: 5, currency: 'CAD', quantity: 1 }); }],
    ['retrait d’un article', (i) => { i.items.pop(); }],
    ['design personnalise', (i) => { i.items[0].customDesignUrl = 'https://x/y.png'; }],
    ['position du design', (i) => { i.items[0].customDesignPosition = 'back'; }],
  ];

  it.each(variantes)('%s modifie -> cle differente', (_nom, muter) => {
    const modifie = clone(base);
    muter(modifie);
    expect(checkoutNonceFor(modifie)).not.toBe(checkoutNonceFor(clone(base)));
  });

  it("l'ordre des articles change la cle -- il determine line_items cote Stripe", () => {
    const inverse = clone(base);
    inverse.items.reverse();
    expect(checkoutNonceFor(inverse)).not.toBe(checkoutNonceFor(clone(base)));
  });
});

describe('checkoutNonceFor — contraintes de format', () => {
  it('respecte la borne de 200 caracteres appliquee par checkout/route.ts, meme sur un gros panier', () => {
    const gros = clone(base);
    gros.items = Array.from({ length: 200 }, (_, n) => ({
      id: `produit-au-nom-tres-long-${n}`,
      priceNumber: 12.34,
      currency: 'CAD',
      quantity: n + 1,
      customDesignUrl: `https://exemple.test/designs/${n}/tres/long/chemin.png`,
    }));
    const cle = checkoutNonceFor(gros);
    expect(cle.length).toBeGreaterThan(0);
    expect(cle.length).toBeLessThanOrEqual(200);
  });

  it('panier vide : cle produite sans erreur', () => {
    expect(checkoutNonceFor({ slug: 'x', items: [] })).toMatch(/^co_/);
  });
});
