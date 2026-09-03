import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { startCronRun, finishCronRun } from '@/lib/cron-tracker';

export const maxDuration = 10;

/**
 * GET /api/cron/instant-payout
 * Verifie le solde Stripe de la plateforme et declenche un virement instantane
 * vers la carte de debit si le solde depasse 5$.
 *
 * La route etait en POST : les crons Vercel appellent en GET, donc elle
 * renvoyait 405 a chaque execution et n'a jamais tourne.
 *
 * LOT I (F-I-2, audit Mode 3 global) -- cause racine : `authHeader !==
 * \`Bearer ${process.env.CRON_SECRET}\`` est fail-open si CRON_SECRET est
 * absent (interpolation produit litteralement "Bearer undefined", une
 * chaine qu'un appelant externe peut envoyer telle quelle). Meme classe de
 * bug deja identifiee et corrigee sur TOUTES les autres routes cron du
 * depot sauf supplier-watch (LOT K, hors perimetre ici) -- confirme par
 * recherche exhaustive sur les 13 routes cron, seule celle-ci utilisait
 * encore l'ancien pattern. Impact reel si CRON_SECRET etait absent : appel
 * arbitraire de stripe.payouts.create (argent reel de la plateforme).
 * Aligne sur le pattern fail-closed deja standard ailleurs (cf.
 * cj-tracking/route.ts, pod-reconciliation/route.ts).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = await startCronRun('instant-payout');
  try {
    const stripe = getStripe();

    const balance = await stripe.balance.retrieve();

    // Un virement porte sur UNE devise. Additionner toutes les devises puis
    // verser dans celle du premier element donnerait un montant faux des qu'il
    // y a plusieurs devises au solde.
    const results: { currency: string; amount: number; payoutId?: string; skipped?: string }[] = [];

    for (const bal of balance.available) {
      // Sous 5$, on laisse s'accumuler : chaque virement instantane coute 1%.
      if (bal.amount < 500) {
        results.push({ currency: bal.currency, amount: bal.amount, skipped: 'solde insuffisant' });
        continue;
      }
      try {
        const payout = await stripe.payouts.create({
          amount: bal.amount,
          currency: bal.currency,
          method: 'instant',
        });
        results.push({ currency: bal.currency, amount: bal.amount, payoutId: payout.id });
      } catch (e: any) {
        // Carte non eligible, plafond atteint : on n'interrompt pas les autres devises.
        results.push({ currency: bal.currency, amount: bal.amount, skipped: e.message });
      }
    }

    const sent = results.filter((r) => r.payoutId).length;
    await finishCronRun(runId, { itemsProcessed: sent });
    return NextResponse.json({ status: 'done', payouts: sent, results });
  } catch (e: any) {
    console.error('[instant-payout] Error:', e.message);
    await finishCronRun(runId, { itemsProcessed: 0, status: 'error', errorMessage: e.message });
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
  }
}
