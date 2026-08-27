import { NextResponse } from 'next/server';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isLegalOrderStatusTransition, type OrderStatus } from '@/lib/shop/orderStatusMachine';

/** GET /api/shop/orders?slug=... → commandes du site avec leurs lignes. */
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

    const { data, error } = await supabaseAdmin
      .from('shop_orders')
      .select('id, status, total, currency, customer_email, customer_name, shipping_address, tracking_number, payment_provider, created_at, shop_order_items(product_name, quantity, unit_price)')
      .eq('site_id', (auth.site as any).id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    return NextResponse.json({ orders: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

const ALLOWED_TARGET_STATUSES = ['shipped', 'delivered'] as const;
type TargetStatus = (typeof ALLOWED_TARGET_STATUSES)[number];

/**
 * PATCH /api/shop/orders → transition manuelle d'une commande.
 * Body: { slug, orderId, trackingNumber?, targetStatus? } (targetStatus par
 * defaut 'shipped', retro-compatible avec l'appelant existant qui ne
 * l'envoie pas encore).
 *
 * Audit Mode 3/POD BRAND, perfectionnement -- aucun code sur toute la
 * plateforme (CJ, POD, Mode 2) n'ecrivait jamais status='delivered' :
 * aucun webhook transporteur, aucune action marchand -- alors que
 * OrderManager.tsx affiche deja un onglet et une etiquette "livree",
 * jamais atteignable. 'shipped'->'delivered' ajoute avec la meme garde CAS
 * deja demontree pour 'paid'/'processing'->'shipped'.
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { slug, orderId, trackingNumber, targetStatus: rawTarget } = body;
    if (!slug || !orderId) return NextResponse.json({ error: 'Missing slug or orderId' }, { status: 400 });
    const targetStatus: TargetStatus = rawTarget || 'shipped';
    if (!ALLOWED_TARGET_STATUSES.includes(targetStatus)) {
      return NextResponse.json({ error: 'targetStatus invalide' }, { status: 400 });
    }
    // M2-02 -- la verification de propriete etait reimplementee ici (copie
    // verbatim de la meme fonction dans 5 routes, plus 2 controles inline).
    // Toutes portaient la MEME regle, mais sur `owner_email` SEUL, la ou la
    // primitive canonique priorise `owner_id` -- identite stable, insensible
    // a un changement d'adresse. Delegation : une seule regle, un seul
    // endroit, aucune divergence possible.
    const auth = await requireSiteOwner(req, slug, 'id');
    if (!auth.ok) return auth.response;

    // Vérifie que la commande appartient bien au site
    const { data: order } = await supabaseAdmin
      .from('shop_orders')
      .select('id, status')
      .eq('id', orderId)
      .eq('site_id', (auth.site as any).id)
      .maybeSingle();
    if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });

    // Audit Mode 3 global (LOT H, contre-audit) -- cette route acceptait
    // auparavant targetStatus='shipped' depuis N'IMPORTE QUEL statut de
    // depart (seul le CAS .eq('status', order.status) protegeait, ce qui
    // ne bloque qu'une COURSE, jamais une transition simplement ILLEGALE :
    // une commande deja 'canceled'/'refunded' pouvait etre marquee
    // 'shipped' par ce PATCH, le CAS matchant trivialement puisque la
    // valeur lue == la valeur filtree). Verifie desormais via la meme
    // machine a etats que le trigger DB (orderStatusMachine.ts, source
    // unique partagee) AVANT toute tentative d'ecriture -- le contrat reel
    // n'est PAS "processing -> shipped uniquement" (une commande CJ pure
    // ne passe jamais par 'processing', voir OrderManager.tsx:225 qui
    // affiche deja ce bouton pour 'paid' ET 'processing') : les deux
    // departs 'paid' et 'processing' sont legitimes pour 'shipped', tous
    // les autres ne le sont pas. Le trigger DB reste la barriere finale et
    // independante (defense en profondeur), meme si cette verification
    // applicative etait un jour retiree ou contournee.
    if (!isLegalOrderStatusTransition(order.status as OrderStatus, targetStatus)) {
      if (targetStatus === 'delivered') {
        return NextResponse.json({
          error: 'Seule une commande déjà expédiée peut être marquée livrée.',
        }, { status: 400 });
      }
      return NextResponse.json({
        error: 'Cette commande ne peut pas être marquée expédiée depuis son statut actuel.',
      }, { status: 400 });
    }

    // Garde CAS (audit timeouts/CAS, lot prioritaire) : le cron cj-tracking
    // peut transitionner cette meme commande en parallele. Garde generique
    // sur le statut lu ci-dessus (pas une valeur figee comme 'processing')
    // -- correcte quel que soit l'etat legitime reel de la commande
    // (Mode 2 auto-fulfill, Mode 3 CJ ou POD ont des cycles de vie
    // differents), sans dependre d'une hypothese sur laquelle valeur
    // precise est "normale" avant transition.
    const updatePayload: Record<string, unknown> = { status: targetStatus };
    if (targetStatus === 'shipped') updatePayload.tracking_number = trackingNumber || null;

    const { data: updated } = await supabaseAdmin
      .from('shop_orders')
      .update(updatePayload)
      .eq('id', orderId)
      .eq('status', order.status)
      .select('id')
      .maybeSingle();

    if (!updated) {
      return NextResponse.json({
        error: 'La commande a ete modifiee entre-temps (ex: mise a jour automatique du suivi). Rechargez et reessayez.',
      }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
