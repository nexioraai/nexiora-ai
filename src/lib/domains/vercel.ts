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

  const alreadyExists = data?.error?.code === 'domain_already_exists';
  if (!res.ok && !alreadyExists) {
    throw new Error(data?.error?.message || 'Erreur Vercel ' + res.status);
  }

  return {
    ok: true,
    alreadyExists,
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
}> {
  const { token, projectId } = vercelCreds();
  const res = await fetch(
    VERCEL_API + '/v9/projects/' + projectId + '/domains/' + encodeURIComponent(domain),
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const data = await res.json().catch(() => null);
  if (res.status === 404) return { attached: false, verified: false };
  if (!res.ok) throw new Error(data?.error?.message || 'Erreur Vercel ' + res.status);
  return { attached: true, verified: data?.verified === true };
}
