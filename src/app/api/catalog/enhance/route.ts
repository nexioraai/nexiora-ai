import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
import { logAiUsage } from '@/lib/ai-usage';
import { hasSupplierCatalog } from '@/lib/dropship/catalogAdmission';

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

    // Sans ce controle, n'importe qui declenche des appels Claude payants
    // sur la boutique d'un autre.
    const auth = await requireSiteOwner(req, slug, 'id, type, lang, mode');
    if (!auth.ok) return auth.response;
    const site = auth.site;

    // ============================================================
    // CHANTIER 6 (MODE 1) -- L'ADMISSION AU CATALOGUE PASSE PAR LA PRIMITIVE.
    //
    // CETTE ROUTE NE POSAIT PAS LA QUESTION. Sur les six routes catalogue,
    // `curate`, `search` et `image-search` interrogeaient deja
    // `hasSupplierCatalog` ; `enhance` et `selections` etaient les deux
    // dernieres a en etre depourvues.
    //
    // CE QUI TENAIT LIEU DE REGLE ICI : L'ABSENCE DE DONNEES. Un site sans
    // ligne dans `site_catalog_selections` sortait en « Tous les produits
    // sont deja optimises » -- un 200 rassurant qui n'a jamais ete une
    // decision d'autorisation. « Sur par absence de donnee » n'est pas une
    // propriete de securite : elle cesse le jour ou une ligne apparait, par
    // quelque chemin que ce soit.
    //
    // La garde est posee AVANT toute lecture de selection et AVANT tout appel
    // Claude facture -- meme place que dans `curate`, et meme contrat de
    // reponse (400, « Site non-dropshipping ») : ces deux routes forment une
    // paire, un marchand ne doit pas recevoir deux refus differents pour la
    // meme cause.
    // ============================================================
    if (!hasSupplierCatalog(site.mode)) {
      return NextResponse.json({ error: 'Site non-dropshipping' }, { status: 400 });
    }

    // Récupère les sélections sans custom_name (pas encore réécrites)
    const { data: selections } = await supabaseAdmin
      .from('site_catalog_selections')
      .select('id, catalog_products(name, description, category, price, currency)')
      .eq('site_id', site.id)
      .is('custom_name', null)
      .order('sort_order', { ascending: true })
      .limit(30);

    if (!selections || selections.length === 0) {
      return NextResponse.json({ message: 'Tous les produits sont déjà optimisés', enhanced: 0 });
    }

    const lang = site.lang || 'fr';
    const LANG_LABELS: Record<string, string> = {
      fr: 'français', en: 'anglais', es: 'espagnol', ar: 'arabe',
      de: 'allemand', pt: 'portugais', it: 'italien', nl: 'néerlandais',
    };
    const langLabel = LANG_LABELS[lang] || lang;

    const productList = selections.map((s: any, i: number) => {
      const cp = s.catalog_products;
      return `${i}|${cp.name}|${cp.description?.substring(0, 100) || ''}|${cp.category}|${cp.price}${cp.currency}`;
    }).join('\n');

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
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
- IMPORTANT : les noms d'origine viennent d'un catalogue fournisseur en anglais. Tu dois TRADUIRE en ${langLabel}, jamais recopier l'anglais. Un client qui lit en ${langLabel} ne doit voir aucun mot anglais.

Produits (index|nom_original|description|catégorie|prix) :
${productList}

Réponds UNIQUEMENT en JSON :
[{"index":0,"title":"...","description":"..."},...]

Pas de texte avant ou après.`
      }],
    });
    await logAiUsage({ siteId: site.id, usageType: 'enhance', model: 'claude-haiku-4-5-20251001', usage: msg.usage });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const cleaned = raw.replace(/```json\s?/g, '').replace(/```/g, '').trim();
    let enhanced: { index: number; title: string; description: string }[] = [];
    try {
      enhanced = JSON.parse(cleaned);
    } catch {
      // Reponse tronquee (les langues non latines consomment beaucoup de tokens) :
      // on recupere chaque objet complet plutot que de tout perdre.
      const objects = cleaned.match(/\{[^{}]*"index"[^{}]*\}/g) || [];
      for (const o of objects) {
        try {
          const parsed = JSON.parse(o);
          if (typeof parsed.index === 'number' && parsed.title) enhanced.push(parsed);
        } catch { /* objet incomplet, ignore */ }
      }
      if (enhanced.length === 0) {
        return NextResponse.json({ error: 'Erreur parsing réponse IA', raw }, { status: 500 });
      }
      console.warn(`[Enhance] Reponse tronquee : ${enhanced.length} produits recuperes sur ${selections.length}`);
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
