import 'server-only';
import { getCjToken } from './auth';
import { acquireCjSlot } from './rateLimiter';
import { fetchWithTimeout } from '@/lib/http/fetchWithTimeout';

const CJ_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

/**
 * Erreur API CJ enrichie du code numérique CJ (ex: 1600300, 1603003) et du
 * statut HTTP réel quand présents. Champs additifs : tout appelant existant
 * qui ne lit que `.message` continue de fonctionner a l'identique.
 *
 * `httpStatus` (audit hostile, Phase 4) : CJ ne documente aucun code CJ
 * distinct pour le rate-limit (contrairement à 1603003/1600300) -- le statut
 * HTTP réel est un signal plus fiable qu'une comparaison de sous-chaîne du
 * message quand il vaut effectivement 429. Les deux signaux sont combinés
 * (fulfill.ts:isRateLimitError) car on ne sait pas avec certitude si CJ
 * renvoie systématiquement un vrai 429 HTTP ou parfois un 200 avec enveloppe
 * d'erreur -- non documenté, non prouvable sans appel réel de test.
 */
export class CjApiError extends Error {
  code: number | null;
  httpStatus: number | null;
  constructor(message: string, code: number | null, httpStatus: number | null = null) {
    super(message);
    this.name = 'CjApiError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/**
 * Appel générique authentifié à l'API CJ — CÔTÉ SERVEUR UNIQUEMENT.
 *
 * Rate-limit GLOBAL (audit hostile, Phase 1-2) : `acquireCjSlot()` réclame
 * atomiquement le prochain créneau via une ligne Supabase partagée avant
 * tout appel réseau réel -- couvre automatiquement TOUS les appelants
 * (fulfillment, réconciliation, tracking, crons catalogue, route
 * shipping-estimate visiteur, cj-adapter) sans dépendre d'un throttle
 * mémoire local à chaque site d'appel, qui ne protège qu'une seule
 * invocation serverless à la fois.
 */
export async function cjFetch(
  email: string,
  apiKey: string,
  path: string,
  options: { method?: string; body?: any } = {}
): Promise<any> {
  await acquireCjSlot();
  const token = await getCjToken(email, apiKey);
  const res = await fetchWithTimeout(`${CJ_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'CJ-Access-Token': token,
      'Content-Type': 'application/json',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await res.json();
  if (!data.result) {
    throw new CjApiError(`Erreur API CJ (${path}) : ${data.message || 'inconnue'}`, data.code ?? null, res.status);
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
 * Annule une commande chez CJ (DELETE /shopping/order/deleteOrder).
 * Endpoint verifie par appel reel : POST renvoie 'method not supported',
 * seul DELETE fonctionne. Leve une erreur si CJ refuse (deja expediee, etc.).
 */
export async function cjCancelOrder(
  email: string,
  apiKey: string,
  cjOrderId: string
): Promise<any> {
  return cjFetch(
    email,
    apiKey,
    `/shopping/order/deleteOrder?orderId=${encodeURIComponent(cjOrderId)}`,
    { method: 'DELETE' }
  );
}

export type CjOrderDetailResult =
  | { outcome: 'found'; data: any }
  | { outcome: 'not_found' }
  | { outcome: 'unknown'; reason: string };

/**
 * Récupère le détail d'une commande CJ par orderId. Accepte aussi notre
 * orderNumber custom (= id Supabase de la commande) -- vérifié empiriquement
 * en lecture réelle sur des commandes historiques (audit Reseller/CJ).
 *
 * Distingue explicitement 3 issues, jamais 2 (audit Reseller/CJ §3-4) :
 *   - 'not_found' : CJ confirme l'absence (code 1600300, "order not found").
 *     Seul ce cas autorise une éventuelle création côté appelant.
 *   - 'found' : la commande existe, `data.orderStatus` doit être classifié
 *     via statusMap.ts par l'appelant, jamais comparé ici directement.
 *   - 'unknown' : timeout, réseau, 429, 5xx, code CJ inattendu, réponse
 *     malformée -- toute autre situation. Ne doit JAMAIS être traité comme
 *     'not_found' : une commande peut très bien exister chez CJ sans que
 *     nous ayons pu l'obtenir (c'est précisément le scénario crash/timeout
 *     après createOrderV2 que ce type existe pour représenter fidèlement).
 */
export async function cjGetOrderDetail(
  email: string,
  apiKey: string,
  orderId: string
): Promise<CjOrderDetailResult> {
  try {
    const data = await cjFetch(
      email,
      apiKey,
      `/shopping/order/getOrderDetail?orderId=${encodeURIComponent(orderId)}`
    );
    return { outcome: 'found', data };
  } catch (e: unknown) {
    if (e instanceof CjApiError && e.code === 1600300) {
      return { outcome: 'not_found' };
    }
    return { outcome: 'unknown', reason: e instanceof Error ? e.message : String(e) };
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

/** Recherche V2 (Elasticsearch) — supporte mot-clé, SKU, catégorie, prix, tri, pagination. */
export async function cjSearchProductsV2(
  email: string,
  apiKey: string,
  opts: {
    keyWord?: string;
    categoryId?: string;
    startSellPrice?: number;
    endSellPrice?: number;
    orderBy?: string;
    sort?: 'asc' | 'desc';
    countryCode?: string;
    page?: number;
    size?: number;
  } = {}
): Promise<any> {
  const params = new URLSearchParams();
  params.set('page', String(opts.page || 1));
  params.set('size', String(opts.size || 50));
  if (opts.keyWord) params.set('keyWord', opts.keyWord);
  if (opts.categoryId) params.set('categoryId', opts.categoryId);
  if (opts.startSellPrice != null) params.set('startSellPrice', String(opts.startSellPrice));
  if (opts.endSellPrice != null) params.set('endSellPrice', String(opts.endSellPrice));
  if (opts.orderBy) params.set('orderBy', opts.orderBy);
  if (opts.sort) params.set('sort', opts.sort);
  if (opts.countryCode) params.set('countryCode', opts.countryCode);
  const url = `/product/listV2?${params.toString()}`;
  const data = await cjFetch(email, apiKey, url);
  return data;
}

/** Lookup direct par PID ou SKU produit. */
export async function cjGetProductByIdOrSku(
  email: string,
  apiKey: string,
  identifier: string
): Promise<any> {
  try {
    return await cjFetch(email, apiKey, `/product/query?pid=${encodeURIComponent(identifier)}`);
  } catch {
    return cjFetch(email, apiKey, `/product/query?productSku=${encodeURIComponent(identifier)}`);
  }
}

/** Liste complète des catégories CJ (hiérarchique). */
export async function cjGetCategories(
  email: string,
  apiKey: string
): Promise<any[]> {
  return cjFetch(email, apiKey, '/product/getCategory');
}

