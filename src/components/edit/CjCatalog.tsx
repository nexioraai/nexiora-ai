'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const ACCENT = '#E07040';

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` };
}

type Category = { categoryId: string; categoryName: string };
type FlatCategory = { id: string; label: string };

function flattenCategories(raw: any[]): FlatCategory[] {
  const flat: FlatCategory[] = [];
  for (const first of raw || []) {
    for (const second of first.categoryFirstList || []) {
      for (const cat of second.categorySecondList || []) {
        flat.push({ id: cat.categoryId, label: `${first.categoryFirstName} › ${cat.categoryName}` });
      }
    }
  }
  return flat.sort((a, b) => a.label.localeCompare(b.label));
}

export default function CjCatalog({ slug }: { slug: string }) {
  const [keyword, setKeyword] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [mode, setMode] = useState<'search' | 'direct'>('search');
  const pageSize = 50;

  // Filtres
  const [categoryId, setCategoryId] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState<'' | 'asc' | 'desc'>('');
  const [showFilters, setShowFilters] = useState(false);

  // Catégories
  const [categories, setCategories] = useState<FlatCategory[]>([]);
  const [catsLoaded, setCatsLoaded] = useState(false);

  const loadCategories = async () => {
    if (catsLoaded) return;
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/shop/cj/categories?slug=${encodeURIComponent(slug)}`, { headers });
      const data = await res.json();
      if (data.categories) {
        setCategories(flattenCategories(data.categories));
        setCatsLoaded(true);
      }
    } catch {}
  };

  const toggle = (pid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  const handleSearch = async (p = 1) => {
    if (!keyword.trim()) return;
    setBusy(true);
    setError('');
    setMsg('');
    if (p === 1) setSelected(new Set());
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/shop/cj/search', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          keyword,
          page: p,
          categoryId: categoryId || undefined,
          minPrice: minPrice ? Number(minPrice) : undefined,
          maxPrice: maxPrice ? Number(maxPrice) : undefined,
          sortBy: sortBy || undefined,
          sortOrder: sortOrder || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setProducts(data.products || []);
      setTotal(data.total || 0);
      setPage(data.page || 1);
      setMode(data.mode || 'search');
      if ((data.products || []).length === 0) setMsg('Aucun produit trouvé.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    setError('');
    setMsg('');
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/shop/cj/import', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, pids: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setMsg(`${data.imported} produit(s) importé(s)${data.errors?.length ? ' — Erreurs: ' + data.errors.join(', ') : ''}.`);
      window.dispatchEvent(new Event('products-updated'));
      setSelected(new Set());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-sm mt-8">
      <h2 className="text-xl font-bold mb-2">Catalogue CJ</h2>
      <p className="text-sm text-white/50 mb-5">
        Recherchez par nom, SKU (ex: CJWJWJYZ01847), PID, ou collez une URL CJ.
      </p>

      {/* Barre de recherche */}
      <div className="flex items-center gap-3 mb-3">
        <input
          type="text"
          placeholder="Nom, SKU, PID ou URL CJ…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch(1)}
          className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[#E07040] transition"
        />
        <button
          onClick={() => handleSearch(1)}
          disabled={busy}
          className="px-5 py-3 rounded-xl text-sm font-semibold transition disabled:opacity-40"
          style={{ background: `${ACCENT}1a`, color: ACCENT, border: `1px solid ${ACCENT}33` }}
        >
          {busy ? '…' : 'Rechercher'}
        </button>
      </div>

      {/* Toggle filtres */}
      <button
        onClick={() => { setShowFilters(!showFilters); if (!catsLoaded) loadCategories(); }}
        className="text-xs text-white/40 hover:text-white/70 mb-4 transition"
      >
        {showFilters ? '▾ Masquer les filtres' : '▸ Filtres avancés (catégorie, prix, tri)'}
      </button>

      {/* Filtres */}
      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#E07040]"
          >
            <option value="">Toutes catégories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Prix min"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#E07040]"
            />
            <input
              type="number"
              placeholder="Prix max"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#E07040]"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#E07040]"
          >
            <option value="">Tri par défaut</option>
            <option value="sellPrice">Prix</option>
            <option value="createTime">Nouveauté</option>
            <option value="listingCount">Popularité</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as '' | 'asc' | 'desc')}
            className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#E07040]"
          >
            <option value="">Ordre</option>
            <option value="asc">Croissant</option>
            <option value="desc">Décroissant</option>
          </select>
        </div>
      )}

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {msg && <p className="text-sm text-white/60 mb-3">{msg}</p>}

      {/* Barre d'action */}
      {products.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-white/50">
            {mode === 'direct' ? 'Résultat direct' : `${total} produit(s) — page ${page}/${totalPages}`}
            {selected.size > 0 && ` · ${selected.size} sélectionné(s)`}
          </span>
          <button
            onClick={handleImport}
            disabled={importing || selected.size === 0}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-40"
            style={{ background: `${ACCENT}1a`, color: ACCENT, border: `1px solid ${ACCENT}33` }}
          >
            {importing ? 'Import…' : `Importer (${selected.size})`}
          </button>
        </div>
      )}

      {/* Grille produits */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((p) => {
          const pid = p.id || p.pid;
          const isSel = selected.has(pid);
          return (
            <div
              key={pid}
              onClick={() => toggle(pid)}
              className="relative bg-black/20 border rounded-2xl p-3 flex flex-col cursor-pointer transition hover:bg-black/30"
              style={{ borderColor: isSel ? ACCENT : 'rgba(255,255,255,0.1)' }}
            >
              <div
                className="absolute top-2 right-2 w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold"
                style={{ background: isSel ? ACCENT : 'rgba(0,0,0,0.4)', color: '#fff', border: `1px solid ${ACCENT}55` }}
              >
                {isSel ? '✓' : ''}
              </div>
              {(p.bigImage || p.productImage) && (
                <img
                  src={p.bigImage || p.productImage}
                  alt=""
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  className="w-full h-32 object-cover rounded-xl mb-2"
                />
              )}
              <p className="text-xs text-white/70 line-clamp-2 mb-1">{p.nameEn || p.productNameEn}</p>
              {(p.sku || p.productSku) && (
                <p className="text-[10px] text-white/30 mb-1 font-mono">{p.sku || p.productSku}</p>
              )}
              <p className="text-sm font-semibold mt-auto" style={{ color: ACCENT }}>
                  {(p.sellPrice || p.nowPrice) && !isNaN(Number(p.sellPrice || p.nowPrice))
                    ? `${Number(p.sellPrice || p.nowPrice).toFixed(2)} USD`
                    : 'Prix N/D'}
                </p>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {mode === 'search' && totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => handleSearch(page - 1)}
            disabled={page <= 1 || busy}
            className="px-4 py-2 rounded-xl text-sm transition disabled:opacity-30"
            style={{ background: `${ACCENT}1a`, color: ACCENT, border: `1px solid ${ACCENT}33` }}
          >
            ← Précédent
          </button>
          <span className="text-sm text-white/50">{page} / {totalPages}</span>
          <button
            onClick={() => handleSearch(page + 1)}
            disabled={page >= totalPages || busy}
            className="px-4 py-2 rounded-xl text-sm transition disabled:opacity-30"
            style={{ background: `${ACCENT}1a`, color: ACCENT, border: `1px solid ${ACCENT}33` }}
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  );
}
