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
