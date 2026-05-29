import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/supabase';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = body.message;

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `You are an expert web designer AI. Analyze this business request and generate a complete business profile.

Detect the business type (restaurant, clothing, auto parts, tech, etc.)

Return ONLY a valid JSON object with NO markdown:
{
  "name": "business name",
  "slogan": "catchy tagline",
  "type": "detected business type",
  "primaryColor": "#hex color matching the brand",
  "services": ["service 1", "service 2", "service 3"],
  "pages": ["Home", "About Us", "Services", "Contact"],
  "cta": "call to action",
  "socialLinks": {
    "instagram": "",
    "whatsapp": "",
    "facebook": ""
  }
}

Business request: ${message}`,
        }
      ]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const slug = generateSlug(parsed.name);

    await supabase.from('sites').insert({
      slug,
      name: parsed.name,
      slogan: parsed.slogan,
      type: parsed.type,
      primary_color: parsed.primaryColor,
      services: parsed.services,
      pages: parsed.pages,
      cta: parsed.cta,
      social_links: parsed.socialLinks,
    });

    return NextResponse.json({ ...parsed, slug });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate business.' },
      { status: 500 }
    );
  }
}