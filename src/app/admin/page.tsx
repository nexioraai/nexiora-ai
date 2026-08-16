"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Users, Globe, ShoppingCart, DollarSign, Monitor, Store, Truck, AlertTriangle, Cpu } from "lucide-react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";

interface CronRun {
  id: string;
  cron_name: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  items_processed: number;
  status: string;
  error_message: string | null;
}

interface Anomaly {
  id: string;
  type: string;
  severity: string;
  slug: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface ToPayOrder {
  id: string;
  cj_order_id: string | null;
  country_code: string | null;
  customer_name: string | null;
  shipping_amount: number | null;
  created_at: string;
}

interface SiteInfo {
  name: string;
  slug: string;
  published: boolean;
  owner_email: string;
  created_at: string;
}

interface Stats {
  users: { total: number; withSites: number };
  sites: { total: number; published: number };
  orders: { total: number; paid: number };
  revenue: { total: number; commission: number; supplierCost: number };
  breakdown: Record<string, { total: number; published: number; sites: SiteInfo[] }>;
  crons: CronRun[];
  anomalies: Anomaly[];
  toPayOrders: ToPayOrder[];
}

const MODE_LABELS: Record<string, { label: string; icon: typeof Monitor }> = {
  "1": { label: "Vitrine", icon: Monitor },
  "2": { label: "Boutique avec stock", icon: Store },
  "3-reseller": { label: "Dropshipping — Reseller", icon: Truck },
  "3-pod_brand": { label: "Dropshipping — Brand", icon: Truck },
  "3-pod_custom": { label: "Dropshipping — Custom", icon: Truck },
};

const MODE_ORDER = ["1", "2", "3-reseller", "3-pod_brand", "3-pod_custom"];

const ANOMALY_LABELS: Record<string, string> = {
  sw_disappeared: "Produit disparu",
  sw_out_of_stock: "Rupture de stock",
  sw_manual_price_underwater: "Prix manuel sous le seuil",
  sw_price_spike: "Hausse brutale du coût",
  shipping_not_resolved: "Livraison non calculée",
};

const SEVERITY_STYLE: Record<string, string> = {
  blocked: "bg-red-900 text-red-300",
  warning: "bg-amber-900 text-amber-300",
  info: "bg-neutral-800 text-white/50",
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError("Non connecté"); setLoading(false); return; }
      const res = await fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.status === 403) { setError("Accès interdit — admin uniquement"); setLoading(false); return; }
      setStats(await res.json());
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white"><p>Chargement...</p></div>;
  if (error) return <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-red-400"><p>{error}</p></div>;
  if (!stats) return null;

  const fmt = (n: number) => n.toFixed(2);
  const THRESHOLD = 45000;
  const anomalies = stats.anomalies || [];
  const blockedCount = anomalies.filter((a) => a.severity === "blocked").length;
  const warningCount = anomalies.filter((a) => a.severity === "warning").length;

  // Un meme incident se repete : on regroupe par type + site, on garde le plus recent.
  const groupedMap = new Map<string, { a: Anomaly; count: number; oldest: string }>();
  for (const a of anomalies) {
    const key = a.type + "|" + (a.slug || "");
    const g = groupedMap.get(key);
    if (!g) {
      groupedMap.set(key, { a, count: 1, oldest: a.created_at });
    } else {
      g.count++;
      if (a.created_at < g.oldest) g.oldest = a.created_at;
    }
  }
  const grouped = [...groupedMap.values()];

  const fmtDetails = (d: Record<string, unknown> | null) => {
    if (!d) return "—";
    const obj = d as Record<string, string>;
    if (obj.detail) return obj.detail;
    const entries = Object.entries(obj).filter(([k]) => k !== "name");
    if (entries.length === 0) return "—";
    return entries.map(([k, v]) => k + ": " + String(v)).join(" · ");
  };

  return (
    <div className="min-h-screen nexiora-bg text-white flex">
      <Sidebar />
      <main className="flex-1 min-w-0 px-6 lg:pl-40 lg:pr-12 pt-24 lg:pt-10 pb-10">
      <h1 className="text-3xl font-bold mb-8">Deribfy Admin</h1>

      {/* Commandes a payer manuellement chez CJ */}
      {(stats.toPayOrders || []).length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-6 mb-10 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
          <div className="flex items-center gap-3 mb-4">
            <Truck className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-amber-100">
              Commandes a payer chez CJ ({stats.toPayOrders.length})
            </h2>
            <a
              href="https://cjdropshipping.com/mine/dropshipping/orderList?orderType=7"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto px-3 py-1.5 rounded-lg bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400"
            >
              Ouvrir CJ pour payer
            </a>
          </div>
          <div className="space-y-2">
            {stats.toPayOrders.map((o) => (
              <div key={o.id} className="flex items-center gap-4 text-sm bg-black/20 rounded-lg px-4 py-2">
                <span className="text-white/90">{o.customer_name || "Client"}</span>
                <span className="text-white/50">{o.country_code || "?"}</span>
                {o.shipping_amount != null && (
                  <span className="text-white/50">livraison ${o.shipping_amount.toFixed(2)}</span>
                )}
                <span className="text-white/40 ml-auto">
                  {new Date(o.created_at).toLocaleString("fr-CA")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
        <StatCard icon={Users} label="Utilisateurs inscrits" value={stats.users.total} sub={`${stats.users.withSites} ont créé un site`} color="text-violet-400" />
        <StatCard icon={Globe} label="Sites créés" value={stats.sites.total} sub={`${stats.sites.published} publiés`} color="text-emerald-400" />
        <StatCard icon={ShoppingCart} label="Commandes" value={stats.orders.total} sub={`${stats.orders.paid} payées`} color="text-blue-400" />
        <StatCard icon={AlertTriangle} label="Anomalies bloquantes" value={blockedCount} sub={`${warningCount} avertissement${warningCount > 1 ? "s" : ""}`} color={blockedCount > 0 ? "text-red-400" : "text-white/50"} />
        <StatCard icon={DollarSign} label="Revenus plateforme" value={`$${fmt(stats.revenue.commission)}`} sub={`$${fmt(stats.revenue.total)} total ventes`} color="text-amber-400" />
        <StatCard icon={Cpu} label="Consommation IA" value="Voir détails" sub="Coût par boutique" color="text-cyan-400" href="/admin/ai-usage" />
      </div>

      {/* Revenue detail */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl border border-white/10 p-6 mb-10 glass glass-hover">
        <h2 className="text-lg font-semibold mb-4">Détail revenus</h2>
        <div className="grid grid-cols-3 gap-4">
          <MiniCard label="Ventes totales" value={`$${fmt(stats.revenue.total)}`} />
          <MiniCard label="Coût fournisseurs" value={`$${fmt(stats.revenue.supplierCost)}`} />
          <MiniCard label="Commission Deribfy (5%)" value={`$${fmt(stats.revenue.commission)}`} />
        </div>
      </div>

      {/* Anomalies */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-semibold">Anomalies</h2>
        {blockedCount > 0 && (
          <span className="px-2 py-0.5 rounded text-xs bg-red-600 text-white font-semibold">
            {blockedCount} bloquante{blockedCount > 1 ? "s" : ""}
          </span>
        )}
        {warningCount > 0 && (
          <span className="px-2 py-0.5 rounded text-xs bg-amber-700 text-amber-100">
            {warningCount} avertissement{warningCount > 1 ? "s" : ""}
          </span>
        )}
        <span className="text-xs text-white/40 ml-auto">
          {grouped.length} incident{grouped.length > 1 ? "s" : ""} distinct{grouped.length > 1 ? "s" : ""}
        </span>
      </div>
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 mb-10 glass glass-hover">
        {anomalies.length === 0 ? (
          <p className="text-sm text-white/40">Aucune anomalie détectée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/10">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Sévérité</th>
                  <th className="pb-2 pr-4">Site</th>
                  <th className="pb-2">Détail</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(({ a, count, oldest }) => {
                  const d = (a.details || {}) as Record<string, string>;
                  const dateStr = new Date(a.created_at).toLocaleString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                  const firstStr = new Date(oldest).toLocaleString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                  return (
                    <tr key={a.type + "|" + (a.slug || "")} className={`border-b border-white/10 ${a.severity === "blocked" ? "bg-red-950/20" : ""}`}>
                      <td className="py-2 pr-4 text-white/50 text-xs whitespace-nowrap">
                        {dateStr}
                        {count > 1 && <span className="block text-white/30">depuis {firstStr}</span>}
                      </td>
                      <td className="py-2 pr-4 font-medium">
                        {ANOMALY_LABELS[a.type] || a.type}
                        {count > 1 && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-white/10 text-white/70">×{count}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.info}`}>
                          {a.severity}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-white/50 text-xs">{a.slug || "—"}</td>
                      <td className="py-2 text-white/70 text-xs">
                        {d.name && d.detail && <span className="block text-white/90">{d.name}</span>}
                        {fmtDetails(a.details)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Breakdown by mode */}
      <h2 className="text-xl font-semibold mb-4">Répartition par type</h2>
      <div className="space-y-6 mb-10">
        {MODE_ORDER.map((key) => {
          const data = stats.breakdown[key];
          const meta = MODE_LABELS[key] || { label: key, icon: Monitor };
          const Icon = meta.icon;
          const total = data?.total || 0;
          const published = data?.published || 0;
          const sites = data?.sites || [];
          return (
            <div key={key} className="bg-white/[0.03] border border-white/10 rounded-2xl border border-white/10 p-6 glass glass-hover">
              <div className="flex items-center gap-3 mb-4">
                <Icon className="w-5 h-5 text-[#FA5D1E]" />
                <h3 className="text-lg font-semibold">{meta.label}</h3>
                <span className="text-sm text-white/50 ml-auto">{total} site{total > 1 ? "s" : ""} — {published} publié{published > 1 ? "s" : ""}</span>
              </div>
              {sites.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-white/40 border-b border-white/10">
                      <th className="pb-2 pr-4">Nom</th>
                      <th className="pb-2 pr-4">Propriétaire</th>
                      <th className="pb-2 pr-4">Créé le</th>
                      <th className="pb-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map((s: SiteInfo) => (
                      <tr key={s.slug} className="border-b border-white/10/50">
                        <td className="py-2 pr-4 font-medium">{s.name}</td>
                        <td className="py-2 pr-4 text-white/50 text-xs">{s.owner_email}</td>
                        <td className="py-2 pr-4 text-white/50 text-xs">{new Date(s.created_at).toLocaleDateString("fr-CA")}</td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${s.published ? "bg-emerald-900 text-emerald-300" : "bg-neutral-800 text-white/50"}`}>
                            {s.published ? "En ligne" : "Brouillon"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-white/40">Aucun site dans cette catégorie.</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Cron Runs */}
      <h2 className="text-xl font-semibold mb-4">Dernières exécutions cron</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/50 border-b border-white/10">
              <th className="pb-2 pr-4">Cron</th>
              <th className="pb-2 pr-4">Date</th>
              <th className="pb-2 pr-4">Durée</th>
              <th className="pb-2 pr-4">Items</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {stats.crons.map((run) => {
              const isAlert = run.duration_ms != null && run.duration_ms > THRESHOLD;
              const duration = run.duration_ms != null ? (run.duration_ms / 1000).toFixed(1) + "s" : "—";
              const date = new Date(run.started_at).toLocaleString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
              return (
                <tr key={run.id} className={`border-b border-white/10/50 ${isAlert ? "bg-red-950/30" : ""}`}>
                  <td className="py-2 pr-4 font-mono">{run.cron_name}</td>
                  <td className="py-2 pr-4 text-white/50">{date}</td>
                  <td className={`py-2 pr-4 font-mono ${isAlert ? "text-red-400 font-bold" : ""}`}>
                    {duration}
                    {isAlert && <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-600 rounded">⚠️ SLOW</span>}
                  </td>
                  <td className="py-2 pr-4">{run.items_processed}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${run.status === "success" ? "bg-emerald-900 text-emerald-300" : run.status === "error" ? "bg-red-900 text-red-300" : "bg-yellow-900 text-yellow-300"}`}>
                      {run.status}
                    </span>
                    {run.error_message && <span className="ml-2 text-red-400 text-xs">{run.error_message.slice(0, 60)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </main>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, href }: { icon: any; label: string; value: string | number; sub?: string; color?: string; href?: string }) {
  const inner = (
    <div className={`bg-white/[0.03] border border-white/10 rounded-xl p-5 glass glass-hover ${href ? "hover:bg-white/[0.06] transition cursor-pointer" : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color || "text-white/50"}`} />
        <p className="text-xs text-white/50 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${color || ""}`}>{value}</p>
      {sub && <p className="text-xs text-white/40 mt-1">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.05] rounded-xl p-4">
      <p className="text-xs text-white/40 mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
