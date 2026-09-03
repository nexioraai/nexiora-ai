import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { countsAsRevenue } from '@/lib/shop/orderStatusMachine';

const ADMIN_EMAILS = ['issayamiyoussouf@gmail.com'];

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user }, error } = await supabaseAnon.auth.getUser(token);
  if (error || !user?.email || !ADMIN_EMAILS.includes(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [
    { count: totalUsers },
    { count: totalSites },
    { count: publishedSites },
    { data: allSites },
    { count: totalOrders },
    { data: revenueData },
    { data: recentCrons },
    { data: recentAnomalies },
    { data: toPayOrders },
  ] = await Promise.all([
    supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('sites').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('sites').select('*', { count: 'exact', head: true }).eq('published', true),
    supabaseAdmin.from('sites').select('mode, dropship_type, published, owner_email, name, slug, created_at'),
    supabaseAdmin.from('shop_orders').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('shop_orders').select('nexiora_commission, supplier_cost, total, status'),
    supabaseAdmin.from('cron_runs').select('*').order('started_at', { ascending: false }).limit(50),
    supabaseAdmin.from('checkout_anomalies').select('*').order('created_at', { ascending: false }).limit(100),
    supabaseAdmin.from('shop_orders').select('id, cj_order_id, country_code, customer_name, shipping_amount, created_at').eq('cj_pay_status', 'awaiting_manual_payment').order('created_at', { ascending: false }).limit(50),
  ]);

  // Revenue calculations
  // Passe de cloture (reporting) -- la liste des statuts comptables etait
  // codee en dur ici et omettait 'processing' (commande POD deja payee,
  // en preparation fournisseur), sous-evaluant le CA du POD par rapport au
  // CJ. Source unique desormais : REVENUE_STATUSES (orderStatusMachine.ts),
  // la meme ou vit deja la machine a etats validee en LOT H -- une seule
  // definition, impossible de re-diverger.
  const paidOrders = (revenueData || []).filter((o: any) => countsAsRevenue(o.status));
  const totalRevenue = paidOrders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);
  const totalCommission = paidOrders.reduce((sum: number, o: any) => sum + (o.nexiora_commission || 0), 0);
  const totalSupplierCost = paidOrders.reduce((sum: number, o: any) => sum + (o.supplier_cost || 0), 0);

  // Breakdown by mode
  const sites = allSites || [];
  const uniqueOwners = new Set(sites.map((s: any) => s.owner_email)).size;

  const modeMap: Record<string, { total: number; published: number; sites: any[] }> = {};
  for (const s of sites) {
    const key = s.mode === 3 ? `3-${s.dropship_type || 'reseller'}` : String(s.mode);
    if (!modeMap[key]) modeMap[key] = { total: 0, published: 0, sites: [] };
    modeMap[key].total++;
    if (s.published) modeMap[key].published++;
    modeMap[key].sites.push({ name: s.name, slug: s.slug, published: s.published, owner_email: s.owner_email, created_at: s.created_at });
  }

  return NextResponse.json({
    users: { total: totalUsers || 0, withSites: uniqueOwners },
    sites: { total: totalSites || 0, published: publishedSites || 0 },
    orders: { total: totalOrders || 0, paid: paidOrders.length },
    revenue: { total: totalRevenue, commission: totalCommission, supplierCost: totalSupplierCost },
    breakdown: modeMap,
    crons: recentCrons || [],
    anomalies: recentAnomalies || [],
    toPayOrders: toPayOrders || [],
  });
}
