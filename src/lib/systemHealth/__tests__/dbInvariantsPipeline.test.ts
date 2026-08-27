import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildHealthReport } from '../buildHealthReport'
import { interpretDbInvariants, DB_INVARIANT_PREFIX } from '../dbInvariants'

// ============================================================
// DETTE 5 — LE VERDICT S'AJOUTE, IL NE REMPLACE JAMAIS.
//
// Deux sources de problèmes cohabitent désormais dans `raw_failures` : les
// échecs Vitest hors domaine enregistré, et les écarts de la base. Elles
// doivent rester visibles ENSEMBLE — un invariant rompu ne doit pas masquer
// un test cassé, ni l'inverse.
//
// Ces tests verrouillent aussi le point d'intégration : le verdict entre dans
// `report-system-health.ts` APRÈS la construction, et `buildHealthReport`
// garde sa signature d'origine.
// ============================================================

const RAPPORT_VITEST = {
  numTotalTests: 10,
  numFailedTests: 1,
  success: false,
  testResults: [{
    assertionResults: [{
      ancestorTitles: ['quelque part'],
      fullName: 'quelque part > un test qui casse',
      title: 'un test qui casse',
      status: 'failed',
      failureMessages: ['AssertionError: boom'],
    }],
  }],
}

const META = {
  commitSha: 'abc', branch: 'main', workflowRunUrl: null,
  typecheckStatus: 'success' as const, buildStatus: 'success' as const,
}

describe('DETTE 5 — composition des `raw_failures`', () => {
  it('les échecs Vitest existants sont CONSERVÉS quand un verdict DB s\'ajoute', () => {
    const report = buildHealthReport(RAPPORT_VITEST, META)
    expect(report.raw_failures).toHaveLength(1)

    const verdict = interpretDbInvariants({
      expected_checks: 5, performed_checks: 5, conforming: false,
      violations: [{ invariant: 'shop_products.for_sale', detail: 'absente' }],
    })
    // C'est l'opération exacte de report-system-health.ts.
    const fusionne = [...report.raw_failures, ...verdict.entries]

    expect(fusionne).toHaveLength(2)
    expect(fusionne[0].test).toBe('quelque part > un test qui casse')
    expect(fusionne[1].test).toBe(`${DB_INVARIANT_PREFIX} shop_products.for_sale`)
  })

  it('une base conforme n\'ajoute RIEN aux `raw_failures` Vitest', () => {
    const report = buildHealthReport(RAPPORT_VITEST, META)
    const verdict = interpretDbInvariants({
      expected_checks: 5, performed_checks: 5, conforming: true, violations: [],
    })
    expect([...report.raw_failures, ...verdict.entries]).toHaveLength(1)
  })

  it('`buildHealthReport` garde sa signature — le verdict n\'y transite PAS', () => {
    // Point d'intégration verrouillé : le verdict est ajouté dans le script,
    // après construction. `buildHealthReport` ne connaît que Vitest et sa méta.
    const src = readFileSync(join(__dirname, '../buildHealthReport.ts'), 'utf-8')
    expect(src).toMatch(/export function buildHealthReport\(vitestReport: VitestJsonReport, meta: HealthReportMeta\): HealthReport/)
    expect(src).not.toContain('dbInvariants')
    expect(src).not.toContain('DB_INVARIANTS')
  })

  it('`HealthReport` n\'a pas été modifié — aucun champ ajouté', () => {
    const src = readFileSync(join(__dirname, '../buildHealthReport.ts'), 'utf-8')
    const type = src.match(/export type HealthReport = \{[\s\S]*?\n\}/)![0]
    const champs = [...type.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1])
    expect(champs).toEqual([
      'commit_sha', 'branch', 'workflow_run_url', 'overall_status',
      'typecheck_status', 'build_status', 'total_tests', 'failed_tests',
      'domains', 'raw_failures',
    ])
  })
})

describe('DETTE 5 — le contrôle ne tourne QUE sur `main`', () => {
  const SCRIPT = readFileSync(join(__dirname, '../../../../scripts/report-system-health.ts'), 'utf-8')

  it('l\'appel est conditionné à la branche', () => {
    // Une seule base cible existe, et c'est celle de production. Un run sur
    // une branche de feature vérifierait la production tout en publiant son
    // verdict sous le nom de cette branche — un constat exact attribué au
    // mauvais objet. La route Admin ne lit d'ailleurs que `branch = 'main'`.
    expect(SCRIPT).toMatch(/if \(report\.branch === 'main'\)/)
  })

  it('le verdict est CONCATÉNÉ, jamais substitué', () => {
    expect(SCRIPT).toMatch(/report\.raw_failures = \[\.\.\.report\.raw_failures, \.\.\.verdict\.entries\]/)
  })

  it('le script appelle bien `fetchDbInvariants`', () => {
    expect(SCRIPT).toContain("import { fetchDbInvariants }")
    expect(SCRIPT).toMatch(/await fetchDbInvariants\(\{ url, key \}\)/)
  })

  it('hors `main`, aucun appel — et le journal le dit', () => {
    const bloc = SCRIPT.match(/\} else \{[\s\S]*?\n  \}/)![0]
    expect(bloc).toContain('non verifies')
    expect(bloc).not.toContain('fetchDbInvariants')
  })
})

