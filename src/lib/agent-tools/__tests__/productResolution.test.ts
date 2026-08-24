import { describe, it, expect } from 'vitest';
import { resolveProductByName, resolutionMessage } from '../productResolution';
import type { ShopProduct } from '@/lib/shop';

// ============================================================
// ÉTAPE 7 — N7 : LE MODÈLE NE DOIT JAMAIS INVENTER D'IDENTIFIANT.
//
// Le contexte envoyé au modèle ne contient aucun produit ; il ne peut donc
// désigner une cible que par le NOM que le marchand vient de prononcer. Ces
// tests verrouillent la seule propriété qui rend ce choix sûr : AUCUNE
// ambiguïté ne peut aboutir à une écriture, et aucun appariement approximatif
// n'existe.
// ============================================================

function p(name: string, id = name): ShopProduct {
  return {
    id, site_id: 'site-1', name, description: null, price: 1, currency: 'CAD',
    images: [], stock: 0, track_inventory: true, published: true, for_sale: true, position: 0,
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('resolveProductByName — appariement exact', () => {
  it('un seul produit portant ce nom -> résolu', () => {
    const r = resolveProductByName([p('Mug'), p('Casquette')], 'Mug');
    expect(r).toEqual({ ok: true, product: expect.objectContaining({ name: 'Mug' }) });
  });

  it('aucun produit ne porte ce nom -> not_found, aucune cible', () => {
    const r = resolveProductByName([p('Mug')], 'Chapeau');
    expect(r).toEqual({ ok: false, reason: 'not_found', query: 'Chapeau' });
  });

  it('catalogue vide -> not_found', () => {
    expect(resolveProductByName([], 'Mug')).toMatchObject({ ok: false, reason: 'not_found' });
  });
});

describe('resolveProductByName — insensibilité à la casse et espaces', () => {
  it('casse différente -> résolu (le marchand ne tape pas ses majuscules)', () => {
    expect(resolveProductByName([p('Mug Noir')], 'mug noir')).toMatchObject({ ok: true });
    expect(resolveProductByName([p('mug noir')], 'MUG NOIR')).toMatchObject({ ok: true });
  });

  it('espaces de bord ignorés des DEUX côtés', () => {
    expect(resolveProductByName([p('Mug')], '  Mug  ')).toMatchObject({ ok: true });
    expect(resolveProductByName([p('  Mug  ')], 'Mug')).toMatchObject({ ok: true });
  });

  it("l'insensibilité à la casse ne peut JAMAIS choisir : deux homonymes de casse différente -> ambigu", () => {
    const r = resolveProductByName([p('Mug', 'a'), p('mug', 'b')], 'MUG');
    expect(r).toMatchObject({ ok: false, reason: 'ambiguous' });
    // Le pire cas de l'insensibilité est donc un REFUS, jamais une écriture
    // sur le mauvais produit. C'est ce qui la rend acceptable.
  });
});

describe('resolveProductByName — AUCUN appariement approximatif', () => {
  it('sous-chaîne -> refusé ("Mug" ne doit pas atteindre "Mug Grand")', () => {
    expect(resolveProductByName([p('Mug Grand')], 'Mug')).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('préfixe inverse -> refusé', () => {
    expect(resolveProductByName([p('Mug')], 'Mug Grand')).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('accents NON supprimés : "cafe" n\'atteint pas "café"', () => {
    expect(resolveProductByName([p('café')], 'cafe')).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('ponctuation NON normalisée : "T-shirt" n\'atteint pas "T shirt"', () => {
    expect(resolveProductByName([p('T-shirt')], 'T shirt')).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('espaces internes NON normalisés', () => {
    expect(resolveProductByName([p('Mug  Noir')], 'Mug Noir')).toMatchObject({ ok: false, reason: 'not_found' });
  });
});

describe('resolveProductByName — ambiguïté = aucune écriture', () => {
  it('deux produits homonymes -> ambiguous, avec les deux candidats', () => {
    const r = resolveProductByName([p('Mug', 'a'), p('Mug', 'b'), p('Autre', 'c')], 'Mug');
    expect(r).toMatchObject({ ok: false, reason: 'ambiguous' });
    expect((r as any).candidates).toHaveLength(2);
  });

  it('trois homonymes -> toujours ambiguous, jamais « le premier »', () => {
    const r = resolveProductByName([p('X', '1'), p('X', '2'), p('X', '3')], 'X');
    expect(r).toMatchObject({ ok: false, reason: 'ambiguous' });
    expect(r).not.toHaveProperty('product');
  });
});

describe('resolveProductByName — entrées dégénérées (fail-closed)', () => {
  const mauvaises: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['nombre', 42],
    ['objet', { name: 'Mug' }],
    ['tableau', ['Mug']],
    ['chaîne vide', ''],
    ['espaces seuls', '   '],
  ];
  for (const [label, value] of mauvaises) {
    it(`nom ${label} -> not_found, jamais une sélection accidentelle`, () => {
      expect(resolveProductByName([p('Mug'), p('')], value)).toMatchObject({ ok: false, reason: 'not_found' });
    });
  }

  it('un produit au nom vide n\'est jamais apparié par une requête vide', () => {
    expect(resolveProductByName([p('', 'vide')], '')).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('un produit dont le nom est null ne fait pas planter la résolution', () => {
    const cassé = { ...p('Mug'), name: null as unknown as string };
    expect(resolveProductByName([cassé], 'Mug')).toMatchObject({ ok: false, reason: 'not_found' });
  });
});

describe('resolutionMessage — le modèle doit savoir quoi redemander', () => {
  it('not_found : dit explicitement qu\'aucun changement n\'a eu lieu', () => {
    const m = resolutionMessage({ ok: false, reason: 'not_found', query: 'Chapeau' });
    expect(m).toContain('Chapeau');
    expect(m.toLowerCase()).toContain('aucun changement');
  });

  it('ambiguous : nomme les candidats et demande de trancher', () => {
    const m = resolutionMessage({
      ok: false, reason: 'ambiguous', query: 'Mug', candidates: [p('Mug', 'a'), p('Mug', 'b')],
    });
    expect(m).toContain('2 produits');
    expect(m.toLowerCase()).toContain('aucun changement');
  });
});
