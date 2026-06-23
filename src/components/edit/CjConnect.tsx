'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const ACCENT = '#E07040';

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` };
}

export default function CjConnect({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [autoPay, setAutoPay] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);
  const [marginPercent, setMarginPercent] = useState('100');
  const [savingMargin, setSavingMargin] = useState(false);
  const [cjEmail, setCjEmail] = useState('');
  const [cjApiKey, setCjApiKey] = useState('');
  const [error, setError] = useState('');

  const loadStatus = async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/shop/cj/connect/status?slug=${encodeURIComponent(slug)}`, { headers });
      const data = await res.json();
      if (res.ok) { setConnected(data.connected); setAutoPay(!!data.autoPay); setMarginPercent(String(data.marginPercent ?? 100)); }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, [slug]);

  const handleConnect = async () => {
    setBusy(true);
    setError('');
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/shop/cj/connect', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, cjEmail, cjApiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setConnected(true);
      setCjApiKey('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveMargin = async () => {
    const m = Number(marginPercent);
    if (!Number.isFinite(m) || m < 0 || m > 1000) {
      setError('Markup invalide (0 à 1000).');
      return;
    }
    setSavingMargin(true);
    setError('');
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/shop/cj/connect/status', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, marginPercent: m }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingMargin(false);
    }
  };

  const handleToggleAutoPay = async () => {
    const next = !autoPay;
    setAutoPay(next);
    setSavingAuto(true);
    setError('');
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/shop/cj/connect/status', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, autoPay: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
    } catch (e: any) {
      setAutoPay(!next); // rollback
      setError(e.message);
    } finally {
      setSavingAuto(false);
    }
  };

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-sm mt-8">
      <h2 className="text-xl font-bold mb-2">Fournisseur (CJ Dropshipping)</h2>
      <p className="text-sm text-white/50 mb-5">
        Connecte ton compte CJ pour la commande automatique en dropshipping.
      </p>

      {loading ? (
        <p className="text-sm text-white/40">Chargement…</p>
      ) : connected ? (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            Compte CJ connecté
          </div>
          <div className="flex items-start justify-between gap-4 pt-4 border-t border-white/10">
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Paiement automatique CJ</p>
              <p className="text-xs text-white/40 mt-1">
                Si activé, chaque commande paie CJ automatiquement depuis le solde de ton compte CJ. Sinon, tu règles chaque commande manuellement sur CJ.
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleAutoPay}
              disabled={savingAuto}
              role="switch"
              aria-checked={autoPay}
              className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-40"
              style={{ background: autoPay ? ACCENT : 'rgba(255,255,255,0.15)' }}
            >
              <span
                className="inline-block h-4 w-4 rounded-full bg-white transition"
                style={{ transform: autoPay ? 'translateX(24px)' : 'translateX(4px)' }}
              />
            </button>
          </div>
          <div className="pt-4 border-t border-white/10">
            <p className="text-sm font-semibold text-white mb-1">Markup automatique (%)</p>
            <p className="text-xs text-white/40 mb-3">
              Pourcentage ajouté au prix d'achat CJ à l'import. Par défaut, Nexiora applique 100 % — un produit à 10 $ est vendu 20 $. La plupart des boutiques visent entre 60 et 200 % selon le produit. Ajuste selon la marge souhaitée.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={1000}
                value={marginPercent}
                onChange={(e) => setMarginPercent(e.target.value)}
                className="w-28 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#E07040] transition"
              />
              <span className="text-sm text-white/40">%</span>
              <button
                onClick={handleSaveMargin}
                disabled={savingMargin}
                className="ml-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-40"
                style={{ background: `${ACCENT}1a`, color: ACCENT, border: `1px solid ${ACCENT}33` }}
              >
                {savingMargin ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email CJ"
            value={cjEmail}
            onChange={(e) => setCjEmail(e.target.value)}
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#E07040] transition"
          />
          <input
            type="password"
            placeholder="Clé API CJ"
            value={cjApiKey}
            onChange={(e) => setCjApiKey(e.target.value)}
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#E07040] transition"
          />
          <button
            onClick={handleConnect}
            disabled={busy || !cjEmail || !cjApiKey}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-40"
            style={{ background: `${ACCENT}1a`, color: ACCENT, border: `1px solid ${ACCENT}33` }}
          >
            {busy ? 'Connexion…' : 'Connecter CJ Dropshipping'}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
    </div>
  );
}
