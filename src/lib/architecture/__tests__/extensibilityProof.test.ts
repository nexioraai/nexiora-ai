// Bloc 5 — Preuve d'extensibilité de la fondation.
//
// Ne teste RIEN de réel : chaque domaine/thème utilisé ici est fictif,
// jetable, jamais ajouté à DOMAIN_REGISTRY ni THEME_REGISTRY. L'objectif
// est de prouver empiriquement que les moteurs génériques (checkDomainBoundaries,
// checkSectionOrder) fonctionnent avec des entrées totalement inventées,
// sans qu'aucune ligne de ces moteurs n'ait eu besoin d'être modifiée pour
// ce test — c'est la preuve qu'un futur Mode 4, produit ou thème pourra
// être intégré de la même façon : une entrée de registre, rien d'autre.
import { describe, it, expect } from 'vitest'
import { DOMAIN_REGISTRY, type DomainDefinition } from '../domainRegistry'
import { checkDomainBoundaries } from '../checkDomainBoundaries'
import { THEME_REGISTRY } from '../../../app/sites/[slug]/themes/themeRegistry'
import { checkSectionOrder } from '../../../app/sites/[slug]/themes/checkSectionOrder'
import { getModeCapabilities } from '../../../app/sites/[slug]/themes/modeCapabilities'

// ============================================================
// 1. Moteur de frontières de domaine — checkDomainBoundaries
// ============================================================
describe('Bloc 5 — checkDomainBoundaries généralise à un domaine totalement fictif', () => {
  const fakeDomainClean: DomainDefinition = {
    id: 'block5-fake-domain-clean',
    description: "Domaine fictif jetable — n'existe que dans ce test.",
    ownedFiles: ['src/lib/architecture/__tests__/fixtures/fakeDomainClean.ts'],
    forbiddenPatterns: [{ pattern: /FORBIDDEN_TOKEN_FOR_TEST/, reason: 'motif interdit fictif, sans rapport avec Mode 1/panier' }],
  }
  const fakeDomainViolating: DomainDefinition = {
    id: 'block5-fake-domain-violating',
    description: "Domaine fictif jetable — n'existe que dans ce test.",
    ownedFiles: ['src/lib/architecture/__tests__/fixtures/fakeDomainViolating.ts'],
    forbiddenPatterns: [{ pattern: /FORBIDDEN_TOKEN_FOR_TEST/, reason: 'motif interdit fictif, sans rapport avec Mode 1/panier' }],
  }

  it('domaine fictif propre : aucune violation détectée', () => {
    const violations = checkDomainBoundaries(fakeDomainClean, process.cwd())
    expect(violations).toEqual([])
  })

  it('domaine fictif en violation : détectée avec fichier/ligne/raison corrects', () => {
    const violations = checkDomainBoundaries(fakeDomainViolating, process.cwd())
    expect(violations).toHaveLength(1)
    expect(violations[0].domainId).toBe('block5-fake-domain-violating')
    expect(violations[0].file).toBe('src/lib/architecture/__tests__/fixtures/fakeDomainViolating.ts')
    expect(violations[0].reason).toContain('motif interdit fictif')
  })

  // Preuve que le GABARIT de test générique (describe.each sur un tableau
  // de domaines) fonctionne pour n'importe quel tableau, pas seulement
  // DOMAIN_REGISTRY -- un futur domaine réel serait détecté exactement de
  // la même façon par domainBoundaries.test.ts, sans modification de ce
  // fichier ni de checkDomainBoundaries.ts.
  const fakeRegistry = [fakeDomainClean, fakeDomainViolating]
  it.each(fakeRegistry.map((d) => [d.id, d]))('gabarit générique appliqué à %s', (_id, domain) => {
    const violations = checkDomainBoundaries(domain, process.cwd())
    if (domain.id === 'block5-fake-domain-clean') expect(violations).toEqual([])
    if (domain.id === 'block5-fake-domain-violating') expect(violations.length).toBeGreaterThan(0)
  })

  it('aucune pollution : les domaines fictifs ne sont jamais entrés dans le vrai registre', () => {
    const realIds = DOMAIN_REGISTRY.map((d) => d.id)
    expect(realIds).not.toContain('block5-fake-domain-clean')
    expect(realIds).not.toContain('block5-fake-domain-violating')
  })
})

