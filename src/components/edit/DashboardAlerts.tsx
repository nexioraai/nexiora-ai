'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Alerts = {
  ordersToPayCj: number;
  balance: number | null;
  lowBalance: boolean;
  threshold: number;
  autoPay: boolean;
};

export default function DashboardAlerts({ slug }: { slug: string }) {
  const [alerts, setAlerts] = useState<Alerts | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/shop/dashboard/alerts?slug=${encodeURIComponent(slug)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setAlerts(await res.json());
      } catch (e) {
        // Silencieux : les alertes ne doivent jamais casser la page
      }
    })();
  }, [slug]);

  if (!alerts) return null;

  const items: { color: string; text: string }[] = [];

  if (alerts.ordersToPayCj > 0) {
    items.push({
      color: '#E07040',
      text: alerts.autoPay
        ? `${alerts.ordersToPayCj} commande${alerts.ordersToPayCj > 1 ? 's' : ''} en cours de paiement CJ`
        : `${alerts.ordersToPayCj} commande${alerts.ordersToPayCj > 1 ? 's' : ''} attend${alerts.ordersToPayCj > 1 ? 'ent' : ''} ton paiement CJ`,
    });
  }

  if (alerts.lowBalance && alerts.balance !== null) {
    items.push({
      color: '#f87171',
      text: `Solde CJ bas (${alerts.balance.toFixed(2)} USD) — recharge pour éviter d'interrompre tes commandes`,
    });
  }

  // Tout va bien : pas de carte d'alerte (on ne pollue pas l'interface)
  if (items.length === 0) {
    return (
      <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-5 mb-8 flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full bg-[#34d399] flex-shrink-0" />
        <p className="text-sm text-white/60">Tout est à jour — aucune action requise.</p>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 mb-8">
      <p className="text-sm font-semibold text-white/60 mb-3">À faire maintenant</p>
      <ul className="space-y-3">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-3 text-sm text-white/80">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: it.color }} />
            {it.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
