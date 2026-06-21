'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const ACCENT = '#E07040';

type OrderItem = { product_name: string; quantity: number; unit_price: number };
type Order = {
  id: string;
  status: string;
  total: number;
  currency: string;
  customer_email: string | null;
  customer_name: string | null;
  shipping_address: any;
  tracking_number: string | null;
  created_at: string;
  shop_order_items: OrderItem[];
};

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: '#fbbf24' },
  paid: { label: 'Payée', color: '#34d399' },
  shipped: { label: 'Expédiée', color: '#60a5fa' },
  canceled: { label: 'Annulée', color: '#9ca3af' },
};

function formatAddress(addr: any): string {
  if (!addr) return '—';
  const parts = [addr.line1, addr.line2, addr.postal_code, addr.city, addr.state, addr.country].filter(Boolean);
  return parts.join(', ');
}

export default function OrderManager({ slug }: { slug: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/shop/orders?slug=${encodeURIComponent(slug)}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setOrders(data.orders);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [slug]);

  const markShipped = async (orderId: string) => {
    setBusyId(orderId);
    setError('');
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/shop/orders', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, orderId, trackingNumber: tracking[orderId] || '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-sm mt-8">
      <h2 className="text-xl font-bold mb-2">Commandes</h2>
      <p className="text-sm text-white/50 mb-5">
        Les commandes payées de ta boutique. Prépare l'envoi, puis marque comme expédiée.
      </p>

      {loading ? (
        <p className="text-sm text-white/40">Chargement…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-white/40">Aucune commande pour l'instant.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const st = STATUS_LABELS[o.status] || { label: o.status, color: '#9ca3af' };
            return (
              <div key={o.id} className="border border-white/10 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: st.color }} />
                    <span className="text-sm font-semibold" style={{ color: st.color }}>{st.label}</span>
                  </div>
                  <span className="text-sm font-bold text-white">{o.total.toFixed(2)} {o.currency}</span>
                </div>

                <div className="text-sm text-white/70 space-y-1 mb-3">
                  {o.shop_order_items.map((it, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{it.quantity} × {it.product_name}</span>
                      <span className="text-white/40">{(it.unit_price * it.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="text-xs text-white/50 space-y-0.5 mb-3">
                  <p><span className="text-white/30">Client :</span> {o.customer_name || '—'} {o.customer_email ? `(${o.customer_email})` : ''}</p>
                  <p><span className="text-white/30">Livraison :</span> {formatAddress(o.shipping_address)}</p>
                </div>

                {o.status === 'paid' && (
                  <div className="flex items-center gap-2 pt-3 border-t border-white/10">
                    <input
                      placeholder="N° de suivi (optionnel)"
                      value={tracking[o.id] || ''}
                      onChange={(e) => setTracking({ ...tracking, [o.id]: e.target.value })}
                      className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#E07040] transition"
                    />
                    <button
                      onClick={() => markShipped(o.id)}
                      disabled={busyId === o.id}
                      className="px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-40 whitespace-nowrap"
                      style={{ background: `${ACCENT}1a`, color: ACCENT, border: `1px solid ${ACCENT}33` }}
                    >
                      {busyId === o.id ? '…' : 'Marquer expédiée'}
                    </button>
                  </div>
                )}

                {o.status === 'shipped' && o.tracking_number && (
                  <p className="text-xs text-white/50 pt-3 border-t border-white/10">
                    <span className="text-white/30">Suivi :</span> {o.tracking_number}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
    </div>
  );
}
