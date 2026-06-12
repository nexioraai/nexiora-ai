'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Boxes, Bot, Zap, GitBranch, FileBarChart,
  Search, Circle, TrendingUp, ChevronRight, Database, Shield, History, Brain,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import ModuleTable from './ModuleTable'
import EntityDetail from './EntityDetail'
import TenantView, { resolveTenant } from './TenantView'
import TeamAccess from './TeamAccess'
import ActivityLog from './ActivityLog'
import AIAnalysis from './AIAnalysis'
import { supabase } from '@/lib/supabase'

type ERPField = { name: string; type: string }
type ERPModule = { name: string; fields: (ERPField | string)[]; relations?: any[] }
type Blueprint = {
  name?: string; modules?: ERPModule[]; dashboard?: string[]; reports?: string[]
  automations?: string[]; agents?: string[]; workflows?: string[]
}

const C = {
  bg: '#050302', bg2: '#0a0704',
  panel: 'rgba(245,237,225,0.03)', panelBorder: 'rgba(217,122,79,0.14)',
  line: 'rgba(245,237,225,0.07)', accent: '#d97a4f', accentSoft: 'rgba(217,122,79,0.12)',
  cream: '#f5ede1', muted: '#9a8f80', faint: '#6f6456',
}

const label = (s: string) => (s || '').replace(/_/g, ' ')
const fieldName = (f: ERPField | string) => (typeof f === 'string' ? f : f?.name || '')
const fieldType = (f: ERPField | string) => (typeof f === 'string' ? 'string' : f?.type || 'string')

const areaData = [
  { name: 'Lun', v: 32 }, { name: 'Mar', v: 48 }, { name: 'Mer', v: 41 },
  { name: 'Jeu', v: 64 }, { name: 'Ven', v: 58 }, { name: 'Sam', v: 73 }, { name: 'Dim', v: 67 },
]
const barData = [{ name: 'S1', v: 120 }, { name: 'S2', v: 180 }, { name: 'S3', v: 150 }, { name: 'S4', v: 210 }]
const pieData = [{ name: 'Complété', value: 68 }, { name: 'En cours', value: 22 }, { name: 'En attente', value: 10 }]
const pieColors = ['#d97a4f', '#8a6d52', '#3a2e22']

