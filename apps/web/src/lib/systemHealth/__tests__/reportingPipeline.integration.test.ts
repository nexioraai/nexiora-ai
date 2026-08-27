import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { buildHealthReport } from '../buildHealthReport'
import { postHealthReport } from '../postHealthReport'

// ============================================================
// Preuve d'intégration réelle du pipeline CI -> Supabase, sans dépendre
// d'un vrai projet Supabase : un serveur HTTP local en mémoire imite le
// minimum de l'API REST PostgREST utilisée (POST pour écrire, GET pour
// lire system_health_checks). postHealthReport() est le code RÉEL utilisé
// par scripts/report-system-health.ts -- rien n'est réimplémenté ici.
//
// Ce test vérifie le point 3/4 de l'extension Bloc 2 : un problème actif
// disparaît automatiquement dès qu'un nouveau run sain arrive, sans
// accumuler de doublons ni conserver d'état "fantôme" d'un ancien échec.
// ============================================================

let server: Server
let baseUrl: string
let rows: any[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/rest/v1/system_health_checks') {
        const row = { id: `row-${rows.length + 1}`, created_at: new Date(Date.now() + rows.length).toISOString(), ...JSON.parse(body) }
        rows.push(row)
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end('[]')
        return
      }
      if (req.method === 'GET' && req.url?.startsWith('/rest/v1/system_health_checks')) {
        const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(sorted))
        return
      }
      res.writeHead(404)
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  baseUrl = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const CONFIG = { url: '', key: 'fake-key-for-local-mock' }

function meta(overrides: Partial<Parameters<typeof buildHealthReport>[1]> = {}) {
  return {
    commitSha: 'sha-unknown',
    branch: 'main',
    workflowRunUrl: null,
    typecheckStatus: 'success' as const,
    buildStatus: 'success' as const,
    ...overrides,
  }
}

function vitestReport(failing?: { domainId: string; file: string; reason: string }) {
  if (!failing) {
    return { numTotalTests: 5, numFailedTests: 0, success: true, testResults: [] }
  }
  return {
    numTotalTests: 5,
    numFailedTests: 1,
    success: false,
    testResults: [
      {
        assertionResults: [
          {
            ancestorTitles: [`Frontière de domaine : '${failing.domainId}'`],
            fullName: 'test',
            status: 'failed',
            title: 'test',
            failureMessages: [
              `Error: Domaine "${failing.domainId}" : 1 violation(s) de frontière détectée(s) :\n  - ${failing.file}:2 — motif interdit /\\buseCart\\s*\\(/ — ${failing.reason}\n    at stack`,
            ],
          },
        ],
      },
    ],
  }
}

describe('Pipeline de reporting — cycle réel détection -> Supabase -> résolution', () => {
  it('A. état sain : rapport vert envoyé et lisible', async () => {
    rows = []
    CONFIG.url = baseUrl
    const report = buildHealthReport(vitestReport(), meta({ commitSha: 'commit-1' }))
    const result = await postHealthReport(report, CONFIG)
    expect(result.ok).toBe(true)

    const res = await fetch(`${baseUrl}/rest/v1/system_health_checks`)
    const history = await res.json()
    expect(history).toHaveLength(1)
    expect(history[0].overall_status).toBe('success')
    expect(history[0].domains).toEqual([])
  })

  it('B. violation détectée : rapport rouge envoyé, domaine identifié dans le payload', async () => {
    const report = buildHealthReport(
      vitestReport({ domainId: 'mode-1-theme-rendering', file: 'src/app/sites/[slug]/themes/EditorialTheme.tsx', reason: 'Mode 1 ne doit jamais dépendre du panier.' }),
      meta({ commitSha: 'commit-2', typecheckStatus: 'success', buildStatus: 'success' })
    )
    const result = await postHealthReport(report, CONFIG)
    expect(result.ok).toBe(true)

    const res = await fetch(`${baseUrl}/rest/v1/system_health_checks`)
    const history = await res.json()
    expect(history).toHaveLength(2)
    const latest = history[0] // trié par created_at desc, comme la vraie requête Admin
    expect(latest.commit_sha).toBe('commit-2')
    expect(latest.overall_status).toBe('failure')
    expect(latest.domains).toHaveLength(1)
    expect(latest.domains[0].domainId).toBe('mode-1-theme-rendering')
    expect(latest.domains[0].failures[0].message).toContain('EditorialTheme.tsx:2')
  })

  it('C. correction : nouveau run vert -> incident actif disparaît, historique conserve les deux runs', async () => {
    const report = buildHealthReport(vitestReport(), meta({ commitSha: 'commit-3' }))
    const result = await postHealthReport(report, CONFIG)
    expect(result.ok).toBe(true)

    const res = await fetch(`${baseUrl}/rest/v1/system_health_checks`)
    const history = await res.json()
    expect(history).toHaveLength(3) // rien n'est jamais supprimé -- audit complet

    const latest = history[0]
    expect(latest.commit_sha).toBe('commit-3')
    expect(latest.overall_status).toBe('success')
    // Le point critique : le run réparé ne "traîne" pas le domaine en échec
    // de commit-2. Chaque ligne est auto-suffisante -- pas d'état cumulatif.
    expect(latest.domains).toEqual([])

    // L'ancien échec reste consultable dans l'historique, pas supprimé.
    const oldFailure = history.find((h: any) => h.commit_sha === 'commit-2')
    expect(oldFailure.overall_status).toBe('failure')
  })

  it('D. échecs répétés du même domaine sur plusieurs runs : pas de doublon "actif", chaque run reste une ligne distincte', async () => {
    const failingReport = () =>
      buildHealthReport(
        vitestReport({ domainId: 'mode-1-theme-rendering', file: 'src/app/sites/[slug]/themes/EditorialTheme.tsx', reason: 'Mode 1 ne doit jamais dépendre du panier.' }),
        meta({ commitSha: `commit-repeat-${rows.length}` })
      )

    await postHealthReport(failingReport(), CONFIG)
    await postHealthReport(failingReport(), CONFIG)
    await postHealthReport(failingReport(), CONFIG)

    const res = await fetch(`${baseUrl}/rest/v1/system_health_checks`)
    const history = await res.json()
    // 3 (A/B/C) + 3 répétitions = 6 lignes d'historique -- c'est le
    // comportement voulu (traçabilité complète), PAS 6 "incidents actifs"
    // distincts : la notion d'"actif" est portée par une seule ligne (la
    // plus récente), jamais par une liste qui s'accumule.
    expect(history).toHaveLength(6)
    const latest = history[0]
    expect(latest.domains).toHaveLength(1) // un seul domaine actif, pas empilé 3 fois
  })
})
