#!/usr/bin/env node
// scripts/report-system-health.ts
//
// Exécuté en fin de pipeline CI (voir .github/workflows/ci.yml, étape
// "Report system health", if: always()). Lit le rapport JSON produit par
// Vitest (vitest-results.json), le transforme via buildHealthReport(), et
// enregistre le résultat dans Supabase (table system_health_checks) pour
// affichage dans l'Admin Deribfy (/admin/system-health).
//
// Exécuté directement via `node scripts/report-system-health.ts` — Node 24
// supporte nativement le "type stripping" TypeScript pour ce type de
// fichier simple, donc aucune dépendance supplémentaire (ts-node, tsx...)
// n'est nécessaire.
//
// Ne bloque JAMAIS la CI elle-même : si l'envoi échoue (réseau, table pas
// encore créée côté Supabase, secret manquant...), le script log l'erreur
// et sort en code 0. Le vrai gate de la CI est l'étape "Gate" qui suit
// dans le workflow, pas celle-ci — la remontée vers l'Admin est un
// complément d'information, pas un mécanisme de blocage.

import { readFileSync } from 'node:fs'
import { buildHealthReport, type VitestJsonReport } from '../src/lib/systemHealth/buildHealthReport.ts'
import { postHealthReport } from '../src/lib/systemHealth/postHealthReport.ts'

async function main() {
  const raw = readFileSync('vitest-results.json', 'utf8')
  const vitestReport = JSON.parse(raw) as VitestJsonReport

  const report = buildHealthReport(vitestReport, {
    commitSha: process.env.COMMIT_SHA || 'unknown',
    branch: process.env.BRANCH || 'unknown',
    workflowRunUrl: process.env.WORKFLOW_RUN_URL || null,
    typecheckStatus: process.env.TYPECHECK_STATUS === 'success' ? 'success' : 'failure',
    buildStatus: process.env.BUILD_STATUS === 'success' ? 'success' : 'failure',
  })

  console.log(
    `Rapport de santé : ${report.overall_status} — ${report.failed_tests}/${report.total_tests} tests échoués` +
      (report.domains.length ? ` — domaines en échec : ${report.domains.map((d) => d.domainId).join(', ')}` : '')
  )

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquant(s) — rapport non envoyé (non bloquant).')
    return
  }

  const result = await postHealthReport(report, { url, key })

  if (!result.ok) {
    console.error('Échec envoi rapport de santé (non bloquant) :', result.status, result.body)
    return
  }

  console.log('Rapport de santé envoyé avec succès.')
}

main().catch((e) => {
  console.error('report-system-health : erreur non bloquante :', e)
})