export default function ErpApp({ erp }: { erp: any }) {
  const bp: Blueprint = erp.blueprint || {}
  const modules = bp.modules || []
  const tenant = resolveTenant(bp, modules)
  const dashboard = bp.dashboard || []
  const reports = bp.reports || []
  const automations = bp.automations || []
  const agents = bp.agents || []
  const workflows = bp.workflows || []
  const title = bp.name || erp.business_name || 'Système de gestion'

  const [view, setView] = useState<string>('dashboard')
  const [selectedModule, setSelectedModule] = useState<ERPModule | null>(null)
  const [currentEmail, setCurrentEmail] = useState<string>('')
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setCurrentEmail(data.session?.user?.email || ''))
  }, [])
  const isAdmin = !!currentEmail && currentEmail.toLowerCase() === (erp.owner_email || '').toLowerCase()

  const nav = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'modules', label: 'Modules', icon: Boxes, count: modules.length },
    { id: 'agents', label: 'Agents IA', icon: Bot, count: agents.length },
    { id: 'automations', label: 'Automatisations', icon: Zap, count: automations.length },
    { id: 'workflows', label: 'Workflows', icon: GitBranch, count: workflows.length },
    { id: 'reports', label: 'Rapports', icon: FileBarChart, count: reports.length },
    { id: 'team', label: 'Équipe & Accès', icon: Shield },
    { id: 'activity', label: "Journal d'activité", icon: History },
    { id: 'analysis', label: 'Analyse IA', icon: Brain },
  ]
  const visibleNav = nav.filter((n) => (n.id === 'team' || n.id === 'activity' || n.id === 'analysis') ? isAdmin : true)
  const activeLabel = nav.find((n) => n.id === view)?.label || 'Tableau de bord'

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.cream, display: 'flex', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <aside style={{ width: 256, flexShrink: 0, borderRight: `1px solid ${C.line}`, background: C.bg2, padding: '24px 16px', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px', marginBottom: 28 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg, ${C.accent}, #8a4a28)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#fff' }}>N</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>Nexiora</div>
            <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 }}>ERP Suite</div>
          </div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {visibleNav.map((item) => {
            const Icon = item.icon
            const active = view === item.id
            return (
              <button key={item.id} onClick={() => { setView(item.id); setSelectedModule(null) }} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', fontSize: 13.5, transition: 'all .18s', background: active ? C.accentSoft : 'transparent', color: active ? C.cream : C.muted, fontWeight: active ? 600 : 500 }}>
                <Icon size={17} color={active ? C.accent : C.faint} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {typeof item.count === 'number' && (
                  <span style={{ fontSize: 11, color: active ? C.accent : C.faint, background: active ? 'transparent' : 'rgba(245,237,225,0.05)', borderRadius: 6, padding: '1px 7px' }}>{item.count}</span>
                )}
              </button>
            )
          })}
        </nav>
        <div style={{ marginTop: 'auto', padding: '12px', borderRadius: 12, background: C.panel, border: `1px solid ${C.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
            <Circle size={8} fill="#4ade80" color="#4ade80" /> Système actif
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ height: 64, borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', padding: '0 28px', gap: 20, position: 'sticky', top: 0, background: 'rgba(5,3,2,0.8)', backdropFilter: 'blur(12px)', zIndex: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{activeLabel}</div>
            <div style={{ fontSize: 11.5, color: C.faint }}>{title}</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 14px', width: 240 }}>
            <Search size={15} color={C.faint} />
            <input placeholder="Rechercher…" style={{ background: 'transparent', border: 'none', outline: 'none', color: C.cream, fontSize: 13, width: '100%' }} />
          </div>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: `linear-gradient(135deg, ${C.accent}, #8a4a28)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#fff' }}>
            {(erp.owner_email || 'U')[0].toUpperCase()}
          </div>
        </header>

        <main style={{ padding: '28px', maxWidth: 1280 }}>
          <AnimatePresence mode="wait">
            <motion.div key={view} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              {view === 'dashboard' && <DashboardView dashboard={dashboard} />}
              {view === 'modules' && (selectedModule
                ? (tenant && selectedModule.name === tenant.module
                    ? <SubErpWrapper erpSlug={erp.slug} tenant={tenant} modules={modules} onBack={() => setSelectedModule(null)} />
                    : <ModuleTableWrapper erpSlug={erp.slug} module={selectedModule} allModules={modules} onBack={() => setSelectedModule(null)} />)
                : <ModulesView modules={modules} onOpen={setSelectedModule} />)}
              {view === 'agents' && <AgentsView agents={agents} />}
              {view === 'automations' && <AutomationsView automations={automations} />}
              {view === 'workflows' && <WorkflowsView workflows={workflows} />}
              {view === 'reports' && <ReportsView reports={reports} />}
              {view === 'team' && <TeamAccess erpSlug={erp.slug} moduleNames={modules.map((m) => m.name)} isAdmin={isAdmin} ownerEmail={erp.owner_email || ''} />}
              {view === 'activity' && isAdmin && <ActivityLog erpSlug={erp.slug} />}
              {view === 'analysis' && isAdmin && <AIAnalysis erpSlug={erp.slug} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>{children}</div>
}
function card(extra: React.CSSProperties = {}): React.CSSProperties {
  return { background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 16, padding: 20, ...extra }
}

function DashboardView({ dashboard }: any) {
  const kpis = (dashboard.length ? dashboard : ['total', 'actifs', 'en cours', 'complétés']).slice(0, 4)
  const fakeVals = ['1 248', '86', '342', '94%']
  const fakeTrends = ['+12%', '+4%', '+18%', '+2%']

  return (
    <Section>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
        {kpis.map((k: string, i: number) => (
          <motion.div key={k} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} style={card()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ color: C.muted, fontSize: 12.5, textTransform: 'capitalize' }}>{label(k)}</div>
              <span style={{ fontSize: 11, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 3 }}>
                <TrendingUp size={12} /> {fakeTrends[i % 4]}
              </span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, marginTop: 12 }}>{fakeVals[i % 4]}</div>
          </motion.div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        <div style={card()}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Activité hebdomadaire</div>
          <div style={{ fontSize: 12, color: C.faint, marginBottom: 16 }}>7 derniers jours</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={areaData}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.accent} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
              <XAxis dataKey="name" stroke={C.faint} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={C.faint} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: C.bg2, border: `1px solid ${C.panelBorder}`, borderRadius: 10, color: C.cream }} />
              <Area type="monotone" dataKey="v" stroke={C.accent} strokeWidth={2.5} fill="url(#g1)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={card()}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Répartition</div>
          <div style={{ fontSize: 12, color: C.faint, marginBottom: 16 }}>Par statut</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} dataKey="value" innerRadius={50} outerRadius={75} paddingAngle={3} stroke="none">
                {pieData.map((e, i) => <Cell key={i} fill={pieColors[i]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: C.bg2, border: `1px solid ${C.panelBorder}`, borderRadius: 10, color: C.cream }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {pieData.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: pieColors[i] }} />
                {e.name} <span style={{ marginLeft: 'auto', color: C.cream }}>{e.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={card()}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Volume mensuel</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
            <XAxis dataKey="name" stroke={C.faint} fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke={C.faint} fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: 'rgba(217,122,79,0.06)' }} contentStyle={{ background: C.bg2, border: `1px solid ${C.panelBorder}`, borderRadius: 10, color: C.cream }} />
            <Bar dataKey="v" fill={C.accent} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  )
}

