import { describe, it, expect } from 'vitest'
import { galleryUrlOf, resolveGalleryImage, galleryResolutionMessage } from '../galleryResolution'

// ============================================================
// DETTE 4 (volet gallery) — LE MODÈLE NE DOIT JAMAIS INVENTER D'INDEX.
//
// `gallery` est absent des 16 champs de CURRENT SITE STATE : tout index que
// le modèle produisait était deviné, et `/apply` ne validait que l'intervalle.
// Une devinette dans les bornes supprimait la mauvaise image, sans erreur.
//
// Ces tests verrouillent la seule propriété qui rend le ciblage par URL sûr :
// AUCUNE ambiguïté ne peut aboutir à une écriture, et aucun appariement
// approximatif n'existe.
// ============================================================

describe('galleryUrlOf — les deux formes adressables, et rien de plus', () => {
  it('chaîne -> son URL', () => {
    expect(galleryUrlOf('https://x.test/a.jpg')).toBe('https://x.test/a.jpg')
  })

  it('objet { url } -> son URL (forme documentée par un incident réel)', () => {
    // `gallerySchema.test.ts` documente que le modèle a produit des OBJETS.
    // `Navbar.tsx:601` les reconnaît déjà : `typeof img === 'string' ? img : img.url`.
    expect(galleryUrlOf({ url: 'https://x.test/b.jpg' })).toBe('https://x.test/b.jpg')
  })

  it('objet enrichi { url, alt, width } -> son URL', () => {
    expect(galleryUrlOf({ url: 'https://x.test/c.jpg', alt: 'chat', width: 800 })).toBe('https://x.test/c.jpg')
  })

  it('espaces de bord retirés, des deux côtés', () => {
    expect(galleryUrlOf('  https://x.test/a.jpg  ')).toBe('https://x.test/a.jpg')
    expect(galleryUrlOf({ url: ' https://x.test/a.jpg ' })).toBe('https://x.test/a.jpg')
  })

  const NON_ADRESSABLES: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['nombre', 42],
    ['booléen', true],
    ['tableau', ['https://x.test/a.jpg']],
    ['objet sans url', { src: 'https://x.test/a.jpg' }],
    ['objet url non-chaîne', { url: 42 }],
    ['objet url null', { url: null }],
    ['chaîne vide', ''],
    ['espaces seuls', '   '],
    ['objet url vide', { url: '   ' }],
  ]
  for (const [label, entry] of NON_ADRESSABLES) {
    it(`${label} -> NON ADRESSABLE (null), jamais une URL devinée`, () => {
      // On ne cherche pas `src`, ni `href`, ni le premier champ qui ressemble
      // à une URL : deviner reviendrait à choisir une cible au hasard.
      expect(galleryUrlOf(entry)).toBeNull()
    })
  }
})

describe('resolveGalleryImage — appariement exact', () => {
  const GALERIE = [
    'https://x.test/a.jpg',
    { url: 'https://x.test/b.jpg', alt: 'b' },
    'https://x.test/c.jpg',
  ]

  it('URL présente une seule fois -> sa position', () => {
    expect(resolveGalleryImage(GALERIE, 'https://x.test/c.jpg')).toEqual({ ok: true, index: 2 })
  })

  it('résout aussi bien un élément objet qu\'une chaîne', () => {
    expect(resolveGalleryImage(GALERIE, 'https://x.test/b.jpg')).toEqual({ ok: true, index: 1 })
  })

  it('espaces autour de la requête -> résolus', () => {
    expect(resolveGalleryImage(GALERIE, '  https://x.test/a.jpg  ')).toEqual({ ok: true, index: 0 })
  })

  it('URL inconnue -> not_found', () => {
    expect(resolveGalleryImage(GALERIE, 'https://x.test/zzz.jpg')).toMatchObject({ ok: false, reason: 'not_found' })
  })

  it('galerie vide -> not_found', () => {
    expect(resolveGalleryImage([], 'https://x.test/a.jpg')).toMatchObject({ ok: false, reason: 'not_found' })
  })
})

describe('resolveGalleryImage — SENSIBLE À LA CASSE, délibérément', () => {
  it('une casse différente n\'apparie PAS', () => {
    // C'est LA différence avec `resolveProductByName`, qui passe en
    // minuscules. Sur une URL, ce repliement serait dangereux : une demande
    // de `/A.jpg` trouverait `/a.jpg` et supprimerait une image que le
    // marchand n'a pas désignée. Les chemins d'URL sont sensibles à la casse.
    expect(resolveGalleryImage(['https://x.test/a.jpg'], 'https://x.test/A.jpg'))
      .toMatchObject({ ok: false, reason: 'not_found' })
  })

  it('deux images ne différant que par la casse restent DISTINCTES', () => {
    const g = ['https://x.test/a.jpg', 'https://x.test/A.jpg']
    expect(resolveGalleryImage(g, 'https://x.test/a.jpg')).toEqual({ ok: true, index: 0 })
    expect(resolveGalleryImage(g, 'https://x.test/A.jpg')).toEqual({ ok: true, index: 1 })
  })
})

