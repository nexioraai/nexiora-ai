'use client';

import { useState, useEffect, useCallback } from 'react';

interface CatalogProduct {
  id: string;
  supplier_id: string;
  name: string;
  price: number;
  images: string[];
  shipping_days_min: number;
  shipping_days_max: number;
  warehouse_country: string;
}

interface Props {
  slug: string;
  primary: string;
  lang?: string;
}

const LABELS: Record<string, Record<string, string>> = {
  en: { placeholder: 'Search products...', noResults: 'No products found', shipping: 'days', addToCart: 'Add to cart', supplier: 'Supplier', all: 'All' },
  fr: { placeholder: 'Rechercher des produits...', noResults: 'Aucun produit trouvé', shipping: 'jours', addToCart: 'Ajouter au panier', supplier: 'Fournisseur', all: 'Tous' },
};

export default function CatalogSearch({ slug, primary, lang = 'en' }: Props) {
  const t = LABELS[lang] || LABELS.en;
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [supplier, setSupplier] = useState('');
  const [sort, setSort] = useState('relevance');

  const search = useCallback(async () => {
    if (!query.trim() && !supplier) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ slug });
      if (query.trim()) params.set('q', query.trim());
      if (supplier) params.set('supplier', supplier);
      if (sort) params.set('sort', sort);
      const res = await fetch(`/api/catalog/search?${params.toString()}`);
      const data = await res.json();
      setProducts(data.products || []);
      setTotal(data.total || 0);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [query, slug, supplier, sort]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) search();
    }, 400);
    return () => clearTimeout(timer);
  }, [query, search]);

  const badgeColor: Record<string, { bg: string; text: string }> = {
    cj: { bg: '#FEE2E2', text: '#991B1B' },
    spocket: { bg: '#DBEAFE', text: '#1E40AF' },
    printful: { bg: '#DCFCE7', text: '#166534' },
  };

  return (
    <div style={{ width: '100%', maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t.placeholder}
          style={{
            flex: 1,
            padding: '12px 16px',
            fontSize: 16,
            border: '1.5px solid #ddd',
            borderRadius: 8,
            outline: 'none',
          }}
        />
        <select
          value={sort}
          onChange={e => { setSort(e.target.value); }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14 }}
        >
          <option value="relevance">Relevance</option>
          <option value="price_asc">Prix ↑</option>
          <option value="price_desc">Prix ↓</option>
          <option value="shipping">Livraison ↑</option>
        </select>
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#888' }}>...</p>}

      {!loading && products.length === 0 && query.length >= 2 && (
        <p style={{ textAlign: 'center', color: '#888' }}>{t.noResults}</p>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 16,
      }}>
        {products.map(p => {
          const badge = badgeColor[p.supplier_id] || { bg: '#F3F4F6', text: '#374151' };
          return (
            <div
              key={p.id}
              style={{
                border: '1px solid #eee',
                borderRadius: 10,
                overflow: 'hidden',
                background: '#fff',
              }}
            >
              <div style={{
                width: '100%',
                aspectRatio: '1',
                background: '#f5f5f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {p.images?.[0] ? (
                  <img
                    src={p.images[0]}
                    alt={p.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ color: '#ccc', fontSize: 32 }}>📦</span>
                )}
              </div>
              <div style={{ padding: 12 }}>
                <p style={{
                  fontSize: 13,
                  lineHeight: 1.3,
                  margin: '0 0 6px',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}>
                  {p.name}
                </p>
                <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>
                  ${p.price.toFixed(2)}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: badge.bg,
                    color: badge.text,
                    fontWeight: 500,
                  }}>
                    {p.supplier_id.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 11, color: '#888' }}>
                    🚚 {p.shipping_days_min}-{p.shipping_days_max} {t.shipping}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
