// src/lib/systemHealth/buildHealthReport.ts
//
// Transforme un rapport JSON Vitest brut (format --reporter=json) en un
// résumé structuré, générique, prêt à être stocké (system_health_checks)
// et affiché dans l'Admin. Ne connaît aucun domaine en dur : un échec de
// test appartient à un domaine si l'un de ses titres ancêtres correspond
// au gabarit "Frontière de domaine : '<id>'" produit par
// domainBoundaries.test.ts (describe.each sur DOMAIN_REGISTRY). Tout
// nouveau domaine enregistré y apparaît automatiquement, sans modification
// de ce fichier — c'est ce qui rend la remontée générique, pas seulement
// le registre lui-même.

export type VitestAssertionResult = {
  ancestorTitles: string[]
  fullName: string
  status: string
  title: string
  failureMessages: string[]
}

export type VitestJsonReport = {
  numTotalTests: number
  numFailedTests: number
  success: boolean
  testResults: { assertionResults: VitestAssertionResult[] }[]
}

export type HealthReportMeta = {
  commitSha: string
  branch: string
  workflowRunUrl: string | null
  typecheckStatus: 'success' | 'failure'
  buildStatus: 'success' | 'failure'
}

export type HealthReport = {
  commit_sha: string
  branch: string
  workflow_run_url: string | null
  overall_status: 'success' | 'failure'
  typecheck_status: 'success' | 'failure'
  build_status: 'success' | 'failure'
  total_tests: number
  failed_tests: number
  domains: { domainId: string; status: 'failure'; failures: { test: string; message: string }[] }[]
  raw_failures: { test: string; message: string }[]
}

const DOMAIN_TITLE_PATTERN = /Frontière de domaine : '(.+)'/

// Le message utile est la premiere ligne (le describe.each ecrit un message
// riche : domaine, fichier, ligne, motif, raison) ; le reste est la trace
// d'appel Vitest, sans valeur pour un humain qui lit l'Admin.
function cleanMessage(raw: string): string {
  const stackStart = raw.indexOf('\n    at ')
  return (stackStart === -1 ? raw : raw.slice(0, stackStart)).trim()
}

export function buildHealthReport(vitestReport: VitestJsonReport, meta: HealthReportMeta): HealthReport {
  const domainMap = new Map<string, { test: string; message: string }[]>()
  const rawFailures: { test: string; message: string }[] = []

  for (const file of vitestReport.testResults || []) {
    for (const assertion of file.assertionResults || []) {
      if (assertion.status !== 'failed') continue

      const message = cleanMessage(assertion.failureMessages?.[0] || 'Échec sans message.')
      const domainMatch = assertion.ancestorTitles.map((t) => t.match(DOMAIN_TITLE_PATTERN)).find(Boolean)

      if (domainMatch) {
        const domainId = domainMatch[1]
        if (!domainMap.has(domainId)) domainMap.set(domainId, [])
        domainMap.get(domainId)!.push({ test: assertion.title, message })
      } else {
        rawFailures.push({ test: assertion.fullName, message })
      }
    }
  }

  const domains = [...domainMap.entries()].map(([domainId, failures]) => ({
    domainId,
    status: 'failure' as const,
    failures,
  }))

  const testsOk = vitestReport.success && vitestReport.numFailedTests === 0
  const overallStatus: 'success' | 'failure' =
    testsOk && meta.typecheckStatus === 'success' && meta.buildStatus === 'success' ? 'success' : 'failure'

  return {
    commit_sha: meta.commitSha,
    branch: meta.branch,
    workflow_run_url: meta.workflowRunUrl,
    overall_status: overallStatus,
    typecheck_status: meta.typecheckStatus,
    build_status: meta.buildStatus,
    total_tests: vitestReport.numTotalTests,
    failed_tests: vitestReport.numFailedTests,
    domains,
    raw_failures: rawFailures,
  }
}
