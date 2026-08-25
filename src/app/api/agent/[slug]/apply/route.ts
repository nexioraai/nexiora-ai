import { NextResponse } from 'next/server';
import { isSupportedLanguage, SUPPORTED_LANGUAGE_CODES } from '@/lib/i18n/supportedLanguages';
import { MIN_MARGIN_PERCENT } from '@/lib/pricing';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import {
  resolveSectionItem,
  resolveTargetSection,
  sectionItemMessage,
} from '@/lib/agent-tools/sectionItemResolution';
import { resolveProductByName, resolutionMessage } from '@/lib/agent-tools/productResolution';
import { resolveGalleryImage, galleryResolutionMessage } from '@/lib/agent-tools/galleryResolution';

/**
 * Ce que `/apply` lit reellement d'un produit de `shop_products` : son
 * identifiant, pour cibler la route metier, et son nom, pour la resolution.
 * `res.json()` rend `any` ; sans ce type l'inference generique retomberait sur
 * le minimum structurel et perdrait `id`.
 */
type ResolvableShopProduct = { id: string; name?: string | null };

/** Un produit du catalogue Mode 1 (`sites.products`, jsonb). Aucun identifiant. */
type JsonbProduct = { name?: string | null; price?: string; description?: string };

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
  'catalog_curate',
  'catalog_enhance',
  'catalog_approve_all',
  'catalog_set_margin',
  'create_promo_code',
  'deactivate_promo_code',
  // ETAPE 7 du chantier catalogue canonique. Seul outil IA de la politique
  // d'inventaire : il DECLARE un comptage, il ne modifie aucun autre champ.
  'count_product_stock',
  // ETAPE 8, VOLET D. Trois champs produit, un outil chacun -- et non un
  // `set_product_field(field, value)` generique : un outil parametre par un
  // nom de champ deplacerait l'allowlist depuis le code vers le modele, et
  // rien ne distinguerait plus une demande legitime d'une demande inventee.
  'set_price',
  'set_currency',
  'set_for_sale',
]);

