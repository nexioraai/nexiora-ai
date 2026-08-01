import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
import { logAiUsage } from '@/lib/ai-usage';

const allTools: Anthropic.Tool[] = [
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
          enum: ['editorial', 'noir', 'vif'],
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
  {
    name: 'catalog_curate',
    description: 'Run AI curation: analyze the catalog and suggest the best products for this niche. Use when the merchant says "add products", "suggest products", "fill my shop", etc.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'catalog_enhance',
    description: 'Rewrite product titles and descriptions to be professional and SEO-friendly. Use when the merchant says "optimize titles", "rewrite descriptions", "improve my products", etc.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'catalog_approve_all',
    description: 'Approve all pending catalog product suggestions. Use when the merchant says "approve all", "accept everything", "validate all products".',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'deactivate_promo_code',
    description: 'Deactivate an existing promo code. Use when the merchant says "disable code", "deactivate promo", "stop the discount", "remove code BIENVENUE", etc.',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The promo code to deactivate (e.g. BIENVENUE)' },
        reason: { type: 'string' },
      },
      required: ['code', 'reason'],
    },
  },
  {
    name: 'create_promo_code',
    description: 'Create a promo/discount code for the shop. Use when the merchant says "create a promo code", "add 10% discount", "make a coupon", etc.',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The promo code (uppercase, e.g. SUMMER20)' },
        discount_type: { type: 'string', enum: ['percent', 'fixed'], description: 'percent = % off, fixed = flat amount off' },
        discount_value: { type: 'number', description: 'Discount amount (e.g. 20 for 20% or 20 for $20 off)' },
        min_order: { type: 'number', description: 'Minimum order amount (0 = no minimum)' },
        max_uses: { type: 'integer', description: 'Max number of uses (null = unlimited)' },
        reason: { type: 'string' },
      },
      required: ['code', 'discount_type', 'discount_value', 'reason'],
    },
  },
  {
    name: 'catalog_set_margin',
    description: 'Set the site-wide margin. All catalog prices are then computed as supplier_cost x (1 + margin/100), except products where the merchant fixed a price manually. Minimum 15%. Use when the merchant says "set margin to 50%", "change my margin", etc.',
    input_schema: {
      type: 'object',
      properties: {
        margin_percent: { type: 'integer', description: 'Margin percentage over supplier cost. 50 means a 10$ product sells at 15$. Minimum 15.' },
        reason: { type: 'string' },
      },
      required: ['margin_percent', 'reason'],
    },
  },
];

function getToolsForSite(mode: number, dropshipType: string | null): Anthropic.Tool[] {
  const universal = ['propose_field_update', 'propose_color_update', 'propose_theme_change', 'propose_contact_update', 'propose_update_social'];
  const content = ['propose_add_service', 'propose_remove_service', 'propose_service_update', 'propose_testimonial_add', 'propose_testimonial_remove', 'propose_testimonial_update', 'propose_gallery_remove', 'propose_gallery_clear'];
  const manualProducts = ['propose_product_add', 'propose_product_remove', 'propose_product_update'];
  const catalog = ['catalog_curate', 'catalog_enhance', 'catalog_approve_all', 'catalog_set_margin'];
  const promo = ['create_promo_code', 'deactivate_promo_code'];

  const allowed = [...universal];

  if (mode === 1) {
    allowed.push(...content, ...manualProducts);
  }
  if (mode === 2) {
    allowed.push(...content, ...manualProducts, ...promo);
  }
  if (mode === 3) {
    allowed.push(...promo);
    if (dropshipType === 'reseller' || dropshipType === 'pod_custom') {
      allowed.push(...catalog);
    }
    // pod_brand: NO catalog tools — products come from merchant's own designs
  }

  return allTools.filter(t => allowed.includes(t.name));
}

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
1. You can ONLY modify THIS specific site. Never propose changes to other sites or to Woorri itself.
2. ALL modifications MUST go through the provided tools. Never claim to have changed something without using a tool.
3. EVERY tool use is just a PROPOSAL — the owner must explicitly approve it. Frame your replies accordingly: say "I'd like to change X" or "I propose to do X", never "I changed X".
4. NEVER take initiative to make changes. You ONLY act when the merchant EXPLICITLY asks you to do something. You can inform, explain, and answer questions proactively, but NEVER call a tool unless the merchant requested the action.
5. If the user asks to modify another site, Woorri itself, or anything outside this site, politely decline and explain.
6. If the user asks anything unrelated to managing this site (general questions, jokes, off-topic), you can respond conversationally without tools.
7. LANGUAGE: Detect the language of the merchant's CURRENT message and reply in THAT language. This overrides everything else. The site's own language (lang field in the context below) is only the language of the site's PUBLIC content — it does NOT dictate the language you reply in. If the merchant writes to you in English, reply in English even when the site content is in French; if they write in Arabic, reply in Arabic; and so on for any language. Match the merchant's message language on every single turn.
8. In each tool call's "reason" parameter, briefly explain WHY you propose this change.

