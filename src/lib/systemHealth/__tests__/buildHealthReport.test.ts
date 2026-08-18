import { describe, it, expect } from 'vitest'
import { buildHealthReport, type VitestJsonReport } from '../buildHealthReport'

const META_OK = {
  commitSha: 'abc123',
  branch: 'main',
  workflowRunUrl: 'https://github.com/nexioraai/woorri/actions/runs/1',
  typecheckStatus: 'success' as const,
  buildStatus: 'success' as const,
}

function makeReport(overrides: Partial<VitestJsonReport> = {}): VitestJsonReport {
  return {
    numTotalTests: 4,
    numFailedTests: 0,
    success: true,
    testResults: [],
    ...overrides,
  }
}

describe('buildHealthReport — cas sain', () => {
  it('tout vert : overall_status success, aucun domaine en échec', () => {
    const report = buildHealthReport(makeReport(), META_OK)
    expect(report.overall_status).toBe('success')
    expect(report.domains).toEqual([])
    expect(report.raw_failures).toEqual([])
  })

  it('tsc en échec fait basculer overall_status même si tous les tests passent', () => {
    const report = buildHealthReport(makeReport(), { ...META_OK, typecheckStatus: 'failure' })
    expect(report.overall_status).toBe('failure')
  })

  it('build en échec fait basculer overall_status même si tous les tests passent', () => {
    const report = buildHealthReport(makeReport(), { ...META_OK, buildStatus: 'failure' })
    expect(report.overall_status).toBe('failure')
  })
})

describe('buildHealthReport — échec rattaché à un domaine (format réel observé via --reporter=json)', () => {
  it('extrait le domainId depuis le titre ancêtre "Frontière de domaine : \'id\'"', () => {
    const vitestReport = makeReport({
      numFailedTests: 1,
      success: false,
      testResults: [
        {
          assertionResults: [
            {
              ancestorTitles: ["Frontière de domaine : 'mode-1-theme-rendering'"],
              fullName: "Frontière de domaine : 'mode-1-theme-rendering' ...",
              status: 'failed',
              title: 'Rendu des thèmes Mode 1 ...',
              failureMessages: [
                'Error: Domaine "mode-1-theme-rendering" : 1 violation(s) de frontière détectée(s) :\n  - src/app/sites/[slug]/themes/EditorialTheme.tsx:2 — motif interdit /\\buseCart\\s*\\(/ — Mode 1 ne doit jamais dépendre du contexte panier (CartContext).\n    at Object.<anonymous> (test.ts:23:13)\n    at runTest (chunk.js:100:1)',
              ],
            },
          ],
        },
      ],
    })

    const report = buildHealthReport(vitestReport, META_OK)

    expect(report.overall_status).toBe('failure')
    expect(report.domains).toHaveLength(1)
    expect(report.domains[0].domainId).toBe('mode-1-theme-rendering')
    expect(report.domains[0].failures).toHaveLength(1)
    // Le message stocké doit contenir le détail utile (fichier, ligne, raison)...
    expect(report.domains[0].failures[0].message).toContain('EditorialTheme.tsx:2')
    expect(report.domains[0].failures[0].message).toContain('Mode 1 ne doit jamais dépendre du contexte panier')
    // ...mais plus la trace d'appel Vitest (bruit, sans valeur pour un humain).
    expect(report.domains[0].failures[0].message).not.toContain('at Object.<anonymous>');
    expect(report.raw_failures).toEqual([])
  })

  it('deux domaines en échec dans le même run sont tous les deux remontés séparément', () => {
    const vitestReport = makeReport({
      numFailedTests: 2,
      success: false,
      testResults: [
        {
          assertionResults: [
            {
              ancestorTitles: ["Frontière de domaine : 'mode-1-theme-rendering'"],
              fullName: 'a',
              status: 'failed',
              title: 'a',
              failureMessages: ['Error: violation A'],
            },
            {
              ancestorTitles: ["Frontière de domaine : 'mode-2-theme-rendering'"],
              fullName: 'b',
              status: 'failed',
              title: 'b',
              failureMessages: ['Error: violation B'],
            },
          ],
        },
      ],
    })

    const report = buildHealthReport(vitestReport, META_OK)
    const ids = report.domains.map((d) => d.domainId).sort()
    expect(ids).toEqual(['mode-1-theme-rendering', 'mode-2-theme-rendering'])
  })
})

describe('buildHealthReport — échec générique, hors registre de domaines (preuve de généricité)', () => {
  it('un test qui ne correspond à aucun domaine part dans raw_failures, pas silencieusement ignoré', () => {
    const vitestReport = makeReport({
      numFailedTests: 1,
      success: false,
      testResults: [
        {
          assertionResults: [
            {
              ancestorTitles: ['Un test totalement sans rapport avec les domaines'],
              fullName: 'Un test totalement sans rapport avec les domaines fait autre chose',
              status: 'failed',
              title: 'fait autre chose',
              failureMessages: ['Error: quelque chose a cassé ailleurs dans le projet'],
            },
          ],
        },
      ],
    })

    const report = buildHealthReport(vitestReport, META_OK)
    expect(report.domains).toEqual([])
    expect(report.raw_failures).toHaveLength(1)
    expect(report.raw_failures[0].message).toContain('quelque chose a cassé ailleurs')
  })
})
