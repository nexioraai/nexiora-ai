import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';

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
    if (!res.ok) return [];
    const data = await res.json();
    return (data.photos || []).map((p: any) => p.src.large || p.src.original).filter(Boolean);
  } catch {
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
- Each item MUST have: {"name": "dish name", "description": "1-sentence description", "price": "amount with currency"}
- Mix: starters, mains, desserts, drinks
- Set "type" to specific cuisine (e.g. "Restaurant marocain")
- Include "Menu" in pages array`;
  }
  if (sector === 'shop') {
    return `

CRITICAL SECTOR - SHOP/BOUTIQUE:
- MUST generate "products" array with 6-10 realistic products
- Each MUST have: {"name", "description", "price" with currency}
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
    // ===============================================================

    const body = await req.json();
    const message = body.message;
    const location = body.location || '';
    const language = body.language || 'fr';

    if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

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
- Services: include title AND a compelling 1-sentence description for each

Return ONLY valid JSON, no markdown:

{
  "name": "",
  "slogan": "",
  "type": "",
  "lang": "ISO 639-1 code of the language you are writing in, e.g. fr, en, ar, es, de, pt, sw",
  "primaryColor": "#hexcolor",
  "heroTitle": "",
  "heroSubtitle": "",
  "about": "",
  "services": [
    {"title": "", "description": ""},
    {"title": "", "description": ""},
    {"title": "", "description": ""},
    {"title": "", "description": ""},
    {"title": "", "description": ""}
  ],
  "faq": [
    {"question": "", "answer": ""},
    {"question": "", "answer": ""},
    {"question": "", "answer": ""},
    {"question": "", "answer": ""}
  ],
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
      max_tokens: 3000,
      messages: [{ role: 'user', content: PROMPT + sectorPrompt + '\n\nBusiness request: ' + message }],
    });

    const text = response.content.map((item: any) => item.type === 'text' ? item.text : '').join('');
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);

    const slug = generateSlug(parsed.name);

    // Vraies images Pexels colorées selon la marque
    const pexelsQuery = `${parsed.type || 'business'} ${parsed.name || ''}`.trim();
    const gallery = await fetchPexelsImages(pexelsQuery, parsed.primaryColor);

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
      services: parsed.services,
      testimonials: parsed.testimonials,
      faq: parsed.faq || [],
      gallery,
      contact: parsed.contact,
      menu: [],
      team: [],
      hours: {},
      address: parsed.contact?.address || '',
      pages: parsed.pages,
      cta: parsed.cta,
      products: parsed.products || [],
      social_links: parsed.socialLinks,
      owner_email,
      lang: parsed.lang || detectedLang || "fr",
    });

    if (error) {
      console.error('SUPABASE ERROR:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ...parsed, slug, gallery });
  } catch (error) {
    console.error('API ERROR:', error);
    return NextResponse.json({ error: 'Failed to generate business.' }, { status: 500 });
  }
}
