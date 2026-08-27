import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAiUsage } from '@/lib/ai-usage';
import { consommerJeton } from '@/lib/rate-limit/rateLimit';
import { buildBriefPrompt, buildContentPrompt, parseJson } from '@/lib/marketing/prompts';
import { createPost, slugifyArticleTitle, ecritureRefusee } from '@/lib/blog';

// ============================================================
// LOT BLOG 4 -- GENERATION D'UN BROUILLON D'ARTICLE.
//
// LE MOTEUR N'EST PAS REECRIT : il est IMPORTE. `buildBriefPrompt` et
// `buildContentPrompt(site, brief, 'article')` sont les fonctions extraites
// au lot 2 depuis `marketing/generate/route.ts`, et elles y sont toujours
// utilisees par cette meme route. Un cliquet (`marketingPrompts.test.ts`)
// echoue si une seule de ces chaines reapparait dans un second fichier.
//
// CE QUI CHANGE PAR RAPPORT A `/api/marketing/generate` :
//   * la sortie n'est plus rendue au navigateur pour copier-coller -- elle
//     devient un BROUILLON PERSISTANT dans `site_blog_posts` ;
//   * une borne de depense est posee : la route marketing n'en a aucune,
//     alors qu'elle enchaine deux appels Claude factures.
//
// CE QUI NE CHANGE PAS : les prompts, mot pour mot, et le cache de brief.
//
// PAS DE GARDE « SITE PUBLIE ». `/api/marketing/generate` refuse un site non
// publie (« Publiez un site pour debloquer le marketing ») : c'est un gating
// COMMERCIAL de cette fonctionnalite-la. Le blog n'en herite pas -- rediger
// un brouillon avant de publier son site est le parcours normal, et un
// brouillon reste invisible du public par construction (la vue
// `site_blog_posts_public` exige `sites.published = true`). Poser cette garde
// ici inventerait une limitation que le produit ne porte pas.
//
// PAS DE `canTransact` : le blog est commun aux trois modes.
// ============================================================

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** Meme fenetre et meme plafond que `/api/blog/generate` : un redacteur
 *  n'ecrit pas dix articles par minute, une boucle si. */
const FENETRE_MS = 60_000;
const PLAFOND_PAR_MINUTE = 3;

/** Nombre de suffixes tentes avant de rendre 409 sur une collision de slug. */
const SUFFIXES_MAX = 5;

function panne(contexte: string, e: unknown) {
  console.error(`[blog/posts/generate] ${contexte}:`, e);
  return NextResponse.json({ error: 'Service momentanément indisponible.' }, { status: 503 });
}

/**
 * Insere en suffixant le slug tant qu'il est deja pris DANS CE SITE.
 *
 * POURQUOI ICI ET PAS AU LOT 3. Sur `POST /api/blog/posts`, le redacteur
 * CHOISIT son lien : lui rendre 409 est une information utile, il corrige.
 * Ici le slug est derive d'un titre que l'IA vient d'inventer -- refuser
 * l'ecriture obligerait a relancer une generation FACTUREE pour un conflit
 * dont l'appelant n'est pas l'auteur.
 *
 * La collision reste bornee au site (`UNIQUE (site_id, slug)`) : deux sites
 * different ne se genent jamais, et aucune boucle n'est infinie.
 */
async function creerAvecSlugLibre(
  siteId: string,
  base: string,
  valeurs: Record<string, unknown>
) {
  for (let n = 1; n <= SUFFIXES_MAX; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    try {
      return await createPost(siteId, { ...valeurs, slug });
    } catch (e) {
      if ((e as { code?: string })?.code !== '23505') throw e;
    }
  }
  return null;
}

