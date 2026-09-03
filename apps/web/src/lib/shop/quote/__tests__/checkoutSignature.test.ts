import { describe, it, expect } from 'vitest';
import {
  buildQuoteHash,
  buildCheckoutIdempotencyKey,
  type QuoteState,
} from '../checkoutSignature';

// ============================================================
// LOT 3 + LOT 4 -- deux identites, deux jeux de proprietes OPPOSEES.
//
//   quoteHash       "est-ce le MEME DEVIS ?"        -> IDENTIQUE entre acheteurs
//   idempotencyKey  "est-ce la MEME TENTATIVE ?"    -> DIFFERENTE entre acheteurs
//
// Confondre les deux, c'est reintroduire le P0 du LOT 3 : deux acheteurs au
// panier identique recevant la MEME session Stripe, le second payant dans la
// commande du premier. Les tests 3 et 11 existent uniquement pour rendre
// cette reintroduction impossible sans faire echouer la suite.
// ============================================================

const QUOTE: QuoteState = {
  siteId: 'site-1',
  currency: 'usd',
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

const ORIGIN = 'https://www.deribfy.com';
const clone = (o: QuoteState): QuoteState => JSON.parse(JSON.stringify(o));
const hash = (mut: (q: QuoteState) => void = () => {}) => {
  const q = clone(QUOTE);
  mut(q);
  return buildQuoteHash(q);
};
const keyFor = (buyerNonce: string, mut: (q: QuoteState) => void = () => {}, origin = ORIGIN) =>
  buildCheckoutIdempotencyKey({ buyerNonce, origin, quoteHash: hash(mut) });

// ------------------------------------------------------------
describe('LOT 4 -- quoteHash : identite COMMERCIALE, independante de l\'acheteur', () => {
  it('1 -- meme etat commercial, acheteurs A et B -> quoteHash IDENTIQUE', () => {
    // Le quoteHash ne prend pas d'acheteur en entree : sa signature de type
    // rend l'erreur impossible. Ce test verrouille l'intention.
    expect(hash()).toBe(hash());
    expect(keyFor('A')).not.toBe(keyFor('B')); // ... alors que les cles divergent
  });

  it('11 -- quoteHash ne contient jamais le buyerNonce', () => {
    // Preuve structurelle : un buyerNonce tres distinctif ne peut pas
    // influencer un hash qui ne le recoit pas. On le verifie en montrant que
    // deux cles construites sur des acheteurs differents partagent bien le
    // MEME quoteHash sous-jacent.
    const q = hash();
    const kA = buildCheckoutIdempotencyKey({ buyerNonce: 'AAAAAAAA', origin: ORIGIN, quoteHash: q });
    const kB = buildCheckoutIdempotencyKey({ buyerNonce: 'BBBBBBBB', origin: ORIGIN, quoteHash: q });
    expect(kA).not.toBe(kB);
    expect(q).toBe(hash());
    expect(q).not.toContain('AAAAAAAA');
    expect(q).not.toContain('BBBBBBBB');
  });

  const commercialChanges: Array<[string, (q: QuoteState) => void]> = [
    ['5 -- montant de livraison', (q) => { q.shippingAmount = 4.8; }],
    ['6 -- palier de livraison', (q) => { q.shipmentTier = 'express'; }],
    ['7 -- quantite', (q) => { q.lines[0].quantity = 3; }],
    ['8 -- prix serveur', (q) => { q.lines[0].unitPrice = 31; }],
    ['9a -- promo appliquee (identifiant)', (q) => { q.promoId = 'promo-x'; }],
    ['9b -- montant de remise', (q) => { q.discountAmount = 6; }],
    ['devise', (q) => { q.currency = 'cad'; }],
    ['site', (q) => { q.siteId = 'site-2'; }],
    ['commission Nexiora', (q) => { q.applicationFee = 16; }],
    ['produit', (q) => { q.lines[0].cartId = 'catalog-autre'; }],
    ['variante du meme produit', (q) => { q.lines[0].cartId = 'catalog-cat-1::v2'; }],
    ['article ajoute', (q) => { q.lines.push({ cartId: 'p3', quantity: 1, unitPrice: 5 }); }],
    ['article retire', (q) => { q.lines.pop(); }],
    ['design personnalise', (q) => { q.lines[0].designUrls = ['https://x/y.png']; }],
  ];

  it.each(commercialChanges)('2 -- %s modifie -> quoteHash DIFFERENT', (_n, mut) => {
    expect(hash(mut)).not.toBe(hash());
  });

  it('10 -- deux flottants representant le MEME centime -> quoteHash IDENTIQUE', () => {
    expect(hash((q) => { q.shippingAmount = 3.5999999999999996; q.applicationFee = 15.399999999999999; }))
      .toBe(hash());
  });

  it("l'ordre des lignes change le quoteHash, deliberement", () => {
    // `line_items` est un tableau ORDONNE cote Stripe. Affirmer que deux
    // ordres donnent "le meme devis" serait affirmer une egalite que le
    // checkout ne respecte pas -- et, propagee a la cle, provoquerait une
    // `idempotency_error`, donc une panne de paiement.
    expect(hash((q) => { q.lines.reverse(); })).not.toBe(hash());
  });

  it("origin n'entre PAS dans le devis : le prix ne depend pas du domaine d'acces", () => {
    const q = hash();
    expect(buildCheckoutIdempotencyKey({ buyerNonce: 'A', origin: ORIGIN, quoteHash: q }))
      .not.toBe(buildCheckoutIdempotencyKey({ buyerNonce: 'A', origin: 'https://autre.test', quoteHash: q }));
    // ... mais le devis lui-meme est inchange : meme hash des deux cotes.
    expect(q).toBe(hash());
  });
});

// ------------------------------------------------------------
describe("LOT 4 -- idempotencyKey : identite d'une TENTATIVE D'ACHAT", () => {
  it('3 -- meme devis, acheteurs differents -> cles DIFFERENTES (P0 du LOT 3)', () => {
    expect(keyFor('buyer-A')).not.toBe(keyFor('buyer-B'));
  });

  it('4 -- meme devis, meme acheteur -> cle IDENTIQUE (double-clic, deux onglets)', () => {
    expect(keyFor('buyer-A')).toBe(keyFor('buyer-A'));
  });

  it.each(commercialChangesForKey())('devis modifie (%s) -> cle DIFFERENTE', (_n, mut) => {
    expect(keyFor('buyer-A', mut)).not.toBe(keyFor('buyer-A'));
  });

  it('origin different -> cle DIFFERENTE (success_url / cancel_url sont des parametres Stripe)', () => {
    expect(keyFor('buyer-A', () => {}, 'https://autre.test')).not.toBe(keyFor('buyer-A'));
  });

  it('deterministe : trois calculs successifs donnent la meme valeur', () => {
    expect(new Set([keyFor('buyer-A'), keyFor('buyer-A'), keyFor('buyer-A')]).size).toBe(1);
  });
});

function commercialChangesForKey(): Array<[string, (q: QuoteState) => void]> {
  return [
    ['livraison', (q) => { q.shippingAmount = 4.8; }],
    ['quantite', (q) => { q.lines[0].quantity = 3; }],
    ['prix serveur', (q) => { q.lines[0].unitPrice = 31; }],
    ['remise', (q) => { q.discountAmount = 6; }],
  ];
}

// ------------------------------------------------------------
describe('LOT 4 -- format', () => {
  it('les deux identites sont distinguables par leur prefixe', () => {
    expect(hash()).toMatch(/^q_v1_/);
    expect(keyFor('buyer-A')).toMatch(/^co_v1_/);
  });

  it('la cle reste tres en deca de la limite de 255 caracteres de Stripe, suffixe compris', () => {
    const big = clone(QUOTE);
    big.lines = Array.from({ length: 300 }, (_, n) => ({
      cartId: `catalog-produit-au-nom-tres-long-${n}::variante-${n}`,
      quantity: n + 1,
      unitPrice: 12.34,
      designUrls: [`https://exemple.test/designs/${n}/chemin/tres/long.png`],
    }));
    const k = buildCheckoutIdempotencyKey({
      buyerNonce: 'b'.repeat(200), origin: ORIGIN, quoteHash: buildQuoteHash(big),
    });
    expect(k.length).toBeLessThanOrEqual(64);   // + ':notax' reste tres loin de 255
  });

  it('panier vide : les deux identites sont produites sans erreur', () => {
    const q = buildQuoteHash({ ...clone(QUOTE), lines: [] });
    expect(q).toMatch(/^q_v1_/);
    expect(buildCheckoutIdempotencyKey({ buyerNonce: 'A', origin: ORIGIN, quoteHash: q })).toMatch(/^co_v1_/);
  });
});
