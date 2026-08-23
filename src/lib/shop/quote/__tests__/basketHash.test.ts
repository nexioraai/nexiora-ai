import { describe, it, expect } from 'vitest';
import { buildBasketHash } from '../basketHash';

// L'empreinte sert de CLE DE CACHE a un devis qui devient le PRIX FACTURE.
// Deux erreurs y seraient graves, en sens opposes :
//   - trop egalisatrice : deux paniers que CJ tarife differemment
//     partageraient un devis -> l'acheteur paierait le prix d'un autre panier ;
//   - trop discriminante : deux paniers identiques pour CJ auraient deux
//     entrees -> appels CJ inutiles et latence, sans rien distinguer de reel.

const L = (id: string, quantity: number) => ({ supplier_product_id: id, quantity });

describe('buildBasketHash', () => {
  it('est deterministe', () => {
    expect(buildBasketHash([L('A', 2)])).toBe(buildBasketHash([L('A', 2)]));
  });

  it('IGNORE l ordre des lignes -- CJ tarife un ensemble, pas une sequence', () => {
    expect(buildBasketHash([L('A', 1), L('B', 2)])).toBe(buildBasketHash([L('B', 2), L('A', 1)]));
  });

  it('AGREGE les lignes du meme produit : 2+3 est le meme panier que 5', () => {
    expect(buildBasketHash([L('A', 2), L('A', 3)])).toBe(buildBasketHash([L('A', 5)]));
  });

  it('DISTINGUE des quantites differentes -- le tarif CJ est degressif', () => {
    expect(buildBasketHash([L('A', 1)])).not.toBe(buildBasketHash([L('A', 2)]));
    expect(buildBasketHash([L('A', 10)])).not.toBe(buildBasketHash([L('A', 20)]));
  });

  it('DISTINGUE des produits differents a quantite egale', () => {
    expect(buildBasketHash([L('A', 1)])).not.toBe(buildBasketHash([L('B', 1)]));
  });

  it('DISTINGUE un panier mono-produit d un panier multi-produits', () => {
    expect(buildBasketHash([L('A', 2)])).not.toBe(buildBasketHash([L('A', 1), L('B', 1)]));
  });

  it('ECARTE les lignes inenvoyables a CJ plutot que de creer une cle morte', () => {
    const ref = buildBasketHash([L('A', 1)]);
    expect(buildBasketHash([L('A', 1), L('B', 0)])).toBe(ref);
    expect(buildBasketHash([L('A', 1), L('B', -3)])).toBe(ref);
    expect(buildBasketHash([L('A', 1), L('B', NaN)])).toBe(ref);
    expect(buildBasketHash([L('A', 1), L('', 5)])).toBe(ref);
  });

  it('panier vide -> empreinte stable, jamais une exception', () => {
    expect(buildBasketHash([])).toBe(buildBasketHash([L('', 0)]));
    expect(buildBasketHash([])).toMatch(/^b_v1_/);
  });

  it('porte un prefixe versionne : une evolution de format restera identifiable', () => {
    expect(buildBasketHash([L('A', 1)])).toMatch(/^b_v1_[0-9a-z]+_[0-9a-f]{16}$/);
  });
});
