import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 45;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * POST /api/catalog/enhance
 * Body: { slug: string }
 * Claude réécrit les titres et descriptions des produits sélectionnés.
 */
export async function POST(req: NextRequest) {
  try {
    const { slug } = await req.json();
    if (!slug) return NextResponse.json({ error: 'slug requis' }, { status: 400 });

    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id, type, lang')
      .eq('slug', slug)
      .single();

    if (!site) return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });

    // Récupère les sélections sans custom_name (pas encore réécrites)
    const { data: selections } = await supabaseAdmin
      .from('site_catalog_selections')
      .select('id, catalog_products(name, description, category, price, currency)')
      .eq('site_id', site.id)
      // No filter — re-enhance all
      .order('sort_order', { ascending: true })
      .limit(30);

    if (!selections || selections.length === 0) {
      return NextResponse.json({ message: 'Tous les produits sont déjà optimisés', enhanced: 0 });
    }

    const lang = site.lang || 'fr';
    const langLabel = lang === 'fr' ? 'français' : lang === 'en' ? 'anglais' : lang;

    const productList = selections.map((s: any, i: number) => {
      const cp = s.catalog_products;
      return `${i}|${cp.name}|${cp.description?.substring(0, 100) || ''}|${cp.category}|${cp.price}${cp.currency}`;
    }).join('\n');

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `Tu es un expert copywriter e-commerce.

Le marchand a une boutique : "${site.type}".
Langue du site : ${langLabel}.

Réécris le titre et la description de chaque produit.

Règles :
- Titre : court (max 60 car), accrocheur, SEO-friendly, en ${langLabel}. Pas de nom d'usine, pas de code produit.
- Description : 2-3 phrases en ${langLabel}. Bénéfices client, pas de specs techniques chinoises. Ton professionnel mais accessible.
- Garde le sens du produit original, ne fabrique pas de fonctionnalités.

Produits (index|nom_original|description|catégorie|prix) :
${productList}

Réponds UNIQUEMENT en JSON :
[{"index":0,"title":"...","description":"..."},...]

Pas de texte avant ou après.`
      }],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    let enhanced: { index: number; title: string; description: string }[];
    try {
      const cleaned = raw.replace(/```json\s?/g, '').replace(/```/g, '').trim();
      enhanced = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'Erreur parsing réponse IA', raw }, { status: 500 });
    }

    let updated = 0;
    for (const e of enhanced) {
      if (e.index < 0 || e.index >= selections.length) continue;
      const sel = selections[e.index];
      const { error } = await supabaseAdmin
        .from('site_catalog_selections')
        .update({ custom_name: e.title, custom_description: e.description })
        .eq('id', sel.id);
      if (!error) updated++;
    }

    return NextResponse.json({ success: true, enhanced: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erreur interne' }, { status: 500 });
  }
}
