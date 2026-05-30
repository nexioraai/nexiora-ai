import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/supabase';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function generateSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') +
    '-' +
    Date.now()
  );
}

const PROMPT = `
You are an expert website builder AI.

Return ONLY valid JSON.

{
  "name":"",
  "slogan":"",
  "type":"",
  "primaryColor":"#3b82f6",

  "heroTitle":"",
  "heroSubtitle":"",

  "about":"",

  "services":[
    "",
    "",
    "",
    "",
    ""
  ],

  "testimonials":[
    {
      "name":"",
      "text":""
    },
    {
      "name":"",
      "text":""
    },
    {
      "name":"",
      "text":""
    }
  ],

  "gallery":[
    "",
    "",
    ""
  ],

  "contact":{
    "phone":"",
    "email":"",
    "address":""
  },

  "menu":[],

  "team":[],

  "hours":{},

  "address":"",

  "pages":[
    "Home",
    "About",
    "Contact"
  ],

  "cta":"",

  "socialLinks":{
    "instagram":"",
    "whatsapp":"",
    "facebook":"",
    "linkedin":"",
    "tiktok":"",
    "snapchat":""
  }
}
`;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const message = body.message;

    const owner_email = body.owner_email || null;

    if (!message) {
      return NextResponse.json(
        {
          error: 'Message is required',
        },
        {
          status: 400,
        }
      );
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',

      max_tokens: 2000,

      messages: [
        {
          role: 'user',

          content:
            PROMPT +
            '\nBusiness request: ' +
            message,
        },
      ],
    });

   const text = response.content
.map((item: any) => {
if (item.type === 'text') {
return item.text;
}

return '';
})
.join('');

    const clean = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(clean);

    const slug = generateSlug(parsed.name);

    const { error } = await supabase
      .from('sites')
      .insert({
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

        gallery: parsed.gallery,

        contact: parsed.contact,

        menu: parsed.menu,

        team: parsed.team,

        hours: parsed.hours,

        address: parsed.address,

        pages: parsed.pages,

        cta: parsed.cta,

        social_links: parsed.socialLinks,

        owner_email,
      });

    if (error) {
      console.error('SUPABASE ERROR:', error);

      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      ...parsed,

      slug,
    });
  } catch (error) {
    console.error('API ERROR:', error);

    return NextResponse.json(
      {
        error: 'Failed to generate business.',
      },
      {
        status: 500,
      }
    );
  }
}