const PORKBUN_BASE = 'https://api.porkbun.com/api/json/v3';

/** Marge Nexiora, fixe en dollars et non en pourcentage : le travail est
 *  identique quel que soit le prix du TLD. Aligne sur le marche (Squarespace,
 *  Wix, Shopify facturent ~20$ pour un .com qui leur coute ~11$). */
export const NEXIORA_DOMAIN_MARGIN_USD = 10;

export type DomainCheck = {
  domain: string;
  available: boolean;
  premium: boolean;
  firstYearPromo: boolean;
  minDuration: number;
  /** Prix Porkbun de la premiere annee. */
  registrationUsd: number | null;
  /** Cents entiers : /domain/create refuse tout ecart avec ce devis. */
  registrationCents: number | null;
  /** Prix Porkbun du renouvellement annuel. Peut differer de l'achat. */
  renewalUsd: number | null;
  transferUsd: number | null;
  /** Ce que paie le marchand la premiere annee. */
  sellFirstYearUsd: number | null;
  /** Ce que paie le marchand chaque annee ensuite. C'est ce montant qui sert
   *  de base a l'abonnement Stripe : facturer sur le prix promotionnel de
   *  premiere annee ferait perdre de l'argent des le premier renouvellement. */
  sellRenewalUsd: number | null;
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
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const registrationUsd = num(r.price);
  // Un TLD peut avoir une promo la premiere annee et un renouvellement bien
  // plus cher (.store a 3$ puis 40$). Sans le prix de renouvellement, on
  // facturerait a perte des la deuxieme annee.
  const renewalUsd = num(r?.additional?.renewal?.price) ?? registrationUsd;

  return {
    domain,
    available: r.avail === 'yes',
    premium: r.premium === 'yes',
    firstYearPromo: r.firstYearPromo === 'yes',
    minDuration: Number(r.minDuration) || 1,
    registrationUsd,
    registrationCents: registrationUsd != null ? Math.round(registrationUsd * 100) : null,
    renewalUsd,
    transferUsd: num(r?.additional?.transfer?.price),
    sellFirstYearUsd: registrationUsd != null ? registrationUsd + NEXIORA_DOMAIN_MARGIN_USD : null,
    sellRenewalUsd: renewalUsd != null ? renewalUsd + NEXIORA_DOMAIN_MARGIN_USD : null,
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
