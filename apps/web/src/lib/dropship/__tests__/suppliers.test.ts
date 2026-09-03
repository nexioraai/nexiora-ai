import { describe, it, expect } from 'vitest';
import { suppliersForDropshipType } from '../suppliers';

// ============================================================
// LOT 1 / L1-03 + L1-05 -- LE CLOISONNEMENT FOURNISSEUR, ET SON ABSENCE.
//
// CE FICHIER N'AVAIT AUCUN TEST PROPRE. `suppliersForDropshipType` n'etait
// touchee qu'incidemment par `suppliers/__tests__/registry.test.ts`, sur ses
// trois sous-types valides -- jamais sur son `default:`. Le repli qui a
// decide du fournisseur de 3 sites de production etait donc, litteralement,
// le seul chemin de cette fonction que personne ne regardait.
// ============================================================

describe('LOT 1 / L1-03 -- le cloisonnement par sous-type', () => {
  it('reseller -> CJ uniquement', () => {
    expect(suppliersForDropshipType('reseller')).toEqual(['cj']);
  });

  it.each(['pod_brand', 'pod_custom'] as const)('%s -> Printful + Gelato, jamais CJ', (t) => {
    expect(suppliersForDropshipType(t)).toEqual(['printful', 'gelato']);
    expect(suppliersForDropshipType(t)).not.toContain('cj');
  });

  it('aucun sous-type valide ne partage de fournisseur avec un autre camp', () => {
    const reseller = new Set(suppliersForDropshipType('reseller'));
    const pod = new Set(suppliersForDropshipType('pod_brand'));
    expect([...reseller].filter((s) => pod.has(s))).toEqual([]);
  });
});

describe('LOT 1 / L1-03 -- SOUS-TYPE ABSENT OU INCONNU : aucun fournisseur', () => {
  // Le comportement precedent rendait `['cj']`. Ce n'etait pas une regle
  // metier -- c'etait le `default:` d'un `switch`, et il a servi : 2 des 12
  // commandes des sites sans sous-type portent un `cj_order_id`.
  it.each([null, undefined, '', 'RESELLER', 'pod-brand', 'legacy_mode_x', 0, 3, {}, []])(
    '%s -> [] : une donnee absente ne vaut pas `reseller`',
    (v) => {
      expect(suppliersForDropshipType(v as never)).toEqual([]);
    }
  );

  it('la liste rendue n\'est jamais partagee : muter le retour ne contamine pas l\'appel suivant', () => {
    const premier = suppliersForDropshipType('reseller');
    premier.push('printful');
    expect(suppliersForDropshipType('reseller')).toEqual(['cj']);
  });

  it('AUCUNE valeur au monde ne rend `cj` en dehors de `reseller`', () => {
    const candidats = [null, undefined, '', 'pod_brand', 'pod_custom', 'RESELLER', 'cj', 42, {}, []];
    for (const v of candidats) {
      expect(suppliersForDropshipType(v as never)).not.toContain('cj');
    }
  });
});
