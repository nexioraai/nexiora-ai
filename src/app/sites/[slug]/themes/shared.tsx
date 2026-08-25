// src/app/sites/[slug]/themes/shared.tsx

import { supabase } from '@/lib/supabase'
import { calcSellPrice, sitePricing, resolveDisplayPrice } from '@/lib/pricing'
import { canTransact } from '@/lib/commerce-admission/canTransact'

import {
Wrench,
ShieldCheck,
Truck,
Headphones,
Sparkles,
Clock,
Award,
Zap,
Heart,
Package,
type LucideIcon,
} from 'lucide-react'

// ---------- Types ----------

export type Site = {
id: string
slug: string
name: string
slogan?: string
type?: string
mode?: number
custom_domain?: string | null
dropship_type?: string
primary_color?: string
hero_title?: string
hero_subtitle?: string
about?: string
services?: any[]
sections?: any[]
gallery?: string[]
testimonials?: any[]
products?: any[]
contact?: {
phone?: string
email?: string
address?: string
}
social_links?: {
instagram?: string
facebook?: string
whatsapp?: string
tiktok?: string
}
hero_image?: string
cta?: string
theme?: 'editorial' | 'noir' | 'vif' | string
lang?: string
faq?: { question: string; answer: string }[]
  whyus?: { title: string; text: string }[]
  mission?: string
  vision?: string
  geo_lat?: number
  geo_lng?: number
  area_served?: string
  price_range?: string
  pages?: { title: string; content: string }[]
  hidden_sections?: string[]
  section_label?: string
  created_at?: string
  /**
   * DEBT-034 -- derniere modification REELLE du contenu, posee par le
   * declencheur `trg_sites_touch_updated_at` (supabase/sql/sites_updated_at.sql).
   *
   * OPTIONNELLE, et elle doit le rester : tant que la migration n'est pas
   * executee, la colonne n'existe pas et `resolveSiteFreshness` se replie sur
   * `created_at` -- exactement le comportement d'avant.
   */
  updated_at?: string
  pod_designs?: any[]
  product_families?: Record<string, string>
  cj_margin_percent?: number
  cj_round_mode?: string
  shipping_flat?: number
}

export type Product = {
id?: string
name: string
description: string
price: string
priceNumber?: number
currency?: string
image?: string
cjVid?: string | null
/**
 * DETTE 6c — ACHETABILITE. `false` = presente mais non payable.
 * OPTIONNEL a dessein : le catalogue jsonb du Mode 1 et les maquettes POD
 * n'ont pas cette notion. `undefined` ne veut donc pas dire « non vendable »,
 * il veut dire « la question ne se pose pas ici » -- d'ou le `!== false`
 * partout ou ce champ est lu.
 */
forSale?: boolean
variants?: { variant_id: string; label: string; price: number; currency: string }[]
shippingDaysMin?: number | null
shippingDaysMax?: number | null
supplierId?: string | null
supplierProductId?: string | null
family?: string
}

export type Service = {
title: string
description: string
Icon: LucideIcon
image?: string
}

export type Testimonial = {
name: string
role: string
content: string
rating: number
}

// ---------- Supabase ----------

export const PUBLIC_COLS =
'id,slug,name,slogan,type,mode,custom_domain,primary_color,hero_title,hero_subtitle,about,services,testimonials,gallery,products,contact,menu,team,hours,social_links,address,pages,cta,theme,hero_image,lang,faq,whyus,mission,vision,geo_lat,geo_lng,area_served,price_range,hidden_sections,section_label,sections,created_at,dropship_type,pod_designs,product_families,cj_margin_percent,cj_round_mode,shipping_flat'

// ---------- Resolution d'URL multi-domaines ----------
//
// Domaine canonique de Woorri elle-meme (jamais celui d'un site client) —
// utilise uniquement comme repli quand un site n'a pas (ou n'est pas
// accede via) son propre custom_domain. Meme convention que
// src/app/sitemap.ts / robots.ts.
export const WOORRI_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.deribfy.com'