/** POST /api/blog/posts/generate -> genere un brouillon. Corps : { site } */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const site = (body as { site?: unknown })?.site;
  if (typeof site !== 'string' || !site) {
    return NextResponse.json({ error: 'Missing site' }, { status: 400 });
  }

  // 1. IDENTITE -- avant toute lecture et toute depense.
  const auth = await requireSiteOwner(req, site, '*');
  if (!auth.ok) return auth.response;
  const siteRow = auth.site as Record<string, unknown> & { id: string };

  // 2. DEPENSE -- bornee AVANT le premier appel facture. Meme autorite et
  //    meme direction de panne que les sept autres surfaces bornees : le
  //    compteur qui ne repond pas REFUSE.
  const jeton = await consommerJeton({
    type: 'blog_generate_request',
    siteId: siteRow.id,
    fenetreMs: FENETRE_MS,
    plafond: PLAFOND_PAR_MINUTE,
    message: 'Trop de générations, réessayez dans une minute.',
    details: { site },
  });
  if (!jeton.ok) return NextResponse.json({ error: jeton.erreur }, { status: jeton.statut });

  try {
    // 3. BRIEF -- cache lu APRES l'autorisation. `marketing_briefs` est
    //    rattachee par `slug` (dette consignee, hors perimetre) : ce n'est
    //    acceptable ICI que parce que `requireSiteOwner` a deja tranche sur
    //    ce slug. Le slug est une CLE DE CACHE deja autorisee, jamais une
    //    autorite.
    let brief: unknown = null;
    const { data: cache } = await supabaseAdmin
      .from('marketing_briefs')
      .select('brief')
      .eq('slug', site)
      .maybeSingle();

    if ((cache as { brief?: unknown } | null)?.brief) {
      brief = (cache as { brief: unknown }).brief;
    } else {
      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: buildBriefPrompt(siteRow) }],
      });
      await logAiUsage({ siteId: siteRow.id, usageType: 'blog', model: 'claude-haiku-4-5-20251001', usage: res.usage });
      brief = parseJson(res.content.map((c) => (c.type === 'text' ? c.text : '')).join(''));

      // CACHE EN LECTURE SEULE, DELIBEREMENT.
      //
      // Ecrire ce cache imposerait de fournir la colonne NOT NULL
      // `marketing_briefs.owner_email` -- donc de propager, dans une route
      // NEUVE, la colonne que la DETTE 6a a passe un chantier a demettre de
      // son role d'identite. Le cliquet `ownerIdentityRatchets` epingle la
      // liste exacte des routes qui la portent encore ; il a mordu ici, et la
      // bonne reponse est de ne pas ecrire, pas d'allonger la liste.
      //
      // `marketing_briefs` est de surcroit rattachee par `slug` et jamais par
      // `site_id` : exactement le patron que ce chantier refuse. Le blog la
      // LIT -- profitant du cache quand `/api/marketing/generate` l'a rempli --
      // il n'en devient pas un second ecrivain.
      //
      // COUT ASSUME ET BORNE : un site qui n'a jamais utilise le marketing
      // paie un brief Haiku a chaque generation. La borne de 3/minute plafonne
      // cette depense.
    }

    // 4. ARTICLE -- meme prompt, mot pour mot, que `/api/marketing/generate`
    //    au format `article`.
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [{ role: 'user', content: buildContentPrompt(siteRow, brief, 'article') }],
    });
    await logAiUsage({ siteId: siteRow.id, usageType: 'blog', model: 'claude-sonnet-4-6', usage: res.usage });
    const contenu = parseJson(res.content.map((c) => (c.type === 'text' ? c.text : '')).join(''));

    const titre = typeof contenu?.titre === 'string' ? contenu.titre.trim() : '';
    const corps = typeof contenu?.contenu === 'string' ? contenu.contenu : '';
    if (!titre || !corps) {
      // La depense a eu lieu ; le resultat est inexploitable. 502 : la faute
      // est du fournisseur, pas de l'appelant -- meme code que la generation
      // de site (`chat/route.ts`) sur un JSON invalide.
      console.error('[blog/posts/generate] sortie IA inexploitable');
      return NextResponse.json(
        { error: 'La génération a produit un résultat invalide. Merci de réessayer.' },
        { status: 502 }
      );
    }

    // 5. BROUILLON -- `site_id` vient du site VERIFIE. Jamais publie d'office :
    //    un texte que personne n'a relu ne paraît pas.
    //
    //    `structure` (le plan de titres) N'EST PAS STOCKE : c'est un
    //    echafaudage de redaction, produit POUR aboutir a `contenu`. Une fois
    //    `contenu` ecrit, il n'a plus de lecteur -- le stocker fabriquerait
    //    une colonne sans consommateur.
    //
    //    `cover_image` reste nul : l'image est le lot 5.
    const post = await creerAvecSlugLibre(siteRow.id, slugifyArticleTitle(titre), {
      title: titre,
      excerpt: typeof contenu?.meta_description === 'string' ? contenu.meta_description : null,
      content: corps,
      cover_image: null,
      published: false,
      published_at: null,
    });

    if (!post) {
      return NextResponse.json(
        { error: 'Un article de ce site utilise déjà ce lien.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ post });
  } catch (e) {
    const refus = ecritureRefusee(e);
    if (refus) return NextResponse.json({ error: refus.error }, { status: refus.status });
    return panne('generation', e);
  }
}
