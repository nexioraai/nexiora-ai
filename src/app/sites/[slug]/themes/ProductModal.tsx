'use client';

import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Truck } from 'lucide-react';
import AddToCartButton from './AddToCartButton';

interface Variant {
  vid: string;
  variantName?: string;
  variantNameEn?: string;
  variantSku?: string;
  variantImage?: string;
}

interface CatalogProduct {
  id: string;
  supplier_id: string;
  name: string;
  description: string;
  price: number;
  images: string[];
  variants: Variant[];
  shipping_days_min: number;
  shipping_days_max: number;
  warehouse_country: string;
  category: string;
}

interface Props {
  product: CatalogProduct;
  primary: string;
  lang?: string;
  onClose: () => void;
}

const LABELS: Record<string, Record<string, string>> = {
  en: {
    addToCart: 'Add to cart',
    shipping: 'Estimated delivery',
    days: 'days',
    description: 'Description',
    variants: 'Options',
    from: 'Ships from',
  },
  fr: {
    addToCart: 'Ajouter au panier',
    shipping: 'Livraison estimee',
    days: 'jours',
    description: 'Description',
    variants: 'Options',
    from: 'Expedie depuis',
  },
};

export default function ProductModal({ product: p, primary, lang = 'en', onClose }: Props) {
  const t = LABELS[lang] || LABELS.en;
  const [imgIndex, setImgIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const imgs = p.images?.length ? p.images : [];

  const prevImg = () => setImgIndex(i => (i > 0 ? i - 1 : imgs.length - 1));
  const nextImg = () => setImgIndex(i => (i < imgs.length - 1 ? i + 1 : 0));

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--modal-bg, #fff)', color: 'var(--modal-text, #111)',
          borderRadius: 16, maxWidth: 900, width: '100%', maxHeight: '90vh',
          overflow: 'auto', position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 10,
            background: 'rgba(0,0,0,0.5)', color: '#fff',
            border: 'none', borderRadius: '50%', width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
          {/* Images */}
          <div style={{ flex: '1 1 400px', position: 'relative', minHeight: 300 }}>
            {imgs.length > 0 ? (
              <>
                <img
                  src={imgs[imgIndex]}
                  alt={p.name}
                  style={{ width: '100%', height: 400, objectFit: 'contain', background: '#f5f5f5', borderRadius: '16px 0 0 0' }}
                />
                {imgs.length > 1 && (
                  <>
                    <button onClick={prevImg} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.4)', color: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ChevronLeft size={18} />
                    </button>
                    <button onClick={nextImg} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.4)', color: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ChevronRight size={18} />
                    </button>
                  </>
                )}
                {/* Thumbnails */}
                {imgs.length > 1 && (
                  <div style={{ display: 'flex', gap: 6, padding: '8px 12px', overflowX: 'auto' }}>
                    {imgs.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt=""
                        onClick={() => setImgIndex(i)}
                        style={{
                          width: 56, height: 56, objectFit: 'cover', borderRadius: 6, cursor: 'pointer',
                          border: i === imgIndex ? '2px solid ' + primary : '2px solid transparent',
                          opacity: i === imgIndex ? 1 : 0.6,
                        }}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ width: '100%', height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', borderRadius: '16px 0 0 0' }}>
                <span style={{ fontSize: 48, opacity: 0.2 }}>?</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div style={{ flex: '1 1 300px', padding: '24px 28px' }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px', lineHeight: 1.3 }}>{p.name}</h2>

            <p style={{ fontSize: 28, fontWeight: 700, margin: '0 0 16px', color: primary }}>
              ${p.price.toFixed(2)}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, opacity: 0.7, marginBottom: 20 }}>
              <Truck size={16} />
              <span>{t.shipping}: {p.shipping_days_min}-{p.shipping_days_max} {t.days}</span>
              {p.warehouse_country && <span> ({t.from} {p.warehouse_country})</span>}
            </div>

            {/* Variants */}
            {p.variants && p.variants.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t.variants}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {p.variants.map((v) => (
                    <button
                      key={v.vid}
                      onClick={() => setSelectedVariant(v.vid === selectedVariant ? null : v.vid)}
                      style={{
                        padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                        border: v.vid === selectedVariant ? '2px solid ' + primary : '1.5px solid #ddd',
                        background: v.vid === selectedVariant ? primary + '15' : 'transparent',
                        color: 'inherit',
                      }}
                    >
                      {v.variantNameEn || v.variantName || v.variantSku || v.vid}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <AddToCartButton
              id={'catalog-' + p.id}
              name={p.name}
              priceNumber={p.price}
              currency="USD"
              image={imgs[0]}
              primary={primary}
              label={t.addToCart}
            />

            {/* Description */}
            {p.description && (
              <div style={{ marginTop: 24, borderTop: '1px solid rgba(128,128,128,0.2)', paddingTop: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t.description}</p>
                <div
                  style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.8 }}
                  dangerouslySetInnerHTML={{ __html: p.description }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
