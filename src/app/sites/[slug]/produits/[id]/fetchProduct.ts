import { supabase } from '@/lib/supabase'
import { sitePricing, resolveDisplayPrice } from '@/lib/pricing'
import { usesCatalogSelections } from '@/lib/dropship/catalogAdmission'

export type ProductPage = {
  id: string
  name: string
  description: string
  priceNumber: number
  currency: string
  images: string[]
  inStock: boolean
  /**
   * DETTE 6c — ACHETABILITE, distincte de `inStock` et de `published`.
   *   `published` decide si cette page EXISTE (filtre de la requete) ;
   *   `inStock`   decide s'il en reste ;
   *   `forSale`   decide si le marchand accepte de le vendre.
   * Les produits de catalogue fournisseur n'ont pas cette notion : ils valent
   * `true`, comme avant cette dette.
   */
  forSale: boolean
  siteName: string
  siteSlug: string
  siteCustomDomain: string | null
  primary: string
  theme: string
  lang: string
  mode: number
  shippingFlat: number | null
}

export async function fetchProduct(slug: string, rawId: string): Promise<ProductPage | null> {
  // LOT 1 : sites_public (published=true AND archived_at IS NULL déjà
  // appliqué par la vue -- corrige au passage l'absence de vérification
  // archived_at qui existait ici). `published` retiré du select : toujours
  // vrai par construction de la vue, jamais lu par le reste de la fonction.
  const { data: site } = await supabase
    .from('sites_public')
    .select('id, name, slug, mode, custom_domain, dropship_type, product_families, cj_margin_percent, cj_round_mode, primary_color, theme, lang, shipping_flat')
    .eq('slug', slug)
    .maybeSingle()
  if (!site) return null

  if (rawId.startsWith('catalog-')) {
    // ============================================================
    // LOT 2 -- DEUX DEFAUTS SUR LA MEME BRANCHE, TRAITES ENSEMBLE.
    //
    // 1. AUCUNE ADMISSION. Cette branche selectionnait `dropship_type` et ne
    //    le lisait JAMAIS. Sa seule porte etait la DONNEE -- l'existence
    //    d'une selection approuvee -- jamais une REGLE. Un `pod_brand`, admis
    //    a tort par `POST /catalog/selections` avant ce lot, obtenait donc
    //    une fiche produit publique pour un produit que sa propre vitrine
    //    refuse d'afficher.
    //
    //    SURFACE VISITEUR : la garde correcte n'est PAS une garde de
    //    propriete -- cette page doit rester publique -- mais l'admission au
    //    mecanisme qui produit ces fiches. Meme regle que les cinq routes
    //    catalogue, meme autorite.
    //
    //    CONSEQUENCE POUR `pod_brand`, ASSUMEE ET CONSIGNEE : ses produits
    //    (issus de `pod_designs`) n'ont pas de fiche produit. C'etait deja le
    //    cas AVANT ce lot -- mais par accident de parsing (voir 2), pas par
    //    decision. Ce refus devient une regle explicite. SAVOIR SI UN
    //    `pod_brand` DOIT AVOIR DES FICHES PRODUIT EST UNE DECISION DE
    //    SOUS-MODE : elle appartient au LOT 3, pas ici.
    //
    // 2. UN PARSING DIVERGENT. Cinq couches decodent l'id panier de la meme
    //    facon -- `checkout`, `resolveShipping`, `pod-fulfill`, `cj/fulfill`
    //    et `ProductModal` font toutes `replace(/^catalog-/,'').split('::')`.
    //    Celle-ci faisait un `slice()` brut : un id porteur d'une variante
    //    (`catalog-<uuid>::<variantId>`) produisait `<uuid>::<variantId>`,
    //    valeur qui n'est pas un uuid et ne correspond a aucune ligne. La
    //    variante est un detail d'ACHAT ; la fiche produit decrit le produit.
    // ============================================================
    if (!usesCatalogSelections((site as any).mode, (site as any).dropship_type)) return null
    const catalogProductId = rawId.replace(/^catalog-/, '').split('::')[0]
    const { data: sel } = await supabase
      .from('site_catalog_selections')
      .select('sell_price, custom_name, custom_description, catalog_product_id, catalog_products(name, description, price, currency, images, in_stock)')
      .eq('site_id', (site as any).id)
      .eq('catalog_product_id', catalogProductId)
      .eq('merchant_approved', true)
      .maybeSingle()
    if (!sel || !(sel as any).catalog_products) return null
    const cp = (sel as any).catalog_products
    const { margin, roundMode } = sitePricing(site as any)
    const cost = cp.price ? Number(cp.price) : 0
    const pr = resolveDisplayPrice(cost, (sel as any).sell_price, margin, roundMode)
    return {
      id: rawId,
      name: (sel as any).custom_name || cp.name,
      description: (sel as any).custom_description || cp.description || '',
      priceNumber: pr,
      currency: cp.currency || 'CAD',
      images: Array.isArray(cp.images) ? cp.images : [],
      inStock: cp.in_stock !== false,
      // Catalogue fournisseur : `for_sale` n'existe pas sur `catalog_products`.
      // Comportement rigoureusement inchange par la dette 6c.
      forSale: true,
      siteName: (site as any).name,
      siteSlug: (site as any).slug,
      siteCustomDomain: (site as any).custom_domain ?? null,
      primary: (site as any).primary_color || '#111111',
      theme: (site as any).theme || 'editorial',
      lang: (site as any).lang || 'fr',
      mode: (site as any).mode,
      shippingFlat: (site as any).shipping_flat ?? null,
    }
  }

  const { data: p } = await supabase
    .from('shop_products')
    .select('id, site_id, name, description, price, currency, images, stock, published, for_sale')
    .eq('id', rawId)
    .eq('site_id', (site as any).id)
    .eq('published', true)
    .maybeSingle()
  if (!p) return null
  return {
    id: (p as any).id,
    name: (p as any).name,
    description: (p as any).description || '',
    priceNumber: (p as any).price != null ? Number((p as any).price) : 0,
    currency: (p as any).currency || 'CAD',
    images: Array.isArray((p as any).images) ? (p as any).images : [],
    inStock: ((p as any).stock ?? 0) > 0,
    // `!== false` : meme raisonnement que la vitrine (shared.tsx). La barriere
    // stricte est au checkout, pas ici -- cette page ne fait qu'afficher.
    // `published` reste filtre par la requete : un produit non publie n'a
    // toujours pas de page, quelle que soit son achetabilite.
    forSale: (p as any).for_sale !== false,
    siteName: (site as any).name,
    siteSlug: (site as any).slug,
    siteCustomDomain: (site as any).custom_domain ?? null,
    primary: (site as any).primary_color || '#111111',
    theme: (site as any).theme || 'editorial',
    lang: (site as any).lang || 'fr',
    mode: (site as any).mode,
    shippingFlat: (site as any).shipping_flat ?? null,
  }
}
