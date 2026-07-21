import { NextRequest, NextResponse } from 'next/server';
import { fulfillCjOrder } from '@/lib/cj/fulfill';

// Route de test TEMPORAIRE (sans auth) : rejoue le fulfillment CJ.
// A SUPPRIMER immediatement apres validation.
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('orderId');
  if (!orderId) {
    return NextResponse.json({ error: 'orderId manquant' }, { status: 400 });
  }
  try {
    const vids = await fulfillCjOrder(orderId);
    return NextResponse.json({ ok: true, orderId, cjVids: vids, count: vids.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e), stack: e?.stack }, { status: 500 });
  }
}
