'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/translations';

const ACCENT = '#FA5D1E';

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` };
}

export default function PaymentConnect({ slug, mode }: { slug: string; mode?: number }) {
  const { t } = useTranslation();
  const isAutomated = mode === 3;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [shipping, setShipping] = useState('0');
  const [savingShip, setSavingShip] = useState(false);
  const [shipMsg, setShipMsg] = useState('');

  const loadStatus = async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/shop/connect/status?slug=${encodeURIComponent(slug)}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setConnected(data.connected);
      setReady(data.ready);
      const shipRes = await fetch(`/api/shop/shipping?slug=${encodeURIComponent(slug)}`, { headers });
      const shipData = await shipRes.json();
      if (shipRes.ok) setShipping(String(shipData.shippingFlat ?? 0));
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
      const res = await fetch('/api/shop/connect', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const handleSaveShipping = async () => {
    setSavingShip(true);
    setShipMsg('');
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/shop/shipping', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, shippingFlat: Number(shipping) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setShipMsg(t('pc.rateSaved'));
      setTimeout(() => setShipMsg(''), 3000);
    } catch (e: any) {
      setShipMsg(e.message);
    } finally {
      setSavingShip(false);
    }
  };

  return (
    <div className="glass glass-hover rounded-3xl p-6 md:p-8 mt-8">
      <h2 className="text-xl font-bold mb-2">Paiements</h2>
      <p className="text-sm text-white/50 mb-5">
        {isAutomated ? t('pc.introAutomated') : t('pc.introNormal')}
      </p>

      {loading ? (
        <p className="text-sm text-white/40">Chargement…</p>
      ) : ready ? (
        <div className="flex items-center gap-2 text-sm font-semibold text-green-400">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          {t('pc.connected')}
        </div>
      ) : connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-yellow-400">
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
            {t('pc.onboardingIncomplete')}
          </div>
          <button
            onClick={handleConnect}
            disabled={busy}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-40"
            style={{ background: `${ACCENT}1a`, color: ACCENT, border: `1px solid ${ACCENT}33` }}
          >
            {busy ? 'Redirection…' : 'Reprendre la configuration'}
          </button>
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={busy}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-40"
          style={{ background: `${ACCENT}1a`, color: ACCENT, border: `1px solid ${ACCENT}33` }}
        >
          {busy ? t('pc.redirecting') : t('pc.connectStripe')}
        </button>
      )}

      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

      {!isAutomated && (
        <div className="mt-8 pt-6 border-t border-white/10">
        <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold block mb-2">
          {t('pc.shippingLabel')}
        </label>
        <p className="text-sm text-white/50 mb-3">
          {t('pc.shippingHint')}
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="0"
            step="0.01"
            value={shipping}
            onChange={(e) => setShipping(e.target.value)}
            className="w-32 bg-white/[0.04] border border-white/10 backdrop-blur-sm rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#FA5D1E] transition"
          />
          <button
            onClick={handleSaveShipping}
            disabled={savingShip}
            className="px-5 py-3 rounded-xl text-sm font-semibold transition disabled:opacity-40"
            style={{ background: `${ACCENT}1a`, color: ACCENT, border: `1px solid ${ACCENT}33` }}
          >
            {savingShip ? '…' : t('pc.save')}
          </button>
          {shipMsg && <span className="text-sm text-white/60">{shipMsg}</span>}
        </div>
      </div>
      )}
    </div>
  );
}
