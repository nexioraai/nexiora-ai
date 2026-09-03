/**
 * Source de verite unique (LOT H, audit Mode 3 global) pour la machine a
 * etats de shop_orders.status, cote application. Reflete EXACTEMENT le
 * graphe applique par le trigger DB `enforce_shop_order_status_transition`
 * (supabase/sql/shop_order_status_machine.sql) -- toute modification de
 * l'un doit etre reportee dans l'autre, ils sont volontairement dupliques
 * (TS ne peut pas lire un fichier .sql au runtime) mais doivent rester
 * identiques. La DB reste la derniere ligne de defense (verifie meme
 * service_role/SQL direct) ; ce module permet a l'application de refuser
 * une transition illegale AVANT l'appel reseau, avec un message clair,
 * sans dupliquer la logique a chaque appelant.
 */
export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'canceled'
  | 'refunded';

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'canceled'],
  paid: ['processing', 'shipped', 'canceled', 'refunded'],
  processing: ['shipped', 'canceled', 'refunded'],
  shipped: ['delivered'],
  delivered: [],
  canceled: [],
  refunded: [],
};

/**
 * true si `to` est atteignable depuis `from` (ou si `from === to`, round-trip
 * toujours autorise -- meme convention que le trigger DB : ce n'est pas une
 * transition, une reecriture de la meme valeur ne peut jamais etre illegale).
 */
export function isLegalOrderStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Statuts pour lesquels l'argent a REELLEMENT ete encaisse et n'a pas ete
 * rendu -- seule definition valable du "revenu" pour le reporting.
 *
 * Passe de cloture (reporting admin) -- cause racine : admin/stats/route.ts
 * codait en dur ['paid','shipped','delivered'] et omettait 'processing'.
 * Or 'processing' n'est atteignable QUE depuis 'paid' (voir
 * ORDER_STATUS_TRANSITIONS ci-dessus) : l'argent est donc deja encaisse.
 * Consequence de l'omission : une commande POD (Printful/Gelato, qui passe
 * par 'processing' via pod-fulfill.ts) disparaissait du chiffre d'affaires,
 * alors qu'une commande CJ au meme stade (qui reste 'paid', cf. audit
 * cj-tracking) y figurait -- sous-evaluation systematique ET asymetrique
 * du POD.
 *
 * 'pending'  : session de paiement creee, jamais payee -> exclu.
 * 'canceled' : rembourse par cancel_shop_order -> exclu.
 * 'refunded' : rembourse (chemin F7) -> exclu.
 *
 * Source unique : toute route de reporting doit importer cette constante
 * plutot que de reecrire une liste, pour ne pas re-diverger.
 */
export const REVENUE_STATUSES: readonly OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered'];

/** true si la commande doit compter dans le chiffre d'affaires. */
export function countsAsRevenue(status: string): boolean {
  return (REVENUE_STATUSES as readonly string[]).includes(status);
}
