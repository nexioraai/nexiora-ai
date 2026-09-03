import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';

/**
 * GET /api/shop/finances?slug=xxx&period=30
 * Returns financial summary for the merchant dashboard.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');
  const period = parseInt(url.searchParams.get('period') || '30', 10);

  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });

  // M2-02 -- controle de propriete reimplemente ici (`owner_email` seul).
  // Delegue a la primitive canonique : meme regle que les 6 autres routes,
  // avec priorite `owner_id`.
  const auth = await requireSiteOwner(req, slug);
  if (!auth.ok) return auth.response;
  const site = auth.site as { id: string };

  const since = new Date();
  since.setDate(since.getDate() - period);

  const { data: orders } = await supabaseAdmin
    .from('shop_orders')
    .select('total, supplier_cost, nexiora_commission, merchant_profit, currency, status, created_at')
    .eq('site_id', site.id)
    .eq('status', 'paid')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  const rows = orders || [];

  const summary = {
    total_revenue: rows.reduce((s, o) => s + Number(o.total || 0), 0),
    total_supplier_cost: rows.reduce((s, o) => s + Number(o.supplier_cost || 0), 0),
    total_commission: rows.reduce((s, o) => s + Number(o.nexiora_commission || 0), 0),
    total_profit: rows.reduce((s, o) => s + Number(o.merchant_profit || 0), 0),
    order_count: rows.length,
    currency: rows[0]?.currency || 'USD',
  };

  // Group by day for chart
  const daily: Record<string, { revenue: number; profit: number; orders: number }> = {};
  for (const o of rows) {
    const day = o.created_at.slice(0, 10);
    if (!daily[day]) daily[day] = { revenue: 0, profit: 0, orders: 0 };
    daily[day].revenue += Number(o.total || 0);
    daily[day].profit += Number(o.merchant_profit || 0);
    daily[day].orders += 1;
  }

  const chart = Object.entries(daily)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }));

  return NextResponse.json({ summary, chart, period });
}
