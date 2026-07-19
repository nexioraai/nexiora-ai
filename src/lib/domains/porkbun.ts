const PORKBUN_BASE = 'https://api.porkbun.com/api/json/v3';

export type DomainCheck = {
  domain: string;
  available: boolean;
  priceUsd: number | null;
  priceCents: number | null;
};

export type RegistrationRequirements = {
  apiRegisterable: boolean;
  registrationDurationYears: number | null;
};

function creds() {
  const apikey = process.env.PORKBUN_API_KEY || '';
  const secretapikey = process.env.PORKBUN_SECRET_API_KEY || '';
  if (!apikey || !secretapikey) throw new Error('Identifiants Porkbun absents');
  return { apikey, secretapikey };
}

async function pbPost(path: string, body: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(PORKBUN_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...creds(), ...body }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.status !== 'SUCCESS') {
    throw new Error('Porkbun ' + res.status + ': ' + (data?.message || 'reponse invalide'));
  }
  return data;
}

async function pbGet(path: string): Promise<any> {
  const { apikey, secretapikey } = creds();
  const res = await fetch(PORKBUN_BASE + path, {
    headers: { 'X-API-Key': apikey, 'X-Secret-API-Key': secretapikey },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.status !== 'SUCCESS') {
    throw new Error('Porkbun ' + res.status + ': ' + (data?.message || 'reponse invalide'));
  }
  return data;
}

/** Verification de disponibilite. ATTENTION : limite a 1 appel toutes les 10s. */
export async function checkDomain(domain: string): Promise<DomainCheck> {
  const data = await pbPost('/domain/checkDomain/' + encodeURIComponent(domain));
  const r = data?.response || {};
  const priceUsd = r.price != null ? Number(r.price) : null;
  return {
    domain,
    available: r.avail === 'yes',
    priceUsd: Number.isFinite(priceUsd as number) ? priceUsd : null,
    // create attend des cents entiers et refuse tout ecart avec le devis.
    priceCents: priceUsd != null ? Math.round(priceUsd * 100) : null,
  };
}

/** Certains TLD (.ca, .us, .eu, .au) ne sont pas enregistrables par API. */
export async function getRegistrationRequirements(tld: string): Promise<RegistrationRequirements> {
  const data = await pbGet('/domain/getRegistrationRequirements/' + encodeURIComponent(tld));
  return {
    apiRegisterable: data?.apiRegisterable === true,
    registrationDurationYears: data?.registrationDurationYears ?? null,
  };
}

/** Tarifs publics par TLD. Aucune authentification requise cote Porkbun. */
export async function getPricing(): Promise<Record<string, any>> {
  const res = await fetch(PORKBUN_BASE + '/pricing/get');
  const data = await res.json().catch(() => null);
  if (data?.status !== 'SUCCESS') throw new Error('Porkbun pricing indisponible');
  return data.pricing || {};
}

/** Test d'authentification. */
export async function ping(): Promise<string> {
  const data = await pbPost('/ping');
  return data.yourIp || '';
}
