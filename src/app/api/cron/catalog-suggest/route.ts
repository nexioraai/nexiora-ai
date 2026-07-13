import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Cron hebdomadaire : détecte les nouveaux produits trending pour chaque site reseller.
 * Ajoute des suggestions non-approuvées dans site_catalog_selections.
 * Fréquence recommandée : 1x/semaine.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Tous les sites reseller actifs
  const { data: sites } = await supabaseAdmin
    .from('sites')
    .select('id, slug, type, lang')
    .eq('mode', 3)
    .eq('dropship_type', 'reseller')
    .eq('published', true);

  if (!sites || sites.length === 0) {
    return NextResponse.json({ message: 'Aucun site reseller actif', processed: 0 });
  }

  // 2. Produits récents (syncés dans les 7 derniers jours)
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: newProducts } = await supabaseAdmin
    .from('catalog_products')
    .select('id, supplier_id, supplier_product_id, name, category, price, currency, images, shipping_days_min')
    .eq('in_stock', true)
    .in('supplier_id', ['cj', 'zendrop'])
    .gte('last_synced_at', oneWeekAgo)
    .order('last_synced_at', { ascending: false })
    .limit(200);

  if (!newProducts || newProducts.length === 0) {
    return NextResponse.json({ message: 'Aucun nouveau produit cette semaine', processed: 0 });
  }

  const results: { slug: string; suggested: number }[] = [];

  for (const site of sites) {
    try {
      // 3. Exclure les produits déjà sélectionnés
      const { data: existing } = await supabaseAdmin
        .from('site_catalog_selections')
        .select('catalog_product_id')
        .eq('site_id', site.id);

      const existingIds = new Set((existing || []).map((e: any) => e.catalog_product_id));
      const candidates = newProducts.filter((p: any) => !existingIds.has(p.id));

      if (candidates.length === 0) continue;

      // 4. Claude évalue la pertinence
      const productList = candidates.slice(0, 100).map((p: any, i: number) => (
        `${i}|${p.supplier_product_id}|${p.supplier_id}|${p.name}|${p.category}|${p.price}${p.currency}`
      )).join('\n');

      const lang = site.lang || 'fr';

      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Tu es un expert e-commerce. Le marchand a une boutique : "${site.type}".

Voici ${candidates.slice(0, 100).length} NOUVEAUX produits cette semaine (index|id|supplier|nom|catégorie|prix) :
${productList}

Sélectionne UNIQUEMENT les produits pertinents pour cette niche (max 10).
Pour chaque produit, donne : index, sell_price (marge 40-60%, arrondi au .99), reason (en ${lang === 'fr' ? 'français' : 'anglais'}).

Si aucun produit n'est pertinent, retourne [].

Réponds UNIQUEMENT en JSON : [{"index":0,"sell_price":19.99,"reason":"..."},...]`
        }],
      });

      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
      let selections: { index: number; sell_price: number; reason: string }[];
      try {
        const cleaned = raw.replace(/```json\s?/g, '').replace(/```/g, '').trim();
        selections = JSON.parse(cleaned);
      } catch { continue; }

      if (!selections || selections.length === 0) continue;

      // 5. Insert comme suggestions non-approuvées
      const limitedCandidates = candidates.slice(0, 100);
      const rows = selections
        .filter((s) => s.index >= 0 && s.index < limitedCandidates.length)
        .map((s, i) => ({
          site_id: site.id,
          catalog_product_id: limitedCandidates[s.index].id,
          sell_price: s.sell_price,
          ai_suggested: true,
          merchant_approved: false,
          ai_reason: '🆕 ' + s.reason,
          sort_order: 900 + i,
        }));

      if (rows.length > 0) {
        await supabaseAdmin
          .from('site_catalog_selections')
          .upsert(rows, { onConflict: 'site_id,catalog_product_id' });
      }

      results.push({ slug: site.slug, suggested: rows.length });
    } catch (err: any) {
      console.error(`[catalog-suggest] ${site.slug} error:`, err.message);
    }
  }

  return NextResponse.json({ processed: sites.length, results });
}
