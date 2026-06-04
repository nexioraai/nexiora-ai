import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
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
  services: 'services',
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
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Client anon pour valider le token utilisateur

    // Client service_role pour bypass RLS sur l'update (auth déjà fait au-dessus)

    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);

    if (userError || !user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
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

    // Double securite : slug ET owner_email
    const { data, error } = await supabase
      .from('sites')
      .update(updates)
      .eq('slug', slug)
      .eq('owner_email', user.email)
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
