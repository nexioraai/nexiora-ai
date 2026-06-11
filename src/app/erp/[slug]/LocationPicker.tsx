'use client'

import { MapPin } from 'lucide-react'

export type Location = {
  warehouse: string
  aisle: string
  rack: string
  level: string
  bin: string
}

const C = {
  panel: 'rgba(245,237,225,0.03)', line: 'rgba(245,237,225,0.07)',
  accent: '#d97a4f', accentSoft: 'rgba(217,122,79,0.12)',
  cream: '#f5ede1', muted: '#9a8f80', faint: '#6f6456',
}

// Compose le code universel d'emplacement, ex: WH1-A-03-02-05
export function buildLocationCode(loc: Partial<Location>): string {
  const parts = [loc.warehouse, loc.aisle, loc.rack, loc.level, loc.bin]
    .map((p) => (p || '').toString().trim().toUpperCase())
    .filter(Boolean)
  return parts.join('-')
}

const FIELDS: { key: keyof Location; label: string; placeholder: string }[] = [
  { key: 'warehouse', label: 'Entrepôt', placeholder: 'WH1' },
  { key: 'aisle', label: 'Allée', placeholder: 'A' },
  { key: 'rack', label: 'Rack', placeholder: '03' },
  { key: 'level', label: 'Niveau', placeholder: '02' },
  { key: 'bin', label: 'Bac', placeholder: '05' },
]

export default function LocationPicker({ value, onChange }: { value: Location; onChange: (loc: Location) => void }) {
  const code = buildLocationCode(value)
  const set = (key: keyof Location, v: string) => onChange({ ...value, [key]: v })

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <MapPin size={15} color={C.accent} />
        <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>Localisation précise</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 7 }}>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label style={{ fontSize: 10.5, color: C.faint, display: 'block', marginBottom: 4, textAlign: 'center' }}>{f.label}</label>
            <input
              value={value[f.key] || ''}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              style={{ width: '100%', background: 'rgba(0,0,0,0.25)', border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 4px', color: C.cream, fontSize: 13, outline: 'none', textAlign: 'center', textTransform: 'uppercase', boxSizing: 'border-box' }}
            />
          </div>
        ))}
      </div>

      {/* Aperçu du code généré */}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 9, background: code ? C.accentSoft : 'transparent', border: `1px dashed ${code ? C.accent + '55' : C.line}`, borderRadius: 9, padding: '9px 12px' }}>
        <MapPin size={14} color={code ? C.accent : C.faint} />
        <span style={{ fontSize: 13, fontFamily: 'monospace', letterSpacing: 1, color: code ? C.cream : C.faint, fontWeight: 600 }}>
          {code || 'Code généré automatiquement…'}
        </span>
      </div>
    </div>
  )
}
