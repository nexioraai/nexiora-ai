'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Plus, Search, Trash2, Pencil, X, Loader2, Inbox, QrCode, ScanLine } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LocationPicker, { Location, buildLocationCode } from './LocationPicker'
import QRCodeView from './QRCodeView'
import Scanner from './Scanner'

type ERPField = { name: string; type: string }
type ERPModule = { name: string; fields: (ERPField | string)[] }
type Record_ = { id: string; data: Record<string, any>; created_at: string; scope?: string | null }

const C = {
  bg2: '#0a0704', panel: 'rgba(245,237,225,0.03)', panelBorder: 'rgba(217,122,79,0.14)',
  line: 'rgba(245,237,225,0.07)', accent: '#d97a4f', accentSoft: 'rgba(217,122,79,0.12)',
  cream: '#f5ede1', muted: '#9a8f80', faint: '#6f6456',
}
const label = (s: string) => (s || '').replace(/_/g, ' ')
const fieldName = (f: ERPField | string) => (typeof f === 'string' ? f : f?.name || '')

export default function ModuleTable({ erpSlug, module, onRowClick }: { erpSlug: string; module: ERPModule; onRowClick?: (rec: any) => void }) {
  const fields = (module.fields || []).map(fieldName).filter(Boolean)
  const isLocatable = /inventory|product|stock|warehouse|item|article|entrepot|produit/i.test(module.name)
  const emptyLoc: Location = { warehouse: '', aisle: '', rack: '', level: '', bin: '' }
  const [records, setRecords] = useState<Record_[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Record_ | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [scopeFilter, setScopeFilter] = useState('all')
  const [formScope, setFormScope] = useState('')
  const [location, setLocation] = useState<Location>({ warehouse: '', aisle: '', rack: '', level: '', bin: '' })
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [showScanner, setShowScanner] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/erp-records?erp_slug=${encodeURIComponent(erpSlug)}&module=${encodeURIComponent(module.name)}`)
      const json = await res.json()
      setRecords(json.records || [])
      setIsAdmin(!!json.access?.isAdmin)
    } catch { setRecords([]) }
    setLoading(false)
  }, [erpSlug, module.name])

  useEffect(() => { load() }, [load])

  async function token() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  }

  const openAdd = () => { setEditing(null); setForm({}); setFormScope(''); setLocation({ warehouse: '', aisle: '', rack: '', level: '', bin: '' }); setShowForm(true) }
  const openEdit = (r: Record_) => {
    setEditing(r)
    const f: Record<string, string> = {}
    fields.forEach((k) => { f[k] = r.data?.[k] ?? '' })
    setForm(f)
    setShowForm(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const t = await token()
      if (editing) {
        await fetch('/api/erp-records', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
          body: JSON.stringify({ id: editing.id, data: form }),
        })
      } else {
        await fetch('/api/erp-records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
          body: JSON.stringify({ erp_slug: erpSlug, module_name: module.name, data: isLocatable ? { ...form, location_code: buildLocationCode(location) } : form, scope: isAdmin ? (formScope || null) : undefined }),
        })
      }
      setShowForm(false)
      await load()
    } catch {}
    setSaving(false)
  }

  const remove = async (id: string) => {
    try {
      const t = await token()
      await fetch(`/api/erp-records?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + t },
      })
      await load()
    } catch {}
  }

  const scopes = Array.from(new Set(records.map((r) => r.scope).filter(Boolean))) as string[]
  const filtered = records.filter((r) =>
    (!search || JSON.stringify(r.data).toLowerCase().includes(search.toLowerCase())) &&
    (scopeFilter === 'all' || r.scope === scopeFilter)
  )

  const cols = fields.slice(0, 6)

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, textTransform: 'capitalize', margin: 0 }}>{label(module.name)}</h2>
          <div style={{ fontSize: 12.5, color: C.faint, marginTop: 2 }}>{records.length} enregistrement{records.length > 1 ? 's' : ''}</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 14px', width: 220 }}>
          <Search size={15} color={C.faint} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" style={{ background: 'transparent', border: 'none', outline: 'none', color: C.cream, fontSize: 13, width: '100%' }} />
        </div>
        {isAdmin && scopes.length > 0 && (
          <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: '9px 12px', color: C.cream, fontSize: 13, outline: 'none', cursor: 'pointer' }}>
            <option value="all">Tous les périmètres</option>
            {scopes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <button onClick={() => setShowScanner(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', color: C.accent, border: `1px solid ${C.panelBorder}`, borderRadius: 10, padding: '9px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
          <ScanLine size={16} /> Scanner
        </button>
        <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {/* Tableau */}
      <div style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 16, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: C.faint }}>
            <Loader2 size={28} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
            <div style={{ marginTop: 10, fontSize: 13 }}>Chargement…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: C.faint }}>
            <Inbox size={32} color={C.faint} />
            <div style={{ marginTop: 12, fontSize: 14, color: C.muted }}>Aucune donnée pour l'instant</div>
            <button onClick={openAdd} style={{ marginTop: 16, background: C.accentSoft, color: C.accent, border: `1px solid ${C.panelBorder}`, borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + Ajouter le premier enregistrement
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.line}` }}>
                  {cols.map((c) => (
                    <th key={c} style={{ textAlign: 'left', padding: '14px 16px', color: C.muted, fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{label(c)}</th>
                  ))}
                  <th style={{ padding: '14px 16px', width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} onClick={() => onRowClick && onRowClick(r)} style={{ borderBottom: `1px solid ${C.line}`, cursor: onRowClick ? 'pointer' : 'default' }}>
                    {cols.map((c) => (
                      <td key={c} style={{ padding: '13px 16px', color: '#cbbfae', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.data?.[c] || <span style={{ color: C.faint }}>—</span>}
                      </td>
                    ))}
                    <td style={{ padding: '13px 16px' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        {r.data?.location_code && (
                          <button onClick={() => setQrCode(r.data.location_code)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.accent, padding: 4 }} title="QR code">
                            <QrCode size={15} />
                          </button>
                        )}
                        <button onClick={() => openEdit(r)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, padding: 4 }} title="Modifier">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => remove(r.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#c75d5d', padding: 4 }} title="Supprimer">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal formulaire */}
      {showForm && (
        <div
          onClick={() => setShowForm(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            style={{ background: C.bg2, border: `1px solid ${C.panelBorder}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 460, maxHeight: '85vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, textTransform: 'capitalize' }}>
                {editing ? 'Modifier' : 'Ajouter'} — {label(module.name)}
              </h3>
              <div style={{ flex: 1 }} />
              <button onClick={() => setShowForm(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {isAdmin && (
                <div>
                  <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>Périmètre (entrepôt / magasin)</label>
                  <input value={formScope} onChange={(e) => setFormScope(e.target.value)} placeholder="Ex: Warehouse 1 (vide = aucun)" style={{ width: '100%', background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: '10px 12px', color: C.cream, fontSize: 13.5, outline: 'none' }} />
                </div>
              )}
              {isLocatable && (
                <LocationPicker value={location} onChange={setLocation} />
              )}
              {fields.map((f) => (
                <div key={f}>
                  <label style={{ fontSize: 12, color: C.muted, textTransform: 'capitalize', display: 'block', marginBottom: 5 }}>{label(f)}</label>
                  <input
                    value={form[f] || ''}
                    onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                    style={{ width: '100%', background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: '10px 12px', color: C.cream, fontSize: 13.5, outline: 'none' }}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, background: 'transparent', color: C.muted, border: `1px solid ${C.line}`, borderRadius: 10, padding: '11px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={save} disabled={saving} style={{ flex: 1, background: C.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: saving ? 0.6 : 1 }}>
                {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                {editing ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showScanner && <Scanner onResult={(code) => { setSearch(code); setShowScanner(false) }} onClose={() => setShowScanner(false)} />}
      {qrCode && <QRCodeView code={qrCode} label={label(module.name)} onClose={() => setQrCode(null)} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
