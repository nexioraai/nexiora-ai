// src/lib/commerce-admission/__tests__/canTransact.test.ts
//
// PHASE M1-1 — contrat central d'admission commerciale.
//
// Ce fichier verrouille trois propriétés, par ordre d'importance :
//
//   1. le Mode 1 est REFUSÉ — c'est la raison d'être de la frontière ;
//   2. la fonction est FAIL-CLOSED : toute valeur non explicitement admise
//      est refusée, y compris celles que personne n'a prévues ;
//   3. les modes commerçants sont AUTORISÉS — sans quoi la frontière ne serait
//      pas une frontière mais une panne.
//
// La propriété 3 n'est pas décorative. Une garde qui refuse tout passerait les
// deux premières : le contrôle positif est ce qui distingue une frontière d'un
// blocage.

import { describe, it, expect } from 'vitest'
import { canTransact, TRANSACTING_SITE_MODES } from '../canTransact'

describe('canTransact — le Mode 1 ne commerce pas', () => {
  it('mode 1 (vitrine) : REFUSÉ', () => {
    expect(
      canTransact(1),
      "une vitrine présente un business, elle ne le fait pas commercer : aucun artefact commercial ne doit pouvoir naître d'un Mode 1"
    ).toBe(false)
  })
})

describe('canTransact — les modes commerçants sont autorisés', () => {
  it('mode 2 (boutique autonome) : AUTORISÉ', () => {
    expect(canTransact(2)).toBe(true)
  })

  it('mode 3 (dropshipping) : AUTORISÉ — il vend, il route seulement ailleurs', () => {
    expect(
      canTransact(3),
      "la frontière d'admission oppose 1 à {2,3}, jamais 1 à 2 : interdire le Mode 3 casserait tout le domaine fournisseur"
    ).toBe(true)
  })

  it('tous les modes déclarés commerçants le sont réellement', () => {
    for (const mode of TRANSACTING_SITE_MODES) {
      expect(canTransact(mode)).toBe(true)
    }
  })
})

describe('canTransact — FAIL-CLOSED sur tout le reste', () => {
  // Chaque entrée est une valeur qu'une colonne de base peut réellement
  // rendre, ou qu'un appelant peut réellement transmettre. Aucune n'est
  // hypothétique.
  it.each([
    ['null (colonne non renseignée)', null],
    ['undefined (colonne absente du select)', undefined],
    ['0', 0],
    ['4 — un mode futur, non encore décidé', 4],
    ['-1', -1],
    ["'2' — même valeur, mais en chaîne", '2'],
    ["'3'", '3'],
    ['NaN', NaN],
    ['chaîne vide', ''],
    ['true', true],
    ['objet', {}],
    ['tableau', [2]],
  ])('%s : REFUSÉ', (_libelle, valeur) => {
    expect(
      canTransact(valeur),
      'toute valeur non explicitement admise doit être refusée : le commerce ne peut jamais être le comportement par défaut'
    ).toBe(false)
  })

  it("un mode futur n'est PAS commerçant tant qu'il n'a pas été inscrit", () => {
    // La propriété centrale de l'allowlist. Avec `!== 1`, cette assertion
    // serait fausse — et personne ne s'en apercevrait avant la production.
    for (const modeFutur of [4, 5, 6, 42]) {
      expect(canTransact(modeFutur)).toBe(false)
    }
  })
})

describe('canTransact — la frontière est étanche dans les deux sens', () => {
  it('aucun mode n’est à la fois admis et refusé', () => {
    const admis = [1, 2, 3, 4, null, undefined, '2'].filter((m) => canTransact(m))
    expect(admis).toEqual([2, 3])
  })

  it('la liste des modes commerçants ne contient pas le Mode 1', () => {
    expect((TRANSACTING_SITE_MODES as readonly unknown[]).includes(1)).toBe(false)
  })
})
