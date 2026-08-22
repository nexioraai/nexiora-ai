// src/app/sites/[slug]/themes/NoirShopSection.tsx
//
// Section Shop de NoirTheme, extraite pour que le rendu Mode 1 (Hero,
// About, Sections, Contact...) n'importe et n'exécute plus jamais de code
// panier -- ce fichier n'est monté que lorsque modeCapabilities.hasShop
// est vrai (voir NoirTheme.tsx), jamais pour un site Mode 1. Même
// principe que EditorialShopSection.tsx / VifShopSection.tsx.
//
// Catalogue editorial, pas une grille marketplace : rythme irregulier
// (produit vedette + rangees variables + reperes de progression), prix
// traites comme des elements graphiques, memes tons/lumiere/typographie
// que le hero -- une seule identite visuelle du haut en bas de la page.
//
// Contrainte structurelle reelle (pas esthetique) : `CatalogSearch.tsx`
// (montee depuis page.tsx, hors perimetre -- voir KNOWN_ISSUES DEBT-008)
// s'injecte par portail juste APRES le premier <h2>/<h3> de la section
// #shop, en tant que frere DOM direct de son parent. Le <h2> ci-dessous
// est donc garde seul, dernier enfant d'un bloc plein-largeur sans
// display:flex, pour que cette injection externe atterisse proprement
// sur sa propre ligne plutot que de se retrouver ecrasee dans une rangee
// flex partagee avec d'autres elements d'en-tete.
import { Fragment } from 'react'
import ClickableProductCard from './ClickableProductCard'
import AddToCartButton from './AddToCartButton'
import ShippingEstimate from './ShippingEstimate'
import { getCartLabels } from './cartLabels'
import { type Site, normalizeProduct, mockupsToProducts } from './shared'
import { getDict } from './i18n'
import { gold, goldBright, LINE, STAGE, GradedImage } from './NoirTheme'
import SectionKicker from './SectionKicker'
import NoirSpotlight from './NoirSpotlight'

// Rythme de la grille : le produit 0 est toujours vedette (grand format) ;
// au-dela, une carte sur cinq est haute (row-span-2) pour casser la
// monotonie d'un mur de 60+ produits reels. Volontairement PAS de
// col-span au-dela de la vedette : en flux non-dense (voir plus bas),
// un col-span-2 qui ne trouve pas 2 colonnes consecutives libres cree un
// trou d'une cellule impossible a combler -- verifie a l'ecran (case
// noire vide entre deux tuiles), corrige en ne variant plus que la
// hauteur, jamais la largeur, hors de la vedette.
function cardSpan(i: number): string {
  if (i === 0) return 'col-span-2 row-span-2'
  return i % 5 === 3 ? 'row-span-2' : ''
}

