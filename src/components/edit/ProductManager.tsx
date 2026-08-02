'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/translations';

// Couleur accent admin Nexiora — changer ici se répercute partout dans ce composant.
const ACCENT = '#FA5D1E';

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  images: string[];
  stock: number;
  published: boolean;
  position: number;
};

type Draft = {
  name: string;
  description: string;
  price: string;
  currency: string;
  images: string[];
  stock: string;
  published: boolean;
};

const EMPTY_DRAFT: Draft = {
  name: '', description: '', price: '', currency: 'CAD',
  images: [], stock: '0', published: true,
};

export default function ProductManager({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');

  async function authHeaders(): Promise<HeadersInit> {
    const { data } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    };
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/shop/products?slug=${encodeURIComponent(slug)}`, {
        headers: await authHeaders(),
      });
      const json = await res.json();
      if (res.ok) setProducts(json.products ?? []);
      else setMsg(json.error ?? 'Erreur de chargement');
    } catch (e: any) {
      setMsg(e.message);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [slug]);

  useEffect(() => {
    const handler = () => load();
    window.addEventListener('products-updated', handler);
    return () => window.removeEventListener('products-updated', handler);
  }, [slug]);

  function resetForm() {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  }

  async function handleImageUpload(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg('');
    const ext = file.name.split('.').pop();
    const path = `${slug}/products/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('site-images').upload(path, file);
    if (error) {
      setMsg('Erreur upload : ' + error.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from('site-images').getPublicUrl(path);
    setDraft((d) => ({ ...d, images: [...d.images, data.publicUrl] }));
    setUploading(false);
  }

  function removeImage(url: string) {
    setDraft((d) => ({ ...d, images: d.images.filter((i) => i !== url) }));
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setDraft({
      name: p.name,
      description: p.description ?? '',
      price: String(p.price),
      currency: p.currency,
      images: p.images ?? [],
      stock: String(p.stock),
      published: p.published,
    });
    setMsg('');
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  async function handleSubmit() {
    if (!draft.name.trim()) { setMsg('Le nom est requis'); return; }
    setBusy(true);
    setMsg('');
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      price: parseFloat(draft.price) || 0,
      currency: draft.currency,
      images: draft.images,
      stock: parseInt(draft.stock) || 0,
      published: draft.published,
    };
    try {
      let res: Response;
      if (editingId) {
        res = await fetch(`/api/shop/products/${editingId}`, {
          method: 'PATCH', headers: await authHeaders(), body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/shop/products', {
          method: 'POST', headers: await authHeaders(), body: JSON.stringify({ slug, ...payload }),
        });
      }
      const json = await res.json();
      if (!res.ok) { setMsg(json.error ?? 'Erreur'); setBusy(false); return; }
      resetForm();
      await load();
    } catch (e: any) {
      setMsg(e.message);
    }
    setBusy(false);
  }

  async function handleDelete(id: string) {
    if (!confirm(t('pm.confirmDelete'))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/shop/products/${id}`, {
        method: 'DELETE', headers: await authHeaders(),
      });
      if (res.ok) { if (editingId === id) resetForm(); await load(); }
    } catch (e: any) {
      setMsg(e.message);
    }
    setBusy(false);
  }

  return (
    <div className="glass glass-hover rounded-3xl p-6 md:p-8 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white">{t('pm.title')}</h3>
        <p className="text-sm text-white/40 mt-1">{t('pm.subtitle')}</p>
      </div>

      {/* Liste produits */}
      {loading ? (
        <p className="text-white/40 text-sm">Chargement…</p>
      ) : products.length === 0 ? (
        <p className="text-white/40 text-sm">{t('pm.empty')}</p>
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <div key={p.id} className="flex items-center gap-4 bg-white/[0.02] border border-white/10 rounded-2xl p-3">
              {p.images?.[0]
                ? <img src={p.images[0]} alt={p.name} className="w-14 h-14 rounded-xl object-cover border border-white/10" />
                : <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white truncate">{p.name}</span>
                  {!p.published && <span className="text-[10px] uppercase tracking-wide text-white/40 border border-white/15 rounded-full px-2 py-0.5">{t('pm.hidden')}</span>}
                </div>
                <div className="text-sm text-white/50">{p.price.toFixed(2)} {p.currency} · stock {p.stock}</div>
              </div>
              <button onClick={() => startEdit(p)} className="text-sm px-3 py-1.5 rounded-lg transition" style={{ background: `${ACCENT}1a`, color: ACCENT }}>{t('pm.edit')}</button>
              <button onClick={() => handleDelete(p.id)} disabled={busy} className="text-sm px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 transition">{t('pm.delete')}</button>
            </div>
          ))}
        </div>
      )}

      {/* Formulaire */}
      <div ref={formRef} className="pt-6 border-t border-white/10 space-y-4">
        <p className="text-sm font-semibold text-white/70">{editingId ? t('pm.formEdit') : t('pm.formNew')}</p>

        <PField label={t('pm.field.name')}>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-white/30 transition" />
        </PField>

        <PField label={t('pm.field.description')}>
          <textarea value={draft.description} rows={3} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-white/30 transition resize-y" />
        </PField>

        <div className="grid grid-cols-3 gap-3">
          <PField label={t('pm.field.price')}>
            <input type="number" step="0.01" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-white/30 transition" />
          </PField>
          <PField label={t('pm.field.currency')}>
            <input value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-white/30 transition" />
          </PField>
          <PField label={t('pm.field.stock')}>
            <input type="number" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-white/30 transition" />
          </PField>
        </div>

        <PField label={t('pm.field.images')}>
          {draft.images.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {draft.images.map((url) => (
                <div key={url} className="relative">
                  <img src={url} alt="" className="w-16 h-16 rounded-xl object-cover border border-white/10" />
                  <button onClick={() => removeImage(url)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/80 text-white text-xs border border-white/20">×</button>
                </div>
              ))}
            </div>
          )}
          <label className="block w-full text-center py-3 rounded-xl cursor-pointer font-semibold transition border"
            style={{ background: `${ACCENT}1a`, color: ACCENT, borderColor: `${ACCENT}33` }}>
            {uploading ? t('pm.uploading') : t('pm.addImage')}
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
        </PField>

        <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
          <input type="checkbox" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} />
          Visible sur le site
        </label>

        <div className="flex gap-3">
          <button onClick={handleSubmit} disabled={busy}
            className="flex-1 py-3 rounded-2xl font-semibold transition disabled:opacity-40"
            style={{ background: ACCENT, color: '#fff' }}>
            {busy ? '…' : editingId ? t('pm.save') : t('pm.add')}
          </button>
          {editingId && (
            <button onClick={resetForm} className="px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white/60 font-semibold transition">{t('pm.cancel')}</button>
          )}
        </div>

        {msg && <p className="text-sm text-white/60">{msg}</p>}
      </div>
    </div>
  );
}

function PField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-white/50 mb-2">{label}</label>
      {children}
    </div>
  );
}
