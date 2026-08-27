import 'server-only';

/**
 * Traduction statut CJ brut -> classification métier fermée.
 *
 * Audit Reseller/CJ : plus aucun code (fulfill.ts, reconcile.ts) ne doit
 * comparer une chaîne `orderStatus` CJ directement. Ce fichier est le seul
 * endroit où ces chaînes sont lues.
 *
 * Statuts officiellement documentés (developers.cjdropshipping.cn, sections
 * "Query Order" + "List Order", vérifié en direct pendant l'audit) :
 *   CREATED, IN_CART, UNPAID, PENDING, PROCESSING, UNSHIPPED, SHIPPED,
 *   DELIVERED, CANCELLED (+ OTHER, filtre de liste uniquement).
 *
 * UNSHIPPED est documenté "payée, en attente d'envoi" et englobe PENDING et
 * PROCESSING comme sous-statuts -- les trois sont donc traités comme payés,
 * pas seulement UNSHIPPED (correction explicite d'une classification
 * antérieure trop restrictive qui n'incluait que UNSHIPPED/SHIPPED/DELIVERED).
 *
 * CREATED et UNPAID ne sont PAS fusionnés parce que leur nuance technique
 * serait la même -- elle reste non documentée (🔴) -- mais parce qu'aucune
 * des deux n'appartient à la famille payée ni à la famille terminale : pour
 * notre unique décision métier ("faut-il alerter pour paiement manuel ?"),
 * les deux appellent la même réponse. La distinction technique reste
 * ouverte ; la décision métier ne l'exige pas.
 *
 * TRASH est observé empiriquement (commande historique réelle) mais absent
 * des deux tables de documentation consultées. Traité par précaution comme
 * CANCELLED (terminal, décision de recréation non prouvée -- cf. TERMINAL_STATUSES).
 */
export type CjStatusClass = 'paid' | 'awaiting' | 'terminal' | 'unrecognized';

const PAID_STATUSES = new Set(['UNSHIPPED', 'PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED']);
const AWAITING_STATUSES = new Set(['CREATED', 'UNPAID']);
const TERMINAL_STATUSES = new Set(['CANCELLED', 'TRASH']);

export function classifyCjOrderStatus(raw: string | null | undefined): CjStatusClass {
  const s = String(raw || '').toUpperCase().trim();
  if (PAID_STATUSES.has(s)) return 'paid';
  if (AWAITING_STATUSES.has(s)) return 'awaiting';
  if (TERMINAL_STATUSES.has(s)) return 'terminal';
  // IN_CART, OTHER, chaîne vide, ou toute valeur non documentée : aucune de
  // nos trois décisions (payé / en attente / mort) n'est justifiée par la
  // documentation. Ne jamais deviner -- cf. audit §11 (UNKNOWN).
  return 'unrecognized';
}