export default function NoirShopSection({ site }: { site: Site }) {
  const t = getDict(site.lang)
  const cartT = getCartLabels(site.lang)
  const products = [...(site.products || []).map(normalizeProduct), ...mockupsToProducts(site)]
  const total = products.length

  return (
    <section id="shop" className="reveal py-28 md:py-36" style={{ backgroundColor: STAGE }}>
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <div className="mb-16 md:mb-20">
          <div className="flex items-center justify-between gap-4 mb-4">
            <SectionKicker color={gold}>{t.sections.shopKicker}</SectionKicker>
            {total > 0 && (
              <span className="text-xs tabular-nums tracking-[0.08em]" style={{ color: 'rgba(245,243,238,0.4)' }}>
                01&ndash;{String(total).padStart(2, '0')}
              </span>
            )}
          </div>
          <h2 className="text-4xl md:text-6xl leading-[0.95]" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
            {t.sections.shopTitle}
          </h2>
        </div>

        <NoirSpotlight size={420} opacity={0.1}>
          {/* Cols/hauteurs de rangee accordees a chaque palier -- a 2 colonnes
              fixes de 640 a 1023px (avant l'ancien passage direct a 4 colonnes),
              la largeur de tuile grandissait tandis que la hauteur restait figee
              a 220px : jusqu'a ~450x220, un rectangle bien plus large que haut,
              lu comme une bande plutot qu'une photo produit -- verifie a l'ecran
              a plusieurs largeurs reelles (768/1024/1280/1920px). Corrige avec un
              palier intermediaire a 3 colonnes qui garde un ratio proche du carre
              a chaque largeur testee. */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5 auto-rows-[190px] sm:auto-rows-[230px] md:auto-rows-[240px] lg:auto-rows-[250px]">
            {products.map((p, i) => {
              const featured = i === 0
              const span = cardSpan(i)
              const showBreak = i > 0 && i % 14 === 0
              return (
                <Fragment key={i}>
                  {showBreak && (
                    <div className="col-span-2 md:col-span-3 lg:col-span-4 flex items-center gap-6 py-1">
                      <span className="shrink-0 text-[11px] tabular-nums tracking-[0.3em]" style={{ color: 'rgba(245,243,238,0.35)' }}>
                        {String(i + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
                      </span>
                      <span className="h-px flex-1" style={{ backgroundColor: LINE }} />
                    </div>
                  )}
                  <ClickableProductCard slug={site.slug} product={p} primary={gold} lang={site.lang} variant="dark" className={`group relative overflow-hidden ${span}`}>
                    <div className="absolute inset-0" style={{ backgroundColor: '#1F1810' }}>
                      {p.image ? (
                        <GradedImage src={p.image} alt={p.name} cropBottomPct={9} imgClassName="transition-transform duration-700 ease-out group-hover:scale-[1.06]" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'rgba(245,230,200,0.25)' }}>
                          <span style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '2rem' }}>{(p.name || '?').charAt(0)}</span>
                        </div>
                      )}
                    </div>

                    {/* Voile de lisibilite -- pas une legende opaque, un vrai degrade de matiere. */}
                    <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(0deg, rgba(10,8,6,0.92) 0%, rgba(10,8,6,0.35) 38%, transparent 62%)' }} />
                    <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ boxShadow: `inset 0 0 0 1px ${goldBright}66` }} />

                    <div className="absolute inset-x-0 bottom-0 p-4 md:p-5 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <h3
                          className={`leading-tight mb-1 ${featured ? 'text-lg md:text-2xl' : 'text-sm'} line-clamp-2`}
                          style={{ fontFamily: 'var(--font-fraunces), serif', color: '#F5F3EE' }}
                        >
                          {p.name}
                        </h3>
                        <div className="flex items-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity duration-300">
                          {p.id && p.priceNumber != null ? (
                            <AddToCartButton
                              id={p.id}
                              name={p.name}
                              priceNumber={p.priceNumber}
                              currency={p.currency || 'CAD'}
                              image={p.image}
                              primary={goldBright}
                              label={cartT.addToCart}
                            />
                          ) : (
                            <a href="#contact" className="text-sm" style={{ color: goldBright }}>
                              {t.labels.request}
                            </a>
                          )}
                        </div>
                      </div>
                      {p.price && (
                        <span
                          className={`shrink-0 font-extralight leading-none tracking-tight ${featured ? 'text-4xl md:text-5xl' : 'text-xl md:text-2xl'}`}
                          style={{ fontFamily: 'var(--font-fraunces), serif', color: goldBright }}
                        >
                          {p.price.replace(/[^0-9.,]/g, '')}
                        </span>
                      )}
                    </div>

                    {/* Fond opaque necessaire : sans lui, ce badge (coin haut-droit, hors de
                        la zone protegee par le degrade du bas) devient illisible sur une
                        photo CJ claire -- verifie a l'ecran sur "Professional Fan Brush"
                        (fond blanc), texte quasi invisible. */}
                    {featured && (p.cjVid || p.shippingDaysMin) && (
                      <div
                        className="absolute top-4 right-4 md:top-5 md:right-5 text-[11px] uppercase tracking-[0.15em] px-2.5 py-1 rounded-full"
                        style={{ color: 'rgba(245,243,238,0.75)', backgroundColor: 'rgba(10,8,6,0.55)', backdropFilter: 'blur(4px)' }}
                      >
                        {p.cjVid ? (
                          <ShippingEstimate siteId={site.id} cjVid={p.cjVid} primary={gold} deliveryLabel={t.labels.estimatedDelivery} daysLabel={t.labels.days} />
                        ) : (
                          <span>
                            {t.labels.estimatedDelivery} {p.shippingDaysMin}
                            {p.shippingDaysMax && p.shippingDaysMax !== p.shippingDaysMin ? `-${p.shippingDaysMax}` : ''} {t.labels.days}
                          </span>
                        )}
                      </div>
                    )}
                  </ClickableProductCard>
                </Fragment>
              )
            })}
          </div>
        </NoirSpotlight>
      </div>
    </section>
  )
}
