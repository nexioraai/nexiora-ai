import { describe, it, expect } from 'vitest'
import { galleryUrlOf, resolveGalleryImage, galleryResolutionMessage, validateGalleryUrl } from '../galleryResolution'

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

// ============================================================
// CHANTIER 7 (MODE 1) — LA PORTE D'ÉCRITURE D'UNE IMAGE.
//
// Elle est PLUS STRICTE que `galleryUrlOf`, et c'est délibéré : ce dernier
// LIT une donnée historique dont il ne choisit pas la forme ; celle-ci ÉCRIT,
// et la forme est la nôtre. Les quatre thèmes ne rendent qu'une chaîne en
// `http` — écrire autre chose réussirait sans rien afficher.
// ============================================================
describe('CHANTIER 7 — validateGalleryUrl', () => {
  const REELLES = [
    'https://images.pexels.com/photos/1234/sesame.jpeg',
    'https://xyz.supabase.co/storage/v1/object/public/site-images/a.png',
    'https://cdn.test/Photo-A.JPG?w=800&h=600',
    'http://cdn.test/legacy.jpg',
    'https://cdn.test/photo%20avec%20espace.jpg',
    'https://cdn.test/الصورة.jpg',
  ];

  it('chaque URL d’image réelle est acceptée, telle quelle', () => {
    for (const u of REELLES) {
      const r = validateGalleryUrl(u);
      expect(r.ok, u).toBe(true);
      expect(r.ok && r.value).toBe(u);
    }
  });

  it('http:// est accepté — la porte ne refuse pas ce que les thèmes rendent', () => {
    // Les quatre thèmes testent `startsWith('http')`. Exiger https ici
    // refuserait à l'agent une image que la page afficherait très bien.
    expect(validateGalleryUrl('http://cdn.test/a.jpg').ok).toBe(true);
  });

  it('le trim de bord est appliqué, la CASSE est préservée', () => {
    const r = validateGalleryUrl('   https://cdn.test/Photo-A.JPG   ');
    expect(r.ok && r.value).toBe('https://cdn.test/Photo-A.JPG');
  });

  it('🔴 les schémas dangereux sont refusés par ALLOWLIST, pas par hasard', () => {
    for (const u of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'data:image/png;base64,iVBORw0KGgo=',
      'file:///etc/passwd',
      'ftp://cdn.test/a.jpg',
      'vbscript:msgbox(1)',
    ]) {
      expect(validateGalleryUrl(u).ok, u).toBe(false);
    }
  });

  it('🔴 un schéma qui COMMENCE par « http » sans en être un est refusé', () => {
    // `startsWith('http')` — la règle des thèmes — laisserait passer ceci.
    // L'allowlist de schémas, non.
    for (const u of ['httpfoo://cdn.test/a.jpg', 'https-evil://x']) {
      expect(validateGalleryUrl(u).ok, u).toBe(false);
    }
  });

  it('🔴 ce qui n’est pas une URL complète est refusé', () => {
    for (const u of ['photo.jpg', '/uploads/a.jpg', './a.jpg', '//cdn.test/a.jpg', 'cdn.test/a.jpg', '']) {
      expect(validateGalleryUrl(u).ok, JSON.stringify(u)).toBe(false);
    }
  });

  it('🔴 les non-chaînes sont refusées, jamais coercées', () => {
    for (const v of [null, undefined, 42, true, {}, [], { url: 'https://a.test/b.jpg' }, ['https://a.test/b.jpg']]) {
      expect(validateGalleryUrl(v).ok, String(v)).toBe(false);
    }
  });

  it('chaque refus dit qu’AUCUN changement n’a eu lieu', () => {
    for (const v of [null, '', 'photo.jpg', 'javascript:alert(1)']) {
      const r = validateGalleryUrl(v);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.message).toContain("Aucun changement n'a ete fait");
    }
  });

  it('la porte d’écriture et la porte de lecture divergent VOLONTAIREMENT', () => {
    // `galleryUrlOf` tolère `{ url }` pour lire l'historique ; l'écriture le
    // refuse, parce qu'aucun thème ne le rendrait.
    expect(galleryUrlOf({ url: 'https://a.test/b.jpg' })).toBe('https://a.test/b.jpg');
    expect(validateGalleryUrl({ url: 'https://a.test/b.jpg' }).ok).toBe(false);
  });

  it('une URL validée est ensuite ADRESSABLE par le résolveur', () => {
    // Le contrat de bout en bout : ce que l'ajout écrit, la suppression doit
    // savoir le retrouver. Sinon l'image serait inretirable.
    const r = validateGalleryUrl('  https://cdn.test/A.jpg  ');
    expect(r.ok).toBe(true);
    const galerie = [r.ok ? r.value : ''];
    expect(resolveGalleryImage(galerie, 'https://cdn.test/A.jpg')).toEqual({ ok: true, index: 0 });
  });
});
