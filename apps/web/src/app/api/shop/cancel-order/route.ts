import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cancelSupplierOrder } from '@/lib/mode3/cancelSupplierOrder';
import { getProvider } from '@/lib/payments';
import { cancelShopOrderAtomic } from '@/lib/shop';
import { logAnomaly } from '@/lib/anomaly';

/**
 * Annulation par l'acheteur, 100% automatique (identite Nexiora).
 * L'acheteur clique le lien de son email : Nexiora demande a CJ si la commande
 * peut encore etre annulee, et agit en consequence. Le marchand n'intervient
 * jamais ; il voit seulement le resultat dans son dashboard.
 *
 * Flux :
 *   1. Verif du token secret (seul le destinataire de l'email peut annuler)
 *   2. Annulation chez CJ (DELETE deleteOrder) -- Mode 3/CJ uniquement,
 *      inchange par F9/F10 (voir note plus bas).
 *   3. Transition atomique + restauration de stock (F9/F10, cancel_shop_order)
 *   4. Si un paiement a ete restaure -> remboursement Stripe (reverse_transfer :
 *      l'argent est repris au marchand, Nexiora ne paie pas de sa poche)
 *
 * F9/F10 (audit Mode 2, ce correctif) : avant ce correctif, cette route
 * lisait le statut UNE FOIS puis ecrivait 'canceled' SANS aucune garde
 * conditionnelle -- une commande qui passait 'pending' -> 'paid' (webhook)
 * exactement entre cette lecture et cette ecriture pouvait etre ecrasee en
 * 'canceled' sans jamais avoir ete remboursee, ET son stock decremente par
 * le webhook n'etait alors jamais restaure (F9 : aucun mecanisme de
 * restauration n'existait nulle part dans ce repo, verifie par recherche
 * exhaustive). cancelShopOrderAtomic() (supabase/sql/shop_stock_functions.sql,
 * cancel_shop_order) remplace la lecture-puis-ecriture par une transition
 * d'etat atomique cote Postgres : elle relit et decide dans la MEME
 * transaction, jamais a partir d'un statut lu par ce fichier avant l'appel --
 * la meme garantie de concurrence que decrement_shop_stock_batch (F7),
 * demontree reellement sous course dans ce meme audit.
 *
 * Note Mode 3/CJ : l'appel a cjCancelOrder() ci-dessous reste base sur la
 * lecture initiale de cj_order_id (comportement historique, inchange). Une
 * course symetrique existe theoriquement ici aussi (cj_order_id peut se
 * remplir entre cette lecture et l'appel CJ, si fulfillCjOrder() vient
 * juste de tourner) -- hors perimetre de F9/F10 (qui concernent le stock
 * local Mode 2 et la course avec le webhook de PAIEMENT, pas le fournisseur
 * CJ), signale pour un futur audit dedie, non corrige ici.
 */
