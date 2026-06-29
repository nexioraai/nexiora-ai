'use client'

import { useState } from 'react'
import { use } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'

type Dns = { type: string; name: string; value: string }

export default function DomainePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dns, setDns] = useState<Dns[] | null>(null)
  const [connected, setConnected] = useState('')

  async function handleConnect() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, domain }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Une erreur est survenue.')
      } else {
        setDns(data.dns)
        setConnected(data.domain)
      }
    } catch {
      setError('Connexion impossible. Réessaie.')
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen nexiora-bg text-white">
      <Navbar />
      <section className="max-w-2xl mx-auto px-6 pt-12 pb-24">
        <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white transition mb-2 inline-block">
          ← Dashboard
        </Link>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
          Domaine <span className="text-nexiora">personnalisé</span>
        </h1>
        <p className="text-slate-400 mb-10">
          Connecte ton propre nom de domaine à ce site.
        </p>

        {!dns ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <label className="block text-sm font-semibold mb-2">Ton domaine</label>
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
              {loading ? 'Connexion…' : 'Connecter'}
            </button>
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="font-semibold">{connected}</span>
              <span className="text-amber-400 text-sm">— En attente de configuration</span>
            </div>
            <p className="text-sm text-slate-300 mb-4">
              Ajoute ces 2 enregistrements chez ton registraire (GoDaddy, Namecheap, IONOS…) :
            </p>
            <div className="space-y-2 mb-6">
              {dns.map((r, i) => (
                <div key={i} className="grid grid-cols-3 gap-3 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono">
                  <span><span className="text-slate-500">Type </span>{r.type}</span>
                  <span><span className="text-slate-500">Nom </span>{r.name}</span>
                  <span className="truncate"><span className="text-slate-500">Valeur </span>{r.value}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              La propagation DNS peut prendre quelques minutes à quelques heures. Le certificat SSL est généré automatiquement.
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
