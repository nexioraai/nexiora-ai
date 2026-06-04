import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// Whitelist of tool names that can actually mutate data.
// If a tool name isn't here, we refuse — defense in depth against any model misbehavior.
const ALLOWED_TOOLS = new Set([
  'propose_field_update',
  'propose_color_update',
  'propose_theme_change',
  'propose_add_service',
  'propose_remove_service',
  'propose_update_social',
  'propose_contact_update',
  'propose_service_update',
  'propose_testimonial_add',
  'propose_testimonial_remove',
  'propose_testimonial_update',
  'propose_product_add',
  'propose_product_remove',
  'propose_product_update',
  'propose_gallery_remove',
  'propose_gallery_clear',
]);

const ALLOWED_FIELDS = new Set([
  'name',
  'slogan',
  'about',
  'hero_title',
  'hero_subtitle',
  'cta',
  'type',
]);

const ALLOWED_CONTACT_FIELDS = new Set(['phone', 'email', 'address']);
const ALLOWED_SERVICE_FIELDS = new Set(['title', 'description']);
const ALLOWED_TESTIMONIAL_FIELDS = new Set(['name', 'role', 'content', 'rating']);
const ALLOWED_PRODUCT_FIELDS = new Set(['name', 'price', 'description']);

const ALLOWED_THEMES = new Set(['editorial', 'bold', 'monochrome']);
const ALLOWED_SOCIAL = new Set(['instagram', 'facebook', 'whatsapp', 'tiktok']);

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

    // CRITICAL: re-verify ownership at apply time (defense in depth)
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
    const tool_name: string = body.tool_name;
    const tool_input: any = body.tool_input || {};

    if (!ALLOWED_TOOLS.has(tool_name)) {
      return NextResponse.json(
        { error: `Tool "${tool_name}" is not allowed` },
        { status: 400 }
      );
    }

    let updates: Record<string, any> = {};

    switch (tool_name) {
      case 'propose_field_update': {
        const { field, value } = tool_input;
        if (!ALLOWED_FIELDS.has(field) || typeof value !== 'string') {
          return NextResponse.json({ error: 'Invalid field or value' }, { status: 400 });
        }
        updates[field] = value;
        break;
      }
      case 'propose_color_update': {
        const { color } = tool_input;
        if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
          return NextResponse.json({ error: 'Invalid color (must be #RRGGBB)' }, { status: 400 });
        }
        updates.primary_color = color;
        break;
      }
      case 'propose_theme_change': {
        const { theme } = tool_input;
        if (!ALLOWED_THEMES.has(theme)) {
          return NextResponse.json({ error: 'Invalid theme' }, { status: 400 });
        }
        updates.theme = theme;
        break;
      }
      case 'propose_add_service': {
        const { title, description } = tool_input;
        if (typeof title !== 'string' || typeof description !== 'string') {
          return NextResponse.json({ error: 'Invalid title/description' }, { status: 400 });
        }
        const currentServices = Array.isArray(site.services) ? site.services : [];
        updates.services = [...currentServices, { title, description }];
        break;
      }
      case 'propose_remove_service': {
        const { index } = tool_input;
        const currentServices = Array.isArray(site.services) ? site.services : [];
        if (typeof index !== 'number' || index < 0 || index >= currentServices.length) {
          return NextResponse.json({ error: 'Invalid service index' }, { status: 400 });
        }
        updates.services = currentServices.filter((_: any, i: number) => i !== index);
        break;
      }
      case 'propose_update_social': {
        const { platform, url } = tool_input;
        if (!ALLOWED_SOCIAL.has(platform) || typeof url !== 'string') {
          return NextResponse.json({ error: 'Invalid platform or url' }, { status: 400 });
        }
        const currentSocial =
          site.social_links && typeof site.social_links === 'object' ? site.social_links : {};
        updates.social_links = { ...currentSocial, [platform]: url };
        break;
      }
      case 'propose_contact_update': {
        const { field, value } = tool_input;
        if (!ALLOWED_CONTACT_FIELDS.has(field) || typeof value !== 'string') {
          return NextResponse.json({ error: 'Invalid contact field/value' }, { status: 400 });
        }
        const currentContact = site.contact && typeof site.contact === 'object' ? site.contact : {};
        updates.contact = { ...currentContact, [field]: value };
        if (field === 'address') updates.address = value;
        break;
      }
      case 'propose_service_update': {
        const { index, field, value } = tool_input;
        const services = Array.isArray(site.services) ? site.services : [];
        if (typeof index !== 'number' || index < 0 || index >= services.length) {
          return NextResponse.json({ error: 'Invalid service index' }, { status: 400 });
        }
        if (!ALLOWED_SERVICE_FIELDS.has(field) || typeof value !== 'string') {
          return NextResponse.json({ error: 'Invalid service field/value' }, { status: 400 });
        }
        const next = services.map((s: any, i: number) => (i === index ? { ...s, [field]: value } : s));
        updates.services = next;
        break;
      }
      case 'propose_testimonial_add': {
        const { name, role, content, rating } = tool_input;
        if (typeof name !== 'string' || typeof content !== 'string') {
          return NextResponse.json({ error: 'Invalid testimonial' }, { status: 400 });
        }
        const r = typeof rating === 'number' && rating >= 1 && rating <= 5 ? Math.round(rating) : 5;
        const current = Array.isArray(site.testimonials) ? site.testimonials : [];
        updates.testimonials = [...current, { name, role: typeof role === 'string' ? role : '', content, rating: r }];
        break;
      }
      case 'propose_testimonial_remove': {
        const { index } = tool_input;
        const current = Array.isArray(site.testimonials) ? site.testimonials : [];
        if (typeof index !== 'number' || index < 0 || index >= current.length) {
          return NextResponse.json({ error: 'Invalid testimonial index' }, { status: 400 });
        }
        updates.testimonials = current.filter((_: any, i: number) => i !== index);
        break;
      }
      case 'propose_testimonial_update': {
        const { index, field, value } = tool_input;
        const current = Array.isArray(site.testimonials) ? site.testimonials : [];
        if (typeof index !== 'number' || index < 0 || index >= current.length) {
          return NextResponse.json({ error: 'Invalid testimonial index' }, { status: 400 });
        }
        if (!ALLOWED_TESTIMONIAL_FIELDS.has(field)) {
          return NextResponse.json({ error: 'Invalid testimonial field' }, { status: 400 });
        }
        let v: any = value;
        if (field === 'rating') {
          const n = typeof value === 'number' ? value : parseInt(value, 10);
          if (isNaN(n) || n < 1 || n > 5) {
            return NextResponse.json({ error: 'Rating must be 1-5' }, { status: 400 });
          }
          v = n;
        } else if (typeof value !== 'string') {
          return NextResponse.json({ error: 'Invalid testimonial value' }, { status: 400 });
        }
        updates.testimonials = current.map((t: any, i: number) => (i === index ? { ...t, [field]: v } : t));
        break;
      }
      case 'propose_product_add': {
        const { name, price, description } = tool_input;
        if (typeof name !== 'string' || name.trim() === '') {
          return NextResponse.json({ error: 'Product name required' }, { status: 400 });
        }
        const current = Array.isArray(site.products) ? site.products : [];
        updates.products = [
          ...current,
          {
            name,
            price: typeof price === 'string' ? price : '',
            description: typeof description === 'string' ? description : '',
          },
        ];
        break;
      }
      case 'propose_product_remove': {
        const { index } = tool_input;
        const current = Array.isArray(site.products) ? site.products : [];
        if (typeof index !== 'number' || index < 0 || index >= current.length) {
          return NextResponse.json({ error: 'Invalid product index' }, { status: 400 });
        }
        updates.products = current.filter((_: any, i: number) => i !== index);
        break;
      }
      case 'propose_product_update': {
        const { index, field, value } = tool_input;
        const current = Array.isArray(site.products) ? site.products : [];
        if (typeof index !== 'number' || index < 0 || index >= current.length) {
          return NextResponse.json({ error: 'Invalid product index' }, { status: 400 });
        }
        if (!ALLOWED_PRODUCT_FIELDS.has(field) || typeof value !== 'string') {
          return NextResponse.json({ error: 'Invalid product field/value' }, { status: 400 });
        }
        updates.products = current.map((p: any, i: number) => (i === index ? { ...p, [field]: value } : p));
        break;
      }
      case 'propose_gallery_remove': {
        const { index } = tool_input;
        const current = Array.isArray(site.gallery) ? site.gallery : [];
        if (typeof index !== 'number' || index < 0 || index >= current.length) {
          return NextResponse.json({ error: 'Invalid gallery index' }, { status: 400 });
        }
        updates.gallery = current.filter((_: any, i: number) => i !== index);
        break;
      }
      case 'propose_gallery_clear': {
        updates.gallery = [];
        break;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates produced' }, { status: 400 });
    }

    // Apply with double safety: slug AND owner_email
    const { data: updated, error: updateError } = await supabase
      .from('sites')
      .update(updates)
      .eq('slug', slug)
      .eq('owner_email', user.email)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('Agent apply error:', updateError);
      return NextResponse.json(
        { error: 'Update failed', details: updateError?.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, site: updated, applied: { tool_name, tool_input } });
  } catch (err: any) {
    console.error('Agent apply error:', err);
    return NextResponse.json(
      { error: 'Server error', details: err?.message },
      { status: 500 }
    );
  }
}