describe('resolveGalleryImage — AUCUN appariement approximatif', () => {
  const G = ['https://x.test/photos/mug-grand.jpg']

  it('sous-chaîne refusée', () => {
    expect(resolveGalleryImage(G, 'mug-grand.jpg')).toMatchObject({ ok: false, reason: 'not_found' })
    expect(resolveGalleryImage(G, 'https://x.test/photos/')).toMatchObject({ ok: false, reason: 'not_found' })
  })

  it('préfixe inverse refusé', () => {
    expect(resolveGalleryImage(['https://x.test/a.jpg'], 'https://x.test/a.jpg?v=2'))
      .toMatchObject({ ok: false, reason: 'not_found' })
  })
})

describe('resolveGalleryImage — ambiguïté = AUCUNE écriture', () => {
  it('URL en double -> ambiguous, avec le compte', () => {
    const g = ['https://x.test/a.jpg', 'https://x.test/b.jpg', 'https://x.test/a.jpg']
    expect(resolveGalleryImage(g, 'https://x.test/a.jpg')).toEqual({
      ok: false, reason: 'ambiguous', query: 'https://x.test/a.jpg', count: 2,
    })
  })

  it('même URL sous DEUX formes (chaîne et objet) -> ambiguous', () => {
    // Les deux formes désignent la même image : le doublon est réel.
    const g = ['https://x.test/a.jpg', { url: 'https://x.test/a.jpg' }]
    expect(resolveGalleryImage(g, 'https://x.test/a.jpg')).toMatchObject({ ok: false, reason: 'ambiguous', count: 2 })
  })

  it('trois occurrences -> toujours ambiguous, jamais « la première »', () => {
    const g = ['https://x.test/a.jpg', 'https://x.test/a.jpg', 'https://x.test/a.jpg']
    const r = resolveGalleryImage(g, 'https://x.test/a.jpg')
    expect(r).toMatchObject({ ok: false, reason: 'ambiguous', count: 3 })
    expect(r).not.toHaveProperty('index')
  })
})

describe('resolveGalleryImage — entrées dégénérées (fail-closed)', () => {
  const MAUVAISES: Array<[string, unknown]> = [
    ['undefined', undefined], ['null', null], ['nombre', 42],
    ['objet', { url: 'https://x.test/a.jpg' }], ['tableau', ['https://x.test/a.jpg']],
    ['chaîne vide', ''], ['espaces seuls', '   '],
  ]
  for (const [label, url] of MAUVAISES) {
    it(`URL ${label} -> not_found, jamais une sélection accidentelle`, () => {
      expect(resolveGalleryImage(['https://x.test/a.jpg', ''], url)).toMatchObject({ ok: false, reason: 'not_found' })
    })
  }

  it('`gallery` absente ou non-tableau -> not_found, aucun crash', () => {
    for (const g of [undefined, null, 'pas un tableau', 42, { 0: 'https://x.test/a.jpg' }]) {
      expect(resolveGalleryImage(g, 'https://x.test/a.jpg'), String(g)).toMatchObject({ ok: false, reason: 'not_found' })
    }
  })

  it('les éléments NON ADRESSABLES sont ignorés, sans décaler les positions', () => {
    // Un élément illisible ne doit ni faire échouer la résolution, ni décaler
    // l'index de ceux qui suivent : la suppression porte sur une position du
    // tableau RÉEL.
    const g = [null, { src: 'x' }, 'https://x.test/a.jpg', 42]
    expect(resolveGalleryImage(g, 'https://x.test/a.jpg')).toEqual({ ok: true, index: 2 })
  })
})

describe('galleryResolutionMessage — le modèle doit savoir quoi redemander', () => {
  it('not_found : dit qu\'aucun changement n\'a eu lieu', () => {
    const m = galleryResolutionMessage({ ok: false, reason: 'not_found', query: 'https://x.test/z.jpg' })
    expect(m).toContain('https://x.test/z.jpg')
    expect(m.toLowerCase()).toContain('aucun changement')
  })

  it('ambiguous : donne le compte et demande de trancher', () => {
    const m = galleryResolutionMessage({ ok: false, reason: 'ambiguous', query: 'https://x.test/a.jpg', count: 2 })
    expect(m).toContain('2 images')
    expect(m.toLowerCase()).toContain('aucun changement')
  })
})
