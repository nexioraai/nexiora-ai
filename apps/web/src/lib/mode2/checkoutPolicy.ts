// src/lib/mode2/checkoutPolicy.ts
//
// PHASE 4 du chantier de séparation Mode 2 / Mode 3.
// Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// ============================================================
// LE DOMAINE MARCHAND — première brique de `mode2/`.
//
// Une boutique autonome détient son stock, prépare et expédie elle-même. La
// plateforme n'avance rien, ne commande rien à personne, ne prélève rien.
// Toutes les réponses ci-dessous découlent de cette seule phrase.
//
// CE FICHIER N'IMPORTE AUCUN FOURNISSEUR, et ne le peut pas : la règle A1 du
// registre de domaines interdit à tout fichier de `mode2/` d'importer `cj/`,
// `suppliers/`, `dropship/` ou `mode3/`. C'est ce qui garantit qu'une
// évolution du domaine fournisseur ne peut pas atteindre ce chemin.
//
// SUR `admitsCatalogSupplier` — décision produit D2, prise explicitement :
// une boutique Mode 2 ne vend PAS de produit du catalogue fournisseur. Ce
// n'est pas une restriction technique mais la définition même du mode. La
// laisser ouverte reviendrait à faire dépendre le domaine du contenu du
// panier plutôt que du site — et toute la frontière repose sur l'inverse.
// ============================================================

import 'server-only'
import type { CheckoutPolicy } from '@/lib/order-domain/checkoutPolicy'

export const MODE2_CHECKOUT_POLICY: CheckoutPolicy = {
  domain: 'merchant',

  // Le marchand connaît son stock : aucune incertitude fournisseur à arbitrer.
  strictCatalogStock: false,

  // Le marchand expédie où il veut, selon ses propres règles. La plateforme
  // n'a pas à restreindre ses destinations.
  requiresDeliverableCountry: false,

  // Livraison au forfait défini par le marchand : il n'y a aucun devis
  // fournisseur à confirmer, donc rien à exiger.
  requiresResolvedShipping: false,

  // M2-07 / M2-08 -- le marchand tarife lui-meme : aucun fournisseur a
  // interroger, donc ni temporisation de quota ni recherche de groupes.
  consultsSupplierShipping: false,

  // Aucun coût n'est avancé : il n'y a pas de coût fournisseur à compter.
  countsMappedProductCost: false,

  // Les garde-fous financiers protègent une avance de fonds. Sans avance,
  // ils n'ont pas d'objet — le garde-fou « montant nul », lui, reste
  // applicable à tous les modes et vit hors de cette politique.
  enforcesSupplierFinancialGuards: false,

  // D2 — aucun produit du catalogue fournisseur, quel qu'il soit.
  // Les deux paramètres sont ignorés A DESSEIN : ce domaine n'a pas de
  // fournisseur, la question ne se pose donc jamais en ses termes.
  admitsCatalogSupplier(): boolean {
    return false
  },

  // Aucune commission plateforme en Mode 2 (M2-01).
  commission(): number {
    return 0
  },

  // Aucun montant retenu : le marchand perçoit l'intégralité du paiement.
  applicationFee(): number {
    return 0
  },
}
