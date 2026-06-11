import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Props = { params: Promise<{ slug: string }> }

type ERPField = { name: string; type: string; required?: boolean; unique?: boolean }
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

export default async function ErpPage({ params }: Props) {
  const { slug } = await params
  const erp = await fetchErp(slug)
  if (!erp) notFound()

  const blueprint = erp.blueprint || {}
  const modules: ERPModule[] = blueprint.modules || []
  const automations: string[] = blueprint.automations || []
  const agents: string[] = blueprint.agents || []
  const workflows: string[] = blueprint.workflows || []

  return (
    <main style={{ minHeight: '100vh', background: '#050302', color: '#f5ede1', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ marginBottom: 32 }}>
          <p style={{ color: '#d97a4f', fontSize: 14, marginBottom: 6 }}>ERP genere par Nexiora</p>
          <h1 style={{ fontSize: 34, fontWeight: 800, textTransform: 'capitalize', margin: 0 }}>
            {erp.business_name || 'Systeme de gestion'}
          </h1>
          <p style={{ color: '#9a8f80', marginTop: 8 }}>
            {modules.length} modules · {automations.length} automatisations · {agents.length} agents IA
          </p>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 18 }}>
          {modules.map((mod) => (
            <div key={mod.name} style={{ border: '1px solid #2a2018', borderRadius: 16, padding: 20, background: '#0f0a05' }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, textTransform: 'capitalize', margin: '0 0 12px', color: '#f5ede1' }}>
                {mod.name.replace(/_/g, ' ')}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(mod.fields || []).slice(0, 12).map((f, i) => {
                  const fname = typeof f === 'string' ? f : (f?.name || '');
                  const ftype = typeof f === 'string' ? '' : (f?.type || '');
                  return (
                  <div key={fname || i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid #1c150d', paddingBottom: 4 }}>
                    <span style={{ color: '#cbbfae' }}>{fname.replace(/_/g, ' ')}</span>
                    <span style={{ color: '#6f6456' }}>{ftype}</span>
                  </div>
                  );
                })}
                {(mod.fields || []).length > 12 && (
                  <span style={{ color: '#6f6456', fontSize: 12, marginTop: 4 }}>
                    +{mod.fields.length - 12} autres champs
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>

        {(automations.length > 0 || workflows.length > 0) && (
          <section style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Automatisations & Workflows</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[...automations, ...workflows].map((a) => (
                <span key={a} style={{ background: '#1c150d', border: '1px solid #2a2018', borderRadius: 999, padding: '6px 14px', fontSize: 13, color: '#d97a4f' }}>
                  {a.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