function SubErpWrapper({ erpSlug, tenant, modules, onBack }: { erpSlug: string; tenant: any; modules: ERPModule[]; onBack: () => void }) {
  return (
    <div>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        <ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} /> Retour aux modules
      </button>
      <TenantView
        erpSlug={erpSlug}
        tenant={tenant}
        modules={modules}
        renderSubErp={(instance, scopeValue) => (
          <SubErpModules erpSlug={erpSlug} tenant={tenant} modules={modules} scopeValue={scopeValue} instance={instance} />
        )}
      />
    </div>
  )
}

function SubErpModules({ erpSlug, tenant, modules, scopeValue, instance }: { erpSlug: string; tenant: any; modules: ERPModule[]; scopeValue: string; instance: any }) {
  // modules de l'unité = tous sauf le module conteneur lui-meme
  const childModules = modules.filter((m) => m.name !== tenant.module)
  const [openMod, setOpenMod] = useState<ERPModule | null>(null)
  const title = String(instance?.data?.[Object.keys(instance?.data || {}).find((k) => /(nom|name|titre)/i.test(k)) || ''] || scopeValue)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, ' + C.accent + ', #8a4a28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LayoutDashboard size={22} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{title}</h2>
          <div style={{ fontSize: 12.5, color: C.muted }}>Espace autonome · {scopeValue}</div>
        </div>
      </div>
      {openMod
        ? <ScopedModuleWrapper erpSlug={erpSlug} module={openMod} allModules={modules} tenantKey={tenant.key} scopeValue={scopeValue} onBack={() => setOpenMod(null)} />
        : <ModulesView modules={childModules} onOpen={setOpenMod} />}
    </div>
  )
}

function ScopedModuleWrapper({ erpSlug, module, allModules, tenantKey, scopeValue, onBack }: { erpSlug: string; module: ERPModule; allModules: ERPModule[]; tenantKey: string; scopeValue: string; onBack: () => void }) {
  const [stack, setStack] = useState<{ rec: any; mod: ERPModule }[]>([])
  const openEntity = (rec: any, mod: ERPModule) => setStack((s) => [...s, { rec, mod }])
  const popTo = (index: number) => setStack((s) => s.slice(0, index))
  const current = stack[stack.length - 1]

  return (
    <div>
      <button onClick={() => (stack.length > 0 ? popTo(stack.length - 1) : onBack())} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        <ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} /> Retour
      </button>

      {stack.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14, fontSize: 12.5, color: C.faint }}>
          <span style={{ cursor: 'pointer' }} onClick={() => popTo(0)}>{label(module.name)}</span>
          {stack.map((s, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ChevronRight size={12} />
              <span style={{ cursor: 'pointer', color: i === stack.length - 1 ? C.cream : C.faint }} onClick={() => popTo(i + 1)}>
                {String(Object.values(s.rec.data || {})[0] || 'Détail')}
              </span>
            </span>
          ))}
        </div>
      )}

      {!current && (
        <ModuleTable erpSlug={erpSlug} module={module} filterField={tenantKey} filterValue={scopeValue} onRowClick={(rec) => openEntity(rec, module)} />
      )}

      {current && (
        <EntityDetail
          erpSlug={erpSlug}
          entity={{ id: current.rec.id, module_name: current.mod.name, data: current.rec.data }}
          modules={allModules}
          onOpenChild={(rec, mod) => openEntity(rec, mod as ERPModule)}
          onBack={() => popTo(stack.length - 1)}
        />
      )}
    </div>
  )
}

