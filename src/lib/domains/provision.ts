import { supabaseAdmin } from '@/lib/supabase-admin';
import { purchaseDomain, previewPurchase, createDnsRecord, deleteDnsByNameType } from '@/lib/domains/porkbun';
import {
  addDomainToVercel,
  getVercelDomainStatus,
  verifyVercelDomain,
  VERCEL_A_RECORD,
  VERCEL_CNAME,
} from '@/lib/domains/vercel';
import { getDnsVerificationToken } from '@/lib/domains/searchconsole';

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
  let vercelVerification: { type: string; domain: string; value: string }[] = [];
  try {
    const added = await addDomainToVercel(row.domain);
    vercelVerification = added.verification;
    // Un domaine deja rattache ne renvoie pas les TXT dans la reponse d'ajout :
    // il faut les relire sur l'etat du domaine.
    if (!vercelVerification.length) {
      const st = await getVercelDomainStatus(row.domain);
      if (!st.verified) vercelVerification = st.verification;
    }
  } catch (e: any) {
    return fail('Vercel : ' + (e?.message || 'echec rattachement'));
  }

  // 3. DNS chez Porkbun. C'est ce que le marchand devait faire lui-meme
  //    dans le parcours classique ; ici Nexiora possede la zone.
  if (!row.dns_configured_at) {
    try {
      // Un domaine transfere arrive avec les enregistrements de son ancien
      // hebergeur. createDnsRecord AJOUTE sans remplacer : sans ce nettoyage,
      // la zone renvoie deux A et le trafic part chez l'ancien hebergeur.
      // Suppression tolerante : une zone vide (domaine neuf) n'a rien a
      // supprimer, ce n'est pas une erreur.
      for (const [t, name] of [['A', ''], ['ALIAS', ''], ['CNAME', 'www'], ['A', 'www']] as const) {
        try {
          await deleteDnsByNameType(row.domain, t, name);
        } catch {
          /* rien a supprimer */
        }
      }
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

  // 3bis. TXT de propriete exiges par Vercel. Sans eux le domaine reste
  //       "pending verification" et Vercel sert l'ancien hebergeur : le
  //       marchand voit son ancien site alors que tout semble configure.
  if (vercelVerification.length) {
    for (const v of vercelVerification) {
      if (v.type?.toUpperCase() !== 'TXT') continue;
      // Vercel donne le FQDN (_vercel.exemple.com), Porkbun attend le
      // sous-domaine seul.
      const sub = v.domain.endsWith('.' + row.domain)
        ? v.domain.slice(0, -(row.domain.length + 1))
        : '';
      try {
        await deleteDnsByNameType(row.domain, 'TXT', sub);
      } catch {
        /* rien a supprimer */
      }
      await createDnsRecord(row.domain, { type: 'TXT', name: sub, content: v.value });
    }
    // La verification echoue si le DNS n'a pas encore propage : ce n'est pas
    // un echec de provisioning, le cron domain-retry repassera.
    try {
      const ok = await verifyVercelDomain(row.domain);
      if (!ok) console.warn('[provision] Vercel pas encore verifie', row.domain);
    } catch (e: any) {
      console.warn('[provision] verify Vercel', row.domain, e?.message || e);
    }
  }

  // 4. TXT de verification Google, pose des maintenant pour laisser le temps
  //    a la propagation DNS. La verification elle-meme est faite plus tard par
  //    le cron : Google echoue s'il interroge le DNS trop tot.
  try {
    const token = await getDnsVerificationToken(row.domain);
    await createDnsRecord(row.domain, { type: 'TXT', name: '', content: token });
    await supabaseAdmin
      .from('site_domains')
      .update({ gsc_token: token })
      .eq('id', domainId);
  } catch (e: any) {
    // Non bloquant : le domaine fonctionne meme si l'indexation attend.
    // Le cron reessaiera. Mais l'erreur doit rester visible : sans trace,
    // un domaine reste indefiniment non indexe sans que personne ne le sache.
    const msg = 'TXT Google : ' + (e?.message || String(e));
    console.error('[provision]', row.domain, msg);
    await supabaseAdmin
      .from('site_domains')
      .update({ last_error: msg.slice(0, 500) })
      .eq('id', domainId);
  }

  // 5. Le site pointe desormais sur ce domaine.
  await supabaseAdmin
    .from('sites')
    .update({ custom_domain: row.domain })
    .eq('id', row.site_id);

  return { ok: true, status: 'dns_configured' };
}
