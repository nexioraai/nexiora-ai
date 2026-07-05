import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { computeAiScore } from '@/app/lib/aiScore';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Service role pour les inserts (bypass RLS — sécurisé car validé via Bearer token avant)

// Client anon pour valider le token utilisateur

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();
}

function getPhonePrefix(location: string): string {
  const l = location.toLowerCase();
  if (l.includes('tchad') || l.includes('chad')) return '+235';
  if (l.includes('cameroun') || l.includes('cameroon')) return '+237';
  if (l.includes('sénégal') || l.includes('senegal')) return '+221';
  if (l.includes('mali')) return '+223';
  if (l.includes('niger')) return '+227';
  if (l.includes('burkina')) return '+226';
  if (l.includes('côte d\'ivoire') || l.includes('ivory coast')) return '+225';
  if (l.includes('canada')) return '+1';
  if (l.includes('france')) return '+33';
  return '+1';
}

function getCurrency(location: string): string {
  const l = location.toLowerCase();
  if (l.includes('tchad') || l.includes('chad') || l.includes('cameroun') || l.includes('cameroon') || l.includes('niger') || l.includes('mali') || l.includes('burkina') || l.includes('côte d\'ivoire')) return 'CFA (FCFA)';
  if (l.includes('canada')) return 'CAD';
  if (l.includes('france')) return 'EUR';
  return 'USD';
}