describe('DETTE 5 — la RPC SQL, contrat de fichier', () => {
  const SQL = readFileSync(
    join(__dirname, '../../../../supabase/sql/db_invariants_check_function.sql'), 'utf-8'
  )

  it('déclare `check_db_invariants()` en `security invoker`, rendant du jsonb', () => {
    expect(SQL).toMatch(/create or replace function check_db_invariants\(\)/)
    expect(SQL).toMatch(/returns jsonb/)
    expect(SQL).toMatch(/security invoker/)
    // SECURITY DEFINER ferait de cette fonction un primitif de contournement.
    // Assertion sur le CODE : la section de vérification le MENTIONNE en
    // commentaire, précisément pour dire qu'il ne doit pas apparaître.
    const code = SQL.replace(/^\s*--.*$/gm, '')
    expect(code).not.toMatch(/security\s+definer/i)
  })

  it('vérifie les CINQ invariants nommés', () => {
    for (const invariant of [
      'track_inventory', 'stock_counted_at', 'for_sale',
      'trg_enforce_stock_tracking_requires_count',
      'and track_inventory is true',
    ]) {
      expect(SQL, invariant).toContain(invariant)
    }
    expect(SQL).toMatch(/v_expected\s+constant integer := 5/)
  })

  it('lit les catalogues, et AUCUNE donnée métier', () => {
    const code = SQL.replace(/^\s*--.*$/gm, '')
    expect(code).toMatch(/information_schema\.columns/)
    expect(code).toMatch(/pg_trigger/)
    expect(code).toMatch(/pg_proc/)
    // Aucun select sur une table métier : cette fonction constate une
    // structure, elle ne lit ni produit, ni commande, ni site.
    expect(code).not.toMatch(/from shop_orders|from sites\b|from shop_order_items/)
  })

  it('ne CORRIGE rien — constat seul', () => {
    const code = SQL.replace(/^\s*--.*$/gm, '')
    for (const mutation of [/\bupdate\s+shop_/i, /\binsert\s+into\b/i, /\bdelete\s+from\b/i, /\balter\s+table\b/i, /\bdrop\s+/i]) {
      expect(code, String(mutation)).not.toMatch(mutation)
    }
  })

  it('est fermée à `anon` et `authenticated`, ouverte au seul `service_role`', () => {
    expect(SQL).toMatch(/revoke all on function check_db_invariants\(\) from public;/)
    expect(SQL).toMatch(/revoke all on function check_db_invariants\(\) from anon;/)
    expect(SQL).toMatch(/revoke all on function check_db_invariants\(\) from authenticated;/)
    expect(SQL).toMatch(/grant execute on function check_db_invariants\(\) to service_role;/)
  })

  it('rend les compteurs qui permettent de détecter un résultat incomplet', () => {
    expect(SQL).toMatch(/'expected_checks'/)
    expect(SQL).toMatch(/'performed_checks'/)
    expect(SQL).toMatch(/'conforming'/)
    expect(SQL).toMatch(/'violations'/)
  })
})

describe('DETTE 5 — l\'état global tient compte du verdict', () => {
  const PAGE = readFileSync(join(__dirname, '../../../app/admin/system-health/page.tsx'), 'utf-8')

  it('l\'Admin dérive le verdict des `raw_failures` et le passe à `computeGlobalState`', () => {
    expect(PAGE).toContain('deriveDbInvariantsState')
    expect(PAGE).toMatch(/dbInvariants: deriveDbInvariantsState\(data\.latest\?\.raw_failures\)/)
  })

  it('`dbInvariants` est REQUIS dans le type — nul ne peut l\'omettre', () => {
    // Le rendre optionnel avec un défaut « conforme » rejouerait la faute que
    // cette dette corrige : obtenir « tout va bien » sans rien avoir vérifié.
    const src = readFileSync(join(__dirname, '../computeGlobalState.ts'), 'utf-8')
    expect(src).toMatch(/dbInvariants: DbInvariantsState/)
    expect(src).not.toMatch(/dbInvariants\?:/)
  })
})
