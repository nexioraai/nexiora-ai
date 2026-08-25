import { NextResponse } from 'next/server';
import { hasSupplierCatalog } from '@/lib/dropship/catalogAdmission';
import { supabaseAdmin } from '@/lib/supabase-admin';
import Anthropic from '@anthropic-ai/sdk';
import { sitePricing } from '@/lib/pricing';
import { logAiUsage } from '@/lib/ai-usage';

const anthropic = new Anthropic();

export async function POST(req: Request) {
  try {
    const { slug, image } = await req.json();
    if (!slug || !image) {
      return NextResponse.json({ error: 'Missing slug or image' }, { status: 400 });
    }

    const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: 'Invalid image format' }, { status: 400 });
    }
    const mediaType = match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    const base64Data = match[2];

    // Lecture du site AVANT l'appel Claude : ne jamais payer une analyse
    // d'image pour un site inexistant ou qui n'a pas de catalogue fournisseur.
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id, mode, dropship_type, cj_margin_percent, cj_round_mode')
      .eq('slug', slug)
      .maybeSingle();

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Seul un site a catalogue fournisseur a quelque chose a y fouiller.
    // ETAPE 2 -- l'admission au catalogue fournisseur passe par la primitive
    // unique `hasSupplierCatalog`. La comparaison brute `site.mode !== 3`
    // qui vivait ici etait la meme question, ecrite une troisieme fois dans
    // le depot avec une reponse differente a chaque endroit. La garde reste
    // AVANT tout appel externe facture, et le contrat de reponse est
    // rigoureusement inchange.
    if (!hasSupplierCatalog(site.mode)) {
      return NextResponse.json({ products: [], keywords: '', total: 0 });
    }

    // Audit Mode 3/POD BRAND, perfectionnement -- cause racine : route
    // publique (visiteur storefront, pas de compte) declenchant un appel
    // Claude Vision reellement facture, sans authentification NI limite de
    // debit -- contrairement a generate-mockups (facture Printful), deja
    // durci pour ce meme risque. Un tiers pouvait boucler des requetes avec
    // un `slug` public (trivialement enumerable) pour faire monter la
    // facture IA d'un marchand tiers sans aucune limite. Limite simple,
    // DB-native (ai_usage_log deja alimentee par logAiUsage ci-dessous) :
    // rejette si ce site a deja declenche 10+ analyses d'image dans la
    // derniere minute -- un visiteur legitime n'en fait jamais autant
    // (une recherche = une photo), un usage automatise en boucle si.
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount } = await supabaseAdmin
      .from('ai_usage_log')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', site.id)
      .eq('usage_type', 'image')
      .gte('created_at', oneMinuteAgo);
    if ((recentCount ?? 0) >= 10) {
      return NextResponse.json({ error: 'Trop de requetes, reessayez dans une minute.' }, { status: 429 });
    }

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: 'You are a product search assistant. Look at this image and return ONLY 2-4 short English search keywords that describe the product shown (e.g. "wireless headphones black" or "phone case clear"). No explanation, no punctuation, just the keywords separated by spaces.' },
        ],
      }],
    });
    await logAiUsage({ siteId: site.id, usageType: 'image', model: 'claude-sonnet-4-6', usage: msg.usage });

    const keywords = ((msg.content[0] as any)?.text || '').trim();
    if (!keywords) {
      return NextResponse.json({ products: [], keywords: '', total: 0 });
    }

    const { margin: markup } = sitePricing(site);

    const words = keywords
      .split(/\s+/)
      .map((w: string) => w.replace(/[^a-zA-Z0-9]/g, ''))
      .filter((w: string) => w.length >= 2);

    if (words.length === 0) {
      return NextResponse.json({ products: [], keywords, total: 0 });
    }

    const orFilter = words.map((w: string) => 'name.ilike.%' + w + '%,description.ilike.%' + w + '%').join(',');

    const { data: products } = await supabaseAdmin
      .from('catalog_products')
      .select('id, supplier_id, supplier_product_id, name, description, category, images, price, currency, variants, shipping_days_min, shipping_days_max, warehouse_country, in_stock')
      .eq('in_stock', true)
      .or(orFilter)
      .limit(24);

    const safe = (products || []).map((p: any) => ({
      ...p,
      price: Math.round(p.price * (1 + markup / 100) * 100) / 100,
    }));

    return NextResponse.json({ products: safe, keywords, total: safe.length });
  } catch (e: any) {
    console.error('[image-search]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