export async function POST(req: NextRequest) {
  try {
    const { orderId, token } = await req.json() as { orderId?: string; token?: string };
    if (!orderId || !token) {
      return NextResponse.json({ error: 'Lien invalide' }, { status: 400 });
    }

    const { data: order } = await supabaseAdmin
      .from('shop_orders')
      .select('id, site_id, status, cj_order_id, cancel_token, payment_provider, fulfillment_domain')
      .eq('id', orderId)
      .maybeSingle();

    if (!order || order.cancel_token !== token) {
      return NextResponse.json({ error: 'Lien invalide ou expire' }, { status: 403 });
    }

    // F9/F10 : 'refunded' ajoute a la garde d'idempotence UX -- c'est l'etat
    // emprunte par le chemin F7 (stock insuffisant apres paiement), qui n'a
    // jamais decremente le moindre stock pour cette commande : rien a
    // restaurer, rien a rembourser une seconde fois. Le lien d'annulation
    // n'est de toute facon jamais envoye pour ce chemin (email de
    // confirmation non envoye si stockFailed, handlePaidCheckout.ts) ; cette
    // garde reste neanmoins la reponse correcte si ce chemin etait jamais
    // atteint (defense en profondeur, pas une dependance a la livraison de
    // l'email).
    if (order.status === 'canceled' || order.status === 'refunded') {
      return NextResponse.json({ ok: true, alreadyCanceled: true, message: 'Cette commande est deja annulee.' });
    }

    if (order.status === 'shipped' || order.status === 'delivered') {
      return NextResponse.json({
        ok: false,
        reason: 'shipped',
        message: "Votre commande est deja expediee et ne peut plus etre annulee. Vous pourrez la retourner a reception.",
      }, { status: 409 });
    }

    // 1. Demander l'annulation au fournisseur qui execute la commande.
    // PHASE 5 / F4 -- cette route ne parle plus a un fournisseur : elle
    // s'adresse au point d'entree du domaine (mode3/cancelSupplierOrder). Elle
    // portait auparavant l'import `cj/client` ET les identifiants CJ, alors
    // qu'elle est traversee par les deux domaines. Le declencheur reste la
    // presence d'une commande fournisseur -- jamais le mode, jamais le
    // sous-type. Refus fournisseur = 409 AVANT toute transition d'etat et
    // avant toute restauration de stock : ordre inchange.
    // PHASE 6 / A6 -- GARDE DE DOMAINE, modele de la phase 3.
    //
    // Le declencheur etait `cj_order_id` : un IDENTIFIANT, pas un domaine. Une
    // commande marchande portant cette colonne renseignee atteignait donc
    // reellement le fournisseur. Depuis la phase 3 aucune commande marchande
    // ne peut acquerir cet identifiant -- mais c'est une garantie DE LA
    // DONNEE, pas du code, et une frontiere ne doit pas dependre de la
    // coherence de ce qu'elle recoit.
    //
    // FAIL-CLOSED, comme cj/fulfill et suppliers/pod-fulfill : la condition
    // est `=== 'supplier'`, jamais `!== 'merchant'`. Un domaine absent ou
    // inattendu n'atteint aucun fournisseur.
    //
    // L'annulation LOCALE se poursuit dans tous les cas : le marchand doit
    // pouvoir annuler sa commande, etre rembourse et voir son stock restaure.
    // Seul l'appel fournisseur est ferme.
    if (order.cj_order_id) {
      if ((order as { fulfillment_domain?: string }).fulfillment_domain !== 'supplier') {
        // Etat contradictoire : une commande non fournisseur porte pourtant un
        // identifiant de commande fournisseur. Impossible en base aujourd'hui
        // (colonne NOT NULL, CHECK, trigger d'immutabilite) -- donc s'il
        // survient, il doit etre VU, jamais absorbe en silence.
        await logAnomaly({
          type: 'cancel_supplier_domain_refuse',
          severity: 'warning',
          siteId: order.site_id,
          details: {
            orderId: order.id,
            cjOrderId: order.cj_order_id,
            domain: (order as { fulfillment_domain?: string }).fulfillment_domain ?? null,
          },
        });
      } else {
        const supplier = await cancelSupplierOrder({
          supplierOrderId: order.cj_order_id,
          orderId: order.id,
          siteId: order.site_id,
        });
        if (!supplier.ok) {
          return NextResponse.json({
            ok: false,
            reason: 'supplier_refused',
            message: "Votre commande est deja en cours de preparation chez le fournisseur et ne peut plus etre annulee.",
          }, { status: 409 });
        }
      }
    }

    // 2. Transition atomique + restauration de stock (F9/F10) -- decide et
    // agit dans une seule transaction Postgres, contre l'etat REEL au
    // moment de l'appel, jamais contre le statut lu plus haut.
    const result = await cancelShopOrderAtomic(order.id);

    if (!result.ok) {
      // Course perdue (webhook/autre annulation concurrente juste avant cet
      // appel) ou etat deja terminal atteint entre notre lecture et cet
      // appel. Reponse honnete plutot qu'un succes suppose : on relit
      // l'etat reel pour distinguer "deja annulee entretemps" (message
      // rassurant) d'un vrai conflit a reessayer.
      const { data: fresh } = await supabaseAdmin
        .from('shop_orders')
        .select('status')
        .eq('id', order.id)
        .maybeSingle();
      if (fresh?.status === 'canceled' || fresh?.status === 'refunded') {
        return NextResponse.json({ ok: true, alreadyCanceled: true, message: 'Cette commande est deja annulee.' });
      }
      return NextResponse.json({
        ok: false,
        reason: 'conflict',
        message: "Votre commande vient d'etre mise a jour. Merci de reessayer dans un instant.",
      }, { status: 409 });
    }

    // 3. Stock jamais decremente (commande encore 'pending') : rien a
    // rembourser, deja annulee par cancelShopOrderAtomic ci-dessus.
    if (!result.restocked) {
      return NextResponse.json({
        ok: true,
        canceled: true,
        refundId: null,
        message: 'Votre commande a bien ete annulee.',
      });
    }

    // 4. Paiement confirme : stock deja restaure atomiquement -- rembourser
    // le client. payment_intent_id vient de cancelShopOrderAtomic (lu
    // fraichement dans la meme transaction que la restauration), jamais
    // d'une lecture anterieure a cet appel.
    let refundId: string | null = null;
    if (result.paymentIntentId) {
      try {
        const provider = getProvider(order.payment_provider);
        const refund = await provider.refundPayment(result.paymentIntentId);
        refundId = refund.id;
      } catch (e: unknown) {
        // La commande est deja annulee et son stock deja restaure (les deux
        // atomiquement, via cancel_shop_order) : rembourser en echec est une
        // situation a traiter manuellement, jamais un pretexte pour annuler
        // la restauration de stock deja effectuee (memes principes que F7 :
        // le stock reflete la realite -- cette commande ne sera pas honoree
        // -- independamment du succes du remboursement lui-meme).
        await logAnomaly({
          type: 'refund_failed',
          severity: 'blocked',
          siteId: order.site_id,
          details: { orderId: order.id, paymentIntent: result.paymentIntentId, reason: e instanceof Error ? e.message : String(e) },
        });
        return NextResponse.json({
          ok: false,
          reason: 'refund_failed',
          message: "Votre commande est annulee, mais le remboursement n'a pas pu etre traite automatiquement. Nous vous recontactons rapidement.",
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      canceled: true,
      refundId,
      message: 'Votre commande a bien ete annulee. Le remboursement apparaitra sur votre moyen de paiement sous quelques jours.',
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
