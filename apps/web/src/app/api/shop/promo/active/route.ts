import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { canTransact } from '@/lib/commerce-admission/canTransact';

/**
 * GET /api/shop/promo/active?slug=my-shop
 * Retourne le code promo actif pour affichage bannière.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ promo: null });

  const { data: site } = await supabaseAdmin
    .from('sites')
    .select('id, mode')
    .eq('slug', slug)
    .single();
  if (!site) return NextResponse.json({ promo: null });

  // ============================================================
  // FERMETURE MODE 1, VOLET 2 -- LA ROUTE PORTE SA PROPRE FRONTIERE
  // (DEBT-031).
  //
  // POURQUOI ICI ALORS QUE `PromoBanner` GARDE DEJA L'AFFICHAGE. Une
  // protection d'interface n'est pas une frontiere : cette route est
  // PUBLIQUE et NON AUTHENTIFIEE, un appel direct ne passe par aucun
  // composant. La capacite doit etre fermee la ou elle devient reellement
  // possible -- et pour une route, c'est la route.
  //
  // CE SUR QUOI ELLE NE REPOSAIT PLUS QUE. Apres le volet 1, aucun chemin
  // applicatif ne cree plus de code promo pour une vitrine. La route etait
  // donc protegee par l'ABSENCE d'ecriture en amont -- une defense
  // accidentelle, pas une autorite : elle redeviendrait ouverte au premier
  // chemin d'ecriture ajoute, et le vecteur PostgREST direct sur
  // `promo_codes` n'est a ce jour ni prouve ni ferme.
  //
  // `canTransact` EST L'AUTORITE. Un code promo est un artefact commercial ;
  // la question posee est celle de l'ADMISSION, pas de l'affichage
  // (`hasShop`, qui depend d'un produit) ni du routage (`order-domain`).
  //
  // FORME DE REPONSE INCHANGEE, comme `catalog/search` pour un site sans
  // catalogue : la reponse vide et valide, en 200. Un 403 distinguerait
  // publiquement le mode d'un site, et changerait le contrat du client pour
  // rien. Fail-closed : `undefined`, `null`, `'2'`, `4`, `NaN` n'obtiennent
  // aucun code promo.
  // ============================================================
  if (!canTransact((site as { mode?: unknown }).mode)) {
    return NextResponse.json({ promo: null });
  }

  const { data: promo } = await supabaseAdmin
    .from('promo_codes')
    .select('code, discount_type, discount_value, min_order, expires_at')
    .eq('site_id', site.id)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!promo) return NextResponse.json({ promo: null });

  // Check expiry
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return NextResponse.json({ promo: null });
  }

  return NextResponse.json({ promo });
}
