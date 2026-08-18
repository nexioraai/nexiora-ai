import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { DOMAIN_REGISTRY } from '@/lib/architecture/domainRegistry';

const ADMIN_EMAILS = ['issayamiyoussouf@gmail.com'];
const STALE_HOURS = 48;

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user }, error } = await supabaseAnon.auth.getUser(token);
  if (error || !user?.email || !ADMIN_EMAILS.includes(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Le registre de domaines (code) reste la source de vérité pour "quels
  // domaines sont surveillés" — indépendante de l'historique des checks.
  const domains = DOMAIN_REGISTRY.map((d) => ({
    id: d.id,
    description: d.description,
    capabilities: d.capabilities || [],
    ownedFiles: d.ownedFiles,
    contractTestsPath: d.contractTestsPath || null,
  }));

  const { data: history, error: dbError } = await supabaseAdmin
    .from('system_health_checks')
    .select('*')
    .eq('branch', 'main')
    .order('created_at', { ascending: false })
    .limit(20);

  // La table peut ne pas encore exister (migration manuelle, voir
  // supabase/sql/system_health_checks.sql) — ce n'est pas une erreur 500,
  // c'est un état "surveillance pas encore activée" que l'Admin doit savoir
  // afficher clairement plutôt que planter.
  if (dbError) {
    return NextResponse.json({
      domains,
      latest: null,
      history: [],
      isStale: true,
      tableMissing: true,
    });
  }

  const latest = history?.[0] || null;
  const isStale = !latest || Date.now() - new Date(latest.created_at).getTime() > STALE_HOURS * 3600 * 1000;

  return NextResponse.json({
    domains,
    latest,
    history: history || [],
    isStale,
    tableMissing: false,
  });
}
