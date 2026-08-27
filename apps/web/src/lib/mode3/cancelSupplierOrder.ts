// src/lib/mode3/cancelSupplierOrder.ts
//
// PHASE 5 du chantier de séparation Mode 2 / Mode 3 — vecteur F4.
// Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// ============================================================
// POINT D'ENTRÉE D'ANNULATION DU DOMAINE FOURNISSEUR.
//
// La route d'annulation (`api/shop/cancel-order`) est traversée par les DEUX
// domaines : un acheteur annule sa commande de la même façon, qu'elle soit
// exécutée par le marchand ou par un fournisseur. Elle importait pourtant
// `cj/client` et portait les identifiants CJ en tête de fichier — c'est le
// vecteur F4 du plan, mesuré par graphe d'imports.
//
// Ce fichier reçoit cette responsabilité. La route ne connaît plus qu'un point
// d'entrée de domaine, jamais un fournisseur : c'est exactement la forme
// retenue en phase 3 pour l'aiguillage post-paiement (règle A5), reprise ici
// sans rien inventer.
//
// CE QUI N'A PAS CHANGÉ, ET NE DOIT PAS CHANGER :
//   · le déclencheur reste la présence d'une commande fournisseur — jamais le
//     mode du site, jamais le sous-type ;
//   · l'échec du fournisseur reste un refus 409 côté route, avant toute
//     transition d'état et avant toute restauration de stock ;
//   · l'anomalie `cancel_refused_by_supplier` conserve son type, sa sévérité
//     et son contenu.
//
// CE QUI N'EST PAS AJOUTÉ ICI, VOLONTAIREMENT : l'annulation POD. Son absence
// est une dette déjà inscrite au plan ; la combler serait un changement de
// comportement, pas une séparation. Ce fichier déplace, il n'étend pas.
// ============================================================

import 'server-only'
import { cjCancelOrder } from '@/lib/cj/client'
import { logAnomaly } from '@/lib/anomaly'

const CJ_EMAIL = process.env.CJ_EMAIL || ''
const CJ_API_KEY = process.env.CJ_API_KEY || ''

export type SupplierCancellation = { ok: true } | { ok: false; reason: string }

/**
 * Demande au fournisseur d'annuler la commande qu'il exécute.
 *
 * La signature ne reçoit ni site ni commande complète : trois primitives
 * suffisent, et rien de plus ne doit franchir cette frontière — le domaine
 * fournisseur n'a pas à connaître le statut local, le moyen de paiement ni le
 * jeton d'annulation de l'acheteur.
 *
 * Ne lève jamais : un fournisseur indisponible est un refus métier, pas une
 * erreur technique à faire remonter jusqu'au `catch` global de la route.
 */
export async function cancelSupplierOrder(params: {
  supplierOrderId: string
  orderId: string
  siteId: string | null
}): Promise<SupplierCancellation> {
  const { supplierOrderId, orderId, siteId } = params

  try {
    await cjCancelOrder(CJ_EMAIL, CJ_API_KEY, supplierOrderId)
    return { ok: true }
  } catch (e: unknown) {
    const reason = e instanceof Error ? e.message : String(e)
    await logAnomaly({
      type: 'cancel_refused_by_supplier',
      severity: 'warning',
      siteId,
      details: { orderId, cjOrderId: supplierOrderId, reason },
    })
    return { ok: false, reason }
  }
}
