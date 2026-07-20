'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { resolveDisplayPrice, DEFAULT_MARGIN_PERCENT, DEFAULT_ROUND_MODE } from '@/lib/pricing';

const ACCENT = '#E07040';

/** Les routes catalog exigent le token du proprietaire du site. */
async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

interface Selection {
  id: string;
  sell_price: number;
  custom_name: string | null;
  custom_description: string | null;
  ai_suggested: boolean;
  merchant_approved: boolean;
  ai_reason: string | null;
  sort_order: number;
  catalog_products: {
    id: string;
    supplier_id: string;
    supplier_product_id: string;
    name: string;
    description: string;
    category: string;
    price: number;
    currency: string;
    images: string[];
    shipping_days_min: number;
    shipping_days_max: number;
    warehouse_country: string;
    in_stock: boolean;
  };
}

export default function CatalogSelections({
  slug,
  marginPercent = DEFAULT_MARGIN_PERCENT,
  roundMode = DEFAULT_ROUND_MODE,
}: {
  slug: string;
  marginPercent?: number;
  roundMode?: string;
}) {
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [curating, setCurating] = useState(false);
  const [message, setMessage] = useState('');

  const fetchSelections = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/catalog/selections?slug=${slug}`, {
        headers: await authHeaders(),
      });
      const data = await res.json();
      setSelections(data.selections || []);
    } catch (e: any) {
      setMessage('Erreur: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSelections(); }, [slug]);

  const handleCurate = async () => {
    setCurating(true);
    setMessage('');
    try {
      const res = await fetch('/api/catalog/curate', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (data.error) {
        setMessage('Erreur: ' + data.error);
      } else {
        setMessage(`${data.count} produits suggérés — optimisation des titres…`);
        await fetchSelections();
        // Auto-enhance titles
        try {
          const enhRes = await fetch('/api/catalog/enhance', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({ slug }),
          });
          const enhData = await enhRes.json();
          if (enhData.enhanced > 0) {
            setMessage(`${data.count} produits suggérés, ${enhData.enhanced} titres optimisés !`);
            await fetchSelections();
          }
        } catch {}
      }
    } catch (e: any) {
      setMessage('Erreur: ' + e.message);
    } finally {
      setCurating(false);
    }
  };

  // --- Ajout manuel depuis le catalogue global ---
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setMessage('');
    try {
      const res = await fetch(
        `/api/catalog/search?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      // Seul le catalogue global nous interesse : les produits deja cures
      // sont dans la liste du dessous.
      setResults((data.products || []).filter((p: any) => !p._curated));
    } catch (e: any) {
      setMessage('Erreur: ' + e.message);
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async (prefixedId: string) => {
    const catalogProductId = String(prefixedId).replace(/^catalog-/, '');
    setAdding(prefixedId);
    try {
      const res = await fetch('/api/catalog/selections', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ slug, catalogProductId }),
      });
      const data = await res.json();
      if (data.error) {
        setMessage('Erreur: ' + data.error);
      } else {
        setResults(prev => prev.filter(p => p.id !== prefixedId));
        await fetchSelections();
      }
    } catch (e: any) {
      setMessage('Erreur: ' + e.message);
    } finally {
      setAdding(null);
    }
  };

  const handleApprove = async (id: string, approved: boolean) => {
    const res = await fetch('/api/catalog/selections', {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ slug, id, merchant_approved: approved }),
    });
    if (res.ok) {
      setSelections(prev => prev.map(s => s.id === id ? { ...s, merchant_approved: approved } : s));
    }
  };

  const handlePriceChange = async (id: string, price: number) => {
    setSelections(prev => prev.map(s => s.id === id ? { ...s, sell_price: price } : s));
  };

  const handlePriceSave = async (id: string, price: number) => {
    await fetch('/api/catalog/selections', {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ slug, id, sell_price: price }),
    });
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/catalog/selections?slug=${slug}&id=${id}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    if (res.ok) {
      setSelections(prev => prev.filter(s => s.id !== id));
    }
  };

  const [enhancing, setEnhancing] = useState(false);

  const handleEnhance = async () => {
    setEnhancing(true);
    setMessage('');
    try {
      const res = await fetch('/api/catalog/enhance', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (data.error) {
        setMessage('Erreur: ' + data.error);
      } else {
        setMessage(`${data.enhanced} titres et descriptions optimisés !`);
        await fetchSelections();
      }
    } catch (e: any) {
      setMessage('Erreur: ' + e.message);
    } finally {
      setEnhancing(false);
    }
  };

  const approvedCount = selections.filter(s => s.merchant_approved).length;
  const unenhancedCount = selections.filter(s => !s.custom_name).length;

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Mes Produits Catalogue</h2>
          <p className="text-xs text-slate-400 mt-1">
            {selections.length} produits · {approvedCount} approuvés
          </p>
        </div>
        <button
          onClick={handleCurate}
          disabled={curating}
          className="px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-40"
          style={{ background: `${ACCENT}20`, color: ACCENT, border: `1px solid ${ACCENT}40` }}
        >
          {curating ? 'Analyse IA…' : selections.length > 0 ? '🔄 Re-générer suggestions' : '✨ Générer suggestions IA'}
        </button>
        {selections.length > 0 && unenhancedCount > 0 && (
          <button
            onClick={handleEnhance}
            disabled={enhancing}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-40"
            style={{ background: '#3b82f620', color: '#3b82f6', border: '1px solid #3b82f640' }}
          >
            {enhancing ? 'Réécriture…' : `✍️ Optimiser ${unenhancedCount} titres`}
          </button>
        )}
      </div>

      {message && (
        <div className={`p-3 rounded-xl text-sm ${message.startsWith('Erreur') ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-green-500/10 border border-green-500/20 text-green-400'}`}>
          {message}
        </div>
      )}

      <div className="border border-white/10 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-300">Ajouter un produit du catalogue</p>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="Rechercher : yoga mat, wireless earbuds…"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-white/25"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-40"
            style={{ background: `${ACCENT}20`, color: ACCENT, border: `1px solid ${ACCENT}40` }}
          >
            {searching ? 'Recherche…' : 'Rechercher'}
          </button>
        </div>

        {results.length > 0 && (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {results.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02] border border-white/5">
                {p.images?.[0] && (
                  <img src={p.images[0]} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{p.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {Number(p.price).toFixed(2)} {p.currency || 'CAD'} · {p.supplier_id}
                  </p>
                </div>
                <button
                  onClick={() => handleAdd(p.id)}
                  disabled={adding === p.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-40 flex-shrink-0"
                  style={{ background: '#34d39920', color: '#34d399', border: '1px solid #34d39940' }}
                >
                  {adding === p.id ? '…' : 'Ajouter'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-500 text-sm">Chargement…</div>
      ) : selections.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p className="text-sm">Aucun produit sélectionné.</p>
          <p className="text-xs mt-1">Cliquez sur "Générer suggestions IA" pour que Claude analyse votre niche.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {selections.map((s) => {
            const p = s.catalog_products;
            if (!p) return null;
            // Prix reellement affiche en boutique : meme fonction que la vitrine.
            const cost = Number(p.price) || 0;
            const shownPrice = resolveDisplayPrice(cost, s.sell_price, marginPercent, roundMode);
            // Marge sur le cout, la meme grandeur que le reglage du marchand.
            // Ne pas confondre avec le taux de marque, calcule sur le prix de vente.
            const margin = cost > 0 ? Math.round(((shownPrice - cost) / cost) * 100) : 0;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 p-3 rounded-xl transition ${
                  s.merchant_approved
                    ? 'bg-green-500/5 border border-green-500/20'
                    : 'bg-white/[0.03] border border-white/10'
                }`}
              >
                {p.images?.[0] ? (
                  <img src={p.images[0]} alt="" className="w-12 h-12 rounded-lg object-cover border border-white/10 flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center text-lg flex-shrink-0">{p.name?.charAt(0)}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{s.custom_name || p.name}</div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span>{p.supplier_id.toUpperCase()}</span>
                    <span>·</span>
                    <span>Coût: {p.price} {p.currency}</span>
                    <span>·</span>
                    <span>{p.shipping_days_min}j</span>
                    {s.ai_reason && (
                      <>
                        <span>·</span>
                        <span className="text-amber-400">{s.ai_reason}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={s.sell_price || ''}
                      placeholder={shownPrice > 0 ? shownPrice.toFixed(2) : ''}
                      title={s.sell_price ? 'Prix fixe manuellement : la marge ne s\'applique pas' : 'Prix calcule depuis la marge du site'}
                      onChange={(e) => handlePriceChange(s.id, Number(e.target.value))}
                      onBlur={(e) => handlePriceSave(s.id, Number(e.target.value))}
                      className="w-16 bg-white/10 border border-white/20 rounded px-1.5 py-1 text-sm text-white text-right placeholder:text-slate-500"
                    />
                    <span className="text-xs text-slate-400">{p.currency}</span>
                  </div>
                  {margin > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${margin >= 40 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      {margin}%
                    </span>
                  )}
                  <button
                    onClick={() => handleApprove(s.id, !s.merchant_approved)}
                    className={`p-1.5 rounded-lg transition ${s.merchant_approved ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-slate-500 hover:text-green-400'}`}
                    title={s.merchant_approved ? 'Retirer' : 'Approuver'}
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition"
                    title="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
