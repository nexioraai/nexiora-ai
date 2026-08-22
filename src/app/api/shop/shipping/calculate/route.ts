import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { STRIPE_SHIPPING_COUNTRIES } from '@/lib/payments/countries';
import { buildSupplierGroups, resolveShipping } from '@/lib/shop/quote/resolveShipping';

/**
 * Devis de livraison AFFICHE dans le panier.
 *
 * LOT 2 -- cette route ne calcule plus rien elle-meme : elle delegue a
 * resolveShipping(), le meme module que checkout/route.ts. C'est ce qui
 * garantit "affiche = facture".
 *
 * Elle portait auparavant sa propre logique, dans un ORDRE DIFFERENT de
 * celui du checkout (live d'abord au lieu du cache d'abord), avec un retour
 * anticipe `unavailable` place AVANT le calcul des paliers. D'ou :
 *   C3 -- cache present sans paliers : le panier affichait le montant live
 *         (sans marge), le checkout facturait le cache (x1.20) -> 20 %
 *         d'ecart entre le prix montre et le prix debite.
 *   C4 -- adaptateur live en echec : le panier annoncait "indisponible"
 *         alors qu'un cache complet et valide existait, et que le checkout
 *         aurait su le facturer.
 *
 * Le `logisticName` CJ reel n'est deliberement PAS renvoye au navigateur :
 * il ne sert qu'au fulfillment (shop_orders.shipment_logistic_name).
 */
export async function POST(req: Request) {
  try {
    const { slug, items, countryCode, stateCode } = (await req.json()) as {
      slug?: string;
      items?: { id: string; quantity: number }[];
      countryCode?: string;
      stateCode?: string;
    };
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    if (!items || items.length === 0) return NextResponse.json({ error: 'Panier vide' }, { status: 400 });
    if (!countryCode || !STRIPE_SHIPPING_COUNTRIES.includes(countryCode as never)) {
      return NextResponse.json({ error: 'Pays invalide' }, { status: 400 });
    }

    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id, shipping_flat')
      .eq('slug', slug)
      .single();
    if (!site) return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });

    const groups = await buildSupplierGroups(items);
    const quote = await resolveShipping({
      groups,
      countryCode,
      flat: Number(site.shipping_flat) || 0,
      stateCode,
    });

    if (quote.source === 'unavailable') {
      return NextResponse.json({ shipping: 0, source: 'unavailable' });
    }

    return NextResponse.json({
      shipping: quote.amount,
      source: quote.source,
      aging:
        quote.estimatedMinDays != null && quote.estimatedMaxDays != null
          ? `${quote.estimatedMinDays}-${quote.estimatedMaxDays} days`
          : null,
      cjTiers:
        quote.tiers?.map((t) => ({
          tier: t.tier,
          label: t.label,
          cost: t.amount,
          days_min: t.daysMin,
          days_max: t.daysMax,
        })) ?? null,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
