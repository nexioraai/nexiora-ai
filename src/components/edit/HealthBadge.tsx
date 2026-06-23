'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Alerts = {
  ordersToPayCj: number;
  outOfStock: number;
  balance: number | null;
  lowBalance: boolean;
  autoPay: boolean;
};

export default function HealthBadge({ slug, aiScore }: { slug: string; aiScore: number }) {
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
        // Silencieux : ne jamais casser la page
      }
    })();
  }, [slug]);

  // Tant que les donnees ne sont pas chargees : etat neutre (jamais de faux vert)
  if (!alerts) {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/40">
        <span className="w-2 h-2 rounded-full bg-white/30" />
        Analyse…
      </span>
    );
  }

  // Calcul de la sante : rouge = urgent, orange = ameliorable, vert = OK
  const reasons: string[] = [];
  let level: 'green' | 'orange' | 'red' = 'green';

  // Rouge : actions urgentes (bloquantes ou risque imminent)
  if (alerts.lowBalance && alerts.balance !== null) {
    reasons.push(`Solde CJ bas (${alerts.balance.toFixed(2)} USD)`);
    level = 'red';
  }
  if (alerts.ordersToPayCj > 0 && !alerts.autoPay) {
    reasons.push(`${alerts.ordersToPayCj} commande${alerts.ordersToPayCj > 1 ? 's' : ''} à payer sur CJ`);
    level = 'red';
  }

  // Orange : ameliorations possibles (non bloquantes)
  if (level !== 'red') {
    if (alerts.outOfStock > 0) {
      reasons.push(`${alerts.outOfStock} produit${alerts.outOfStock > 1 ? 's' : ''} en rupture`);
      level = 'orange';
    }
    if (aiScore < 80) {
      reasons.push(`Visibilité IA à ${aiScore}/100`);
      level = 'orange';
    }
  }

  const config = {
    green: { color: '#34d399', label: 'Tout va bien', pulse: false },
    orange: { color: '#E07040', label: 'Attention', pulse: true },
    red: { color: '#f87171', label: 'Action requise', pulse: true },
  }[level];

  const tooltip = reasons.length > 0 ? reasons.join(' · ') : 'Aucune action requise';

  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold cursor-default transition"
      style={{
        background: `${config.color}1a`,
        borderColor: `${config.color}40`,
        color: config.color,
      }}
    >
      <span className="relative flex items-center justify-center">
        {config.pulse && (
          <span
            className="absolute w-2.5 h-2.5 rounded-full animate-ping"
            style={{ background: config.color, opacity: 0.6 }}
          />
        )}
        <span className="relative w-2.5 h-2.5 rounded-full" style={{ background: config.color }} />
      </span>
      {config.label}
    </span>
  );
}
