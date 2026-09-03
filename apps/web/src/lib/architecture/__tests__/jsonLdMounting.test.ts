import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { jsonLdPlateforme } from '../../../../documentation/jsonld'
import { MOTIFS_INTERDITS, IDENTITE_FR } from '../../../../documentation/manifeste'

// ============================================================
// RATCHET -- LE BALISAGE DE DERIBFY NE DOIT JAMAIS ATTEINDRE UN SITE CLIENT.
//
// CE QUE CE FICHIER PROTEGE, ET POURQUOI IL EXISTE. Le depot n'a qu'UN layout
// et aucun groupe de routes ; le proxy reecrit chaque domaine client vers
// `/sites/[slug]`, qui rend donc SOUS ce meme layout. La frontiere entre « le
// balisage de la plateforme » et « le site d'un client » n'est tenue par
// aucune structure de routage : elle tient uniquement au fait que le balisage
// est pose sur une page-feuille. C'est exactement le genre de garantie qu'un
// futur « ajoutons le JSON-LD au layout, ce sera plus simple » detruit sans
// que rien n'echoue -- d'ou ce test.
//
// LE DENOMINATEUR EST EXPLICITE : le scan porte sur TOUT `src/`, pas sur une
// liste de fichiers connus. Un test qui ne regarderait que `about/page.tsx` et
// `layout.tsx` validerait un montage ajoute ailleurs.
// ============================================================

const RACINE_SRC = join(__dirname, '..', '..', '..')
const MONTAGE_ATTENDU = join('app', 'about', 'page.tsx')

function fichiersSource(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue
    const chemin = join(dir, e)
    if (statSync(chemin).isDirectory()) fichiersSource(chemin, acc)
    else if (/\.tsx?$/.test(e) && !/__tests__/.test(chemin)) acc.push(chemin)
  }
  return acc
}

const SOURCES = fichiersSource(RACINE_SRC)

