// src/app/sitemap.ts
import type { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'
import { selectionServable } from '@/lib/dropship/catalogAdmission'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.deribfy.com'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ]

  // LOT 1 : sites_public (published=true AND archived_at IS NULL déjà
  // appliqué par la vue -- corrige au passage l'absence de vérification
  // archived_at qui existait ici : un site archivé restait dans le sitemap).
  // `id` inclus en plus de `slug`/`created_at` : réutilisé plus bas pour
  // résoudre shop_products/site_catalog_selections sans dépendre d'un embed
  // PostgREST `sites!inner(...)` (voir commentaire plus bas).
  const { data, error } = await supabase
    .from('sites_public')
    // LOT 2 -- `mode` et `dropship_type` AJOUTES au select. Ils servent
    // uniquement a la branche catalogue plus bas ; les routes de sites et de
    // produits marchands sont rigoureusement inchangees.
    .select('id, slug, created_at, mode, dropship_type')

  if (error || !data) {
    return staticRoutes
  }

  const siteRoutes: MetadataRoute.Sitemap = data.map((s) => ({
    url: `${SITE_URL}/sites/${s.slug}`,
    lastModified: s.created_at ? new Date(s.created_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))
  const idToSlug = new Map(data.map((s: any) => [s.id, s.slug]))
  // LOT 2 -- carte enrichie, reservee a la branche catalogue. `idToSlug`
  // reste la source d'adressage pour les deux autres branches, inchangees.
  const idToSite = new Map<string, { slug: string; mode: unknown; dropship_type: unknown }>(
    data.map((s: any) => [s.id, { slug: s.slug, mode: s.mode, dropship_type: s.dropship_type }])
  )

  const { data: posts } = await supabase
    .from('blog_posts')
    .select('slug, created_at')
    .eq('published', true)

  const blogRoutes: MetadataRoute.Sitemap = (posts ?? []).map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: p.created_at ? new Date(p.created_at) : new Date(),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  // LOT 1 : ces deux requêtes utilisaient un embed PostgREST
  // `sites!inner(slug, published)`, qui va chercher `sites` (la table de
  // base) en arrière-plan -- une fois la RLS resserrée (SELECT réservé au
  // propriétaire), cet embed échouerait silencieusement pour tout visiteur
  // anon/authenticated non-propriétaire : `!inner` exclut la ligne entière
  // dès que la jointure ne trouve rien de visible, faisant disparaître ces
  // routes du sitemap sans aucune erreur. Remplacé par une résolution via
  // `idToSlug` (déjà construit ci-dessus depuis sites_public), sans
  // dépendre du comportement d'embedding de PostgREST au travers d'une vue.
  const { data: shopProducts } = await supabase
    .from('shop_products')
    .select('id, created_at, site_id')
    .eq('published', true)
  const shopProductRoutes: MetadataRoute.Sitemap = (shopProducts ?? [])
    .filter((p: any) => idToSlug.has(p.site_id))
    .map((p: any) => ({
      url: SITE_URL + '/sites/' + idToSlug.get(p.site_id) + '/produits/' + encodeURIComponent(p.id),
      lastModified: p.created_at ? new Date(p.created_at) : new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    }))

  // ============================================================
  // LOT 2 -- LE SITEMAP PUBLIAIT CE QUE LA VITRINE REFUSE D'AFFICHER.
  //
  // Cette branche n'avait AUCUNE garde de mode ni de sous-type : toute
  // selection approuvee d'un site publie devenait une URL indexable. Un
  // `pod_brand`, admis a tort par `POST /catalog/selections` avant ce lot,
  // voyait donc ses lignes orphelines publiees aux moteurs -- alors que sa
  // propre vitrine ne charge aucune selection et que la fiche produit
  // correspondante est desormais refusee (`fetchProduct`). Le sitemap
  // aurait annonce des pages qui repondent 404.
  //
  // PRECISION MESUREE, contre une affirmation trop rapide d'un rapport
  // anterieur : `POST /catalog/curate` ecrit `merchant_approved: false`.
  // Il ne publie donc RIEN a lui seul. Seuls `POST /catalog/selections`
  // (qui ecrit `true` d'emblee) et l'approbation explicite atteignent cette
  // requete. `merchant_approved === true` reste la condition de publication
  // et n'est pas touchee.
  //
  // MEME AUTORITE que les cinq routes catalogue et que la fiche produit :
  // une seule regle decide qui possede des selections publiables.
  // ============================================================
  // AUDIT GLOBAL -- LE FOURNISSEUR EST DESORMAIS PROJETE, ET RELU.
  //
  // La projection ne portait que `catalog_product_id, site_id` : le sitemap ne
  // POUVAIT PAS verifier l'eligibilite fournisseur, faute d'avoir la colonne.
  // Il annoncait donc aux moteurs des fiches produit que le checkout refuse.
  // La jointure la ramene, et l'autorite tranche -- meme regle que la vitrine.
  const { data: catalogSels } = await supabase
    .from('site_catalog_selections')
    .select('catalog_product_id, site_id, catalog_products(supplier_id)')
    .eq('merchant_approved', true)
  const catalogProductRoutes: MetadataRoute.Sitemap = (catalogSels ?? [])
    .filter((c: any) => {
      const site = idToSite.get(c.site_id)
      const fournisseur = c.catalog_products?.supplier_id
      return !!site && selectionServable(site.mode, site.dropship_type, fournisseur)
    })
    .map((c: any) => ({
      url: SITE_URL + '/sites/' + idToSlug.get(c.site_id) + '/produits/' + encodeURIComponent('catalog-' + c.catalog_product_id),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    }))

  return [...staticRoutes, ...siteRoutes, ...blogRoutes, ...shopProductRoutes, ...catalogProductRoutes]
}
