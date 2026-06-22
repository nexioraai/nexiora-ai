import 'server-only';

/**
 * Authentification CJ Dropshipping — CÔTÉ SERVEUR UNIQUEMENT.
 * Le token CJ expire (~180 jours). On l'obtient depuis la clé API du marchand
 * (format CJUserNum@api@xxxx) et on le met en cache en mémoire par marchand.
 */
const CJ_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

type CachedToken = { token: string; expiresAt: number };
const _cache = new Map<string, CachedToken>();

export async function getCjToken(email: string, apiKey: string): Promise<string> {
  const cached = _cache.get(email);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const res = await fetch(`${CJ_BASE}/authentication/getAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });

  const data = await res.json();
  if (!data.result || !data.data?.accessToken) {
    throw new Error(`Échec authentification CJ : ${data.message || 'réponse invalide'}`);
  }

  const expiresAt = Date.now() + 180 * 24 * 60 * 60 * 1000;
  _cache.set(email, { token: data.data.accessToken, expiresAt });
  return data.data.accessToken;
}
