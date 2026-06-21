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
  const [cjEmail, setCjEmail] = useState('');
  const [cjApiKey, setCjApiKey] = useState('');
  const [error, setError] = useState('');

  const loadStatus = async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/shop/cj/connect/status?slug=${encodeURIComponent(slug)}`, { headers });
      const data = await res.json();
      if (res.ok) setConnected(data.connected);
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

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-sm mt-8">
      <h2 className="text-xl font-bold mb-2">Fournisseur (CJ Dropshipping)</h2>
      <p className="text-sm text-white/50 mb-5">
        Connecte ton compte CJ pour la commande automatique en dropshipping.
      </p>

      {loading ? (
        <p className="text-sm text-white/40">Chargement…</p>
      ) : connected ? (
        <div className="flex items-center gap-2 text-sm font-semibold text-green-400">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          Compte CJ connecté
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
