'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, Layers, Loader2 } from 'lucide-react'

const C = {
  panel: 'rgba(245,237,225,0.03)', line: 'rgba(245,237,225,0.07)',
  accent: '#d97a4f', accentSoft: 'rgba(217,122,79,0.12)',
  cream: '#f5ede1', muted: '#9a8f80', faint: '#6f6456',
}

type Rec = { id: string; module_name: string; data: Record<string, any> }
type Mod = { name: string; fields?: any[] }

function label(s: string) {
  return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
function fieldName(f: any): string {
  return typeof f === 'string' ? f : (f?.name || '')
}

// Récupère TOUTES les valeurs qui peuvent identifier l'entité (id, code, ...)
function entityIdValues(data: Record<string, any>): string[] {
  const vals: string[] = []
  for (const [k, v] of Object.entries(data || {})) {
    if (v == null || v === '') continue
    // champs identifiants : id, code, matricule, numero, reference
    if (/(^|_)(id|code|matricule|numero|reference|ref)$/i.test(k) || /(id|code|matricule|numero|reference)/i.test(k)) {
      vals.push(String(v))
    }
  }
  return Array.from(new Set(vals))
}

// Champ identifiant ? (id / code / matricule / numero / reference)
function isIdField(k: string): boolean {
  return /(^|_| )(id|code|matricule|numero|reference|ref)( |$)/i.test(k.replace(/_/g, ' '))
}
// Le titre lisible d'une entité : nom explicite, sinon "Module Numero", sinon 1er champ non-id
function entityTitle(data: Record<string, any>, moduleName?: string): string {
  const keys = Object.keys(data || {})
  // 1. un vrai champ nom, NON vide
  const nameKey = keys.find((k) => /(nom|name|designation|titre|title|libelle|intitule)/i.test(k) && !isIdField(k))
  if (nameKey && data[nameKey]) return String(data[nameKey])
  // 2. "Module + numero" (ex: Salle 1)
  const numKey = keys.find((k) => /(numero|number|num|no)/i.test(k))
  if (numKey && data[numKey] != null && data[numKey] !== '') {
    const base = moduleName ? label(moduleName).replace(/s$/i, '') : ''
    return (base + ' ' + data[numKey]).trim()
  }
  // 3. premier champ rempli QUI N'EST PAS un identifiant
  const textKey = keys.find((k) => data[k] && !isIdField(k))
  if (textKey) return String(data[textKey])
  // 4. dernier recours : premier identifiant
  const idKey = keys.find((k) => data[k])
  return idKey ? String(data[idKey]) : 'Détail'
}

export default function EntityDetail({
  erpSlug, entity, modules, onOpenChild, onBack,
}: {
  erpSlug: string
  entity: Rec
  modules: Mod[]
  onOpenChild: (rec: Rec, mod: Mod) => void
  onBack: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [linked, setLinked] = useState<{ mod: Mod; records: Rec[] }[]>([])

  const idVals = entityIdValues(entity.data)
  const myTitle = entityTitle(entity.data, entity.module_name)

  const loadLinked = useCallback(async () => {
    setLoading(true)
    const groups: { mod: Mod; records: Rec[] }[] = []
    if (idVals.length === 0) { setLinked([]); setLoading(false); return }

    for (const mod of modules) {
      if (mod.name === entity.module_name) continue
      try {
        const res = await fetch('/api/erp-records?erp_slug=' + encodeURIComponent(erpSlug) + '&module=' + encodeURIComponent(mod.name))
        const json = await res.json()
        const recs: Rec[] = json.records || []
        // garde les records dont un champ contient l'identifiant de l'entité
        const children = recs.filter((r) =>
          Object.values(r.data || {}).some((v) => v != null && idVals.includes(String(v)))
        )
        if (children.length > 0) groups.push({ mod, records: children })
      } catch {}
    }
    setLinked(groups)
    setLoading(false)
  }, [erpSlug, idVals.join('|'), modules, entity.module_name])

  useEffect(() => { loadLinked() }, [loadLinked])

  const fields = Object.keys(entity.data || {})

  return (
    <div>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer', marginBottom: 18 }}>
        <ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} /> Retour
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, ' + C.accent + ', #8a4a28)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Layers size={22} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, textTransform: 'capitalize' }}>{myTitle}</h2>
          <div style={{ fontSize: 12.5, color: C.muted }}>{label(entity.module_name)}</div>
        </div>
      </div>

      <div style={{ background: C.panel, border: '1px solid ' + C.line, borderRadius: 14, padding: 18, marginTop: 16, marginBottom: 26 }}>
        <div style={{ fontSize: 12, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Informations</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {fields.map((f) => (
            <div key={f}>
              <div style={{ fontSize: 11.5, color: C.muted, textTransform: 'capitalize' }}>{label(f)}</div>
              <div style={{ fontSize: 14, color: C.cream, marginTop: 2 }}>{entity.data[f] || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      {!loading && linked.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
          {linked.map(({ mod, records }) => (
            <div key={'stat-' + mod.name} style={{ background: C.accentSoft, border: '1px solid ' + C.line, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: C.accent, lineHeight: 1 }}>{records.length}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 5, textTransform: 'capitalize' }}>{label(mod.name)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>Données rattachées</div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 13, padding: 20 }}>
          <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Chargement des données liées…
        </div>
      )}

      {!loading && linked.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: C.faint, background: C.panel, border: '1px solid ' + C.line, borderRadius: 14, fontSize: 13 }}>
          Aucune donnée rattachée à cette fiche pour l'instant.
        </div>
      )}

      {!loading && linked.map(({ mod, records }) => (
        <div key={mod.name} style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, textTransform: 'capitalize' }}>{label(mod.name)}</h3>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.accent, background: C.accentSoft, borderRadius: 20, padding: '2px 10px' }}>{records.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {records.map((r) => (
              <button key={r.id} onClick={() => onOpenChild(r, mod)} style={{ textAlign: 'left', background: C.panel, border: '1px solid ' + C.line, borderRadius: 12, padding: '13px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13.5, color: C.cream, fontWeight: 600, textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entityTitle(r.data, mod.name)}</span>
                <ChevronRight size={15} color={C.faint} style={{ flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </div>
      ))}

      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )
}
