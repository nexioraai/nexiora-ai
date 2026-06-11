'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Brain, AlertTriangle, TrendingUp, TrendingDown, Target, Sparkles, Loader2, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Rupture = { produit: string; jours_estimes: number; urgence: string; conseil: string }
type Best = { produit: string; raison: string }
type Slow = { produit: string; raison: string }
type Invest = { produit: string; recommandation: string; justification: string }
type Report = {
  summary: string
  ruptures: Rupture[]
  bestsellers: Best[]
  slow: Slow[]
  investments: Invest[]
}

const C = {
  bg2: '#0a0704', panel: 'rgba(245,237,225,0.03)', panelBorder: 'rgba(217,122,79,0.14)',
  line: 'rgba(245,237,225,0.07)', accent: '#d97a4f', accentSoft: 'rgba(217,122,79,0.12)',
  cream: '#f5ede1', muted: '#9a8f80', faint: '#6f6456',
}

const urgenceColor = (u: string) => u === 'haute' ? '#c75d5d' : u === 'moyenne' ? '#d9a64f' : '#7db87d'

export default function AIAnalysis({ erpSlug }: { erpSlug: string }) {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [err, setErr] = useState('')
  const [count, setCount] = useState<number | null>(null)

  const analyze = async () => {
    setLoading(true); setErr('')
    try {
      const { data } = await supabase.auth.getSession()
      const t = data.session?.access_token || ''
      const res = await fetch('/api/erp-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify({ erp_slug: erpSlug }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error || 'Erreur'); setLoading(false); return }
      setReport(json.report)
      setCount(json.recordCount ?? null)
    } catch { setErr('Erreur réseau') }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 22 }}>
        <div style={{ width: 46, height: 46, borderRadius: 13, background: 'linear-gradient(135deg, ' + C.accent + ', #8a4a28)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Brain size={24} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 21, fontWeight: 700, margin: 0 }}>Analyse IA stratégique</h2>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>Prédictions et recommandations — confidentiel, réservé au PDG</div>
        </div>
        <button onClick={analyze} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={16} />}
          {loading ? 'Analyse en cours…' : 'Analyser maintenant'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(217,122,79,0.08)', border: '1px solid ' + C.panelBorder, borderRadius: 12, padding: '12px 16px', marginBottom: 22 }}>
        <Lock size={15} color={C.accent} />
        <span style={{ fontSize: 12.5, color: C.cream }}>Ces analyses sont des secrets professionnels. Elles ne sont visibles que par vous, le PDG.</span>
      </div>

      {err && (<div style={{ background: 'rgba(199,93,93,0.1)', border: '1px solid rgba(199,93,93,0.3)', borderRadius: 12, padding: '14px 16px', color: '#e88', fontSize: 13.5, marginBottom: 18 }}>{err}</div>)}

      {!report && !loading && !err && (
        <div style={{ padding: '40px', textAlign: 'center', color: C.faint, background: C.panel, border: '1px solid ' + C.line, borderRadius: 16 }}>
          <Brain size={32} color={C.faint} />
          <div style={{ marginTop: 12, fontSize: 14, color: C.muted }}>Lancez une analyse pour obtenir vos prédictions stratégiques</div>
          <div style={{ marginTop: 4, fontSize: 12.5 }}>Ruptures de stock, best-sellers, recommandations d'investissement</div>
        </div>
      )}

      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ background: 'linear-gradient(135deg, rgba(217,122,79,0.1), transparent)', border: '1px solid ' + C.panelBorder, borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Sparkles size={16} color={C.accent} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>Synthèse</span>
            </div>
            <p style={{ fontSize: 14.5, color: C.cream, lineHeight: 1.6, margin: 0 }}>{report.summary}</p>
            {count !== null && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 10 }}>Basé sur {count} enregistrement{count > 1 ? 's' : ''}</div>}
          </motion.div>

          {report.ruptures?.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <AlertTriangle size={17} color="#c75d5d" />
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Risques de rupture</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {report.ruptures.map((r, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} style={{ background: C.panel, border: '1px solid ' + urgenceColor(r.urgence) + '44', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 54 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: urgenceColor(r.urgence), lineHeight: 1 }}>{r.jours_estimes}</div>
                      <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>jours</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.cream, textTransform: 'capitalize' }}>{r.produit}</div>
                      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{r.conseil}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: urgenceColor(r.urgence), border: '1px solid ' + urgenceColor(r.urgence) + '55', borderRadius: 6, padding: '3px 9px', textTransform: 'uppercase', flexShrink: 0 }}>{r.urgence}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {report.bestsellers?.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <TrendingUp size={17} color="#7db87d" />
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Produits les plus performants</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
                {report.bestsellers.map((b, i) => (
                  <div key={i} style={{ background: C.panel, border: '1px solid ' + C.line, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.cream, textTransform: 'capitalize' }}>{b.produit}</div>
                    <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{b.raison}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.slow?.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <TrendingDown size={17} color="#d9a64f" />
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Produits qui stagnent</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
                {report.slow.map((s, i) => (
                  <div key={i} style={{ background: C.panel, border: '1px solid ' + C.line, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.cream, textTransform: 'capitalize' }}>{s.produit}</div>
                    <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{s.raison}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.investments?.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Target size={17} color={C.accent} />
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Recommandations d'investissement</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {report.investments.map((inv, i) => (
                  <div key={i} style={{ background: C.panel, border: '1px solid ' + C.line, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.cream, textTransform: 'capitalize' }}>{inv.produit}</div>
                      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{inv.justification}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.accent, background: C.accentSoft, borderRadius: 7, padding: '5px 11px', textTransform: 'capitalize', flexShrink: 0 }}>{inv.recommandation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )
}
