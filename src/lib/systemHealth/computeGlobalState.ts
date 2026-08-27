// src/lib/systemHealth/computeGlobalState.ts
//
// Dérive l'état global 🟢/🟠/🔴 de l'Admin à partir du dernier check connu.
// Aucune notion de "mode" ici — uniquement overall_status du dernier run
// et fraîcheur du signal. Extrait en module pur pour être testable
// indépendamment du rendu de /admin/system-health.

import type { DbInvariantsState } from './dbInvariants'

export type GlobalState = 'ok' | 'warning' | 'problem'

export type GlobalStateInput = {
  tableMissing: boolean
  isStale: boolean
  latestOverallStatus: 'success' | 'failure' | null
  /**
   * DETTE 5 — le verdict de la base RÉELLEMENT déployée.
   *
   * REQUIS, délibérément. Le rendre optionnel avec un défaut `conforming`
   * rejouerait exactement la faute que cette dette corrige : un appelant qui
   * oublie de le fournir obtiendrait « tout va bien » sans que rien n'ait été
   * vérifié. Ici, l'appelant doit dire ce qu'il sait — y compris qu'il ne
   * sait pas.
   *
   * Se dérive des `raw_failures` du dernier rapport via
   * `deriveDbInvariantsState()`.
   */
  dbInvariants: DbInvariantsState
}

export function computeGlobalState(input: GlobalStateInput): GlobalState {
  // Un échec connu l'emporte toujours sur le silence : un problème actif
  // qui n'a pas été re-confirmé depuis 48h reste un problème actif, pas
  // une simple absence de nouvelles. Ne pas confondre silence et
  // régression, dans un sens comme dans l'autre.
  if (input.tableMissing) return 'warning'
  if (input.latestOverallStatus === 'failure') return 'problem'

  // DETTE 5 — une base non conforme est un PROBLÈME, au même titre qu'une CI
  // rouge. Sans cette ligne, un invariant rompu en production s'afficherait
  // sous un bandeau vert « ok », avec un simple cartouche ambre plus bas que
  // personne ne lit. C'est précisément l'angle mort que cette dette ferme.
  if (input.dbInvariants === 'violated') return 'problem'

  if (input.isStale) return 'warning'

  // Ne pas avoir pu vérifier n'est pas un problème avéré, mais ce n'est pas
  // « ok » non plus : c'est une incertitude, et elle doit se voir.
  if (input.dbInvariants === 'unverifiable') return 'warning'

  return 'ok'
}
