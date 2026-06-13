'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, GraduationCap, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const C = {
  panel: 'rgba(245,237,225,0.03)', panelBorder: 'rgba(217,122,79,0.14)',
  line: 'rgba(245,237,225,0.07)', accent: '#d97a4f', accentSoft: 'rgba(217,122,79,0.12)',
  cream: '#f5ede1', muted: '#9a8f80', faint: '#6f6456',
}
const fieldName = (f: any) => (typeof f === 'string' ? f : f?.name || '')
type Mod = { name: string; fields?: any[] }
type Rec = { id: string; data: Record<string, any> }

function titleOf(data: Record<string, any>): string {
  const keys = Object.keys(data || {})
  const nom = keys.find((k) => /(nom|name)/i.test(k) && !/_(id|code)$/i.test(k))
  const prenom = keys.find((k) => /(prenom|firstname)/i.test(k))
  const parts = [nom && data[nom], prenom && data[prenom]].filter(Boolean)
  if (parts.length) return parts.join(' ')
  const first = keys.find((k) => data[k] && !/_(id|code)$/i.test(k))
  return first ? String(data[first]) : '—'
}

export default function GradeGrid({
  erpSlug, studentsMod, notesMod, subjectsMod, classeKey, classeValue, ecoleKey, ecoleValue, onClose, onDone,
}: {
  erpSlug: string
  studentsMod: Mod
  notesMod: Mod
  subjectsMod: Mod | null
  classeKey: string
  classeValue: string
  ecoleKey?: string
  ecoleValue?: string
  onClose: () => void
  onDone: () => void
}) {
  const [students, setStudents] = useState<Rec[]>([])
  const [subjects, setSubjects] = useState<Rec[]>([])
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState('')
  const [grades, setGrades] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  // champ identifiant eleve (eleve_id) + champ note dans le module notes
  const studentKey = (studentsMod.fields || []).map(fieldName).find((f: string) => /eleve_id|student_id|matricule/i.test(f)) || 'eleve_id'
  const noteField = (notesMod.fields || []).map(fieldName).find((f: string) => /(note|valeur|score|moyenne)/i.test(f) && !/_(id|code)$/i.test(f)) || 'note_obtenue'
  const notesStudentKey = (notesMod.fields || []).map(fieldName).find((f: string) => /eleve_id|student_id/i.test(f)) || 'eleve_id'
  const notesSubjectKey = (notesMod.fields || []).map(fieldName).find((f: string) => /matiere_id|subject_id|cours_id/i.test(f)) || 'matiere_id'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r1 = await fetch('/api/erp-records?erp_slug=' + encodeURIComponent(erpSlug) + '&module=' + encodeURIComponent(studentsMod.name))
      const j1 = await r1.json()
      const allStudents: Rec[] = j1.records || []
      setStudents(allStudents.filter((s) => String(s.data?.[classeKey] ?? '') === classeValue))
      if (subjectsMod) {
        const r2 = await fetch('/api/erp-records?erp_slug=' + encodeURIComponent(erpSlug) + '&module=' + encodeURIComponent(subjectsMod.name))
        const j2 = await r2.json()
        setSubjects(j2.records || [])
      }
    } catch {}
    setLoading(false)
  }, [erpSlug, studentsMod.name, subjectsMod, classeKey, classeValue])

  useEffect(() => { load() }, [load])

  async function token() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  }

  const subjectIdKey = subjectsMod ? ((subjectsMod.fields || []).map(fieldName).find((f: string) => /matiere_id|subject_id|_id$/i.test(f)) || 'matiere_id') : 'matiere_id'
  const subjectNameKey = subjectsMod ? ((subjectsMod.fields || []).map(fieldName).find((f: string) => /(nom|name)/i.test(f) && !/_(id|code)$/i.test(f)) || subjectIdKey) : ''

  const save = async () => {
    const entries = Object.entries(grades).filter(([, v]) => v !== '' && v != null)
    if (entries.length === 0 || !subject) return
    setBusy(true)
    const t = await token()
    for (const [studentId, val] of entries) {
      const data: Record<string, string> = {
        [notesStudentKey]: studentId,
        [notesSubjectKey]: subject,
        [noteField]: String(val),
      }
      if (classeKey) data[classeKey] = classeValue
      if (ecoleKey && ecoleValue) data[ecoleKey] = ecoleValue
      try {
        await fetch('/api/erp-records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
          body: JSON.stringify({ erp_slug: erpSlug, module_name: notesMod.name, data, scope: ecoleValue || undefined }),
        })
      } catch {}
    }
    setBusy(false)
    onDone()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#0a0704', border: '1px solid ' + C.panelBorder, borderRadius: 18, padding: 24, width: 'min(620px, 100%)', maxHeight: '85vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <GraduationCap size={20} color={C.accent} />
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: C.cream }}>Saisir les notes</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 20 }}>×</button>
        </div>

        {subjectsMod && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 6 }}>Matière</label>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%', background: C.panel, border: '1px solid ' + C.line, borderRadius: 9, padding: '10px 12px', color: C.cream, fontSize: 13.5, outline: 'none' }}>
              <option value="">— Choisir une matière —</option>
              {subjects.map((s) => (
                <option key={s.id} value={String(s.data?.[subjectIdKey] ?? s.id)}>{String(s.data?.[subjectNameKey] ?? s.data?.[subjectIdKey] ?? s.id)}</option>
              ))}
            </select>
          </div>
        )}

        {loading && <div style={{ color: C.muted, fontSize: 13, padding: 20, display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Chargement des élèves…</div>}

        {!loading && students.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: C.faint, fontSize: 13 }}>Aucun élève dans cette classe. Ajoutez des élèves d'abord.</div>
        )}

        {!loading && students.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {students.map((st) => {
              const sid = String(st.data?.[studentKey] ?? st.id)
              return (
                <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.panel, border: '1px solid ' + C.line, borderRadius: 10, padding: '8px 12px' }}>
                  <span style={{ flex: 1, fontSize: 13.5, color: C.cream }}>{titleOf(st.data)}</span>
                  <input value={grades[sid] || ''} onChange={(e) => setGrades({ ...grades, [sid]: e.target.value })} placeholder="Note" style={{ width: 90, background: '#0a0704', border: '1px solid ' + C.line, borderRadius: 8, padding: '7px 10px', color: C.cream, fontSize: 13.5, outline: 'none', textAlign: 'center' }} />
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: 'transparent', color: C.muted, border: '1px solid ' + C.line, borderRadius: 10, padding: 11, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={save} disabled={busy || !subject || students.length === 0} style={{ flex: 1, background: C.accent, color: '#fff', border: 'none', borderRadius: 10, padding: 11, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: busy || !subject || students.length === 0 ? 0.6 : 1 }}>
            {busy ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={15} />} Enregistrer
          </button>
        </div>
        <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
      </div>
    </div>
  )
}
