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
