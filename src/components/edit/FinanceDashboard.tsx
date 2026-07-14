'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function FinanceDashboard({ slug }: { slug: string }) {
  const [data, setData] = useState<any>(null);
  const [period, setPeriod] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/shop/finances?slug=${slug}&period=${period}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) setData(await res.json());
      setLoading(false);
    })();
  }, [slug, period]);

  if (loading) return <div className="text-slate-400 text-sm py-8 text-center">Chargement finances...</div>;
  if (!data) return null;

  const { summary: s, chart } = data;
  const fmt = (n: number) => n.toFixed(2);

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-sm mt-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Finances</h2>
        <div className="flex gap-2">
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                period === d
                  ? 'bg-[#E07040]/20 text-[#E07040] border border-[#E07040]'
                  : 'text-slate-400 border border-white/10 hover:border-white/20'
              }`}
            >
              {d}j
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card label="Revenus" value={`${fmt(s.total_revenue)} ${s.currency}`} color="#3b82f6" />
        <Card label="Coût fournisseur" value={`${fmt(s.total_supplier_cost)} ${s.currency}`} color="#f59e0b" />
        <Card label="Commission Nexiora" value={`${fmt(s.total_commission)} ${s.currency}`} color="#E07040" />
        <Card label="Profit net" value={`${fmt(s.total_profit)} ${s.currency}`} color="#34d399" />
      </div>

      <div className="text-xs text-slate-400 mb-2">{s.order_count} commande{s.order_count > 1 ? 's' : ''} sur {period} jours</div>

      {chart.length > 0 && (
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip
                contentStyle={{ background: '#1a0e22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: 11 }}
              />
              <Area type="monotone" dataKey="revenue" name="Revenus" stroke="#3b82f6" strokeWidth={2} fill="url(#revGrad)" />
              <Area type="monotone" dataKey="profit" name="Profit" stroke="#34d399" strokeWidth={2} fill="url(#profitGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
