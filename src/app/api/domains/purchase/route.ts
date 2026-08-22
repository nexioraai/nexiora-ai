import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';
import { checkDomain, getRegistrationRequirements, NEXIORA_DOMAIN_MARGIN_USD } from '@/lib/domains/porkbun';

/**
 * Prepare l'achat d'un domaine : controles, prix, abonnement Stripe annuel.
 * Ne declenche AUCUN achat Porkbun. L'achat reel a lieu apres confirmation
 * du paiement, dans le webhook Stripe : tant que l'argent n'est pas encaisse,
 * Nexiora n'engage pas de depense.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser(token);
  if (authErr || !user?.email) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { slug, domain } = await req.json().catch(() => ({}));
  const clean = String(domain || '').trim().toLowerCase();
  if (!slug || !/^[a-z0-9-]+\.[a-z]{2,}$/i.test(clean)) {
    return NextResponse.json({ error: 'Domaine invalide' }, { status: 400 });
  }

  // 1. Le site appartient bien au demandeur
  const { data: site } = await supabaseAdmin
    .from('sites')
    .select('id, owner_email, name')
    .eq('slug', slug)
    .maybeSingle();
  if (!site || site.owner_email !== user.email) {
    return NextResponse.json({ error: 'Site introuvable' }, { status: 403 });
  }

  // 2. Domaine pas deja reserve dans Nexiora
  const { data: existing } = await supabaseAdmin
    .from('site_domains')
    .select('id, status')
    .eq('domain', clean)
    .maybeSingle();
  if (existing && existing.status !== 'failed') {
    return NextResponse.json({ error: 'Ce domaine est deja reserve' }, { status: 409 });
  }

  // Audit Mode 3/POD BRAND, perfectionnement -- ce garde-fou verifiait
  // uniquement site_domains, jamais sites.custom_domain (BYOD, domaine deja
  // apporte par un marchand). Sans ceci, un domaine deja rattache en BYOD a
  // un site pouvait etre "achete" via Porkbun par un autre marchand pour le
  // meme nom -- les deux mecanismes ne se recoupaient jamais.
  const { data: byodConflict } = await supabaseAdmin
    .from('sites')
    .select('id')
    .eq('custom_domain', clean)
    .maybeSingle();
  if (byodConflict) {
    return NextResponse.json({ error: 'Ce domaine est deja utilise' }, { status: 409 });
  }

  const tld = clean.split('.').pop() || '';

  try {
    // 3. TLD automatisable ? (.ca, .us, .eu, .au ne le sont pas)
    const reqs = await getRegistrationRequirements(tld);
    if (!reqs.apiRegisterable) {
      return NextResponse.json(
        { error: 'Ce type de domaine ne peut pas etre achete automatiquement', tld },
        { status: 422 }
      );
    }

    // 4. Prix reel au moment de l'achat. Jamais de tarif en dur : le prix
    //    change cote registre et la marge Nexiora doit rester intacte.
    const check = await checkDomain(clean);
    if (!check.available) {
      return NextResponse.json({ error: 'Domaine indisponible' }, { status: 409 });
    }
    if (check.registrationCents == null || check.sellRenewalUsd == null) {
      return NextResponse.json({ error: 'Prix indisponible' }, { status: 502 });
    }

    // 5. Ligne de suivi. Creee avant le paiement pour servir de cle
    //    d'idempotence stable a l'achat Porkbun.
    const { data: row, error: insErr } = await supabaseAdmin
      .from('site_domains')
      .insert({
        site_id: site.id,
        domain: clean,
        status: 'pending',
        price_cents: check.registrationCents,
      })
      .select('id')
      .single();
    if (insErr || !row) {
      // Audit Mode 3/POD BRAND, perfectionnement -- filet de securite pour
      // la course residuelle : le SELECT-puis-INSERT ci-dessus (etape 2)
      // reste non transactionnel, et checkDomain()/getRegistrationRequirements()
      // (appels reseau) elargissent encore la fenetre entre les deux. La
      // contrainte UNIQUE reelle (voir supabase/sql/domains_unique_constraints.sql)
      // est la garantie ; ceci traduit sa violation en message clair plutot
      // qu'un 500 opaque si deux achats concurrents pour le meme domaine se
      // resolvent l'un apres l'autre.
      if ((insErr as any)?.code === '23505') {
        return NextResponse.json({ error: 'Ce domaine est deja reserve' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 500 });
    }

    // 6. Abonnement annuel. Facture sur le prix de RENOUVELLEMENT : un TLD
    //    en promo la premiere annee (.store a 2,57$ puis 43,77$) ferait
    //    perdre de l'argent des la deuxieme annee autrement.
    const stripe = getStripe();
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customer = customers.data[0] || await stripe.customers.create({
      email: user.email,
      metadata: { nexiora_site_id: site.id },
    });

    // subscriptions.create attend un product existant, pas un product_data
    // inline. Un produit par domaine garde la facture Stripe lisible pour le
    // marchand et permet de retrouver l'abonnement depuis le dashboard.
    const product = await stripe.products.create({
      name: 'Nom de domaine ' + clean,
      metadata: { nexiora_domain_id: row.id, domain: clean },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{
        price_data: {
          currency: 'usd',
          product: product.id,
          recurring: { interval: 'year' },
          unit_amount: Math.round(check.sellRenewalUsd * 100),
        },
      }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      // Depuis la version d'API 2026-05-27, le client_secret n'est plus sur
      // latest_invoice.payment_intent mais sur invoice.confirmation_secret,
      // qui doit etre expand explicitement.
      expand: ['latest_invoice.confirmation_secret'],
      metadata: {
        nexiora_domain_id: row.id,
        nexiora_site_id: site.id,
        domain: clean,
        porkbun_cost_cents: String(check.registrationCents),
      },
    });

    await supabaseAdmin
      .from('site_domains')
      .update({ stripe_subscription_id: subscription.id })
      .eq('id', row.id);

    const invoice = subscription.latest_invoice as any;
    const clientSecret =
      invoice?.confirmation_secret?.client_secret ??
      invoice?.payment_intent?.client_secret ??
      null;
    if (!clientSecret) {
      return NextResponse.json({ error: 'Paiement non initialise' }, { status: 502 });
    }

    return NextResponse.json({
      domainId: row.id,
      domain: clean,
      clientSecret,
      firstYearUsd: check.sellFirstYearUsd,
      renewalUsd: check.sellRenewalUsd,
      firstYearPromo: check.firstYearPromo,
      marginUsd: NEXIORA_DOMAIN_MARGIN_USD,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
