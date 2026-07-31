'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/translations';
import { Package, Truck, CheckCircle, XCircle } from 'lucide-react';

const ACCENT = '#FA5D1E';

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

const TABS = [
  { key: 'pending,paid', tkey: 'om.tab.inProgress', icon: 'Package', color: '#fbbf24' },
  { key: 'shipped', tkey: 'om.tab.shipped', icon: 'Truck', color: '#60a5fa' },
  { key: 'delivered', tkey: 'om.tab.delivered', icon: 'CheckCircle', color: '#34d399' },
  { key: 'canceled', tkey: 'om.tab.canceled', icon: 'XCircle', color: '#9ca3af' },
] as const;

const STATUS_LABELS: Record<string, { tkey: string; color: string }> = {
  pending: { tkey: 'om.status.pending', color: '#fbbf24' },
  paid: { tkey: 'om.status.paid', color: '#34d399' },
  shipped: { tkey: 'om.status.shipped', color: '#60a5fa' },
  delivered: { tkey: 'om.status.delivered', color: '#10b981' },
  canceled: { tkey: 'om.status.canceled', color: '#9ca3af' },
};

const ICONS: Record<string, typeof Package> = { Package, Truck, CheckCircle, XCircle };

function formatAddress(addr: any): string {
  if (!addr) return '—';
  const parts = [addr.line1, addr.line2, addr.postal_code, addr.city, addr.state, addr.country].filter(Boolean);
  return parts.join(', ');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function OrderManager({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(TABS[0].key);

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

  const statuses = activeTab.split(',');
  const filtered = orders.filter((o) => statuses.includes(o.status));

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-sm mt-8">
      <h2 className="text-xl font-bold mb-5">{t('om.title')}</h2>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {TABS.map((tab) => {
          const Icon = ICONS[tab.icon];
          const count = orders.filter((o) => tab.key.split(',').includes(o.status)).length;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                active
                  ? 'border-2'
                  : 'border border-white/10 text-white/50 hover:text-white/80 hover:border-white/20'
              }`}
              style={active ? { borderColor: tab.color, color: tab.color, background: `${tab.color}15` } : {}}
            >
              <Icon className="w-4 h-4" />
              {t(tab.tkey as any)}
              {count > 0 && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                  style={active ? { background: `${tab.color}30`, color: tab.color } : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Orders */}
      {loading ? (
        <p className="text-sm text-white/40">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-white/40">{t('om.empty')}</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((o) => {
            const st = STATUS_LABELS[o.status] || { tkey: '', color: '#9ca3af' };
            const stLabel = st.tkey ? t(st.tkey as any) : o.status;
            return (
              <div key={o.id} className="border border-white/10 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: st.color }} />
                    <span className="text-sm font-semibold" style={{ color: st.color }}>{stLabel}</span>
                    <span className="text-xs text-white/30">{formatDate(o.created_at)}</span>
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
                      placeholder={t('om.trackingPlaceholder')}
                      value={tracking[o.id] || ''}
                      onChange={(e) => setTracking({ ...tracking, [o.id]: e.target.value })}
                      className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FA5D1E] transition"
                    />
                    <button
                      onClick={() => markShipped(o.id)}
                      disabled={busyId === o.id}
                      className="px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-40 whitespace-nowrap"
                      style={{ background: `${ACCENT}1a`, color: ACCENT, border: `1px solid ${ACCENT}33` }}
                    >
                      {busyId === o.id ? '…' : t('om.markShipped')}
                    </button>
                  </div>
                )}

                {o.tracking_number && (
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
