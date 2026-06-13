'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, Layers, Loader2, Plus, GraduationCap } from 'lucide-react'
import GradeGrid from './GradeGrid'

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
function entityIdPairs(data: Record<string, any>, moduleName?: string): { key: string; value: string }[] {
  const all: { key: string; value: string }[] = []
  for (const [k, v] of Object.entries(data || {})) {
    if (v == null || v === '') continue
    if (/(^|_)(id|code|matricule|numero|reference|ref)$/i.test(k)) {
      all.push({ key: k, value: String(v) })
    }
  }
  // CLE PRIMAIRE : le champ qui identifie CETTE entite (ex: classes -> classe_id),
  // pas les cles d'environnement partagees (ecole_id sur une classe = grand-parent).
  if (moduleName) {
    const singular = moduleName.replace(/s$/i, '').toLowerCase()
    const own = all.find((p) => {
      const kb = p.key.replace(/_(id|code|matricule|numero|reference|ref)$/i, '').toLowerCase()
      return kb === singular || singular.startsWith(kb) || kb.startsWith(singular)
    })
    if (own) return [own]
  }
  // fallback : si pas de cle propre identifiable, garder l'unique id sinon tous
  return all
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
  erpSlug, entity, modules, onOpenChild, onAddChild, onBack,
}: {
  erpSlug: string
  entity: Rec
  modules: Mod[]
  onOpenChild: (rec: Rec, mod: Mod) => void
  onAddChild?: (mod: Mod, prefill: Record<string, string>) => void
  onBack: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [linked, setLinked] = useState<{ mod: Mod; records: Rec[] }[]>([])

  const idPairs = entityIdPairs(entity.data, entity.module_name)
  const [showGrades, setShowGrades] = useState(false)
  const notesMod = modules.find((m) => /note|grade|bulletin/i.test(m.name))
  const subjectsMod = modules.find((m) => /matiere|subject|cours|discipline/i.test(m.name)) || null
  const studentsMod = modules.find((m) => /eleve|student|apprenant/i.test(m.name))
  const myKey = idPairs[0]?.key
  const myVal = idPairs[0]?.value
  const ecolePair = entityIdPairs(entity.data).find((p) => /ecole|school|etabliss/i.test(p.key))
  const canGrade = !!(notesMod && studentsMod && myKey && /classe|class|groupe/i.test(entity.module_name))
  const myTitle = entityTitle(entity.data, entity.module_name)

  const loadLinked = useCallback(async () => {
    setLoading(true)
    const groups: { mod: Mod; records: Rec[] }[] = []
    if (idPairs.length === 0) { setLinked([]); setLoading(false); return }

    for (const mod of modules) {
      if (mod.name === entity.module_name) continue
      try {
        const res = await fetch('/api/erp-records?erp_slug=' + encodeURIComponent(erpSlug) + '&module=' + encodeURIComponent(mod.name))
        const json = await res.json()
        const recs: Rec[] = json.records || []
        // garde les records dont un champ contient l'identifiant de l'entité
        const children = recs.filter((r) =>
          idPairs.some((p) => String(r?.data?.[p.key] ?? '') === p.value)
        )
        if (children.length > 0) groups.push({ mod, records: children })
      } catch {}
    }
    setLinked(groups)
    setLoading(false)
  }, [erpSlug, idPairs.map((p) => p.key + ':' + p.value).join('|'), modules, entity.module_name])

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
        {canGrade && (
          <button onClick={() => setShowGrades(true)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: C.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 15px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <GraduationCap size={16} /> Saisir les notes
          </button>
        )}
      </div>

      {showGrades && notesMod && studentsMod && myKey && (
        <GradeGrid
          erpSlug={erpSlug}
          studentsMod={studentsMod}
          notesMod={notesMod}
          subjectsMod={subjectsMod}
          classeKey={myKey}
          classeValue={myVal}
          ecoleKey={ecolePair?.key}
          ecoleValue={ecolePair?.value}
          onClose={() => setShowGrades(false)}
          onDone={() => loadLinked()}
        />
      )}

      <div style={{ background: C.panel, border: '1px solid ' + C.line, borderRadius: 14, padding: 18, marginTop: 16, marginBottom: 26 }}>
        <div style={{ fontSize: 12, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Informations</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {fields.map((f) => (
            <div key={f}>
              <div style={{ fontSize: 11.5, color: C.muted, textTransform: 'capitalize' }}>{label(f)}</div>
              <div style={{ fontSize: 14, color: C.cream, marginTop: 2 }}>{entity.data[f] || '—'}</div>
            </div>
          ))}
          {!loading && linked.map(({ mod, records }) => (
            <div key={'count-' + mod.name}>
              <div style={{ fontSize: 11.5, color: C.muted, textTransform: 'capitalize' }}>{label(mod.name)}</div>
              <div style={{ fontSize: 14, color: C.accent, fontWeight: 700, marginTop: 2 }}>{records.length}</div>
            </div>
          ))}
        </div>
      </div>

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
            {onAddChild && (
              <button onClick={() => onAddChild(mod, Object.fromEntries(idPairs.map((p) => [p.key, p.value])))} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, background: C.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                <Plus size={14} /> Ajouter
              </button>
            )}
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
