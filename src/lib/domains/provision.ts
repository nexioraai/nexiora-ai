import { supabaseAdmin } from '@/lib/supabase-admin';
import { purchaseDomain, previewPurchase, createDnsRecord, deleteDnsByNameType, listAllDomains } from '@/lib/domains/porkbun';
import {
  addDomainToVercel,
  getVercelDomainStatus,
  verifyVercelDomain,
  VERCEL_A_RECORD,
  VERCEL_CNAME,
} from '@/lib/domains/vercel';
import { getDnsVerificationToken } from '@/lib/domains/searchconsole';
import { checkExistingMail } from '@/lib/domains/mail-guard';
import { logAnomaly } from '@/lib/anomaly';
import { consignerEvenementDomaine } from '@/lib/domains/history';

/**
 * Chaine complete apres encaissement : achat Porkbun, DNS, Vercel.
 * Chaque etape horodate site_domains, donc une reprise apres echec sait ou
 * elle en est. Aucune etape n'est rejouee si elle a deja abouti.
 */
// Audit Mode 3/POD BRAND, perfectionnement (fermeture dette Porkbun/DEBT-019) --
// delai de securite avant de conclure qu'un domaine 'purchase_uncertain' n'a
// PAS ete achete. listAllDomains() (deja utilise pour la verification BYOD,
// domains/provision/route.ts) interroge l'etat REEL du compte Porkbun --
// autorite verifiable, contrairement a une simple hypothese sur l'Idempotency-Key.
// Ce delai protege contre une eventuelle latence de coherence cote Porkbun
// (achat qui vient de reussir mais n'apparait pas encore dans listAll) : sans
// lui, un "non trouve" premature ferait repasser la ligne a 'failed', que le
// chemin d'echec normal retenterait reellement des le prochain passage --
// risque de double achat identique a celui que ce mecanisme existe pour
// eliminer. domain-retry tourne toutes les 2h (vercel.json) : ce delai est
// largement couvert par UN SEUL intervalle de cron, donc n'introduit pas de
// tentative gaspillee en pratique.
const PURCHASE_UNCERTAIN_RECHECK_COOLDOWN_MS = 30 * 60 * 1000;

