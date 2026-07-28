'use client'

import { useState } from 'react'
import { use } from 'react'
import Link from 'next/link'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'

// Chargement paresseux : loadStripe au niveau module s'execute au rendu de la
// page, avant meme qu'un paiement soit demande, et fait echouer la page entiere
// si le script ne repond pas.
let _stripePromise: ReturnType<typeof loadStripe> | null = null
function getStripePromise() {
  if (!_stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (!key) throw new Error('Cle Stripe publique absente')
    _stripePromise = loadStripe(key)
  }
  return _stripePromise
}

type Quote = {
  domainId: string
  domain: string
  clientSecret: string
  firstYearUsd: number
  renewalUsd: number
  firstYearPromo: boolean
}

function PaymentForm({ quote, onDone }: { quote: Quote; onDone: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pay() {
    if (!stripe || !elements) return
    setBusy(true)
    setError('')
    const { error: err } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })
    if (err) {
      setError(err.message || 'Paiement refuse.')
      setBusy(false)
      return
    }
    onDone()
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        onClick={pay}
        disabled={busy || !stripe}
        className="w-full bg-white text-black font-medium rounded-xl py-3 disabled:opacity-40"
      >
        {busy ? 'Paiement en cours...' : `Payer $${quote.firstYearUsd.toFixed(2)} USD`}
      </button>
      <p className="text-xs text-white/40 text-center">
        Renouvellement automatique a ${quote.renewalUsd.toFixed(2)} USD par an. Annulable a tout moment.
      </p>
    </div>
  )
}

export default function AcheterDomainePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Session expiree. Reconnecte-toi.')
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    }
  }

  async function search() {
    setError('')
    setResult(null)
    setQuote(null)
    setSearching(true)
    try {
      const res = await fetch('/api/domains/search', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ domain: query.trim().toLowerCase() }),
      })
      const data = await res.json()
      if (res.status === 429) {
        // Porkbun limite les verifications a une toutes les 10 secondes.
        const secs = Math.ceil((data.retryAfterMs || 10000) / 1000)
        setCooldown(secs)
        const timer = setInterval(() => {
          setCooldown((c) => {
            if (c <= 1) { clearInterval(timer); return 0 }
            return c - 1
          })
        }, 1000)
        setError(`Trop de recherches. Reessaie dans ${secs} secondes.`)
      } else if (!res.ok) {
        setError(data.error || 'Recherche impossible.')
      } else {
        setResult(data)
      }
    } catch (e: any) {
      setError(e.message)
    }
    setSearching(false)
  }

  async function startPurchase() {
    setError('')
    try {
      const res = await fetch('/api/domains/purchase', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ slug, domain: result.domain }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Achat impossible.')
        return
      }
      setQuote(data)
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <main className="min-h-screen nexiora-bg text-white">
      <Navbar />
      <section className="max-w-2xl mx-auto px-6 pt-12 pb-24">
        <Link href={`/domaine/${slug}`} className="text-sm text-white/50 hover:text-white transition mb-2 inline-block">
          Retour
        </Link>
        <h1 className="text-4xl font-bold mb-2">Acheter un domaine</h1>
        <p className="text-white/60 mb-8">
          Woorri achete, configure et met ton site en ligne. Tu n&apos;as rien a parametrer.
        </p>

        {done ? (
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 text-center">
            <h2 className="text-xl font-semibold mb-2">C&apos;est fait</h2>
            <p className="text-white/60 text-sm">
              {quote?.domain} est en cours de configuration. Ton site sera accessible sous quelques minutes.
            </p>
          </div>
        ) : quote ? (
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
            <div className="mb-6 pb-6 border-b border-white/10">
              <p className="text-lg font-semibold">{quote.domain}</p>
              {quote.firstYearPromo && (
                <p className="text-xs text-amber-300 mt-2">
                  Tarif promotionnel la premiere annee. Le renouvellement sera de ${quote.renewalUsd.toFixed(2)} par an.
                </p>
              )}
            </div>
            <Elements stripe={getStripePromise()} options={{ clientSecret: quote.clientSecret, appearance: { theme: 'night' } }}>
              <PaymentForm quote={quote} onDone={() => setDone(true)} />
            </Elements>
          </div>
        ) : (
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
            <label className="block text-sm font-medium mb-2">Nom de domaine</label>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !searching && cooldown === 0 && search()}
                placeholder="maboutique.com"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-white/30"
              />
              <button
                onClick={search}
                disabled={searching || !query.trim() || cooldown > 0}
                className="px-5 bg-white text-black font-medium rounded-xl disabled:opacity-40"
              >
                {cooldown > 0 ? `${cooldown}s` : searching ? '...' : 'Chercher'}
              </button>
            </div>

            {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

            {result && (
              <div className="mt-6 pt-6 border-t border-white/10">
                {!result.available ? (
                  <p className="text-sm text-white/60">
                    <span className="font-medium text-white">{result.domain}</span> n&apos;est pas disponible.
                  </p>
                ) : !result.apiRegisterable ? (
                  <p className="text-sm text-white/60">
                    Ce type de domaine ne peut pas etre achete automatiquement. Choisis une autre extension,
                    ou achete-le ailleurs puis connecte-le depuis la page domaine.
                  </p>
                ) : (
                  <div>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="font-medium">{result.domain}</span>
                      <span className="text-xl font-bold">${result.sellFirstYearUsd?.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-white/40 mb-4">
                      Premiere annee, puis ${result.sellRenewalUsd?.toFixed(2)} par an
                      {result.firstYearPromo && ' (tarif promotionnel la premiere annee)'}
                    </p>
                    <button
                      onClick={startPurchase}
                      className="w-full bg-white text-black font-medium rounded-xl py-3"
                    >
                      Continuer
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
