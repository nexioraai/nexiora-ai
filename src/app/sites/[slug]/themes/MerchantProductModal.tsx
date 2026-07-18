'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import AddToCartButton from './AddToCartButton';

interface MerchantProduct {
  id?: string;
  name: string;
  description: string;
  price: string;
  priceNumber?: number;
  currency?: string;
  image?: string;
  variants?: { variant_id: string; label: string; price: number; currency: string }[];
  supplierId?: string | null;
  supplierProductId?: string | null;
}

interface Props {
  product: MerchantProduct;
  primary: string;
  lang?: string;
  onClose: () => void;
}

const LABELS: Record<string, Record<string, string>> = {
  en: { addToCart: 'Add to cart', description: 'Description', chooseOption: 'Choose an option', loadingVariants: 'Loading options\u2026', options: 'Options' },
  fr: { addToCart: 'Ajouter au panier', description: 'Description', chooseOption: 'Choisissez une option', loadingVariants: 'Chargement des options\u2026', options: 'Options' },
};

export default function MerchantProductModal({ product: p, primary, lang = 'en', onClose }: Props) {
  const t = LABELS[lang] || LABELS.en;
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const cachedVariants = Array.isArray(p.variants) ? p.variants : [];
  const [liveVariants, setLiveVariants] = useState<any[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);

  // Les variantes ne sont pas en cache : on les recupere en direct chez le
  // fournisseur, comme le fait ProductModal cote recherche.
  useEffect(() => {
    if (cachedVariants.length > 0) return;
    if (!p.supplierId || !p.supplierProductId) return;
    setLoadingVariants(true);
    const params = new URLSearchParams({
      supplier_id: p.supplierId,
      supplier_product_id: p.supplierProductId,
    });
    fetch('/api/catalog/variants?' + params.toString(), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d.variants) ? d.variants : [];
        if (list.length === 0) return;
        setLiveVariants(list.map((v: any) => ({
          variant_id: v.variant_id,
          label: v.name,
          price: v.price,
          currency: p.currency || 'USD',
        })));
      })
      .catch(() => { /* garder l'etat precedent */ })
      .finally(() => setLoadingVariants(false));
  }, [p.supplierId, p.supplierProductId]);

  const variants = cachedVariants.length > 0 ? cachedVariants : liveVariants;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, animation: 'mpFade 0.2s ease',
      }}
    >
      <style>{'@keyframes mpFade { from { opacity: 0 } to { opacity: 1 } } @keyframes mpSlide { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }'}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff', color: '#0a0a0a',
          borderRadius: 20, maxWidth: 900, width: '100%', maxHeight: '92vh',
          overflow: 'auto', position: 'relative',
          boxShadow: '0 25px 80px rgba(0,0,0,0.5)',
          animation: 'mpSlide 0.3s ease',
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

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 0 }} className="merchant-modal-grid">
          <div style={{ background: '#f7f7f7', minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {p.image ? (
              <img src={p.image} alt={p.name} style={{ width: '100%', height: 480, objectFit: 'contain', display: 'block' }} />
            ) : (
              <span style={{ fontSize: 56, opacity: 0.15 }}>?</span>
            )}
          </div>

          <div style={{ padding: '32px 36px', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 16px', lineHeight: 1.3 }}>{p.name}</h2>
            <p style={{ fontSize: 32, fontWeight: 800, margin: '0 0 24px', color: primary }}>
              {p.price}
            </p>

            {variants.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(0,0,0,0.55)' }}>
                  {lang === 'fr' ? 'Taille / Couleur' : 'Size / Color'}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {variants.map((v) => (
                    <button
                      key={v.variant_id}
                      onClick={() => setSelectedVariant(v.variant_id === selectedVariant ? null : v.variant_id)}
                      style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500,
                        border: v.variant_id === selectedVariant ? '2px solid ' + primary : '1.5px solid rgba(0,0,0,0.12)',
                        background: v.variant_id === selectedVariant ? primary + '15' : 'transparent',
                        color: '#0a0a0a', transition: 'all 0.15s',
                      }}
                    >{v.label}</button>
                  ))}
                </div>
              </div>
            )}

            <AddToCartButton
              id={(p.id || p.name) + (selectedVariant ? '::' + selectedVariant : '')}
              name={p.name + (selectedVariant ? ' \u2014 ' + (variants.find(v => v.variant_id === selectedVariant)?.label || '') : '')}
              priceNumber={p.priceNumber || 0}
              currency={p.currency || 'USD'}
              image={p.image}
              primary={primary}
              label={loadingVariants ? t.loadingVariants : (variants.length > 0 && !selectedVariant ? t.chooseOption : t.addToCart)}
              disabled={loadingVariants || (variants.length > 0 && !selectedVariant)}
            />

            {p.description && (
              <div style={{ marginTop: 28, borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(0,0,0,0.55)' }}>{t.description}</p>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(0,0,0,0.7)', margin: 0, whiteSpace: 'pre-wrap' }}>{p.description}</p>
              </div>
            )}
          </div>
        </div>

        <style>{'@media (max-width: 720px) { .merchant-modal-grid { grid-template-columns: 1fr !important; } }'}</style>
      </div>
    </div>
  );
}
