import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjGetBalance } from '@/lib/cj/client';

const LOW_BALANCE_THRESHOLD = 20;

/**
 * GET /api/shop/dashboard/alerts?slug=... → alertes orientees action pour le marchand.
 * - ordersToPayCj : commandes payees par le client mais pas encore reglees a CJ
 * - balance + lowBalance : solde CJ et alerte si sous le seuil
 * Echec CJ non bloquant : on renvoie balance=null sans casser la reponse.
 */
export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });

    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id, cj_email, cj_api_key, cj_auto_pay')
      .eq('slug', slug)
      .eq('owner_email', user.email)
      .single();
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

    // Commandes payees client mais pas encore reglees a CJ
    const { count: ordersToPayCj } = await supabaseAdmin
      .from('shop_orders')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', site.id)
      .eq('status', 'processing')
      .eq('cj_pay_status', 'pending');

    // Produits depublies pour rupture de stock CJ
    const { count: outOfStock } = await supabaseAdmin
      .from('shop_products')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', site.id)
      .eq('cj_stock_status', 'out_of_stock');

    // Solde CJ (non bloquant)
    let balance: number | null = null;
    let lowBalance = false;
    if (site.cj_email && site.cj_api_key) {
      try {
        balance = await cjGetBalance(site.cj_email, site.cj_api_key);
        lowBalance = balance !== null && balance < LOW_BALANCE_THRESHOLD;
      } catch (e) {
        balance = null;
      }
    }

    return NextResponse.json({
      ordersToPayCj: ordersToPayCj || 0,
      outOfStock: outOfStock || 0,
      balance,
      lowBalance,
      threshold: LOW_BALANCE_THRESHOLD,
      autoPay: !!site.cj_auto_pay,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
