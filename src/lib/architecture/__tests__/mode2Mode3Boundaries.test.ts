// src/lib/architecture/__tests__/mode2Mode3Boundaries.test.ts
//
// PHASE 0 du chantier de séparation Mode 2 / Mode 3.
// Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// Ce fichier ne vérifie PAS les frontières elles-mêmes : c'est le rôle de
// domainBoundaries.test.ts, générique, qui itère sur DOMAIN_REGISTRY et prend
// donc automatiquement en charge les deux domaines ajoutés en phase 0.
//
// Ce fichier vérifie DEUX propriétés que la suite générique ne peut pas
// couvrir, et sans lesquelles la frontière serait une illusion :
//
//   1. CONTRÔLE POSITIF — chaque motif interdit détecte réellement la
//      violation qu'il décrit. Une règle qui ne matche rien rendrait la
//      frontière verte à tort, indéfiniment.
//
//   2. EXHAUSTIVITÉ — `ownedFiles` est une liste EXPLICITE (choix du moteur,
//      jamais un glob). Un fichier ajouté demain dans src/lib/cj/ ne serait
//      donc couvert par aucune règle : trou silencieux. Le test ci-dessous
//      échoue tant que ce fichier n'est pas déclaré.
//
// Aucun de ces tests ne modifie ni ne lit le comportement métier : ils ne
// portent que sur la structure du code.

import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DOMAIN_REGISTRY, MODE_3_OWNED_DIRECTORIES, type DomainDefinition } from '../domainRegistry'
import { checkDomainBoundaries } from '../checkDomainBoundaries'

const ROOT = process.cwd()
const FIXTURE_VIOLANTE = 'src/lib/architecture/__tests__/fixtures/mode2Mode3Violating.ts'
const FIXTURE_PROPRE = 'src/lib/architecture/__tests__/fixtures/fakeDomainClean.ts'

function domaine(id: string): DomainDefinition {
  const d = DOMAIN_REGISTRY.find((x) => x.id === id)
  if (!d) throw new Error(`domaine "${id}" absent de DOMAIN_REGISTRY`)
  return d
}

/** Applique les règles d'un domaine réel à un fichier arbitraire, sans
 *  toucher au moteur : on ne remplace que `ownedFiles`. */
function violationsSur(id: string, fichier: string) {
  return checkDomainBoundaries({ ...domaine(id), ownedFiles: [fichier] }, ROOT)
}

// ============================================================
// 1. Les deux domaines sont bien enregistrés
// ============================================================
describe('Phase 0 — les domaines Mode 2 / Mode 3 sont enregistrés', () => {
  it.each(['shared-commerce-core', 'mode-3-supplier-domain'])(
    'le domaine "%s" existe et déclare au moins une règle',
    (id) => {
      const d = domaine(id)
      expect(d.ownedFiles.length).toBeGreaterThan(0)
      expect(d.forbiddenPatterns.length).toBeGreaterThan(0)
    }
  )
})

// ============================================================
// 2. CONTRÔLE POSITIF — chaque règle détecte réellement sa violation
// ============================================================
describe('Phase 0 — contrôle positif : chaque motif interdit détecte sa violation', () => {
  it('shared-commerce-core : toutes les règles déclarées sont déclenchées par la fixture violante', () => {
    const regles = domaine('shared-commerce-core').forbiddenPatterns
    const detectes = new Set(violationsSur('shared-commerce-core', FIXTURE_VIOLANTE).map((v) => v.pattern))

    const muettes = regles.filter((r) => !detectes.has(r.pattern.toString())).map((r) => r.pattern.toString())
    expect(
      muettes,
      `règle(s) ne détectant RIEN dans la fixture violante — elles rendraient la frontière verte à tort :\n  ${muettes.join('\n  ')}`
    ).toEqual([])
  })

  it.each(
    domaine('shared-commerce-core').forbiddenPatterns.map((r) => [r.pattern.toString(), r.pattern] as const)
  )('shared-commerce-core : la règle %s détecte au moins une ligne', (_label, pattern) => {
    const violations = violationsSur('shared-commerce-core', FIXTURE_VIOLANTE)
    expect(
      violations.some((v) => v.pattern === pattern.toString()),
      `la règle ${pattern} ne détecte RIEN dans la fixture violante : elle rendrait la frontière verte à tort`
    ).toBe(true)
  })

  it('mode-3-supplier-domain : un import de mode2/ est détecté', () => {
    const violations = violationsSur('mode-3-supplier-domain', FIXTURE_VIOLANTE)
    expect(violations).toHaveLength(1)
    expect(violations[0].reason).toContain('Acyclicité')
  })

  it('CONTRÔLE NÉGATIF — un fichier propre ne déclenche aucune règle', () => {
    expect(violationsSur('shared-commerce-core', FIXTURE_PROPRE)).toEqual([])
    expect(violationsSur('mode-3-supplier-domain', FIXTURE_PROPRE)).toEqual([])
  })

  it('les violations rapportent fichier, ligne et raison exploitables en CI', () => {
    const violations = violationsSur('shared-commerce-core', FIXTURE_VIOLANTE)
    for (const v of violations) {
      expect(v.file).toBe(FIXTURE_VIOLANTE)
      expect(v.line).toBeGreaterThan(0)
      expect(v.reason.length).toBeGreaterThan(20)
    }
  })
})

// ============================================================
// 3. EXHAUSTIVITÉ — aucun fichier du domaine fournisseur hors registre
// ============================================================
function fichiersDe(dir: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(join(ROOT, dir))) {
    if (entree === '__tests__' || entree === 'node_modules') continue
    const rel = `${dir}/${entree}`
    if (statSync(join(ROOT, rel)).isDirectory()) fichiersDe(rel, acc)
    else if (entree.endsWith('.ts') && !entree.endsWith('.d.ts')) acc.push(rel)
  }
  return acc
}

describe('Phase 0 — exhaustivité du domaine fournisseur', () => {
  it('tout fichier des répertoires Mode 3 est déclaré dans ownedFiles', () => {
    const surDisque = MODE_3_OWNED_DIRECTORIES.flatMap((d) => fichiersDe(d)).sort()
    const declares = [...domaine('mode-3-supplier-domain').ownedFiles].sort()

    const manquants = surDisque.filter((f) => !declares.includes(f))
    const fantomes = declares.filter((f) => !surDisque.includes(f))

    expect(
      manquants,
      `fichier(s) du domaine fournisseur non déclaré(s) dans DOMAIN_REGISTRY — ils ne sont couverts par AUCUNE règle de frontière :\n  ${manquants.join('\n  ')}`
    ).toEqual([])
    expect(
      fantomes,
      `fichier(s) déclaré(s) mais absent(s) du disque :\n  ${fantomes.join('\n  ')}`
    ).toEqual([])
  })

  it('le dénominateur est non vide (sinon ce test ne prouverait rien)', () => {
    const surDisque = MODE_3_OWNED_DIRECTORIES.flatMap((d) => fichiersDe(d))
    expect(surDisque.length).toBeGreaterThan(20)
  })
})