/**
 * Determine l'URL de base a utiliser pour le canonical/OG/JSON-LD/sitemap
 * d'un site genere, a partir du Host reel de la requete courante — jamais
 * de NEXT_PUBLIC_SITE_URL utilisee aveuglement pour un site client.
 *
 * - Si le Host de la requete correspond exactement au custom_domain du
 *   site (meme comparaison que fetchSiteByDomain/proxy.ts : host normalise
 *   en minuscules, sans port), la page est reellement servie sur ce
 *   domaine perso -> l'URL de base est ce domaine.
 * - Sinon (acces via www.woorri.com/sites/{slug}, ou site sans
 *   custom_domain) -> l'URL de base reste le chemin interne Woorri.
 *
 * Generique : ne connait ni YIA ni aucun site en particulier, uniquement
 * le champ custom_domain deja porte par n'importe quel site.
 */
export function resolveSiteBaseUrl(
  site: { slug: string; custom_domain?: string | null },
  host: string | null | undefined,
): string {
  const normalizedHost = (host || '').split(':')[0].toLowerCase()
  if (site.custom_domain && normalizedHost === site.custom_domain.toLowerCase()) {
    return `https://${site.custom_domain}`
  }
  return `${WOORRI_SITE_URL}/sites/${site.slug}`
}

// ============================================================
// DETTE 3 -- UNE PANNE POSTGREST NE DOIT PLUS ETRE MUETTE.
//
// LE DEFAUT CORRIGE. Trois requetes de ce fichier faisaient
// `const { data } = await supabase...` sans jamais destructurer `error`. Une
// panne PostgREST rendait donc `data = null`, INDISTINGUABLE d'un resultat
// legitimement vide : la vitrine affichait un catalogue vide, sans erreur,
// sans journal, sans que personne le sache. C'est le motif exact du bug LOT L
// de checkout (`cost_price`), corrige la-bas pour la meme raison.
//
// POURQUOI `logAnomaly` N'EST PAS APPELE ICI. Ce fichier est
// BI-ENVIRONNEMENT, deliberement : il utilise le client anon (isomorphe) et
// QUATRE composants 'use client' l'importent (NoirTheme, VifTheme,
// FamilyFilter, StorefrontDense), plus la page preview. Or
// `anomaly.ts -> supabase-admin.ts -> import 'server-only'`. MESURE, pas
// suppose : l'ajout de cet import fait echouer `next build` -- Turbopack suit
// le graphe statiquement, et un `await import()` dynamique ne deplace pas la
// frontiere (verifie, meme echec).
//
// LE SIGNAL REMONTE DONC AUX APPELANTS. Un tableau `diagnostics` optionnel,
// passe par l'appelant, recueille les pannes ; les appelants SERVEUR appellent
// `logAnomaly` eux-memes. Le contrat `Promise<Site | null>` reste INCHANGE :
// `null` continue de ne signifier que « site introuvable », jamais « panne ».
// Aucune panne ne produit donc de 404 supplementaire.
// ============================================================

/**
 * Signale une panne de requete SANS jamais changer le rendu.
 *
 * `diagnostics` fourni  -> l'appelant est cote serveur, il journalisera.
 * `diagnostics` absent  -> repli `console.error`, isomorphe. C'est le cas du
 *   chemin preview (appele depuis le navigateur, aucune frontiere serveur sur
 *   ce parcours) et de tout appelant serveur qui n'aurait pas passe le
 *   tableau. Le signal n'est jamais entierement perdu.
 *
 * N'est appele QUE sur un vrai objet `error`. Un resultat vide legitime
 * (`data: []` ou `data: null` sans erreur) ne signale RIEN -- sans quoi chaque
 * boutique sans produit publie remplirait le journal.
 */
function signalQueryFailure(
source: string,
message: string,
diagnostics?: string[]
) {
const ligne = `${source}: ${message}`
if (diagnostics) {
diagnostics.push(ligne)
return
}
console.error('[storefront] ' + ligne)
}

