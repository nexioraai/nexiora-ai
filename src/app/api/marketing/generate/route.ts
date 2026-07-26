import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAiUsage } from '@/lib/ai-usage';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ============ GÉNÉRATION D'IMAGE (posts sociaux uniquement) ============
// Construit un prompt visuel à partir du brief + business, puis appelle GPT Image 1.5.
// Retourne une data URL (base64) ou null si échec — l'échec ne bloque jamais le texte.
async function generateSocialImage(site: any, brief: any): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.log('[Marketing Image] OPENAI_API_KEY absent, image ignorée');
    return null;
  }
  try {
    const color = site.primary_color || '#E07040';
    const ton = brief?.ton || 'moderne et premium';
    const positionnement = brief?.positionnement || '';

    // Direction visuelle selon le secteur (réutilise la logique de detectSector)
    const sectorScene = (() => {
      const t = `${site.type || ''} ${site.name || ''}`.toLowerCase();
      if (/restaurant|caf|coffee|bar|brasserie|bistro|pizz|food|cuisine|traiteur|boulang|p[aâ]tiss|chef|menu|plat/.test(t))
        return "Scène culinaire : un plat soigné ou une table dressée, lumière chaude et appétissante, ambiance conviviale et gourmande.";
      if (/boutique|shop|store|magasin|mode|v[eê]tement|clothing|cosm|beaut|bijou|accessoire/.test(t))
        return "Scène lifestyle élégante : produit ou personne mise en valeur dans un décor éditorial raffiné, esthétique magazine de mode.";
      if (/salon|coiffeur|barber|spa|massage|clinique|cabinet|garage|r[eé]paration|plombier|[eé]lectricien|avocat|comptable|conseil|consulting|service/.test(t))
        return "Environnement professionnel soigné : un détail du métier en action, ambiance de confiance et d'expertise, cadre épuré.";
      if (/portfolio|design|photograph|artist|musicien|cr[eé]atif|freelance/.test(t))
        return "Composition artistique : mise en valeur du travail créatif, ambiance studio soignée, esthétique contemporaine.";
      return "Scène lifestyle premium au plus près de l'activité réelle, ambiance authentique et soignée.";
    })();

    // Nuance géographique : ethnies représentées selon la zone desservie
    const geoNuance = (() => {
      const z = `${site.area_served || ''} ${JSON.stringify(site.contact || {})}`.toLowerCase();
      if (/tchad|chad|cameroun|cameroon|niger|mali|burkina|s[eé]n[eé]gal|senegal|c[oô]te d'ivoire|ivory|afrique|africa|bamako|dakar|abidjan|douala|yaound|n'djamena|niamey/.test(z))
        return "Les personnes représentées sont majoritairement africaines noires, reflétant fidèlement la population locale d'Afrique, avec une diversité naturelle (environ 5% de profils métis ou mixtes). Décor et ambiance ancrés dans le contexte africain réel.";
      if (/maroc|morocco|alg[eé]rie|tunisie|[eé]gypte|egypt|moyen.?orient|middle.?east|dubai|qatar|arabie|saudi|liban|emirat/.test(z))
        return "Les personnes représentées reflètent la population d'Afrique du Nord et du Moyen-Orient, avec une diversité naturelle. Décor et ambiance ancrés dans le contexte local réel.";
      return "Les personnes représentées reflètent fidèlement la population locale de la zone desservie, avec une diversité naturelle et réaliste.";
    })();

    const prompt = `Visuel premium pour un post de réseau social d'une marque nommée "${site.name}" (secteur : ${site.type || 'business'}), zone : ${site.area_served || 'locale'}. \
${sectorScene} \
${geoNuance} \
Style photographique professionnel, esthétique éditoriale haut de gamme, lumière soignée et naturelle. \
Ambiance cohérente avec ce positionnement : ${positionnement}. Ton visuel : ${ton}. \
Palette inspirée de la couleur de marque ${color}. \
Composition épurée et élégante, SANS aucun texte ni mot incrusté, SANS logo. Format carré, qualité studio, photoréaliste.`;

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1.5',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'medium',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[Marketing Image] OpenAI error:', res.status, errText);
      return null;
    }

    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (b64) return `data:image/png;base64,${b64}`;
    const url = data?.data?.[0]?.url;
    return url || null;
  } catch (e) {
    console.error('[Marketing Image] generation failed:', e);
    return null;
  }
}