// ============================================================
// 2. Moteur de vérification de thème — checkSectionOrder
// ============================================================
describe('Bloc 5 — checkSectionOrder généralise à un thème totalement fictif', () => {
  it('thème fictif correct : sections dans le bon ordre, ok=true', () => {
    // Rendu HTML fictif construit à la main (pas besoin d'un vrai composant
    // React pour prouver que checkSectionOrder généralise -- la fonction ne
    // prend qu'un HTML et une liste d'ids, elle ne sait pas ce qu'est un
    // "thème").
    const fakeHtml = '<div><section id="alpha"></section><section id="beta"></section></div>'
    const result = checkSectionOrder(fakeHtml, ['alpha', 'beta'])
    expect(result).toEqual({ ok: true, missing: [], outOfOrder: false })
  })

  it('thème fictif avec une section manquante : détecté', () => {
    const fakeHtml = '<div><section id="alpha"></section></div>'
    const result = checkSectionOrder(fakeHtml, ['alpha', 'beta'])
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['beta'])
  })

  it('thème fictif avec un ordre inversé : détecté', () => {
    const fakeHtml = '<div><section id="beta"></section><section id="alpha"></section></div>'
    const result = checkSectionOrder(fakeHtml, ['alpha', 'beta'])
    expect(result.ok).toBe(false)
    expect(result.outOfOrder).toBe(true)
  })

  it('aucune pollution : aucun thème fictif dans le vrai registre', () => {
    const realIds = THEME_REGISTRY.map((t) => t.id)
    expect(realIds).not.toContain('fake-alpha-beta-theme')
  })
})

// ============================================================
// 3. Mode Capabilities — comportement sur un Mode 4 hypothétique
// ============================================================
describe('Bloc 5 — getModeCapabilities sur un mode inconnu du produit aujourd’hui', () => {
  // ÉTAPE A — CE BLOC A CHANGÉ DE CAMP, ET C'ÉTAIT SA FONCTION.
  //
  // Écrit au Bloc 5, il consignait une limite en la nommant honnêtement : un
  // Mode 4 héritait du comportement « mode 2 »-like, donc obtenait une
  // boutique dès qu'il avait un produit. La prose le disait déjà :
  //
  //     « s'il doit se comporter différemment, cette règle métier devra
  //       être étendue CONSCIEMMENT, ce n'est pas automatique. »
  //
  // C'était consigné, pas approuvé. L'audit des frontières a montré que
  // cette limite était en réalité une SECONDE définition de « ce site
  // commerce », écrite en forme négative, à côté de `canTransact` — la forme
  // même que le registre d'architecture interdit.
  //
  // L'étape A l'a corrigée : `canTransact` est désormais l'autorité unique,
  // et un mode absent de son allowlist n'obtient AUCUNE boutique, avec ou
  // sans produit. Le second test est passé au rouge à la correction (mesuré :
  // « expected false to be true ») puis retourné — c'est exactement ce qu'on
  // attend d'un test de caractérisation.
  it('mode 4 sans produit : hasShop=false', () => {
    expect(getModeCapabilities({ mode: 4, products: [] }).hasShop).toBe(false)
  })

  it('mode 4 AVEC produit : hasShop=false — un mode non admis ne commerce pas', () => {
    expect(getModeCapabilities({ mode: 4, products: [{}] }).hasShop).toBe(false)
  })

  it('un mode futur doit être inscrit CONSCIEMMENT dans les deux allowlists', () => {
    // Le mécanisme d'extension n'a pas disparu, il est devenu explicite :
    // admission (`TRANSACTING_SITE_MODES`) puis, si le catalogue précède les
    // produits, `CATALOG_BEFORE_OWN_PRODUCTS`. Rien ne s'hérite plus.
    for (const mode of [4, 5, 42]) {
      expect(getModeCapabilities({ mode, products: [] }).hasShop, `mode ${mode}`).toBe(false)
      expect(getModeCapabilities({ mode, products: [{}] }).hasShop, `mode ${mode}`).toBe(false)
    }
  })
})