// ============================================================
// ETAPE 8, VOLET C -- LE REPLI JSONB, ET OU IL DISPARAIT.
//
// LE DEFAUT CORRIGE. `data.products` arrive charge du jsonb `sites.products`
// (expose par PUBLIC_COLS), puis n'etait REMPLACE par `shop_products` que si
// celle-ci rendait au moins une ligne publiee. Le jsonb survivait donc des
// que la boutique n'avait aucun produit publie -- et il survivait en
// affichant des objets SANS `id`, que le checkout refuse (409) et auxquels
// `shop-product-guard` interdit deja le panier. Une boutique montrait donc
// un catalogue fantome, visible et non achetable.
//
// POURQUOI SEULEMENT LES MODES 2 ET 3. Pour eux, `shop_products` est la
// source canonique et le jsonb n'est qu'un repli : il n'a plus lieu d'etre.
// Pour le Mode 1, le jsonb N'EST PAS un repli -- c'est sa SEULE source. Une
// vitrine ne peut posseder aucun `shop_products` : trois gardes
// independantes l'interdisent (canTransact sur POST, requireProductOwner sur
// PATCH/DELETE, ProductManager monte pour les seuls modes 2 et 3). Le vider
// ici reviendrait a supprimer un catalogue legitime, et contredirait
// `enforceModeProducts()`, qui a deja tranche a la generation que ces
// produits sont valides en Mode 1 et invalides en 2/3.
//
// `canTransact` PLUTOT QU'UN `mode === 2 || mode === 3` ECRIT ICI. La
// frontiere d'admission au commerce est nommee a UN seul endroit ; la
// recopier en creerait une seconde, qui divergerait au premier mode ajoute.
// ============================================================

// ============================================================
// DETTE 6c — `forSale` EST LE SEUL CHAMP INTERNE PROMU AU PUBLIC.
//
// LE DEFAUT CORRIGE. `for_sale` n'etait honore que par deux surfaces : le
// checkout (409) et, depuis la dette 6b, l'estimation de livraison (403). La
// vitrine, elle, l'ignorait totalement -- elle ne le lisait meme pas. Un
// produit retire de la vente restait donc affiche AVEC son bouton
// « Ajouter au panier » : le visiteur remplissait son panier, saisissait ses
// coordonnees, et n'apprenait le refus qu'au paiement. Le marchand avait bien
// retire son produit ; personne ne le lui disait avant l'echec.
//
// POURQUOI LUI, ET LUI SEUL. `stock`, `published` et `track_inventory`
// restent interdits de vitrine et le cliquet de caracterisation continue de
// l'exiger. Ils decrivent l'INTERIEUR de la boutique. `for_sale` decrit ce que
// le visiteur a le droit de faire : c'est une information qui lui est
// destinee, au meme titre que le prix.
//
// `!== false` ET NON `=== true`. Ici l'absence du champ signifie « catalogue
// jsonb du Mode 1 », ou la notion n'existe pas : etre strict y supprimerait
// des boutons legitimes. La rigueur inverse vit au checkout, qui exige
// `for_sale !== true` pour refuser -- une barriere d'AFFICHAGE peut se
// tromper vers le visible, une barriere de PAIEMENT jamais vers l'encaissement.
// ============================================================

/** Projection publique d'une ligne `shop_products`. Aucun champ interne. */
function mapShopProducts(rows: any[]): any[] {
return rows.map((p: any) => ({
id: p.id,
name: p.name,
description: p.description ?? '',
price: p.price != null ? `${Number(p.price).toFixed(2)} ${p.currency}` : '',
priceNumber: p.price != null ? Number(p.price) : undefined,
currency: p.currency,
image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : undefined,
cjVid: p.cj_vid || null,
forSale: p.for_sale !== false,
}))
}

