// Garantie deterministe ajoutee apres l'incident reel "boutique en ligne
// mode 2" : une generation reelle (Playwright/UI, pas ce test) a produit
// mode=2 avec 10 produits malgre la correction B+A (prompt), prouvant que la
// seule obeissance du modele ne suffit pas. resolveFinalMode()/
// enforceModeProducts() garantissent la regle metier independamment de ce
// que le modele genere -- ces tests le prouvent sans appeler l'IA.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }));

import { resolveFinalMode, enforceModeProducts, isValidDropshipType } from '../route';

describe('enforceModeProducts -- regle absolue, independante de toute obeissance du modele', () => {
  const products = [{ name: 'Pneus Michelin' }, { name: 'Batterie Optima' }];

  it('Mode 2 + produits generes par le modele -> []', () => {
    expect(enforceModeProducts(2, products)).toEqual([]);
  });

  it('Mode 3 + produits generes par le modele -> []', () => {
    expect(enforceModeProducts(3, products)).toEqual([]);
  });

  it('Mode 1 + produits generes -> produits conserves inchanges', () => {
    expect(enforceModeProducts(1, products)).toBe(products); // meme reference, aucune copie/alteration
  });

  it('Mode 2/3 sur un tableau deja vide reste []', () => {
    expect(enforceModeProducts(2, [])).toEqual([]);
    expect(enforceModeProducts(3, [])).toEqual([]);
  });
});

describe('resolveFinalMode -- siteMode (connu avant l\'appel IA) toujours prioritaire sur parsed.mode', () => {
  it('siteMode=2, parsed.mode=1 (le modele se trompe) -> finalMode=2', () => {
    expect(resolveFinalMode(2, 1)).toBe(2);
  });

  it('siteMode=3, parsed.mode=1 (le modele se trompe) -> finalMode=3', () => {
    expect(resolveFinalMode(3, 1)).toBe(3);
  });

  it('siteMode=null (chemin wizard ou classification onboarding incomplete), parsed.mode=2 -> finalMode=2', () => {
    expect(resolveFinalMode(null, 2)).toBe(2);
  });

  it('siteMode=null, parsed.mode=3 -> finalMode=3', () => {
    expect(resolveFinalMode(null, 3)).toBe(3);
  });

  it('siteMode=null, parsed.mode invalide/absent -> repli sur 1 (comportement actuel conserve)', () => {
    expect(resolveFinalMode(null, undefined)).toBe(1);
    expect(resolveFinalMode(null, 'not-a-mode')).toBe(1);
    expect(resolveFinalMode(null, 4)).toBe(1);
  });

  it('siteMode connu prend le pas meme si parsed.mode est absent/invalide', () => {
    expect(resolveFinalMode(2, undefined)).toBe(2);
  });
});

describe('isValidDropshipType -- N10, dropshipType du body client ne doit jamais etre persiste sans validation', () => {
  it.each(['reseller', 'pod_brand', 'pod_custom', null])('valeur legitime %s -> true', (v) => {
    expect(isValidDropshipType(v)).toBe(true);
  });

  it.each(['legacy_mode_x', 'RESELLER', '', 'pod-brand', 0, undefined, {}, []])('valeur invalide/corrompue %s -> false', (v) => {
    expect(isValidDropshipType(v)).toBe(false);
  });
});

describe('Bout en bout -- reproduit precisement l\'incident reel corrige', () => {
  it('siteMode=null (comme observe pour la generation reelle "AutoPieces Toyota"), parsed.mode=2, 10 produits generes -> products=[]', () => {
    const rawProducts = Array.from({ length: 10 }, (_, i) => ({ name: `Produit ${i}` }));
    const finalMode = resolveFinalMode(null, 2);
    expect(finalMode).toBe(2);
    expect(enforceModeProducts(finalMode, rawProducts)).toEqual([]);
  });
});
