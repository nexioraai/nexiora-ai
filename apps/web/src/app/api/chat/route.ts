import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { computeAiScore } from '@/app/lib/aiScore';
import { logGenerationFailure } from '@/lib/generationFailures';
import { isKnownDropshipSubtype, resolvePersistedSubtype } from '@/lib/dropship/subtypeAdmission';
import { usesCatalogSelections } from '@/lib/dropship/catalogAdmission';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Valide la sortie JSON du modele avant toute utilisation — jusqu'ici
// JSON.parse() seul, sans garantie de champ present ni de type correct.
// Couvre les 3 modes (1/2/3) generes par le meme appel IA ; volontairement
// permissif sur les champs decoratifs pour ne pas rejeter une reponse mode
// 2/3 valide hors perimetre de cet audit (MODE 1 uniquement).
const SectionItemSchema = z.object({
  title: z.string(),
  description: z.string(),
  price: z.string().optional().default(''),
  imageQuery: z.string().optional().default(''),
});

const SectionSchema = z.object({
  name: z.string(),
  items: z.array(SectionItemSchema).optional().default([]),
});

const FaqSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

const WhyUsSchema = z.object({
  title: z.string(),
  text: z.string(),
});

const TestimonialSchema = z.object({
  name: z.string(),
  role: z.string(),
  content: z.string(),
  rating: z.number(),
});

const ContactSchema = z.object({
  phone: z.string().optional().default(''),
  email: z.string().optional().default(''),
  address: z.string().optional().default(''),
});

const SocialLinksSchema = z.object({
  instagram: z.string().optional().default(''),
  whatsapp: z.string().optional().default(''),
  facebook: z.string().optional().default(''),
  tiktok: z.string().optional().default(''),
});

export const GeneratedSiteSchema = z.object({
  name: z.string().min(1),
  slogan: z.string().optional().default(''),
  type: z.string().optional().default(''),
  niche_keywords: z.array(z.string()).optional().default([]),
  lang: z.string().optional().default('fr'),
  primaryColor: z.string().optional().default('#1E40AF'),
  heroTitle: z.string().min(1),
  heroSubtitle: z.string().optional().default(''),
  heroImageQuery: z.string().optional().default(''),
  imageQuery: z.string().optional().default(''),
  about: z.string().min(1),
  sections: z.array(SectionSchema).optional().default([]),
  faq: z.array(FaqSchema).optional().default([]),
  whyus: z.array(WhyUsSchema).optional().default([]),
  mission: z.string().optional().default(''),
  vision: z.string().optional().default(''),
  areaServed: z.string().optional().default(''),
  priceRange: z.string().optional().default(''),
  mode: z.coerce.number().int().refine((v) => v === 1 || v === 2 || v === 3, {
    message: 'mode doit etre 1, 2 ou 3',
  }),
  testimonials: z.array(TestimonialSchema).optional().default([]),
  // Volontairement permissif (audit /api/chat, FUNC-05) : parsed.gallery
  // n'est JAMAIS consomme -- toujours ecrase par de vraies images Pexels
  // avant tout usage (voir plus bas, `const gallery = await
  // fetchPexelsImages(...)`). Le modele n'a aucune consigne claire pour ce
  // champ en mode 1 (contrairement aux modes 2/3), et improvise une
  // structure d'objets au lieu d'un tableau de chaines -- z.array(string())
  // rejetait alors TOUTE la generation pour une valeur qui ne sert jamais a
  // rien. Meme traitement que `products` ci-dessous, pour la meme raison.
  gallery: z.array(z.any()).optional().default([]),
  contact: ContactSchema.optional().default({ phone: '', email: '', address: '' }),
  pages: z.array(z.string()).optional().default([]),
  cta: z.string().optional().default(''),
  products: z.array(z.any()).optional().default([]),
  socialLinks: SocialLinksSchema.optional().default({ instagram: '', whatsapp: '', facebook: '', tiktok: '' }),
});

// Service role pour les inserts (bypass RLS — sécurisé car validé via Bearer token avant)

// Client anon pour valider le token utilisateur

