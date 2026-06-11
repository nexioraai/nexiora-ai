'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Activity, UserPlus, UserMinus, Plus, Pencil, Trash2, LogIn, Loader2, History } from 'lucide-react'

type Event = {
  id: string
  actor_email: string
  action: string
  detail: string | null
  created_at: string
}

const C = {
  panel: 'rgba(245,237,225,0.03)', panelBorder: 'rgba(217,122,79,0.14)',
  line: 'rgba(245,237,225,0.07)', accent: '#d97a4f', accentSoft: 'rgba(217,122,79,0.12)',
  cream: '#f5ede1', muted: '#9a8f80', faint: '#6f6456',
}

const ACTIONS: Record<string, { label: string; icon: any; color: string }> = {
  invite_member: { label: 'Membre invité', icon: UserPlus, color: '#5b9bd5' },
  remove_member: { label: 'Membre retiré', icon: UserMinus, color: '#c75d5d' },
  add_record: { label: 'Donnée ajoutée', icon: Plus, color: '#7db87d' },
  edit_record: { label: 'Donnée modifiée', icon: Pencil, color: '#d9a64f' },
  delete_record: { label: 'Donnée supprimée', icon: Trash2, color: '#c75d5d' },
  login: { label: 'Connexion', icon: LogIn, color: '#9a8f80' },
}
const actionInfo = (a: string) => ACTIONS[a] || { label: a.replace(/_/g, ' '), icon: Activity, color: C.faint }

function timeAgo(iso: string) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time}`
}

export default function ActivityLog({ erpSlug }: { erpSlug: string }) {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/erp-activity?erp_slug=${encodeURIComponent(erpSlug)}`)
      const json = await res.json()
      setEvents(json.events || [])
    } catch { setEvents([]) }
    setLoading(false)
  }, [erpSlug])

  useEffect(() => { load() }, [load])

  return (
    <div>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 22 }}>
        <div style={{ width: 46, height: 46, borderRadius: 13, background: `linear-gradient(135deg, ${C.accent}, #8a4a28)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <History size={24} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: 21, fontWeight: 700, margin: 0 }}>Journal d'activité</h2>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>
            Traçabilité complète — qui a fait quoi, et quand
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.faint }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : events.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: C.faint, fontSize: 13, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          <Activity size={28} color={C.faint} />
          <div style={{ marginTop: 12 }}>Aucune activité enregistrée pour l'instant</div>
          <div style={{ marginTop: 4, fontSize: 12, color: C.faint }}>Les actions (invitations, ajouts, modifications…) apparaîtront ici</div>
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 8 }}>
          {events.map((e, i) => {
            const info = actionInfo(e.action)
            const Icon = info.icon
            const isLast = i === events.length - 1
            return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.4) }}
                style={{ display: 'flex', gap: 14, position: 'relative', paddingBottom: isLast ? 0 : 18 }}
              >
                {/* Ligne verticale */}
                {!isLast && (
                  <div style={{ position: 'absolute', left: 18, top: 38, bottom: 0, width: 1, background: C.line }} />
                )}
                {/* Pastille icône */}
                <div style={{ width: 38, height: 38, borderRadius: 11, background: info.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                  <Icon size={17} color={info.color} />
                </div>
                {/* Contenu */}
                <div style={{ flex: 1, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 16px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: info.color }}>{info.label}</span>
                    <span style={{ fontSize: 12, color: C.faint, marginLeft: 'auto' }}>{timeAgo(e.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#cbbfae', marginTop: 4 }}>
                    {e.detail && <span>{e.detail} — </span>}
                    <span style={{ color: C.muted }}>par {e.actor_email}</span>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