function ModuleTableWrapper({ erpSlug, module, allModules, onBack }: { erpSlug: string; module: ERPModule; allModules: ERPModule[]; onBack: () => void }) {
  const [stack, setStack] = useState<{ rec: any; mod: ERPModule }[]>([])

  const openEntity = (rec: any, mod: ERPModule) => setStack((s) => [...s, { rec, mod }])
  const popTo = (index: number) => setStack((s) => s.slice(0, index))

  const current = stack[stack.length - 1]

  return (
    <div>
      <button onClick={() => (stack.length > 0 ? popTo(stack.length - 1) : onBack())} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        <ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} /> Retour
      </button>

      {stack.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14, fontSize: 12.5, color: C.faint }}>
          <span style={{ cursor: 'pointer' }} onClick={() => popTo(0)}>{label(module.name)}</span>
          {stack.map((s, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ChevronRight size={12} />
              <span style={{ cursor: 'pointer', color: i === stack.length - 1 ? C.cream : C.faint }} onClick={() => popTo(i + 1)}>
                {String(Object.values(s.rec.data || {})[0] || 'Détail')}
              </span>
            </span>
          ))}
        </div>
      )}

      {!current && (
        <ModuleTable erpSlug={erpSlug} module={module} onRowClick={(rec) => openEntity(rec, module)} />
      )}

      {current && (
        <EntityDetail
          erpSlug={erpSlug}
          entity={{ id: current.rec.id, module_name: current.mod.name, data: current.rec.data }}
          modules={allModules}
          onOpenChild={(rec, mod) => openEntity(rec, mod as ERPModule)}
          onBack={() => popTo(stack.length - 1)}
        />
      )}
    </div>
  )
}

function ModulesView({ modules, onOpen }: { modules: ERPModule[]; onOpen: (m: ERPModule) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: 16 }}>
      {modules.map((mod, i) => (
        <motion.div key={mod.name} onClick={() => onOpen(mod)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} style={card({ cursor: 'pointer' })}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Database size={16} color={C.accent} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, textTransform: 'capitalize', margin: 0 }}>{label(mod.name)}</h3>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: C.faint }}>{(mod.fields || []).length} champs</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {(mod.fields || []).slice(0, 8).map((f, j) => (
              <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: `1px solid ${C.line}`, paddingBottom: 5 }}>
                <span style={{ color: '#cbbfae', textTransform: 'capitalize' }}>{label(fieldName(f))}</span>
                <span style={{ color: C.faint, fontFamily: 'monospace', fontSize: 11 }}>{fieldType(f)}</span>
              </div>
            ))}
            {(mod.fields || []).length > 8 && (
              <span style={{ color: C.accent, fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                +{mod.fields.length - 8} autres <ChevronRight size={13} />
              </span>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

function AgentsView({ agents }: { agents: string[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
      {agents.map((a, i) => (
        <motion.div key={a} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }} style={card({ display: 'flex', flexDirection: 'column', gap: 12 })}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: `linear-gradient(135deg, ${C.accentSoft}, transparent)`, border: `1px solid ${C.panelBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={20} color={C.accent} />
            </div>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600, textTransform: 'capitalize' }}>{label(a)}</div>
              <div style={{ fontSize: 11.5, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Circle size={7} fill="#4ade80" color="#4ade80" /> Opérationnel
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
            Agent IA autonome dédié à la gestion intelligente de ce périmètre métier.
          </div>
        </motion.div>
      ))}
    </div>
  )
}

function AutomationsView({ automations }: { automations: string[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }}>
      {automations.map((a, i) => (
        <motion.div key={a} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} style={card({ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px' })}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Zap size={16} color={C.accent} />
          </div>
          <span style={{ fontSize: 13.5, color: '#cbbfae', textTransform: 'capitalize' }}>{label(a)}</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 6, padding: '2px 7px' }}>ON</span>
        </motion.div>
      ))}
    </div>
  )
}

function WorkflowsView({ workflows }: { workflows: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {workflows.map((w, i) => (
        <motion.div key={w} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} style={card({ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px' })}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg, ${C.accent}, #8a4a28)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#fff', flexShrink: 0 }}>
            {String(i + 1).padStart(2, '0')}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, textTransform: 'capitalize' }}>{label(w)}</div>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>Processus automatisé de bout en bout</div>
          </div>
          <GitBranch size={18} color={C.faint} />
        </motion.div>
      ))}
    </div>
  )
}

function ReportsView({ reports }: { reports: string[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
      {reports.map((r, i) => (
        <motion.div key={r} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} style={card({ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' })}>
          <FileBarChart size={18} color={C.accent} />
          <span style={{ fontSize: 13.5, color: '#cbbfae', textTransform: 'capitalize' }}>{label(r)}</span>
          <ChevronRight size={15} color={C.faint} style={{ marginLeft: 'auto' }} />
        </motion.div>
      ))}
    </div>
  )
}
