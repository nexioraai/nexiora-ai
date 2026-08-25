'use client';

import { useState, useEffect } from 'react';
import { achatPossible } from './variantRequirement';
import { X, ChevronLeft, ChevronRight, Truck } from 'lucide-react';
import AddToCartButton from './AddToCartButton';
import DesignCanvas from './DesignCanvas';
import { THEME_TOKENS, ThemeKey } from './CatalogSearch';

interface CatalogProduct {
  id: string;
  supplier_id: string;
  supplier_product_id?: string;
  /** LOT 4 / R4-02 -- voir la condition `disabled` plus bas. */
  requires_variant?: boolean;
  name: string;
  description?: string;
  price: number;
  images: string[];
  variants?: any;
  shipping_days_min: number;
  shipping_days_max: number;
  warehouse_country: string;
  category?: string;
}

interface Props {
  product: CatalogProduct;
  primary: string;
  lang?: string;
  theme?: ThemeKey;
  onClose: () => void;
  isPodCustom?: boolean;
  /** LOT J (F-CUSTOM-01) : requis par DesignCanvas pour lier l'upload au site. */
  slug: string;
}

const LABELS: Record<string, Record<string, string>> = {
  en: {
    addToCart: 'Add to cart',
    chooseOption: 'Choose an option',
    loadingVariants: 'Loading options...',
    shipping: 'Estimated delivery',
    days: 'days',
    description: 'Description',
    variants: 'Options',
    from: 'Ships from',
  },
  fr: {
    addToCart: 'Ajouter au panier',
    chooseOption: 'Choisissez une option',
    loadingVariants: 'Chargement des options...',
    shipping: 'Livraison estimee',
    days: 'jours',
    description: 'Description',
    variants: 'Options',
    from: 'Expedie depuis',
  },
};

