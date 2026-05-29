import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Champs que le client a le droit de modifier.
// owner_email, slug, id, created_at sont volontairement EXCLUS.
const ALLOWED_FIELDS = [
  'name',
  'slogan',
  'type',
  'services',
  'pages',
  'cta',
  'primaryColor',
  'socialLinks',
];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // 1. Extraire le token d'auth depuis le header
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Vérifier l'utilisateur via Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 3. Récupérer le slug et le body
    const { slug } = await params;
    const body = await req.json();

    // 4. Filtrer : seulement les champs whitelistés
    const updates: Record<string, any> = {};
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // 5. Update avec DOUBLE vérification : slug ET owner_email
    //    → Empêche un utilisateur de modifier le site d'un autre,
    //    même si quelqu'un trafique l'URL.
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
        { error: 'Site not found or you do not have permission' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('PATCH /api/sites/[slug] error:', err);
    return NextResponse.json(
      { error: 'Server error', details: err?.message },
      { status: 500 }
    );
  }
}