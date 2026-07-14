import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export const maxDuration = 10;

/**
 * POST /api/cron/instant-payout
 * Runs 6x/day (every 4 hours). Checks Nexiora platform Stripe balance
 * and triggers an instant payout to the platform debit card if balance > $5.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stripe = getStripe();

    // Check available balance
    const balance = await stripe.balance.retrieve();
    const available = balance.available.reduce((sum, b) => sum + b.amount, 0);

    // Only payout if balance > $5 (500 cents) to avoid micro-payouts
    if (available < 500) {
      return NextResponse.json({ status: 'skipped', reason: 'Balance too low', available_cents: available });
    }

    // Create instant payout to default external account (debit card)
    const payout = await stripe.payouts.create({
      amount: available,
      currency: balance.available[0]?.currency || 'cad',
      method: 'instant',
    });

    return NextResponse.json({
      status: 'success',
      payout_id: payout.id,
      amount: available / 100,
      currency: payout.currency,
    });
  } catch (e: any) {
    // If instant payout fails (e.g. card not eligible), fallback silently
    console.error('[instant-payout] Error:', e.message);
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
  }
}
