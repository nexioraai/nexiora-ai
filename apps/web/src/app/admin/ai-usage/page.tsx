"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Cpu, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";

interface Row {
  site_id: string | null;
  name: string;
  slug: string;
  owner_email: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  by_type: Record<string, number>;
  last_used: string | null;
}
interface Data {
  total: { calls: number; input_tokens: number; output_tokens: number; cost: number; sites: number };
  rows: Row[];
}

const TYPE_LABELS: Record<string, string> = {
  agent: "Agent",
  curate: "Curation",
  enhance: "Titres",
  image: "Image",
  marketing: "Marketing",
};

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export default function AiUsagePage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setError("Non connecte"); setLoading(false); return; }
        const res = await fetch("/api/admin/ai-usage", { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (!res.ok) { setError(res.status === 403 ? "Acces refuse" : "Erreur de chargement"); setLoading(false); return; }
        setData(await res.json());
      } catch {
        setError("Erreur de chargement");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="min-h-screen nexiora-bg text-white flex">
      <Sidebar />
      <main className="flex-1 min-w-0 px-6 lg:pl-40 lg:pr-12 pt-24 lg:pt-10 pb-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white/80 mb-6">
          <ArrowLeft className="w-4 h-4" /> Retour au tableau de bord
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <Cpu className="w-6 h-6 text-cyan-400" />
          <h1 className="text-2xl font-bold">Consommation IA par boutique</h1>
        </div>

        {loading && <p className="text-white/50">Chargement...</p>}
        {error && <p className="text-red-400">{error}</p>}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Cout total estime</p>
                <p className="text-2xl font-bold text-cyan-400">${data.total.cost.toFixed(2)}</p>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Appels IA</p>
                <p className="text-2xl font-bold">{data.total.calls}</p>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Tokens entree</p>
                <p className="text-2xl font-bold">{fmtTokens(data.total.input_tokens)}</p>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Tokens sortie</p>
                <p className="text-2xl font-bold">{fmtTokens(data.total.output_tokens)}</p>
              </div>
            </div>

            {data.rows.length === 0 ? (
              <p className="text-white/40">Aucune consommation IA enregistree pour l'instant.</p>
            ) : (
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-white/40 border-b border-white/10">
                      <th className="px-4 py-3 font-medium">Boutique</th>
                      <th className="px-4 py-3 font-medium text-right">Appels</th>
                      <th className="px-4 py-3 font-medium">Detail</th>
                      <th className="px-4 py-3 font-medium text-right">Tokens (in/out)</th>
                      <th className="px-4 py-3 font-medium text-right">Cout est.</th>
                      <th className="px-4 py-3 font-medium text-right">Dernier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.site_id || "none"} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <p className="text-white/90">{r.name}</p>
                          {r.owner_email && <p className="text-xs text-white/40">{r.owner_email}</p>}
                        </td>
                        <td className="px-4 py-3 text-right text-white/80">{r.calls}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(r.by_type).map(([t, c]) => (
                              <span key={t} className="px-2 py-0.5 rounded bg-white/[0.06] text-xs text-white/60">
                                {TYPE_LABELS[t] || t}: {c}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-white/60 text-xs">
                          {fmtTokens(r.input_tokens)} / {fmtTokens(r.output_tokens)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-cyan-400">${r.cost.toFixed(3)}</td>
                        <td className="px-4 py-3 text-right text-white/40 text-xs">
                          {r.last_used ? new Date(r.last_used).toLocaleDateString("fr-CA") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-white/30 mt-4">
              Cout estime sur les tarifs Anthropic (Haiku $1/$5, Sonnet $3/$15 par million de tokens). Les images IA (OpenAI) ne sont pas comptees ici.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
