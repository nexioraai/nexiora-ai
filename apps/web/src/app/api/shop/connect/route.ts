import { NextResponse } from 'next/server';
import { canTransact } from '@/lib/commerce-admission/canTransact';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getProvider, resolvePaymentProvider } from '@/lib/payments';

/** POST /api/shop/connect → crée le compte connecté + lien d'onboarding. Body: { slug, country? } */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { slug, country } = body;
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    // M2-02 -- la verification de propriete etait reimplementee ici (copie
    // verbatim de la meme fonction dans 5 routes, plus 2 controles inline).
    // Toutes portaient la MEME regle, mais sur `owner_email` SEUL, la ou la
    // primitive canonique priorise `owner_id` -- identite stable, insensible
    // a un changement d'adresse. Delegation : une seule regle, un seul
    // endroit, aucune divergence possible.
    // M1-4 — un compte marchand encaissant des ventes est un artefact
    // commercial : une vitrine n'a pas a en obtenir un.
    const auth = await requireSiteOwner(req, slug, 'id, mode');
    if (auth.ok && !canTransact((auth.site as { mode?: unknown }).mode)) {
      return NextResponse.json(
        { error: 'Ce site est une vitrine : il ne peut pas exercer d’activité commerciale.' },
        { status: 403 }
      );
    }
    if (!auth.ok) return auth.response;

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
      .eq('id', (auth.site as any).id);

    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
