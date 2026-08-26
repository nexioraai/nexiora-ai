import { NextRequest, NextResponse } from 'next/server'
import { requireSiteOwner } from '@/lib/auth/require-site-owner'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { addDomainToVercel } from '@/lib/domains/vercel'
import { logAnomaly } from '@/lib/anomaly'
import { estDomaineReserve } from '@/lib/domains/reserved'
import { detacherDomaine } from '@/lib/domains/detach'

function isValidDomain(d: string) {
  return /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(d)
}

export async function POST(req: NextRequest) {
  try {
    const { slug, domain } = await req.json()
    const clean = String(domain || '').trim().toLowerCase()

    if (!slug || !isValidDomain(clean)) {
      return NextResponse.json({ error: 'Domaine ou site invalide.' }, { status: 400 })
    }

    // D-07 -- AVANT TOUT APPEL EXTERNE. Refuser ici, c'est refuser sans rien
    // depenser et avec un message comprehensible ; refuser plus loin aurait
    // laisse l'hebergeur trancher, tardivement et en langage technique.
    if (estDomaineReserve(clean)) {
      return NextResponse.json({ error: 'Ce domaine est reserve.' }, { status: 403 })
    }

    // ============================================================
    // DETTE 6a, EXTENSION -- `owner_email` N'EST PLUS L'IDENTITE.
    //
    // La garde s'ecrivait `site.owner_email !== user.email` : une comparaison
    // en JavaScript plutot qu'un `.eq()`, mais exactement la meme cle, et donc
    // exactement le meme defaut. `sites.owner_email` est ecrite UNE SEULE
    // FOIS, a la creation du site, et aucun update ne la touche jamais -- un
    // proprietaire qui change d'adresse laisse la colonne figee sur
    // l'ancienne, et quiconque obtient ensuite cette adresse devenait
    // proprietaire aux yeux de cette route.
    //
    // AUCUN MECANISME NOUVEAU : `requireSiteOwner`, primitive canonique --
    // `owner_id` prioritaire, repli sur `owner_email` UNIQUEMENT quand
    // `owner_id` est encore null cote base. Les codes deviennent ceux de la
    // primitive : 401 non authentifie, 404 site inexistant, 403 non
    // proprietaire (la route confondait les deux derniers dans un seul 403).
    // ============================================================
    const auth = await requireSiteOwner(req, slug, 'id, custom_domain')
    if (!auth.ok) return auth.response
    const site = auth.site as { id: string; custom_domain: string | null }

    // Un domaine ne peut pas etre rattache a deux sites.
    const { data: alreadyUsed, error: erreurUsage } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('custom_domain', clean)
      .neq('slug', slug)
      .maybeSingle()
    // AUDIT AGRESSIF / TOUR 1 -- `error` n'etait pas lu. En panne, `data` vaut
    // null : aucun conflit detecte. Celui-ci est rattrape par la contrainte
    // UNIQUE, mais s'arreter la ferait dependre la securite d'un effet de
    // bord. Ne pas savoir, c'est refuser.
    if (erreurUsage) {
      return NextResponse.json({ error: 'Service momentanement indisponible.' }, { status: 503 })
    }
    if (alreadyUsed) {
      return NextResponse.json({ error: 'Ce domaine est deja utilise.' }, { status: 409 })
    }

    // Audit Mode 3/POD BRAND, perfectionnement -- ce garde-fou verifiait
    // uniquement sites.custom_domain, jamais site_domains (domaines achetes
    // via Porkbun, deja payes ou en cours de provisioning). Sans ceci, un
    // domaine reserve/achete par un marchand pouvait etre revendique en BYOD
    // par un autre pendant la fenetre pending/paid/purchased -- les deux
    // mecanismes ne se recoupaient jamais.
    const { data: reserved, error: erreurReserve } = await supabaseAdmin
      .from('site_domains')
      .select('id, status')
      .eq('domain', clean)
      .maybeSingle()
    // AUDIT AGRESSIF / TOUR 1 -- CELUI-CI N'A AUCUN FILET. Le controle est
    // INTER-TABLES : aucune contrainte ne relie `site_domains` a
    // `sites.custom_domain`. En panne de base, un domaine ACHETE et paye par
    // un marchand pouvait donc etre revendique en BYOD par un autre. C'est la
    // seule des quatre verifications d'unicite dont l'ouverture n'etait
    // rattrapee par rien.
    if (erreurReserve) {
      return NextResponse.json({ error: 'Service momentanement indisponible.' }, { status: 503 })
    }
    if (reserved && reserved.status !== 'failed') {
      return NextResponse.json({ error: 'Ce domaine est deja reserve.' }, { status: 409 })
    }

    // ============================================================
    // D-05 -- L'ORDRE ETAIT INVERSE, ET IL PRODUISAIT DES DOMAINES FANTOMES.
    //
    // L'ancien enchainement rattachait D'ABORD chez l'hebergeur, puis ecrivait
    // en base. Si l'ecriture echouait, le domaine restait rattache cote
    // hebergeur SANS AUCUNE TRACE applicative : invisible au produit,
    // irrevendicable par quiconque, impossible a nettoyer sans intervention.
    //
    // UN APPEL EXTERNE N'EST PAS TRANSACTIONNEL, et pretendre le contraire
    // serait le vrai defaut. On n'enveloppe donc rien dans une fausse
    // transaction : on RESERVE d'abord la ressource dont on est maitre (la
    // base, ou la contrainte UNIQUE tranche les courses), on tente ensuite
    // l'action externe, et on COMPENSE explicitement si elle echoue.
    //
    // LA COMPENSATION RESTAURE L'ETAT ANTERIEUR, pas `null` : un site qui
    // avait deja un domaine doit le retrouver, sans quoi une tentative ratee
    // ferait tomber un domaine encore fonctionnel.
    // ============================================================
    const domainePrecedent = site.custom_domain

    const isDomainChange = !!domainePrecedent && domainePrecedent !== clean
    const updatePayload = isDomainChange
      ? {
          custom_domain: clean,
          custom_domain_google_status: null,
          custom_domain_google_token: null,
          custom_domain_google_attempts: null,
          custom_domain_google_last_attempt_at: null,
          custom_domain_google_last_error: null,
        }
      : { custom_domain: clean }

    // 1. RESERVATION.
    const { error: dbError } = await supabaseAdmin
      .from('sites')
      .update(updatePayload)
      .eq('slug', slug)

    if (dbError) {
      if ((dbError as any).code === '23505') {
        return NextResponse.json({ error: 'Ce domaine est deja utilise.' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Erreur base de données.' }, { status: 500 })
    }

    // 2. ACTION EXTERNE, apres la reservation.
    //
    // D-01 -- LA VERIFICATION SUPPLEMENTAIRE ETAIT JETEE. `addDomainToVercel`
    // RETOURNE les TXT que l'hebergeur exige pour prouver la propriete du
    // domaine ; le code les ignorait et repondait deux enregistrements EN DUR.
    // Un client dans ce cas posait un A et un CNAME, son domaine ne servait
    // jamais, et RIEN ne le lui disait.
    let rattachement: Awaited<ReturnType<typeof addDomainToVercel>>
    try {
      rattachement = await addDomainToVercel(clean)
    } catch (e: any) {
      // 3. COMPENSATION. Son propre echec est signale, jamais avale.
      const { error: erreurCompensation } = await supabaseAdmin
        .from('sites')
        .update({ custom_domain: domainePrecedent })
        .eq('slug', slug)

      if (erreurCompensation) {
        await logAnomaly({
          type: 'domain_attach_compensation_failed',
          severity: 'blocked',
          siteId: site.id,
          slug,
          details: {
            domain: clean,
            domainePrecedent,
            erreurExterne: e?.message || String(e),
            erreurCompensation: erreurCompensation.message,
          },
        })
      }

      return NextResponse.json({ error: e?.message || 'Erreur Vercel.' }, { status: 400 })
    }

    // D-01 -- LES ENREGISTREMENTS VIENNENT DE L'HEBERGEUR, JAMAIS D'UNE
    // CONSTANTE. `verification` est vide quand aucun TXT n'est exige : aucune
    // instruction inutile n'est alors affichee. AUCUNE VALEUR N'EST INVENTEE.
    return NextResponse.json({
      ok: true,
      domain: clean,
      dns: rattachement.dns,
      verification: rattachement.verification.map((v) => ({
        type: v.type,
        name: v.domain,
        value: v.value,
      })),
    })
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
}

// ============================================================
// D-03 -- LE DETACHEMENT N'EXISTAIT PAS.
//
// Aucune route, aucun `custom_domain: null` dans tout le depot. Un domaine mal
// saisi restait attache DEFINITIVEMENT -- et, parce que les deux controles
// d'unicite le voyaient, il devenait irrevendicable par quiconque, y compris
// par son proprietaire legitime.
//
// DEUX CAS, DEUX AUTORITES DIFFERENTES, ET C'EST LE POINT DELICAT :
//
//   * DOMAINE APPORTE (BYOD). Deribfy n'en est que l'hebergeur. Le detacher
//     est entierement dans nos moyens : on retire le rattachement chez
//     l'hebergeur, on efface le pointeur et l'etat de verification. Le client
//     recupere son domaine, intact, chez son registraire.
//
//   * DOMAINE ACHETE VIA DERIBFY. Nous n'avons AUCUNE autorite pour annuler
//     un enregistrement chez le registraire ni pour transferer une propriete.
//     Pretendre le contraire serait inventer un pouvoir que le code n'a pas.
//     On detache donc le POINTEUR et on laisse la ligne d'achat intacte :
//     elle porte la facturation et l'historique. Le rattachement chez
//     l'hebergeur est CONSERVE, sinon un domaine encore paye cesserait de
//     servir.
//
// IDEMPOTENT : rien a detacher rend 200 avec `detache: false`. Une double
// soumission ne produit donc ni erreur ni faux succes.
// ============================================================
export async function DELETE(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'Slug manquant' }, { status: 400 })

  const auth = await requireSiteOwner(req, slug, 'id, custom_domain')
  if (!auth.ok) return auth.response
  const site = auth.site as { id: string; custom_domain: string | null }

  if (!site.custom_domain) {
    return NextResponse.json({ ok: true, detache: false, raison: 'aucun_domaine' })
  }

  const r = await detacherDomaine(site.id, slug, site.custom_domain)
  if (!r.ok) {
    return r.statut === 503
      ? NextResponse.json({ error: 'Service momentanement indisponible.' }, { status: 503 })
      : NextResponse.json({ error: 'Erreur base de données.' }, { status: 500 })
  }
  return NextResponse.json(r)
}