/**
 * Pose le catalogue vendable sur `data.products`.
 *
 * Ecrit a UN seul endroit, appele par `fetchSite` ET `fetchSitePreview` : ces
 * deux fonctions portaient jusqu'ici le meme bloc, duplique mot pour mot. La
 * vitrine publique et l'apercu proprietaire doivent montrer le meme
 * catalogue ; deux copies auraient fini par diverger.
 */
function applyShopProducts(data: any, shopProducts: any[] | null | undefined) {
if (canTransact(data?.mode)) {
// Modes commercants : `shop_products` fait foi, MEME VIDE. Aucun repli --
// une boutique sans produit publie n'a pas de catalogue, elle n'herite pas
// de celui d'avant.
data.products = mapShopProducts(shopProducts ?? [])
return
}
// Mode 1 (et tout mode non commercant) : comportement RIGOUREUSEMENT
// inchange, y compris cette branche qu'aucun chemin applicatif ne peut
// atteindre -- une vitrine n'a pas de `shop_products`. La conserver telle
// quelle est ce qui garantit qu'aucun comportement du Mode 1 n'a bouge.
if (shopProducts && shopProducts.length > 0) {
data.products = mapShopProducts(shopProducts)
}
}

export async function fetchSite(
slug: string,
allowUnpublished = false,
diagnostics?: string[]
): Promise<Site | null> {
// Audit Mode 3/POD BRAND, LOT 1 : sites_public (vue, colonnes = PUBLIC_COLS,
// WHERE published=true AND archived_at IS NULL déjà appliqué par la vue
// elle-même) remplace un accès direct à `sites` qui exposait des colonnes
// sensibles (owner_email, stripe_customer_id, payment_account_id, owner_id)
// à quiconque via select=*. `allowUnpublished` était déjà sans effet
// observable en production : ce composant serveur utilise le client anon
// (@/lib/supabase, sans transfert de session navigateur), et la RLS
// bloquait déjà tout accès à un site non publié même via un JWT
// authentifié réel n'en étant pas propriétaire (prouvé en direct, comptes
// jetables). La vue ne peut par construction jamais renvoyer de ligne non
// publiée -- comportement inchangé, pas une régression.
const { data, error } = await supabase
.from('sites_public')
.select('*')
.eq('slug', slug)
.single()

if (error || !data) {
console.error(error)
return null
}

const { data: shopProducts, error: shopProductsError } = await supabase
.from('shop_products')
.select('id,name,description,price,currency,images,cj_vid,for_sale')
.eq('site_id', (data as any).id)
.eq('published', true)
.order('position', { ascending: true })

if (shopProductsError) {
signalQueryFailure('fetchSite/shop_products', shopProductsError.message, diagnostics)
}

// Le rendu ne change pas d'un iota : `shopProducts` vaut `null` sur panne, et
// `applyShopProducts` traite ce cas depuis le volet C (Mode 1 garde son jsonb,
// modes 2/3 obtiennent un catalogue vide). Seul le SIGNAL est nouveau.
applyShopProducts(data as any, shopProducts)

await loadCatalogSelections(data as any, diagnostics)

return data as Site
}





