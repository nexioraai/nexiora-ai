import { NextResponse } from 'next/server';
import { processWebhookEvent } from '@/lib/fulfillment/webhook-handler';
import { decodeIdempotencyKey } from '@/lib/fulfillment/idempotency-key';
import { verifyWebhookSecret } from '@/lib/fulfillment/webhook-auth';
import { lookupPrintfulOrderByExternalId } from '@/lib/fulfillment/provider-lookup';
import { logAnomaly } from '@/lib/anomaly';

// ============================================================
// P0-3.7Z Phase 10-12 — Webhook Printful.
//
// [NON DÉMONTRÉ] La forme exacte du payload webhook Printful (types
// d'événements, présence garantie de `data.order.status`, mécanisme de
// signature éventuel) n'a pas été vérifiée contre une documentation ou un
// événement réel dans cette série — seule la réponse REST de
// GET /orders/{id} (utilisée par getTracking) a été directement observée.
// Le parsing ci-dessous suit la structure documentée publiquement par
// Printful (`data.order.external_id`, `data.order.id`, `data.order.status`).
//
// LOT I (F-I-1) — recherche documentaire menée avant ce correctif : Printful
// ne publie aucun mécanisme de signature HMAC pour ses webhooks (recherché
// explicitement, non trouvé dans la documentation publique consultée).
// Authentification : secret partagé via webhook-auth.ts (fail-closed,
// voir ce fichier).
//
// Défense en profondeur AJOUTÉE (LOT I) — cause racine du gap : ce webhook
// faisait jusqu'ici confiance à `order.status` du corps de requête tel
// quel, contrairement à Gelato (qui ré-interroge toujours son API
// authentifiée avant d'agir, voir webhooks/gelato/route.ts). Un secret
// compromis (ou, avant ce lot, l'absence totale de vérification) suffisait
// donc à faire accepter un statut arbitraire. `lookupPrintfulOrderByExternalId`
// existait déjà dans le dépôt (provider-lookup.ts) mais n'était appelé nulle
// part, explicitement marqué [NON DÉMONTRÉ] (endpoint jamais confirmé par un
// appel réel pour Orders, seulement pour Products). Traité en conséquence :
// utilisé en VÉRIFICATION CROISÉE, JAMAIS en porte bloquante -- y compris
// sur "not found" (correction post contre-audit hostile de ce même lot :
// une première version bloquait le traitement sur `found: false`, en
// présumant que cela ne pouvait signifier qu'une commande forgée/inexistante
// -- mais l'endpoint étant [NON DÉMONTRÉ], un `found: false` peut tout aussi
// bien signifier "cette route de lookup ne fonctionne pas comme supposé"
// (mauvais format d'URL, endpoint réellement réservé aux Products comme
// documenté). Bloquer sur cette hypothèse aurait pu faire disparaître
// SILENCIEUSEMENT 100% des mises à jour de statut Printful réelles en
// production -- une régression bien pire que le risque théorique qu'elle
// visait à fermer. Traitement final, symétrique pour les 3 issues du
// lookup : succès avec statut concordant -> RAS ; succès avec statut
// divergent -> le statut authentifié (API) prime, anomalie 'info' ;
// `found: false` OU échec réseau/endpoint -> anomalie journalisée
// (distinguée par type), mais dans les DEUX cas on retombe sur le statut du
// corps et processWebhookEvent est TOUJOURS appelé. Ce contrôle reste donc
// une amélioration d'observabilité et un renforcement best-effort, jamais
// une garantie bloquante tant que l'endpoint n'est pas confirmé
// empiriquement (à promouvoir en porte bloquante une fois cette
// confirmation obtenue).
// ============================================================

export async function POST(req: Request) {
  if (!verifyWebhookSecret(req, process.env.PRINTFUL_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const data = body?.data as { order?: Record<string, unknown> } | undefined;
  const order = data?.order;
  if (!order?.external_id || order?.id === undefined) {
    // Payload inattendu : ne pas planter, ne rien corrompre — signaler et
    // retourner 200 pour éviter que Printful ne re-livre indéfiniment un
    // événement que Woorri ne saura jamais interpréter correctement.
    console.error('[printful-webhook] payload inattendu, aucun external_id/id:', JSON.stringify(body).slice(0, 500));
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Printful : granularité 1:1 (P0-3.7P), external_id décode directement
  // vers l'unique fulfillment_unit_id de cette Submission.
  let fulfillmentUnitId: string;
  try {
    fulfillmentUnitId = decodeIdempotencyKey(String(order.external_id));
  } catch {
    console.error('[printful-webhook] external_id non décodable:', order.external_id);
    return NextResponse.json({ ok: true, ignored: true });
  }

  let rawStatus = String(order.status ?? body?.type ?? '');

  // LOT I (F-I-1) — vérification croisée, jamais bloquante (voir note en
  // tête de fichier). `external_id` a déjà été décodé avec succès vers un
  // de NOS fulfillment_unit_id ci-dessus : un "not found" à ce stade précis
  // est un signal plus significatif qu'un simple 404 générique.
  const printfulToken = process.env.PRINTFUL_API_TOKEN || '';
  if (printfulToken) {
    try {
      const lookup = await lookupPrintfulOrderByExternalId(String(order.external_id), printfulToken);
      if (!lookup.found) {
        // Ne bloque JAMAIS le traitement (voir note en tête de fichier) --
        // journalisé pour permettre de détecter, en observant si ce type
        // d'anomalie survient pour des commandes qu'on sait par ailleurs
        // réelles, si l'endpoint de lookup fonctionne réellement ou non.
        await logAnomaly({
          type: 'printful_webhook_order_not_found',
          severity: 'info',
          details: { externalId: String(order.external_id), providerOrderId: String(order.id) },
        });
      } else if (lookup.rawStatus && lookup.rawStatus !== rawStatus) {
        await logAnomaly({
          type: 'printful_webhook_status_mismatch',
          severity: 'info',
          details: { externalId: String(order.external_id), webhookStatus: rawStatus, apiStatus: lookup.rawStatus },
        });
        // La source authentifiée (API Printful, appelée avec notre propre
        // token) fait autorité sur le corps de la requête non authentifié.
        rawStatus = lookup.rawStatus;
      }
    } catch (e) {
      // Endpoint de lookup [NON DÉMONTRÉ] (voir note en tête de fichier) :
      // ne bloque jamais le trafic Printful réel sur une hypothèse non
      // prouvée -- repli sur le statut du corps, écart journalisé pour
      // permettre de confirmer/promouvoir ce contrôle plus tard.
      await logAnomaly({
        type: 'printful_webhook_lookup_unavailable',
        severity: 'info',
        details: { externalId: String(order.external_id), reason: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  const outcome = await processWebhookEvent({
    provider: 'printful',
    submissionKeyRaw: String(order.external_id),
    fulfillmentUnitIds: [fulfillmentUnitId],
    providerOrderId: String(order.id),
    rawStatus,
    rawPayload: body,
  });

  return NextResponse.json({ ok: true, outcome: outcome.outcome });
}
