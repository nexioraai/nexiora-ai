import { NextRequest, NextResponse } from 'next/server';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getVercelDomainStatus, verifyVercelDomain } from '@/lib/domains/vercel';
import { consommerJeton } from '@/lib/rate-limit/rateLimit';

// ============================================================
// D-02 -- LA VERIFICATION BYOD NE SE DECLENCHAIT JAMAIS.
//
// `verifyVercelDomain` n'etait appelee QUE dans le parcours d'achat. Le
// commentaire de `vercel.ts` dit pourtant : « Sans cet appel, le TXT peut
// etre en place sans que l'hebergeur le sache : le domaine reste non verifie
// et l'ancien hebergeur continue de repondre. » Un client BYOD qui posait
// correctement son DNS pouvait rester bloque indefiniment.
//
// L'ENDPOINT EXISTANT EST REUTILISE, pas double. `GET` reste une lecture
// pure ; `POST` demande la re-verification puis rend le MEME etat, par la
// MEME fonction. Deux endpoints auraient diverge.
//
// La borne existe pour que le bouton ne devienne pas une boucle : c'est un
// appel externe, il se paie.
// ============================================================

/** Verifications manuelles autorisees par site et par minute. */
const PLAFOND_VERIFICATIONS_PAR_MINUTE = 6;

/** LES COLONNES DEMANDEES, UNE SEULE FOIS. Les deux verbes doivent projeter
 *  exactement les memes : une projection amputee rendrait le constructeur
 *  d'etat aveugle sur Google, sans qu'aucun test ne le voie. */
const PROJECTION =
  'id, custom_domain, custom_domain_google_status, custom_domain_google_token, custom_domain_google_attempts, custom_domain_google_last_attempt_at, custom_domain_google_last_error';

type SiteStatut = {
  id: string;
  custom_domain: string | null;
  custom_domain_google_status: string | null;
  custom_domain_google_token: string | null;
  custom_domain_google_attempts: number | null;
  custom_domain_google_last_attempt_at: string | null;
  custom_domain_google_last_error: string | null;
};

/** Etat du domaine d'un site, pour affichage au marchand. */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'Slug manquant' }, { status: 400 });

  // ============================================================
  // DETTE 6a, EXTENSION -- `owner_email` N'EST PLUS L'IDENTITE.
  //
  // La garde s'ecrivait `site.owner_email !== user.email` : une comparaison
  // en JavaScript plutot qu'un `.eq()`, mais exactement la meme cle, et donc
  // exactement le meme defaut. `sites.owner_email` est ecrite UNE SEULE
  // FOIS, a la creation du site, et aucun update ne la touche jamais -- un
  // proprietaire qui change d'adresse laisse la colonne figee sur
  // l'ancienne, et quiconque obtient ensuite cette adresse devenait
  // proprietaire aux yeux de cette route.
  //
  // AUCUN MECANISME NOUVEAU : `requireSiteOwner`, primitive canonique --
  // `owner_id` prioritaire, repli sur `owner_email` UNIQUEMENT quand
  // `owner_id` est encore null cote base. Les codes deviennent ceux de la
  // primitive : 401 non authentifie, 404 site inexistant, 403 non
  // proprietaire (la route confondait les deux derniers dans un seul 403).
  // ============================================================
  const auth = await requireSiteOwner(req, slug, PROJECTION);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await construireStatut(auth.site as SiteStatut));
}

/** L'etat complet d'un domaine, partage par `GET` et `POST`. */
async function construireStatut(site: SiteStatut) {

  const { data: domain } = await supabaseAdmin
    .from('site_domains')
    .select('domain, status, purchased_at, dns_configured_at, google_verified_at, sitemap_submitted_at, renews_at, last_error')
    .eq('site_id', site.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // BYOD : le domaine n'est jamais dans site_domains (Nexiora ne possede pas
  // sa zone DNS) — seul un appel Vercel en direct dit s'il est reellement
  // rattache et verifie ; la valeur stockee dans sites.custom_domain seule
  // ne le garantit pas.
  let byodVerification: { attached: boolean; verified: boolean } | null = null;
  let byodTxt: { type: string; name: string; value: string }[] = [];
  // Etat Google BYOD : deja gere par le cron domain-indexing-byod, ici on ne
  // fait que lire les colonnes sites.custom_domain_google_* pour affichage.
  let byodGoogle: {
    status: string | null;
    token: string | null;
    attempts: number | null;
    lastAttemptAt: string | null;
    lastError: string | null;
  } | null = null;
  if (!domain && site.custom_domain) {
    try {
      const st = await getVercelDomainStatus(site.custom_domain);
      byodVerification = { attached: st.attached, verified: st.verified };
      byodTxt = st.verification.map((v) => ({ type: v.type, name: v.domain, value: v.value }));
    } catch (e) {
      console.error('getVercelDomainStatus failed for', site.custom_domain, e);
    }
    byodGoogle = {
      status: site.custom_domain_google_status,
      token: site.custom_domain_google_token,
      attempts: site.custom_domain_google_attempts,
      lastAttemptAt: site.custom_domain_google_last_attempt_at,
      lastError: site.custom_domain_google_last_error,
    };
  }

  return {
    customDomain: site.custom_domain || null,
    purchased: domain || null,
    byodVerification,
    byodTxt,
    byodGoogle,
  };
}

/**
 * Demande une RE-VERIFICATION du domaine aupres de l'hebergeur, puis rend
 * l'etat frais. Meme garde de propriete que `GET`, meme forme de reponse.
 */
export async function POST(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'Slug manquant' }, { status: 400 });

  const auth = await requireSiteOwner(req, slug, PROJECTION);
  if (!auth.ok) return auth.response;
  const site = auth.site as SiteStatut;

  if (!site.custom_domain) {
    return NextResponse.json({ error: 'Aucun domaine a verifier' }, { status: 400 });
  }

  const jeton = await consommerJeton({
    type: 'domain_verify_request',
    siteId: site.id,
    fenetreMs: 60_000,
    plafond: PLAFOND_VERIFICATIONS_PAR_MINUTE,
    message: 'Trop de verifications, reessayez dans une minute.',
    details: { slug, domain: site.custom_domain },
  });
  if (!jeton.ok) return NextResponse.json({ error: jeton.erreur }, { status: jeton.statut });

  // L'ECHEC DE VERIFICATION N'EST PAS UNE ERREUR DE LA ROUTE. Un DNS pas
  // encore propage rend `false` : le client doit voir l'etat, pas un 500.
  let verifie = false;
  let erreurExterne: string | null = null;
  try {
    verifie = await verifyVercelDomain(site.custom_domain);
  } catch (e) {
    erreurExterne = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ ...(await construireStatut(site)), verifie, erreurExterne });
}
