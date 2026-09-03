import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireArticleOwner } from '@/lib/auth/require-article-owner';
import { consommerJeton } from '@/lib/rate-limit/rateLimit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { setPostCover } from '@/lib/blog';

// ============================================================
// LOT BLOG 5 -- COUVERTURE D'UN ARTICLE.
//
// PATRON `shop/upload-design` POUR LA METHODE, BUCKET `site-images` POUR LE
// STOCKAGE. La distinction compte :
//
//   * la METHODE de `custom-designs` -- autorisation, controles gratuits,
//     borne de depense, chemin construit SERVEUR, ecriture sous
//     `service_role` -- est la bonne, et c'est elle qu'on reprend ;
//   * son BUCKET, lui, ne convient pas : `custom-designs` porte une semantique
//     d'usage unique lie a une commande (`design_uploads.consumed_at`), il
//     accepte `image/svg+xml` au niveau bucket, et ses objets sont a plat sans
//     aucun prefixe locataire.
//
// `site-images` EST DEJA DECLARE dans `img-src` de la CSP ET dans
// `images.remotePatterns` de next.config.ts. Aucun bucket nouveau : en creer
// un imposerait de modifier la CSP sans necessite demontree.
//
// AUCUNE POLICY STORAGE N'EST REQUISE, ET C'EST MESURE : `custom-designs` n'en
// a AUCUNE (les six policies de `storage.objects` couvrent `pod-designs` et
// `site-images` seulement), preuve que l'upload serveur sous `service_role`,
// qui contourne la RLS de `storage.objects`, n'en demande pas.
//
// LE PREFIXE `blog/` EST STRUCTURELLEMENT RESERVE AU SERVEUR. La policy
// d'ecriture de `site-images` exige `sites.slug = split_part(name, '/', 1)`.
// Or aucun site ne porte le slug `blog` -- `generateSlug` suffixe TOUJOURS
// `-{horodatage}`, verifie sur les 14 sites. Un televersement navigateur vers
// `blog/...` est donc refuse par la base elle-meme, sans qu'aucune regle
// nouvelle n'ait ete posee.
// ============================================================

/** Aligne EXACTEMENT sur le bucket reel (mesure) : ni plus permissif, ni plus
 *  strict. La lecon de `custom-designs` est qu'une divergence route/bucket
 *  laisse la seule barriere applicative -- ici les deux coincident. */
const MIME_AUTORISES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/** Limite REELLE du bucket : 5 242 880 octets. La refuser ici evite un
 *  televersement voue a echouer plus loin, et sans lire un seul octet. */
const TAILLE_MAX = 5 * 1024 * 1024;

const BUCKET = 'site-images';

type Ctx = { params: Promise<{ id: string }> };

function panne(contexte: string, e: unknown) {
  console.error(`[blog/cover] ${contexte}:`, e);
  return NextResponse.json({ error: 'Service momentanément indisponible.' }, { status: 503 });
}

/** POST /api/blog/posts/[id]/cover -- corps `multipart/form-data`, champ `file`. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;

  // 1. IDENTITE -- avant tout : avant la lecture du corps, avant toute borne,
  //    avant tout octet ecrit. Un article d'un autre locataire rend 404.
  const auth = await requireArticleOwner(req, id);
  if ('error' in auth) return auth.error;
  const article = auth.article;

  let file: File | null = null;
  try {
    const form = await req.formData();
    const brut = form.get('file');
    file = brut instanceof File ? brut : null;
  } catch {
    return NextResponse.json({ error: 'Corps multipart invalide.' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  // 2. CONTROLES GRATUITS -- AVANT la borne, et avant toute lecture du fichier.
  //    `file.size` et `file.type` sont disponibles sans materialiser un seul
  //    octet : un fichier refuse pour sa taille ou son type ne consomme donc ni
  //    jeton, ni memoire, ni stockage. Meme ordre que `upload-design`.
  if (file.size > TAILLE_MAX) {
    return NextResponse.json({ error: 'Fichier trop lourd (5 Mo maximum).' }, { status: 400 });
  }
  const extension = MIME_AUTORISES[file.type];
  if (!extension) {
    return NextResponse.json(
      { error: 'Format non pris en charge. Formats acceptés : JPEG, PNG, WebP, GIF, AVIF.' },
      { status: 400 }
    );
  }

  // 3. DEPENSE -- bornee apres les controles gratuits, avant toute ecriture.
  //    Le perimetre est le SITE de l'article, pas l'article : c'est le
  //    proprietaire qui remplit le bucket, pas la ressource.
  const jeton = await consommerJeton({
    type: 'blog_cover_upload',
    siteId: article.site_id,
    fenetreMs: 60_000,
    plafond: 10,
    message: 'Trop de téléversements, réessayez dans une minute.',
    details: { articleId: article.id },
  });
  if (!jeton.ok) return NextResponse.json({ error: jeton.erreur }, { status: jeton.statut });

  // 4. CHEMIN -- 100 % SERVEUR. Aucun fragment ne vient du client :
  //      * `blog/`             constante ;
  //      * `article.site_id`   lu en base par la primitive de propriete ;
  //      * `randomUUID()`      genere ici ;
  //      * l'extension         DERIVEE DU TYPE MIME DEJA VALIDE.
  //
  //    Ce dernier point est un RESSERREMENT delibere par rapport a
  //    `upload-design`, qui fait `file.name.split('.').pop()` -- donc laisse
  //    le NOM DE FICHIER du client decider de l'extension stockee. Ici le nom
  //    d'origine n'est jamais lu : il n'existe aucun caractere du client dans
  //    le chemin, donc rien a echapper et rien a falsifier.
  const storagePath = `blog/${article.site_id}/${randomUUID()}.${extension}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: erreurUpload } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });
    if (erreurUpload) return panne('upload', erreurUpload);

    const { data: url } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
    const publicUrl = url?.publicUrl;
    if (!publicUrl) return panne('getPublicUrl', 'URL publique absente');

    const resultat = await setPostCover(article.id, article.site_id, publicUrl, storagePath);
    if (!resultat) {
      // Aucune ligne touchee : on ne rend jamais un succes sur une ecriture
      // qui n'a rien ecrit. L'objet vient d'etre depose -- on le retire pour
      // ne pas laisser d'orphelin.
      await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    // 5. ANCIENNE COUVERTURE -- retiree APRES que la nouvelle soit en base.
    //    Dans cet ordre, et jamais l'inverse : si la base echouait, l'article
    //    se retrouverait sans couverture du tout. L'echec du retrait n'est pas
    //    bloquant -- la base est deja juste -- mais il est journalise, parce
    //    que c'est exactement ce silence qui a produit les 22 objets orphelins
    //    de `custom-designs`.
    if (resultat.ancienChemin && resultat.ancienChemin !== storagePath) {
      const { error: erreurRetrait } = await supabaseAdmin.storage
        .from(BUCKET)
        .remove([resultat.ancienChemin]);
      if (erreurRetrait) {
        console.error('[blog/cover] orphelin non retire:', resultat.ancienChemin, erreurRetrait);
      }
    }

    return NextResponse.json({ post: resultat.post });
  } catch (e) {
    return panne('cover', e);
  }
}
