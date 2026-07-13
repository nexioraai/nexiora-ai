"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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

interface ModeBreakdown {
  mode: number;
  dropship_type: string | null;
  count: number;
}

interface Stats {
  sites: { total: number; published: number; byMode: ModeBreakdown[] };
  orders: { total: number };
  crons: CronRun[];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError("Non connecté"); setLoading(false); return; }
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [statsRes, cronsRes] = await Promise.all([
        fetch("/api/admin/stats", { headers }),
        fetch("/api/admin/cron-runs", { headers }),
      ]);
      if (statsRes.status === 403) { setError("Accès interdit — admin uniquement"); setLoading(false); return; }
      const statsData = await statsRes.json();
      const cronsData = await cronsRes.json();
      setStats({ ...statsData, crons: cronsData.runs || statsData.crons });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white"><p>Chargement...</p></div>;
  if (error) return <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-red-400"><p>{error}</p></div>;
  if (!stats) return null;

  const THRESHOLD = 45000;
  const modeLabels: Record<number, string> = { 1: "Vitrine", 2: "Boutique", 3: "Dropshipping" };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-10">
      <h1 className="text-3xl font-bold mb-8">Nexiora Admin</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <Card label="Sites créés" value={stats.sites.total} />
        <Card label="Sites en ligne" value={stats.sites.published} color="text-emerald-400" />
        <Card label="Commandes" value={stats.orders.total} color="text-blue-400" />
        <Card label="Taux publication" value={stats.sites.total > 0 ? Math.round((stats.sites.published / stats.sites.total) * 100) + "%" : "0%"} color="text-amber-400" />
      </div>

      {/* Breakdown par mode */}
      <h2 className="text-xl font-semibold mb-4">Répartition par type</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        {stats.sites.byMode.map((m, i) => (
          <div key={i} className="bg-neutral-900 rounded-lg p-4 border border-neutral-800">
            <p className="text-sm text-neutral-400">{modeLabels[m.mode] || `Mode ${m.mode}`}{m.dropship_type ? ` (${m.dropship_type})` : ""}</p>
            <p className="text-2xl font-bold mt-1">{m.count}</p>
          </div>
        ))}
      </div>

      {/* Cron Runs */}
      <h2 className="text-xl font-semibold mb-4">Dernières exécutions cron</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-400 border-b border-neutral-800">
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
                <tr key={run.id} className={`border-b border-neutral-800/50 ${isAlert ? "bg-red-950/30" : ""}`}>
                  <td className="py-2 pr-4 font-mono">{run.cron_name}</td>
                  <td className="py-2 pr-4 text-neutral-400">{date}</td>
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
    </div>
  );
}

function Card({ label, value, color = "text-white" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-neutral-900 rounded-lg p-5 border border-neutral-800">
      <p className="text-sm text-neutral-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
