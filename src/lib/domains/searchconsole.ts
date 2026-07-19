import { google } from 'googleapis';

/**
 * Client Google Search Console.
 * Authentification par compte de service : la cle JSON est stockee en base64
 * dans l'environnement pour tenir sur une ligne (elle contient des sauts de
 * ligne dans la cle privee).
 */
function getAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64;
  if (!b64) throw new Error('Cle de compte de service Google absente');
  const credentials = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/webmasters'],
  });
}

function siteVerification() {
  return google.siteVerification({ version: 'v1', auth: getAuth() });
}

function searchconsole() {
  return google.searchconsole({ version: 'v1', auth: getAuth() });
}

/**
 * Jeton TXT a poser dans la zone DNS du domaine.
 * Google refuse d'enregistrer une propriete tant que ce TXT n'est pas visible.
 * Nexiora possede la zone Porkbun, donc peut l'ecrire sans intervention du
 * marchand : c'est ce qui rend l'indexation entierement automatique.
 */
export async function getDnsVerificationToken(domain: string): Promise<string> {
  const res = await siteVerification().webResource.getToken({
    requestBody: {
      site: { type: 'INET_DOMAIN', identifier: domain },
      verificationMethod: 'DNS_TXT',
    },
  });
  const token = res.data.token;
  if (!token) throw new Error('Jeton de verification non renvoye');
  return token;
}

/**
 * Declenche la verification cote Google. A appeler APRES ecriture du TXT et
 * un delai de propagation DNS : Google echoue s'il ne voit pas encore
 * l'enregistrement, et il faut alors reessayer plus tard.
 */
export async function verifyDomain(domain: string): Promise<boolean> {
  try {
    await siteVerification().webResource.insert({
      verificationMethod: 'DNS_TXT',
      requestBody: {
        site: { type: 'INET_DOMAIN', identifier: domain },
      },
    });
    return true;
  } catch (e: any) {
    const msg = String(e?.message || '');
    // Propagation DNS incomplete : ce n'est pas un echec definitif.
    if (/token|verification|not found/i.test(msg)) return false;
    throw e;
  }
}

/** Email du compte de service : c'est lui qu'il faut autoriser cote Search Console. */
export function getServiceAccountEmail(): string {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64;
  if (!b64) return '';
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')).client_email || '';
  } catch {
    return '';
  }
}

/** Proprietes deja accessibles au compte de service. */
export async function listSites(): Promise<{ siteUrl: string; permissionLevel: string }[]> {
  const res = await searchconsole().sites.list();
  return (res.data.siteEntry || []).map((s) => ({
    siteUrl: s.siteUrl || '',
    permissionLevel: s.permissionLevel || '',
  }));
}

/**
 * Ajoute une propriete. Google exige ensuite une preuve de propriete :
 * pour un domaine gere par Nexiora, elle se fait par un enregistrement TXT
 * ecrit automatiquement dans la zone Porkbun.
 */
export async function addSite(siteUrl: string): Promise<void> {
  await searchconsole().sites.add({ siteUrl });
}

/** Soumet le sitemap. C'est ce qui declenche la decouverte des pages. */
export async function submitSitemap(siteUrl: string, sitemapUrl: string): Promise<void> {
  await searchconsole().sitemaps.submit({ siteUrl, feedpath: sitemapUrl });
}

/** Etat d'un sitemap deja soumis : pages decouvertes, erreurs, date de lecture. */
export async function getSitemapStatus(siteUrl: string, sitemapUrl: string): Promise<{
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  isPending: boolean;
  errors: number;
  warnings: number;
}> {
  const res = await searchconsole().sitemaps.get({ siteUrl, feedpath: sitemapUrl });
  const d = res.data;
  return {
    lastSubmitted: d.lastSubmitted || null,
    lastDownloaded: d.lastDownloaded || null,
    isPending: d.isPending === true,
    errors: Number(d.errors || 0),
    warnings: Number(d.warnings || 0),
  };
}
