// src/lib/mode3/supplierShipping.ts
//
// PHASE 5 du chantier de séparation Mode 2 / Mode 3 — vecteur F3.
// Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// ============================================================
// POINT D'ENTRÉE DE DEVIS DU DOMAINE FOURNISSEUR.
//
// `shop/quote/resolveShipping.ts` est traversé par les deux domaines : il
// garantit « affiché = facturé » en servant à l'identique l'affichage du
// panier et le checkout. Il importait pourtant `cj/client`, `cj/shipping-
// tiers`, `suppliers/registry` et portait les identifiants CJ — le vecteur F3
// du plan, mesuré par graphe d'imports.
//
// CE QUI VIENT ICI : ce qui parle réellement à un fournisseur.
//   · les identifiants de la plateforme ;
//   · l'appel de fret CJ et sa borne d'attente ;
//   · le registre des fournisseurs capables de calculer un port ;
//   · la lecture d'une réponse fournisseur en paliers.
//
// CE QUI RESTE PARTAGÉ, ET NE DOIT PAS VENIR ICI : le cache de devis, son
// budget d'appels, la purge, la marge de port, les libellés présentés à
// l'acheteur et l'agrégation. Ce sont des responsabilités communes, gelées
// par le plan — les déplacer changerait le propriétaire d'un contrôle
// anti-abus qui protège une route publique.
//
// LA FRONTIÈRE EST DONC : le tronc commun décide QUAND appeler et QUOI
// mémoriser ; ce module sait COMMENT parler au fournisseur et COMMENT lire sa
// réponse. Aucune décision de mode, aucun sous-type, aucune notion de site.
// ============================================================

import 'server-only'
import { suppliersWithCapability } from '@/lib/suppliers/registry'
import { pickThreeTiers, type ShippingTier } from '@/lib/cj/shipping-tiers'
import { cjCalculateFreight } from '@/lib/cj/client'

// Identifiants de la plateforme. Le marchand n'a jamais de compte fournisseur.
const CJ_EMAIL = process.env.CJ_EMAIL || ''
const CJ_API_KEY = process.env.CJ_API_KEY || ''

/** Dérivé : fournisseurs implémentant réellement `calculateShipping`. */
const SHIPPING_SUPPLIERS = new Map(
  suppliersWithCapability('calculateShipping').map((s) => [s.id, s])
)

export type SupplierTier = ShippingTier

export type SupplierShippingLine = {
  supplier_product_id: string
  variant_id?: string
  quantity: number
}

export type SupplierGroupQuote = {
  totalCost: number
  daysMin: number
  daysMax: number
}

/**
 * Appel de fret CJ pour un panier réel, aux quantités réelles.
 *
 * Rend les options BRUTES du fournisseur — jamais des paliers. C'est
 * volontaire : l'appelant mémorise la réponse telle qu'elle a été reçue, pour
 * qu'une évolution de la lecture n'invalide jamais son cache et que la donnée
 * fournisseur reste vérifiable telle quelle.
 *
 * `maxWaitMs` est fourni par l'appelant : la borne d'attente de l'acheteur est
 * une décision du tronc commun, l'exécution de la course appartient ici.
 * Ne lève jamais : `null` signifie « indisponible », l'appelant a son repli.
 */
export async function fetchSupplierBasketOptions(
  lines: SupplierShippingLine[],
  countryCode: string,
  maxWaitMs: number
): Promise<unknown[] | null> {
  try {
    const live = cjCalculateFreight(
      CJ_EMAIL,
      CJ_API_KEY,
      countryCode,
      lines.map((l) => ({ vid: l.supplier_product_id, quantity: l.quantity }))
    )
    // La course borne l'attente de l'acheteur ; la promesse perdante est
    // neutralisee pour ne jamais produire de rejet non gere.
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), maxWaitMs))
    const res = await Promise.race([live.catch(() => null), timeout])
    return Array.isArray(res) ? (res as unknown[]) : null
  } catch {
    return null
  }
}

/**
 * Lit une réponse fournisseur — fraîche ou remise en cache — en paliers.
 * Le tronc commun n'a pas à connaître la forme d'un devis fournisseur.
 */
export function readSupplierTiers(options: unknown): SupplierTier[] | null {
  return pickThreeTiers(options)
}

/**
 * Devis live d'un groupe fournisseur (chemin par fournisseur).
 *
 * `null` = ce fournisseur n'a rien à dire sur ce groupe : soit il n'implémente
 * pas le calcul de port, soit l'appel a échoué. Dans les deux cas l'appelant
 * poursuit avec les autres groupes, comportement inchangé.
 */
export async function quoteSupplierGroup(
  supplierId: string,
  items: SupplierShippingLine[],
  countryCode: string,
  stateCode?: string | null
): Promise<SupplierGroupQuote | null> {
  const supplier = SHIPPING_SUPPLIERS.get(supplierId)
  if (!supplier?.adapter.calculateShipping) return null

  const creds =
    supplierId === 'printful'
      ? { ...supplier.credentials, state_code: stateCode || '' }
      : supplier.credentials

  try {
    const r = await supplier.adapter.calculateShipping(items, countryCode, creds)
    return { totalCost: r.total_cost, daysMin: r.estimated_days_min, daysMax: r.estimated_days_max }
  } catch (err: unknown) {
    // Prefixe de journal conserve a l'identique : les traces existantes
    // restent recherchables apres le deplacement.
    console.error('[resolveShipping]', supplierId, 'failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}
