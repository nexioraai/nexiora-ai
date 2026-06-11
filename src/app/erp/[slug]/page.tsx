import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Props = { params: Promise<{ slug: string }> }

type ERPField = { name: string; type: string }
type ERPModule = { name: string; fields: (ERPField | string)[]; relations?: any[] }

async function fetchErp(slug: string) {
  const { data, error } = await supabaseAdmin
    .from('erps')
    .select('*')
    .eq('slug', slug)
    .single()
  if (error || !data) return null
  return data
}

const C = {
  bg: '#050302',
  card: '#0f0a05',
  cardBorder: '#2a2018',
  line: '#1c150d',
  accent: '#d97a4f',
  cream: '#f5ede1',
  muted: '#9a8f80',
  faint: '#6f6456',
}

function label(s: string) {
  return (s || '').replace(/_/g, ' ')
}

export default async function ErpPage({ params }: Props) {
  const { slug } = await params
  const erp = await fetchErp(slug)
  if (!erp) notFound()

  const bp = erp.blueprint || {}
  const modules: ERPModule[] = bp.modules || []
  const dashboard: string[] = bp.dashboard || []
  const reports: string[] = bp.reports || []
  const automations: string[] = bp.automations || []
  const agents: string[] = bp.agents || []
  const workflows: string[] = bp.workflows || []

  const title = bp.name || erp.business_name || 'Système de gestion'

  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.cream, padding: '40px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <header style={{ marginBottom: 36 }}>
          <p style={{ color: C.accent, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
            ERP généré par Nexiora
          </p>
          <h1 style={{ fontSize: 38, fontWeight: 800, margin: 0, lineHeight: 1.1 }}>{title}</h1>
          <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap', color: C.muted, fontSize: 14 }}>
            <span>{modules.length} modules</span>
            <span>·</span>
            <span>{automations.length} automatisations</span>
            <span>·</span>
            <span>{agents.length} agents IA</span>
            <span>·</span>
            <span>{workflows.length} workflows</span>
          </div>
        </header>

        {/* KPIs dashboard */}
        {dashboard.length > 0 && (
          <section style={{ marginBottom: 44 }}>
            <h2 style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: C.faint, marginBottom: 16 }}>
              Tableau de bord
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
              {dashboard.map((kpi) => (
                <div key={kpi} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: 18 }}>
                  <div style={{ color: C.muted, fontSize: 12, textTransform: 'capitalize', marginBottom: 8 }}>{label(kpi)}</div>
                  <div style={{ color: C.cream, fontSize: 26, fontWeight: 700 }}>—</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Modules */}
        <section style={{ marginBottom: 44 }}>
          <h2 style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: C.faint, marginBottom: 16 }}>
            Modules
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 18 }}>
            {modules.map((mod) => (
              <div key={mod.name} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: 20 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, textTransform: 'capitalize', margin: '0 0 12px', color: C.cream }}>
                  {label(mod.name)}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(mod.fields || []).slice(0, 10).map((f, i) => {
                    const fname = typeof f === 'string' ? f : (f?.name || '')
                    const ftype = typeof f === 'string' ? '' : (f?.type || '')
                    return (
                      <div key={fname || i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: `1px solid ${C.line}`, paddingBottom: 4 }}>
                        <span style={{ color: '#cbbfae' }}>{label(fname)}</span>
                        <span style={{ color: C.faint }}>{ftype}</span>
                      </div>
                    )
                  })}
                  {(mod.fields || []).length > 10 && (
                    <span style={{ color: C.faint, fontSize: 12, marginTop: 4 }}>
                      +{mod.fields.length - 10} autres champs
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Agents IA */}
        {agents.length > 0 && (
          <section style={{ marginBottom: 44 }}>
            <h2 style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: C.faint, marginBottom: 16 }}>
              Agents IA
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
              {agents.map((a) => (
                <div key={a} style={{ background: 'linear-gradient(135deg, #1a1208 0%, #0f0a05 100%)', border: `1px solid ${C.accent}33`, borderRadius: 14, padding: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `${C.accent}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v1H7a2 2 0 0 0-2 2v3a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4V8a2 2 0 0 0-2-2h-2V5a3 3 0 0 0-3-3z"/><circle cx="9" cy="10" r="1" fill={C.accent}/><circle cx="15" cy="10" r="1" fill={C.accent}/></svg>
                  </div>
                  <span style={{ color: C.cream, fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>{label(a)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Automatisations */}
        {automations.length > 0 && (
          <section style={{ marginBottom: 44 }}>
            <h2 style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: C.faint, marginBottom: 16 }}>
              Automatisations
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {automations.map((a) => (
                <span key={a} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#cbbfae', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: C.accent }} />
                  {label(a)}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Workflows */}
        {workflows.length > 0 && (
          <section style={{ marginBottom: 44 }}>
            <h2 style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: C.faint, marginBottom: 16 }}>
              Workflows
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
              {workflows.map((w, i) => (
                <div key={w} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: '14px 16px', fontSize: 13, color: '#cbbfae', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: C.accent, fontWeight: 700, fontSize: 12 }}>{String(i + 1).padStart(2, '0')}</span>
                  {label(w)}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Reports */}
        {reports.length > 0 && (
          <section>
            <h2 style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: C.faint, marginBottom: 16 }}>
              Rapports
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {reports.map((r) => (
                <span key={r} style={{ background: 'transparent', border: `1px solid ${C.cardBorder}`, borderRadius: 999, padding: '8px 16px', fontSize: 13, color: C.muted, textTransform: 'capitalize' }}>
                  {label(r)}
                </span>
              ))}
            </div>
          </section>
        )}

      </div>
    </main>
  )
}
