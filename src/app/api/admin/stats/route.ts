import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';

const ADMIN_EMAILS = ['issayamiyoussouf@gmail.com'];

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error } = await supabaseAnon.auth.getUser(token);
  if (error || !user?.email || !ADMIN_EMAILS.includes(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [
    { count: totalSites },
    { count: publishedSites },
    { data: modeBreakdown },
    { count: totalOrders },
    { data: recentCrons },
  ] = await Promise.all([
    supabaseAdmin.from('sites').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('sites').select('*', { count: 'exact', head: true }).eq('published', true),
    supabaseAdmin.rpc('admin_sites_by_mode'),
    supabaseAdmin.from('shop_orders').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('cron_runs').select('*').order('started_at', { ascending: false }).limit(50),
  ]);

  return NextResponse.json({
    sites: { total: totalSites || 0, published: publishedSites || 0, byMode: modeBreakdown || [] },
    orders: { total: totalOrders || 0 },
    crons: recentCrons || [],
  });
}