async function loadCatalogSelections(data: any, diagnostics?: string[]) {
if (data.mode === 3 && (data.dropship_type === 'reseller' || data.dropship_type === 'pod_custom')) {
const { data: catSels, error: catSelsError } = await supabase
.from('site_catalog_selections')
.select('id, sell_price, custom_name, custom_description, catalog_product_id, catalog_products(name, description, price, currency, images, supplier_id, supplier_product_id, shipping_days_min, shipping_days_max, in_stock, category)')
.eq('site_id', data.id)
.eq('merchant_approved', true)
.order('sort_order', { ascending: true })
if (catSelsError) {
// Le catalogue fournisseur est un AJOUT : sur panne, les `shop_products`
// deja poses restent intacts et aucun `catalog-*` n'est invente. Seule
// l'absence de signal etait le defaut -- une boutique Mode 3 paraissait
// simplement vide.
signalQueryFailure('loadCatalogSelections/site_catalog_selections', catSelsError.message, diagnostics)
}
if (catSels && catSels.length > 0) {
const { margin, roundMode } = sitePricing(data);
const catalogProducts = catSels
// Meme regle que la recherche : un produit epuise chez le fournisseur
// n'est pas affiche. supplier-watch tient in_stock a jour.
.filter((s: any) => s.catalog_products && s.catalog_products.in_stock !== false)
.map((s: any) => {
const cp = s.catalog_products
const costPrice = cp.price ? Number(cp.price) : 0;
const pr = resolveDisplayPrice(costPrice, s.sell_price, margin, roundMode);
const cur = cp.currency || 'CAD'
return {
id: `catalog-${s.catalog_product_id}`,
name: s.custom_name || cp.name,
description: s.custom_description || cp.description || '',
price: pr > 0 ? `${pr.toFixed(2)} ${cur}` : '',
priceNumber: pr,
currency: cur,
image: Array.isArray(cp.images) && cp.images.length > 0 ? cp.images[0] : undefined,
shippingDaysMin: cp.shipping_days_min || null,
shippingDaysMax: cp.shipping_days_max || null,
supplierId: cp.supplier_id || null,
supplierProductId: cp.supplier_product_id || null,
family: ((data.product_families || {}) as Record<string,string>)[cp.category] || undefined,
}
})
const existing = data.products || []
data.products = [...catalogProducts, ...existing]
}
}
}

export async function fetchSiteByDomain(
domain: string
): Promise<string | null> {
// LOT 1 : sites_public applique déjà published=true AND archived_at IS
// NULL -- corrige au passage l'absence de vérification archived_at qui
// existait ici (un site archivé, compte supprimé, restait résolvable par
// domaine custom si published était resté true).
const { data, error } = await supabase
.from('sites_public')
.select('slug')
.eq('custom_domain', domain)
.single()
if (error || !data) return null
return (data as any).slug as string
}

export type SiteBrand = {
  slug: string
  name: string
  primaryColor: string | null
  theme: string | null
  lang: string | null
}

/**
 * Recupere le strict minimum pour brander une page d'erreur.
 * Ne renvoie jamais d'info sensible (pas d'email, pas d'id).
 */
export async function fetchSiteBrandByDomain(
  domain: string
): Promise<SiteBrand | null> {
  // LOT 1 : sites_public, même raison que fetchSiteByDomain ci-dessus.
  const { data, error } = await supabase
    .from('sites_public')
    .select('slug,name,primary_color,theme,lang')
    .eq('custom_domain', domain)
    .maybeSingle()
  if (error || !data) return null
  const d = data as any
  return {
    slug: d.slug,
    name: d.name,
    primaryColor: d.primary_color || null,
    theme: d.theme || null,
    lang: d.lang || null,
  }
}

export async function fetchSitePreview(
slug: string,
ownerEmail: string
): Promise<Site | null> {
const { data, error } = await supabase
.from('sites')
.select(PUBLIC_COLS + ',owner_email')
.eq('slug', slug)
.eq('owner_email', ownerEmail)
.maybeSingle()
if (error || !data) {
return null
}
const { data: shopProducts, error: shopProductsError } = await supabase
.from('shop_products')
.select('id,name,description,price,currency,images,cj_vid,for_sale')
.eq('site_id', (data as any).id)
.eq('published', true)
.order('position', { ascending: true })
if (shopProductsError) {
// AUCUN `diagnostics` ici, et c'est deliberé : l'unique appelant de cette
// fonction est `preview/[slug]/page.tsx`, un composant 'use client' qui
// l'execute DANS LE NAVIGATEUR. Aucune frontiere serveur n'existe sur ce
// parcours -- ni Server Action (0 dans le depot), ni Server Component
// parent, ni route API appelee par le preview. Le repli `console.error`
// atteint la console du proprietaire, seul utilisateur de cette page.
signalQueryFailure('fetchSitePreview/shop_products', shopProductsError.message)
}
applyShopProducts(data as any, shopProducts)
await loadCatalogSelections(data as any)

return data as unknown as Site
}

