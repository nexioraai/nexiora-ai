// src/lib/architecture/__tests__/domainBoundaries.test.ts
//
// Suite de tests générique et extensible : elle ne teste pas "Mode 1" en
// dur, elle itère sur DOMAIN_REGISTRY (domainRegistry.ts) et applique la
// même vérification à chaque domaine enregistré, quel qu'il soit. Ajouter
// un Mode 4, un nouveau produit ou une nouvelle capacité à ce registre les
// fait apparaître ici automatiquement, sans toucher ce fichier.
//
// Un échec ici identifie précisément : le domaine concerné (nom du describe),
// le fichier et la ligne en cause, le motif interdit détecté, et la raison
// métier de l'interdiction — directement dans le message d'erreur, donc
// dans les logs CI, sans avoir à ouvrir domainRegistry.ts pour comprendre.

import { describe, it, expect } from 'vitest'
import { DOMAIN_REGISTRY } from '../domainRegistry'
import { checkDomainBoundaries, formatViolations } from '../checkDomainBoundaries'

describe.each(DOMAIN_REGISTRY)('Frontière de domaine : $id', (domain) => {
  it(domain.description, () => {
    const violations = checkDomainBoundaries(domain, process.cwd())

    if (violations.length > 0) {
      throw new Error(
        `Domaine "${domain.id}" : ${violations.length} violation(s) de frontière détectée(s) :\n${formatViolations(violations)}`
      )
    }

    expect(violations).toEqual([])
  })
})

describe('DOMAIN_REGISTRY — intégrité du registre', () => {
  it('chaque domaine déclare au moins un fichier possédé', () => {
    for (const domain of DOMAIN_REGISTRY) {
      expect(domain.ownedFiles.length, `domaine "${domain.id}" sans fichier déclaré`).toBeGreaterThan(0)
    }
  })

  it('aucun identifiant de domaine dupliqué', () => {
    const ids = DOMAIN_REGISTRY.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('tous les fichiers déclarés existent réellement sur disque', () => {
    for (const domain of DOMAIN_REGISTRY) {
      for (const file of domain.ownedFiles) {
        expect(() => checkDomainBoundaries({ ...domain, ownedFiles: [file] }, process.cwd())).not.toThrow()
      }
    }
  })
})
