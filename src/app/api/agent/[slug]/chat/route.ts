import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const tools: Anthropic.Tool[] = [
  {
    name: 'propose_field_update',
    description: 'Propose to update a single text field on the site. Requires user approval before applying.',
    input_schema: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          enum: ['name', 'slogan', 'about', 'hero_title', 'hero_subtitle', 'cta', 'type'],
          description: 'Field to update',
        },
        value: { type: 'string', description: 'New value for the field' },
        reason: { type: 'string', description: 'Brief explanation of why this change is proposed' },
      },
      required: ['field', 'value', 'reason'],
    },
  },
  {
    name: 'propose_color_update',
    description: 'Propose to update the primary brand color (hex format, e.g. #E07040).',
    input_schema: {
      type: 'object',
      properties: {
        color: { type: 'string', description: 'New hex color, e.g. #E07040' },
        reason: { type: 'string' },
      },
      required: ['color', 'reason'],
    },
  },
  {
    name: 'propose_theme_change',
    description: 'Propose to switch the visual theme of the site.',
    input_schema: {
      type: 'object',
      properties: {
        theme: {
          type: 'string',
          enum: ['editorial', 'bold', 'monochrome'],
          description: 'Theme key',
        },
        reason: { type: 'string' },
      },
      required: ['theme', 'reason'],
    },
  },
  {
    name: 'propose_add_service',
    description: 'Propose to add a new service to the services list.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['title', 'description', 'reason'],
    },
  },
  {
    name: 'propose_remove_service',
    description: 'Propose to remove a service from the list by its zero-based index.',
    input_schema: {
      type: 'object',
      properties: {
        index: { type: 'integer', description: 'Zero-based index of the service to remove' },
        reason: { type: 'string' },
      },
      required: ['index', 'reason'],
    },
  },
  {
    name: 'propose_update_social',
    description: 'Propose to update a social link.',
    input_schema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['instagram', 'facebook', 'whatsapp', 'tiktok'],
        },
        url: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['platform', 'url', 'reason'],
    },
  },
  {
    name: 'propose_contact_update',
    description: 'Propose to update a contact field (phone, email, or address).',
    input_schema: {
      type: 'object',
      properties: {
        field: { type: 'string', enum: ['phone', 'email', 'address'] },
        value: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['field', 'value', 'reason'],
    },
  },
  {
    name: 'propose_service_update',
    description: 'Propose to modify an existing service by its zero-based index.',
    input_schema: {
      type: 'object',
      properties: {
        index: { type: 'integer' },
        field: { type: 'string', enum: ['title', 'description'] },
        value: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['index', 'field', 'value', 'reason'],
    },
  },
  {
    name: 'propose_testimonial_add',
    description: 'Propose to add a new testimonial.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        role: { type: 'string' },
        content: { type: 'string' },
        rating: { type: 'integer', minimum: 1, maximum: 5 },
        reason: { type: 'string' },
      },
      required: ['name', 'content', 'rating', 'reason'],
    },
  },
  {
    name: 'propose_testimonial_remove',
    description: 'Propose to remove a testimonial by zero-based index.',
    input_schema: {
      type: 'object',
      properties: {
        index: { type: 'integer' },
        reason: { type: 'string' },
      },
      required: ['index', 'reason'],
    },
  },
  {
    name: 'propose_testimonial_update',
    description: 'Propose to modify an existing testimonial field.',
    input_schema: {
      type: 'object',
      properties: {
        index: { type: 'integer' },
        field: { type: 'string', enum: ['name', 'role', 'content', 'rating'] },
        value: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['index', 'field', 'value', 'reason'],
    },
  },
  {
    name: 'propose_product_add',
    description: 'Propose to add a new product to the shop.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        price: { type: 'string', description: 'Price as string with currency, e.g. "12.99 USD" or "10000 FCFA"' },
        description: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['name', 'reason'],
    },
  },
  {
    name: 'propose_product_remove',
    description: 'Propose to remove a product by zero-based index.',
    input_schema: {
      type: 'object',
      properties: {
        index: { type: 'integer' },
        reason: { type: 'string' },
      },
      required: ['index', 'reason'],
    },
  },
  {
    name: 'propose_product_update',
    description: 'Propose to modify a product field.',
    input_schema: {
      type: 'object',
      properties: {
        index: { type: 'integer' },
        field: { type: 'string', enum: ['name', 'price', 'description'] },
        value: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['index', 'field', 'value', 'reason'],
    },
  },
  {
    name: 'propose_gallery_remove',
    description: 'Propose to remove an image from the gallery by zero-based index.',
    input_schema: {
      type: 'object',
      properties: {
        index: { type: 'integer' },
        reason: { type: 'string' },
      },
      required: ['index', 'reason'],
    },
  },
  {
    name: 'propose_gallery_clear',
    description: 'Propose to clear the entire gallery (remove all images).',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
      required: ['reason'],
    },
  },
];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;

    // CRITICAL: verify the site belongs to this user before exposing its content
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('*')
      .eq('slug', slug)
      .eq('owner_email', user.email)
      .maybeSingle();

    if (siteError || !site) {
      return NextResponse.json(
        { error: 'Site not found or you are not the owner' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const message: string = body.message || '';
    const history: Array<{ role: 'user' | 'assistant'; content: any }> = body.history || [];

    if (!message.trim() && history.length === 0) {
      return NextResponse.json({ error: 'Empty message' }, { status: 400 });
    }

    const systemPrompt = `You are the personal AI assistant for the website "${site.name}" (slug: "${slug}"), owned by ${user.email}.

ABSOLUTE RULES (security boundaries — never violate):
1. You can ONLY modify THIS specific site. Never propose changes to other sites or to Nexiora itself.
2. ALL modifications MUST go through the provided tools. Never claim to have changed something without using a tool.
3. EVERY tool use is just a PROPOSAL — the owner must explicitly approve it. Frame your replies accordingly: say "I'd like to change X" or "I propose to do X", never "I changed X".
4. If the user asks to modify another site, Nexiora itself, or anything outside this site, politely decline and explain.
5. If the user asks anything unrelated to managing this site (general questions, jokes, off-topic), you can respond conversationally without tools.
6. Always respond in the same language as the user.
7. In each tool call's "reason" parameter, briefly explain WHY you propose this change.

CURRENT SITE STATE (read-only context):
\`\`\`json
${JSON.stringify(
  {
    name: site.name,
    slogan: site.slogan,
    type: site.type,
    about: site.about,
    hero_title: site.hero_title,
    hero_subtitle: site.hero_subtitle,
    primary_color: site.primary_color,
    theme: site.theme,
    cta: site.cta,
    services: site.services,
    social_links: site.social_links,
  },
  null,
  2
)}
\`\`\`

MARKETING CONTENT GENERATION (PREMIUM ASSISTANT MODE):
You are a full marketing expert for this business. You can produce any type of premium marketing content the owner needs.

CAPABILITIES — SOCIAL MEDIA:
- Single posts (Instagram, Facebook, LinkedIn, X, TikTok) with platform-appropriate length, hashtags (5-10), CTA, and emojis
- Carousel scripts: slide-by-slide copy with hooks, body, conclusion
- Reel / TikTok / Story scripts: Hook (3s) + Body (15-30s) + CTA + suggested audio/transitions/text overlays
- Editorial calendars: 7 / 14 / 30 days schedules with post types (Reel, Carousel, Story, Live), themes, captions, optimal posting times
- Engagement tactics (polls, questions, contests)

CAPABILITIES — EMAIL & MESSAGING:
- Email campaigns: subject line (<50 chars), preview text, body, CTA, footer
- Newsletters: editorial + 3-5 sections + CTAs
- Cold B2B outreach (for partnerships, distribution, suppliers)
- SMS / WhatsApp Business broadcasts (concise, with opt-out reminder)
- Drip sequences: welcome series, abandoned cart, post-purchase, win-back
- WhatsApp Status / Story content

CAPABILITIES — LONG-FORM CONTENT:
- Blog articles 600-1500 words, SEO-optimized: H1, H2/H3 structure, intro hook, body with examples, conclusion with CTA
- Lead magnets: guides, checklists, ebooks (raw text ready to be designed into a PDF)
- Case studies / customer stories
- Product descriptions optimized for conversion
- Sales pages and landing page copy with PAS (Problem-Agitate-Solution) or AIDA structure
- FAQ pages

CAPABILITIES — STRATEGY & ADS:
- Multi-channel launch campaigns: Email + Social + Ad sequence coordinated for one product/event
- Ad copy A/B variations (3-5 versions) for Meta Ads, Google Ads, TikTok Ads
- SEO package: meta title (≤60 chars), meta description (≤155 chars), 10 target keywords, 5 blog topic ideas, internal linking suggestions
- Audience persona definition (demographics, pain points, channels)
- Competitive analysis (based on publicly known information about the industry)
- Pricing strategy and positioning suggestions
- Brand voice guidelines

CAPABILITIES — CUSTOMER ENGAGEMENT:
- Google Reviews / Trustpilot responses (positive AND negative, polite, professional, brand-aligned)
- Sales scripts (phone, chat, in-person, objection handling)
- Customer FAQ
- Loyalty program ideas and copy
- Referral program copy
- Customer feedback survey questions

GENERAL RULES FOR MARKETING OUTPUT:
- Always match the business type, target audience, and local culture (use the site's location and language as context)
- Adapt emoji density to the platform (Instagram = generous, LinkedIn = light, B2B email = sparse, TikTok = generous)
- For multiple variations, label them clearly: **Version 1**, **Version 2**, **Version 3**
- Use markdown formatting (headings, lists, code blocks) for readability
- Suggest realistic post timing when relevant ("Best time: Tuesday 6 PM local")
- All marketing content is INFORMATIONAL — no tool calls needed, no approval needed (it's for the owner to publish externally)

LEGAL & ETHICAL BOUNDARIES (NON-NEGOTIABLE):
- Never produce illegal content (drugs, weapons, fraud, hacking, spam, malware)
- Never produce misleading, deceptive, or defamatory claims (e.g., fake testimonials, false health claims, baseless competitor attacks)
- Never impersonate other brands, public figures, or real people
- Never produce content that violates copyright (don't quote song lyrics, books, or paid material verbatim)
- Never produce content targeting minors with inappropriate messaging
- Never produce content that promotes discrimination, harassment, or hate
- If a request crosses these lines, politely decline and explain why

SUBSCRIPTION TIERS (CONTEXT):
The Nexiora platform has subscription tiers (Free, Pro, Business). Currently you operate without restriction, but in the future certain capabilities (frequency, output length, advanced campaigns) may be limited based on the owner's subscription. You don't need to enforce these limits yourself — the platform handles it. Just be helpful within your capabilities.

IMPORTANT distinction (always remember):
- Modifying the SITE itself (name, slogan, services, products, contact, theme, etc.) → ALWAYS use a tool + needs approval from the owner
- Marketing content for the owner to use EXTERNALLY (social posts, emails, ads, blogs, scripts) → respond directly in plain text, no tool, no approval needed

Be concise, helpful, and proactive. When the owner asks for a change to the site, immediately propose it via a tool — don't ask redundant questions if the request is clear.`;

    const messages: Anthropic.MessageParam[] = [
      ...history,
      ...(message.trim() ? [{ role: 'user' as const, content: message }] : []),
    ];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      tools,
      messages,
    });

    return NextResponse.json({
      role: 'assistant',
      content: response.content,
      stop_reason: response.stop_reason,
    });
  } catch (err: any) {
    console.error('Agent chat error:', err);
    return NextResponse.json(
      { error: 'Agent error', details: err?.message },
      { status: 500 }
    );
  }
}
