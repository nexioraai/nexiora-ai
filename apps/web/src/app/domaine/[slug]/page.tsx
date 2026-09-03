'use client'

import { useState, useCallback } from 'react'
import { use } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'
import { useTranslation } from '@/lib/translations'
import { useEffect } from 'react'

type Dns = { type: string; name: string; value: string }

// Valeurs fixes retournees par POST /api/domains (voir domains/route.ts) —
// ne dependent jamais du domaine connecte, reutilisables sans nouvel appel
// pour reafficher les instructions apres un rechargement de page.
/**
 * D-01 -- Les enregistrements a afficher, SANS DOUBLON.
 *
 * Trois sources peuvent porter le meme TXT : la reponse de connexion
 * (`verification`), le statut relu juste apres (`byodTxt`, qui interroge le
 * meme hebergeur), et l'etat Google. Les concatener naivement affichait deux
 * fois la meme ligne au client -- une instruction dupliquee est une
 * instruction dont on doute.
 */
function deduireEnregistrements(
  dns: Dns[] | null,
  verification: Dns[],
  byodTxt: Dns[] | undefined,
  google: Dns[]
): Dns[] {
  const sortie: Dns[] = []
  const vus = new Set<string>()
  for (const r of [...(dns || STATIC_DNS), ...verification, ...(byodTxt || []), ...google]) {
    if (!r || !r.type || r.value == null) continue
    const cle = `${r.type}|${r.name}|${r.value}`
    if (vus.has(cle)) continue
    vus.add(cle)
    sortie.push(r)
  }
  return sortie
}