// Translitteration arabe -> latin pour les slugs d'URL.
const AR_TO_LATIN: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th',
  'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z',
  'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a',
  'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a', 'ء': '', 'ئ': 'y', 'ؤ': 'w',
};

function transliterate(input: string): string {
  // Retire les diacritiques latins (é -> e) puis convertit l'arabe
  const latin = input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return latin
    .split('')
    .map((ch) => (AR_TO_LATIN[ch] !== undefined ? AR_TO_LATIN[ch] : ch))
    .join('');
}

function generateSlug(name: string): string {
  const base = transliterate(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
  // Filet de securite : si l'ecriture n'est pas translitterable (chinois, cyrillique...)
  return (base || 'site') + '-' + Date.now();
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

export function detectSector(message: string): string {
  const lower = message.toLowerCase();
  if (/\b(restaurant|café|cafe|coffee|bar|brasserie|bistro|pizzeria|fast.?food|food.?truck|cantine|traiteur|boulangerie|pâtisserie|patisserie|cuisine|chef|menu|plat|repas|food)\b/i.test(lower)) return 'restaurant';
  if (/\b(boutique|shop|store|magasin|épicerie|epicerie|marché|marche|e-commerce|ecommerce|vente|produit|product|vêtement|vetement|mode|clothing)\b/i.test(lower)) return 'shop';
  if (/\b(service|consulting|conseil|salon|coiffeur|barber|spa|massage|clinique|cabinet|garage|réparation|reparation|nettoyage|plombier|électricien|electricien|avocat|comptable)\b/i.test(lower)) return 'services';
  if (/\b(portfolio|designer|photograph|artist|artiste|musicien|developer|développeur|developpeur|freelance)\b/i.test(lower)) return 'portfolio';
  return 'general';
}

// Bug reel corrige (incident "boutique en ligne mode 2") : ce prompt sectoriel
// exigeait "MUST generate products array" sans jamais savoir si les regles du
// Mode courant (mode 2/3, lues plus haut dans le meme appel) demandaient au
// contraire products: [] -- contradiction directe dans le meme message envoye
// au modele, "boutique" declenchant a la fois le secteur 'shop' ET pouvant
// etre un Mode 2/3 legitime. `knownMode` permet de supprimer la clause produits
// a la source quand le mode est deja connu avant l'appel (chemin onboarding-chat,
// prefixe "mode: X"). Quand knownMode est null (chemin wizard classique, ou le
// modele determine mode ET secteur dans le meme appel, code incapable de savoir
// a l'avance), la clause reste presente mais explicitement subordonnee aux
// regles de Mode enoncees plus haut dans le prompt (voir INSTRUCTION PRECEDENCE) --
// protege les deux chemins, pas seulement celui ou le mode est deja connu.
export function getSectorPrompt(sector: string, knownMode: number | null): string {
  const modeAlreadyDictatesProducts = knownMode === 2 || knownMode === 3;
  if (sector === 'restaurant') {
    return `

SECTOR DETAIL - RESTAURANT/CAFE/FOOD (subordinate to the MODE rules above -- if those rules already specify how to fill "products", follow them and ignore any products guidance below):${
  modeAlreadyDictatesProducts ? '' : `
- MUST generate "products" array with 6-10 realistic menu items
- Each item MUST have: {"name": "dish name", "description": "1-sentence description", "price": "amount with currency", "imageQuery": "precise English photo search: concrete subject + mood/lighting, e.g. 'grilled salmon plated dark moody'. Never the business name."}
- Mix: starters, mains, desserts, drinks`
}
- Set "type" to specific cuisine (e.g. "Restaurant marocain")
- Include "Menu" in pages array`;
  }
  if (sector === 'shop') {
    return `

SECTOR DETAIL - SHOP/BOUTIQUE (subordinate to the MODE rules above -- if those rules already specify how to fill "products", follow them and ignore any products guidance below):${
  modeAlreadyDictatesProducts ? '' : `
- MUST generate "products" array with 6-10 realistic products
- Each MUST have: {"name", "description", "price" with currency, "imageQuery": "precise English photo search: concrete product + mood/lighting, e.g. 'car brake disc dark studio'. Never the business name."}`
}
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

// Source unique de resolution du mode final -- remplacait avant 4 copies
// independantes de la meme expression (pages, hidden_sections, mode, et la
// declaration finalMode plus bas pour la curation Mode 3), avec le risque de
// divergence future que ca implique. siteMode (connu avant l'appel IA, via
// le prefixe "mode: X" pose par l'entretien onboarding) reste prioritaire ;
// parsed.mode (la propre classification du modele dans sa reponse JSON) ne
// sert de repli que si siteMode est absent (chemin wizard classique, ou
// echec du classifieur d'entretien a fournir un mode exploitable).
export function resolveFinalMode(siteMode: number | null, parsedMode: unknown): number {
  return siteMode ?? (parsedMode === 2 || parsedMode === 3 ? (parsedMode as number) : 1);
}

// Audit Mode 3 global (N10) -- dropshipType venait du body client et etait
// insere tel quel dans sites.dropship_type, sans validation d'enum (aucun
// schema Zod, aucune contrainte CHECK en base). Une valeur garbage y aurait
// ete persistee de facon PERMANENTE (dropship_type n'est jamais modifiable
// apres creation -- confirme par grep exhaustif, aucune UPDATE nulle part
// dans ce depot), bloquant definitivement le marchand hors des outils de
// curation catalogue lies au sous-mode (getToolsForSite compare par egalite
// stricte). null reste une valeur legitime (site Mode 3 sans sous-type
// encore choisi -- 3 sites reels en production dans cet etat).
//
// LOT 1 / L1-01 -- CETTE FONCTION NE CONNAIT PAS LE MODE, ET C'EST VOULU.
// Elle repond a « cette VALEUR est-elle ecrivable ? », pas a « ce SITE
// peut-il l'ecrire ? ». La seconde question est celle qui manquait : elle
// vit desormais dans `resolvePersistedSubtype`, appliquee plus bas au seul
// point d'ecriture. La liste des sous-types, elle, n'est plus recopiee ici :
// deux listes finissent toujours par diverger.
export function isValidDropshipType(value: unknown): value is 'reseller' | 'pod_brand' | 'pod_custom' | null {
  return value === null || isKnownDropshipSubtype(value);
}

// Garantie deterministe (incident reel "boutique en ligne mode 2", genere
// avec 10 produits malgre B+A) : Mode 2 et Mode 3 n'ont JAMAIS de produits a
// la generation initiale, par definition produit -- Mode 2 attend que le
// marchand les ajoute via ProductManager.tsx, Mode 3 les recoit ensuite du
// pipeline de curation catalogue. B+A (prompt) restent en place pour eviter
// que le modele gaspille des tokens a en generer inutilement, mais ils
// restent des instructions qu'un modele peut choisir de ne pas suivre
// (prouve empiriquement) -- cette fonction ne depend d'aucune obeissance du
// modele : elle s'applique APRES le parsing/validation Zod de la reponse IA,
// avant tout enrichissement image et avant l'insertion Supabase. Mode 1
// inchange : ses produits generes (menu, catalogue vitrine) restent legitimes.
export function enforceModeProducts<T>(finalMode: number, rawProducts: T[]): T[] {
  return (finalMode === 2 || finalMode === 3) ? [] : rawProducts;
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
    // N10 -- voir isValidDropshipType() ci-dessus pour le raisonnement complet.
    const rawDropshipType = body.dropshipType || null;
    if (!isValidDropshipType(rawDropshipType)) {
      return NextResponse.json({ error: 'dropshipType invalide' }, { status: 400 });
    }
    const dropshipType = rawDropshipType;
    const language = body.language || 'auto';

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
            content: `You are Deribfy, a friendly AI website builder. Analyze this user input: "${message}"

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
    const sectorPrompt = getSectorPrompt(sector, siteMode);
    console.log('[Generation] Detected sector:', sector, '| knownMode:', siteMode, '| Lang:', detectedLang);

    const phonePrefix = location ? getPhonePrefix(location) : '+1';
    const currency = location ? getCurrency(location) : 'USD';
    const langName = language === 'fr' ? 'French' : language === 'ar' ? 'Arabic' : 'English';

    const PROMPT = `You are an expert AI website builder for local businesses worldwide.

IMPORTANT CONTEXT:
- Location: ${location || 'Not specified'}
- LANGUAGE (CRITICAL): write ALL text content in ${detectedLang === 'ar' ? 'ARABIC' : detectedLang === 'fr' ? 'FRENCH' : detectedLang === 'es' ? 'SPANISH' : 'ENGLISH'}. This is the language the merchant used, so it is the language their customers speak. Every single string you produce — name, slogan, hero, about, FAQ, buttons, section names — must be in that language. The business description below may be written in English for internal purposes: do NOT copy its language, use the one specified here.
- Phone format: start with ${phonePrefix}
- Currency: use ${currency}
- Dropship type: ${dropshipType || 'none'} (none = not a dropshipping site, reseller = resale imported goods, pod_brand = merchant's own designs printed on demand, pod_custom = visitor uploads their own design)
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
- niche_keywords (CRITICAL for mode 3 dropshipping): an array of 8-10 GENERIC single-word English search terms used to search the supplier product catalog by product name. Use BROAD category words, NOT specific product names. The catalog will NOT match "yoga mat" or "resistance band", but WILL match "yoga", "fitness", "gym". Example for a fitness store: ["fitness", "gym", "yoga", "workout", "exercise", "training", "sport", "weight", "running", "muscle"]. Example for a pet store: ["pet", "dog", "cat", "puppy", "collar", "leash", "grooming", "animal", "feeding"]. Example for a tech gadget store: ["phone", "charger", "LED", "USB", "bluetooth", "wireless", "earbuds", "gadget", "smart", "cable"]. For mode 1 and 2, return an empty array [].
- gallery: ALWAYS return an empty array [], regardless of mode or sector. Gallery images are selected automatically from a stock photo library after your response — never invent URLs, objects, or descriptions for this field.

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
- mode = 3 (DROPSHIPPING / PRINT-ON-DEMAND): Online store powered by supplier fulfillment. Three sub-types exist (indicated by the "Dropship type" field above):
  * "reseller" — Resale of trending manufactured goods. Products: gadgets, accessories, phone cases, home decor, fitness gear, beauty tools, small electronics. The store auto-curates 30 trending products and customers can search the full 7,000+ product catalog. Fulfillment is 100% automated by Deribfy.
  * "pod_brand" — Merchant's OWN brand: they upload their original designs/logos which are printed on premium blank products (t-shirts, mugs, hoodies, etc.). The store displays the merchant's designed mockups as products. Production and fulfillment are 100% automated by Deribfy.
  * "pod_custom" — Visitor customization: the store displays blank products, and each VISITOR uploads their own design/logo/image at purchase time. The design is printed on the chosen product. Production and fulfillment are 100% automated by Deribfy.
  NEVER assign mode 3 to perishables, food, services, made-to-order, or anything requiring local expertise.

STRICT RULES:
- Restaurant / food / café / bakery → ALWAYS mode 1. NEVER 2 or 3.
- Any service (salon, clinic, mechanic, lawyer, etc.) → ALWAYS mode 1. NEVER 2 or 3.
- If the user explicitly says "boutique" with local stock → mode 2.
- If the user explicitly says "dropshipping" or "resell imported products" → mode 3.
- When in doubt → mode 1 (safer default).

INSTRUCTION PRECEDENCE (ABSOLUTE — read before anything else below):
This prompt has two layers: (1) the MODE-SPECIFIC RULES you are about to read (mode 1/2/3 sections below, including how each mode wants "products" filled), and (2) a SECTOR DETAIL block appended at the very end of this prompt, adding industry-specific tone and wording for the business's sector. On ANY conflict between the two — especially about whether/how to fill "products" — the MODE-SPECIFIC RULE ALWAYS WINS. The sector block exists only to add flavor and detail INSIDE the boundaries the mode has already set; it can never override a mode's data rules. If a mode section below says "products: return an empty array []", that instruction stands even if the sector block later tells you to generate product entries — ignore that part of the sector block in that case.

BOUTIQUE CLASSIQUE (mode 2) SPECIFIC RULES:
- pages MUST be ["Home", "About", "Shop", "Contact"] — the Shop displays products the merchant adds manually in their dashboard. NO supplier catalog, NO search bar for external products, NO automated product curation.
- sections: 1-2 sections showcasing the type of products this boutique sells (e.g. "Nos Collections", "Nos Créations"). Items are EXAMPLES to inspire the merchant — they will replace them with their real products. Each item has title, description, price, imageQuery as usual.
- products: return an EMPTY array [] — the merchant adds their own products manually after site generation.
- testimonials: 3 realistic testimonials (like mode 1).
- heroTitle/heroSubtitle: emphasize the boutique's unique identity, curated selection, local/artisanal quality. Tone = authentic, inviting, personal.
- slogan: about the boutique's identity, craftsmanship, or curated taste.
- cta: "Discover our shop" / "Découvrir la boutique" / equivalent in site language. Action = browse the shop.
- about: describe a local boutique with its own inventory, personal curation, and unique identity. The owner selects and manages their own products. NEVER mention suppliers, dropshipping, automated fulfillment, or Deribfy handling anything.
- faq: 4 questions about shipping (handled by the merchant), return/exchange policy (merchant's own policy), secure payment (Stripe — the merchant's own Stripe account), and product availability (real physical inventory).
- whyus: 3 trust signals — unique/curated selection, personal customer service, secure payment.
- CRITICAL: Mode 2 is a self-managed boutique. The merchant connects their OWN Stripe account via Stripe Connect. Payments go DIRECTLY to the merchant. There is NO platform commission, NO automated fulfillment, NO supplier integration. The merchant handles their own stock, shipping, and customer service. NEVER mention Deribfy, suppliers, or automation in any generated text.

DROPSHIPPING (mode 3) SPECIFIC RULES — ADAPT BY DROPSHIP TYPE:

COMMON TO ALL MODE 3 (reseller, pod_brand, pod_custom):
- pages MUST be ["Home", "About", "FAQ", "Contact"] — NO Gallery, NO Reviews, NO Services. The shop/catalog appears automatically.
- sections: return an EMPTY array [] — products come from suppliers, not manual entry.
- testimonials: return an EMPTY array [] — no fake reviews.
- products: return an EMPTY array [] — products are auto-curated from supplier catalog.

IF dropship_type = "reseller":
- heroTitle/heroSubtitle: emphasize trending products, unbeatable prices, worldwide shipping, huge selection. Tone = bold e-commerce energy.
- slogan: about smart shopping, best deals, curated trending products.
- cta: "Discover our products" / "Découvrir nos produits" / equivalent in site language. Action = browse the shop.
- about: describe a modern online store curating the best trending products at competitive prices, shipped worldwide. All orders are fulfilled automatically — the merchant focuses on their brand while Deribfy handles everything.
- faq: 4 questions about shipping times (7-15 business days international), return policy, secure payment (Stripe), product quality and sourcing.
- whyus: 3 trust signals — competitive pricing, fast worldwide shipping, secure payment & buyer protection.
- IMPORTANT: Customers see 30 curated trending products on the storefront AND can search the full 7,000+ product catalog via the search bar to find anything they want.

IF dropship_type = "pod_brand":
- heroTitle/heroSubtitle: emphasize original designs, unique brand, exclusive creations, wearable art. Tone = creative brand identity.
- slogan: about unique designs, original creations, the merchant's brand story.
- cta: "Explore the collection" / "Voir la collection" / equivalent in site language. Action = browse the merchant's designs.
- about: describe a brand that creates original designs printed on premium products (apparel, accessories, home items). Each product is made-to-order with professional printing. All production and shipping are handled automatically.
- faq: 4 questions about print quality & durability, available product types (t-shirts, hoodies, mugs, posters…), production time (3-7 business days + shipping), sizing & materials.
- whyus: 3 brand signals — exclusive original designs, premium print-on-demand quality, made-to-order (no waste/overstock).
- IMPORTANT: The merchant uploads their own designs and logo in the editor dashboard. Products displayed are the merchant's designed mockups — visitors do NOT customize anything, they buy the merchant's creations.

IF dropship_type = "pod_custom":
- heroTitle/heroSubtitle: emphasize personalization, "create YOUR unique product", upload your logo/design/image, make it yours. Tone = empowering, creative, fun.
- slogan: about self-expression, custom products, "your design, your product".
- cta: "Create my product" / "Créer mon produit" / equivalent in site language. Action = start customizing.
- about: describe a platform where anyone can create custom products by uploading their own design, logo, name, or image. Professional printing on premium blanks (t-shirts, hoodies, mugs, phone cases, etc.). All production and shipping are handled automatically.
- faq: 4 questions about accepted file formats (PNG, JPG, SVG, max 10MB), print areas (front placement), production time (3-7 business days + shipping), how the customization works (choose product → upload design → preview → order).
- whyus: 3 customization signals — total creative freedom (upload any design), professional print quality, preview before ordering.
- IMPORTANT: Customers see 30 curated blank products AND can search more blanks via the search bar. On each product, a design uploader lets the visitor upload their own image/logo/design BEFORE adding to cart. The design is printed on the product after purchase.

Return ONLY valid JSON, no markdown:

{
  "name": "",
  "slogan": "",
  "type": "",
  "niche_keywords": [],
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

    // max_tokens releve de 4500 -> 8000 (audit FUNC-04) : mesure reelle sur
    // 3 essais identiques (secteur restaurant, prompt HEAD) : 4227 et 4416
    // tokens en succes, un 3e tronque exactement a 4500 -- la valeur
    // precedente etait fixee DANS la marge de variance naturelle du modele,
    // pas au-dessus. 8000 aligne sur le precedent deja en production dans ce
    // depot pour le meme modele (catalog/enhance/route.ts), avec une marge
    // reelle (~1.8x) au-dessus du point de troncature observe.
    const MAIN_MAX_TOKENS = 8000;
    const mainCallParams = {
      model: 'claude-haiku-4-5-20251001' as const,
      max_tokens: MAIN_MAX_TOKENS,
      messages: [{ role: 'user' as const, content: PROMPT + sectorPrompt + '\n\nBusiness request: ' + message }],
    };
    let response = await anthropic.messages.create(mainCallParams);

    // Retry unique, strictement conditionne a une troncature reelle (audit
    // FUNC-04) : jamais sur end_turn, jamais sur une erreur reseau (qui leve
    // avant ce point et n'atteint jamais cette ligne), jamais sur un JSON
    // invalide pour une autre raison ou un echec Zod (evalues plus bas,
    // hors de cette portee). Aucune boucle : une seule tentative
    // supplementaire, jamais rejouee si elle echoue aussi -- le chemin
    // d'erreur existant (JSON.parse/Zod, deja instrumente par OBS-05) prend
    // le relais normalement si la 2e tentative est encore tronquee.
    if (response.stop_reason === 'max_tokens') {
      console.warn('[chat] max_tokens atteint au 1er essai, retry unique', { sector, siteMode });
      response = await anthropic.messages.create(mainCallParams);
    }

    const text = response.content.map((item: any) => item.type === 'text' ? item.text : '').join('');
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed: z.infer<typeof GeneratedSiteSchema>;
    try {
      // Deux causes distinctes, avant fusionnees dans le meme catch generique :
      // JSON.parse peut lever (texte tronque/mal forme) AVANT meme d'atteindre
      // Zod, qui lui rejette une structure JSON valide mais non conforme au
      // schema (issues precises, champ par champ). Separees ici pour que
      // generation_failures puisse enregistrer laquelle des deux s'est
      // produite, plutot qu'un message generique impossible a distinguer
      // apres coup (incident "boutique en ligne mode 2" : cause reelle jamais
      // determinee faute de cette distinction).
      let asJson: unknown;
      try {
        asJson = JSON.parse(clean);
      } catch (jsonErr: unknown) {
        const msg = jsonErr instanceof Error ? jsonErr.message : String(jsonErr);
        await logGenerationFailure({
          owner_id, owner_email, requested_mode: siteMode, detected_sector: sector,
          failure_type: 'json_parse', stop_reason: response.stop_reason ?? null,
          parse_error: msg, raw_response_tail: text.slice(-3000),
          message_excerpt: message.slice(0, 500),
        });
        throw jsonErr;
      }
      try {
        parsed = GeneratedSiteSchema.parse(asJson);
      } catch (zodErr: unknown) {
        await logGenerationFailure({
          owner_id, owner_email, requested_mode: siteMode, detected_sector: sector,
          failure_type: 'schema_validation', stop_reason: response.stop_reason ?? null,
          zod_issues: zodErr instanceof z.ZodError ? zodErr.issues : String(zodErr),
          raw_response_tail: text.slice(-3000), message_excerpt: message.slice(0, 500),
        });
        throw zodErr;
      }
    } catch (e: any) {
      console.error('AI JSON validation failed:', e?.message || e, '\nRaw text (tail):', text.slice(-2000));
      return NextResponse.json(
        { error: "La génération IA a produit un résultat invalide. Merci de réessayer." },
        { status: 502 }
      );
    }

    const slug = generateSlug(parsed.name);

    // Geocodage reel via Nominatim (OpenStreetMap) depuis l'adresse
    let geo_lat: number | null = null;
    let geo_lng: number | null = null;
    const addr = parsed.contact?.address || '';
    if (addr) {
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`,
          { headers: { 'User-Agent': 'Deribfy/1.0 (contact@deribfy.com)' } }
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
    // Image hero dédiée (recherche premium selon la niche)
    const heroQuery = (parsed.heroImageQuery || pexelsQuery).trim();
    const heroImgs = await fetchPexelsImages(heroQuery, parsed.primaryColor);
    const heroImage = heroImgs[0] || gallery[0] || '';
    // Source unique du mode final, calculee une seule fois et reutilisee
    // partout ci-dessous (pages, hidden_sections, mode, products) -- voir
    // resolveFinalMode(). Calculee ICI (avant l'enrichissement image) pour
    // que enforceModeProducts() s'applique avant tout appel Pexels inutile
    // sur des produits Mode 2/3 qui seront de toute facon jetes.
    const finalMode = resolveFinalMode(siteMode, parsed.mode);
    // ============================================================
    // LOT 1 / L1-01 -- L'INVARIANT « MODE 3 => SOUS-TYPE ».
    //
    // POURQUOI ICI ET NULLE PART AILLEURS. C'est le PREMIER point du depot
    // ou les deux valeurs sont connues ensemble : `dropshipType` vient du
    // corps de requete (valide en forme ligne ~360), `finalMode` de
    // `resolveFinalMode`, qui depend de la reponse du modele. La validation
    // d'entree ne pouvait donc pas poser cette regle -- elle ne savait pas
    // encore quel mode serait ecrit. Et c'est le SEUL point d'ecriture de
    // `sites.dropship_type` du depot : ni PostgREST (colonne hors du GRANT
    // UPDATE), ni `supabase-owned-site` (denylist) ne l'atteignent. Le poser
    // ici, c'est le rendre incontournable par le chemin d'ecriture mesure.
    //
    // REFUS, JAMAIS RETROGRADATION. Basculer le site en Mode 1 « pour le
    // sauver » serait exactement le repli silencieux que ce lot supprime :
    // le marchand a demande une boutique dropshipping, il doit obtenir une
    // erreur explicite, pas un autre produit. Le flux legitime ne rencontre
    // plus ce refus -- `api/onboarding` reclame desormais le sous-type
    // AVANT de declencher la generation (`need_dropship_type`).
    // ============================================================
    const subtype = resolvePersistedSubtype(finalMode, dropshipType);
    if (!subtype.ok) {
      return NextResponse.json(
        { error: 'Un site dropshipping doit avoir un sous-type (reseller, pod_brand ou pod_custom).', reason: subtype.reason },
        { status: 400 }
      );
    }
    const persistedDropshipType = subtype.value;
    // Image Pexels par produit (recherche par nom + type), en parallèle
    const rawProducts = enforceModeProducts(
      finalMode,
      Array.isArray(parsed.products) ? parsed.products : []
    );
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
      hero_image: heroImage,
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
        if (finalMode === 3) {
          const l = (detectedLang || parsed.lang || 'fr').toLowerCase();
          if (l === 'fr') return ['Accueil', 'À propos', 'Contact'];
          if (l === 'es') return ['Inicio', 'Acerca de', 'Contacto'];
          if (l === 'ar') return ['الرئيسية', 'من نحن', 'اتصل بنا'];
          return ['Home', 'About', 'Contact'];
        }
        // Mode 1 (vitrine/service) : ce champ n'a aucun effet sur le rendu
        // (verifie sur les 4 themes — seul hidden_sections pilote la
        // visibilite des sections ; le bloc "CUSTOM PAGES" des themes
        // attend des objets {title,content,image}, jamais produits ici).
        // On arrete de persister une valeur inerte plutot que de la filtrer
        // pour rien.
        if (finalMode === 1) {
          return [];
        }
        return parsed.pages;
      })(),
      hidden_sections: finalMode === 3 ? ['Services', 'Gallery', 'Reviews'] : [],
      cta: parsed.cta,
      products: productsWithImages,
      social_links: parsed.socialLinks,
      owner_email,
      owner_id,
      mode: finalMode,
      lang: detectedLang || parsed.lang || "fr",
      geo_lat,
      geo_lng,
      area_served: parsed.areaServed || null,
      price_range: parsed.priceRange || null,
      dropship_type: persistedDropshipType,
      niche_keywords: Array.isArray(parsed.niche_keywords) ? parsed.niche_keywords : [],
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

    // ============================================================
    // LOT 3 / DEBT-055 -- L'AUTO-CURATION DEMANDE A L'AUTORITE.
    //
    // La condition etait `finalMode === 3 && persistedDropshipType` : une
    // regle ecrite ici, plus large que la realite. Elle declenchait la
    // curation pour `pod_brand`, a qui `CATALOG_SUBTYPES` refuse les outils
    // de curation et dont la guidance dit « NO CATALOG CURATION: Products
    // come from the merchant's uploaded designs ». Ses produits viennent de
    // `pod_designs`, jamais de `site_catalog_selections`.
    //
    // Le LOT 2 avait deja rendu l'effet inoffensif -- `catalog/curate` refuse
    // desormais en 400, et ces appels sont non bloquants. Restait la FORME :
    // une route transversale portant sa propre interpretation du sous-type.
    // Elle interroge maintenant `usesCatalogSelections`, l'autorite deja
    // etablie au LOT 2 et deja consommee par les sept couches du mecanisme.
    // Aucune autorite nouvelle, aucun doublon.
    // ============================================================
    if (usesCatalogSelections(finalMode, persistedDropshipType)) {
      try {
        const { data: newSite } = await supabaseAdmin
          .from('sites')
          .select('id')
          .eq('slug', slug)
          .single();
        if (newSite?.id) {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
          // 1. Curate
          await fetch(`${baseUrl}/api/catalog/curate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ slug }),
          });
          // 2. Enhance
          await fetch(`${baseUrl}/api/catalog/enhance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ slug }),
          });
          // 3. Approve all
          await supabaseAdmin
            .from('site_catalog_selections')
            .update({ merchant_approved: true })
            .eq('site_id', newSite.id);
        }
      } catch (e) {
        console.error('Auto-curation failed (non-blocking):', e);
      }
    }
    return NextResponse.json({ ...parsed, slug, gallery });
  } catch (error) {
    console.error('API ERROR:', error);
    return NextResponse.json({ error: 'Failed to generate business.' }, { status: 500 });
  }
}
