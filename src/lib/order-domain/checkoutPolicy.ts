// src/lib/order-domain/checkoutPolicy.ts
//
// PHASE 4 du chantier de séparation Mode 2 / Mode 3.
// Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// ============================================================
// LE CONTRAT D'ADMISSION, PAS SON CONTENU.
//
// Ce fichier ne décide rien et n'implémente rien : il déclare les questions
// que la route de checkout a le droit de poser. Chaque domaine y répond chez
// lui — `mode2/checkoutPolicy.ts`, `mode3/checkoutPolicy.ts`.
//
// POURQUOI UN CONTRAT PLUTÔT QUE DES `if`.
// Avant cette phase, la route portait SEPT branchements directs sur le mode
// du site : stock strict, pays livrable exigé, devis fournisseur exigé, coût
// fournisseur compté, commission, frais d'application, garde-fous financiers.
// Chacun était une règle de domaine écrite dans un fichier partagé. Le
// problème n'était pas leur nombre : c'était qu'un développeur modifiant l'un
// d'eux pour un mode touchait un fichier que l'autre mode traverse aussi.
//
// Avec ce contrat, une évolution Mode 3 se fait dans `mode3/`, invisible
// depuis le chemin Mode 2 — et réciproquement. La route, elle, ne sait plus
// QUELLE règle s'applique : elle sait seulement QUELLE QUESTION poser.
//
// CE QUE CE FICHIER N'A PAS LE DROIT DE CONNAÎTRE : aucun fournisseur, aucun
// sous-type, aucune valeur de mode. Il ne contient que des signatures.
// ============================================================

import type { FulfillmentDomain } from './resolve'

export interface CheckoutPolicy {
  /** Le domaine auquel cette politique répond. Sert au diagnostic et aux tests. */
  readonly domain: FulfillmentDomain

  /**
   * La vérification de stock catalogue doit-elle refuser sur incertitude ?
   *
   * Un domaine où la plateforme avance l'argent au fournisseur ne peut pas se
   * permettre un « peut-être en stock » : toute incertitude devient un refus.
   * Un domaine où le marchand détient son stock n'a pas cette contrainte.
   */
  readonly strictCatalogStock: boolean

  /** Un pays de livraison réellement desservi est-il exigé pour vendre ? */
  readonly requiresDeliverableCountry: boolean

  /**
   * Un coût de livraison confirmé par un fournisseur est-il exigé ?
   *
   * Là où la plateforme avance le port, vendre sans devis confirmé revient à
   * s'engager sur un montant inconnu.
   */
  readonly requiresResolvedShipping: boolean

  /**
   * Le coût d'un produit du marchand porteur d'un identifiant fournisseur
   * doit-il être compté comme un coût avancé ?
   */
  readonly countsMappedProductCost: boolean

  /**
   * Les garde-fous financiers propres à l'avance de fonds s'appliquent-ils ?
   * (coût fournisseur non nul, frais inférieurs à l'encaissement, marge
   * marchande non négative, plafonds de port)
   */
  readonly enforcesSupplierFinancialGuards: boolean

  /**
   * Ce produit du catalogue fournisseur peut-il être vendu par cette boutique ?
   *
   * `siteSubtype` n'est transmis que pour permettre au domaine fournisseur
   * d'appliquer SA règle interne. Un domaine marchand doit l'ignorer
   * entièrement — il n'a aucun fournisseur, donc aucun catalogue à admettre.
   */
  admitsCatalogSupplier(
    supplierId: string | null | undefined,
    siteSubtype: string | null | undefined
  ): boolean

  /** Commission prélevée par la plateforme sur le montant vendu. */
  commission(totalAmount: number): number

  /** Montant retenu par la plateforme sur le paiement Stripe. */
  applicationFee(supplierCost: number, shippingAmount: number, commission: number): number
}
