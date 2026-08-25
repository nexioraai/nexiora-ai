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
import { fetchDbInvariants } from '../src/lib/systemHealth/dbInvariants.ts'

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

  // ============================================================
  // DETTE 5 — VÉRIFICATION DE LA BASE RÉELLEMENT DÉPLOYÉE.
  //
  // SUR `main` UNIQUEMENT, et la raison n'est pas la prudence : la CI ne
  // dispose que d'UNE base cible, celle de production. Un run sur une branche
  // de feature vérifierait donc la base de production tout en publiant son
  // verdict sous le nom de cette branche — un rapport exact attribué au
  // mauvais objet. La route Admin ne lit d'ailleurs que `branch = 'main'`.
  //
  // Le verdict S'AJOUTE aux `raw_failures` issus de Vitest, il ne les
  // remplace jamais : deux problèmes de nature différente doivent rester
  // visibles ensemble.
  //
  // Une base CONFORME n'écrit rien — le contrat de `raw_failures` est
  // « une entrée = un problème ».
  // ============================================================
  if (report.branch === 'main') {
    const verdict = await fetchDbInvariants({ url, key })
    report.raw_failures = [...report.raw_failures, ...verdict.entries]
    console.log(
      `Invariants base : ${verdict.state}` +
        (verdict.entries.length ? ` — ${verdict.entries.length} entree(s) signalee(s)` : '')
    )
  } else {
    console.log(`Invariants base : non verifies (branche « ${report.branch} », une seule base cible).`)
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
