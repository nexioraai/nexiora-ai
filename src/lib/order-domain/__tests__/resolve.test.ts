// src/lib/order-domain/__tests__/resolve.test.ts
//
// PHASE 1 — contrat du point de décision unique de la frontière.
// Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// Ces tests ne vérifient pas seulement que la fonction « marche ». Ils
// verrouillent les trois propriétés dont dépend toute la séparation :
//
//   1. seul le mode fournisseur donne 'supplier' — c'est la propriété qui
//      rend une garde `if (!G) sortir` inoffensive pour le Mode 3 ;
//   2. tout le reste, y compris l'inattendu, donne 'merchant' (fail-closed) ;
//   3. le résolveur est TOTAL — il ne lève jamais, quelle que soit l'entrée.
//
// Le point 3 compte autant que les deux autres : ce module est appelé sur le
// chemin d'un paiement. Une exception y ferait échouer un checkout légitime
// pour une donnée de configuration inattendue.

import { describe, it, expect } from 'vitest'
import {
  resolveFulfillmentDomain,
  isRecognisedSiteMode,
  SUPPLIER_SITE_MODE,
  type FulfillmentDomain,
} from '../resolve'

describe('resolveFulfillmentDomain — la frontière de domaine', () => {
  it('mode 3 -> supplier : c’est le SEUL cas où un fournisseur peut être sollicité', () => {
    expect(resolveFulfillmentDomain(3)).toBe<FulfillmentDomain>('supplier')
    expect(resolveFulfillmentDomain(SUPPLIER_SITE_MODE)).toBe('supplier')
  })

  it.each([
    ['mode 2 — boutique autonome', 2],
    ['mode 1 — site vitrine, aucune boutique', 1],
  ])('%s -> merchant', (_libelle, mode) => {
    expect(resolveFulfillmentDomain(mode)).toBe<FulfillmentDomain>('merchant')
  })

  // FAIL-CLOSED. Un appel fournisseur engage de l'argent réel : il ne part
  // jamais sans preuve positive. Refuser à tort laisse une commande en
  // attente, récupérable — l'asymétrie des conséquences dicte le repli.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['chaîne "3" (mode non typé venu de la base)', '3'],
    ['chaîne vide', ''],
    ['zéro', 0],
    ['NaN', Number.NaN],
    ['mode inconnu 4', 4],
    ['mode négatif', -3],
    ['objet', { mode: 3 }],
    ['tableau', [3]],
    ['booléen', true],
  ])('valeur inattendue (%s) -> merchant, jamais supplier', (_libelle, valeur) => {
    expect(resolveFulfillmentDomain(valeur)).toBe<FulfillmentDomain>('merchant')
  })

  it('la comparaison est STRICTE : "3" ne vaut pas 3', () => {
    // Une égalité lâche ferait basculer un site vers le domaine fournisseur
    // sur une simple différence de typage de colonne.
    expect(resolveFulfillmentDomain('3')).toBe('merchant')
    expect(resolveFulfillmentDomain(3)).toBe('supplier')
  })

  it('le résolveur est TOTAL — il ne lève sur aucune entrée', () => {
    const entrees: unknown[] = [null, undefined, 0, 3, '3', {}, [], true, Symbol('x'), () => 3]
    for (const e of entrees) {
      expect(() => resolveFulfillmentDomain(e)).not.toThrow()
    }
  })

  it('ne rend jamais autre chose que les deux valeurs du modèle métier', () => {
    const entrees: unknown[] = [1, 2, 3, 4, null, undefined, '3', {}, []]
    for (const e of entrees) {
      expect(['merchant', 'supplier']).toContain(resolveFulfillmentDomain(e))
    }
  })
})

describe('isRecognisedSiteMode — observabilité des cas limites', () => {
  it.each([1, 2, 3])('le mode %s est reconnu', (mode) => {
    expect(isRecognisedSiteMode(mode)).toBe(true)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['mode 4', 4],
    ['chaîne "3"', '3'],
    ['zéro', 0],
  ])('%s n’est PAS reconnu — l’appelant peut le tracer', (_libelle, valeur) => {
    expect(isRecognisedSiteMode(valeur)).toBe(false)
  })

  it('un mode non reconnu se replie sur merchant ET reste signalable', () => {
    // Les deux responsabilités sont séparées à dessein : le résolveur reste
    // total, l'appelant garde la liberté de tracer. Sans cette séparation,
    // un mode corrompu se replierait silencieusement.
    const modeCorrompu = 99
    expect(resolveFulfillmentDomain(modeCorrompu)).toBe('merchant')
    expect(isRecognisedSiteMode(modeCorrompu)).toBe(false)
  })

  it('tout mode reconnu produit un domaine, et tout mode fournisseur est reconnu', () => {
    expect(isRecognisedSiteMode(SUPPLIER_SITE_MODE)).toBe(true)
    expect(resolveFulfillmentDomain(SUPPLIER_SITE_MODE)).toBe('supplier')
  })
})

describe('le module ne connaît ni sous-type ni fournisseur', () => {
  // Garde de lecture directe : complète la règle structurelle du registre
  // (order-domain-frontier) en la rendant visible dans la suite de tests du
  // module lui-même, pas seulement dans les tests d'architecture.
  it('le code source ne mentionne aucun sous-type ni aucun fournisseur', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const source = readFileSync(join(process.cwd(), 'src/lib/order-domain/resolve.ts'), 'utf8')
    // Le commentaire d'en-tête EXPLIQUE pourquoi dropship_type est exclu :
    // on ne teste donc que le code, commentaires retirés.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

    for (const interdit of ['dropship_type', 'reseller', 'pod_brand', 'pod_custom', 'cj', 'printful', 'gelato']) {
      expect(
        code.toLowerCase().includes(interdit),
        `"${interdit}" ne doit jamais apparaître dans le code du résolveur de domaine`
      ).toBe(false)
    }
  })

  it('le module n’importe rien', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'src/lib/order-domain/resolve.ts'),
      'utf8'
    )
    expect(source).not.toMatch(/^\s*import\s/m)
  })
})
