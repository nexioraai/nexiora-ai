import { describe, it, expect, vi } from 'vitest'
import {
  interpretDbInvariants,
  fetchDbInvariants,
  deriveDbInvariantsState,
  DB_INVARIANT_PREFIX,
} from '../dbInvariants'

// ============================================================
// DETTE 5 — L'ABSENCE DE PREUVE N'EST JAMAIS UNE PREUVE DE CONFORMITÉ.
//
// Cinq fichiers de test lisent des fichiers SQL ; aucun n'interrogeait la
// base. Le dépôt pouvait affirmer un invariant que la base n'appliquait plus.
//
// Ce fichier verrouille UNE règle, et c'est la seule qui rende le contrôle
// utile : tout chemin non concluant — RPC absente, HTTP ≠ 200, JSON illisible,
// résultat incomplet, incohérence, exception, timeout — produit
// `unverifiable`, JAMAIS `conforming`. Sans elle, un contrôle en panne serait
// indistinguable d'une base saine, et le cliquet fabriquerait du vert :
// exactement ce que `dbInvariant.test.ts` refuse depuis M1-7.
// ============================================================

const CONFORME = {
  schema_version: 1,
  expected_checks: 5,
  performed_checks: 5,
  conforming: true,
  violations: [],
}

const VIOLE = {
  schema_version: 1,
  expected_checks: 5,
  performed_checks: 5,
  conforming: false,
  violations: [
    { invariant: 'shop_products.for_sale', detail: 'colonne ABSENTE de la base' },
    { invariant: 'decrement_shop_stock_batch', detail: 'le corps deploye ne contient pas « and track_inventory is true »' },
  ],
}

// ------------------------------------------------------------
describe('interpretDbInvariants — base CONFORME', () => {
  it('aucune entrée : le contrat de `raw_failures` est « une entrée = un problème »', () => {
    const v = interpretDbInvariants(CONFORME)
    expect(v.state).toBe('conforming')
    // Écrire ici ferait afficher un succès sous le bandeau « Autres échecs ».
    expect(v.entries).toEqual([])
  })
})

describe('interpretDbInvariants — base NON CONFORME', () => {
  it('une entrée par invariant violé, préfixée `DB_INVARIANTS:`', () => {
    const v = interpretDbInvariants(VIOLE)
    expect(v.state).toBe('violated')
    expect(v.entries).toHaveLength(2)
    for (const e of v.entries) expect(e.test.startsWith(DB_INVARIANT_PREFIX)).toBe(true)
    expect(v.entries[0].test).toBe(`${DB_INVARIANT_PREFIX} shop_products.for_sale`)
    expect(v.entries[0].message).toContain('colonne ABSENTE')
    expect(v.entries[1].test).toContain('decrement_shop_stock_batch')
  })

  it('une violation mal formée ne fait pas perdre le signal', () => {
    const v = interpretDbInvariants({ ...VIOLE, violations: [{}, null, 'texte'] })
    expect(v.state).toBe('violated')
    expect(v.entries).toHaveLength(3)
    for (const e of v.entries) expect(e.test.startsWith(DB_INVARIANT_PREFIX)).toBe(true)
  })
})

// ------------------------------------------------------------
describe('interpretDbInvariants — TOUT chemin non concluant est INVÉRIFIABLE', () => {
  const CAS: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['chaîne', 'ok'],
    ['nombre', 1],
    ['tableau', []],
    ['objet vide', {}],
    ['sans compteurs', { conforming: true, violations: [] }],
    ['compteurs non numériques', { expected_checks: '5', performed_checks: '5', conforming: true, violations: [] }],
    ['sans `violations`', { expected_checks: 5, performed_checks: 5, conforming: true }],
    ['`violations` non tableau', { expected_checks: 5, performed_checks: 5, conforming: true, violations: {} }],
    ['sans `conforming`', { expected_checks: 5, performed_checks: 5, violations: [] }],
  ]

  for (const [label, raw] of CAS) {
    it(`${label} -> unverifiable, JAMAIS conforming`, () => {
      const v = interpretDbInvariants(raw)
      expect(v.state).toBe('unverifiable')
      expect(v.state).not.toBe('conforming')
      expect(v.entries).toHaveLength(1)
      expect(v.entries[0].test).toBe(`${DB_INVARIANT_PREFIX} verification impossible`)
    })
  }

  it('RÉSULTAT INCOMPLET (3/5) -> unverifiable, ni conforme ni violé', () => {
    // C'est la raison d'être de `performed_checks`. Un résultat tronqué —
    // version future partielle, boucle interrompue — serait sinon
    // indistinguable d'une base saine.
    const v = interpretDbInvariants({ expected_checks: 5, performed_checks: 3, conforming: true, violations: [] })
    expect(v.state).toBe('unverifiable')
    expect(v.entries[0].message).toContain('3/5')
  })

  it('INCOHÉRENCE INTERNE (conforming:true avec des violations) -> unverifiable', () => {
    // On ne tranche pas à la place de la base : on refuse de conclure.
    const v = interpretDbInvariants({ ...CONFORME, conforming: true, violations: [{ invariant: 'x', detail: 'y' }] })
    expect(v.state).toBe('unverifiable')
    expect(v.entries[0].message).toContain('incoherente')
  })

  it('INCOHÉRENCE INVERSE (conforming:false sans violation) -> unverifiable', () => {
    const v = interpretDbInvariants({ ...CONFORME, conforming: false, violations: [] })
    expect(v.state).toBe('unverifiable')
  })
})

