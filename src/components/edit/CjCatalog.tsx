'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const ACCENT = '#E07040';

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` };
}

export default function CjCatalog({ slug }: { slug: string }) {
  const [keyword, setKeyword] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const toggle = (pid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    setBusy(true);
    setError('');
    setMsg('');
    setSelected(new Set());
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/shop/cj/search', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, keyword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setProducts(data.products || []);
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
      setMsg(`${data.imported} produit(s) importé(s) — ajuste les prix dans la liste des produits.`);
      setSelected(new Set());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-sm mt-8">
      <h2 className="text-xl font-bold mb-2">Catalogue CJ</h2>
      <p className="text-sm text-white/50 mb-5">
        Recherche des produits CJ, coche ceux à importer, puis ajuste leurs prix avant publication.
      </p>

      <div className="flex items-center gap-3 mb-5">
        <input
          type="text"
          placeholder="Mot-clé (ex. watch, lamp…)"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#E07040] transition"
        />
        <button
          onClick={handleSearch}
          disabled={busy}
          className="px-5 py-3 rounded-xl text-sm font-semibold transition disabled:opacity-40"
          style={{ background: `${ACCENT}1a`, color: ACCENT, border: `1px solid ${ACCENT}33` }}
        >
          {busy ? '…' : 'Rechercher'}
        </button>
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {msg && <p className="text-sm text-white/60 mb-3">{msg}</p>}

      {products.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-white/50">{selected.size} sélectionné(s)</span>
          <button
            onClick={handleImport}
            disabled={importing || selected.size === 0}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-40"
            style={{ background: `${ACCENT}1a`, color: ACCENT, border: `1px solid ${ACCENT}33` }}
          >
            {importing ? 'Import…' : `Importer la sélection (${selected.size})`}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {products.map((p) => {
          const isSel = selected.has(p.pid);
          return (
            <div
              key={p.pid}
              onClick={() => toggle(p.pid)}
              className="relative bg-black/20 border rounded-2xl p-3 flex flex-col cursor-pointer transition"
              style={{ borderColor: isSel ? ACCENT : 'rgba(255,255,255,0.1)' }}
            >
              <div
                className="absolute top-2 right-2 w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold"
                style={{ background: isSel ? ACCENT : 'rgba(0,0,0,0.4)', color: '#fff', border: `1px solid ${ACCENT}55` }}
              >
                {isSel ? '✓' : ''}
              </div>
              {p.bigImage && (
                <img src={p.bigImage} alt={p.productNameEn} className="w-full h-32 object-cover rounded-xl mb-2" />
              )}
              <p className="text-xs text-white/70 line-clamp-2">{p.productNameEn}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
