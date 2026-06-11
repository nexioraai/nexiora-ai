'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Shield, ShieldCheck, UserPlus, Trash2, X, Loader2, Lock, Crown, Users, Eye } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Member = {
  id: string
  member_email: string
  role: string
  allowed_modules: string[]
  scope: string | null
  created_at: string
}

const C = {
  bg2: '#0a0704', panel: 'rgba(245,237,225,0.03)', panelBorder: 'rgba(217,122,79,0.14)',
  line: 'rgba(245,237,225,0.07)', accent: '#d97a4f', accentSoft: 'rgba(217,122,79,0.12)',
  cream: '#f5ede1', muted: '#9a8f80', faint: '#6f6456',
}

const ROLES = [
  { id: 'admin', label: 'PDG / Admin', icon: Crown, color: '#d97a4f', desc: 'Accès total + gestion des accès' },
  { id: 'manager', label: 'Gérant', icon: ShieldCheck, color: '#5b9bd5', desc: 'Gère son périmètre uniquement' },
  { id: 'employee', label: 'Employé', icon: Eye, color: '#7d8a6a', desc: 'Accès limité aux modules autorisés' },
]
const roleInfo = (r: string) => ROLES.find((x) => x.id === r) || ROLES[2]

export default function TeamAccess({ erpSlug, moduleNames, isAdmin, ownerEmail }: { erpSlug: string; moduleNames: string[]; isAdmin: boolean; ownerEmail: string }) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fRole, setFRole] = useState('employee')
  const [fScope, setFScope] = useState('')
  const [fModules, setFModules] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/erp-members?erp_slug=${encodeURIComponent(erpSlug)}`)
      const json = await res.json()
      setMembers(json.members || [])
    } catch { setMembers([]) }
    setLoading(false)
  }, [erpSlug])

  useEffect(() => { load() }, [load])

  async function token() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  }

  const invite = async () => {
    if (!fEmail.trim()) { setErr('Email requis'); return }
    setSaving(true); setErr('')
    try {
      const t = await token()
      const res = await fetch('/api/erp-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify({
          erp_slug: erpSlug, member_email: fEmail.trim().toLowerCase(),
          role: fRole, allowed_modules: fRole === 'admin' ? [] : fModules, scope: fScope.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error || 'Erreur'); setSaving(false); return }
      setShowForm(false); setFEmail(''); setFRole('employee'); setFScope(''); setFModules([])
      await load()
    } catch { setErr('Erreur réseau') }
    setSaving(false)
  }

  const remove = async (id: string) => {
    try {
      const t = await token()
      await fetch(`/api/erp-members?id=${id}&erp_slug=${encodeURIComponent(erpSlug)}`, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + t },
      })
      await load()
    } catch {}
  }

  const toggleModule = (m: string) => {
    setFModules((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m])
  }

  return (
    <div>
      {/* En-tête sécurité */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 22 }}>
        <div style={{ width: 46, height: 46, borderRadius: 13, background: `linear-gradient(135deg, ${C.accent}, #8a4a28)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Shield size={24} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 21, fontWeight: 700, margin: 0 }}>Équipe & Accès</h2>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>
            Gestion sécurisée des accès — contrôlée par le PDG uniquement
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            <UserPlus size={16} /> Inviter un membre
          </button>
        )}
      </div>

      {/* Bandeau de niveau d'accès */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: isAdmin ? 'rgba(217,122,79,0.08)' : 'rgba(245,237,225,0.03)', border: `1px solid ${isAdmin ? C.panelBorder : C.line}`, borderRadius: 12, padding: '12px 16px', marginBottom: 22 }}>
        <Lock size={15} color={isAdmin ? C.accent : C.faint} />
        <span style={{ fontSize: 12.5, color: isAdmin ? C.cream : C.muted }}>
          {isAdmin
            ? "Vous êtes PDG de cet espace. Vous seul pouvez inviter, modifier ou retirer des membres."
            : "Accès en lecture seule. Seul le PDG peut gérer les membres."}
        </span>
      </div>

      {/* PDG (propriétaire) en tête de liste */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <MemberRow
          email={ownerEmail}
          role="admin"
          scope={null}
          modules={[]}
          isOwner
          canManage={false}
          onRemove={() => {}}
        />

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: C.faint }}>
            <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          members.map((m) => (
            <MemberRow
              key={m.id}
              email={m.member_email}
              role={m.role}
              scope={m.scope}
              modules={m.allowed_modules || []}
              isOwner={false}
              canManage={isAdmin}
              onRemove={() => remove(m.id)}
            />
          ))
        )}

        {!loading && members.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: C.faint, fontSize: 13, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12 }}>
            <Users size={26} color={C.faint} />
            <div style={{ marginTop: 10 }}>Aucun membre invité pour l'instant</div>
          </div>
        )}
      </div>

      {/* Modal invitation */}
      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <motion.div onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} style={{ background: C.bg2, border: `1px solid ${C.panelBorder}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Inviter un membre</h3>
              <div style={{ flex: 1 }} />
              <button onClick={() => setShowForm(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint }}><X size={20} /></button>
            </div>

            <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>Email du membre</label>
            <input value={fEmail} onChange={(e) => setFEmail(e.target.value)} placeholder="employe@entreprise.com" style={{ width: '100%', background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: '10px 12px', color: C.cream, fontSize: 13.5, outline: 'none', marginBottom: 16 }} />

            <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 8 }}>Rôle</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {ROLES.map((r) => {
                const Icon = r.icon
                const sel = fRole === r.id
                return (
                  <button key={r.id} onClick={() => setFRole(r.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', borderRadius: 11, cursor: 'pointer', textAlign: 'left', background: sel ? C.accentSoft : 'transparent', border: `1px solid ${sel ? C.panelBorder : C.line}` }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: r.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={16} color={r.color} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.cream }}>{r.label}</div>
                      <div style={{ fontSize: 11.5, color: C.faint }}>{r.desc}</div>
                    </div>
                    {sel && <ShieldCheck size={16} color={C.accent} />}
                  </button>
                )
              })}
            </div>

            {fRole !== 'admin' && (
              <>
                <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>Périmètre (ex: Warehouse 1, Magasin Centre…)</label>
                <input value={fScope} onChange={(e) => setFScope(e.target.value)} placeholder="Laisser vide pour aucun cloisonnement" style={{ width: '100%', background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: '10px 12px', color: C.cream, fontSize: 13.5, outline: 'none', marginBottom: 16 }} />

                <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 8 }}>Modules autorisés</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
                  {moduleNames.map((m) => {
                    const sel = fModules.includes(m)
                    return (
                      <button key={m} onClick={() => toggleModule(m)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', textTransform: 'capitalize', background: sel ? C.accentSoft : 'transparent', border: `1px solid ${sel ? C.panelBorder : C.line}`, color: sel ? C.accent : C.muted }}>
                        {m.replace(/_/g, ' ')}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {err && <div style={{ color: '#e88', fontSize: 12.5, marginBottom: 12 }}>{err}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, background: 'transparent', color: C.muted, border: `1px solid ${C.line}`, borderRadius: 10, padding: '11px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
              <button onClick={invite} disabled={saving} style={{ flex: 1, background: C.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: saving ? 0.6 : 1 }}>
                {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <UserPlus size={15} />} Inviter
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function MemberRow({ email, role, scope, modules, isOwner, canManage, onRemove }: { email: string; role: string; scope: string | null; modules: string[]; isOwner: boolean; canManage: boolean; onRemove: () => void }) {
  const r = roleInfo(role)
  const Icon = r.icon
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: C.panel, border: `1px solid ${isOwner ? C.panelBorder : C.line}`, borderRadius: 13, padding: '14px 16px' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: r.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={19} color={r.color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.cream, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
          {isOwner && <span style={{ fontSize: 10, color: C.accent, border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: '1px 7px', flexShrink: 0 }}>Vous</span>}
        </div>
        <div style={{ fontSize: 12, color: C.faint, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: r.color }}>{r.label}</span>
          {scope && <><span>·</span><span>{scope}</span></>}
          {role !== 'admin' && modules.length > 0 && <><span>·</span><span>{modules.length} module{modules.length > 1 ? 's' : ''}</span></>}
        </div>
      </div>
      {canManage && !isOwner && (
        <button onClick={onRemove} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#c75d5d', padding: 6 }} title="Retirer ce membre">
          <Trash2 size={16} />
        </button>
      )}
    </div>
  )
}