// ------------------------------------------------------------
describe('fetchDbInvariants — le réseau ne peut jamais produire un faux vert', () => {
  const CONFIG = { url: 'https://x.test', key: 'service-role-key' }

  it('200 + base conforme -> conforming, aucune entrée', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => CONFORME })) as never
    const v = await fetchDbInvariants({ ...CONFIG, fetchImpl })
    expect(v.state).toBe('conforming')
    expect(v.entries).toEqual([])
  })

  it("appelle bien la RPC PostgREST, avec la clé service_role", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => CONFORME })) as never
    await fetchDbInvariants({ ...CONFIG, fetchImpl })
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('https://x.test/rest/v1/rpc/check_db_invariants')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.apikey).toBe('service-role-key')
    expect(headers.Authorization).toBe('Bearer service-role-key')
  })

  it('🔴 RPC ABSENTE (404) -> unverifiable, JAMAIS conforming', async () => {
    // Le cas central : la migration n'a pas été jouée. Le traiter comme
    // conforme rendrait tout ce contrôle nuisible — il affirmerait une
    // conformité que rien n'a vérifiée.
    const fetchImpl = vi.fn(async () => ({
      ok: false, status: 404, text: async () => 'function public.check_db_invariants does not exist',
    })) as never
    const v = await fetchDbInvariants({ ...CONFIG, fetchImpl })
    expect(v.state).toBe('unverifiable')
    expect(v.entries[0].message).toContain('404')
    expect(v.entries[0].message).toContain('does not exist')
  })

  for (const status of [401, 403, 500, 502]) {
    it(`HTTP ${status} -> unverifiable`, async () => {
      const fetchImpl = vi.fn(async () => ({ ok: false, status, text: async () => '' })) as never
      const v = await fetchDbInvariants({ ...CONFIG, fetchImpl })
      expect(v.state).toBe('unverifiable')
    })
  }

  it('JSON invalide -> unverifiable', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token') },
    })) as never
    const v = await fetchDbInvariants({ ...CONFIG, fetchImpl })
    expect(v.state).toBe('unverifiable')
    expect(v.entries[0].message).toContain('JSON invalide')
  })

  it('EXCEPTION réseau / timeout -> unverifiable, et ne LÈVE jamais', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ETIMEDOUT') }) as never
    const v = await fetchDbInvariants({ ...CONFIG, fetchImpl })
    expect(v.state).toBe('unverifiable')
    expect(v.entries[0].message).toContain('ETIMEDOUT')
  })

  it('base non conforme -> violated, entrées transmises', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => VIOLE })) as never
    const v = await fetchDbInvariants({ ...CONFIG, fetchImpl })
    expect(v.state).toBe('violated')
    expect(v.entries).toHaveLength(2)
  })
})

// ------------------------------------------------------------
describe('deriveDbInvariantsState — relecture depuis un rapport stocké', () => {
  it('aucune entrée DB -> conforming (contrat : une base saine n\'écrit rien)', () => {
    expect(deriveDbInvariantsState([])).toBe('conforming')
    expect(deriveDbInvariantsState(null)).toBe('conforming')
    expect(deriveDbInvariantsState(undefined)).toBe('conforming')
  })

  it('des `raw_failures` Vitest SEULS -> conforming (ils ne parlent pas de la base)', () => {
    expect(deriveDbInvariantsState([
      { test: 'checkout > refuse un panier vide', message: 'expected 400' },
      { test: 'quelque chose ailleurs', message: 'boom' },
    ])).toBe('conforming')
  })

  it('une entrée `DB_INVARIANTS: <invariant>` -> violated', () => {
    expect(deriveDbInvariantsState([
      { test: `${DB_INVARIANT_PREFIX} shop_products.for_sale`, message: 'colonne absente' },
    ])).toBe('violated')
  })

  it('l\'entrée « verification impossible » -> unverifiable, pas violated', () => {
    expect(deriveDbInvariantsState([
      { test: `${DB_INVARIANT_PREFIX} verification impossible`, message: 'HTTP 404' },
    ])).toBe('unverifiable')
  })

  it('MÉLANGE Vitest + DB : le verdict DB est isolé correctement', () => {
    expect(deriveDbInvariantsState([
      { test: 'un test Vitest en echec', message: 'boom' },
      { test: `${DB_INVARIANT_PREFIX} trigger trg_enforce_stock_tracking_requires_count`, message: 'absent' },
    ])).toBe('violated')
  })

  it('invérifiable ET violé -> unverifiable prime (on ne sait pas ce qu\'on n\'a pas vu)', () => {
    expect(deriveDbInvariantsState([
      { test: `${DB_INVARIANT_PREFIX} shop_products.for_sale`, message: 'x' },
      { test: `${DB_INVARIANT_PREFIX} verification impossible`, message: 'y' },
    ])).toBe('unverifiable')
  })

  it('entrées malformées -> jamais de crash', () => {
    expect(deriveDbInvariantsState([{ test: null, message: 'x' } as never])).toBe('conforming')
  })
})
