import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * POST /api/catalog/curate
 * Body: { slug: string }
 * Claude Haiku analyse la niche du site et sélectionne les 30 meilleurs produits.
 */
export async function POST(req: NextRequest) {
  try {
    const { slug } = await req.json();
    if (!slug) {
      return NextResponse.json({ error: 'slug requis' }, { status: 400 });
    }

    // 1. Récupère le site
    const { data: site, error: siteErr } = await supabaseAdmin
      .from('sites')
      .select('id, type, mode, dropship_type, cj_margin_percent, lang')
      .eq('slug', slug)
      .single();

    if (siteErr || !site) {
      return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });
    }

    if (site.mode !== 3) {
      return NextResponse.json({ error: 'Site non-dropshipping' }, { status: 400 });
    }

    // 2. Récupère les produits du catalogue (reseller = CJ + Zendrop)
    const nicheKeyword = extractNicheKeyword(site.type);

    let query = supabaseAdmin
      .from('catalog_products')
      .select('id, supplier_id, supplier_product_id, name, category, price, currency, images, shipping_days_min, warehouse_country')
      .eq('in_stock', true)
      .in('supplier_id', ['cj', 'zendrop']);

    if (nicheKeyword) {
      query = query.textSearch('name', nicheKeyword, { type: 'websearch', config: 'english' });
    }

    query = query.order('price', { ascending: true }).limit(200);

    let { data: products, error: prodErr } = await query;

    // Fallback: si textSearch trop restrictif, on charge sans filtre
    if ((!products || products.length < 10) && nicheKeyword) {
      const fallback = supabaseAdmin
        .from('catalog_products')
        .select('id, supplier_id, supplier_product_id, name, category, price, currency, images, shipping_days_min, warehouse_country')
        .eq('in_stock', true)
        .in('supplier_id', ['cj', 'zendrop'])
        .order('price', { ascending: true })
        .limit(200);
      const { data: fbProducts, error: fbErr } = await fallback;
      if (!fbErr && fbProducts && fbProducts.length > 0) {
        products = fbProducts;
        prodErr = null;
      }
    }

    if (prodErr || !products || products.length === 0) {
      return NextResponse.json({ error: 'Aucun produit trouvé pour cette niche', products: [] }, { status: 200 });
    }

    // 3. Prépare le résumé pour Claude (compact pour économiser tokens)
    const productList = products.map((p: any, i: number) => (
      `${i}|${p.supplier_product_id}|${p.supplier_id}|${p.name}|${p.category}|${p.price}${p.currency}|${p.shipping_days_min}j|${p.warehouse_country}`
    )).join('\n');

    const lang = site.lang || 'fr';

    // 4. Claude Haiku sélectionne les meilleurs
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Tu es un expert e-commerce dropshipping.

Le marchand a une boutique spécialisée dans : "${site.type}".

Voici ${products.length} produits disponibles (index|supplier_product_id|supplier|nom|catégorie|prix|délai|entrepôt) :
${productList}

Sélectionne les 30 meilleurs produits pour cette niche.
Pour chaque produit, donne :
- index (le numéro dans la liste)
- sell_price : prix de vente suggéré en ${lang === 'fr' ? 'CAD' : 'USD'} (marge 40-60% sur le prix fournisseur, arrondi au .99)
- reason : raison courte en ${lang === 'fr' ? 'français' : 'anglais'} (ex: "marge élevée", "trending", "bestseller")

Réponds UNIQUEMENT en JSON, format :
[{"index":0,"sell_price":29.99,"reason":"..."},...]

Pas de texte avant ou après le JSON.`
      }],
    });

    // 5. Parse la réponse
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    let selections: { index: number; sell_price: number; reason: string }[];
    try {
      const cleaned = raw.replace(/```json\s?/g, '').replace(/```/g, '').trim();
      selections = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'Erreur parsing réponse IA', raw }, { status: 500 });
    }

    // 6. Insert dans site_catalog_selections
    const rows = selections
      .filter((s) => s.index >= 0 && s.index < products.length)
      .map((s, i) => ({
        site_id: site.id,
        catalog_product_id: products[s.index].id,
        sell_price: s.sell_price,
        ai_suggested: true,
        merchant_approved: false,
        ai_reason: s.reason,
        sort_order: i,
      }));

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Aucune sélection valide', selections }, { status: 500 });
    }

    // Upsert pour éviter les doublons si on re-curate
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('site_catalog_selections')
      .upsert(rows, { onConflict: 'site_id,catalog_product_id' })
      .select();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: inserted?.length || 0,
      selections: inserted,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erreur interne' }, { status: 500 });
  }
}

function extractNicheKeyword(type: string | null): string | null {
  if (!type) return null;
  const cleaned = type
    .replace(/\b(dropshipping|retailer|store|shop|boutique|online|e-commerce|ecommerce|print-on-demand|print on demand|pod|marketplace|fashion brand)\b/gi, '')
    .replace(/[&.]/g, ' ')
    .trim();
  return cleaned || null;
}
