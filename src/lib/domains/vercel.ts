const VERCEL_API = 'https://api.vercel.com';

function vercelCreds() {
  const token = process.env.VERCEL_API_TOKEN || '';
  const projectId = process.env.VERCEL_PROJECT_ID || '';
  if (!token || !projectId) throw new Error('Identifiants Vercel absents');
  return { token, projectId };
}

export type VercelDomainResult = {
  ok: true;
  alreadyExists: boolean;
  /** Enregistrements a poser dans la zone DNS pour que le domaine resolve. */
  dns: { type: 'A' | 'CNAME'; name: string; value: string }[];
  /**
   * TXT exiges par Vercel pour prouver la propriete du domaine. Tant qu'ils
   * ne sont pas dans la zone, Vercel refuse de servir le domaine et c'est
   * l'ancien hebergeur qui repond.
   */
  verification: { type: string; domain: string; value: string }[];
};

/** Cible Vercel pour la racine (A) et pour www (CNAME). */
export const VERCEL_A_RECORD = '76.76.21.21';
export const VERCEL_CNAME = 'cname.vercel-dns.com';

/**
 * Rattache un domaine au projet Vercel.
 * Partage par les deux parcours : domaine externe apporte par le marchand
 * (qui configure ensuite son DNS lui-meme) et domaine achete via Nexiora
 * (ou l'ecriture DNS est faite par API cote Porkbun).
 * Un domaine deja rattache n'est pas une erreur : l'operation est idempotente.
 */
export async function addDomainToVercel(domain: string): Promise<VercelDomainResult> {
  const { token, projectId } = vercelCreds();
  const res = await fetch(VERCEL_API + '/v10/projects/' + projectId + '/domains', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: domain }),
  });
  const data = await res.json().catch(() => null);

  // Vercel renvoie plusieurs codes pour un domaine deja rattache a CE projet
  // (domain_already_exists, domain_already_in_use...). Aucun n'est une erreur :
  // le domaine est la, il reste seulement a poser le DNS.
  const msg = String(data?.error?.message || '');
  const alreadyExists =
    data?.error?.code === 'domain_already_exists' ||
    data?.error?.code === 'domain_already_in_use' ||
    /already in use/i.test(msg);
  if (!res.ok && !alreadyExists) {
    throw new Error(data?.error?.message || 'Erreur Vercel ' + res.status);
  }

  return {
    ok: true,
    alreadyExists,
    verification: Array.isArray(data?.verification) ? data.verification : [],
    dns: [
      { type: 'A', name: '@', value: VERCEL_A_RECORD },
      { type: 'CNAME', name: 'www', value: VERCEL_CNAME },
    ],
  };
}

/**
 * Etat de verification cote Vercel.
 * verified passe a true quand les enregistrements DNS pointent correctement.
 * L'endpoint /domains/{domain} du projet est le seul fiable : la variante
 * /config renvoie 404 sur cette version d'API.
 */
export async function getVercelDomainStatus(domain: string): Promise<{
  attached: boolean;
  verified: boolean;
  verification: { type: string; domain: string; value: string }[];
}> {
  const { token, projectId } = vercelCreds();
  const res = await fetch(
    VERCEL_API + '/v9/projects/' + projectId + '/domains/' + encodeURIComponent(domain),
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const data = await res.json().catch(() => null);
  if (res.status === 404) return { attached: false, verified: false, verification: [] };
  if (!res.ok) throw new Error(data?.error?.message || 'Erreur Vercel ' + res.status);
  return {
    attached: true,
    verified: data?.verified === true,
    verification: Array.isArray(data?.verification) ? data.verification : [],
  };
}

/**
 * Demande a Vercel de relire le DNS et de valider la propriete du domaine.
 * Sans cet appel, le TXT _vercel peut etre en place sans que Vercel le sache :
 * le domaine reste non verifie et l'ancien hebergeur continue de repondre.
 */
export async function verifyVercelDomain(domain: string): Promise<boolean> {
  const { token, projectId } = vercelCreds();
  const res = await fetch(
    VERCEL_API + '/v9/projects/' + projectId + '/domains/' + encodeURIComponent(domain) + '/verify',
    { method: 'POST', headers: { Authorization: 'Bearer ' + token } }
  );
  const data = await res.json().catch(() => null);
  return res.ok && data?.verified === true;
}

/**
 * Detache un domaine du projet d'hebergement.
 *
 * IDEMPOTENT PAR CONSTRUCTION : un domaine deja absent (404) n'est pas une
 * erreur -- le resultat vise est « ce domaine n'est plus rattache », et il est
 * atteint. Sans cela, un second detachement ou une reprise apres panne
 * echouerait sur un etat pourtant correct.
 */
export async function removeDomainFromVercel(domain: string): Promise<{ ok: true; dejaAbsent: boolean }> {
  const { token, projectId } = vercelCreds();
  const res = await fetch(
    VERCEL_API + '/v9/projects/' + projectId + '/domains/' + encodeURIComponent(domain),
    { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }
  );
  if (res.status === 404) return { ok: true, dejaAbsent: true };
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message || 'Erreur Vercel ' + res.status);
  }
  return { ok: true, dejaAbsent: false };
}