async function fetchPexelsImages(query: string, color?: string): Promise<string[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  try {
    const colorParam = color ? `&color=${color.replace('#', '')}` : '';
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=6&orientation=landscape${colorParam}`;
    const res = await fetch(url, { headers: { Authorization: key } });
    if (!res.ok) {
      console.error('PEXELS ERROR', res.status, await res.text(), 'query:', query);
      return [];
    }
    const data = await res.json();
    return (data.photos || []).map((p: any) => p.src.large || p.src.original).filter(Boolean);
  } catch (e) {
    console.error('PEXELS EXCEPTION', e, 'query:', query);
    return [];
  }
}

// ============ VALIDATION & DETECTION INTELLIGENTE ============

const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  fr: {
    tooShort: "Je n'ai pas bien compris. Pouvez-vous décrire votre business plus en détail ? (ex: \"Restaurant marocain à Montréal avec spécialités tagine\")",
    notClear: "Désolé, je n'arrive pas à comprendre votre demande. Pourriez-vous être plus précis sur le type de business que vous souhaitez créer ?",
  },
  en: {
    tooShort: "I didn't quite understand. Could you describe your business in more detail? (e.g., \"Moroccan restaurant in Montreal with tagine specialties\")",
    notClear: "Sorry, I can't understand your request. Could you be more specific about what kind of business you want to create?",
  },
  ar: {
    tooShort: "لم أفهم تماماً. هل يمكنك وصف عملك بمزيد من التفصيل؟",
    notClear: "عذراً، لا أستطيع فهم طلبك. هل يمكنك أن تكون أكثر دقة بشأن نوع العمل الذي تريد إنشاءه؟",
  },
  es: {
    tooShort: "No entendí bien. ¿Podrías describir tu negocio con más detalle?",
    notClear: "Lo siento, no puedo entender tu solicitud. ¿Podrías ser más específico?",
  },
};

function detectLanguage(message: string): string {
  if (/[\u0600-\u06FF]/.test(message)) return 'ar';
  if (/\b(el|la|los|las|para|gracias|hola)\b/i.test(message) || /[ñ¿¡]/.test(message)) return 'es';
  if (/\b(le|la|les|une|des|pour|avec|sans|dans|notre|votre|nos|vos|crée|créer)\b/i.test(message) || /[éèàâêîôûç]/i.test(message)) return 'fr';
  if (/\b(the|and|for|with|create|build|make|website|business)\b/i.test(message)) return 'en';
  return 'fr';
}

function validatePrompt(message: string, lang: string): { valid: boolean; reason?: string } {
  const msgs = ERROR_MESSAGES[lang] || ERROR_MESSAGES.fr;
  const trimmed = message.trim();
  if (trimmed.length < 10) return { valid: false, reason: msgs.tooShort };
  const words = trimmed.split(/\s+/).filter((w: string) => w.length > 1);
  if (words.length < 3) return { valid: false, reason: msgs.tooShort };
  const hasVowelsLatin = /[aeiouéèàâêîôûáíóúäöü]/i.test(trimmed);
  const hasArabic = /[\u0600-\u06FF]/.test(trimmed);
  if (!hasVowelsLatin && !hasArabic) return { valid: false, reason: msgs.notClear };
  if (/^(.)\1{5,}$/.test(trimmed.replace(/\s/g, ''))) return { valid: false, reason: msgs.notClear };
  if (!/[a-zA-Z\u0600-\u06FF]/.test(trimmed)) return { valid: false, reason: msgs.notClear };
  return { valid: true };
}

function detectSector(message: string): string {
  const lower = message.toLowerCase();
  if (/\b(restaurant|café|cafe|coffee|bar|brasserie|bistro|pizzeria|fast.?food|food.?truck|cantine|traiteur|boulangerie|pâtisserie|patisserie|cuisine|chef|menu|plat|repas|food)\b/i.test(lower)) return 'restaurant';
  if (/\b(boutique|shop|store|magasin|épicerie|epicerie|marché|marche|e-commerce|ecommerce|vente|produit|product|vêtement|vetement|mode|clothing)\b/i.test(lower)) return 'shop';
  if (/\b(service|consulting|conseil|salon|coiffeur|barber|spa|massage|clinique|cabinet|garage|réparation|reparation|nettoyage|plombier|électricien|electricien|avocat|comptable)\b/i.test(lower)) return 'services';
  if (/\b(portfolio|designer|photograph|artist|artiste|musicien|developer|développeur|developpeur|freelance)\b/i.test(lower)) return 'portfolio';
  return 'general';
}

function getSectorPrompt(sector: string): string {
  if (sector === 'restaurant') {
    return `

CRITICAL SECTOR - RESTAURANT/CAFE/FOOD:
- MUST generate "products" array with 6-10 realistic menu items
- Each item MUST have: {"name": "dish name", "description": "1-sentence description", "price": "amount with currency", "imageQuery": "precise English photo search: concrete subject + mood/lighting, e.g. 'grilled salmon plated dark moody'. Never the business name."}
- Mix: starters, mains, desserts, drinks
- Set "type" to specific cuisine (e.g. "Restaurant marocain")
- Include "Menu" in pages array`;
  }
  if (sector === 'shop') {
    return `

CRITICAL SECTOR - SHOP/BOUTIQUE:
- MUST generate "products" array with 6-10 realistic products
- Each MUST have: {"name", "description", "price" with currency, "imageQuery": "precise English photo search: concrete product + mood/lighting, e.g. 'car brake disc dark studio'. Never the business name."}
- Set "type" to specific store category
- Include "Shop" in pages array`;
  }
  if (sector === 'services') {
    return `

CRITICAL SECTOR - SERVICES:
- Generate 5-7 detailed specific services
- Set "type" to specific service category (e.g. "Salon de coiffure")`;
  }
  if (sector === 'portfolio') {
    return `

CRITICAL SECTOR - PORTFOLIO/CREATIVE:
- Focus on showcasing work
- Set "type" to creative profession`;
  }
  return '';
}

export async function POST(req: Request) {
  try {
    // ============ SÉCURITÉ : validation du Bearer token ============
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized: missing Bearer token' },
        { status: 401 }
      );
    }

    const { data: authData, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !authData.user || !authData.user.email) {
      return NextResponse.json(
        { error: 'Unauthorized: invalid token' },
        { status: 401 }
      );
    }

    // Email validé depuis le token — pas depuis le body (sinon manipulable)
    const owner_email = authData.user.email;
    const owner_id = authData.user.id;
    const UNLIMITED_EMAILS = ['issayamiyoussouf@gmail.com'];
    const isUnlimited = UNLIMITED_EMAILS.includes(owner_email);
    // ===============================================================

    const body = await req.json();
    const message = body.message;
    // Mode explicite transmis par l'entretien onboarding ("mode: 1|2|3" en tête du message). Null si absent (wizard classique).
    const modeMatch = typeof message === 'string' ? message.match(/^\s*mode:\s*([123])/i) : null;
    const siteMode: number | null = modeMatch ? parseInt(modeMatch[1], 10) : null;
    const location = body.location || '';
    const language = body.language || 'fr';

    if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

    // ============ PLAFOND DE GENERATION ============
    const FREE_LIMIT = 3;
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('generation_count')
      .eq('id', owner_id)
      .maybeSingle();
    const usedGenerations = profile?.generation_count ?? 0;
    if (!isUnlimited && usedGenerations >= FREE_LIMIT) {
      return NextResponse.json(
        { error: "Vous avez atteint la limite de la version gratuite (3 sites). Passez à l'abonnement pour en créer davantage.", limitReached: true },
        { status: 402 }
      );
    }
    // ===============================================

    // ============ DÉTECTION LANGUE + VALIDATION ============
    const detectedLang = (language && language !== 'auto' && ['fr','en','ar','es'].includes(language))
      ? language
      : detectLanguage(message);

    // ============ PRE-CHECK AI UNIVERSEL (TOUTES LES LANGUES) ============
    // Claude détecte la langue et comprend le contexte automatiquement
    const trimmed = message.trim();
    const wordCount = trimmed.split(/\s+/).filter((w: string) => w.length > 1).length;
    
    // Pre-check AI seulement si prompt court/ambigu
    if (trimmed.length < 40 || wordCount < 5) {
      try {
        const preCheck = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 250,
          messages: [{
            role: 'user',
            content: `You are Nexiora, a friendly AI website builder. Analyze this user input: "${message}"

Respond with ONLY a JSON object (no markdown, no code fences):

1. If it's a GREETING in ANY language (hi, bonjour, hola, 你好, مرحبا, नमस्ते, こんにちは, привет, olá, ciao, hallo, etc.):
{"type": "response", "text": "<friendly greeting in the EXACT same language as the user + ask what kind of business/website they want to create, with 1-2 examples>"}

2. If it's UNCLEAR/GIBBERISH/TOO SHORT (random letters, single words that aren't business descriptions, etc.):
{"type": "response", "text": "<in the user's language: politely say you didn't understand, ask them to describe their business in more detail with an example>"}

3. If it's a VALID business description (mentions what they want to build, sector, business type, etc.):
{"type": "valid"}

CRITICAL: Always respond in the EXACT language the user wrote in. Detect language automatically. Examples:
- "hi" → English response
- "bonjour" → French response  
- "你好" → Chinese response
- "नमस्ते" → Hindi response
- "مرحبا" → Arabic response
- "こんにちは" → Japanese response
- "Hola, como estas" → Spanish response

Return ONLY the JSON.`
          }]
        });
        
        const checkText = preCheck.content.map((c: any) => c.type === 'text' ? c.text : '').join('').trim();
        const cleanCheck = checkText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
          const intent = JSON.parse(cleanCheck);
          if (intent.type === 'response' && intent.text) {
            return NextResponse.json({ error: intent.text }, { status: 400 });
          }
        } catch (e) {
          console.log('[PreCheck] Parse error, continuing with generation');
        }
      } catch (e) {
        console.log('[PreCheck] AI call failed, continuing with generation');
      }
    }

    // ============ DÉTECTION SECTEUR AUTOMATIQUE ============
    const sector = detectSector(message);
    const sectorPrompt = getSectorPrompt(sector);
    console.log('[Generation] Detected sector:', sector, '| Lang:', detectedLang);

    const phonePrefix = location ? getPhonePrefix(location) : '+1';
    const currency = location ? getCurrency(location) : 'USD';
    const langName = language === 'fr' ? 'French' : language === 'ar' ? 'Arabic' : 'English';

    const PROMPT = `You are an expert AI website builder for local businesses worldwide.

IMPORTANT CONTEXT:
- Location: ${location || 'Not specified'}
- Write ALL text content in the EXACT SAME LANGUAGE as the business description provided below. Detect the language automatically and use it consistently everywhere.
- Phone format: start with ${phonePrefix}
- Currency: use ${currency}
- Address: write a realistic address in ${location || 'the city'}
- Testimonial names: use realistic local names for ${location || 'the region'}
- sections: THIS IS CRITICAL. Analyze the business sector deeply and decide YOURSELF what offering section(s) this business truly needs — do NOT default to a generic "Services" list. A restaurant needs a "Menu" section with real dishes and prices. A lawyer needs "Domaines d'Expertise" with legal specialties. A photographer needs "Portfolio" with shoot types and packages. A plumber needs "Nos Interventions" with repair types and callout prices. You may generate 1 to 3 sections if the sector genuinely has distinct offering categories (e.g. a restaurant could have "Menu" AND "Réservation"). Each section is an object with:
  - "name": the natural local-language name for this section (e.g. "Notre Menu", "Nos Domaines d'Expertise")
  - "items": 4-6 items, each SPECIFIC to this exact business, never generic. Each item has:
    - "title": concrete and specific (e.g. "Poutine classique" not "Plat principal")
    - "description": 2 sentences, rich in sensory/concrete detail — appetizing for food, precise outcomes for services
    - "price": a realistic price string in the correct currency for this item if the sector commonly displays prices (food menus, service callouts, packages). Omit or use "" if pricing doesn't apply (e.g. legal consultation "sur devis").
    - "imageQuery": precise English stock photo query for THIS specific item (e.g. "poutine fries gravy cheese curds closeup"). Never reuse the same imageQuery twice across the whole response.
- whyus: 3 reasons to choose this business. Each = a short punchy "title" (2-4 words) + a "text" of ONE concrete sentence. Make them specific to this business, not generic.
- mission: ONE inspiring sentence stating what this business does and for whom (its purpose). Specific, not generic.
- vision: ONE forward-looking sentence describing the long-term ambition of this business.
- areaServed: the city or region this business serves (e.g. "Montréal" or "Grand Montréal"). Short.
- priceRange: estimated price level for this sector, one of "$", "$$", "$$$", or "$$$$".

DESIGN DIRECTION (CRITICAL — every site must look modern, premium and DISTINCT from others):
- primaryColor: pick a BOLD, DISTINCTIVE color that fits THIS specific business and sector. NEVER default to generic corporate blue (#1E40AF, #2563EB and similar) unless the brand truly demands it. Explore the full spectrum — deep emerald, terracotta, burgundy, warm amber, plum, teal, charcoal with a vivid accent, etc. Each business should feel visually unique.
- IF the business description explicitly mentions a preferred color, you MUST use that exact color as primaryColor. Otherwise choose the most fitting distinctive palette yourself.
- Match the color psychology to the sector and mood: luxury = deep/saturated tones, wellness = soft naturals, food = warm appetizing tones, tech = sharp modern accents, creative = unexpected vivid choices.
- heroTitle and slogan: punchy, modern, specific to this business — never generic filler.
- imageQuery: a precise English search query for stock photos of THIS business. Format: concrete subject + framing + mood/lighting. Examples: "car brake disc dark studio lighting", "moroccan tagine plated moody", "modern law office interior minimal". NEVER use the business name. Be specific to the sector, never generic like "business" or "shop".
- Overall tone: premium, contemporary, confident. Avoid bland template-like wording.

BUSINESS MODE CLASSIFICATION (CRITICAL — you MUST return the correct integer mode):
- mode = 1 (SHOWCASE / VITRINE): restaurants, cafés, bars, food trucks, bakeries, hair salons, barbers, spas, gyms, clinics, dentists, doctors, lawyers, accountants, real estate agents, plumbers, electricians, mechanics, artisans, photographers, event planners, coaches, consultants, schools, any local service, any perishable food business, any made-to-order craft. NEVER anything else.
- mode = 2 (LOCAL BOUTIQUE with own inventory): physical boutique selling THEIR OWN stock — local clothing store, bookstore, jewelry maker, florist, artisan shop, brand with warehouse. The owner physically holds inventory.
- mode = 3 (DROPSHIPPING via CJ): ONLY for reselling importable manufactured goods from Asia (gadgets, accessories, phone cases, home decor, fitness gear, beauty tools, small electronics). NEVER for perishables, food, services, made-to-order, or anything requiring local expertise.

STRICT RULES:
- Restaurant / food / café / bakery → ALWAYS mode 1. NEVER 2 or 3.
- Any service (salon, clinic, mechanic, lawyer, etc.) → ALWAYS mode 1. NEVER 2 or 3.
- If the user explicitly says "boutique" with local stock → mode 2.
- If the user explicitly says "dropshipping" or "resell imported products" → mode 3.
- When in doubt → mode 1 (safer default).

DROPSHIPPING (mode 3) SPECIFIC RULES:
- pages MUST be ["Home", "About", "FAQ", "Contact"] — NO Gallery, NO Reviews, NO Featured Products, NO Services. Shop section appears automatically when the merchant imports products.
- sections: return an EMPTY array [] — dropshipping sites do NOT need service/menu sections since products come from CJ import.
- testimonials: return an EMPTY array [] — no fake reviews.
- gallery: return an EMPTY array [] — no gallery needed.
- faq: generate 4 relevant e-commerce FAQ (shipping, returns, payment, product quality).
- whyus: generate 3 relevant trust signals (fast shipping, secure payment, quality guarantee).

Return ONLY valid JSON, no markdown:

{
  "name": "",
  "slogan": "",
  "type": "",
  "lang": "ISO 639-1 code of the language you are writing in, e.g. fr, en, ar, es, de, pt, sw",
  "primaryColor": "#hexcolor",
  "heroTitle": "",
  "heroSubtitle": "",
  "imageQuery": "",
  "about": "",
  "sections": [
    {
      "name": "",
      "items": [
        {"title": "", "description": "", "price": "", "imageQuery": ""},
        {"title": "", "description": "", "price": "", "imageQuery": ""},
        {"title": "", "description": "", "price": "", "imageQuery": ""},
        {"title": "", "description": "", "price": "", "imageQuery": ""}
      ]
    }
  ],
  "faq": [
    {"question": "", "answer": ""},
    {"question": "", "answer": ""},
    {"question": "", "answer": ""},
    {"question": "", "answer": ""}
  ],
  "whyus": [
    {"title": "", "text": ""},
    {"title": "", "text": ""},
    {"title": "", "text": ""}
  ],
  "mission": "",
  "vision": "",
  "areaServed": "",
  "priceRange": "",
  "mode": 1,
  "testimonials": [
    {"name": "", "role": "", "content": "", "rating": 5},
    {"name": "", "role": "", "content": "", "rating": 5},
    {"name": "", "role": "", "content": "", "rating": 5}
  ],
  "gallery": [],
  "contact": {"phone": "", "email": "", "address": ""},
  "pages": ["Home", "About", "Services", "Contact"],
  "cta": "",
  "products": [],
  "socialLinks": {
    "instagram": "",
    "whatsapp": "",
    "facebook": "",
    "tiktok": ""
  }
}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4500,
      messages: [{ role: 'user', content: PROMPT + sectorPrompt + '\n\nBusiness request: ' + message }],
    });

    const text = response.content.map((item: any) => item.type === 'text' ? item.text : '').join('');
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);

    const slug = generateSlug(parsed.name);

    // Geocodage reel via Nominatim (OpenStreetMap) depuis l'adresse
    let geo_lat: number | null = null;
    let geo_lng: number | null = null;
    const addr = parsed.contact?.address || '';
    if (addr) {
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`,
          { headers: { 'User-Agent': 'Nexiora/1.0 (contact@nexiora.ca)' } }
        );
        const geoJson = await geoRes.json();
        if (Array.isArray(geoJson) && geoJson[0]) {
          geo_lat = parseFloat(geoJson[0].lat);
          geo_lng = parseFloat(geoJson[0].lon);
        }
      } catch (e) {
        console.error('Nominatim geocode failed:', e);
      }
    }

    // Vraies images Pexels colorées selon la marque
    const pexelsQuery = (parsed.imageQuery || `${parsed.type || 'business'} ${parsed.name || ''}`).trim();
    const gallery = await fetchPexelsImages(pexelsQuery, parsed.primaryColor);
    // Image Pexels par produit (recherche par nom + type), en parallèle
    const rawProducts = Array.isArray(parsed.products) ? parsed.products : [];
    const productsWithImages = await Promise.all(
      rawProducts.map(async (p: any) => {
        if (p.image) return p;
        const q = (p.imageQuery || `${p.name || ''} ${parsed.type || ''}`).trim();
        const imgs = await fetchPexelsImages(q, parsed.primaryColor);
        return { ...p, image: imgs[0] || '' };
      })
    );

    // Image Pexels par service, en parallèle
    const rawSections = Array.isArray(parsed.sections) ? parsed.sections : [];
    const sectionsWithImages = await Promise.all(
      rawSections.map(async (sec: any) => {
        const rawItems = Array.isArray(sec.items) ? sec.items : [];
        const itemsWithImages = await Promise.all(
          rawItems.map(async (it: any) => {
            const q = (it.imageQuery || `${it.title || ''} ${parsed.type || ''}`).trim();
            const imgs = await fetchPexelsImages(q, parsed.primaryColor);
            return { ...it, image: imgs[0] || '' };
          })
        );
        return { name: sec.name || '', items: itemsWithImages };
      })
    );
    // Insert via service_role (bypass RLS, sécurisé car owner_email vient du token validé)
    const { error } = await supabaseAdmin.from('sites').insert({
      slug,
      name: parsed.name,
      slogan: parsed.slogan,
      type: parsed.type,
      primary_color: parsed.primaryColor,
      hero_title: parsed.heroTitle,
      hero_subtitle: parsed.heroSubtitle,
      about: parsed.about,
      sections: sectionsWithImages,
      testimonials: parsed.testimonials,
      faq: parsed.faq || [],
      whyus: parsed.whyus || [],
      mission: parsed.mission || null,
      vision: parsed.vision || null,
      gallery,
      contact: parsed.contact,
      menu: [],
      team: [],
      hours: {},
      address: parsed.contact?.address || '',
      pages: (() => {
        const m = siteMode ?? (parsed.mode === 2 || parsed.mode === 3 ? parsed.mode : 1);
        if (m === 3) {
          const l = (parsed.lang || detectedLang || 'fr').toLowerCase();
          if (l === 'fr') return ['Accueil', 'À propos', 'Contact'];
          if (l === 'es') return ['Inicio', 'Acerca de', 'Contacto'];
          if (l === 'ar') return ['الرئيسية', 'من نحن', 'اتصل بنا'];
          return ['Home', 'About', 'Contact'];
        }
        return parsed.pages;
      })(),
      hidden_sections: (() => {
        const m = siteMode ?? (parsed.mode === 2 || parsed.mode === 3 ? parsed.mode : 1);
        if (m === 3) return ['Services', 'Gallery', 'Reviews'];
        return [];
      })(),
      cta: parsed.cta,
      products: productsWithImages,
      social_links: parsed.socialLinks,
      owner_email,
      mode: siteMode ?? (parsed.mode === 2 || parsed.mode === 3 ? parsed.mode : 1),
      lang: parsed.lang || detectedLang || "fr",
      geo_lat,
      geo_lng,
      area_served: parsed.areaServed || null,
      price_range: parsed.priceRange || null,
    });

    if (error) {
      console.error('SUPABASE ERROR:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Increment du compteur de generation (monotone, jamais decremente) — sauf comptes illimites
    if (!isUnlimited) {
      try {
        await supabaseAdmin
          .from('profiles')
          .upsert({ id: owner_id, generation_count: usedGenerations + 1 }, { onConflict: 'id' });
      } catch (e) {
        console.error('generation_count increment failed:', e);
      }
    }

    // Premier point d'historique du score de visibilite IA (non bloquant)
    try {
      const { score } = computeAiScore({
        type: parsed.type,
        geo_lat,
        geo_lng,
        faq: parsed.faq,
        contact: parsed.contact,
        social_links: parsed.socialLinks,
        mission: parsed.mission,
        vision: parsed.vision,
        whyus: parsed.whyus,
        area_served: parsed.areaServed,
        price_range: parsed.priceRange,
      } as any);
      await supabaseAdmin.from('score_history').insert({ slug, score, reason: 'Création du site' });
    } catch (e) {
      console.error('score_history insert failed:', e);
    }

    return NextResponse.json({ ...parsed, slug, gallery });
  } catch (error) {
    console.error('API ERROR:', error);
    return NextResponse.json({ error: 'Failed to generate business.' }, { status: 500 });
  }
}