// ---------- Icons ----------

export const SERVICE_ICONS: LucideIcon[] = [
Wrench,
ShieldCheck,
Truck,
Headphones,
Sparkles,
Clock,
Award,
Zap,
Heart,
Package,
]

// ---------- Normalizers ----------

export function normalizeService(
raw: any,
index: number
): Service {
if (typeof raw === 'string') {
return {
title: raw,
description:
'Service professionnel adapté à vos besoins.',
Icon:
SERVICE_ICONS[
index % SERVICE_ICONS.length
],
}
}

return {
title:
raw?.title ??
raw?.name ??
'Service',

description:
raw?.description ??
'Service professionnel adapté à vos besoins.',

Icon:
SERVICE_ICONS[
index % SERVICE_ICONS.length
],
}
}

export function normalizeTestimonial(
raw: any
): Testimonial {
return {
name: raw?.name ?? 'Client',

role:
raw?.role ??
raw?.company ??
'',

content:
raw?.content ??
raw?.text ??
raw?.message ??
'',

rating: Number(
raw?.rating ?? 5
),
}
}

// ============================================================
// DETTE 6c — LE SEUL ENDROIT QUI DECIDE SI UN PRODUIT PEUT ETRE MIS AU PANIER.
//
// POURQUOI UNE FONCTION ET NON UNE CONDITION RECOPIEE. Cette garde existait
// deja, sous forme de `p.id && p.priceNumber != null`, ecrite CINQ FOIS. Elle
// avait deja diverge une fois : DEBT-001 a corrige Noir et Vif, qui l'avaient
// omise alors qu'Editorial la portait. Lui ajouter un troisieme terme dans
// cinq fichiers, c'etait rejouer cette divergence a coup sur. Un seul point
// de decision, cinq appels.
//
// LES TROIS TERMES, ET CE QU'ILS PROTEGENT :
//   `id`         -- DEBT-001 : un produit sans id casse la deduplication du panier ;
//   `priceNumber`-- un produit sans prix numerique n'est pas chiffrable ;
//   `forSale`    -- DETTE 6c : le marchand a retire ce produit de la vente.
//
// `!== false`, ET NON `=== true`. Le champ est absent du catalogue jsonb du
// Mode 1 et des maquettes POD, ou l'achetabilite n'existe pas comme notion :
// exiger `true` y supprimerait des boutons legitimes. La rigueur inverse vit
// au checkout (`for_sale !== true` -> 409) et a l'estimation de livraison
// (dette 6b) : une garde d'AFFICHAGE peut se tromper vers le visible, une
// garde de PAIEMENT jamais vers l'encaissement. Ce sont deux barrieres, pas
// une seule dupliquee -- celle-ci evite une impasse, celle-la refuse l'argent.
// ============================================================
// PREDICAT DE TYPE, et non `boolean`. La condition recopiee dans les cinq
// themes NARROWISSAIT `id` et `priceNumber` : les remplacer par un booleen
// aurait force cinq `!` ou cinq casts sur les proprietes passees a
// AddToCartButton. Le predicat rend la garde et le typage indissociables --
// on ne peut pas passer un produit non garde a l'appelant.
export function canAddToCart(
p: Product | null | undefined
): p is Product & { id: string; priceNumber: number } {
return !!p?.id && p?.priceNumber != null && p?.forSale !== false
}

