import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { startCronRun, finishCronRun } from '@/lib/cron-tracker';
import { Resend } from 'resend';

export const maxDuration = 30;

const ADMIN_EMAIL = 'issayamiyoussouf@gmail.com';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.deribfy.com';

type Check = { name: string; url: string; expect: RegExp };

/**
 * Canari de production pour les routes sensibles au routage (sitemap,
 * robots) — plateforme et domaine personnalise. N'existe pas pour
 * verifier la logique applicative (deja couverte par les tests), mais
 * pour detecter une regression au niveau du routage Next.js/Vercel
 * lui-meme, la seule categorie de bug que les tests locaux ne peuvent
 * pas voir (voir le sitemap par site, casse en production alors que le
 * code etait identique et correct en local — P0-4.1).
 */
async function runCheck(check: Check): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(check.url, { cache: 'no-store' });
    const body = await res.text();
    if (res.status !== 200) {
      return { ok: false, detail: `${check.name}: HTTP ${res.status} sur ${check.url}` };
    }
    if (!check.expect.test(body)) {
      return { ok: false, detail: `${check.name}: contenu inattendu sur ${check.url}` };
    }
    return { ok: true, detail: `${check.name}: OK` };
  } catch (e: any) {
    return { ok: false, detail: `${check.name}: exception (${e?.message || e}) sur ${check.url}` };
  }
}

export async function GET(req: NextRequest) {
  // Fail-closed (lot crons fail-open) : un secret absent doit refuser
  // l'acces, jamais le desactiver silencieusement.
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = await startCronRun('route-canary');

  try {
    const checks: Check[] = [
      { name: 'sitemap-plateforme', url: `${SITE_URL}/sitemap.xml`, expect: /<urlset/ },
      { name: 'robots-plateforme', url: `${SITE_URL}/robots.txt`, expect: /User-agent/i },
    ];

    const { data: publishedSite } = await supabaseAdmin
      .from('sites')
      .select('slug')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (publishedSite?.slug) {
      checks.push({
        name: 'sitemap-site-plateforme',
        url: `${SITE_URL}/sites/${publishedSite.slug}/sitemap.xml`,
        expect: /<urlset/,
      });
      checks.push({
        name: 'robots-site-plateforme',
        url: `${SITE_URL}/sites/${publishedSite.slug}/robots.txt`,
        expect: /User-agent/i,
      });
    }

    const { data: customDomainSite } = await supabaseAdmin
      .from('sites')
      .select('custom_domain')
      .eq('published', true)
      .not('custom_domain', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (customDomainSite?.custom_domain) {
      checks.push({
        name: 'sitemap-domaine-personnalise',
        url: `https://${customDomainSite.custom_domain}/sitemap.xml`,
        expect: /<urlset/,
      });
    }

    const results = await Promise.all(checks.map(runCheck));
    const failures = results.filter((r) => !r.ok);

    if (failures.length > 0) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'Deribfy Alerts <no-reply@deribfy.com>',
          to: ADMIN_EMAIL,
          subject: `⚠️ Canari routing : ${failures.length} verification(s) en echec`,
          html: [
            '<p>Le canari de routage a détecté un problème :</p>',
            '<ul>',
            ...failures.map((f) => `<li>${f.detail}</li>`),
            '</ul>',
            `<p>Vérifié le ${new Date().toISOString()}</p>`,
          ].join(''),
        });
      } catch (e) {
        console.error('Route canary alert email failed:', e);
      }
    }

    await finishCronRun(runId, {
      itemsProcessed: results.length,
      status: failures.length > 0 ? 'error' : 'success',
      errorMessage: failures.length > 0 ? failures.map((f) => f.detail).join(' | ') : undefined,
    });

    return NextResponse.json({ done: true, checked: results.length, failed: failures.length, results });
  } catch (e: any) {
    await finishCronRun(runId, { itemsProcessed: 0, status: 'error', errorMessage: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
