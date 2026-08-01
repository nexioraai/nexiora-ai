'use client'

import { useState } from 'react'
import { use } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'
import { useTranslation } from '@/lib/translations'
import { useEffect } from 'react'

type Dns = { type: string; name: string; value: string }

export default function DomainePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { t } = useTranslation()
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dns, setDns] = useState<Dns[] | null>(null)
  const [connected, setConnected] = useState('')
  const [status, setStatus] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const res = await fetch(`/api/domains/status?slug=${slug}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) setStatus(await res.json())
    }
    load()
  }, [slug])

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
        setConnected(data.domain)
      }
    } catch {
      setError(t('domain.errConnection'))
    }
    setLoading(false)
  }

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
                : status.purchased.status === 'failed' ? 'bg-red-900 text-red-300'
                : 'bg-amber-900 text-amber-300'
              }`}>
                {status.purchased.status === 'sitemap_submitted' ? t('domain.statusOnline')
                  : status.purchased.status === 'failed' ? t('domain.statusProblem')
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

        {!dns && !status?.purchased && (
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

        {!dns && !status?.purchased && (
          <p className="text-sm text-slate-500 mb-4">{t('domain.orConnect')}</p>
        )}

        {!dns && !status?.purchased ? (
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
            <div className="flex items-center gap-2 mb-6">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="font-semibold">{connected}</span>
              <span className="text-amber-400 text-sm">{t('domain.pending')}</span>
            </div>
            <p className="text-sm text-slate-300 mb-4">
              {t('domain.dnsInstructions')}
            </p>
            <div className="space-y-2 mb-6">
              {dns?.map((r, i) => (
                <div key={i} className="grid grid-cols-3 gap-3 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono">
                  <span><span className="text-slate-500">{t('domain.colType')} </span>{r.type}</span>
                  <span><span className="text-slate-500">{t('domain.colName')} </span>{r.name}</span>
                  <span className="truncate"><span className="text-slate-500">{t('domain.colValue')} </span>{r.value}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {t('domain.dnsNote')}
            </p>
          </div>
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
