import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAnomaly } from '@/lib/anomaly';

/**
 * POST /api/shop/promo/validate
 * Body: { slug, code, subtotal }
 * Retourne le rabais applicable.
 */
export async function POST(req: NextRequest) {
  try {
    const { slug, code, subtotal } = await req.json();
    if (!slug || !code) return NextResponse.json({ error: 'slug et code requis' }, { status: 400 });

    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('slug', slug)
      .single();
    if (!site) return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });

    // Passe de cloture (P-2) -- `ilike` a ete retire : il interpretait '%' et
    // '_' comme des JOKERS. Un acheteur saisissant '%' matchait n'importe quel
    // code de la boutique ; si celle-ci n'avait qu'un seul code actif, il
    // obtenait la remise sans jamais le connaitre. Egalite stricte desormais,
    // sur un code normalise en majuscules (les codes sont ecrits en majuscules
    // a la creation, cf. agent/[slug]/apply/route.ts).
    //
    // Isolation tenant conservee : le filtre .eq('site_id', site.id) porte sur
    // le site resolu depuis le slug, jamais sur un identifiant fourni par
    // l'appelant -- un code de la boutique A reste introuvable depuis B.
    const normalizedCode = code.trim().toUpperCase();
    const { data: promo } = await supabaseAdmin
      .from('promo_codes')
      .select('*')
      .eq('site_id', site.id)
      .eq('code', normalizedCode)
      .eq('active', true)
      .maybeSingle();

    // DEBT-028 -- limitation de debit sur le SEUL chemin qui constitue un
    // oracle d'enumeration : le code introuvable. Cette route est publique et
    // non authentifiee, et confirme en une requete si un code existe pour un
    // site donne -- or les codes marchands sont courts et devinables
    // (ETE20, NOEL10, BIENVENUE10...).
    //
    // OBJECTION QUE JE M'ETAIS FAITE, ET COMMENT ELLE EST LEVEE : limiter par
    // site ouvre un deni de service cible (saturer le compteur d'un marchand
    // pour bloquer ses acheteurs). C'est le PLACEMENT de la garde qui la
    // resout -- un code VALIDE est renvoye plus bas sans jamais passer par
    // ce compteur. Saturer la limite n'empeche donc que d'autres tentatives
    // INVALIDES, dont la reponse aurait de toute facon ete « invalide ».
    // Aucun acheteur legitime ne peut etre bloque.
    //
    // Les cas `expired` / `depleted` / `min_order` ne sont PAS comptes : ils
    // signifient que le code EXISTE, ils ne sont donc pas un signal
    // d'enumeration, et les limiter penaliserait de vrais acheteurs.
    //
    // Mecanisme DB-native identique au precedent du depot
    // (catalog/image-search) : compte les echecs deja journalises, aucune
    // infrastructure ajoutee. Effet secondaire voulu : borne aussi la
    // croissance de checkout_anomalies sous enumeration.
    if (!promo) {
      const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
      const { count: recentFailures } = await supabaseAdmin
        .from('checkout_anomalies')
        .select('id', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .eq('type', 'promo_validate_not_found')
        .gte('created_at', oneMinuteAgo);
      if ((recentFailures ?? 0) >= 10) {
        return NextResponse.json(
          { error: 'Trop de tentatives, reessayez dans une minute.' },
          { status: 429 }
        );
      }
      // severity 'info' : jamais d'email a l'admin (cf. logAnomaly) -- un
      // code mal saisi est un evenement normal, pas une alerte.
      await logAnomaly({
        type: 'promo_validate_not_found',
        severity: 'info',
        siteId: site.id,
        slug,
        details: { code: normalizedCode },
      });
      return NextResponse.json({ valid: false, reason: 'invalid' });
    }

    // Check expiry
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, reason: 'expired' });
    }

    // Check max uses
    if (promo.max_uses && promo.used_count >= promo.max_uses) {
      return NextResponse.json({ valid: false, reason: 'depleted' });
    }

    // Passe de cloture (P-3) -- `subtotal` vient du navigateur et reste donc
    // NON FIABLE. Cette route n'a qu'un role d'AFFICHAGE (retour immediat
    // dans le panier) : le montant qu'elle renvoie n'a aucune autorite sur
    // le prix facture. checkout/route.ts re-resout le code dans le tenant et
    // recalcule integralement la remise a partir des prix serveur -- un
    // subtotal falsifie ici ne peut donc pas produire une remise reelle
    // incorrecte, il ne fausserait que l'apercu affiche a l'acheteur
    // lui-meme. Borne a >= 0 pour eviter tout affichage absurde.
    const sub = Math.max(Number(subtotal) || 0, 0);
    if (promo.min_order && sub < Number(promo.min_order)) {
      return NextResponse.json({ valid: false, reason: 'min_order', min_order: Number(promo.min_order) });
    }

    // Calcul d'apercu -- meme regles que checkout/route.ts (liste
    // d'autorisation stricte sur discount_type, P-6) afin que l'apercu ne
    // puisse pas annoncer une remise que le checkout refuserait ensuite.
    const dv = Number(promo.discount_value);
    if (!Number.isFinite(dv) || dv <= 0) {
      return NextResponse.json({ valid: false, reason: 'invalid' });
    }
    let discount = 0;
    if (promo.discount_type === 'percent') {
      if (dv > 100) return NextResponse.json({ valid: false, reason: 'invalid' });
      discount = Math.round(sub * (dv / 100) * 100) / 100;
    } else if (promo.discount_type === 'fixed') {
      discount = Math.min(dv, sub);
    } else {
      return NextResponse.json({ valid: false, reason: 'invalid' });
    }

    return NextResponse.json({
      valid: true,
      promo_id: promo.id,
      code: promo.code,
      discount_type: promo.discount_type,
      discount_value: Number(promo.discount_value),
      discount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
