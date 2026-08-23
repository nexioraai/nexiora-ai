// src/lib/order-domain/__tests__/checkoutPolicy.test.ts
//
// PHASE 4 — contrat des politiques d'admission par domaine.
// Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// Ces tests verrouillent trois propriétés, dans cet ordre d'importance :
//
//   1. la politique MARCHANDE n'admet AUCUN produit de catalogue fournisseur
//      (décision produit D2) — quel que soit le fournisseur, quel que soit le
//      sous-type, y compris incohérent ;
//   2. la politique FOURNISSEUR reproduit à l'identique les règles qui
//      vivaient dans `checkout/route.ts` — c'est un déplacement, pas une
//      réécriture, et le Mode 3 ne doit pas bouger d'un iota ;
//   3. les deux politiques sont exhaustives et mutuellement exclusives sur
//      chaque question du contrat.
//
// La propriété 1 est celle qui empêche le domaine de dépendre du CONTENU DU
// PANIER plutôt que du site. Sans elle, une boutique marchande pourrait
// encaisser une commande qu'aucun moteur ne saurait exécuter.

import { describe, it, expect } from 'vitest'
import { MODE2_CHECKOUT_POLICY } from '@/lib/mode2/checkoutPolicy'
import { MODE3_CHECKOUT_POLICY } from '@/lib/mode3/checkoutPolicy'
import type { CheckoutPolicy } from '../checkoutPolicy'

const SOUS_TYPES = ['reseller', 'pod_brand', 'pod_custom', null, undefined, 'valeur_inattendue']
const FOURNISSEURS = ['cj', 'printful', 'gelato', 'printify', 'inconnu']

describe('MODE2_CHECKOUT_POLICY — le domaine marchand', () => {
  it('répond au domaine « merchant »', () => {
    expect(MODE2_CHECKOUT_POLICY.domain).toBe('merchant')
  })

  // D2 — c'est LA propriété de la phase 4 côté Mode 2.
  it.each(FOURNISSEURS.flatMap((f) => SOUS_TYPES.map((st) => [f, st] as const)))(
    'REFUSE le produit de catalogue (fournisseur=%s, sous-type=%s)',
    (fournisseur, sousType) => {
      expect(MODE2_CHECKOUT_POLICY.admitsCatalogSupplier(fournisseur, sousType)).toBe(false)
    }
  )

  it('refuse aussi un fournisseur absent ou vide', () => {
    expect(MODE2_CHECKOUT_POLICY.admitsCatalogSupplier(null, null)).toBe(false)
    expect(MODE2_CHECKOUT_POLICY.admitsCatalogSupplier(undefined, undefined)).toBe(false)
    expect(MODE2_CHECKOUT_POLICY.admitsCatalogSupplier('', null)).toBe(false)
  })

  it('n’exige aucune contrainte propre à une avance de fonds', () => {
    expect(MODE2_CHECKOUT_POLICY.strictCatalogStock).toBe(false)
    expect(MODE2_CHECKOUT_POLICY.requiresDeliverableCountry).toBe(false)
    expect(MODE2_CHECKOUT_POLICY.requiresResolvedShipping).toBe(false)
    expect(MODE2_CHECKOUT_POLICY.countsMappedProductCost).toBe(false)
    expect(MODE2_CHECKOUT_POLICY.enforcesSupplierFinancialGuards).toBe(false)
  })

  // M2-01 — le marchand perçoit l'intégralité du paiement.
  it.each([0, 10, 99.99, 10_000])('aucune commission ni frais, quel que soit le montant (%s)', (montant) => {
    expect(MODE2_CHECKOUT_POLICY.commission(montant)).toBe(0)
    expect(MODE2_CHECKOUT_POLICY.applicationFee(montant, montant, montant)).toBe(0)
  })
})

