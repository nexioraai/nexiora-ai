import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';

const ADMIN_EMAILS = ['issayamiyoussouf@gmail.com'];

// Tarifs Anthropic en USD par million de tokens (input / output)
const PRICING: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5-20251001': { in: 1.0, out: 5.0 },
  'claude-sonnet-4-6': { in: 3.0, out: 15.0 },
};
const DEFAULT_PRICE = { in: 3.0, out: 15.0 };

function costOf(model: string | null, inTok: number, outTok: number): number {
  const p = (model && PRICING[model]) || DEFAULT_PRICE;
  return (inTok / 1_000_000) * p.in + (outTok / 1_000_000) * p.out;
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user }, error } = await supabaseAnon.auth.getUser(token);
  if (error || !user?.email || !ADMIN_EMAILS.includes(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: logs } = await supabaseAdmin
    .from('ai_usage_log')
    .select('site_id, usage_type, model, input_tokens, output_tokens, created_at')
    .order('created_at', { ascending: false })
    .limit(50000);

  const { data: sites } = await supabaseAdmin
    .from('sites')
    .select('id, name, slug, owner_email');
  const siteMap = new Map<string, { name: string; slug: string; owner_email: string }>();
  (sites || []).forEach((s: any) => siteMap.set(s.id, { name: s.name, slug: s.slug, owner_email: s.owner_email }));

  type Row = {
    site_id: string | null;
    name: string;
    slug: string;
    owner_email: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cost: number;
    by_type: Record<string, number>;
    last_used: string | null;
  };
  const map = new Map<string, Row>();
  let totalCalls = 0;
  let totalCost = 0;
  let totalIn = 0;
  let totalOut = 0;

  (logs || []).forEach((l: any) => {
    const key = l.site_id || '__none__';
    if (!map.has(key)) {
      const info = l.site_id ? siteMap.get(l.site_id) : null;
      map.set(key, {
        site_id: l.site_id,
        name: info?.name || (l.site_id ? '(boutique supprimee)' : 'Sans boutique'),
        slug: info?.slug || '',
        owner_email: info?.owner_email || '',
        calls: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost: 0,
        by_type: {},
        last_used: null,
      });
    }
    const row = map.get(key)!;
    row.calls += 1;
    row.input_tokens += l.input_tokens || 0;
    row.output_tokens += l.output_tokens || 0;
    row.cost += costOf(l.model, l.input_tokens || 0, l.output_tokens || 0);
    row.by_type[l.usage_type] = (row.by_type[l.usage_type] || 0) + 1;
    if (!row.last_used || l.created_at > row.last_used) row.last_used = l.created_at;

    totalCalls += 1;
    totalIn += l.input_tokens || 0;
    totalOut += l.output_tokens || 0;
    totalCost += costOf(l.model, l.input_tokens || 0, l.output_tokens || 0);
  });

  const rows = Array.from(map.values()).sort((a, b) => b.cost - a.cost);

  return NextResponse.json({
    total: {
      calls: totalCalls,
      input_tokens: totalIn,
      output_tokens: totalOut,
      cost: totalCost,
      sites: rows.filter((r) => r.site_id).length,
    },
    rows,
  });
}
