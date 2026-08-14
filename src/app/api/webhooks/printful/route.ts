import { NextResponse } from 'next/server';
import { processWebhookEvent } from '@/lib/fulfillment/webhook-handler';
import { decodeIdempotencyKey } from '@/lib/fulfillment/idempotency-key';

// ============================================================
// P0-3.7Z Phase 10-12 — Webhook Printful.
//
// [NON DÉMONTRÉ] La forme exacte du payload webhook Printful (types
// d'événements, présence garantie de `data.order.status`, mécanisme de
// signature éventuel) n'a pas été vérifiée contre une documentation ou un
// événement réel dans cette série — seule la réponse REST de
// GET /orders/{id} (utilisée par getTracking) a été directement observée.
// Le parsing ci-dessous suit la structure documentée publiquement par
// Printful (`data.order.external_id`, `data.order.id`, `data.order.status`)
// mais DOIT être validé contre un événement sandbox réel avant mise en
// production (recommandation du P0-3.7 Final Gate : validation empirique
// pendant l'implémentation de l'adaptateur, pas blocage architectural).
//
// Authentification : Printful ne documente pas de signature HMAC pour ses
// webhooks dans les sources consultées — protection minimale par secret
// partagé dans l'URL, à renforcer si un mécanisme de signature officiel
// est confirmé.
// ============================================================

export async function POST(req: Request) {
  const expectedSecret = process.env.PRINTFUL_WEBHOOK_SECRET;
  if (expectedSecret) {
    const url = new URL(req.url);
    const provided = url.searchParams.get('secret');
    if (provided !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
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

  const outcome = await processWebhookEvent({
    provider: 'printful',
    submissionKeyRaw: String(order.external_id),
    fulfillmentUnitIds: [fulfillmentUnitId],
    providerOrderId: String(order.id),
    rawStatus: String(order.status ?? body?.type ?? ''),
    rawPayload: body,
  });

  return NextResponse.json({ ok: true, outcome: outcome.outcome });
}
