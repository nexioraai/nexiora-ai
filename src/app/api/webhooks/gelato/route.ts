import { NextResponse } from 'next/server';
import { processWebhookEvent } from '@/lib/fulfillment/webhook-handler';
import { decodeIdempotencyKey } from '@/lib/fulfillment/idempotency-key';
import { getGelatoOrderById } from '@/lib/fulfillment/provider-lookup';
import { reportReconciliationConflict } from '@/lib/fulfillment/observability';
import { verifyWebhookSecret } from '@/lib/fulfillment/webhook-auth';

// ============================================================
// P0-3.7Z Phase 10-12, P0-3.9.6 Gap #1A — Webhook Gelato.
//
// [OFFICIEL, P0-3.7Q] orderReferenceId + orderId présents sur les webhooks
// Gelato de suivi de commande. [NON DÉMONTRÉ] la structure exacte de
// items[]/itemReferenceId DANS LE PAYLOAD WEBHOOK lui-même (P0-3.9.5/3.9.6)
// — le webhook sert donc uniquement de DÉCLENCHEUR : dès qu'il identifie
// orderReferenceId + orderId, la liste d'items fiable est récupérée via
// GET /v4/orders/{orderId} (confirmé [OFFICIEL], schéma OpenAPI officiel,
// P0-3.9.1), jamais devinée depuis le payload webhook. Lecture seule,
// aucune commande créée/modifiée. Ce ré-appel authentifié (X-API-KEY, nos
// propres credentials) EST déjà la vérification croisée que LOT I a dû
// ajouter séparément côté Printful (voir webhooks/printful/route.ts) — rien
// à ajouter ici sur ce point.
//
// LOT I (F-I-1) — recherche documentaire menée avant ce lot : Gelato ne
// documente pas de signature HMAC pour l'API Order (order.gelatoapis.com,
// celle utilisée ici) — un mécanisme JWT/iss existe mais appartient à un
// produit distinct, "GelatoConnect" (connect-api.live.gelato.tech), non
// utilisé par ce projet (confirmé : gelato-adapter.ts et provider-lookup.ts
// n'appellent que order.gelatoapis.com/api.gelato.com). La documentation
// Gelato pour l'API réellement utilisée ici décrit un secret configurable
// au choix du marchand (en-tête HTTP OU paramètre de requête) au moment de
// la création du webhook dans le dashboard -- authentification déportée
// vers webhook-auth.ts (fail-closed, supporte les deux transports).
// ============================================================

export async function POST(req: Request) {
  if (!verifyWebhookSecret(req, process.env.GELATO_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const orderReferenceId = body?.orderReferenceId as string | undefined;
  const orderId = (body?.orderId ?? body?.id) as string | undefined;

  if (!orderReferenceId || !orderId) {
    console.error('[gelato-webhook] payload incomplet (orderReferenceId/orderId manquant):', JSON.stringify(body).slice(0, 500));
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Gap #1A : le webhook est un déclencheur, jamais une source complète —
  // GET order est la vérité item-level (jamais inventée si l'appel échoue).
  let orderDetails;
  try {
    orderDetails = await getGelatoOrderById(String(orderId), process.env.GELATO_API_KEY || '');
  } catch (e) {
    // Échec de l'enrichissement : ne pas inventer les items, ne pas
    // déclarer SUCCESS, conserver un état sûr (la Submission reste
    // inchangée), journaliser l'anomalie.
    await reportReconciliationConflict({
      submissionId: orderReferenceId,
      provider: 'gelato',
      reason: e instanceof Error ? e.message : 'gelato_get_order_failed',
      details: { orderId: String(orderId), phase: 'webhook_enrichment' },
    });
    return NextResponse.json({ ok: true, enrichment_failed: true });
  }

  if (!orderDetails.found || !orderDetails.items || orderDetails.items.length === 0) {
    console.error('[gelato-webhook] GET order sans items exploitables:', orderId);
    return NextResponse.json({ ok: true, ignored: true });
  }

  const fulfillmentUnitIds: string[] = [];
  for (const item of orderDetails.items) {
    try {
      fulfillmentUnitIds.push(decodeIdempotencyKey(item.itemReferenceId));
    } catch {
      console.error('[gelato-webhook] itemReferenceId non décodable:', item.itemReferenceId);
    }
  }
  if (fulfillmentUnitIds.length === 0) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const rawStatus = orderDetails.fulfillmentStatus ?? (body?.fulfillmentStatus as string | undefined) ?? '';

  const outcome = await processWebhookEvent({
    provider: 'gelato',
    submissionKeyRaw: orderReferenceId,
    fulfillmentUnitIds,
    providerOrderId: String(orderId),
    rawStatus: String(rawStatus),
    rawPayload: { webhook: body, orderDetails: orderDetails.raw },
  });

  return NextResponse.json({ ok: true, outcome: outcome.outcome });
}
