import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjCancelOrder } from '@/lib/cj/client';
import { getProvider } from '@/lib/payments';
import { logAnomaly } from '@/lib/anomaly';

const CJ_EMAIL = process.env.CJ_EMAIL || '';
const CJ_API_KEY = process.env.CJ_API_KEY || '';

/**
 * Annulation par l'acheteur, 100% automatique (identite Nexiora).
 * L'acheteur clique le lien de son email : Nexiora demande a CJ si la commande
 * peut encore etre annulee, et agit en consequence. Le marchand n'intervient
 * jamais ; il voit seulement le resultat dans son dashboard.
 *
 * Flux :
 *   1. Verif du token secret (seul le destinataire de l'email peut annuler)
 *   2. Annulation chez CJ (DELETE deleteOrder)
 *   3. Si CJ accepte -> remboursement Stripe (reverse_transfer : l'argent est
 *      repris au marchand, Nexiora ne paie pas de sa poche) + statut canceled
 *   4. Si CJ refuse (deja expediee) -> on ne rembourse pas, on explique
 */
export async function POST(req: NextRequest) {
  try {
    const { orderId, token } = await req.json() as { orderId?: string; token?: string };
    if (!orderId || !token) {
      return NextResponse.json({ error: 'Lien invalide' }, { status: 400 });
    }

    const { data: order } = await supabaseAdmin
      .from('shop_orders')
      .select('id, site_id, status, cj_order_id, cancel_token, payment_intent_id, payment_provider, total, currency')
      .eq('id', orderId)
      .maybeSingle();

    if (!order || order.cancel_token !== token) {
      return NextResponse.json({ error: 'Lien invalide ou expire' }, { status: 403 });
    }

    if (order.status === 'canceled') {
      return NextResponse.json({ ok: true, alreadyCanceled: true, message: 'Cette commande est deja annulee.' });
    }

    if (order.status === 'shipped' || order.status === 'delivered') {
      return NextResponse.json({
        ok: false,
        reason: 'shipped',
        message: "Votre commande est deja expediee et ne peut plus etre annulee. Vous pourrez la retourner a reception.",
      }, { status: 409 });
    }

    // 1. Demander l'annulation a CJ (source de verite)
    if (order.cj_order_id) {
      try {
        await cjCancelOrder(CJ_EMAIL, CJ_API_KEY, order.cj_order_id);
      } catch (e: any) {
        const msg = String(e?.message || e);
        await logAnomaly({
          type: 'cancel_refused_by_supplier',
          severity: 'warning',
          siteId: order.site_id,
          details: { orderId: order.id, cjOrderId: order.cj_order_id, reason: msg },
        });
        return NextResponse.json({
          ok: false,
          reason: 'supplier_refused',
          message: "Votre commande est deja en cours de preparation chez le fournisseur et ne peut plus etre annulee.",
        }, { status: 409 });
      }
    }

    // 2. CJ a accepte : on rembourse l'acheteur
    let refundId: string | null = null;
    if (order.payment_intent_id) {
      try {
        const provider = getProvider(order.payment_provider);
        const refund = await provider.refundPayment(order.payment_intent_id);
        refundId = refund.id;
      } catch (e: any) {
        // La commande est annulee chez CJ mais le remboursement a echoue :
        // situation a traiter manuellement, on alerte immediatement.
        await logAnomaly({
          type: 'refund_failed',
          severity: 'blocked',
          siteId: order.site_id,
          details: { orderId: order.id, paymentIntent: order.payment_intent_id, reason: String(e?.message || e) },
        });
        return NextResponse.json({
          ok: false,
          reason: 'refund_failed',
          message: "Votre commande est annulee, mais le remboursement n'a pas pu etre traite automatiquement. Nous vous recontactons rapidement.",
        }, { status: 500 });
      }
    }

    // 3. Marquer la commande annulee
    await supabaseAdmin
      .from('shop_orders')
      .update({ status: 'canceled', cj_pay_status: 'canceled' })
      .eq('id', order.id);

    return NextResponse.json({
      ok: true,
      canceled: true,
      refundId,
      message: 'Votre commande a bien ete annulee. Le remboursement apparaitra sur votre moyen de paiement sous quelques jours.',
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
