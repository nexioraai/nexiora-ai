// src/lib/systemHealth/postHealthReport.ts
//
// Extrait de scripts/report-system-health.ts pour être testable directement
// (vrai fetch, vrai HTTP) sans dépendre d'un vrai projet Supabase — un
// serveur HTTP local suffit pour prouver que ce code fonctionne réellement.
// Le script CI et les tests utilisent exactement la même fonction : rien
// n'est dupliqué entre "ce qui tourne en CI" et "ce qui est vérifié ici".

import type { HealthReport } from './buildHealthReport'

export type PostHealthReportResult = { ok: boolean; status: number; body?: string }

export async function postHealthReport(
  report: HealthReport,
  config: { url: string; key: string }
): Promise<PostHealthReportResult> {
  const res = await fetch(`${config.url}/rest/v1/system_health_checks`, {
    method: 'POST',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(report),
  })

  if (!res.ok) {
    return { ok: false, status: res.status, body: await res.text() }
  }
  return { ok: true, status: res.status }
}
