import { describe, it, expect } from 'vitest'
import { computeGlobalState } from '../computeGlobalState'

// DETTE 5 — `dbInvariants` est désormais REQUIS. Les cinq cas d'origine
// restent vrais tels quels ; ils portaient jusqu'ici une hypothèse implicite
// (« la base est conforme ») que le type oblige maintenant à écrire. C'est
// tout l'intérêt de l'avoir rendu obligatoire : personne ne peut plus obtenir
// « ok » sans avoir dit ce qu'il sait de la base.
const BASE_CONFORME = { dbInvariants: 'conforming' } as const

describe('computeGlobalState', () => {
  it('table absente : toujours warning, quoi que dise le reste', () => {
    expect(computeGlobalState({ ...BASE_CONFORME, tableMissing: true, isStale: false, latestOverallStatus: 'success' })).toBe('warning')
    expect(computeGlobalState({ ...BASE_CONFORME, tableMissing: true, isStale: true, latestOverallStatus: 'failure' })).toBe('warning')
  })

  it('dernier run réussi, pas de silence : ok', () => {
    expect(computeGlobalState({ ...BASE_CONFORME, tableMissing: false, isStale: false, latestOverallStatus: 'success' })).toBe('ok')
  })

  it('dernier run en échec : problem, même si récent', () => {
    expect(computeGlobalState({ ...BASE_CONFORME, tableMissing: false, isStale: false, latestOverallStatus: 'failure' })).toBe('problem')
  })

  it('silence de plus de 48h sans échec connu : warning, pas problem', () => {
    expect(computeGlobalState({ ...BASE_CONFORME, tableMissing: false, isStale: true, latestOverallStatus: 'success' })).toBe('warning')
    expect(computeGlobalState({ ...BASE_CONFORME, tableMissing: false, isStale: true, latestOverallStatus: null })).toBe('warning')
  })

  it('point 4 — un échec connu ET du silence depuis : reste problem, ne redescend jamais en simple warning', () => {
    expect(computeGlobalState({ ...BASE_CONFORME, tableMissing: false, isStale: true, latestOverallStatus: 'failure' })).toBe('problem')
  })
})

// ============================================================
// DETTE 5 — LE VERDICT DE LA BASE ENTRE DANS L'ÉTAT GLOBAL.
//
// Sans ces règles, un invariant rompu en production s'afficherait sous un
// bandeau vert « ok », avec un simple cartouche ambre plus bas que personne
// ne lit. C'est l'angle mort que cette dette ferme.
// ============================================================
describe('DETTE 5 — verdict de la base dans l\'état global', () => {
  const CI_VERTE = { tableMissing: false, isStale: false, latestOverallStatus: 'success' } as const

  it('DB conforme, CI verte -> ok', () => {
    expect(computeGlobalState({ ...CI_VERTE, dbInvariants: 'conforming' })).toBe('ok')
  })

  it('DB NON CONFORME, CI verte -> problem (jamais ok)', () => {
    // LA règle de cette dette : une base rompue ne peut pas s'afficher verte.
    expect(computeGlobalState({ ...CI_VERTE, dbInvariants: 'violated' })).toBe('problem')
  })

  it('DB INVÉRIFIABLE, CI verte -> warning (jamais ok)', () => {
    // Ne pas avoir pu vérifier n'est pas un problème avéré, mais ce n'est pas
    // « tout va bien » non plus.
    expect(computeGlobalState({ ...CI_VERTE, dbInvariants: 'unverifiable' })).toBe('warning')
  })

  it('CI déjà en échec, DB conforme -> problem (comportement historique intact)', () => {
    expect(computeGlobalState({ tableMissing: false, isStale: false, latestOverallStatus: 'failure', dbInvariants: 'conforming' })).toBe('problem')
  })

  it('COMBINAISON — CI en échec ET DB non conforme -> problem', () => {
    expect(computeGlobalState({ tableMissing: false, isStale: false, latestOverallStatus: 'failure', dbInvariants: 'violated' })).toBe('problem')
  })

  it('COMBINAISON — CI en échec ET DB invérifiable -> problem (l\'échec avéré prime)', () => {
    expect(computeGlobalState({ tableMissing: false, isStale: false, latestOverallStatus: 'failure', dbInvariants: 'unverifiable' })).toBe('problem')
  })

  it('COMBINAISON — silence de 48h ET DB non conforme -> problem, pas warning', () => {
    // Une violation connue l'emporte sur une simple absence de nouvelles,
    // exactement comme un échec de CI connu.
    expect(computeGlobalState({ tableMissing: false, isStale: true, latestOverallStatus: 'success', dbInvariants: 'violated' })).toBe('problem')
  })

  it('COMBINAISON — silence de 48h ET DB invérifiable -> warning', () => {
    expect(computeGlobalState({ tableMissing: false, isStale: true, latestOverallStatus: 'success', dbInvariants: 'unverifiable' })).toBe('warning')
  })

  it('table absente : warning quel que soit le verdict DB (aucun rapport à lire)', () => {
    for (const db of ['conforming', 'violated', 'unverifiable'] as const) {
      expect(computeGlobalState({ tableMissing: true, isStale: false, latestOverallStatus: null, dbInvariants: db }), db).toBe('warning')
    }
  })

  it('AUCUN état DB non-ok ne peut produire « ok »', () => {
    // Verrou de synthèse : quelle que soit la combinaison, `violated` et
    // `unverifiable` interdisent le vert.
    for (const db of ['violated', 'unverifiable'] as const) {
      for (const stale of [false, true]) {
        for (const last of ['success', null] as const) {
          const état = computeGlobalState({ tableMissing: false, isStale: stale, latestOverallStatus: last, dbInvariants: db })
          expect(état, `${db}/${stale}/${last}`).not.toBe('ok')
        }
      }
    }
  })
})
