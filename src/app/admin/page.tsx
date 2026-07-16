"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Users, Globe, ShoppingCart, DollarSign, Monitor, Store, Truck } from "lucide-react";

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
}

const MODE_LABELS: Record<string, { label: string; icon: typeof Monitor }> = {
  "1": { label: "Vitrine", icon: Monitor },
  "2": { label: "Boutique avec stock", icon: Store },
  "3-reseller": { label: "Dropshipping \u2014 Reseller", icon: Truck },
  "3-pod_brand": { label: "Dropshipping \u2014 Brand", icon: Truck },
  "3-pod_custom": { label: "Dropshipping \u2014 Custom", icon: Truck },
};

const MODE_ORDER = ["1", "2", "3-reseller", "3-pod_brand", "3-pod_custom"];

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError("Non connect\u00e9"); setLoading(false); return; }
      const res = await fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.status === 403) { setError("Acc\u00e8s interdit \u2014 admin uniquement"); setLoading(false); return; }
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

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-10">
      <h1 className="text-3xl font-bold mb-8">Nexiora Admin</h1>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatCard icon={Users} label="Utilisateurs inscrits" value={stats.users.total} sub={`${stats.users.withSites} ont cr\u00e9\u00e9 un site`} color="text-violet-400" />
        <StatCard icon={Globe} label="Sites cr\u00e9\u00e9s" value={stats.sites.total} sub={`${stats.sites.published} publi\u00e9s`} color="text-emerald-400" />
        <StatCard icon={ShoppingCart} label="Commandes" value={stats.orders.total} sub={`${stats.orders.paid} pay\u00e9es`} color="text-blue-400" />
        <StatCard icon={DollarSign} label="Revenus plateforme" value={`$${fmt(stats.revenue.commission)}`} sub={`$${fmt(stats.revenue.total)} total ventes`} color="text-amber-400" />
      </div>

      {/* Revenue detail */}
      <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6 mb-10">
        <h2 className="text-lg font-semibold mb-4">D\u00e9tail revenus</h2>
        <div className="grid grid-cols-3 gap-4">
          <MiniCard label="Ventes totales" value={`$${fmt(stats.revenue.total)}`} />
          <MiniCard label="Co\u00fbt fournisseurs" value={`$${fmt(stats.revenue.supplierCost)}`} />
          <MiniCard label="Commission Nexiora (5%)" value={`$${fmt(stats.revenue.commission)}`} />
        </div>
      </div>

      {/* Breakdown by mode */}
      <h2 className="text-xl font-semibold mb-4">R\u00e9partition par type</h2>
      <div className="space-y-6 mb-10">
        {MODE_ORDER.map((key) => {
          const data = stats.breakdown[key];
          const meta = MODE_LABELS[key] || { label: key, icon: Monitor };
          const Icon = meta.icon;
          const total = data?.total || 0;
          const published = data?.published || 0;
          const sites = data?.sites || [];
          return (
            <div key={key} className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Icon className="w-5 h-5 text-[#E07040]" />
                <h3 className="text-lg font-semibold">{meta.label}</h3>
                <span className="text-sm text-neutral-400 ml-auto">{total} site{total > 1 ? "s" : ""} \u2014 {published} publi\u00e9{published > 1 ? "s" : ""}</span>
              </div>
              {sites.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-neutral-500 border-b border-neutral-800">
                      <th className="pb-2 pr-4">Nom</th>
                      <th className="pb-2 pr-4">Propri\u00e9taire</th>
                      <th className="pb-2 pr-4">Cr\u00e9\u00e9 le</th>
                      <th className="pb-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map((s: SiteInfo) => (
                      <tr key={s.slug} className="border-b border-neutral-800/50">
                        <td className="py-2 pr-4 font-medium">{s.name}</td>
                        <td className="py-2 pr-4 text-neutral-400 text-xs">{s.owner_email}</td>
                        <td className="py-2 pr-4 text-neutral-400 text-xs">{new Date(s.created_at).toLocaleDateString("fr-CA")}</td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${s.published ? "bg-emerald-900 text-emerald-300" : "bg-neutral-800 text-neutral-400"}`}>
                            {s.published ? "En ligne" : "Brouillon"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-neutral-500">Aucun site dans cette cat\u00e9gorie.</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Cron Runs */}
      <h2 className="text-xl font-semibold mb-4">Derni\u00e8res ex\u00e9cutions cron</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-400 border-b border-neutral-800">
              <th className="pb-2 pr-4">Cron</th>
              <th className="pb-2 pr-4">Date</th>
              <th className="pb-2 pr-4">Dur\u00e9e</th>
              <th className="pb-2 pr-4">Items</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {stats.crons.map((run) => {
              const isAlert = run.duration_ms != null && run.duration_ms > THRESHOLD;
              const duration = run.duration_ms != null ? (run.duration_ms / 1000).toFixed(1) + "s" : "\u2014";
              const date = new Date(run.started_at).toLocaleString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
              return (
                <tr key={run.id} className={`border-b border-neutral-800/50 ${isAlert ? "bg-red-950/30" : ""}`}>
                  <td className="py-2 pr-4 font-mono">{run.cron_name}</td>
                  <td className="py-2 pr-4 text-neutral-400">{date}</td>
                  <td className={`py-2 pr-4 font-mono ${isAlert ? "text-red-400 font-bold" : ""}`}>
                    {duration}
                    {isAlert && <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-600 rounded">\u26a0\ufe0f SLOW</span>}
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
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-neutral-900 rounded-xl p-5 border border-neutral-800">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color || "text-neutral-400"}`} />
        <p className="text-xs text-neutral-400 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${color || ""}`}>{value}</p>
      {sub && <p className="text-xs text-neutral-500 mt-1">{sub}</p>}
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-800/50 rounded-xl p-4">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
