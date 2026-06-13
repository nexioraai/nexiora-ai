'use client'

import { useState } from 'react'
import { Sparkles, Loader2, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const C = {
  panel: 'rgba(245,237,225,0.03)', panelBorder: 'rgba(217,122,79,0.14)',
  line: 'rgba(245,237,225,0.07)', accent: '#d97a4f', accentSoft: 'rgba(217,122,79,0.12)',
  cream: '#f5ede1', muted: '#9a8f80', faint: '#6f6456',
}
const lbl = (s: string) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

type Mod = { name: string; fields?: any[] }
const fieldName = (f: any) => (typeof f === 'string' ? f : f?.name || '')

// cle propre du module (ex: classes -> classe_id)
function ownKey(mod: Mod): string | null {
  const singular = mod.name.replace(/s$/i, '').toLowerCase()
  const fields = (mod.fields || []).map(fieldName)
  return fields.find((f: string) => {
    const kb = f.replace(/_(id|code|numero|reference|ref)$/i, '').toLowerCase()
    return /_(id|code|numero)$/i.test(f) && (kb === singular || singular.startsWith(kb) || kb.startsWith(singular))
  }) || fields.find((f: string) => /_(id|code|numero)$/i.test(f)) || null
}

export default function BulkGenerate({
  erpSlug, mod, tenantKey, scopeValue, onDone,
}: {
  erpSlug: string
  mod: Mod
  tenantKey: string
  scopeValue: string
  onDone: () => void
}) {
  const [count, setCount] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)

  const key = ownKey(mod)
  const prefix = (mod.name.slice(0, 3).toUpperCase()) + '_' + scopeValue + '_'

  async function token() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  }

  const generate = async () => {
    const n = parseInt(count, 10)
    if (!n || n < 1 || n > 200) return
    setBusy(true); setDone(0)
    const t = await token()
    for (let i = 1; i <= n; i++) {
      const data: Record<string, string> = { [tenantKey]: scopeValue }
      if (key) data[key] = prefix + i
      // numero lisible si un champ numero existe
      const numField = (mod.fields || []).map(fieldName).find((f: string) => /(numero|number|num)$/i.test(f))
      if (numField) data[numField] = String(i)
      try {
        await fetch('/api/erp-records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
          body: JSON.stringify({ erp_slug: erpSlug, module_name: mod.name, data, scope: scopeValue }),
        })
        setDone(i)
      } catch {}
    }
    setBusy(false)
    setCount('')
    onDone()
  }

  return (
    <div style={{ background: C.accentSoft, border: '1px solid ' + C.panelBorder, borderRadius: 12, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <Sparkles size={17} color={C.accent} />
      <span style={{ fontSize: 13, color: C.cream }}>Générer en masse des {lbl(mod.name).toLowerCase()}</span>
      <input
        type="number" min={1} max={200} value={count} onChange={(e) => setCount(e.target.value)}
        placeholder="Nombre" disabled={busy}
        style={{ width: 90, background: C.panel, border: '1px solid ' + C.line, borderRadius: 8, padding: '7px 10px', color: C.cream, fontSize: 13, outline: 'none' }}
      />
      <button onClick={generate} disabled={busy || !count} style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy || !count ? 0.6 : 1 }}>
        {busy ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> {done} créés…</> : <>Générer</>}
      </button>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )
}
