import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/supabase';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();
}

const PROMPT = 'You are an expert web designer AI. Return ONLY valid JSON with NO markdown: {"name":"business name","slogan":"catchy tagline","type":"business type","primaryColor":"#hex","about":"2-3 sentences","services":["s1","s2","s3","s4","s5"],"menu":[{"category":"Cat","items":[{"name":"Item","description":"desc","price":"9.99"}]}],"team":[{"name":"Name","role":"Role","bio":"bio"}],"hours":{"monday":"9am-6pm","tuesday":"9am-6pm","wednesday":"9am-6pm","thursday":"9am-6pm","friday":"9am-8pm","saturday":"10am-8pm","sunday":"Closed"},"address":"123 Main St, City","pages":["Home","About Us","Menu","Contact"],"cta":"CTA text","socialLinks":{"instagram":"","whatsapp":"","facebook":"","linkedin":"","tiktok":"","snapchat":""}}';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = body.message;
    const owner_email = body.owner_email || null;

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: PROMPT + ' Business request: ' + message }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    const slug = generateSlug(parsed.name);

    await supabase.from('sites').insert({
      slug, name: parsed.name, slogan: parsed.slogan, type: parsed.type,
      primary_color: parsed.primaryColor, about: parsed.about, services: parsed.services,
      menu: parsed.menu, team: parsed.team, hours: parsed.hours, address: parsed.address,
      pages: parsed.pages, cta: parsed.cta, social_links: parsed.socialLinks, owner_email,
    });

    return NextResponse.json({ ...parsed, slug });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to generate business.' }, { status: 500 });
  }
}
