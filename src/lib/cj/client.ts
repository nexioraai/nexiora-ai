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

/** Lit le solde du compte CJ (USD). Garde-fou avant paiement auto. */
export async function cjGetBalance(
  email: string,
  apiKey: string
): Promise<number> {
  const data = await cjFetch(email, apiKey, '/shopping/pay/getBalance');
  return Number(data?.amount ?? data?.balance ?? 0);
}