describe('JSON-LD — le montage est unique et localise', () => {
  it('le denominateur du scan est reel — src/ contient bien des fichiers', () => {
    // Sans cela, un walker casse rendrait TOUS les tests suivants verts.
    expect(SOURCES.length).toBeGreaterThan(100)
    expect(SOURCES.some((f) => f.endsWith(MONTAGE_ATTENDU))).toBe(true)
  })

  it('`jsonLdPlateforme` est appele exactement UNE fois dans tout src/', () => {
    const appelants = SOURCES.filter((f) => /jsonLdPlateforme\s*\(/.test(readFileSync(f, 'utf8')))
    expect(appelants.map((f) => f.slice(RACINE_SRC.length + 1))).toEqual([MONTAGE_ATTENDU])
  })

  it('/about emet via le sink commun, sans reecrire sa serialisation', () => {
    // La premiere version de ce montage refaisait l'echappement sur place et
    // n'echappait que `<`. Le sink commun en echappe cinq. Un montage correct
    // ne doit donc PAS contenir sa propre serialisation.
    const src = readFileSync(join(RACINE_SRC, MONTAGE_ATTENDU), 'utf8')
    expect(src).toMatch(/<JsonLdScript\s+data=\{jsonLdPlateforme\(/)
    // `\s*=` cible l'ATTRIBUT JSX, pas le mot : la prose ci-dessus explique
    // precisement pourquoi ce fichier ne doit pas l'utiliser, et un motif nu
    // aurait fait echouer le test sur sa propre justification.
    expect(src).not.toMatch(/dangerouslySetInnerHTML\s*=/)
  })

  it('un seul fichier de src/ emet un script ld+json : le sink commun', () => {
    // Les sites clients ont leur PROPRE balisage (LocalBusiness, FAQPage...)
    // et passent par CE MEME composant. C'est voulu : un seul sink, donc un
    // seul echappement a auditer. Ce que ce test protege est la frontiere
    // inverse -- que le balisage DE DERIBFY ne fuie pas vers eux, invariant
    // tenu par le test d'unicite de `jsonLdPlateforme` ci-dessus.
    const porteurs = SOURCES.filter((f) =>
      /application\/ld\+json/.test(readFileSync(f, 'utf8'))
    ).map((f) => f.slice(RACINE_SRC.length + 1))
    expect(porteurs).toEqual([join('app', 'sites', '[slug]', 'themes', 'JsonLdScript.tsx')])
  })

  it('le layout racine ne porte aucun balisage — il enveloppe les sites clients', () => {
    const layout = readFileSync(join(RACINE_SRC, 'app', 'layout.tsx'), 'utf8')
    expect(layout).not.toMatch(/ld\+json|jsonLdPlateforme|schema\.org/)
  })

  it('aucun fichier servant un site client ne construit le balisage plateforme', () => {
    // Le critere est `jsonLdPlateforme`, PAS le mot « Deribfy » : un theme
    // affiche legitimement un credit visible en pied de page. Confondre une
    // mention de marque avec une declaration d'entite structuree aurait rendu
    // ce cliquet ininterpretable -- et donc, a terme, desactive.
    const fuites = SOURCES.filter(
      (f) =>
        /[\\/]app[\\/]sites[\\/]/.test(f) &&
        /jsonLdPlateforme/.test(readFileSync(f, 'utf8'))
    )
    expect(fuites).toEqual([])
  })
})

describe('JSON-LD — le graphe d’imports interdit toute fuite vers un site client', () => {
  // ============================================================
  // POURQUOI UN GRAPHE ET PAS UN GREP. Le rendu local d'un site client est
  // indisponible (`/sites/[slug]` renvoie 500 sur ce depot, cause preexistante
  // et sans rapport avec ce montage). La preuve par observation manquant, elle
  // est remplacee par une preuve structurelle PLUS forte qu'un grep de
  // repertoire : un grep ne voit qu'un import direct, alors qu'une fuite
  // arriverait presque surement par un helper intermediaire -- un composant
  // partage qui, un jour, importe le manifeste « juste pour le nom du site ».
  // ============================================================

  const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx']

  function resoudre(depuis: string, spec: string): string | null {
    let base: string
    if (spec.startsWith('@/')) base = join(RACINE_SRC, spec.slice(2))
    else if (spec.startsWith('.')) base = join(depuis, '..', spec)
    else return null // paquet npm : hors du depot, ne peut pas porter le manifeste
    for (const ext of ['', ...EXTENSIONS]) {
      const candidat = base + ext
      try {
        if (statSync(candidat).isFile()) return candidat
      } catch {
        /* candidat suivant */
      }
    }
    return null
  }

  function fermetureTransitive(racine: string) {
    const vus = new Set<string>()
    const pile = [racine]
    while (pile.length) {
      const f = pile.pop()!
      if (vus.has(f)) continue
      vus.add(f)
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const suivant = resoudre(f, m[1])
        if (suivant && !vus.has(suivant)) pile.push(suivant)
      }
    }
    return vus
  }

  const RACINES_CLIENT = [
    join(RACINE_SRC, 'app', 'sites', '[slug]', 'page.tsx'),
    join(RACINE_SRC, 'app', 'layout.tsx'), // enveloppe AUSSI les sites clients
  ]

  it('le walker est reel — il traverse plus loin que le fichier racine', () => {
    // Un resolveur casse rendrait la fermeture egale a {racine} et le test
    // suivant vert pour la pire des raisons.
    for (const racine of RACINES_CLIENT) {
      expect(fermetureTransitive(racine).size).toBeGreaterThan(3)
    }
  })

  it('AUCUNE racine servant un site client n’atteint le manifeste ni le balisage', () => {
    for (const racine of RACINES_CLIENT) {
      const atteints = [...fermetureTransitive(racine)].filter((f) =>
        /documentation[\\/](jsonld|manifeste)\.ts$/.test(f)
      )
      expect({ racine: racine.slice(RACINE_SRC.length + 1), atteints }).toEqual({
        racine: racine.slice(RACINE_SRC.length + 1),
        atteints: [],
      })
    }
  })

  it('la page /about, elle, atteint BIEN le balisage — sinon rien n’est monte', () => {
    const atteints = [...fermetureTransitive(join(RACINE_SRC, MONTAGE_ATTENDU))].filter((f) =>
      /documentation[\\/]jsonld\.ts$/.test(f)
    )
    expect(atteints.length).toBe(1)
  })
})

describe('JSON-LD — le contenu respecte les contraintes produit', () => {
  const RACINE = 'https://www.deribfy.com'
  const balisage = jsonLdPlateforme(RACINE, 'fr')
  const serialise = JSON.stringify(balisage)

  it('les trois types attendus sont presents, une seule fois chacun', () => {
    expect(balisage.map((b) => b['@type'])).toEqual([
      'Organization',
      'WebSite',
      'SoftwareApplication',
    ])
  })

  it('Organization et WebSite pointent vers la RACINE, jamais vers /about', () => {
    for (const bloc of balisage) {
      expect(bloc.url).toBe(RACINE)
      expect(bloc.url).not.toMatch(/\/about/)
    }
  })

  it('le montage passe la racine au generateur, pas une URL de page', () => {
    // La contrainte precedente porte sur le generateur ; celle-ci porte sur
    // l'APPELANT. `jsonLdPlateforme(`${SITE_URL}/about`)` satisferait l'autre.
    const src = readFileSync(join(RACINE_SRC, MONTAGE_ATTENDU), 'utf8')
    expect(src).toMatch(/jsonLdPlateforme\(\s*SITE_URL\s*,/)
    expect(src).not.toMatch(/jsonLdPlateforme\([^)]*\/about/)
  })

  it('AUCUN prix ni offre — les prix ne figurent pas au depot', () => {
    expect(serialise).not.toMatch(/offers|price|priceCurrency|Offer/i)
  })

  it('Deribfy n’est JAMAIS represente comme un Product', () => {
    // `Product` designe un bien vendu. Ce sont les CLIENTS qui en publient.
    expect(serialise).not.toMatch(/"@type"\s*:\s*"Product"/)
  })

  it('la description est la phrase d’identite du manifeste, au caractere pres', () => {
    expect(balisage[0].description).toBe(IDENTITE_FR)
  })

  it('aucun motif interdit du manifeste n’est expose dans le balisage', () => {
    const touches = MOTIFS_INTERDITS.filter((m) => m.motif.test(serialise))
    expect(touches.map((m) => m.raison)).toEqual([])
  })
})
