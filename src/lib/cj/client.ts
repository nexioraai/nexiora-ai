import 'server-only';
import { getCjToken } from './auth';

const CJ_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

/** Appel générique authentifié à l'API CJ — CÔTÉ SERVEUR UNIQUEMENT. */
export async function cjFetch(
  email: string,
  apiKey: string,
  path: string,
  options: { method?: string; body?: any } = {}
): Promise<any> {
  const token = await getCjToken(email, apiKey);
  const res = await fetch(`${CJ_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'CJ-Access-Token': token,
      'Content-Type': 'application/json',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await res.json();
  if (!data.result) {
    throw new Error(`Erreur API CJ (${path}) : ${data.message || 'inconnue'}`);
  }
  return data.data;
}

/** Recherche de produits CJ par mot-clé (liste paginée). */
export async function cjSearchProducts(
  email: string,
  apiKey: string,
  keyword: string,
  pageNum = 1,
  pageSize = 20
): Promise<any> {
  const params = new URLSearchParams({
    pageNum: String(pageNum),
    pageSize: String(pageSize),
    productNameEn: keyword,
  });
  return cjFetch(email, apiKey, `/product/list?${params.toString()}`);
}

/** Variants d'un produit CJ (pour récupérer le vid + prix). */
export async function cjGetVariants(
  email: string,
  apiKey: string,
  pid: string
): Promise<any> {
  return cjFetch(email, apiKey, `/product/variant/query?pid=${encodeURIComponent(pid)}`);
}

/** Calcule les options logistiques CJ pour une destination (triées par pertinence). */
export async function cjCalculateFreight(
  email: string,
  apiKey: string,
  endCountryCode: string,
  products: { vid: string; quantity: number }[],
  startCountryCode = 'CN'
): Promise<any> {
  return cjFetch(email, apiKey, '/logistic/freightCalculate', {
    method: 'POST',
    body: { startCountryCode, endCountryCode, products },
  });
}

/** Crée une commande dropshipping chez CJ (createOrderV2). */
export async function cjCreateOrder(
  email: string,
  apiKey: string,
  order: Record<string, any>
): Promise<any> {
  return cjFetch(email, apiKey, '/shopping/order/createOrderV2', {
    method: 'POST',
    body: order,
  });
}

/**
 * Récupère le détail d'une commande CJ par orderId.
 * Accepte aussi notre orderNumber custom (= id Supabase de la commande).
 * Renvoie null si aucune commande n'existe (garde-fou anti double-création).
 */
export async function cjGetOrderDetail(
  email: string,
  apiKey: string,
  orderId: string
): Promise<any | null> {
  try {
    return await cjFetch(
      email,
      apiKey,
      `/shopping/order/getOrderDetail?orderId=${encodeURIComponent(orderId)}`
    );
  } catch {
    // CJ renvoie une erreur "order not found" → pas de commande existante.
    return null;
  }
}

/** Lit le solde du compte CJ (USD). Garde-fou avant paiement auto. */
export async function cjGetBalance(
  email: string,
  apiKey: string
): Promise<number> {
  const data = await cjFetch(email, apiKey, '/shopping/pay/getBalance');
  return Number(data?.amount ?? data?.balance ?? 0);
}
/** Stock total disponible d'une variante CJ (somme tous entrepots). 0 = epuise. */
export async function cjGetInventory(
  email: string,
  apiKey: string,
  vid: string
): Promise<number> {
  const data = await cjFetch(email, apiKey, `/product/stock/queryByVid?vid=${encodeURIComponent(vid)}`);
  const rows = Array.isArray(data) ? data : [];
  return rows.reduce((sum: number, r: any) => sum + (Number(r?.totalInventoryNum) || 0), 0);
}
