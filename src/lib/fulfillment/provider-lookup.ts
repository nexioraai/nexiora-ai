import 'server-only';

// ============================================================
// P0-3.7 Phase 14 — Lookup par clé (réconciliation), NON exposé via
// SupplierAdapter (le contrat générique — src/lib/suppliers/supplier-adapter.ts
// — n'a jamais eu de méthode de recherche, confirmé exhaustivement en
// P0-3.7O ; l'ajouter forcerait à toucher printify/cj-adapter.ts
// sans nécessité). Suit le précédent CJ : cjGetOrderDetail() (src/lib/cj/client.ts)
// est aussi une fonction autonome, pas une méthode d'interface.
// ============================================================

export interface ProviderLookupResult {
  found: boolean;
  providerOrderId?: string;
  rawStatus?: string;
  raw?: unknown;
  /** true si le lookup n'a pas pu être exécuté (endpoint non confirmé), à distinguer d'un "found: false" réel. */
  notImplemented?: boolean;
}

/**
 * [NON DÉMONTRÉ] La syntaxe `GET /orders/@{external_id}` n'a été confirmée
 * directement que pour l'endpoint Products (P0-3.7L), pas explicitement
 * pour Orders — inférence forte, non vérifiée par un appel réel dans
 * cette série. À valider empiriquement (P0-3.7 Final Gate, non-blocker
 * n°6) avant activation en production.
 */
export async function lookupPrintfulOrderByExternalId(
  externalId: string,
  token: string
): Promise<ProviderLookupResult> {
  const res = await fetch(`https://api.printful.com/orders/@${encodeURIComponent(externalId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return { found: false };
  if (!res.ok) {
    throw new Error(`Printful lookup ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = await res.json();
  const order = json.result;
  return {
    found: true,
    providerOrderId: String(order?.id ?? ''),
    rawStatus: order?.status,
    raw: order,
  };
}

/**
 * [NON DÉMONTRÉ] Aucun endpoint de lookup Gelato par orderReferenceId n'a
 * été confirmé dans cette série (Search Orders v4 n'accepte pas
 * orderReferenceId comme filtre, confirmé P0-3.9.1 via le schéma OpenAPI
 * officiel). Volontairement NON implémenté plutôt que d'inventer un appel
 * non vérifié qui échouerait silencieusement ou pire, de façon incorrecte,
 * en production.
 */
export async function lookupGelatoOrderByReferenceId(
  _orderReferenceId: string,
  _apiKey: string
): Promise<ProviderLookupResult> {
  return { found: false, notImplemented: true };
}

export interface GelatoOrderItem {
  itemReferenceId: string;
}

export interface GelatoOrderDetails {
  found: boolean;
  orderId?: string;
  orderReferenceId?: string;
  fulfillmentStatus?: string;
  items?: GelatoOrderItem[];
  raw?: unknown;
}

/**
 * [OFFICIEL, P0-3.9.1] `GET /v4/orders/{orderId}` confirmé par la
 * spécification OpenAPI officielle (`openapi/gelato-orders-api-openapi.yml`,
 * opérationId `getOrder`) — retourne l'objet `Order` complet, y compris
 * `items[].itemReferenceId` (schéma `OrderItem`, confirmé). Utilisé en
 * enrichissement après un webhook (P0-3.9.6 Gap #1A) : le webhook sert de
 * déclencheur, cet appel est la source d'information item-level fiable,
 * jamais le payload webhook brut dont la structure exacte des items reste
 * `[NON DÉMONTRÉ]`. Lecture seule, aucune création/modification de commande.
 */
export async function getGelatoOrderById(
  orderId: string,
  apiKey: string
): Promise<GelatoOrderDetails> {
  const res = await fetch(`https://order.gelatoapis.com/v4/orders/${encodeURIComponent(orderId)}`, {
    headers: { 'X-API-KEY': apiKey },
  });
  if (res.status === 404) return { found: false };
  if (!res.ok) {
    throw new Error(`Gelato getOrder ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const order = await res.json();
  const items: GelatoOrderItem[] = Array.isArray(order?.items)
    ? order.items
        .map((it: { itemReferenceId?: string }) => ({ itemReferenceId: it?.itemReferenceId }))
        .filter((it: GelatoOrderItem) => !!it.itemReferenceId)
    : [];
  return {
    found: true,
    orderId: String(order?.id ?? orderId),
    orderReferenceId: order?.orderReferenceId,
    fulfillmentStatus: order?.fulfillmentStatus,
    items,
    raw: order,
  };
}
