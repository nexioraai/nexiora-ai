import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';

export const maxDuration = 45;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * POST /api/catalog/curate
 * Body: { slug: string }
 * Recherche multi-mots-cles + filtre de pertinence strict par Claude Haiku.
 */
export async function POST(req: NextRequest) {
  try {
    const { slug } = await req.json();
    if (!slug) {
      return NextResponse.json({ error: 'slug requis' }, { status: 400 });
    }

    // Sans ce controle, n'importe qui declenche des appels Claude payants
    // sur la boutique d'un autre.
    const auth = await requireSiteOwner(
      req,
      slug,
      'id, type, mode, dropship_type, cj_margin_percent, lang, niche_keywords'
    );
    if (!auth.ok) return auth.response;
    const site = auth.site;
    const siteErr = null;

    if (siteErr || !site) {
      return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });
    }

    if (site.mode !== 3) {
      return NextResponse.json({ error: 'Site non-dropshipping' }, { status: 400 });
    }

    const keywords: string[] = Array.isArray(site.niche_keywords) && site.niche_keywords.length > 0
      ? site.niche_keywords
      : extractFallbackKeywords(site.type);

    if (keywords.length === 0) {
      return NextResponse.json({ error: 'Aucun mot-cle niche disponible', products: [] }, { status: 200 });
    }

    const suppliers = site.dropship_type === 'pod_custom' || site.dropship_type === 'pod_brand'
      ? ['printful']
      : ['cj'];

    const seen = new Set<string>();
    const allProducts: any[] = [];

    for (const kw of keywords) {
      const pattern = '%' + kw.toLowerCase().replace(/\s+/g, '%') + '%';
      const { data: hits } = await supabaseAdmin
        .from('catalog_products')
        .select('id, supplier_id, supplier_product_id, name, price, currency, images, shipping_days_min, warehouse_country')
        .eq('in_stock', true)
        .in('supplier_id', suppliers)
        .ilike('name', pattern)
        .order('price', { ascending: true })
        .limit(40);

      if (hits) {
        for (const prod of hits) {
          if (!seen.has(prod.id)) {
            seen.add(prod.id);
            allProducts.push(prod);
          }
        }
      }
    }

    console.log('[Curate] ' + slug + ': ' + keywords.length + ' keywords -> ' + allProducts.length + ' candidats');

    if (allProducts.length === 0) {
      return NextResponse.json({ error: 'Aucun produit trouve pour cette niche', keywords, products: [] }, { status: 200 });
    }

    const productList = allProducts.map((prod: any, i: number) => (
      i + '|' + prod.name + '|' + prod.price + (prod.currency || '') + '|' + (prod.shipping_days_min || '?') + 'j|' + (prod.warehouse_country || '?')
    )).join('\n');

    const lang = site.lang || 'fr';
    const nicheLabel = site.type || keywords.join(', ');

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: 'You are a STRICT e-commerce product curator.\n\n' +
          'STORE NICHE: "' + nicheLabel + '"\n' +
          'NICHE KEYWORDS: ' + JSON.stringify(keywords) + '\n\n' +
          'Candidate products (index|name|price|shipping|warehouse):\n' + productList + '\n\n' +
          'CRITICAL TASK - RELEVANCE FILTERING:\n' +
          'These products came from a broad keyword search and MANY are NOT relevant to the niche.\n' +
          'Step 1: For EACH product, ask "Would a customer shopping at a ' + nicheLabel + ' store expect to find this?"\n' +
          'Step 2: REJECT anything that does not belong. Examples of what to REJECT:\n' +
          '  - A fitness store must NOT have: pet toys, kitchen knives, phone cables, jewelry, car accessories\n' +
          '  - A pet store must NOT have: makeup, phone cases, kitchen gadgets, clothing for humans\n' +
          '  - When in doubt, REJECT. Being strict is REQUIRED.\n' +
          'Step 3: From the products that PASS, select up to 30 with MANDATORY DIVERSITY.\n' +
          'DIVERSITY RULE (STRICT): the store has ' + keywords.length + ' niche keywords. Spread your selection across ALL of them.\n' +
          '  - MAXIMUM 4 products of the same product type (e.g. max 4 charging cables, max 4 leggings, max 4 pet bowls).\n' +
          '  - A visitor must see a VARIED storefront, not 20 versions of the same item.\n' +
          '  - If one product type dominates the candidate list, pick the 4 best and REJECT the rest, even if they are relevant.\n' +
          '  - Prefer covering more keywords with fewer products each, over saturating one keyword.\n' +
          'Within those constraints, prefer low supplier cost and reasonable shipping times.\n\n' +
          'For each selected product provide:\n' +
          '- index: the number in the list\n' +
          '- sell_price: suggested retail price in ' + (lang === 'fr' ? 'CAD' : 'USD') + ' (40-60% margin, rounded to .99)\n' +
          '- reason: short justification in ' + (lang === 'fr' ? 'French' : 'English') + '\n\n' +
          'RESPOND WITH ONLY a valid JSON array, no text before or after:\n' +
          '[{"index":0,"sell_price":29.99,"reason":"..."}]\n\n' +
          'If only 5 products are truly relevant, return only those 5. NEVER pad the list with irrelevant products.'
      }],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    let selections: { index: number; sell_price: number; reason: string }[];
    try {
      const cleaned = raw.replace(/```json\s?/g, '').replace(/```/g, '').trim();
      selections = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'Erreur parsing reponse IA', raw }, { status: 500 });
    }

    const rows = selections
      .filter((sel) => sel.index >= 0 && sel.index < allProducts.length)
      .map((sel, i) => ({
        site_id: site.id,
        catalog_product_id: allProducts[sel.index].id,
        sell_price: sel.sell_price,
        ai_suggested: true,
        merchant_approved: false,
        ai_reason: sel.reason,
        sort_order: i,
      }));

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Aucune selection valide apres filtrage', keywords, candidates: allProducts.length }, { status: 200 });
    }

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
      keywords,
      candidates: allProducts.length,
      selections: inserted,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erreur interne' }, { status: 500 });
  }
}

/**
 * Fallback pour les sites crees avant niche_keywords.
 */
function extractFallbackKeywords(type: string | null): string[] {
  if (!type) return [];
  const cleaned = type
    .replace(/\b(dropshipping|retailer|store|shop|boutique|online|e-commerce|ecommerce|print-on-demand|pod|marketplace|fashion|brand|pro|hub|zone|vibe|supply|global)\b/gi, '')
    .replace(/[&.,\-]/g, ' ')
    .trim();
  return cleaned.split(/\s+/).filter((w) => w.length >= 3);
}
