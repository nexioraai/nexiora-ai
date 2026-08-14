import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getProvider, resolvePaymentProvider } from '@/lib/payments';

async function authSite(req: Request, slug: string): Promise<{ siteId: string } | { error: NextResponse }> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
  if (userError || !user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: site, error: siteError } = await supabaseAdmin
    .from('sites')
    .select('id')
    .eq('slug', slug)
    .eq('owner_email', user.email)
    .single();
  if (siteError || !site) return { error: NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 }) };
  return { siteId: site.id };
}

/** POST /api/shop/connect → crée le compte connecté + lien d'onboarding. Body: { slug, country? } */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { slug, country } = body;
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    const auth = await authSite(req, slug);
    if ('error' in auth) return auth.error;

    // P0-3.9.7 — Country-aware (Section 9) : le pays détermine le provider,
    // jamais une assignation universelle à Stripe. `country` reste
    // optionnel pour l'instant (aucun appelant ne l'envoie encore) : son
    // absence retombe sur le comportement historique ('stripe') pour ne
    // rien casser côté appelants existants. Sa présence ET son
    // incompatibilité déclenchent en revanche un refus explicite — jamais
    // un provider inventé pour un pays non couvert (ex. Tchad).
    const providerKey = country ? resolvePaymentProvider({ country }) : 'stripe';
    if (!providerKey) {
      return NextResponse.json(
        { error: `Aucun prestataire de paiement disponible pour ce pays actuellement (${country}).` },
        { status: 409 }
      );
    }

    const origin = new URL(req.url).origin;
    const returnUrl = `${origin}/edit/${slug}`;
    const provider = getProvider(providerKey);
    const { url, accountId } = await provider.createOnboarding(slug, returnUrl);

    await supabaseAdmin
      .from('sites')
      .update({ payment_provider: providerKey, payment_account_id: accountId })
      .eq('id', auth.siteId);

    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