export function normalizeProduct(
raw: any
): Product {
return {
id: raw?.id,
priceNumber: raw?.priceNumber ?? (typeof raw?.price === 'string' ? parseFloat(raw.price.replace(/[^0-9.]/g, '')) || 0 : raw?.price ?? 0),
currency: raw?.currency,
name:
raw?.name ??
raw?.title ??
'Produit',

description:
raw?.description ?? '',

price:
raw?.price ?? '',

image:
raw?.image ??
raw?.image_url ??
undefined,
cjVid: raw?.cjVid || null,
// DETTE 6c — `normalizeProduct` RECONSTRUIT l'objet : tout champ non recopie
// ici est PERDU. Sans cette ligne, l'achetabilite projetee par
// `mapShopProducts` disparaissait avant d'atteindre les themes Editorial,
// Noir, Vif et Aurora -- la correction n'aurait servi a rien sur 4 vitrines
// sur 5. Mesure, pas supposition : les quatre appellent bien `.map(normalizeProduct)`.
forSale: raw?.forSale,
shippingDaysMin: raw?.shippingDaysMin || null,
shippingDaysMax: raw?.shippingDaysMax || null,
supplierId: raw?.supplierId || null,
supplierProductId: raw?.supplierProductId || null,
family: raw?.family || undefined,
}
}


// ---------- POD mockups → Products ----------
export function mockupsToProducts(site: Site): Product[] {
  if (site.dropship_type !== "pod_brand" || !site.pod_designs?.length) return []
  const designs = site.pod_designs
  const products: Product[] = []
  // Prix unifie : le cout Printful (m.price / v.price) passe par la meme formule
  // marge que le catalogue reseller. Le marchand fixe son %, le prix se calcule.
  const { margin, roundMode } = sitePricing(site)
  for (const design of designs) {
    if (!design.mockups?.length) continue
    for (const m of design.mockups) {
      if (m.design_url && design.url && m.design_url !== design.url) continue
      const selProducts = design.selected_products || {}
      const sel = selProducts[String(m.product_id)]
      const cost = m.price ? Number(m.price) : 0
      const pr = resolveDisplayPrice(cost, undefined, margin, roundMode)
      const cur = m.currency || "CAD"
      const variants = sel?.variants || []
      products.push({
        id: `catalog-${m.catalog_product_id}::${m.variant_id}`,
        name: m.product_name?.replace(/\s*—\s*.+$/, "") || "Produit",
        description: "",
        price: pr > 0 ? `${pr.toFixed(2)} ${cur}` : "",
        priceNumber: pr,
        currency: cur,
        image: m.mockup_url,
        shippingDaysMin: m.shipping_days_min || null,
        shippingDaysMax: m.shipping_days_max || null,
        variants: variants.map((v: any) => ({
          variant_id: v.variant_id,
          label: v.label,
          price: resolveDisplayPrice(v.price ? Number(v.price) : cost, undefined, margin, roundMode),
          currency: v.currency || cur,
        })),
      })
    }
  }
  return products
}

// Carte OSM partagee par tous les themes (synchro adresse via geo_lat/geo_lng)
export function ContactMap({
  lat,
  lng,
  className = '',
  accent = '#6366f1',
  dark = false,
}: {
  lat?: number | null
  lng?: number | null
  className?: string
  accent?: string
  dark?: boolean
}) {
  if (lat == null || lng == null) return null
  const D = 0.0035
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - D},${lat - D},${lng + D},${lat + D}&layer=mapnik&marker=${lat},${lng}`
  return (
    <div
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{ border: `1px solid ${accent}33` }}
    >
      {/* `dark` etait declare mais jamais lu (dette identifiee DEBT-010) --
          l'embed officiel OpenStreetMap n'expose aucune variante sombre via
          ses parametres d'URL publics, donc pas de correctif cote source.
          Un filtre CSS sur l'iframe (inversion + rotation de teinte) est la
          technique standard pour obtenir une carte plausible en mode sombre
          sans changer de fournisseur de tuiles ni ajouter de dependance/cle
          API -- teste a l'ecran, ajuste pour rester lisible (routes, eau,
          espaces verts distinguables) plutot que de produire un negatif brut. */}
      <iframe
        title="Map"
        width="100%"
        height="260"
        style={{ border: 0, display: 'block', filter: dark ? 'invert(0.92) hue-rotate(180deg) brightness(0.95) contrast(0.9) saturate(0.9)' : undefined }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        src={src}
      />
    </div>
  )
}
