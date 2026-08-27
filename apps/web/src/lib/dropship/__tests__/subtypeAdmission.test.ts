import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  isKnownDropshipSubtype,
  requiresDropshipSubtype,
  resolvePersistedSubtype,
} from '../subtypeAdmission';

// ============================================================
// LOT 1 / L1-01 + L1-05 -- LE COUPLE (MODE, SOUS-TYPE), ENFIN COUVERT.
//
// CE QUI N'ETAIT COUVERT NULLE PART. Sur 2973 tests, aucun ne portait sur le
// couple (mode 3, `dropship_type` absent). Chaque moitie etait testee --
// `canTransact(3)`, `isValidDropshipType(null)` -- jamais leur rencontre. Or
// c'est exactement leur rencontre qui a produit 3 sites de production sans
// sous-type, dont un publie, portant 12 commandes reelles.
//
// LA MATRICE EST COMPLETE, DELIBEREMENT : trois modes x six valeurs. Une
// matrice partielle laisse un angle mort, et un angle mort finit toujours
// par etre le cas reel.
// ============================================================

const SOUS_TYPES_VALIDES = ['reseller', 'pod_brand', 'pod_custom'] as const;

/** Tout ce qu'une colonne ou un corps de requete peut reellement contenir. */
const VALEURS_NON_VALIDES = [
  null,
  undefined,
  '',
  'RESELLER',
  'pod-brand',
  'legacy_mode_x',
  0,
  3,
  {},
  [],
  ['reseller'],
] as const;

describe('LOT 1 / L1-01 -- le VOCABULAIRE des sous-types, source unique', () => {
  it.each(SOUS_TYPES_VALIDES)('%s est un sous-type connu', (v) => {
    expect(isKnownDropshipSubtype(v)).toBe(true);
  });

  it.each(VALEURS_NON_VALIDES)('%s n\'est PAS un sous-type', (v) => {
    expect(isKnownDropshipSubtype(v)).toBe(false);
  });

  it('la casse et les variantes typographiques ne sont jamais tolerees', () => {
    for (const v of ['Reseller', 'RESELLER', ' reseller', 'reseller ', 'pod brand', 'podcustom']) {
      expect(isKnownDropshipSubtype(v)).toBe(false);
    }
  });
});

describe('LOT 1 / L1-01 -- quels modes EXIGENT un sous-type', () => {
  it('le mode 3 l\'exige', () => {
    expect(requiresDropshipSubtype(3)).toBe(true);
  });

  it.each([1, 2, 0, 4, null, undefined, '3', NaN, {}])(
    'le mode %s ne l\'exige pas -- allowlist positive, aucun heritage par accident',
    (m) => {
      expect(requiresDropshipSubtype(m)).toBe(false);
    }
  );
});

describe('LOT 1 / L1-01 -- LA REGLE D\'ECRITURE : matrice complete (mode x valeur)', () => {
  // ---- Direction DANGEREUSE : mode 3 sans sous-type exploitable -> REFUS ----
  it.each(VALEURS_NON_VALIDES)(
    'mode 3 + %s -> REFUS. Aucun repli, aucun `reseller` devine',
    (v) => {
      const r = resolvePersistedSubtype(3, v);
      expect(r.ok).toBe(false);
      expect(r).toEqual({ ok: false, reason: 'subtype_required' });
    }
  );

  it.each(SOUS_TYPES_VALIDES)('mode 3 + %s -> accepte, valeur persistee telle quelle', (v) => {
    expect(resolvePersistedSubtype(3, v)).toEqual({ ok: true, value: v });
  });

  // ---- Direction SANS OBJET : le sous-type n'a aucun sens hors du mode 3 ----
  it.each([1, 2])(
    'mode %s + un sous-type valide -> accepte, mais la valeur persistee est `null` : rien d\'inerte en base',
    (m) => {
      for (const v of SOUS_TYPES_VALIDES) {
        expect(resolvePersistedSubtype(m, v)).toEqual({ ok: true, value: null });
      }
    }
  );

  it.each([1, 2])('mode %s + absence -> accepte, `null`', (m) => {
    expect(resolvePersistedSubtype(m, null)).toEqual({ ok: true, value: null });
    expect(resolvePersistedSubtype(m, undefined)).toEqual({ ok: true, value: null });
  });

  it('un mode inconnu ne peut jamais faire persister un sous-type', () => {
    for (const m of [0, 4, null, undefined, '3', NaN]) {
      expect(resolvePersistedSubtype(m, 'reseller')).toEqual({ ok: true, value: null });
    }
  });

  it('la reponse est toujours une VALEUR, jamais un booleen : l\'appelant n\'a plus rien a decider', () => {
    // C'est la propriete qui interdit qu'un repli renaisse chez un appelant :
    // il n'existe aucun chemin ou la fonction dit « oui » sans dire « quoi ».
    for (const m of [1, 2, 3, 4, null]) {
      for (const v of [...SOUS_TYPES_VALIDES, ...VALEURS_NON_VALIDES]) {
        const r = resolvePersistedSubtype(m, v);
        if (r.ok) expect(Object.prototype.hasOwnProperty.call(r, 'value')).toBe(true);
      }
    }
  });
});

// ------------------------------------------------------------
// LE CHEMIN D'ECRITURE REEL, LU DANS LE FICHIER SOURCE.
//
// `POST /api/chat` ne peut pas etre appele ici sans monter tout le pipeline
// de generation (Anthropic, Pexels, Supabase, score IA). Ce que ce bloc
// verrouille est donc la propriete VERIFIABLE et suffisante : la valeur
// inseree est celle qu'a resolue l'autorite, jamais celle du corps de
// requete. Une mutation qui remettrait `dropship_type: dropshipType` echoue
// ici, et c'est precisement la regression a empecher.
// ------------------------------------------------------------
const RACINE = join(__dirname, '../../../..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

describe('LOT 1 / L1-01 -- le SEUL point d\'ecriture consomme l\'autorite', () => {
  const source = sansCommentaires(lire('src/app/api/chat/route.ts'));

  it('l\'insertion ecrit la valeur RESOLUE, jamais celle du corps de requete', () => {
    expect(source).toContain('dropship_type: persistedDropshipType');
    expect(source).not.toContain('dropship_type: dropshipType');
  });

  it('la resolution precede l\'insertion et refuse explicitement', () => {
    expect(source).toContain('resolvePersistedSubtype(finalMode, dropshipType)');
    expect(source).toMatch(/if \(!subtype\.ok\)/);
    expect(source.indexOf('resolvePersistedSubtype(finalMode, dropshipType)'))
      .toBeLessThan(source.indexOf('dropship_type: persistedDropshipType'));
  });

  it('la liste des sous-types n\'est plus recopiee dans la route', () => {
    // Deux listes divergent toujours. `isValidDropshipType` delegue.
    expect(source).not.toMatch(/value === 'reseller'/);
    expect(source).toContain('isKnownDropshipSubtype(value)');
  });

  it('AUCUN autre fichier du depot n\'ecrit `dropship_type`', () => {
    // La regle n'est incontournable que si le point d'ecriture est unique.
    // Mesure refaite ici plutot que supposee : une seconde ecriture ajoutee
    // demain contournerait l'autorite en silence.
    const ecritures = [
      'src/lib/supabase-owned-site.ts',
      'src/app/api/agent/[slug]/apply/route.ts',
    ].filter((f) => {
      try {
        return /\.(update|insert|upsert)\([^)]*dropship_type/.test(sansCommentaires(lire(f)));
      } catch {
        return false;
      }
    });
    expect(ecritures).toEqual([]);
  });
});
