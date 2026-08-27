import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { startCronRun, finishCronRun } from '@/lib/cron-tracker';
import { cjGetOrderDetail } from '@/lib/cj/client';
import { sendShippingEmail } from '@/lib/email/sendShippingEmail';
import { isLegalOrderStatusTransition, type OrderStatus } from '@/lib/shop/orderStatusMachine';

// Mode 3 : credentials Nexiora, le marchand ne connecte pas de compte CJ.
const CJ_EMAIL = process.env.CJ_EMAIL || '';
const CJ_API_KEY = process.env.CJ_API_KEY || '';

export const maxDuration = 300;

/**
 * Cron quotidien : remonte automatiquement le numero de tracking CJ.
 * Cherche les commandes Mode 3 (cj_order_id rempli) pas encore expediees,
 * interroge CJ, et si un trackNumber existe → marque la commande 'shipped'.
 * Declenche par Vercel Cron (securise par CRON_SECRET).
 */
export async function GET(req: NextRequest) {
  // Securite : seul Vercel (avec le bon secret) peut declencher. Fail-closed
  // (audit cj-tracking) : un secret absent doit refuser l'acces, jamais le
  // desactiver silencieusement -- meme correctif deja applique ailleurs
  // dans ce depot (pod-reconciliation/route.ts).
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = await startCronRun('cj-tracking');
  try {
  // Commandes en attente de tracking : commande CJ creee, pas encore expediee.
  // `status` selectionne (audit cj-tracking) : necessaire pour la garde CAS
  // dynamique de la transition plus bas -- voir commentaire sur l'UPDATE.
  //
  // Audit Mode 3 global (F-CJ-01, LOT H) -- cette selection n'excluait que
  // 'shipped', jamais 'canceled'/'refunded'/'delivered' : une commande deja
  // terminale mais pour laquelle CJ renvoie malgre tout un tracking (ex.
  // annulation cote Woorri sans effet reel cote fournisseur) restait
  // eligible, et la garde CAS plus bas (sur la valeur LUE ici) l'aurait
  // laisse passer puisque rien n'avait change entre la lecture et
  // l'ecriture. Desormais bloque a deux niveaux independants : cette
  // exclusion explicite (evite l'appel CJ inutile et le log d'erreur), ET
  // le trigger DB (rejette structurellement toute transition depuis un
  // etat terminal, meme si cette exclusion etait un jour de nouveau
  // oubliee ou contournee).
  const { data: orders } = await supabaseAdmin
    .from('shop_orders')
    .select('id, site_id, status, cj_order_id, customer_email, customer_name')
    .not('cj_order_id', 'is', null)
    .is('tracking_number', null)
    .not('status', 'in', '(shipped,delivered,canceled,refunded)')
    .limit(200);

  if (!orders || orders.length === 0) {
    return NextResponse.json({ done: true, checked: 0, shipped: 0 });
  }

  // Regroupe les commandes par site (pour charger les identifiants CJ une seule fois)
  const bySite = new Map<string, typeof orders>();
  for (const o of orders) {
    if (!o.site_id) continue;
    const arr = bySite.get(o.site_id) || [];
    arr.push(o);
    bySite.set(o.site_id, arr);
  }

  let checked = 0;
  let shipped = 0;

  for (const [siteId, siteOrders] of bySite) {
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('name')
      .eq('id', siteId)
      .maybeSingle();

    for (const order of siteOrders) {
      checked++;
      try {
        const result = await cjGetOrderDetail(CJ_EMAIL, CJ_API_KEY, order.id);
        // 'unknown' (timeout/429/5xx/reponse invalide) n'est pas une absence
        // de tracking -- on ne fait rien, le prochain passage reessaiera.
        // 'not_found' est traite pareil ici : rien a synchroniser encore.
        if (result.outcome !== 'found') continue;
        const trackNumber = result.data?.trackNumber || null;
        if (!trackNumber) continue;

        // Audit Mode 3 global (LOT H, contre-audit "verifie le flux complet
        // jusqu'a l'ecriture finale") -- garde supplementaire independante
        // de l'exclusion SQL ligne 52 : celle-ci filtre au moment de la
        // SELECT, mais order.status a pu changer entre cette lecture et ce
        // point (appel reseau CJ entre les deux, voir le test de course
        // dans statusGuard.test.ts). Verifie ici, juste avant l'UPDATE, via
        // la meme machine a etats que le trigger DB (orderStatusMachine.ts,
        // source unique partagee avec orders/route.ts) : evite un appel
        // UPDATE voue a l'echec (le trigger le rejetterait de toute facon)
        // et documente explicitement l'invariant a cet endroit precis,
        // plutot que de compter implicitement sur l'exclusion SQL amont
        // pour rester juste pour toujours.
        if (!isLegalOrderStatusTransition(order.status as OrderStatus, 'shipped')) continue;

        // Garde de statut + verification que l'UPDATE a reellement affecte
        // la ligne (audit Reseller/CJ §13) : une commande annulee/remboursee
        // entre-temps par une course avec ce cron ne doit jamais redevenir
        // 'shipped', et l'email client ne doit jamais partir sur une
        // transition qui n'a pas reellement eu lieu.
        //
        // Garde dynamique sur order.status (audit cj-tracking, correction
        // d'une regression) : l'ancien `.eq('status', 'processing')` codait
        // en dur une valeur que le fulfillment CJ actuel (mode 3 semi-auto,
        // cj/fulfill.ts) ne produit plus depuis le commit 5698778
        // (2026-07-20, retrait du mode manuel qui l'ecrivait) -- confirme
        // par lecture exhaustive de handlePaidCheckout.ts/cj/fulfill.ts/
        // reconcile.ts (aucun n'ecrit shop_orders.status pour une commande
        // CJ) et par 2 commandes CJ pures reelles bloquees en production
        // (l'une avec un tracking_number deja recu chez CJ, jamais
        // synchronisee). Une commande CJ pure reste desormais a 'paid' tout
        // son cycle ; seule une commande mixte CJ+POD peut atteindre
        // 'processing' (pod-fulfill.ts). `order.status`, lu au moment de la
        // selection ci-dessus, couvre les deux cas sans enumerer les valeurs
        // possibles -- contrairement a un `.in('status', ['paid',
        // 'processing'])` fige, cette garde ne peut pas se re-perimer si le
        // modele metier evolue encore (c'est exactement ce qui a cause cette
        // regression la premiere fois). Preserve la garantie d'origine :
        // si le statut reel a change (annulation/remboursement concurrent),
        // order.status ne correspond plus, l'UPDATE n'affecte aucune ligne.
        const { data: updated } = await supabaseAdmin
          .from('shop_orders')
          .update({ status: 'shipped', tracking_number: trackNumber })
          .eq('id', order.id)
          .eq('status', order.status)
          .select('id')
          .maybeSingle();

        if (!updated) continue;

        shipped++;
        // Notifie le client (au nom de la boutique). N'echoue jamais le cron.
        if (order.customer_email) {
          await sendShippingEmail({
            to: order.customer_email,
            customerName: order.customer_name || undefined,
            shopName: site?.name || 'Votre boutique',
            trackingNumber: trackNumber,
          });
        }
      } catch (e) {
        console.error(`CJ tracking: echec pour ${order.id}:`, e);
        // On laisse la commande : le prochain passage reessaiera.
      }
    }
  }

  await finishCronRun(runId, { itemsProcessed: checked });
  return NextResponse.json({ done: true, checked, shipped });
  } catch (e: any) {
    await finishCronRun(runId, { itemsProcessed: 0, status: 'error', errorMessage: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
