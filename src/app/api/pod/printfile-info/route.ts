import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { usesCatalogSelections } from '@/lib/dropship/catalogAdmission';
import { suppliersForDropshipType, type DropshipType } from '@/lib/dropship/suppliers';
import { consommerJeton } from '@/lib/rate-limit/rateLimit';

export const maxDuration = 30;

// Templates never change for a given product — cache in module scope
const cache = new Map<string, any>();

async function pfFetch(path: string): Promise<any> {
  const token = process.env.PRINTFUL_API_TOKEN || '';
  const storeId = process.env.PRINTFUL_STORE_ID || '';
  const res = await fetch(`https://api.printful.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(storeId ? { 'X-PF-Store-Id': storeId } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Printful ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()).result;
}

type Side = 'front' | 'back' | 'sleeve_left' | 'sleeve_right';

// Side order shown to the visitor
const SIDE_ORDER: Side[] = ['front', 'back', 'sleeve_left', 'sleeve_right'];

// Declarative classification. First match wins. `prefer` breaks ties between
// placements of the SAME side only — never across sides.
const RULES: { match: RegExp; side: Side | null; prefer: number }[] = [
  { match: /label/i, side: null, prefer: 0 },                                  // not for visitors
  { match: /back/i, side: 'back', prefer: 1 },
  { match: /sleeve_left|wrist_left/i, side: 'sleeve_left', prefer: 1 },
  { match: /sleeve_right|wrist_right/i, side: 'sleeve_right', prefer: 1 },
  { match: /chest_left|chest_right/i, side: 'front', prefer: 2 },              // small corner logo
  { match: /front|chest|default/i, side: 'front', prefer: 1 },                 // main front area
];

function classify(p: string): { side: Side; prefer: number } | null {
  for (const r of RULES) {
    if (!r.match.test(p)) continue;
    return r.side ? { side: r.side, prefer: r.prefer } : null;
  }
  return { side: 'front', prefer: 3 }; // unknown but printable
}

/** GET /api/pod/printfile-info?variant_id=Y[&product_id=X]
 *  Returns, for every printable side, the official Printful template image and
 *  the exact print area on it (as fractions), so the canvas never guesses. */
// ============================================================
// LOT 6 / P5-05 -- ROUTE JUMELLE DE `catalog/variants`, MEME DEFAUT.
//
// Etat d'origine : aucun slug, aucune authentification, aucune admission,
// aucune limite -- et `product_id` ACCEPTE DIRECTEMENT depuis l'URL, ce qui
// permettait d'interroger le mockup-generator de Printful AVEC NOTRE TOKEN
// pour n'importe quel produit de leur catalogue, sans meme toucher notre base.
//
// TROIS CHANGEMENTS, ET LE PREMIER EST LE PLUS IMPORTANT :
//
//   1. `product_id` N'EST PLUS ACCEPTE DEPUIS L'URL. C'etait le contournement
//      total : il court-circuitait la seule requete qui nous liait a notre
//      propre catalogue. Le parent est DESORMAIS TOUJOURS resolu depuis
//      `catalog_products`. Mesure faite avant de retirer : `DesignCanvas`,
//      unique appelant, n'envoie que `variant_id` -- aucun parcours reel ne
//      dependait de ce parametre.
//
//   2. Admission derivee de la donnee, memes autorites que la route jumelle :
//      `usesCatalogSelections` (LOT 2) puis `suppliersForDropshipType` (LOT 4)
//      restreinte a `printful`. Cette seconde question n'est pas redondante :
//      `usesCatalogSelections` admet aussi `reseller`, dont les fournisseurs
//      sont CJ -- un site reseller n'a rien a demander au POD de Printful.
//
//   3. Limite de debit par site, AVANT la depense. Le cache module-scope
//      reste consulte AVANT la limite : une consultation deja payee ne coute
//      aucun credential, la penaliser n'aurait protege personne.
//
// `requireSiteOwner` serait FAUX ici aussi : `DesignCanvas` s'affiche a un
// VISITEUR qui personnalise son produit avant achat.
// ============================================================

const PLAFOND_PAR_MINUTE = 20;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug') || '';
    const variantId = searchParams.get('variant_id');

    if (!slug || !variantId) {
      return NextResponse.json({ error: 'slug et variant_id requis' }, { status: 400 });
    }

    const { data: site, error: erreurSite } = await supabaseAdmin
      .from('sites')
      .select('id, mode, dropship_type')
      .eq('slug', slug)
      .is('archived_at', null)
      .maybeSingle();

    if (erreurSite) {
      return NextResponse.json({ error: 'Service momentanement indisponible.' }, { status: 503 });
    }
    if (!site) return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });

    if (!usesCatalogSelections(site.mode, (site as { dropship_type?: unknown }).dropship_type)) {
      return NextResponse.json({ error: 'Site sans catalogue fournisseur' }, { status: 403 });
    }
    if (!suppliersForDropshipType((site as { dropship_type?: DropshipType }).dropship_type).includes('printful')) {
      return NextResponse.json({ error: 'Fournisseur hors sous-mode de cette boutique' }, { status: 403 });
    }

    // GARDE ANTI-PROXY : le parent vient de NOTRE catalogue, jamais de l'URL.
    const { data: cp, error: erreurProduit } = await supabaseAdmin
      .from('catalog_products')
      .select('supplier_parent_id')
      .eq('supplier_id', 'printful')
      .eq('supplier_product_id', String(variantId))
      .maybeSingle();

    if (erreurProduit) {
      return NextResponse.json({ error: 'Service momentanement indisponible.' }, { status: 503 });
    }
    const productId = cp?.supplier_parent_id || null;
    if (!productId) return NextResponse.json({ error: 'Produit hors catalogue' }, { status: 404 });

    const cacheKey = `${productId}:${variantId || ''}`;
    if (cache.has(cacheKey)) return NextResponse.json(cache.get(cacheKey));

    // Limite de debit APRES le cache, AVANT le credential Printful.
    const jeton = await consommerJeton({
      type: 'pod_printfile_request',
      siteId: site.id,
      fenetreMs: 60_000,
      plafond: PLAFOND_PAR_MINUTE,
      message: 'Trop de requetes, reessayez dans une minute.',
      details: { slug, variant_id: String(variantId) },
    });
    if (!jeton.ok) return NextResponse.json({ error: jeton.erreur }, { status: jeton.statut });

    const tpl = await pfFetch(`/mockup-generator/templates/${productId}`);
    const templatesById = new Map<number, any>(
      (tpl.templates || []).map((t: any) => [t.template_id, t])
    );

    // Templates for this specific variant, falling back to the first mapping
    const mapping = (tpl.variant_mapping || []).find(
      (m: any) => String(m.variant_id) === String(variantId)
    ) || (tpl.variant_mapping || [])[0];

    if (!mapping?.templates?.length) {
      return NextResponse.json({ error: 'No template for this product' }, { status: 404 });
    }

    // Keep one placement per side: biggest print area wins, rule preference breaks ties
    const bySide = new Map<string, any>();
    for (const entry of mapping.templates) {
      const cls = classify(entry.placement || '');
      if (!cls) continue;
      const t: any = templatesById.get(entry.template_id);
      if (!t || !t.image_url || !t.template_width || !t.template_height) continue;

      const candidate = {
        placement: entry.placement,
        side: cls.side,
        prefer: cls.prefer,
        image_url: t.image_url,
        background_color: t.background_color || null,
        // Print area as fractions of the template image — exact, never guessed
        area: {
          left: t.print_area_left / t.template_width,
          top: t.print_area_top / t.template_height,
          width: t.print_area_width / t.template_width,
          height: t.print_area_height / t.template_height,
        },
        // Printfile pixel dimensions (used to build Printful coordinates)
        area_width: t.print_area_width,
        area_height: t.print_area_height,
        _size: t.print_area_width * t.print_area_height,
      };

      const existing = bySide.get(cls.side);
      const better = !existing
        || candidate._size > existing._size
        || (candidate._size === existing._size && candidate.prefer < existing.prefer);
      if (better) bySide.set(cls.side, candidate);
    }

    const placements = SIDE_ORDER
      .map(sd => bySide.get(sd))
      .filter(Boolean)
      .map(({ prefer, _size, ...rest }: any) => rest);

    if (placements.length === 0) {
      return NextResponse.json({ error: 'No compatible placement' }, { status: 404 });
    }

    const info = {
      placements,
      // backward-compatible front info
      placement: placements[0].placement,
      area_width: placements[0].area_width,
      area_height: placements[0].area_height,
    };
    cache.set(cacheKey, info);
    return NextResponse.json(info);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
