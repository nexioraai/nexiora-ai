import { supabaseAdmin } from '@/lib/supabase-admin';
import { purchaseDomain, previewPurchase, createDnsRecord } from '@/lib/domains/porkbun';
import { addDomainToVercel, VERCEL_A_RECORD, VERCEL_CNAME } from '@/lib/domains/vercel';

/**
 * Chaine complete apres encaissement : achat Porkbun, DNS, Vercel.
 * Chaque etape horodate site_domains, donc une reprise apres echec sait ou
 * elle en est. Aucune etape n'est rejouee si elle a deja abouti.
 */
export async function provisionDomain(domainId: string): Promise<{ ok: boolean; status: string }> {
  const { data: row } = await supabaseAdmin
    .from('site_domains')
    .select('id, domain, price_cents, status, purchased_at, dns_configured_at, site_id')
    .eq('id', domainId)
    .maybeSingle();

  if (!row) return { ok: false, status: 'introuvable' };
  if (row.status === 'indexed' || row.status === 'dns_configured') {
    return { ok: true, status: row.status };
  }

  const fail = async (msg: string) => {
    await supabaseAdmin
      .from('site_domains')
      .update({ status: 'failed', last_error: msg.slice(0, 500), updated_at: new Date().toISOString() })
      .eq('id', domainId);
    console.error('[provision]', row.domain, msg);
    return { ok: false, status: 'failed' };
  };

  // 1. Achat Porkbun. La cle d'idempotence est l'id de la ligne : un rejeu
  //    dans les 24h replay le resultat au lieu de racheter et refacturer.
  if (!row.purchased_at) {
    if (row.price_cents == null) return fail('Prix absent');
    try {
      const preview = await previewPurchase(row.domain, row.price_cents);
      if (!preview.wouldSucceed) {
        return fail('Achat impossible : ' + (preview.message || 'controles Porkbun echoues'));
      }
      await purchaseDomain(row.domain, row.price_cents, domainId);
      await supabaseAdmin
        .from('site_domains')
        .update({ status: 'purchased', purchased_at: new Date().toISOString(), last_error: null })
        .eq('id', domainId);
    } catch (e: any) {
      return fail('Porkbun : ' + (e?.message || 'echec achat'));
    }
  }

  // 2. Rattachement Vercel avant le DNS : sans cela le domaine resoudrait
  //    vers un projet qui ne le reconnait pas.
  try {
    await addDomainToVercel(row.domain);
  } catch (e: any) {
    return fail('Vercel : ' + (e?.message || 'echec rattachement'));
  }

  // 3. DNS chez Porkbun. C'est ce que le marchand devait faire lui-meme
  //    dans le parcours classique ; ici Nexiora possede la zone.
  if (!row.dns_configured_at) {
    try {
      await createDnsRecord(row.domain, { type: 'A', name: '', content: VERCEL_A_RECORD });
      await createDnsRecord(row.domain, { type: 'CNAME', name: 'www', content: VERCEL_CNAME });
      await supabaseAdmin
        .from('site_domains')
        .update({
          status: 'dns_configured',
          dns_configured_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', domainId);
    } catch (e: any) {
      return fail('DNS : ' + (e?.message || 'echec ecriture'));
    }
  }

  // 4. Le site pointe desormais sur ce domaine.
  await supabaseAdmin
    .from('sites')
    .update({ custom_domain: row.domain })
    .eq('id', row.site_id);

  return { ok: true, status: 'dns_configured' };
}