const ALLOWED_FIELDS = new Set([
  // CHANTIER 3 -- `lang` ajoute. Il est borne par `isSupportedLanguage` dans
  // le `case` correspondant, JAMAIS par cette seule appartenance.
  'lang',
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

const ALLOWED_THEMES = new Set(['editorial', 'noir', 'vif']);
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

    const { slug } = await params;

    // ============================================================
    // DETTE 6a -- `owner_id` EST L'IDENTITE CANONIQUE, PAS `owner_email`.
    //
    // LE DEFAUT CORRIGE, ET CE N'ETAIT PAS UNE SIMPLE INCOHERENCE.
    // Cette garde filtrait sur `.eq('owner_email', user.email)`. Or
    // `sites.owner_email` est ecrite UNE SEULE FOIS, a la creation du site, et
    // n'est JAMAIS mise a jour ensuite -- recherche exhaustive : aucun
    // `update` sur cette colonne dans tout le depot.
    //
    // Consequence mesurable : si B change son adresse, `sites.owner_email`
    // garde l'ancienne. Qu'un tiers s'inscrive ensuite avec cette adresse
    // liberee, et son `user.email` apparie la ligne de B -- il LISAIT et
    // MODIFIAIT le site de B. Ce n'est pas une faille d'implementation, c'est
    // l'usage d'un identifiant INSTABLE comme cle d'identite.
    //
    // `requireSiteOwner` (primitive canonique M2-02, deja utilisee par 18
    // autres appels) compare `owner_id` en priorite -- identite stable,
    // insensible a tout changement d'adresse -- et ne se replie sur
    // `owner_email` que si `owner_id` est encore null. Mesure du 2026-08-21 :
    // 0 site sur 14 dans ce cas, le repli ne s'exerce plus en pratique.
    //
    // Le miroir etait vrai aussi : un proprietaire ayant change d'adresse
    // perdait l'acces a SON site par ces deux routes, alors que les six
    // autres continuaient de le reconnaitre.
    // ============================================================
    const auth = await requireSiteOwner(req, slug, '*');
    if (!auth.ok) return auth.response;
    const site = auth.site as any;

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
        // CHANTIER 3 -- LA BORNE REELLE DE `lang`, ET LE SEUL ENDROIT OU ELLE
        // TIENNE. Les six autres champs de `ALLOWED_FIELDS` acceptent du
        // texte libre : `lang` est le premier a n'accepter qu'un enum. Sans
        // ce test, `ALLOWED_FIELDS.has('lang')` suffisait a ecrire
        // `lang: 'english'` ou `lang: 'de'` -- valeurs qu'aucun dictionnaire
        // ne sert, et qui rendraient le site en anglais de repli sans que
        // rien ne le signale. Le refus precede toute ecriture.
        if (field === 'lang' && !isSupportedLanguage(value)) {
          return NextResponse.json(
            { error: `Unsupported language "${value}". Supported: ${SUPPORTED_LANGUAGE_CODES.join(', ')}` },
            { status: 400 }
          );
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
      // ===== CHANTIER 1 -- LES TROIS OUTILS ECRIVENT DESORMAIS `sections` =====
      //
      // Ils ecrivaient `site.services`, colonne qu'AUCUN theme ne rend et que
      // le generateur ne produit pas. L'ecriture reussissait, le site ne
      // changeait jamais. Ils visent la source canonique, et adressent par
      // TITRE -- l'adressage par index qui subsistait ici etait la troisieme
      // liste que la dette 4 n'avait pas atteinte.
      case 'propose_add_service': {
        const { title, description, section } = tool_input;
        if (typeof title !== 'string' || title.trim() === '' || typeof description !== 'string') {
          return NextResponse.json({ error: 'Invalid title/description' }, { status: 400 });
        }
        const sections: any[] = Array.isArray(site.sections) ? site.sections : [];
        const cible = resolveTargetSection(sections, section);
        if (!cible.ok) {
          // AUCUN REPLI. Zero ou plusieurs sections sans nom fourni : on
          // demande, on ne devine pas.
          return NextResponse.json(
            { error: sectionItemMessage(cible) },
            { status: cible.reason === 'not_found' ? 404 : 409 }
          );
        }
        updates.sections = sections.map((sec: any, i: number) =>
          i === cible.sectionIndex
            ? { ...sec, items: [...(Array.isArray(sec.items) ? sec.items : []), { title, description }] }
            : sec
        );
        break;
      }
      case 'propose_remove_service': {
        const { title } = tool_input;
        const sections: any[] = Array.isArray(site.sections) ? site.sections : [];
        const trouve = resolveSectionItem(sections, title);
        if (!trouve.ok) {
          // AUCUNE ECRITURE. 404 = introuvable, 409 = plusieurs offres portent
          // ce titre -- supprimer « la premiere » serait le defaut d'origine.
          return NextResponse.json(
            { error: sectionItemMessage(trouve) },
            { status: trouve.reason === 'not_found' ? 404 : 409 }
          );
        }
        updates.sections = sections.map((sec: any, i: number) =>
          i === trouve.sectionIndex
            ? { ...sec, items: (sec.items as any[]).filter((_: any, j: number) => j !== trouve.itemIndex) }
            : sec
        );
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
        const { title, field, value } = tool_input;
        if (!ALLOWED_SERVICE_FIELDS.has(field) || typeof value !== 'string') {
          return NextResponse.json({ error: 'Invalid service field/value' }, { status: 400 });
        }
        const sections: any[] = Array.isArray(site.sections) ? site.sections : [];
        const trouve = resolveSectionItem(sections, title);
        if (!trouve.ok) {
          return NextResponse.json(
            { error: sectionItemMessage(trouve) },
            { status: trouve.reason === 'not_found' ? 404 : 409 }
          );
        }
        updates.sections = sections.map((sec: any, i: number) =>
          i === trouve.sectionIndex
            ? {
                ...sec,
                items: (sec.items as any[]).map((it: any, j: number) =>
                  j === trouve.itemIndex ? { ...it, [field]: value } : it
                ),
              }
            : sec
        );
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
      // ===== ETAPE 8, VOLET B -- CATALOGUE MODE 1, CIBLAGE PAR NOM =====
      //
      // LE DEFAUT CORRIGE. Ces deux outils adressaient par INDEX de tableau,
      // alors que `products` est ABSENT de CURRENT SITE STATE (16 champs, 0
      // occurrence). Le modele n'avait donc aucun moyen de connaitre un index
      // valide : toute valeur qu'il produisait etait DEVINEE. Et une devinette
      // dans les bornes etait ACCEPTEE -- la seule validation portait sur
      // l'intervalle, jamais sur l'identite de la cible. Un `index: 2`
      // hallucine supprimait le troisieme produit, sans erreur.
      //
      // Le garde-fou humain ne compensait rien : la carte d'approbation
      // affichait « Remove product #2 », sans nom. Le marchand approuvait un
      // jeton opaque qu'il ne pouvait pas verifier.
      //
      // MEME REGLE QUE PARTOUT AILLEURS. `resolveProductByName` est le helper
      // partage des etapes 7 et 8D, elargi au minimum structurel qu'il lit
      // (`{ name }`) : egalite stricte apres trim + minuscules, aucune
      // sous-chaine, aucun accent replie, et REFUS sur ambiguite. Ecrire une
      // seconde resolution ici aurait duplique la regle.
      //
      // LE CATALOGUE M1 RESTE `sites.products`. Aucune migration vers
      // `shop_products` : trois gardes independantes l'interdisent a une
      // vitrine (canTransact sur POST, requireProductOwner sur PATCH/DELETE,
      // ProductManager monte pour les seuls modes 2 et 3).
      case 'propose_product_remove': {
        const { product_name } = tool_input;
        const current: JsonbProduct[] = Array.isArray(site.products) ? site.products : [];
        const resolved = resolveProductByName(current, product_name);
        if (!resolved.ok) {
          // AUCUNE ECRITURE. 404 = introuvable, 409 = ambigu.
          return NextResponse.json(
            { error: resolutionMessage(resolved) },
            { status: resolved.reason === 'not_found' ? 404 : 409 }
          );
        }
        const position = current.indexOf(resolved.product);
        if (position < 0) {
          // Inatteignable par construction -- `resolved.product` vient d'un
          // `filter` sur ce meme tableau, donc la reference y est. Le controle
          // existe parce que l'alternative serait pire que bruyante : un -1
          // ferait de `filter((_, i) => i !== -1)` une suppression qui ne
          // supprime rien, en repondant « fait ».
          return NextResponse.json({ error: 'Resolution incoherente' }, { status: 500 });
        }
        updates.products = current.filter((_: unknown, i: number) => i !== position);
        break;
      }
      case 'propose_product_update': {
        const { product_name, field, value } = tool_input;
        if (!ALLOWED_PRODUCT_FIELDS.has(field) || typeof value !== 'string') {
          return NextResponse.json({ error: 'Invalid product field/value' }, { status: 400 });
        }
        const current: JsonbProduct[] = Array.isArray(site.products) ? site.products : [];
        const resolved = resolveProductByName(current, product_name);
        if (!resolved.ok) {
          return NextResponse.json(
            { error: resolutionMessage(resolved) },
            { status: resolved.reason === 'not_found' ? 404 : 409 }
          );
        }
        const position = current.indexOf(resolved.product);
        if (position < 0) {
          return NextResponse.json({ error: 'Resolution incoherente' }, { status: 500 });
        }
        updates.products = current.map((p: JsonbProduct, i: number) => (i === position ? { ...p, [field]: value } : p));
        break;
      }
      // ===== DETTE 4 (volet gallery) -- CIBLAGE PAR URL =====
      //
      // Meme correction que le volet B pour les produits Mode 1, meme raison :
      // `gallery` est ABSENT de CURRENT SITE STATE, donc tout index fourni par
      // le modele etait devine, et une devinette dans les bornes etait
      // ACCEPTEE -- la seule validation portait sur l'intervalle, jamais sur
      // l'identite de la cible. La carte d'approbation affichait « Remove
      // gallery image #2 », un numero nu : le marchand ne pouvait pas verifier
      // ce qu'il approuvait, la ou l'editeur lui montre l'image elle-meme.
      //
      // DEUX FORMES D'ELEMENT sont adressables, `string` et `{ url }` -- la
      // seconde parce que le schema Zod l'autorise, que `Navbar.tsx` la
      // reconnait deja, et que `gallerySchema.test.ts` documente un incident
      // reel ou le modele en a produit. Toute autre forme est NON ADRESSABLE :
      // on ne devine pas une URL dans un objet de convention inconnue.
      case 'propose_gallery_remove': {
        const { image_url } = tool_input;
        const current = Array.isArray(site.gallery) ? site.gallery : [];
        const resolved = resolveGalleryImage(current, image_url);
        if (!resolved.ok) {
          // AUCUNE ECRITURE. 404 = introuvable, 409 = ambigu.
          return NextResponse.json(
            { error: galleryResolutionMessage(resolved) },
            { status: resolved.reason === 'not_found' ? 404 : 409 }
          );
        }
        updates.gallery = current.filter((_: unknown, i: number) => i !== resolved.index);
        break;
      }
      case 'propose_gallery_clear': {
        updates.gallery = [];
        break;
      }
    }

    // ===== Catalog tools (don't use updates, call APIs directly) =====
    if (tool_name === 'catalog_curate') {
      const res = await fetch(new URL('/api/catalog/curate', req.url).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (data.error) return NextResponse.json({ error: data.error }, { status: 500 });
      // Auto-enhance after curate
      await fetch(new URL('/api/catalog/enhance', req.url).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ slug }),
      });
      return NextResponse.json({ success: true, message: `${data.count} produits suggérés et optimisés` });
    }

    if (tool_name === 'catalog_enhance') {
      const res = await fetch(new URL('/api/catalog/enhance', req.url).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      return NextResponse.json({ success: true, message: `${data.enhanced || 0} titres optimisés` });
    }

    if (tool_name === 'catalog_approve_all') {
      const { error: approveErr } = await supabase
        .from('site_catalog_selections')
        .update({ merchant_approved: true })
        .eq('site_id', site.id)
        .eq('merchant_approved', false);
      if (approveErr) return NextResponse.json({ error: approveErr.message }, { status: 500 });
      return NextResponse.json({ success: true, message: 'Tous les produits approuvés' });
    }

    if (tool_name === 'catalog_set_margin') {
      const { margin_percent } = tool_input;
      const margin = Number(margin_percent);
      if (isNaN(margin) || margin < MIN_MARGIN_PERCENT) {
        return NextResponse.json({ error: `Marge invalide : minimum ${MIN_MARGIN_PERCENT}% pour couvrir la commission Deribfy, les remboursements et les litiges.` }, { status: 400 });
      }
      // La marge du site est la source de verite. Les prix sont calcules a l'affichage
      // par resolveDisplayPrice(). Ne jamais ecrire dans sell_price ici : ce champ est
      // reserve aux prix fixes manuellement par le marchand, produit par produit.
      const { data: updatedSite, error: mErr } = await supabase
        .from('sites')
        .update({ cj_margin_percent: margin })
        .eq('id', site.id)
        .select()
        .single();
      if (mErr) {
        return NextResponse.json({ error: mErr.message }, { status: 500 });
      }
      // Renvoie le site pour que l'editeur se rafraichisse sans rechargement manuel
      return NextResponse.json({
        success: true,
        site: updatedSite,
        message: `Marge fixee a ${margin}%. Les prix du catalogue sont recalcules automatiquement, sauf ceux que tu as fixes manuellement.`,
      });
    }

    if (tool_name === 'deactivate_promo_code') {
      const { code } = tool_input;
      if (!code) return NextResponse.json({ error: 'code requis' }, { status: 400 });
      const { error: deactErr } = await supabase
        .from('promo_codes')
        .update({ active: false })
        .eq('site_id', site.id)
        .ilike('code', code.trim());
      if (deactErr) return NextResponse.json({ error: deactErr.message }, { status: 500 });
      return NextResponse.json({ success: true, message: `Code "${code}" désactivé` });
    }

    // ===== ETAPE 7 -- politique d'inventaire (patron A : re-appel HTTP) =====
    //
    // POURQUOI CE DETOUR PAR LA ROUTE METIER PLUTOT QU'UN `supabase.update()`
    // INLINE ICI. `/apply` verifie la propriete du SITE via `owner_email`
    // seul ; la route d'inventaire, elle, passe par `requireProductOwner`
    // (propriete par `owner_id` prioritaire + admission `canTransact`). Ecrire
    // directement ici contournerait donc l'admission Mode 1 et la barriere de
    // comptage, et ferait de l'agent une seconde autorite sur l'inventaire.
    // Meme patron que `catalog_curate` : le jeton du marchand est relaye, la
    // route metier reste le seul point de decision.
    if (tool_name === 'count_product_stock') {
      const { product_name, units } = tool_input;

      if (!Number.isInteger(units) || units < 0) {
        return NextResponse.json(
          { error: 'units doit etre un entier superieur ou egal a 0' },
          { status: 400 }
        );
      }

      // Lecture par la route GET EXISTANTE, gardee par `requireSiteOwner` : la
      // liste rendue ne peut donc contenir que des produits de CE site, et le
      // modele n'a aucun moyen d'en atteindre un autre -- meme en fournissant
      // le nom exact d'un produit appartenant a quelqu'un d'autre.
      const listRes = await fetch(
        new URL(`/api/shop/products?slug=${encodeURIComponent(slug)}`, req.url).toString(),
        { headers: { 'Authorization': 'Bearer ' + token } }
      );
      const listData = await listRes.json().catch(() => ({}));
      if (!listRes.ok) {
        return NextResponse.json({ error: listData.error || 'Lecture des produits impossible' }, { status: listRes.status });
      }

      const resolved = resolveProductByName<ResolvableShopProduct>(listData.products ?? [], product_name);
      if (!resolved.ok) {
        // AUCUNE ECRITURE. Le message part au modele comme resultat d'outil ;
        // il redemande le nom exact au marchand. 404 = introuvable,
        // 409 = ambigu (refus metier), conformement aux codes deja en usage.
        return NextResponse.json(
          { error: resolutionMessage(resolved) },
          { status: resolved.reason === 'not_found' ? 404 : 409 }
        );
      }

      const invRes = await fetch(
        new URL(`/api/shop/products/${resolved.product.id}/inventory`, req.url).toString(),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ units }),
        }
      );
      const invData = await invRes.json().catch(() => ({}));
      if (!invRes.ok) {
        // Le code et le message de la route metier sont relayes tels quels :
        // les reinterpreter ici recreerait la seconde autorite qu'on evite.
        return NextResponse.json({ error: invData.error || 'Comptage refuse' }, { status: invRes.status });
      }

      return NextResponse.json({
        success: true,
        message: `Stock de "${resolved.product.name}" compte a ${units} unite(s). Le suivi de stock est actif pour ce produit.`,
      });
    }

    // ===== ETAPE 8, VOLET D -- champs produit par nom (patron A) =====
    //
    // MEME MECANIQUE QUE L'ETAPE 7, ET AUCUNE ROUTE NOUVELLE. `price`,
    // `currency` et `for_sale` sont deja dans l'allowlist de
    // `PATCH /api/shop/products/[id]` : la route metier existe, elle est
    // gardee par requireProductOwner (propriete par owner_id prioritaire +
    // admission canTransact), et lui ajouter une soeur dediee ne ferait que
    // dupliquer une garde.
    //
    // POURQUOI UN SEUL BLOC POUR TROIS OUTILS. La difference entre eux tient
    // en une ligne : le champ ecrit et sa validation. Tout le reste -- lire
    // la liste possedee, resoudre le nom, refuser toute ambiguite, relayer le
    // code de la route metier -- est identique. Le tripler inviterait la
    // divergence, exactement ce que requireProductOwner a servi a defaire.
    if (tool_name === 'set_price' || tool_name === 'set_currency' || tool_name === 'set_for_sale') {
      const { product_name } = tool_input;
      const patch: Record<string, unknown> = {};
      let libelle = '';

      if (tool_name === 'set_price') {
        const { price } = tool_input;
        // FAIL-CLOSED : ni coercition, ni `Number(...)` complaisant. `'25'`,
        // `null`, `NaN`, `Infinity` et les negatifs sont refuses. `0` reste
        // legal -- un produit gratuit existe (ProductManager accepte deja 0).
        if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
          return NextResponse.json({ error: 'price doit etre un nombre superieur ou egal a 0' }, { status: 400 });
        }
        patch.price = price;
        libelle = `prix fixe a ${price}`;
      }

      if (tool_name === 'set_currency') {
        const { currency } = tool_input;
        // Forme ISO 4217 uniquement -- PAS une liste blanche de devises : ce
        // depot n'en a aucune, et en inventer une ici deciderait a la place
        // du produit quelles monnaies existent.
        if (typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency.trim())) {
          return NextResponse.json({ error: 'currency doit etre un code a 3 lettres (EUR, USD, CAD...)' }, { status: 400 });
        }
        // MAJUSCULES, comme ProductManager. Ce n'est pas cosmetique : le
        // checkout compare les devises du panier en egalite STRICTE de chaine
        // (`i.currency !== resolvedCurrency` -> 409 « Panier incoherent »).
        // Ecrire 'cad' a cote d'un 'CAD' pose par l'interface rendrait le
        // panier invendable sans qu'aucun champ paraisse faux.
        patch.currency = currency.trim().toUpperCase();
        libelle = `devise fixee a ${patch.currency}`;
      }

      if (tool_name === 'set_for_sale') {
        const { for_sale } = tool_input;
        if (typeof for_sale !== 'boolean') {
          return NextResponse.json({ error: 'for_sale doit etre un booleen' }, { status: 400 });
        }
        patch.for_sale = for_sale;
        libelle = for_sale
          ? 'remis en vente (il reste visible, et redevient payable)'
          : 'retire de la vente (il reste VISIBLE sur la vitrine, mais n\'est plus payable)';
      }

      // Lecture par la route GET EXISTANTE, gardee par `requireSiteOwner` :
      // la liste rendue ne contient que des produits de CE site, et elle ne
      // contient QUE `shop_products` -- les produits de catalogue fournisseur
      // (ids prefixes `catalog-`) n'y figurent pas et sont donc hors
      // d'atteinte de ces outils, par construction.
      const listRes = await fetch(
        new URL(`/api/shop/products?slug=${encodeURIComponent(slug)}`, req.url).toString(),
        { headers: { 'Authorization': 'Bearer ' + token } }
      );
      const listData = await listRes.json().catch(() => ({}));
      if (!listRes.ok) {
        return NextResponse.json({ error: listData.error || 'Lecture des produits impossible' }, { status: listRes.status });
      }

      const resolved = resolveProductByName<ResolvableShopProduct>(listData.products ?? [], product_name);
      if (!resolved.ok) {
        // AUCUNE ECRITURE. 404 = introuvable, 409 = ambigu.
        return NextResponse.json(
          { error: resolutionMessage(resolved) },
          { status: resolved.reason === 'not_found' ? 404 : 409 }
        );
      }

      const patchRes = await fetch(
        new URL(`/api/shop/products/${resolved.product.id}`, req.url).toString(),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify(patch),
        }
      );
      const patchData = await patchRes.json().catch(() => ({}));
      if (!patchRes.ok) {
        // Code et message relayes tels quels : les reinterpreter ici
        // recreerait la seconde autorite qu'on evite.
        return NextResponse.json({ error: patchData.error || 'Modification refusee' }, { status: patchRes.status });
      }

      return NextResponse.json({
        success: true,
        message: `"${resolved.product.name}" : ${libelle}.`,
      });
    }

    if (tool_name === 'create_promo_code') {
      const { code, discount_type, discount_value, min_order, max_uses } = tool_input;
      if (!code || !discount_type || !discount_value) {
        return NextResponse.json({ error: 'code, discount_type et discount_value requis' }, { status: 400 });
      }
      // Passe de cloture (P-6) -- bornes explicites a la CREATION : rien
      // n'empechait jusqu'ici un agent IA (ou un appel direct) de creer une
      // remise a 500 %, negative, ou d'un type arbitraire (tout type inconnu
      // etait auparavant traite par defaut comme un montant fixe cote
      // validation). Defense en profondeur : ces memes bornes sont revalidees
      // a la consommation dans checkout/route.ts, car des lignes anterieures
      // a ce correctif peuvent deja exister en base.
      const dvNum = Number(discount_value);
      if (discount_type !== 'percent' && discount_type !== 'fixed') {
        return NextResponse.json({ error: "discount_type doit valoir 'percent' ou 'fixed'" }, { status: 400 });
      }
      if (!Number.isFinite(dvNum) || dvNum <= 0) {
        return NextResponse.json({ error: 'discount_value doit etre un nombre strictement positif' }, { status: 400 });
      }
      if (discount_type === 'percent' && dvNum > 100) {
        return NextResponse.json({ error: 'Une remise en pourcentage ne peut pas depasser 100 %' }, { status: 400 });
      }
      const minOrderNum = Number(min_order) || 0;
      if (minOrderNum < 0) {
        return NextResponse.json({ error: 'min_order ne peut pas etre negatif' }, { status: 400 });
      }
      const maxUsesNum = max_uses == null ? null : Number(max_uses);
      if (maxUsesNum !== null && (!Number.isInteger(maxUsesNum) || maxUsesNum < 1)) {
        return NextResponse.json({ error: 'max_uses doit etre un entier >= 1' }, { status: 400 });
      }
      const { error: promoErr } = await supabase
        .from('promo_codes')
        .insert({
          site_id: site.id,
          code: code.toUpperCase().trim(),
          discount_type,
          discount_value: dvNum,
          min_order: minOrderNum,
          max_uses: maxUsesNum,
          active: true,
        });
      if (promoErr) return NextResponse.json({ error: promoErr.message }, { status: 500 });
      const label = discount_type === 'percent' ? `${discount_value}%` : `${discount_value}$`;
      return NextResponse.json({ success: true, message: `Code promo "${code}" créé : -${label}` });
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates produced' }, { status: 400 });
    }

    // DETTE 6a -- l'ecriture cible l'ID de la ligne DEJA VERIFIEE, plus
    // `owner_email`. Le « double safety » d'origine reposait sur la meme cle
    // instable que la lecture : il rejouait le defaut au lieu de le couvrir.
    //
    // POURQUOI `id` ET NON `.eq('owner_id', ...)`. `requireSiteOwner` autorise
    // encore un repli sur `owner_email` quand `owner_id` est null. Filtrer sur
    // `owner_id` ici casserait ce cas : PostgREST traduit `.eq(col, null)` en
    // `col=eq.null`, qui n'apparie AUCUNE ligne NULL. Ancrer sur l'`id` de la
    // ligne dont la propriete vient d'etre etablie porte la meme garantie sans
    // ce piege.
    const { data: updated, error: updateError } = await supabase
      .from('sites')
      .update(updates)
      .eq('id', site.id)
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
