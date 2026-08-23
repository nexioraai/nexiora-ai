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
import { readFileSync } from 'node:fs'
import {
  DOMAIN_REGISTRY,
  MODE_3_OWNED_DIRECTORIES,
  MODE_2_OWNED_DIRECTORIES,
  ORDER_DOMAIN_OWNED_DIRECTORIES,
  CHECKOUT_OWNED_DIRECTORIES,
  type DomainDefinition,
} from '../domainRegistry'
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
  it.each([
    'shared-commerce-core',
    'mode-3-supplier-domain',
    'order-domain-frontier',
    'order-dispatch',
    'mode-2-merchant-domain',
    'checkout-domain-selection',
  ])(
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

  it('mode-3-supplier-domain : import de mode2/ ET relecture du mode (A9) détectés', () => {
    const detectes = violationsSur('mode-3-supplier-domain', FIXTURE_VIOLANTE).map((v) => v.reason)
    expect(detectes.some((r) => r.includes('Acyclicité'))).toBe(true)
    expect(
      detectes.some((r) => r.startsWith('A9')),
      'A9 ne detecte pas la relecture du mode : c\'est LE test anti-rechute, il ne peut pas etre muet'
    ).toBe(true)
  })

  it.each(
    domaine('order-dispatch').forbiddenPatterns.map((r) => [r.pattern.toString(), r.pattern] as const)
  )('order-dispatch (A5) : la règle %s détecte au moins une ligne', (_label, pattern) => {
    const violations = violationsSur('order-dispatch', FIXTURE_VIOLANTE)
    expect(
      violations.some((v) => v.pattern === pattern.toString()),
      `la regle ${pattern} ne detecte RIEN dans la fixture violante`
    ).toBe(true)
  })

  // A1 avait ses règles, pas son contrôle positif : la phase 4 les a déclarées
  // sans jamais prouver qu'elles détectent quoi que ce soit. Une règle muette
  // rendrait la frontière marchande verte à tort, indéfiniment.
  it.each(
    domaine('mode-2-merchant-domain').forbiddenPatterns.map((r) => [r.pattern.toString(), r.pattern] as const)
  )('mode-2-merchant-domain (A1) : la règle %s détecte au moins une ligne', (_label, pattern) => {
    const violations = violationsSur('mode-2-merchant-domain', FIXTURE_VIOLANTE)
    expect(
      violations.some((v) => v.pattern === pattern.toString()),
      `la règle ${pattern} ne détecte RIEN dans la fixture violante : A1 serait verte à tort`
    ).toBe(true)
  })

  it.each(
    domaine('checkout-domain-selection').forbiddenPatterns.map((r) => [r.pattern.toString(), r.pattern] as const)
  )('checkout-domain-selection : la règle %s détecte au moins une ligne', (_label, pattern) => {
    const violations = violationsSur('checkout-domain-selection', FIXTURE_VIOLANTE)
    expect(
      violations.some((v) => v.pattern === pattern.toString()),
      `la règle ${pattern} ne détecte RIEN dans la fixture violante : l'acquis de la phase 4 serait vert à tort`
    ).toBe(true)
  })

  it('checkout-domain-selection : aucune règle ne reste muette', () => {
    const regles = domaine('checkout-domain-selection').forbiddenPatterns
    const detectes = new Set(violationsSur('checkout-domain-selection', FIXTURE_VIOLANTE).map((v) => v.pattern))
    const muettes = regles.filter((r) => !detectes.has(r.pattern.toString())).map((r) => r.pattern.toString())
    expect(muettes, `règle(s) ne détectant RIEN :\n  ${muettes.join('\n  ')}`).toEqual([])
  })

  // `order-domain-frontier` était le seul domaine du chantier déclaré SANS
  // aucun contrôle : ses deux règles n'avaient jamais été prouvées non muettes.
  // Elles gardent pourtant l'endroit où « qui exécute cette vente ? » est
  // tranché — un garde muet y aurait été le plus coûteux du registre.
  it.each(
    domaine('order-domain-frontier').forbiddenPatterns.map((r) => [r.pattern.toString(), r.pattern] as const)
  )('order-domain-frontier : la règle %s détecte au moins une ligne', (_label, pattern) => {
    const violations = violationsSur('order-domain-frontier', FIXTURE_VIOLANTE)
    expect(
      violations.some((v) => v.pattern === pattern.toString()),
      `la règle ${pattern} ne détecte RIEN dans la fixture violante : le point de décision de la frontière serait gardé par une règle muette`
    ).toBe(true)
  })

  it('order-domain-frontier : aucune règle ne reste muette', () => {
    const regles = domaine('order-domain-frontier').forbiddenPatterns
    const detectes = new Set(violationsSur('order-domain-frontier', FIXTURE_VIOLANTE).map((v) => v.pattern))
    const muettes = regles.filter((r) => !detectes.has(r.pattern.toString())).map((r) => r.pattern.toString())
    expect(muettes, `règle(s) ne détectant RIEN :\n  ${muettes.join('\n  ')}`).toEqual([])
  })

  it('order-dispatch : aucune règle ne reste muette', () => {
    const regles = domaine('order-dispatch').forbiddenPatterns
    const detectes = new Set(violationsSur('order-dispatch', FIXTURE_VIOLANTE).map((v) => v.pattern))
    const muettes = regles.filter((r) => !detectes.has(r.pattern.toString())).map((r) => r.pattern.toString())
    expect(muettes, `règle(s) ne détectant RIEN :\n  ${muettes.join('\n  ')}`).toEqual([])
  })

  // Un contrôle positif seul ne suffit pas : une règle qui matcherait TOUT
  // serait verte au contrôle positif et rendrait le domaine inutilisable.
  // Le contrôle négatif est ce qui distingue « détecte la violation » de
  // « détecte n'importe quoi ». Il couvre désormais les SIX domaines.
  it('CONTRÔLE NÉGATIF — un fichier propre ne déclenche aucune règle', () => {
    expect(violationsSur('shared-commerce-core', FIXTURE_PROPRE)).toEqual([])
    expect(violationsSur('mode-3-supplier-domain', FIXTURE_PROPRE)).toEqual([])
    expect(violationsSur('mode-2-merchant-domain', FIXTURE_PROPRE)).toEqual([])
    expect(violationsSur('checkout-domain-selection', FIXTURE_PROPRE)).toEqual([])
    expect(violationsSur('order-domain-frontier', FIXTURE_PROPRE)).toEqual([])
    expect(violationsSur('order-dispatch', FIXTURE_PROPRE)).toEqual([])
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

// ============================================================
// 4. EXHAUSTIVITÉ DU DOMAINE MARCHAND — symétrique du bloc 3
// ============================================================
// La phase 4 a créé `mode-2-merchant-domain` avec UN SEUL fichier déclaré.
// `ownedFiles` étant une liste explicite, `src/lib/mode2/pricing.ts` ajouté
// demain n'aurait été couvert par aucune règle : A1 aurait été vraie par
// coïncidence de contenu, pas tenue par un garde. Ce test est le pendant exact
// de celui du Mode 3 — même mécanisme, même formulation d'échec.
describe('Phase 4 — exhaustivité du domaine marchand (A1)', () => {
  it('tout fichier des répertoires Mode 2 est déclaré dans ownedFiles', () => {
    const surDisque = MODE_2_OWNED_DIRECTORIES.flatMap((d) => fichiersDe(d)).sort()
    const declares = [...domaine('mode-2-merchant-domain').ownedFiles].sort()

    const manquants = surDisque.filter((f) => !declares.includes(f))
    const fantomes = declares.filter((f) => !surDisque.includes(f))

    expect(
      manquants,
      `fichier(s) du domaine marchand non déclaré(s) dans DOMAIN_REGISTRY — ils ne sont couverts par AUCUNE règle de frontière, donc A1 ne les protège pas :\n  ${manquants.join('\n  ')}`
    ).toEqual([])
    expect(fantomes, `fichier(s) déclaré(s) mais absent(s) du disque :\n  ${fantomes.join('\n  ')}`).toEqual([])
  })

  it('le dénominateur est non vide (sinon ce test ne prouverait rien)', () => {
    const surDisque = MODE_2_OWNED_DIRECTORIES.flatMap((d) => fichiersDe(d))
    expect(surDisque.length).toBeGreaterThan(0)
  })
})

// ============================================================
// 5. EXHAUSTIVITÉ DES DEUX DERNIERS DOMAINES « EN FORME DE RÉPERTOIRE »
// ============================================================
// Même mécanisme et mêmes assertions que les blocs 3 et 4 — appliqués ici aux
// deux domaines dont l'audit de fermeture a montré qu'ils reproduisaient le
// défaut corrigé sur mode2/ :
//
//   · order-domain-frontier   — le point de décision de la frontière ;
//   · checkout-domain-selection — le point de vente, dont le cliquet
//     anti-rechute se contournait en extrayant un helper voisin.
//
// Ce bloc est paramétré plutôt que dupliqué deux fois. Les blocs 3 et 4 ne
// sont pas touchés : leurs assertions restent en place, mot pour mot.
describe.each([
  ['order-domain-frontier', ORDER_DOMAIN_OWNED_DIRECTORIES] as const,
  ['checkout-domain-selection', CHECKOUT_OWNED_DIRECTORIES] as const,
])('Phase 4 — exhaustivité du domaine « %s »', (domainId, repertoires) => {
  it('tout fichier des répertoires possédés est déclaré dans ownedFiles', () => {
    const surDisque = repertoires.flatMap((d) => fichiersDe(d)).sort()
    const declares = [...domaine(domainId).ownedFiles].sort()

    const manquants = surDisque.filter((f) => !declares.includes(f))
    const fantomes = declares.filter((f) => !surDisque.includes(f))

    expect(
      manquants,
      `fichier(s) du domaine "${domainId}" non déclaré(s) dans DOMAIN_REGISTRY — ils ne sont couverts par AUCUNE règle de frontière :\n  ${manquants.join('\n  ')}`
    ).toEqual([])
    expect(fantomes, `fichier(s) déclaré(s) mais absent(s) du disque :\n  ${fantomes.join('\n  ')}`).toEqual([])
  })

  it('le dénominateur est non vide (sinon ce test ne prouverait rien)', () => {
    expect(repertoires.flatMap((d) => fichiersDe(d)).length).toBeGreaterThan(0)
  })
})

// ============================================================
// 6. L'ACQUIS DE LA PHASE 4 — la conversion reste unique ET autorisée
// ============================================================
// La suite générique (domainBoundaries.test.ts) prouve déjà qu'aucune règle ne
// se déclenche sur la route : c'est la preuve que « l'état actuel passe ».
// Ce bloc prouve la propriété INVERSE, qu'aucune regex ne peut établir : le
// verrou n'est pas satisfait par une route qui aurait perdu sa conversion, et
// la conversion n'a pas été dupliquée ailleurs dans le fichier.
describe('Phase 4 — la conversion mode → domaine reste unique dans le point de vente', () => {
  const ROUTE = 'src/app/api/shop/checkout/route.ts'
  const lignesDeCode = readFileSync(join(ROOT, ROUTE), 'utf8')
    .split('\n')
    .filter((l) => !/^(\/\/|\*|\/\*)/.test(l.trim()))

  it('exactement UN appel à resolveFulfillmentDomain', () => {
    const appels = lignesDeCode.filter((l) => l.includes('resolveFulfillmentDomain('))
    expect(
      appels.length,
      `la conversion mode → domaine doit rester unique. Trouvé ${appels.length} appel(s) :\n  ${appels.map((l) => l.trim()).join('\n  ')}`
    ).toBe(1)
  })

  it('exactement UNE garde de reconnaissance du mode', () => {
    expect(lignesDeCode.filter((l) => l.includes('isRecognisedSiteMode(')).length).toBe(1)
  })

  it('la conversion lit bien site.mode — le verrou ne passe pas par sa disparition', () => {
    const conversion = lignesDeCode.find((l) => l.includes('resolveFulfillmentDomain('))!
    expect(conversion).toContain('site.mode')
  })

  it('la route interroge une politique plutôt que le mode', () => {
    // Les sept branchements retirés sont devenus autant d'interrogations.
    // Si ce compte tombait à zéro, le verrou serait vert alors que la route
    // aurait cessé d'appliquer les règles de domaine.
    const interrogations = lignesDeCode.filter((l) => /\bpolicy\./.test(l))
    expect(interrogations.length).toBeGreaterThanOrEqual(7)
  })
})
