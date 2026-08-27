import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { hasSupplierCatalog } from '../catalogAdmission';

// ============================================================
// ÉTAPE 2 — L'ADMISSION AU CATALOGUE FOURNISSEUR.
//
// Trois routes posaient la même question avec trois réponses : `curate`
// refusait en 400, `image-search` rendait un résultat vide, et `search` ne la
// posait PAS — si bien qu'un site Mode 1 ou 2 obtenait le catalogue CJ, son
// sous-type nul faisant retomber `suppliersForDropshipType` sur `['cj']`.
// Une seule autorité désormais, et elle est une allowlist positive.
// ============================================================

describe('ÉTAPE 2 — hasSupplierCatalog : allowlist positive, fail-closed', () => {
  it('mode 3 : admis — c’est le seul', () => {
    expect(hasSupplierCatalog(3)).toBe(true);
  });

  it('modes 1 et 2 : refusés — une vitrine et une boutique n’ont pas de catalogue fournisseur', () => {
    expect(hasSupplierCatalog(1)).toBe(false);
    expect(hasSupplierCatalog(2)).toBe(false);
  });

  it('🔴 tout mode inconnu est refusé — il ne peut pas hériter d’un catalogue', () => {
    for (const m of [4, 5, 42, 0, -1]) {
      expect(hasSupplierCatalog(m), `mode ${m}`).toBe(false);
    }
  });

  it('valeurs inattendues : toutes refusées', () => {
    for (const v of [null, undefined, NaN, Infinity, true, false, {}, [], () => 3]) {
      expect(hasSupplierCatalog(v), String(v)).toBe(false);
    }
  });

  it('la chaîne "3" n’est pas le nombre 3 — comparaison stricte', () => {
    expect(hasSupplierCatalog('3')).toBe(false);
    expect(hasSupplierCatalog(' 3 ')).toBe(false);
  });

  it('NE DÉCIDE RIEN D’AUTRE : la réponse ne dépend que du mode', () => {
    // Ni du sous-type, ni des produits, ni de quoi que ce soit d'autre :
    // la fonction n'a qu'un paramètre, et c'est ce qui la rend vérifiable
    // d'un seul regard.
    expect(hasSupplierCatalog.length).toBe(1);
  });
});

describe('ÉTAPE 2 — la frontière reste distincte des trois autres', () => {
  it('elle est PLUS STRICTE que l’admission au commerce', () => {
    // canTransact admet {2, 3} ; le catalogue n'admet que {3}. Confondre les
    // deux ouvrirait le catalogue fournisseur à une boutique Mode 2.
    expect(hasSupplierCatalog(2)).toBe(false);
    expect(hasSupplierCatalog(3)).toBe(true);
  });

  it('elle ne parle ni de routage ni de fournisseur nommé', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const src = readFileSync(join(__dirname, '../catalogAdmission.ts'), 'utf-8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/order-domain|SUPPLIER_SITE_MODE|fulfillment_domain/);
    expect(code).not.toMatch(/\bcj\b|printful|gelato|dropship_type/);
    expect(code).not.toMatch(/canTransact/);
  });
});
