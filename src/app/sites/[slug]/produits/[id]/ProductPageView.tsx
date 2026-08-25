'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ProductPage } from './fetchProduct'
import AddToCartButton from '../../themes/AddToCartButton'
import { achatPossible, choixDeVarianteRequis } from '../../themes/variantRequirement'
import DesignCanvas from '../../themes/DesignCanvas'
import { THEME_TOKENS, ThemeKey } from '../../themes/CatalogSearch'

const CART_LABELS: Record<string, string> = {
  fr: 'Ajouter au panier',
  en: 'Add to cart',
  ar: 'أضف إلى السلة',
  es: 'Añadir al carrito',
}

// DETTE 6c — meme forme que CART_LABELS ci-dessus : ce fichier porte deja ses
// libelles en local, en inventer un autre mecanisme ici serait gratuit.
const NOT_FOR_SALE_LABELS: Record<string, string> = {
  fr: 'Ce produit n’est pas en vente',
  en: 'This product is not for sale',
  ar: 'هذا المنتج غير معروض للبيع',
  es: 'Este producto no está a la venta',
}

type VarianteFournisseur = { variant_id: string; name: string }

export default function ProductPageView({ product }: { product: ProductPage }) {
  const [imgIndex, setImgIndex] = useState(0)
  // LOT 4 / R4-01 -- meme source de variantes que la modale de la vitrine
  // (`/api/catalog/variants`), meme regle : tant qu'une variante est proposee,
  // aucun achat n'est possible sans en choisir une.
  const [variantes, setVariantes] = useState<VarianteFournisseur[]>([])
  const [varianteChoisie, setVarianteChoisie] = useState<string | null>(null)
  // ETAT INITIAL = « en chargement » DES QU'UNE VARIANTE EST REQUISE.
  //
  // Ce n'est pas un detail d'affichage : sans cela, le bouton est rendu ACTIF
  // pendant tout l'intervalle entre le premier rendu et la reponse de
  // `/api/catalog/variants`. Un visiteur rapide ajoute alors au panier un
  // article sans variante -- que le checkout refuse desormais (409). Le
  // bouton doit etre inactif tant que le choix n'est pas possible.
  const [chargementVariantes, setChargementVariantes] = useState(product.requiresVariant)
  useEffect(() => {
    if (!product.requiresVariant || !product.supplierId || !product.supplierProductId) return
    setChargementVariantes(true)
    const params = new URLSearchParams({
      // LOT 6 / DEBT-057 -- le slug est desormais REQUIS : la route ne parle
      // au fournisseur que pour un site reel, admis, et un produit indexe.
      slug: product.siteSlug,
      supplier_id: product.supplierId,
      supplier_product_id: product.supplierProductId,
    })
    let annule = false
    fetch('/api/catalog/variants?' + params.toString(), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (annule) return
        setVariantes(Array.isArray(d.variants) ? d.variants : [])
      })
      .catch(() => { if (!annule) setVariantes([]) })
      .finally(() => { if (!annule) setChargementVariantes(false) })
    return () => { annule = true }
  }, [product.requiresVariant, product.supplierId, product.supplierProductId])
  // LOT 4 / R4-02 -- LA CONDITION NE DEPEND PLUS DE LA LISTE.
  //
  // Elle etait `requiresVariant && variantes.length > 0` : une liste revenue
  // VIDE -- rupture totale, ou erreur avalee par `/api/catalog/variants` --
  // rendait la condition fausse, donc le bouton ACTIF, pour un produit que le
  // checkout refuse. Ma propre correction du LOT 4 portait encore ce proxy :
  // la contre-verification l'a trouve. La regle vient de la donnee, pas de la
  // reponse reseau.
  const variantsRequises = choixDeVarianteRequis(product.requiresVariant, variantes.length)
  // LOT 5 / P5-02 -- LA FICHE RECOIT LE MEME PARCOURS QUE LA MODALE.
  //
  // Elle n'avait AUCUN televerseur : `grep DesignCanvas` y rendait 0. Or
  // `usesCatalogSelections(3, 'pod_custom')` est vrai, donc la fiche est
  // servie ET publiee au sitemap. Tout achat depuis la fiche partait donc en
  // fabrication SANS design -- un blanc, aux frais de la plateforme.
  const [designs, setDesigns] = useState<{ url: string }[]>([])
  const achetable = achatPossible({
    requiresVariant: product.requiresVariant,
    variantesConnues: variantes.length,
    varianteChoisie,
    chargementEnCours: chargementVariantes,
    designRequis: product.requiresDesign,
    designsFournis: designs.length,
  })
  const imgs = product.images.length > 0 ? product.images : []
  const tokens = THEME_TOKENS[(product.theme as ThemeKey)] || THEME_TOKENS.editorial
  const priceLabel =
    product.priceNumber > 0
      ? product.priceNumber.toFixed(2) + ' ' + product.currency
      : ''
  const addLabel = CART_LABELS[product.lang] || CART_LABELS.en
  const notForSaleLabel = NOT_FOR_SALE_LABELS[product.lang] || NOT_FOR_SALE_LABELS.en

  return (
    <div style={{ background: tokens.modalBg, color: tokens.modalText, minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
        <Link
          href={'/sites/' + product.siteSlug}
          style={{ fontSize: 14, opacity: 0.7, textDecoration: 'none', color: 'inherit' }}
        >
          ← {product.siteName}
        </Link>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 40,
            marginTop: 24,
            alignItems: 'start',
          }}
        >
          <div>
            {imgs.length > 0 ? (
              <>
                <img
                  src={imgs[imgIndex]}
                  alt={product.name}
                  style={{ width: '100%', borderRadius: 16, objectFit: 'cover', aspectRatio: '1 / 1' }}
                />
                {imgs.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    {imgs.map((src, i) => (
                      <button
                        key={i}
                        onClick={() => setImgIndex(i)}
                        style={{
                          border: i === imgIndex ? '2px solid ' + product.primary : '1px solid rgba(128,128,128,0.4)',
                          borderRadius: 8,
                          padding: 0,
                          cursor: 'pointer',
                          background: 'none',
                          lineHeight: 0,
                        }}
                      >
                        <img src={src} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ width: '100%', aspectRatio: '1 / 1', background: 'rgba(128,128,128,0.15)', borderRadius: 16 }} />
            )}
          </div>

          <div>
            <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{product.name}</h1>
            {priceLabel && (
              <div style={{ fontSize: 24, fontWeight: 600, marginTop: 16 }}>{priceLabel}</div>
            )}
            {!product.inStock && (
              <div style={{ marginTop: 8, color: '#e05b5b', fontSize: 14 }}>Rupture de stock</div>
            )}
            {product.description && (
              <p style={{ marginTop: 24, lineHeight: 1.6, whiteSpace: 'pre-wrap', opacity: 0.9 }}>{product.description}</p>
            )}
            {/* DETTE 6c — la fiche produit applique la MEME regle que la
                vitrine : un produit retire de la vente reste entierement
                consultable (titre, images, prix, description), il n'a
                simplement plus de chemin d'achat. Le bouton n'est pas
                seulement desactive, il n'est pas rendu : un bouton grise
                invite a reessayer, et le checkout refuserait de toute
                facon (409). `inStock` garde son comportement propre --
                epuise et non-vendable sont deux etats differents. */}
            {/* ============================================================
                LOT 4 / R4-01 -- LA FICHE OFFRE ENFIN LE MEME CHOIX QUE LA
                MODALE DE LA VITRINE.

                Elle emettait `catalog-<uuid>` SANS variante, alors que la
                modale, pour le MEME produit, rend son bouton inactif tant
                qu'aucune variante n'est choisie. Deux surfaces d'achat du
                meme article, deux contrats. Mesure en production : deux
                commandes sont parties sans variante, et le fulfillment a
                retenu `variants[0]` -- une variante ARBITRAIRE.

                Le checkout refuse desormais une telle ligne (`catalogStock`,
                regle derivee de `supplier_parent_id`). Sans ce selecteur, le
                bouton des 19 fiches publiees deviendrait une impasse : les
                deux moities appartiennent a la meme correction.

                Un produit du marchand (`shop_products`) n'a pas de
                fournisseur : `supplierId` vaut `null`, aucun appel n'est
                fait, le rendu est rigoureusement celui d'avant.
            ============================================================ */}
            {variantes.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.6 }}>
                  {product.lang === 'fr' ? 'Taille / Couleur' : 'Size / Color'}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {variantes.map((v) => (
                    <button
                      key={v.variant_id}
                      type="button"
                      onClick={() => setVarianteChoisie(v.variant_id === varianteChoisie ? null : v.variant_id)}
                      style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500,
                        border: v.variant_id === varianteChoisie ? '2px solid ' + product.primary : '1.5px solid rgba(0,0,0,0.12)',
                        background: v.variant_id === varianteChoisie ? product.primary + '15' : 'transparent',
                        transition: 'all 0.15s',
                      }}
                    >{v.name}</button>
                  ))}
                </div>
              </div>
            )}

            {product.requiresDesign && (
              <div style={{ marginTop: 24 }}>
                <DesignCanvas
                  productImage={imgs[0]}
                  variantId={varianteChoisie || product.supplierProductId || undefined}
                  onDesignChange={(d) => setDesigns(d as { url: string }[])}
                  primary={product.primary}
                  lang={product.lang}
                  slug={product.siteSlug}
                />
              </div>
            )}

            <div style={{ marginTop: 28 }}>
              {product.forSale ? (
                <AddToCartButton
                  id={product.id + (varianteChoisie ? '::' + varianteChoisie : '')}
                  customDesigns={designs.length > 0 ? designs : undefined}
                  customDesignUrl={designs[0]?.url}
                  name={product.name + (varianteChoisie ? ' \u2014 ' + (variantes.find((v) => v.variant_id === varianteChoisie)?.name || '') : '')}
                  priceNumber={product.priceNumber}
                  currency={product.currency}
                  image={imgs[0]}
                  primary={product.primary}
                  variantId={varianteChoisie || undefined}
                  label={chargementVariantes ? (product.lang === 'fr' ? 'Chargement…' : 'Loading…') : (achetable ? addLabel : (product.lang === 'fr' ? 'Choisissez une option' : 'Choose an option'))}
                  disabled={!product.inStock || !achetable}
                />
              ) : (
                <div style={{ fontSize: 14, opacity: 0.7 }}>{notForSaleLabel}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