const STATIC_DNS: Dns[] = [
  { type: 'A', name: '@', value: '76.76.21.21' },
  { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' },
]

export default function DomainePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { t } = useTranslation()
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dns, setDns] = useState<Dns[] | null>(null)
  // D-01 -- les TXT REELLEMENT exiges par l'hebergeur, renvoyes par la
  // connexion. Tableau vide quand aucun ne l'est : rien ne s'affiche alors.
  const [verification, setVerification] = useState<Dns[]>([])
  const [connected, setConnected] = useState('')
  const [status, setStatus] = useState<any>(null)

  // D-01/D-02 -- EXTRAIT DE L'EFFET POUR ETRE RAPPELABLE.
  //
  // Le statut n'etait charge qu'au montage : apres une connexion reussie,
  // l'interface continuait d'afficher l'etat d'AVANT. Un client qui venait
  // de connecter son domaine ne voyait donc jamais, dans sa session, les
  // instructions produites par cette connexion.
  const rechargerStatut = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    const res = await fetch(`/api/domains/status?slug=${slug}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) setStatus(await res.json())
  }, [slug])

  useEffect(() => {
    rechargerStatut()
  }, [rechargerStatut])

  // D-02 -- LE DECLENCHEUR MANQUANT.
  //
  // Le statut n'etait lu qu'au montage, et rien ne demandait jamais a
  // l'hebergeur de RELIRE le DNS. Un client qui venait de poser ses
  // enregistrements devait quitter puis revenir, sans savoir que c'etait
  // necessaire -- et cela ne suffisait meme pas, faute de re-verification.
  const [verifying, setVerifying] = useState(false)
  async function handleVerify() {
    setError('')
    setVerifying(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setError(t('domain.errSession')); setVerifying(false); return }
      const res = await fetch(`/api/domains/status?slug=${slug}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || t('domain.errGeneric'))
      else setStatus(data)
    } catch {
      setError(t('domain.errConnection'))
    }
    setVerifying(false)
  }

  // D-03 -- le detachement, absent jusqu'ici.
  const [detaching, setDetaching] = useState(false)
  async function handleDisconnect() {
    if (!confirm(t('domain.disconnectConfirm'))) return
    setError('')
    setDetaching(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setError(t('domain.errSession')); setDetaching(false); return }
      const res = await fetch(`/api/domains?slug=${slug}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || t('domain.errGeneric'))
      else {
        setDns(null)
        setVerification([])
        setConnected('')
        setDomain('')
        await rechargerStatut()
      }
    } catch {
      setError(t('domain.errConnection'))
    }
    setDetaching(false)
  }

  async function handleConnect() {
    setError('')
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError(t('domain.errSession'))
        setLoading(false)
        return
      }
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ slug, domain }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('domain.errGeneric'))
      } else {
        setDns(data.dns)
        setVerification(Array.isArray(data.verification) ? data.verification : [])
        setConnected(data.domain)
        // D-01 -- l'etat affiche reflete desormais la connexion qui vient
        // d'aboutir, jamais celui d'avant.
        await rechargerStatut()
      }
    } catch {
      setError(t('domain.errConnection'))
    }
    setLoading(false)
  }

  // Vrai si un domaine BYOD est connecte, que ce soit dans cette session
  // (dns) ou depuis une session precedente (status.customDomain, persiste
  // en base mais jusqu'ici jamais lu par ce composant).
  const hasByodDomain = !!dns || !!status?.customDomain

  // Etat reel Vercel pour ce domaine BYOD (jamais pour un domaine achete,
  // qui a son propre suivi via status.purchased). null = verification
  // impossible pour l'instant (ex. panne API) — ne doit jamais etre
  // presente comme "verifie".
  const byodVerification = status?.byodVerification as
    | { attached: boolean; verified: boolean }
    | null
    | undefined
  const byodStatus = !byodVerification
    ? { dot: 'bg-slate-400', text: 'text-slate-400', label: t('domain.statusUnknown') }
    : byodVerification.verified
      ? { dot: 'bg-emerald-400', text: 'text-emerald-400', label: t('domain.statusVerified') }
      : byodVerification.attached
        ? { dot: 'bg-amber-400', text: 'text-amber-400', label: t('domain.statusConfiguring') }
        : { dot: 'bg-red-400', text: 'text-red-400', label: t('domain.statusProblem') }

  // Etat Google BYOD (verification de propriete + soumission sitemap),
  // gere par le cron domain-indexing-byod — distinct du statut Vercel
  // ci-dessus, qui ne couvre que le rattachement DNS.
  const byodGoogle = status?.byodGoogle as
    | { status: string | null; token: string | null; attempts: number | null; lastAttemptAt: string | null; lastError: string | null }
    | null
    | undefined
  const byodGoogleBadge = !byodGoogle || !byodGoogle.status
    ? { dot: 'bg-slate-400', text: 'text-slate-400', label: t('domain.statusUnknown') }
    : byodGoogle.status === 'sitemap_submitted'
      ? { dot: 'bg-emerald-400', text: 'text-emerald-400', label: t('domain.stepSubmitted') }
      : byodGoogle.status === 'verified'
        ? { dot: 'bg-emerald-400', text: 'text-emerald-400', label: t('domain.stepGoogle') }
        : byodGoogle.status === 'failed'
          ? { dot: 'bg-red-400', text: 'text-red-400', label: t('domain.statusProblem') }
          : { dot: 'bg-amber-400', text: 'text-amber-400', label: t('domain.statusConfiguring') }
  const byodGoogleTxt = byodGoogle?.token
    ? [{ type: 'TXT', name: '@', value: byodGoogle.token }]
    : []

  return (
    <main className="min-h-screen nexiora-bg text-white">
      <Navbar />
      <section className="max-w-2xl mx-auto px-6 pt-12 pb-24">
        <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white transition mb-2 inline-block">
          {t('domain.back')}
        </Link>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
          {t('domain.title')} <span className="text-nexiora">{t('domain.titleAccent')}</span>
        </h1>
        <p className="text-slate-400 mb-10">
          {t('domain.subtitle')}
        </p>

        {status?.purchased && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
            <div className="flex items-baseline justify-between mb-4">
              <p className="font-semibold">{status.purchased.domain}</p>
              <span className={`text-xs px-2 py-0.5 rounded ${
                status.purchased.status === 'sitemap_submitted' ? 'bg-emerald-900 text-emerald-300'
                : (status.purchased.status === 'failed' || status.purchased.status === 'google_failed') ? 'bg-red-900 text-red-300'
                : 'bg-amber-900 text-amber-300'
              }`}>
                {status.purchased.status === 'sitemap_submitted' ? t('domain.statusOnline')
                  : (status.purchased.status === 'failed' || status.purchased.status === 'google_failed') ? t('domain.statusProblem')
                  : t('domain.statusConfiguring')}
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <StatusLine done={!!status.purchased.purchased_at} label={t('domain.stepPurchased')} />
              <StatusLine done={!!status.purchased.dns_configured_at} label={t('domain.stepDns')} />
              <StatusLine done={!!status.purchased.google_verified_at} label={t('domain.stepGoogle')} />
              <StatusLine done={!!status.purchased.sitemap_submitted_at} label={t('domain.stepSubmitted')} />
            </div>
            {status.purchased.renews_at && (
              <p className="text-xs text-slate-500 mt-4">
                {t('domain.renews').replace('{date}', new Date(status.purchased.renews_at).toLocaleDateString('fr-CA'))}
              </p>
            )}
            {status.purchased.last_error && (
              <p className="text-xs text-red-400 mt-3">{status.purchased.last_error}</p>
            )}
          </div>
        )}

        {!status?.purchased && (
          <>
            {!hasByodDomain && (
              <Link
                href={`/domaine/${slug}/acheter`}
                className="block bg-white/5 border border-white/10 rounded-2xl p-6 mb-4 hover:border-white/30 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold mb-1">{t('domain.buyTitle')}</p>
                    <p className="text-sm text-slate-400">
                      {t('domain.buyDesc')}
                    </p>
                  </div>
                  <span className="text-slate-400 text-xl leading-none">&rarr;</span>
                </div>
              </Link>
            )}

            {!hasByodDomain && (
              <p className="text-sm text-slate-500 mb-4">{t('domain.orConnect')}</p>
            )}

            {!hasByodDomain ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <label className="block text-sm font-semibold mb-2">{t('domain.yourDomain')}</label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="moncafe.com"
                  className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-nexiora transition mb-4"
                />
                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
                <button
                  onClick={handleConnect}
                  disabled={loading || !domain}
                  className={`px-6 py-3 rounded-xl text-sm font-semibold transition ${
                    loading || !domain
                      ? 'bg-white/10 text-white/40 cursor-not-allowed'
                      : 'bg-white text-black hover:opacity-90'
                  }`}
                >
                  {loading ? t('domain.connecting') : t('domain.connect')}
                </button>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${byodStatus.dot}`} />
                  <span className="font-semibold">{connected || status?.customDomain}</span>
                  <span className={`${byodStatus.text} text-sm`}>{byodStatus.label}</span>
                </div>
                <div className="flex items-center gap-2 mb-6">
                  <span className={`w-2.5 h-2.5 rounded-full ${byodGoogleBadge.dot}`} />
                  <span className="text-sm text-slate-400">Google</span>
                  <span className={`${byodGoogleBadge.text} text-sm`}>{byodGoogleBadge.label}</span>
                </div>
                {byodGoogle?.lastError && (
                  <p className="text-xs text-red-400 mb-4">{byodGoogle.lastError}</p>
                )}
                <p className="text-sm text-slate-300 mb-4">
                  {t('domain.dnsInstructions')}
                </p>
                <div className="space-y-2 mb-6">
                  {deduireEnregistrements(dns, verification, status?.byodTxt, byodGoogleTxt).map((r, i) => (
                    <div key={i} className="grid grid-cols-3 gap-3 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono">
                      <span><span className="text-slate-500">{t('domain.colType')} </span>{r.type}</span>
                      <span><span className="text-slate-500">{t('domain.colName')} </span>{r.name}</span>
                      <span className="truncate"><span className="text-slate-500">{t('domain.colValue')} </span>{r.value}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3 mb-6">
                  <button
                    onClick={handleVerify}
                    disabled={verifying}
                    className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
                      verifying ? 'bg-white/10 text-white/40 cursor-not-allowed' : 'bg-white text-black hover:opacity-90'
                    }`}
                  >
                    {verifying ? t('domain.verifying') : t('domain.verifyNow')}
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={detaching}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-red-500/30 text-red-400/80 hover:text-red-400 hover:border-red-500/50 transition disabled:opacity-40"
                  >
                    {t('domain.disconnect')}
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  {t('domain.dnsNote')}
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}

function StatusLine({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
        done ? 'bg-emerald-500 text-black' : 'bg-white/10 text-white/30'
      }`}>
        {done ? '\u2713' : ''}
      </span>
      <span className={done ? 'text-white' : 'text-slate-500'}>{label}</span>
    </div>
  )
}
