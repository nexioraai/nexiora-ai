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

    const phonePrefix = location ? getPhonePrefix(location) : '+1';
    const currency = location ? getCurrency(location) : 'USD';
    const langName = language === 'fr' ? 'French' : language === 'ar' ? 'Arabic' : 'English';

    const PROMPT = `You are an expert AI website builder for local businesses worldwide.

IMPORTANT CONTEXT:
- Location: ${location || 'Not specified'}
- Write ALL text content in ${langName}
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
      max_tokens: 2500,
      messages: [{ role: 'user', content: PROMPT + '\n\nBusiness request: ' + message }],
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