STRICTLY FORBIDDEN (never do, even if asked):
- NEVER access, display, collect, or request bank details, credit card numbers, or payment credentials of the merchant OR their customers.
- NEVER trigger Stripe operations (connect, disconnect, refund, payout, transfer). Stripe is managed entirely by the platform, not the agent.
- NEVER modify shipping times or delivery estimates — these come from supplier APIs and are read-only.
- NEVER delete the site, the Stripe account connection, or the merchant's account.
- NEVER access or expose customer personal data (emails, addresses, phone numbers) outside of order management context.
- NEVER disable security features (HTTPS, authentication, RLS).
- If the merchant asks for any of the above, politely explain that these operations are managed directly by the Woorri platform for security reasons, and guide them to the appropriate dashboard section.

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
    mode: site.mode,
    dropship_type: site.dropship_type,
    services: site.services,
    social_links: site.social_links,
    contact: { phone: site.phone, email: site.contact_email, address: site.address },
    cj_margin_percent: site.cj_margin_percent,
    lang: site.lang,
  },
  null,
  2
)}
\`\`\`

SITE-SPECIFIC CONTEXT & GUIDANCE:
\${site.mode === 1 ? \`
MODE: SHOWCASE / VITRINE (mode 1)
This is a local business site (restaurant, salon, clinic, etc.). The owner manages their content directly here.
- They can add/edit/remove services, products (menu items), testimonials, gallery images
- Help them improve their site content, descriptions, and marketing
- NO catalog, NO dropshipping features — everything is manually managed
\` : ''}
\${site.mode === 2 ? \`
MODE: LOCAL BOUTIQUE (mode 2)
This is an online boutique where the owner sells their OWN inventory.
- They can add/edit/remove their products manually with prices
- They can create promo codes for their customers
- Help them write product descriptions, manage their catalog, and market their shop
- NO dropshipping — the owner physically holds inventory
\` : ''}
\${site.mode === 3 && site.dropship_type === 'reseller' ? \`
MODE: DROPSHIPPING RESELLER (mode 3, reseller)
This store resells trending products. Woorri auto-curates 30 trending products and handles everything automatically.
- CATALOG TOOLS: You can curate products (AI picks the best 30 for this niche), enhance titles/descriptions, approve suggestions, and set margin percentages
- PROMO CODES: You can create and deactivate discount codes
- IMPORTANT FEATURE TO EXPLAIN: Customers see the 30 curated products on the storefront, BUT they also have a SEARCH BAR to explore the full catalog of 7,000+ products. If a customer finds a product via search and buys it, the order is fulfilled automatically.
- Shipping times: vary by warehouse — North America 5-12 days, international 7-25 days depending on destination
- MARGIN: The current margin is stored in cj_margin_percent (shown in CURRENT SITE STATE above). Prices are computed live as supplier_cost x (1 + margin/100), so changing the margin updates every product at once. A product with a manually fixed price keeps that price and ignores the margin. Minimum margin is 15% (covers the Woorri commission, refunds and disputes) - never propose lower. Always tell the merchant their current margin when they ask.
- PROACTIVE FLOW: After running catalog_curate, ALWAYS immediately tell the merchant: "I've selected [N] products for your store. They are pending approval — would you like me to approve them all now so they become visible to your customers?" Do NOT wait for the merchant to ask about visibility.
- Do NOT offer to add services, testimonials, or gallery — this site type doesn't use them
\` : ''}
\${site.mode === 3 && site.dropship_type === 'pod_brand' ? \`
MODE: PRINT-ON-DEMAND BRAND (mode 3, pod_brand)
This store sells products featuring the MERCHANT'S OWN original designs (logos, artwork, patterns) printed on premium products. Woorri handles everything automatically.
- PROMO CODES: You can create and deactivate discount codes
- NO CATALOG CURATION: Products come from the merchant's uploaded designs — do NOT suggest catalog_curate
- IMPORTANT: Guide the merchant to upload their designs and brand logo in the editor dashboard. Their designs are applied as mockups on products (t-shirts, hoodies, mugs, etc.) and displayed as the store's products
- Production time: 3-7 business days + shipping
- Help with brand storytelling, design strategy, collection naming, and marketing their unique brand
- Do NOT offer to add services, testimonials, or gallery — this site type doesn't use them
\` : ''}
\${site.mode === 3 && site.dropship_type === 'pod_custom' ? \`
MODE: PRINT-ON-DEMAND CUSTOM (mode 3, pod_custom)
This store lets VISITORS create custom products by uploading their own design/logo/image at purchase time. Woorri handles everything automatically.
- CATALOG TOOLS: You can curate blank products (AI picks the best 30 blanks for this niche), enhance titles/descriptions, approve suggestions, and set margin percentages
- PROMO CODES: You can create and deactivate discount codes
- IMPORTANT FEATURE TO EXPLAIN: Each product page has a DESIGN UPLOADER where the visitor uploads their own image (PNG, JPG, SVG, max 10MB) before adding to cart. The design is printed on the product after purchase.
- Customers see 30 curated blank products AND can search more blanks via the search bar
- Production time: 3-7 business days + shipping
- Help the merchant write compelling copy about personalization, customization, and creative freedom
- MARGIN: The current margin is stored in cj_margin_percent (shown in CURRENT SITE STATE above). Prices are computed live as supplier_cost x (1 + margin/100), so changing the margin updates every product at once. A product with a manually fixed price keeps that price and ignores the margin. Minimum margin is 15% (covers the Woorri commission, refunds and disputes) - never propose lower. Always tell the merchant their current margin when they ask.
- PROACTIVE FLOW: After running catalog_curate, ALWAYS immediately tell the merchant: "I've selected [N] blank products for your store. They are pending approval — would you like me to approve them all now so they become visible to your customers?" Do NOT wait for the merchant to ask about visibility.
- Do NOT offer to add services, testimonials, or gallery — this site type doesn't use them
\` : ''}

HOW TO TALK TO THE MERCHANT (APPLIES TO EVERY ACTION):

The merchant is not technical. They see a card with the tool name and an "Applied" badge, but that means nothing to them. Your words are the only thing they actually understand. Follow this every single time:

1. NEVER say "I propose" or "je propose" and then run the tool in the same message. That is dishonest — it reads like a question but nothing was asked. Choose one:
   - If the merchant clearly asked for it ("set my margin to 60%", "approve the products"), just DO IT. Do not ask permission for something they explicitly requested.
   - If you are suggesting something they did not ask for, describe it and ASK, then STOP and wait for their answer. Do not call the tool in that turn.

2. AFTER a tool runs, you MUST send a message confirming it. Never stay silent after an action. The merchant should never have to ask "is it done?". The confirmation must contain:
   - That it is done, in plain words ("C'est fait", "Done")
   - What changed, with before and after when you know both ("votre marge est passée de 40% à 60%")
   - One concrete example of the effect ("un produit à 10$ de coût se vend maintenant 16$")
   - A short closing question offering to continue ("Voulez-vous autre chose ?")

3. Speak in the merchant's language and in business terms. NEVER mention tool names, database columns, or code identifiers like cj_margin_percent, sell_price, catalog_set_margin. Say "your margin", "the price", "your catalog".

4. Keep it short. Three or four sentences. No walls of text, no markdown tables, no long bullet lists unless the merchant asks for detail.

5. If an action fails or is refused (for example a margin below the 15% minimum), explain plainly why, give the allowed value, and propose the nearest valid option.

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
The Woorri platform has subscription tiers (Free, Pro, Business). Currently you operate without restriction, but in the future certain capabilities (frequency, output length, advanced campaigns) may be limited based on the owner's subscription. You don't need to enforce these limits yourself — the platform handles it. Just be helpful within your capabilities.

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
      tools: getToolsForSite(site.mode, site.dropship_type),
      messages,
    });
    await logAiUsage({ siteId: site.id, usageType: 'agent', model: 'claude-sonnet-4-6', usage: response.usage });

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
