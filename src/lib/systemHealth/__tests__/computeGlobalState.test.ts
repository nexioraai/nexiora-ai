import { describe, it, expect } from 'vitest'
import { computeGlobalState } from '../computeGlobalState'

describe('computeGlobalState', () => {
  it('table absente : toujours warning, quoi que dise le reste', () => {
    expect(computeGlobalState({ tableMissing: true, isStale: false, latestOverallStatus: 'success' })).toBe('warning')
    expect(computeGlobalState({ tableMissing: true, isStale: true, latestOverallStatus: 'failure' })).toBe('warning')
  })

  it('dernier run réussi, pas de silence : ok', () => {
    expect(computeGlobalState({ tableMissing: false, isStale: false, latestOverallStatus: 'success' })).toBe('ok')
  })

  it('dernier run en échec : problem, même si récent', () => {
    expect(computeGlobalState({ tableMissing: false, isStale: false, latestOverallStatus: 'failure' })).toBe('problem')
  })

  it('silence de plus de 48h sans échec connu : warning, pas problem', () => {
    expect(computeGlobalState({ tableMissing: false, isStale: true, latestOverallStatus: 'success' })).toBe('warning')
    expect(computeGlobalState({ tableMissing: false, isStale: true, latestOverallStatus: null })).toBe('warning')
  })

  it('point 4 — un échec connu ET du silence depuis : reste problem, ne redescend jamais en simple warning', () => {
    expect(computeGlobalState({ tableMissing: false, isStale: true, latestOverallStatus: 'failure' })).toBe('problem')
  })
})
