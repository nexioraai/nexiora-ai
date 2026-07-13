'use client';
import { useState, useEffect } from 'react';

const ACCENT = '#E07040';

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

export default function CatalogSelections({ slug }: { slug: string }) {
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [curating, setCurating] = useState(false);
  const [message, setMessage] = useState('');

  const fetchSelections = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/catalog/selections?slug=${slug}`);
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
        headers: { 'Content-Type': 'application/json' },
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
            headers: { 'Content-Type': 'application/json' },
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

  const handleApprove = async (id: string, approved: boolean) => {
    const res = await fetch('/api/catalog/selections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, id, sell_price: price }),
    });
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/catalog/selections?slug=${slug}&id=${id}`, { method: 'DELETE' });
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
        headers: { 'Content-Type': 'application/json' },
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
            const margin = s.sell_price && p.price ? Math.round(((s.sell_price - p.price) / s.sell_price) * 100) : 0;
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
                      onChange={(e) => handlePriceChange(s.id, Number(e.target.value))}
                      onBlur={(e) => handlePriceSave(s.id, Number(e.target.value))}
                      className="w-16 bg-white/10 border border-white/20 rounded px-1.5 py-1 text-sm text-white text-right"
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
