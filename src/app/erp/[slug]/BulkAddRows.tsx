'use client'

import { useState, useMemo } from 'react'
import { Loader2, ClipboardPaste, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const C = {
  panel: 'rgba(245,237,225,0.03)', panelBorder: 'rgba(217,122,79,0.14)',
  line: 'rgba(245,237,225,0.07)', accent: '#d97a4f', accentSoft: 'rgba(217,122,79,0.12)',
  cream: '#f5ede1', muted: '#9a8f80', faint: '#6f6456',
}
const lbl = (s: string) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const fieldName = (f: any) => (typeof f === 'string' ? f : f?.name || '')
const isId = (k: string) => /(^|_)(id|code|matricule|numero|reference|ref)$/i.test(k)

type Mod = { name: string; fields?: any[] }

export default function BulkAddRows({
  erpSlug, mod, prefill, onClose, onDone,
}: {
  erpSlug: string
  mod: Mod
  prefill: Record<string, string>
  onClose: () => void
  onDone: () => void
}) {
  const [raw, setRaw] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)

  // champs cibles : champs non-identifiants du module, dans l'ordre
  const targetFields: string[] = useMemo(
    () => (mod.fields || []).map(fieldName).filter((f: string) => f && !isId(f)),
    [mod]
  )

  // parse : chaque ligne -> cellules (tab ou virgule ou point-virgule)
  const rows = useMemo(() => {
    return raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\t|,|;/).map((c) => c.trim()))
  }, [raw])

  async function token() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  }

  const save = async () => {
    if (rows.length === 0) return
    setBusy(true); setDone(0)
    const t = await token()
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i]
      const data: Record<string, string> = { ...prefill }
      cells.forEach((val, idx) => {
        const field = targetFields[idx]
        if (field && val) data[field] = val
      })
      try {
        await fetch('/api/erp-records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
          body: JSON.stringify({ erp_slug: erpSlug, module_name: mod.name, data, scope: prefill[Object.keys(prefill)[0]] || undefined }),
        })
        setDone(i + 1)
      } catch {}
    }
    setBusy(false)
    onDone()
    onClose()
  }

  const cols = targetFields.slice(0, 6)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#0a0704', border: '1px solid ' + C.panelBorder, borderRadius: 18, padding: 24, width: 'min(680px, 100%)', maxHeight: '85vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <ClipboardPaste size={20} color={C.accent} />
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: C.cream }}>Ajouter plusieurs {lbl(mod.name).toLowerCase()}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: C.muted, marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
          Collez vos lignes (depuis Excel ou une liste). Une ligne par enregistrement ; colonnes séparées par tabulation, virgule ou point-virgule. Ordre des colonnes : {cols.map(lbl).join(' · ')}
        </p>
        <textarea
          value={raw} onChange={(e) => setRaw(e.target.value)} disabled={busy}
          placeholder={'Exemple :\nDupont, Marie\nMartin, Lucas\nKhabi, David'}
          rows={8}
          style={{ width: '100%', background: C.panel, border: '1px solid ' + C.line, borderRadius: 10, padding: 12, color: C.cream, fontSize: 13.5, outline: 'none', fontFamily: 'monospace', resize: 'vertical' }}
        />
        {rows.length > 0 && (
          <div style={{ fontSize: 12.5, color: C.accent, marginTop: 8 }}>{rows.length} ligne{rows.length > 1 ? 's' : ''} détectée{rows.length > 1 ? 's' : ''}</div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ flex: 1, background: 'transparent', color: C.muted, border: '1px solid ' + C.line, borderRadius: 10, padding: 11, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={save} disabled={busy || rows.length === 0} style={{ flex: 1, background: C.accent, color: '#fff', border: 'none', borderRadius: 10, padding: 11, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: busy || rows.length === 0 ? 0.6 : 1 }}>
            {busy ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> {done}/{rows.length}</> : <>Créer {rows.length || ''}</>}
          </button>
        </div>
        <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
      </div>
    </div>
  )
}
