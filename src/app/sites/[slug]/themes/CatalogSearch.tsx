'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import ProductModal from './ProductModal';
import { createPortal } from 'react-dom';

export type ThemeKey = 'editorial' | 'noir' | 'vif';

interface CatalogProduct {
  id: string;
  supplier_id: string;
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
  slug: string;
  primary: string;
  lang?: string;
  theme?: ThemeKey;
}

const LABELS: Record<string, Record<string, string>> = {
  en: { placeholder: 'Search products...', noResults: 'No products found', shipping: 'day delivery' },
  fr: { placeholder: 'Rechercher des produits...', noResults: 'Aucun produit trouve', shipping: 'j livraison' },
};

export const THEME_TOKENS: Record<ThemeKey, {
  cardBg: string; cardBorder: string; cardHover: string;
  text: string; textMuted: string;
  inputBg: string; inputBorder: string; inputText: string;
  modalBg: string; modalText: string;
}> = {
  editorial: {
    cardBg: '#ffffff', cardBorder: 'rgba(0,0,0,0.08)', cardHover: 'rgba(0,0,0,0.02)',
    text: '#0a0a0a', textMuted: 'rgba(0,0,0,0.55)',
    inputBg: '#ffffff', inputBorder: 'rgba(0,0,0,0.12)', inputText: '#0a0a0a',
    modalBg: '#ffffff', modalText: '#0a0a0a',
  },
  noir: {
    cardBg: '#111111', cardBorder: 'rgba(255,255,255,0.08)', cardHover: 'rgba(255,255,255,0.03)',
    text: '#ffffff', textMuted: 'rgba(255,255,255,0.55)',
    inputBg: 'rgba(255,255,255,0.05)', inputBorder: 'rgba(255,255,255,0.15)', inputText: '#ffffff',
    modalBg: '#0a0a0a', modalText: '#ffffff',
  },
  vif: {
    cardBg: '#ffffff', cardBorder: 'rgba(0,0,0,0.08)', cardHover: 'rgba(0,0,0,0.02)',
    text: '#0a0a0a', textMuted: 'rgba(0,0,0,0.55)',
    inputBg: '#ffffff', inputBorder: 'rgba(0,0,0,0.12)', inputText: '#0a0a0a',
    modalBg: '#ffffff', modalText: '#0a0a0a',
  },
};

