'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, Layers, Loader2, LayoutDashboard, Boxes } from 'lucide-react'

const C = {
  panel: 'rgba(245,237,225,0.03)', panelBorder: 'rgba(217,122,79,0.14)',
  line: 'rgba(245,237,225,0.07)', accent: '#d97a4f', accentSoft: 'rgba(217,122,79,0.12)',
  cream: '#f5ede1', muted: '#9a8f80', faint: '#6f6456',
}

type Mod = { name: string; fields?: any[] }
type Rec = { id: string; module_name: string; data: Record<string, any> }
type Tenant = { module: string; key: string; manager?: string }

const lbl = (s: string) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

// Titre lisible d'une instance (nom explicite, sinon Module + numero, sinon 1er champ non-id)
function isId(k: string) { return /(^|_)(id|code|matricule|numero|reference|ref)$/i.test(k) }
function instanceTitle(data: Record<string, any>, moduleName: string): string {
  const keys = Object.keys(data || {})
  const nameKey = keys.find((k) => /(nom|name|designation|titre|title|libelle|intitule)/i.test(k) && !isId(k))
  if (nameKey && data[nameKey]) return String(data[nameKey])
  const numKey = keys.find((k) => /(numero|number|num|no)$/i.test(k))
  if (numKey && data[numKey] != null && data[numKey] !== '') return (lbl(moduleName).replace(/s$/i, '') + ' ' + data[numKey]).trim()
  const txt = keys.find((k) => data[k] && !isId(k))
  return txt ? String(data[txt]) : 'Unité'
}

// Détecte le tenant : champ blueprint.tenant sinon heuristique (module dont l'id est le plus référencé)
export function resolveTenant(bp: any, modules: Mod[]): Tenant | null {
  if (bp?.tenant && bp.tenant.module) return bp.tenant
  // heuristique : pour chaque module, son champ *_id est-il présent dans d'autres modules ?
  let best: { mod: string; key: string; score: number } | null = null
  for (const m of modules) {
    const idField = (m.fields || []).map((f: any) => (typeof f === 'string' ? f : f?.name || ''))
      .find((fn: string) => new RegExp('^' + m.name.replace(/s$/i, '') + '_id$', 'i').test(fn) || /_id$/i.test(fn) && fn.toLowerCase().startsWith(m.name.replace(/s$/i, '').toLowerCase().slice(0, 4)))
    if (!idField) continue
    let score = 0
    for (const other of modules) {
      if (other.name === m.name) continue
      const has = (other.fields || []).some((f: any) => (typeof f === 'string' ? f : f?.name || '') === idField)
      if (has) score++
    }
    if (score >= 2 && (!best || score > best.score)) best = { mod: m.name, key: idField, score }
  }
  return best ? { module: best.mod, key: best.key } : null
}

export default function TenantView({
  erpSlug, tenant, modules, renderSubErp,
}: {
  erpSlug: string
  tenant: Tenant
  modules: Mod[]
  renderSubErp: (instance: Rec, scopeValue: string) => React.ReactNode
}) {
  const [loading, setLoading] = useState(true)
  const [instances, setInstances] = useState<Rec[]>([])
  const [selected, setSelected] = useState<{ rec: Rec; scope: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/erp-records?erp_slug=' + encodeURIComponent(erpSlug) + '&module=' + encodeURIComponent(tenant.module))
      const json = await res.json()
      setInstances(json.records || [])
    } catch { setInstances([]) }
    setLoading(false)
  }, [erpSlug, tenant.module])

  useEffect(() => { load() }, [load])

  if (selected) {
    return (
      <div>
        <button onClick={() => setSelected(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 }}>
          <ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} /> Toutes les unités
        </button>
        {renderSubErp(selected.rec, selected.scope)}
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.faint, marginBottom: 16 }}>
        Chaque {lbl(tenant.module).replace(/s$/i, '').toLowerCase()} est un espace autonome{tenant.manager ? ' géré par son ' + tenant.manager.toLowerCase() : ''}.
      </div>
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 13, padding: 20 }}>
          <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Chargement…
        </div>
      )}
      {!loading && instances.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: C.faint, background: C.panel, border: '1px solid ' + C.line, borderRadius: 14, fontSize: 13 }}>
          Aucune unité enregistrée.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {instances.map((inst) => {
          const scopeVal = String(inst.data?.[tenant.key] ?? inst.id)
          return (
            <button key={inst.id} onClick={() => setSelected({ rec: inst, scope: scopeVal })} style={{ textAlign: 'left', background: C.panel, border: '1px solid ' + C.panelBorder, borderRadius: 16, padding: 20, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg, ' + C.accent + ', #8a4a28)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Layers size={20} color="#fff" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700, color: C.cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{instanceTitle(inst.data, tenant.module)}</div>
                  <div style={{ fontSize: 11.5, color: C.muted }}>{scopeVal}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.accent }}>
                <LayoutDashboard size={13} /> Ouvrir le tableau de bord <ChevronRight size={13} />
              </div>
            </button>
          )
        })}
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )
}
