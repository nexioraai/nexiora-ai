import { NextRequest, NextResponse } from 'next/server';
import { fulfillCjOrder } from '@/lib/cj/fulfill';

export async function GET(req: NextRequest) {
  const orderId = 'd7a9306c-e85f-4b3d-8799-f8744ed52515';
  try {
    const vids = await fulfillCjOrder(orderId);
    return NextResponse.json({ ok: true, orderId, cjVids: vids, count: vids.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e), stack: e?.stack }, { status: 500 });
  }
}
