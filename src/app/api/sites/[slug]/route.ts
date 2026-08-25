import { NextResponse } from 'next/server';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// Mapping camelCase (client) -> snake_case (DB)
const FIELD_MAP: Record<string, string> = {
  name: 'name',
  slogan: 'slogan',
  type: 'type',
  primaryColor: 'primary_color',
  heroTitle: 'hero_title',
  heroSubtitle: 'hero_subtitle',
  about: 'about',
  // CHANTIER 1 -- `services` RETIRE. Colonne legacy : aucun theme ne la rend,
  // le generateur ne la produit pas, et la mesure de production a confirme 0
  // site porteur de donnees. Elle n'est PAS supprimee en base -- elle cesse
  // seulement d'etre ecrite par ce chemin. La source canonique est `sections`.
  testimonials: 'testimonials',
  gallery: 'gallery',
  contact: 'contact',
  menu: 'menu',
  team: 'team',
  hours: 'hours',
  address: 'address',
  pages: 'pages',
  cta: 'cta',
  socialLinks: 'social_links',
  theme: 'theme',
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // ============================================================
    // DETTE 6a, EXTENSION -- L'OCCURRENCE LA PLUS GRAVE DU LOT.
    //
    // CE QUI EXISTAIT. Le seul controle etait la clause `.eq('owner_email',
    // user.email)` PORTEE PAR L'UPDATE LUI-MEME. Le commentaire d'origine
    // parlait de « double securite » ; il n'y avait pas de PREMIERE securite.
    // Entre la validation du jeton et l'ecriture de 19 colonnes de contenu en
    // `service_role`, aucune verification de propriete n'existait.
    //
    // POURQUOI L'ADRESSE NE PEUT PAS TENIR CE ROLE. `sites.owner_email` est
    // ecrite UNE SEULE FOIS, a la creation du site, et aucun update ne la
    // touche jamais -- verifie par balayage. Un proprietaire qui change
    // d'adresse laisse la colonne figee sur l'ancienne : quiconque obtient
    // ensuite cette adresse chez le fournisseur d'identite pouvait reecrire le
    // contenu entier du site, pendant que le proprietaire legitime en perdait
    // l'acces.
    //
    // AUCUN MECANISME NOUVEAU. `requireSiteOwner` est la primitive canonique
    // (`owner_id` prioritaire, repli sur `owner_email` UNIQUEMENT quand
    // `owner_id` est encore null cote base). Le dossier voisin l'utilisait
    // deja : `sites/[slug]/archive/route.ts`.
    //
    // ORDRE : la propriete est tranchee AVANT toute ecriture. L'UPDATE ne
    // porte plus aucune garde -- il vise la ligne dont la propriete vient
    // d'etre etablie, par son identifiant.
    // ============================================================
    const auth = await requireSiteOwner(req, slug, 'id');
    if (!auth.ok) return auth.response;
    const site = auth.site as { id: string };

    const body = await req.json();

    // Convertir camelCase -> snake_case pour Supabase
    const updates: Record<string, any> = {};
    for (const [clientKey, dbColumn] of Object.entries(FIELD_MAP)) {
      if (body[clientKey] !== undefined) {
        updates[dbColumn] = body[clientKey];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // ANCRAGE SUR `id`, ET SURTOUT PAS SUR `owner_id` : la primitive autorise
    // encore un repli sur `owner_email` quand `owner_id` est null, et filtrer
    // sur `owner_id` casserait ce cas -- PostgREST traduit `.eq(col, null)` en
    // `col=eq.null`, qui n'apparie aucune ligne NULL.
    const { data, error } = await supabase
      .from('sites')
      .update(updates)
      .eq('id', site.id)
      .select()
      .single();

    if (error) {
      console.error('Supabase update error:', error);
      return NextResponse.json(
        { error: 'Update failed', details: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Site not found or unauthorized' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('PATCH error:', err);
    return NextResponse.json(
      { error: 'Server error', details: err?.message },
      { status: 500 }
    );
  }
}
