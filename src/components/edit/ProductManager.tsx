'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/translations';
// DETTE 6c — l'etat initial du formulaire, la lecture d'un produit existant
// et la charge envoyee vivent desormais dans un module PUR, verifiable sans
// jsdom (ce depot n'en a pas). Ce composant ne garde que le rendu et les
// appels reseau. Voir productDraft.ts pour le raisonnement complet.
import { EMPTY_DRAFT, draftFromProduct, payloadFromDraft, type ProductDraft } from './productDraft';

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
  /** ÉTAPE 7 — politique d'inventaire. `false` = stock non suivi, `stock` inerte. */
  track_inventory: boolean;
  published: boolean;
  /** ÉTAPE 8, VOLET A — achetabilité. `false` = présenté mais non vendable. */
  for_sale: boolean;
  position: number;
};

export default function ProductManager({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  // ÉTAPE 7 — état de la CRÉATION uniquement. Jamais lu par le PATCH.
  const [createStock, setCreateStock] = useState('0');
  // ÉTAPE 7 — état de l'ACTE de comptage, strictement séparé de `draft`.
  const [countUnits, setCountUnits] = useState('');
  const [countBusy, setCountBusy] = useState(false);
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
    setCreateStock('0');
    setCountUnits('');
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
    setDraft(draftFromProduct(p));
    // Le comptage ne se pré-remplit PAS avec le stock actuel : un champ
    // pré-rempli invite à re-valider une valeur qu'on n'a pas comptée, ce qui
    // est précisément l'affirmation sans preuve que la barrière de l'étape 2
    // refuse. Le marchand saisit ce qu'il vient de compter, ou rien.
    setCountUnits('');
    setMsg('');
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  async function handleSubmit() {
    if (!draft.name.trim()) { setMsg('Le nom est requis'); return; }
    setBusy(true);
    setMsg('');
    const payload = payloadFromDraft(draft);
    try {
      let res: Response;
      if (editingId) {
        res = await fetch(`/api/shop/products/${editingId}`, {
          method: 'PATCH', headers: await authHeaders(), body: JSON.stringify(payload),
        });
      } else {
        // Seul le POST porte un stock : c'est le stock de départ d'un produit
        // qui n'existait pas encore, pas la révision d'un compteur existant.
        res = await fetch('/api/shop/products', {
          method: 'POST', headers: await authHeaders(),
          body: JSON.stringify({ slug, ...payload, stock: parseInt(createStock) || 0 }),
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

  /**
   * ÉTAPE 7 — ACTE DE COMPTAGE. Passe par la route d'inventaire dédiée, jamais
   * par le PATCH générique : `track_inventory` et `stock_counted_at` sont
   * exclus de ses allowlists (étape 6), et seule la RPC `enable_stock_tracking`
   * pose les trois colonnes ensemble en faisant avancer l'horodatage de
   * comptage — ce que la barrière de l'étape 2 exige pour rouvrir un suivi.
   */
  async function handleCount(id: string) {
    const units = parseInt(countUnits, 10);
    if (!Number.isInteger(units) || units < 0) { setMsg(t('pm.inv.invalid')); return; }
    setCountBusy(true);
    setMsg('');
    try {
      const res = await fetch(`/api/shop/products/${id}/inventory`, {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify({ units }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json.error ?? t('pm.inv.failed')); setCountBusy(false); return; }
      setCountUnits('');
      await load();
      setMsg(t('pm.inv.counted'));
    } catch (e: any) {
      setMsg(e.message);
    }
    setCountBusy(false);
  }

  /**
   * ÉTAPE 7 — ARRÊT DU SUIVI. `track_inventory = false` seul, côté serveur.
   * `stock_counted_at` n'est pas effacé : c'est la preuve du dernier comptage
   * réel, et elle doit survivre pour qu'une réactivation future soit jugeable.
   */
  async function handleStopTracking(id: string) {
    setCountBusy(true);
    setMsg('');
    try {
      const res = await fetch(`/api/shop/products/${id}/inventory`, {
        method: 'DELETE', headers: await authHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json.error ?? t('pm.inv.failed')); setCountBusy(false); return; }
      await load();
      setMsg(t('pm.inv.stopped'));
    } catch (e: any) {
      setMsg(e.message);
    }
    setCountBusy(false);
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
                  {p.for_sale === false && <span className="text-[10px] uppercase tracking-wide text-white/40 border border-white/15 rounded-full px-2 py-0.5">{t('pm.notForSale')}</span>}
                </div>
                <div className="text-sm text-white/50">
                  {p.price.toFixed(2)} {p.currency} · {p.track_inventory === false ? t('pm.inv.untracked') : `${t('pm.field.stock')} ${p.stock}`}
                </div>
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

        <div className={editingId ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-3 gap-3'}>
          <PField label={t('pm.field.price')}>
            <input type="number" step="0.01" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-white/30 transition" />
          </PField>
          <PField label={t('pm.field.currency')}>
            <input value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-white/30 transition" />
          </PField>
          {/* ÉTAPE 7 — le stock ne se saisit dans CE formulaire qu'à la
              création. En édition, il relève de l'acte de comptage ci-dessous :
              un champ de sauvegarde générale ne peut pas affirmer un comptage. */}
          {!editingId && (
            <PField label={t('pm.field.stock')}>
              <input type="number" value={createStock} onChange={(e) => setCreateStock(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-white/30 transition" />
            </PField>
          )}
        </div>

        {/* ===== ÉTAPE 7 — INVENTAIRE : UN ACTE, PAS UN CHAMP =====
            Rendu HORS du flux de sauvegarde : ses boutons appellent la route
            d'inventaire directement et ne touchent jamais `draft`. Le bouton
            « Enregistrer » ne peut donc ni le déclencher, ni l'annuler, ni
            écraser son résultat. */}
        {editingId && (() => {
          const current = products.find((p) => p.id === editingId);
          const tracked = current?.track_inventory !== false;
          return (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white/70">{t('pm.inv.title')}</span>
                <span className="text-xs text-white/40">
                  {tracked ? `${t('pm.inv.tracked')} · ${current?.stock ?? 0}` : t('pm.inv.untracked')}
                </span>
              </div>
              <p className="text-xs text-white/40">{t('pm.inv.help')}</p>
              <div className="flex gap-2">
                <input type="number" min="0" value={countUnits} placeholder={t('pm.inv.placeholder')}
                  onChange={(e) => setCountUnits(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-white/30 transition" />
                <button type="button" onClick={() => handleCount(editingId)} disabled={countBusy}
                  className="px-4 py-2.5 rounded-xl font-semibold transition disabled:opacity-40"
                  style={{ background: `${ACCENT}1a`, color: ACCENT }}>
                  {t('pm.inv.count')}
                </button>
              </div>
              {tracked && (
                <button type="button" onClick={() => handleStopTracking(editingId)} disabled={countBusy}
                  className="text-xs text-white/40 hover:text-white/70 underline transition disabled:opacity-40">
                  {t('pm.inv.stop')}
                </button>
              )}
            </div>
          );
        })()}

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

        {/* ÉTAPE 8, VOLET A — DEUX cases, et non une. `published` décide de ce
            que le visiteur VOIT ; `for_sale` de ce qu'il peut PAYER. Les
            confondre était le défaut : retirer un produit de la vente
            obligeait à le faire disparaître de la vitrine, de sa fiche et du
            sitemap. Elles restent côte à côte parce que le marchand les pense
            ensemble, mais elles ne sont jamais liées dans le code. */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
            <input type="checkbox" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} />
            {t('pm.field.published')}
          </label>
          <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
            <input type="checkbox" checked={draft.for_sale} onChange={(e) => setDraft({ ...draft, for_sale: e.target.checked })} />
            {t('pm.field.forSale')}
          </label>
          <p className="text-xs text-white/40">{t('pm.forSale.help')}</p>
        </div>

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
