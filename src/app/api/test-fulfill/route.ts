import { NextRequest, NextResponse } from 'next/server';
import { fulfillCjOrder } from '@/lib/cj/fulfill';

// Route de test temporaire : rejoue le fulfillment CJ sur une commande donnee.
// Protegee par CRON_SECRET. A SUPPRIMER apres validation.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const orderId = req.nextUrl.searchParams.get('orderId');
  if (!orderId) {
    return NextResponse.json({ error: 'orderId manquant' }, { status: 400 });
  }
  try {
    const vids = await fulfillCjOrder(orderId);
    return NextResponse.json({ ok: true, orderId, cjVids: vids, count: vids.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