// ============ IMAGE DE COUVERTURE PEXELS (articles uniquement) ============
// Photo de stock pro, gratuite. Pas d'IA ici : un article n'a besoin que d'une couverture illustrative.
async function fetchPexelsCover(query: string, color?: string): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    console.log('[Marketing Cover] PEXELS_API_KEY absent, couverture ignorée');
    return null;
  }
  try {
    const colorParam = color ? `&color=${color.replace('#', '')}` : '';
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape${colorParam}`;
    const res = await fetch(url, { headers: { Authorization: key } });
    if (!res.ok) return null;
    const data = await res.json();
    const photo = (data.photos || [])[0];
    return photo?.src?.large || photo?.src?.original || null;
  } catch (e) {
    console.error('[Marketing Cover] fetch failed:', e);
    return null;
  }
}
// =======================================================================

const VALID_FORMATS = ['article', 'social', 'email'] as const;
type Format = (typeof VALID_FORMATS)[number];

// ============ ÉTAPE 1 : BRIEF STRATÉGIQUE (mis en cache) ============
function buildBriefPrompt(site: any): string {
  return `Tu es un stratège marketing senior. À partir des données réelles d'un business, 
tu produis un brief stratégique précis et actionnable — le genre qu'un consultant 
facturerait cher. Tu ne décris pas le business, tu le POSITIONNES.

DONNÉES DU BUSINESS :
- Nom : ${site.name || ''}
- Slogan : ${site.slogan || ''}
- Secteur : ${site.type || ''}
- Description : ${site.about || ''}
- Services : ${JSON.stringify(site.services || [])}
- Produits : ${JSON.stringify(site.products || [])}
- Mission : ${site.mission || ''}
- Vision : ${site.vision || ''}
- Zone desservie : ${site.area_served || ''}

Réponds UNIQUEMENT en JSON (sans markdown), dans la MÊME LANGUE que les données :

{
  "persona": {
    "profil": "Qui achète : âge, situation, contexte en 1 phrase concrète",
    "douleur": "Le problème réel que ce business résout pour lui",
    "declencheur": "Ce qui le pousse à acheter MAINTENANT"
  },
  "positionnement": "L'angle unique qui différencie ce business de ses concurrents — 1 phrase tranchante",
  "ton": "Le ton de voix nommé et décrit (ex: 'Chaleureux et expert, comme un artisan qui partage son savoir')",
  "mots_cles_seo": ["6 à 8 mots-clés réels que la cible taperait sur Google"],
  "angles": ["3 angles éditoriaux porteurs, spécifiques à ce business"],
  "canaux": ["Les 2-3 canaux prioritaires pour CETTE cible, justifiés en quelques mots"]
}

EXIGENCES :
- Spécifique à CE business, jamais générique. Si tu pourrais copier-coller la réponse 
  pour un autre business, c'est raté.
- Ancré dans la zone géographique et le secteur réels.
- Pas de jargon creux. Du concret qui guide la création de contenu.`;
}

// ============ ÉTAPE 2 : CONTENU (par format) ============
function buildContentPrompt(site: any, brief: any, format: Format): string {
  const common = `Tu es un copywriter premium. Tu écris du contenu PRÊT-À-PUBLIER pour ce business,
en t'appuyant sur le brief stratégique ci-dessous. Tu respectes le ton défini,
tu parles à la persona, tu ancres dans la zone géographique réelle.

BRIEF STRATÉGIQUE :
${JSON.stringify(brief)}

BUSINESS : ${site.name || ''} — ${site.slogan || ''} | ${site.type || ''} | ${site.area_served || ''}

Écris dans la MÊME LANGUE que le brief. Réponds UNIQUEMENT en JSON, sans markdown.
Aucun placeholder type [Marque] : utilise le vrai nom. Pas de texte générique.`;

  if (format === 'article') {
    return `${common}

FORMAT : Article de blog SEO.
{
  "titre": "Accrocheur, contient le mot-clé principal, < 60 caractères",
  "meta_description": "140-155 caractères, donne envie de cliquer",
  "mots_cles": ["les mots-clés ciblés de cet article"],
  "structure": [
    {"niveau": "h1", "texte": "..."},
    {"niveau": "h2", "texte": "..."},
    {"niveau": "h3", "texte": "..."}
  ],
  "contenu": "L'article complet rédigé, 500-700 mots, paragraphes courts, ton du brief, se termine par un CTA naturel vers le business"
}`;
  }

  if (format === 'social') {
    return `${common}

FORMAT : 3 posts (Instagram, LinkedIn, Facebook), calibrés par plateforme.
{
  "instagram": {
    "texte": "Accroche forte ligne 1, court, émojis pertinents, CTA 'lien en bio'",
    "hashtags": ["8-12 hashtags ciblés, mix large et niche"]
  },
  "linkedin": {
    "texte": "Ton pro, angle expertise/valeur, 3-5 paragraphes courts, 1 question d'engagement"
  },
  "facebook": {
    "texte": "Chaleureux, communautaire, CTA clair, 1-2 émojis"
  }
}`;
  }

  // email
  return `${common}

FORMAT : Email de bienvenue (séquence automatisée).
{
  "objet": "< 50 caractères, taux d'ouverture élevé",
  "preheader": "Texte d'aperçu, complète l'objet, < 90 caractères",
  "corps": "Email complet : salutation personnalisée, accroche, valeur, offre de bienvenue si pertinent, CTA, signature au nom du business",
  "bouton_cta": "Texte du bouton, 2-4 mots"
}`;
}

function parseJson(raw: string): any {
  const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(clean);
}

export async function POST(req: Request) {
  try {
    // ============ SÉCURITÉ : validation du Bearer token ============
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized: missing Bearer token' }, { status: 401 });
    }

    const { data: authData, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !authData.user || !authData.user.email) {
      return NextResponse.json({ error: 'Unauthorized: invalid token' }, { status: 401 });
    }
    const owner_email = authData.user.email;
    // ===============================================================

    const body = await req.json();
    const slug: string | undefined = body.slug;
    const format: string | undefined = body.format;

    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 });
    }
    if (!format || !VALID_FORMATS.includes(format as Format)) {
      return NextResponse.json(
        { error: "Format invalide. Attendu : 'article', 'social' ou 'email'." },
        { status: 400 }
      );
    }

    // ============ GATING : le site doit appartenir à l'utilisateur ET être publié ============
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('slug', slug)
      .eq('owner_email', owner_email)
      .eq('published', true)
      .maybeSingle();

    if (siteError) {
      console.error('SITE FETCH ERROR:', siteError);
      return NextResponse.json({ error: siteError.message }, { status: 500 });
    }
    if (!site) {
      return NextResponse.json(
        { error: 'Publiez un site pour débloquer le marketing.' },
        { status: 403 }
      );
    }
    // =========================================================================================

    // ============ ÉTAPE 1 : BRIEF (lecture du cache, sinon génération) ============
    let brief: any = null;
    const { data: cached } = await supabaseAdmin
      .from('marketing_briefs')
      .select('brief')
      .eq('slug', slug)
      .maybeSingle();

    if (cached?.brief) {
      brief = cached.brief;
    } else {
      const briefRes = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: buildBriefPrompt(site) }],
      });
      await logAiUsage({ siteId: site.id, usageType: 'marketing', model: 'claude-haiku-4-5-20251001', usage: briefRes.usage });
      const briefText = briefRes.content.map((c: any) => (c.type === 'text' ? c.text : '')).join('');
      brief = parseJson(briefText);

      // Mise en cache (1 brief par site, contrainte unique sur slug)
      try {
        await supabaseAdmin
          .from('marketing_briefs')
          .upsert({ slug, owner_email, brief }, { onConflict: 'slug' });
      } catch (e) {
        console.error('brief cache insert failed:', e);
      }
    }
    // ==============================================================================

    // ============ ÉTAPE 2 : CONTENU (Sonnet) ============
    const contentRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [{ role: 'user', content: buildContentPrompt(site, brief, format as Format) }],
    });
    await logAiUsage({ siteId: site.id, usageType: 'marketing', model: 'claude-sonnet-4-6', usage: contentRes.usage });
    const contentText = contentRes.content.map((c: any) => (c.type === 'text' ? c.text : '')).join('');
    const content = parseJson(contentText);
    // ====================================================

    // ============ IMAGE IA (posts sociaux uniquement) ============
    // Visuel unique généré pour les posts. Échec non bloquant : le texte part quand même.
    if (format === 'social') {
      const imageUrl = await generateSocialImage(site, brief);
      if (imageUrl) content.image = imageUrl;
    }
    // Couverture Pexels pour l'article (photo de stock, gratuite)
    if (format === 'article') {
      const coverQuery = `${site.type || 'business'} ${site.area_served || ''}`.trim();
      const cover = await fetchPexelsCover(coverQuery, site.primary_color);
      if (cover) content.cover = cover;
    }
    // =============================================================

    // ============ SAUVEGARDE DE L'ASSET ============
    const platform = format === 'social' ? 'multi' : format === 'email' ? 'email' : 'blog';
    try {
      await supabaseAdmin.from('marketing_assets').insert({
        slug,
        owner_email,
        type: format,
        platform,
        status: 'draft',
        content,
      });
    } catch (e) {
      console.error('asset insert failed:', e);
    }
    // ===============================================

    return NextResponse.json({ format, content, brief });
  } catch (error) {
    console.error('MARKETING API ERROR:', error);
    return NextResponse.json({ error: 'Échec de la génération du contenu marketing.' }, { status: 500 });
  }
}
