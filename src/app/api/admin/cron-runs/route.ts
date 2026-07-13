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

  const { data: runs } = await supabaseAdmin
    .from('cron_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(100);

  // Compute alerts: runs > 75% of Hobby limit (45s)
  const THRESHOLD_MS = 45000;
  const alerts = (runs || []).filter(r => r.duration_ms && r.duration_ms > THRESHOLD_MS);

  return NextResponse.json({ runs: runs || [], alerts, threshold_ms: THRESHOLD_MS });
}
