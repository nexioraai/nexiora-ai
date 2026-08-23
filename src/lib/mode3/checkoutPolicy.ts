// src/lib/mode3/checkoutPolicy.ts
//
// PHASE 4 du chantier de séparation Mode 2 / Mode 3.
// Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// ============================================================
// LE DOMAINE FOURNISSEUR — règles d'admission au checkout.
//
// Toutes les réponses ci-dessous sont un DÉPLACEMENT, pas une réécriture :
// chacune reproduit à l'identique un branchement qui vivait dans
// `checkout/route.ts`. Le comportement Mode 3 doit rester strictement
// inchangé — c'est la contrainte centrale de cette phase, et elle est
// vérifiée par les 96 tests de caractérisation du checkout.
//
// Ce qui les justifie, en une phrase : la plateforme AVANCE l'argent au
// fournisseur. Toute incertitude non levée avant la vente devient une perte
// sèche, jamais une simple gêne. D'où le stock strict, le pays exigé, le
// devis exigé, et les garde-fous financiers.
//
// `suppliersForDropshipType` reste la source unique du cloisonnement par
// sous-type. Elle est appelée ICI, à l'intérieur du domaine — jamais pour
// déterminer le domaine lui-même, ce qui serait la confusion que ce chantier
// corrige.
// ============================================================

import 'server-only'
import type { CheckoutPolicy } from '@/lib/order-domain/checkoutPolicy'
import { suppliersForDropshipType } from '@/lib/dropship/suppliers'
import { roundMoney, NEXIORA_COMMISSION_PERCENT } from '@/lib/pricing'

export const MODE3_CHECKOUT_POLICY: CheckoutPolicy = {
  domain: 'supplier',

  // Un « peut-être en stock » chez le fournisseur devient un refus : la
  // plateforme paierait un produit qu'elle ne peut pas faire livrer.
  strictCatalogStock: true,

  // Le fournisseur doit pouvoir livrer la destination, sinon la vente
  // n'est pas honorable.
  requiresDeliverableCountry: true,

  // Aucun coût de livraison confirmé = aucun engagement à l'aveugle.
  requiresResolvedShipping: true,

  // Un produit du marchand porteur d'un identifiant fournisseur est un vrai
  // dropship : son coût est avancé, donc compté.
  countsMappedProductCost: true,

  // Coût fournisseur non nul, frais inférieurs à l'encaissement, marge
  // marchande non négative, plafonds de port.
  enforcesSupplierFinancialGuards: true,

  // Cloisonnement strict par sous-type — règle métier inchangée.
  admitsCatalogSupplier(supplierId, siteSubtype): boolean {
    if (!supplierId) return false
    return suppliersForDropshipType(siteSubtype as never).includes(supplierId)
  },

  commission(totalAmount: number): number {
    return roundMoney(totalAmount * (NEXIORA_COMMISSION_PERCENT / 100))
  },

  applicationFee(supplierCost: number, shippingAmount: number, commission: number): number {
    return roundMoney(supplierCost + shippingAmount + commission)
  },
}