export async function provisionDomain(domainId: string): Promise<{ ok: boolean; status: string }> {
  const { data: row } = await supabaseAdmin
    .from('site_domains')
    .select('id, domain, price_cents, status, purchased_at, dns_configured_at, site_id, gsc_token, updated_at')
    .eq('id', domainId)
    .maybeSingle();

  if (!row) return { ok: false, status: 'introuvable' };
  // 'dns_configured' est un etat INTERMEDIAIRE (Google pas encore traite),
  // pas un etat termine : le considerer comme "deja fait" ici bloquait toute
  // reprise manuelle (via cette meme route) d'un domaine reste bloque a cette
  // etape apres un echec transitoire du TXT Google. Seul 'sitemap_submitted'
  // signifie reellement que plus rien ne reste a faire.
  if (row.status === 'sitemap_submitted') {
    return { ok: true, status: row.status };
  }
  // Audit Mode 3/POD BRAND, perfectionnement (fermeture dette Porkbun/DEBT-019) --
  // cause racine du precedent correctif ("purchase_uncertain necessite une
  // intervention manuelle indefinie") : il n'existait aucun moyen de VERIFIER
  // l'etat reel cote Porkbun, seulement de deviner -- d'ou l'arret complet et
  // permanent. listAllDomains() (deja fiable, deja utilise pour BYOD) leve
  // cette ambiguite : c'est la source de verite du fournisseur, pas une
  // supposition sur l'Idempotency-Key. Ceci transforme 'purchase_uncertain'
  // d'un etat terminal necessitant du SQL manuel en un etat auto-guerissable,
  // sans jamais retenter purchaseDomain() a l'aveugle :
  //   - domaine trouve dans le compte Porkbun -> l'achat A REUSSI, on confirme
  //     purchased_at et on reprend le pipeline normalement (aucun rachat).
  //   - domaine absent APRES le delai de securite -> jamais achete pour de
  //     vrai, on repasse a 'failed' (chemin d'echec normal, deja borne par
  //     domain-retry/MAX_ATTEMPTS) -- un retry legitime devient a nouveau
  //     possible, en connaissance de cause plutot qu'a l'aveugle.
  //   - domaine absent MAIS delai pas encore ecoule, ou listAllDomains() elle-
  //     meme indisponible -> on ne conclut RIEN, on reste en attente plutot
  //     que de deviner dans un sens ou l'autre.
  if (row.status === 'purchase_uncertain') {
    let owned: { domain: string }[] = [];
    try {
      owned = await listAllDomains();
    } catch (e: any) {
      console.warn('[provision] listAllDomains indisponible, reconciliation purchase_uncertain reportee', row.domain, e?.message || e);
      return { ok: false, status: 'purchase_uncertain' };
    }
    const reallyOwned = owned.some((d) => d.domain.toLowerCase() === row.domain.toLowerCase());

    if (reallyOwned) {
      const { error: confirmErr } = await supabaseAdmin
        .from('site_domains')
        .update({ status: 'purchased', purchased_at: new Date().toISOString(), last_error: null })
        .eq('id', domainId)
        .eq('status', 'purchase_uncertain');
      if (confirmErr) {
        console.error('[provision] reconciliation purchase_uncertain : achat confirme chez Porkbun mais ecriture de confirmation en echec', row.domain, confirmErr.message);
        await logAnomaly({
          type: 'domain_reconciliation_write_failed',
          severity: 'blocked',
          siteId: row.site_id,
          details: { domainId, domain: row.domain, error: confirmErr.message },
        });
        return { ok: false, status: 'purchase_uncertain' };
      }
      // Reappel plutot que de dupliquer la suite du pipeline ici : relit la
      // ligne fraiche (purchased_at desormais renseigne) et reprend
      // normalement les etapes 2 a 5, exactement comme un premier passage
      // reussi -- un seul niveau de recursion, non reentrant sur ce meme
      // statut (purchased_at est maintenant renseigne, cette branche ne peut
      // plus etre reprise).
      return provisionDomain(domainId);
    }

    const uncertainSinceMs = row.updated_at ? Date.now() - new Date(row.updated_at).getTime() : Infinity;
    if (uncertainSinceMs < PURCHASE_UNCERTAIN_RECHECK_COOLDOWN_MS) {
      return { ok: false, status: 'purchase_uncertain' };
    }
    await supabaseAdmin
      .from('site_domains')
      .update({
        status: 'failed',
        last_error: 'Achat jamais confirme chez Porkbun (listAllDomains, apres delai de securite) -- nouvel essai autorise',
        updated_at: new Date().toISOString(),
      })
      .eq('id', domainId)
      .eq('status', 'purchase_uncertain');
    return { ok: false, status: 'failed' };
  }

  const fail = async (msg: string) => {
    await supabaseAdmin
      .from('site_domains')
      .update({ status: 'failed', last_error: msg.slice(0, 500), updated_at: new Date().toISOString() })
      .eq('id', domainId);
    console.error('[provision]', row.domain, msg);
    // ============================================================
    // R7 -- UN ECHEC DE PROVISIONNEMENT ETAIT SILENCIEUX.
    //
    // Cette voie ne posait qu'un `console.error`. Or elle couvre les echecs
    // les plus couteux : solde insuffisant chez le registraire, API
    // indisponible, extension refusee. Le client a DEJA PAYE via Stripe, et
    // personne n'etait prevenu -- ni lui, ni nous. Un journal de fonction
    // serverless n'est pas une alerte.
    //
    // `blocked` et non `warning` : une commande payee qui n'aboutit pas
    // exige une intervention humaine, pas une statistique.
    // ============================================================
    await logAnomaly({
      type: 'domain_provision_failed',
      severity: 'blocked',
      siteId: row.site_id ?? null,
      details: { domainId, domain: row.domain, status: row.status, error: msg.slice(0, 500) },
    });
    await consignerEvenementDomaine({
      siteId: (row.site_id as string) ?? null,
      domain: row.domain,
      evenement: 'provisionnement',
      origine: 'cron',
      details: { domainId, resultat: 'echec', error: msg.slice(0, 300) },
    });
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
      // Audit Mode 3/POD BRAND, perfectionnement -- cause racine : Porkbun
      // vient d'etre reellement facture ; si l'ecriture ci-dessous echoue
      // (probleme reseau/DB transitoire), purchased_at reste null et
      // domain-retry (qui cible status='failed' ou 'paid' perime) rappelle
      // provisionDomain() -- qui, ne voyant toujours pas purchased_at,
      // racheterait reellement le domaine une seconde fois chez Porkbun
      // (rien dans ce repo ne prouve que l'Idempotency-Key envoyee a Porkbun
      // protege contre ce cas precis, voir porkbun.ts). Retry court sur
      // l'ECRITURE (pas sur l'achat, deja fait) pour fermer la fenetre la
      // plus probable (contention/latence transitoire).
      let writeOk = false;
      let lastWriteErr: unknown = null;
      for (let attempt = 0; attempt < 3 && !writeOk; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt));
        const { error: writeErr } = await supabaseAdmin
          .from('site_domains')
          .update({ status: 'purchased', purchased_at: new Date().toISOString(), last_error: null })
          .eq('id', domainId);
        if (!writeErr) writeOk = true;
        else lastWriteErr = writeErr;
      }
      if (!writeOk) {
        // Correctif (revue de ce lot) : se contenter de logAnomaly() ici
        // laissait la ligne a status='paid' -- exactement la valeur que
        // domain-retry (PAID_STALE_MS = 10 min, cron/domain-retry/route.ts)
        // reprend automatiquement. Sans changement de statut ACTIF, ce cron
        // aurait rappele provisionDomain() 10 minutes plus tard, qui aurait
        // retente reellement purchaseDomain() -- l'anomalie loggee n'etait
        // qu'informative, elle ne bloquait rien mecaniquement. status
        // devient desormais 'purchase_uncertain', une valeur qu'AUCUNE
        // requete de domain-retry ne cible (`status.eq.failed,and(status.eq.paid,...)`)
        // -- ce domaine ne sera plus jamais retente automatiquement tant
        // qu'une intervention humaine n'a pas confirme l'etat reel cote
        // Porkbun et corrige la ligne manuellement. watchdog (cron) alerte
        // immediatement sur toute ligne dans cet etat (voir watchdog/route.ts).
        // Tentative best-effort, independante de celle qui vient d'echouer :
        // si le probleme etait localise (ex. conflit sur cette ligne
        // precise) plutot qu'une panne DB totale, celle-ci a de bonnes
        // chances de reussir malgre l'echec des 3 precedentes.
        const msg = 'Achat Porkbun reussi mais ecriture purchased_at en echec apres 3 tentatives -- ' +
          'intervention manuelle requise, NE PAS racheter automatiquement : ' +
          (lastWriteErr instanceof Error ? lastWriteErr.message : String(lastWriteErr));
        console.error('[provision]', row.domain, msg);
        const { error: markErr } = await supabaseAdmin
          .from('site_domains')
          // updated_at horodate explicitement le debut du delai de securite
          // de reconciliation (PURCHASE_UNCERTAIN_RECHECK_COOLDOWN_MS,
          // voir plus haut) -- sans lui, une ligne dont l'ecriture initiale
          // 'paid' remonte a des jours serait a tort consideree "deja
          // suffisamment attendue" des la premiere reconciliation.
          .update({ status: 'purchase_uncertain', last_error: msg.slice(0, 500), updated_at: new Date().toISOString() })
          .eq('id', domainId);
        if (markErr) {
          console.error('[provision]', row.domain, 'echec ADDITIONNEL du passage a purchase_uncertain -- la ligne reste a status=\'paid\', domain-retry pourrait la reprendre dans 10 minutes:', markErr.message);
        }
        await logAnomaly({
          type: 'domain_purchase_write_failed',
          severity: 'blocked',
          siteId: row.site_id,
          details: { domainId, domain: row.domain, error: msg, statusMarked: !markErr },
        });
        return { ok: false, status: markErr ? 'paid' : 'purchase_uncertain' };
      }
    } catch (e: any) {
      return fail('Porkbun : ' + (e?.message || 'echec achat'));
    }
  }

  // 2. Rattachement Vercel avant le DNS : sans cela le domaine resoudrait
  //    vers un projet qui ne le reconnait pas.
  // Garde-fou messagerie. Prendre la main sur la zone DNS d'un domaine qui
  // porte deja une messagerie la coupe : la nouvelle zone est vide et les
  // MX/SPF/DKIM d'origine ne sont pas reconstituables de facon fiable
  // (selecteur DKIM arbitraire, sous-domaines non enumerables). Nexiora
  // n'absorbe pas ce risque a la place du marchand : elle le signale.
  try {
    const mail = await checkExistingMail(row.domain);
    if (mail.hasMail && !mail.safe) {
      return fail(
        'Messagerie active detectee sur ce domaine (' +
          mail.hosts.slice(0, 3).join(', ') +
          '). Le provisioning couperait les emails. Migrer la messagerie ou ' +
          'recreer les enregistrements MX/SPF/DKIM dans la zone Nexiora avant de continuer.'
      );
    }
  } catch (e: any) {
    console.warn('[provision] verification messagerie', row.domain, e?.message || e);
  }

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
  //    Uniquement si aucun token n'existe deja : provisionDomain est rejoue a
  //    chaque renouvellement Stripe annuel (invoice.paid), et regenerer un
  //    jeton deja obtenu ajouterait un nouveau TXT sans jamais supprimer
  //    l'ancien (accumulation en zone DNS au fil des annees), pour un domaine
  //    deja verifie ou en cours de l'etre.
  if (!row.gsc_token) {
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
  }

  // 5. Le site pointe desormais sur ce domaine.
  // Audit Mode 3/POD BRAND, perfectionnement (fermeture contraintes UNIQUE) --
  // cause racine trouvee en verifiant que la contrainte site_domains_domain_unique
  // / sites_custom_domain_unique couvre bien TOUTES les voies d'ecriture : cette
  // ecriture-ci ignorait totalement son erreur. Avec l'index UNIQUE partiel sur
  // sites(lower(custom_domain)) desormais en place, une collision ici (theorique --
  // le garde-fou croise de domains/purchase et domains/route.ts, plus l'unicite
  // de site_domains.domain elle-meme, la rendent quasi impossible en usage normal,
  // mais pas prouvee impossible pour un futur chemin de code ou une correction
  // manuelle en base) levait un 23505 silencieusement avale -- la fonction
  // retournait quand meme {ok:true, status:'dns_configured'} alors que le site
  // n'etait PAS reellement rattache a son domaine (le storefront public resout
  // par sites.custom_domain, jamais site_domains). Domaine entierement
  // provisionne cote Porkbun/Vercel/DNS mais invisible cote application, sans
  // aucune trace. Desormais detecte et signale.
  const { error: linkErr } = await supabaseAdmin
    .from('sites')
    .update({ custom_domain: row.domain })
    .eq('id', row.site_id);

  if (linkErr) {
    const msg = 'DNS/Vercel/Porkbun termines mais rattachement sites.custom_domain en echec : ' + linkErr.message;
    console.error('[provision]', row.domain, msg);
    await logAnomaly({
      type: 'domain_link_failed',
      severity: 'blocked',
      siteId: row.site_id,
      details: { domainId, domain: row.domain, error: linkErr.message, code: (linkErr as any).code },
    });
    return { ok: false, status: 'link_failed' };
  }

  return { ok: true, status: 'dns_configured' };
}
