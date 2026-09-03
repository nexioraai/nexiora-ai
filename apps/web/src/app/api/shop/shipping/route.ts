import { NextResponse } from 'next/server';
import { canTransact } from '@/lib/commerce-admission/canTransact';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';

/** GET /api/shop/shipping?slug=... → { shippingFlat } */
export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    // M2-02 -- la verification de propriete etait reimplementee ici (copie
    // verbatim de la meme fonction dans 5 routes, plus 2 controles inline).
    // Toutes portaient la MEME regle, mais sur `owner_email` SEUL, la ou la
    // primitive canonique priorise `owner_id` -- identite stable, insensible
    // a un changement d'adresse. Delegation : une seule regle, un seul
    // endroit, aucune divergence possible.
    const auth = await requireSiteOwner(req, slug, 'id');
    if (!auth.ok) return auth.response;
    const { data } = await supabaseAdmin.from('sites').select('shipping_flat').eq('id', (auth.site as any).id).single();
    return NextResponse.json({ shippingFlat: Number(data?.shipping_flat) || 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** PATCH /api/shop/shipping → sauve le tarif. Body: { slug, shippingFlat } */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { slug, shippingFlat } = body;
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    // ============================================================
    // M2-06 -- LA BORNE REGARDE DESORMAIS LE TYPE, PAS SEULEMENT LE SIGNE.
    //
    // CE QU'ELLE LAISSAIT PASSER, mesure en ecrivant sa premiere couverture :
    // `isNaN(Number(x))` absout tout ce que JavaScript coerce en 0.
    // `null`, `[]`, `{}` -- et `NaN`, que `JSON.stringify` serialise en
    // `null` -- donnaient donc 200 et ecrivaient **0**, c'est-a-dire
    // LIVRAISON GRATUITE, en silence.
    //
    // CE N'ETAIT PAS THEORIQUE. `PaymentConnect.tsx` envoie
    // `Number(shipping)` depuis un champ texte : une saisie non numerique
    // produit `NaN`, serialise `null`, et le forfait du marchand passait a 0
    // sans un mot. L'interface affiche pourtant l'erreur si on lui en rend
    // une (`if (!res.ok) throw` -> `setShipMsg`) : elle ne pouvait
    // simplement pas en recevoir.
    //
    // `Number.isFinite` ET un controle de type : le premier ecarte `NaN` et
    // les infinis, le second ecarte ce que la coercition sauverait a tort.
    // `0` reste legal -- une boutique a le droit d'offrir la livraison.
    // ============================================================
    if (typeof shippingFlat !== 'number' && typeof shippingFlat !== 'string') {
      return NextResponse.json({ error: 'Tarif invalide' }, { status: 400 });
    }
    const value = Number(shippingFlat);
    if (!Number.isFinite(value) || value < 0) return NextResponse.json({ error: 'Tarif invalide' }, { status: 400 });
    // M2-02 -- la verification de propriete etait reimplementee ici (copie
    // verbatim de la meme fonction dans 5 routes, plus 2 controles inline).
    // Toutes portaient la MEME regle, mais sur `owner_email` SEUL, la ou la
    // primitive canonique priorise `owner_id` -- identite stable, insensible
    // a un changement d'adresse. Delegation : une seule regle, un seul
    // endroit, aucune divergence possible.
    // M1-4 — le forfait de port est un parametre de vente.
    const auth = await requireSiteOwner(req, slug, 'id, mode');
    if (auth.ok && !canTransact((auth.site as { mode?: unknown }).mode)) {
      return NextResponse.json(
        { error: 'Ce site est une vitrine : il ne peut pas exercer d’activité commerciale.' },
        { status: 403 }
      );
    }
    if (!auth.ok) return auth.response;
    await supabaseAdmin.from('sites').update({ shipping_flat: value }).eq('id', (auth.site as any).id);
    return NextResponse.json({ shippingFlat: value });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
