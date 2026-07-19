import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkDomain, getRegistrationRequirements } from '@/lib/domains/porkbun';

// Porkbun limite checkDomain a 1 appel toutes les 10 secondes, pour tout le
// compte. Le verrou est donc global et vit en base, pas en memoire : sur
// Vercel chaque requete peut atterrir sur une instance differente.
const RATE_LIMIT_MS = 10_000;
const LOCK_KEY = 'porkbun-checkdomain-last';

async function tooSoon(): Promise<number> {
  const { data } = await supabaseAdmin
    .from('cron_state')
    .select('value')
    .eq('key', LOCK_KEY)
    .maybeSingle();
  const last = Number((data?.value as any)?.at ?? 0);
  const elapsed = Date.now() - last;
  return elapsed >= RATE_LIMIT_MS ? 0 : RATE_LIMIT_MS - elapsed;
}

async function markCall(): Promise<void> {
  await supabaseAdmin.from('cron_state').upsert({
    key: LOCK_KEY,
    value: { at: Date.now() },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { domain } = await req.json().catch(() => ({ domain: '' }));
  if (typeof domain !== 'string' || !/^[a-z0-9-]+\.[a-z]{2,}$/i.test(domain.trim())) {
    return NextResponse.json({ error: 'Nom de domaine invalide' }, { status: 400 });
  }
  const clean = domain.trim().toLowerCase();
  const tld = clean.split('.').pop() || '';

  // Deja pris dans Nexiora ? Aucun appel API necessaire.
  const { data: taken } = await supabaseAdmin
    .from('site_domains')
    .select('id')
    .eq('domain', clean)
    .maybeSingle();
  if (taken) {
    return NextResponse.json({ domain: clean, available: false, reason: 'deja_reserve' });
  }

  const wait = await tooSoon();
  if (wait > 0) {
    return NextResponse.json(
      { error: 'Trop de recherches', retryAfterMs: wait },
      { status: 429 }
    );
  }

  try {
    await markCall();
    const [check, reqs] = await Promise.all([
      checkDomain(clean),
      getRegistrationRequirements(tld).catch(() => ({ apiRegisterable: false, registrationDurationYears: null })),
    ]);
    return NextResponse.json({
      ...check,
      apiRegisterable: reqs.apiRegisterable,
      // .ca, .us, .eu, .au : eligibilite registre non soumissible par API.
      reason: reqs.apiRegisterable ? null : 'tld_non_automatisable',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