describe('MODE3_CHECKOUT_POLICY — le domaine fournisseur, règles DÉPLACÉES à l’identique', () => {
  it('répond au domaine « supplier »', () => {
    expect(MODE3_CHECKOUT_POLICY.domain).toBe('supplier')
  })

  it('exige tout ce qu’une avance de fonds impose', () => {
    expect(MODE3_CHECKOUT_POLICY.strictCatalogStock).toBe(true)
    expect(MODE3_CHECKOUT_POLICY.requiresDeliverableCountry).toBe(true)
    expect(MODE3_CHECKOUT_POLICY.requiresResolvedShipping).toBe(true)
    expect(MODE3_CHECKOUT_POLICY.countsMappedProductCost).toBe(true)
    expect(MODE3_CHECKOUT_POLICY.enforcesSupplierFinancialGuards).toBe(true)
  })

  // Cloisonnement strict par sous-type — règle métier INCHANGÉE.
  it.each([
    ['reseller', 'cj', true],
    ['reseller', 'printful', false],
    ['reseller', 'gelato', false],
    ['pod_brand', 'printful', true],
    ['pod_brand', 'gelato', true],
    ['pod_brand', 'cj', false],
    ['pod_custom', 'printful', true],
    ['pod_custom', 'gelato', true],
    ['pod_custom', 'cj', false],
    // Sous-type absent : repli historique sur CJ, comportement conservé.
    [null, 'cj', true],
    [null, 'printful', false],
  ])('sous-type=%s + fournisseur=%s -> %s', (sousType, fournisseur, attendu) => {
    expect(MODE3_CHECKOUT_POLICY.admitsCatalogSupplier(fournisseur, sousType)).toBe(attendu)
  })

  it('refuse un fournisseur absent — jamais d’admission par défaut', () => {
    expect(MODE3_CHECKOUT_POLICY.admitsCatalogSupplier(null, 'reseller')).toBe(false)
    expect(MODE3_CHECKOUT_POLICY.admitsCatalogSupplier(undefined, 'reseller')).toBe(false)
    expect(MODE3_CHECKOUT_POLICY.admitsCatalogSupplier('', 'reseller')).toBe(false)
  })

  it('la commission et les frais reproduisent le calcul d’origine', () => {
    // 6 % du total ; frais = coût fournisseur + livraison + commission.
    expect(MODE3_CHECKOUT_POLICY.commission(20)).toBe(1.2)
    expect(MODE3_CHECKOUT_POLICY.applicationFee(10, 6, 1.2)).toBe(17.2)
  })
})

describe('les deux politiques couvrent le contrat de façon exhaustive', () => {
  const CLES: (keyof CheckoutPolicy)[] = [
    'domain',
    'strictCatalogStock',
    'requiresDeliverableCountry',
    'requiresResolvedShipping',
    'countsMappedProductCost',
    'enforcesSupplierFinancialGuards',
    'admitsCatalogSupplier',
    'commission',
    'applicationFee',
  ]

  it.each(CLES)('les deux répondent à « %s »', (cle) => {
    expect(MODE2_CHECKOUT_POLICY[cle]).toBeDefined()
    expect(MODE3_CHECKOUT_POLICY[cle]).toBeDefined()
  })

  it('aucune question n’est laissée sans réponse par l’une des deux', () => {
    // Si une clé du contrat était ajoutée sans être implémentée des deux
    // côtés, TypeScript le verrait — mais ce test le rend visible aussi au
    // moment de l'exécution, y compris pour un objet construit dynamiquement.
    expect(Object.keys(MODE2_CHECKOUT_POLICY).sort()).toEqual(Object.keys(MODE3_CHECKOUT_POLICY).sort())
  })

  it('elles divergent sur TOUTES les décisions de domaine — aucune n’est un doublon', () => {
    expect(MODE2_CHECKOUT_POLICY.domain).not.toBe(MODE3_CHECKOUT_POLICY.domain)
    expect(MODE2_CHECKOUT_POLICY.strictCatalogStock).not.toBe(MODE3_CHECKOUT_POLICY.strictCatalogStock)
    expect(MODE2_CHECKOUT_POLICY.requiresDeliverableCountry).not.toBe(MODE3_CHECKOUT_POLICY.requiresDeliverableCountry)
    expect(MODE2_CHECKOUT_POLICY.requiresResolvedShipping).not.toBe(MODE3_CHECKOUT_POLICY.requiresResolvedShipping)
    expect(MODE2_CHECKOUT_POLICY.countsMappedProductCost).not.toBe(MODE3_CHECKOUT_POLICY.countsMappedProductCost)
    expect(MODE2_CHECKOUT_POLICY.enforcesSupplierFinancialGuards).not.toBe(
      MODE3_CHECKOUT_POLICY.enforcesSupplierFinancialGuards
    )
    expect(MODE2_CHECKOUT_POLICY.admitsCatalogSupplier('cj', 'reseller')).not.toBe(
      MODE3_CHECKOUT_POLICY.admitsCatalogSupplier('cj', 'reseller')
    )
    expect(MODE2_CHECKOUT_POLICY.commission(20)).not.toBe(MODE3_CHECKOUT_POLICY.commission(20))
  })
})
