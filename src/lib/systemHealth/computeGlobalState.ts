// src/lib/systemHealth/computeGlobalState.ts
//
// Dérive l'état global 🟢/🟠/🔴 de l'Admin à partir du dernier check connu.
// Aucune notion de "mode" ici — uniquement overall_status du dernier run
// et fraîcheur du signal. Extrait en module pur pour être testable
// indépendamment du rendu de /admin/system-health.

export type GlobalState = 'ok' | 'warning' | 'problem'

export type GlobalStateInput = {
  tableMissing: boolean
  isStale: boolean
  latestOverallStatus: 'success' | 'failure' | null
}

export function computeGlobalState(input: GlobalStateInput): GlobalState {
  // Un échec connu l'emporte toujours sur le silence : un problème actif
  // qui n'a pas été re-confirmé depuis 48h reste un problème actif, pas
  // une simple absence de nouvelles. Ne pas confondre silence et
  // régression, dans un sens comme dans l'autre.
  if (input.tableMissing) return 'warning'
  if (input.latestOverallStatus === 'failure') return 'problem'
  if (input.isStale) return 'warning'
  return 'ok'
}