export default function CatalogSearch({ slug, primary, lang = 'en', theme = 'editorial' }: Props) {
  const t = LABELS[lang] || LABELS.en;
  const tokens = THEME_TOKENS[theme] || THEME_TOKENS.editorial;
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState('relevance');
  const [visitorCountry, setVisitorCountry] = useState('');

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (tz.startsWith('America/')) {
        const city = tz.split('/')[1] || '';
        if (['Toronto','Montreal','Vancouver','Winnipeg','Edmonton','Halifax','Regina'].some(c => city.includes(c))) setVisitorCountry('CA');
        else if (['Mexico_City','Cancun','Tijuana','Monterrey'].some(c => city.includes(c))) setVisitorCountry('MX');
        else setVisitorCountry('US');
      } else if (tz.startsWith('Europe/')) setVisitorCountry('DE');
      else if (tz.startsWith('Asia/Tokyo')) setVisitorCountry('JP');
      else if (tz.startsWith('Australia/')) setVisitorCountry('AU');
      else if (tz.startsWith('America/Sao_Paulo') || tz.startsWith('America/Fortaleza')) setVisitorCountry('BR');
      else setVisitorCountry('US');
    } catch { setVisitorCountry('US'); }
  }, []);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [imageSearching, setImageSearching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const skipNextSearch = useRef(false);

  const handleImageSearch = useCallback(async (file: File) => {
    setImageSearching(true);
    setQuery('');
    setProducts([]);
    try {
      const reader = new FileReader();
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const resized = await new Promise<string>((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w <= 800 && h <= 800) { resolve(dataUrl); return; }
          if (w > h) { h = Math.round(h * 800 / w); w = 800; }
          else { w = Math.round(w * 800 / h); h = 800; }
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d')?.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.85));
        };
        img.src = dataUrl;
      });
      const res = await fetch('/api/catalog/image-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, image: resized }),
      });
      const data = await res.json();
      if (data.keywords) {
        skipNextSearch.current = true;
        setQuery(data.keywords);
      }
      setProducts(data.products || []);
    } catch {
      setProducts([]);
    } finally {
      setImageSearching(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [slug]);

  useEffect(() => {
    const shop = document.getElementById('shop');
    if (!shop) return;
    const heading = shop.querySelector('h2, h3');
    if (!heading) return;
    const container = document.createElement('div');
    container.id = 'catalog-search-portal';
    heading.parentNode?.insertBefore(container, heading.nextSibling);
    setPortalTarget(container);
    return () => { container.remove(); };
  }, []);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ slug });
      if (query.trim()) params.set('q', query.trim());
      if (sort) params.set('sort', sort);
      if (visitorCountry) params.set('country', visitorCountry);
      const res = await fetch('/api/catalog/search?' + params.toString());
      const data = await res.json();
      setProducts(data.products || []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [query, slug, sort]);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) search();
      else setProducts([]);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, search]);

  const content = (
    <div style={{ width: '100%', maxWidth: 1200, margin: '2rem auto 2.5rem', padding: '0 1rem' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t.placeholder}
            style={{
              width: '100%',
              padding: '14px 50px 14px 18px', fontSize: 15,
              border: '1px solid ' + tokens.inputBorder,
              borderRadius: 10, outline: 'none',
              background: tokens.inputBg, color: tokens.inputText,
              boxSizing: 'border-box',
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSearch(f); }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={imageSearching}
            title="Search by image"
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', fontSize: 20,
              cursor: imageSearching ? 'wait' : 'pointer',
              opacity: imageSearching ? 0.4 : 0.6,
              transition: 'opacity 0.2s',
              padding: 4,
              color: tokens.inputText,
            }}
          >
            {imageSearching ? '⏳' : '📷'}
          </button>
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          style={{
            padding: '10px 14px', borderRadius: 10, fontSize: 14,
            border: '1px solid ' + tokens.inputBorder,
            background: tokens.inputBg, color: tokens.inputText, cursor: 'pointer',
          }}
        >
          <option value="relevance">Relevance</option>
          <option value="price_asc">Price up</option>
          <option value="price_desc">Price down</option>
          <option value="shipping">Delivery up</option>
        </select>
      </div>

      {loading && <p style={{ textAlign: 'center', color: tokens.textMuted }}>...</p>}
      {!loading && products.length === 0 && query.length >= 2 && (
        <p style={{ textAlign: 'center', color: tokens.textMuted }}>{t.noResults}</p>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 20,
      }}>
        {products.map(p => (
          <div
            key={p.id}
            onClick={() => setSelectedProduct(p)}
            style={{
              background: tokens.cardBg,
              border: '1px solid ' + tokens.cardBorder,
              borderRadius: 14, overflow: 'hidden',
              cursor: 'pointer', transition: 'all 0.25s ease',
              color: tokens.text,
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{
              width: '100%', aspectRatio: '1',
              background: tokens.cardHover,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {p.images?.[0] ? (
                <img src={p.images[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s' }} />
              ) : (
                <span style={{ opacity: 0.2, fontSize: 40 }}>?</span>
              )}
            </div>
            <div style={{ padding: 16 }}>
              <p style={{
                fontSize: 14, lineHeight: 1.4, margin: '0 0 10px',
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                minHeight: 40, color: tokens.text,
              }}>{p.name}</p>
              <p style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: tokens.text }}>
                ${p.price.toFixed(2)}
              </p>
              <div style={{ fontSize: 12, color: tokens.textMuted, marginBottom: 12 }}>
{(() => { const flags: Record<string,string> = {"US":"🇺🇸","CN":"🇨🇳","DE":"🇩🇪","TH":"🇹🇭","JP":"🇯🇵","BR":"🇧🇷","CA":"🇨🇦","MX":"🇲🇽","AU":"🇦🇺","EU":"🇪🇺"}; return (flags[p.warehouse_country] || "") + " Ships from " + (p.warehouse_country || ""); })()}
              </div>

            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (!portalTarget) return null;
  return (
    <>
      {createPortal(content, portalTarget)}
      {selectedProduct && typeof document !== 'undefined' && createPortal(
        <ProductModal
          product={selectedProduct as any}
          primary={primary}
          lang={lang}
          theme={theme}
          onClose={() => setSelectedProduct(null)}
        />,
        document.body
      )}
    </>
  );
}
