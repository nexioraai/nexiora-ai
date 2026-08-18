"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, ArrowLeft, AlertTriangle, XCircle } from "lucide-react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { computeGlobalState, type GlobalState } from "@/lib/systemHealth/computeGlobalState";

interface Domain {
  id: string;
  description: string;
  capabilities: string[];
  ownedFiles: string[];
  contractTestsPath: string | null;
}

interface DomainFailure {
  domainId: string;
  status: string;
  failures: { test: string; message: string }[];
}

interface HealthCheck {
  id: string;
  created_at: string;
  commit_sha: string;
  branch: string;
  workflow_run_url: string | null;
  overall_status: "success" | "failure";
  typecheck_status: "success" | "failure";
  build_status: "success" | "failure";
  total_tests: number;
  failed_tests: number;
  domains: DomainFailure[];
  raw_failures: { test: string; message: string }[];
}

interface Data {
  domains: Domain[];
  latest: HealthCheck | null;
  history: HealthCheck[];
  isStale: boolean;
  tableMissing: boolean;
}

const STATE_META: Record<GlobalState, { emoji: string; label: string; className: string }> = {
  ok: { emoji: "🟢", label: "Tout est sain", className: "bg-emerald-500/10 border-emerald-500/40 text-emerald-300" },
  warning: { emoji: "🟠", label: "Attention", className: "bg-amber-500/10 border-amber-500/40 text-amber-300" },
  problem: { emoji: "🔴", label: "Problème détecté", className: "bg-red-500/10 border-red-500/40 text-red-300" },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Suggestion generique, deterministe -- pas une heuristique IA. On sait
// exactement ce qui a ete detecte (motif interdit + fichier + ligne), donc
// l'action corrective peut etre formulee sans deviner.
function suggestFix(message: string): string | null {
  const match = message.match(/motif interdit (.+?) — (.+)$/);
  if (!match) return null;
  return `Retirer ou déplacer la dépendance correspondant à ${match[1]} hors de ce domaine — raison : ${match[2]}`;
}

export default function SystemHealthPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setError("Non connecté"); setLoading(false); return; }
        const res = await fetch("/api/admin/system-health", { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (!res.ok) { setError(res.status === 403 ? "Accès refusé" : "Erreur de chargement"); setLoading(false); return; }
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
          <ShieldCheck className="w-6 h-6 text-[#FA5D1E]" />
          <h1 className="text-2xl font-bold">Surveillance anti-régression</h1>
        </div>

        {loading && <p className="text-white/50">Chargement...</p>}
        {error && <p className="text-red-400">{error}</p>}

        {data && (() => {
          const state = computeGlobalState({
            tableMissing: data.tableMissing,
            isStale: data.isStale,
            latestOverallStatus: data.latest?.overall_status ?? null,
          });
          const meta = STATE_META[state];
          return (
            <>
              <div className={`border rounded-2xl p-6 mb-8 flex items-center gap-4 ${meta.className}`}>
                <span className="text-4xl leading-none">{meta.emoji}</span>
                <div>
                  <p className="text-lg font-semibold">{meta.label}</p>
                  {data.tableMissing && (
                    <p className="text-sm opacity-80">La table system_health_checks n&apos;existe pas encore côté Supabase — surveillance pas encore active (voir supabase/sql/system_health_checks.sql).</p>
                  )}
                  {!data.tableMissing && !data.latest && (
                    <p className="text-sm opacity-80">Aucun rapport reçu pour l&apos;instant.</p>
                  )}
                  {!data.tableMissing && data.latest && (
                    <p className="text-sm opacity-80">
                      Dernier check : {fmtDate(data.latest.created_at)} — commit {data.latest.commit_sha.slice(0, 7)} —{" "}
                      {data.latest.failed_tests}/{data.latest.total_tests} test(s) en échec
                      {data.latest.workflow_run_url && (
                        <> — <a href={data.latest.workflow_run_url} target="_blank" rel="noopener noreferrer" className="underline">voir le run CI</a></>
                      )}
                      {data.isStale && (
                        <span className="block mt-1 text-amber-300">
                          ⚠ Aucun nouveau rapport depuis plus de 48h — cet état n&apos;est peut-être plus à jour.
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Domaines surveillés — source de vérité : DOMAIN_REGISTRY (code) */}
              <h2 className="text-xl font-semibold mb-4">Domaines surveillés ({data.domains.length})</h2>
              <div className="space-y-3 mb-10">
                {data.domains.map((d) => {
                  const failing = data.latest?.domains?.find((fd) => fd.domainId === d.id);
                  return (
                    <div key={d.id} className={`bg-white/[0.03] border rounded-xl p-5 ${failing ? "border-red-500/40" : "border-white/10"}`}>
                      <div className="flex items-center gap-3 mb-2">
                        {failing ? <XCircle className="w-4 h-4 text-red-400" /> : <span className="w-4 h-4 text-center text-emerald-400">●</span>}
                        <span className="font-mono text-sm font-semibold">{d.id}</span>
                        {d.capabilities.length > 0 && (
                          <span className="text-xs text-white/40">capacités : {d.capabilities.join(", ")}</span>
                        )}
                      </div>
                      <p className="text-sm text-white/60 mb-2">{d.description}</p>
                      <p className="text-xs text-white/30 font-mono">{d.ownedFiles.join(" · ")}</p>

                      {failing && (
                        <div className="mt-3 pt-3 border-t border-red-500/20 space-y-2">
                          {failing.failures.map((f, i) => {
                            const suggestion = suggestFix(f.message);
                            return (
                              <div key={i} className="text-sm bg-red-950/30 rounded-lg p-3">
                                <p className="text-red-300 font-medium mb-1">{f.test}</p>
                                <p className="text-white/60 text-xs font-mono whitespace-pre-wrap">{f.message}</p>
                                {suggestion && <p className="text-amber-300 text-xs mt-1">→ {suggestion}</p>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Echecs hors registre de domaines — genericite : rien n'est masque */}
              {data.latest && data.latest.raw_failures.length > 0 && (
                <>
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-400" /> Autres échecs (hors domaines enregistrés)
                  </h2>
                  <div className="space-y-2 mb-10">
                    {data.latest.raw_failures.map((f, i) => (
                      <div key={i} className="text-sm bg-amber-950/20 border border-amber-500/20 rounded-lg p-3">
                        <p className="text-amber-200 font-medium mb-1">{f.test}</p>
                        <p className="text-white/50 text-xs font-mono whitespace-pre-wrap">{f.message}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Historique */}
              <h2 className="text-xl font-semibold mb-4">Historique des vérifications (main)</h2>
              {data.history.length === 0 ? (
                <p className="text-sm text-white/40">Aucun historique pour l&apos;instant.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-white/40 border-b border-white/10">
                        <th className="pb-2 pr-4">Date</th>
                        <th className="pb-2 pr-4">Commit</th>
                        <th className="pb-2 pr-4">Type check</th>
                        <th className="pb-2 pr-4">Tests</th>
                        <th className="pb-2 pr-4">Build</th>
                        <th className="pb-2 pr-4">Statut global</th>
                        <th className="pb-2">Domaines concernés</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.history.map((h) => (
                        <tr key={h.id} className={`border-b border-white/10 ${h.overall_status === "failure" ? "bg-red-950/20" : ""}`}>
                          <td className="py-2 pr-4 text-white/60 text-xs whitespace-nowrap">{fmtDate(h.created_at)}</td>
                          <td className="py-2 pr-4 font-mono text-xs">{h.commit_sha.slice(0, 7)}</td>
                          <td className="py-2 pr-4">
                            <span className={h.typecheck_status === "success" ? "text-emerald-400" : "text-red-400"}>
                              {h.typecheck_status === "success" ? "OK" : "échec"}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-xs">{h.total_tests - h.failed_tests}/{h.total_tests}</td>
                          <td className="py-2 pr-4">
                            <span className={h.build_status === "success" ? "text-emerald-400" : "text-red-400"}>
                              {h.build_status === "success" ? "OK" : "échec"}
                            </span>
                          </td>
                          <td className="py-2 pr-4">
                            <span className={`px-2 py-0.5 rounded text-xs ${h.overall_status === "success" ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"}`}>
                              {h.overall_status === "success" ? "🟢 sain" : "🔴 problème"}
                            </span>
                          </td>
                          <td className="py-2 text-xs text-white/50 font-mono">
                            {h.domains && h.domains.length > 0 ? h.domains.map((d) => d.domainId).join(", ") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        })()}
      </main>
    </div>
  );
}
