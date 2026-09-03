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

export type PurchasePreview = {
  wouldSucceed: boolean;
  costCents: number | null;
  costDisplay: string | null;
  balance: string | null;
  sufficientFunds: boolean;
  withinMonthlySpendLimit: boolean;
  message: string | null;
};

/**
 * Repetition a blanc : execute tous les controles Porkbun (disponibilite,
 * correspondance du prix, eligibilite, fonds, plafond de depense) sans rien
 * acheter ni debiter. Ne consomme pas le quota de creation.
 * A appeler systematiquement avant purchaseDomain.
 */
export async function previewPurchase(domain: string, costCents: number): Promise<PurchasePreview> {
  const data = await pbPost('/domain/create/' + encodeURIComponent(domain), {
    cost: costCents,
    agreeToTerms: 'yes',
    dryRun: true,
  });
  const p = data?.preview || data || {};
  return {
    wouldSucceed: p.wouldSucceed === true,
    costCents: p.cost != null ? Number(p.cost) : null,
    costDisplay: p.costDisplay ?? null,
    balance: p.balance ?? null,
    sufficientFunds: p.sufficientFunds !== false,
    withinMonthlySpendLimit: p.withinMonthlySpendLimit !== false,
    message: p.message ?? data?.message ?? null,
  };
}

/**
 * Achat reel. La cle d'idempotence est obligatoire : une nouvelle tentative
 * dans les 24h rejoue le resultat initial au lieu de racheter et refacturer.
 * Elle doit donc etre stable pour une meme intention d'achat (l'id de la ligne
 * site_domains, pas un uuid genere a chaque appel).
 */
export async function purchaseDomain(
  domain: string,
  costCents: number,
  idempotencyKey: string
): Promise<{ ok: true; raw: any }> {
  const { apikey, secretapikey } = creds();
  const res = await fetch(PORKBUN_BASE + '/domain/create/' + encodeURIComponent(domain), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ apikey, secretapikey, cost: costCents, agreeToTerms: 'yes' }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.status !== 'SUCCESS') {
    throw new Error('Porkbun achat ' + res.status + ': ' + (data?.message || 'echec'));
  }
  return { ok: true, raw: data };
}

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'ALIAS' | 'TXT' | 'MX' | 'NS' | 'CAA';

export type DnsRecord = {
  id: string;
  name: string;
  type: string;
  content: string;
  ttl: string;
  prio: string | null;
};

/**
 * Cree un enregistrement DNS.
 * name : sous-domaine SANS le domaine. Chaine vide pour la racine, '*' pour
 * un joker. ttl : minimum et defaut 600 secondes.
 */
export async function createDnsRecord(
  domain: string,
  record: { type: DnsRecordType; name?: string; content: string; ttl?: number; prio?: number }
): Promise<string> {
  const body: Record<string, unknown> = {
    type: record.type,
    content: record.content,
    name: record.name ?? '',
    ttl: String(record.ttl ?? 600),
  };
  if (record.prio != null) body.prio = String(record.prio);
  const data = await pbPost('/dns/create/' + encodeURIComponent(domain), body);
  return String(data.id ?? '');
}

/** Tous les enregistrements du domaine, tous types confondus. */
export async function listDnsRecords(domain: string): Promise<DnsRecord[]> {
  const data = await pbPost('/dns/retrieve/' + encodeURIComponent(domain));
  return (data.records || []) as DnsRecord[];
}

/** Supprime tous les enregistrements d'un type pour un sous-domaine donne. */
export async function deleteDnsByNameType(
  domain: string,
  type: DnsRecordType,
  subdomain = ''
): Promise<void> {
  const path = '/dns/deleteByNameType/' + encodeURIComponent(domain) + '/' + type +
    (subdomain ? '/' + encodeURIComponent(subdomain) : '');
  await pbPost(path);
}

/** Domaines presents sur le compte Nexiora. */
export async function listAllDomains(): Promise<{ domain: string; status: string }[]> {
  const data = await pbPost('/domain/listAll');
  return (data.domains || []).map((d: any) => ({ domain: d.domain, status: d.status }));
}

/** Test d'authentification. */
export async function ping(): Promise<string> {
  const data = await pbPost('/ping');
  return data.yourIp || '';
}

// ============================================================
// F-2 -- ARRETER LE RENOUVELLEMENT, LA SEULE RESILIATION QUE L'API PERMET.
//
// CE QUE L'API NE PERMET PAS, ET QU'IL NE FAUT DONC JAMAIS PROMETTRE : il
// n'existe AUCUN endpoint de suppression ou d'annulation d'un domaine. Un
// domaine enregistre existe jusqu'a son expiration. « Resilier » ne peut donc
// signifier qu'une chose : cesser de le renouveler et le laisser expirer.
// Toute formulation promettant une suppression immediate serait fausse.
//
// L'API n'expose pas davantage de code d'autorisation pour un transfert
// SORTANT (les endpoints de transfert couvrent l'entrant seul) : un depart
// client reste une operation manuelle. C'est une limite du fournisseur, pas
// une omission de ce module.
// ============================================================
export async function updateAutoRenew(domain: string, actif: boolean): Promise<{ ok: true }> {
  const { apikey, secretapikey } = creds();
  const res = await fetch(PORKBUN_BASE + '/domain/updateAutoRenew/' + encodeURIComponent(domain), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey, secretapikey, status: actif ? 'on' : 'off' }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.status !== 'SUCCESS') {
    throw new Error('Porkbun updateAutoRenew ' + res.status + ': ' + (data?.message || 'echec'));
  }
  return { ok: true };
}