export default function ProductModal({ product: p, primary, lang = 'en', theme = 'editorial', onClose, isPodCustom = false, slug }: Props) {
  const t = LABELS[lang] || LABELS.en;
  const tokens = THEME_TOKENS[theme] || THEME_TOKENS.editorial;
  const [imgIndex, setImgIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [customDesigns, setCustomDesigns] = useState<any[]>([]);
  const imgs = p.images?.length ? p.images : [];
  const cachedVariants = Array.isArray(p.variants) ? p.variants : [];
  const [liveVariants, setLiveVariants] = useState<any[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);

  // Les variantes ne sont pas stockees en cache (CJ/Printful/Printify). On les recupere
  // en direct chez le fournisseur a l'ouverture du modal.
  useEffect(() => {
    if (cachedVariants.length > 0) return;
    if (!p.supplier_id || !p.supplier_product_id) return;
    setLoadingVariants(true);
    const params = new URLSearchParams({
      supplier_id: p.supplier_id,
      supplier_product_id: p.supplier_product_id,
    });
    fetch('/api/catalog/variants?' + params.toString(), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d.variants) ? d.variants : [];
        if (list.length === 0) return;
        setLiveVariants(list.map((v: any) => ({
          vid: v.variant_id,
          variantNameEn: v.name,
          variantName: v.name,
          variantSku: v.sku,
        })));
      })
      .catch(() => { /* garder l'etat precedent : ne jamais vider sur erreur */ })
      .finally(() => setLoadingVariants(false));
  }, [p.supplier_id, p.supplier_product_id]);

  const variants = cachedVariants.length > 0 ? cachedVariants : liveVariants;
  // LOT 5 / P5-02 -- un support `pod_custom` n'est pas achetable sans design.
  const achetable = achatPossible({
    requiresVariant: p.requires_variant,
    variantesConnues: variants.length,
    varianteChoisie: selectedVariant,
    chargementEnCours: loadingVariants,
    designRequis: isPodCustom,
    designsFournis: customDesigns.length,
  });

  const prevImg = () => setImgIndex(i => (i > 0 ? i - 1 : imgs.length - 1));
  const nextImg = () => setImgIndex(i => (i < imgs.length - 1 ? i + 1 : 0));

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, animation: 'modalFadeIn 0.2s ease',
      }}
    >
      <style>{'@keyframes modalFadeIn { from { opacity: 0 } to { opacity: 1 } } @keyframes modalSlideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } } @keyframes spin { to { transform: rotate(360deg) } }'}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: tokens.modalBg, color: tokens.modalText,
          borderRadius: 20, maxWidth: 960, width: '100%', maxHeight: '92vh',
          overflow: 'auto', position: 'relative',
          boxShadow: '0 25px 80px rgba(0,0,0,0.5)',
          animation: 'modalSlideUp 0.3s ease',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 16, right: 16, zIndex: 10,
            background: 'rgba(0,0,0,0.5)', color: '#fff',
            border: 'none', borderRadius: '50%', width: 40, height: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', backdropFilter: 'blur(4px)',
          }}
        ><X size={20} /></button>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 0 }} className="product-modal-grid">
          {/* Images */}
          <div style={{ position: 'relative', background: theme === 'noir' ? '#000' : '#f7f7f7', minHeight: 320 }}>
            {imgs.length > 0 ? (
              <>
                <img
                  src={imgs[imgIndex]}
                  alt={p.name}
                  style={{ width: '100%', height: 480, objectFit: 'contain', display: 'block' }}
                />
                {imgs.length > 1 && (
                  <>
                    <button onClick={prevImg} aria-label="Previous" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={20} /></button>
                    <button onClick={nextImg} aria-label="Next" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={20} /></button>
                    <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto', background: theme === 'noir' ? '#0a0a0a' : '#fafafa' }}>
                      {imgs.map((img, i) => (
                        <img
                          key={i}
                          src={img}
                          alt=""
                          onClick={() => setImgIndex(i)}
                          style={{
                            width: 64, height: 64, objectFit: 'cover', borderRadius: 8, cursor: 'pointer',
                            border: i === imgIndex ? '2px solid ' + primary : '2px solid transparent',
                            opacity: i === imgIndex ? 1 : 0.5, flexShrink: 0,
                          }}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ width: '100%', height: 480, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 56, opacity: 0.15 }}>?</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div style={{ padding: '32px 36px', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 16px', lineHeight: 1.3, color: tokens.modalText }}>{p.name}</h2>

            <p style={{ fontSize: 32, fontWeight: 800, margin: '0 0 20px', color: primary }}>
              ${p.price.toFixed(2)}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: tokens.textMuted, marginBottom: 24, padding: '12px 14px', background: tokens.cardHover, borderRadius: 10 }}>
              <Truck size={18} />
              <span>{t.shipping}: <strong style={{ color: tokens.modalText }}>{p.shipping_days_min}-{p.shipping_days_max} {t.days}</strong>{p.warehouse_country && <> ({t.from} {p.warehouse_country})</>}</span>
            </div>

            {loadingVariants && (
              <div style={{ marginBottom: 24, fontSize: 13, color: tokens.textMuted, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid ' + tokens.cardBorder, borderTopColor: primary, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                {t.loadingVariants}
              </div>
            )}
            {variants.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: tokens.textMuted }}>{t.variants}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {variants.map((v: any) => (
                    <button
                      key={v.vid}
                      onClick={() => setSelectedVariant(v.vid === selectedVariant ? null : v.vid)}
                      style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500,
                        border: v.vid === selectedVariant ? '2px solid ' + primary : '1.5px solid ' + tokens.cardBorder,
                        background: v.vid === selectedVariant ? primary + '15' : 'transparent',
                        color: tokens.modalText, transition: 'all 0.15s',
                      }}
                    >{v.variantNameEn || v.variantName || v.variantSku || v.vid}</button>
                  ))}
                </div>
              </div>
            )}

            {isPodCustom && (
              <DesignCanvas
                productImage={imgs[0]}
                variantId={selectedVariant || p.supplier_product_id}
                onDesignChange={setCustomDesigns}
                primary={primary}
                lang={lang}
                slug={slug}
              />
            )}

            <AddToCartButton
              id={(String(p.id).startsWith('catalog-') ? p.id : 'catalog-' + p.id) + (selectedVariant ? '::' + selectedVariant : '')}
              name={p.name}
              priceNumber={p.price}
              currency="USD"
              image={imgs[0]}
              customDesigns={customDesigns.length > 0 ? customDesigns : undefined}
              customDesignUrl={customDesigns[0]?.url}
              variantId={selectedVariant || undefined}
              primary={primary}
            // ============================================================
            // LOT 4 / R4-02 -- LA CONDITION N'EST PLUS UN PROXY.
            //
            // C'etait `variants.length > 0 && !selectedVariant` : « il y a des
            // options, donc il faut en choisir une ». Le proxy s'effondre quand
            // la liste revient VIDE -- rupture totale de stock, ou erreur
            // avalee par `/api/catalog/variants`, qui rend `{variants: []}`
            // dans les deux cas. Le bouton s'activait alors pour un produit
            // dont l'identifiant de panier n'aurait AUCUNE variante, et que le
            // checkout refuse (garde `catalogStock`, LOT 4). Bouton actif,
            // refus garanti : exactement la divergence « ce que l'UI permet
            // n'est pas ce que le checkout vend » que ce lot ferme.
            //
            // `requiresVariant` vient de la donnee (`supplier_parent_id`), pas
            // d'une heuristique. `undefined` pour un produit sans fournisseur
            // (Mode 2, maquettes POD) : comportement rigoureusement inchange.
            // ============================================================
              label={loadingVariants ? t.loadingVariants : (achetable ? t.addToCart : t.chooseOption)}
              disabled={!achetable}
              onAdded={onClose}
            />

            {p.description && (
              <div style={{ marginTop: 28, borderTop: '1px solid ' + tokens.cardBorder, paddingTop: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: tokens.textMuted }}>{t.description}</p>
                {/* SEC-09 : rendu texte pur (jamais dangerouslySetInnerHTML), identique
                    au pattern deja utilise par MerchantProductModal.tsx pour la meme
                    donnee. p.description peut provenir de fournisseurs tiers (CJ, une
                    marketplace multi-vendeurs) ou d'une reecriture IA -- verifie sur les
                    33 041 descriptions reelles en production : aucune ne contient de
                    balisage HTML, whiteSpace:pre-wrap suffit a preserver les retours a
                    la ligne reels sans jamais interpreter le contenu comme du HTML. */}
                <div
                  style={{ fontSize: 14, lineHeight: 1.65, color: tokens.textMuted, whiteSpace: 'pre-wrap' }}
                >
                  {p.description}
                </div>
              </div>
            )}
          </div>
        </div>

        <style>{'@media (max-width: 720px) { .product-modal-grid { grid-template-columns: 1fr !important; } }'}</style>
      </div>
    </div>
  );
}
