import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  IDENTITE_FR, IDENTITE_EN, CONCENTRIQUE_FR, CONCENTRIQUE_EN,
  IMMEDIAT_FR, IMMEDIAT_EN, PAGES, VERIFIE_LE, MOTIFS_INTERDITS,
} from '../../../../documentation/manifeste'
import { jsonLdPlateforme } from '../../../../documentation/jsonld'

// ============================================================
// LE CORPUS PUBLIC NE PEUT PLUS SE CONTREDIRE NI TROP PARLER.
//
// POURQUOI CE CLIQUET EXISTE. La version manuscrite de `llms.txt` a affirme
// pendant des mois une capacite que le produit n'a pas, et sous-declare le
// nombre de langues d'un facteur neuf. Personne ne l'a vu, parce qu'aucun
// test ne confrontait le texte au produit. Une documentation lue par des
// systemes automatises est recopiee, mise en cache et citee bien apres sa
// correction : une erreur y coute plus cher qu'ailleurs.
//
// TROIS GARANTIES, TOUTES MECANIQUES :
//   1. les blocs canoniques sont identiques AU CARACTERE PRES ;
//   2. aucun motif interdit n'apparait -- capacite inexistante, identite d'un
//      tiers, vocabulaire interne, seuil, promesse invérifiable ;
//   3. FR et EN decrivent le MEME ensemble de pages.
// ============================================================

const RACINE = join(__dirname, '../../../..')
const DOC = join(RACINE, 'documentation')
const lire = (langue: 'fr' | 'en', fichier: string) =>
  readFileSync(join(DOC, langue, fichier), 'utf-8')

const PAGES_FR = readdirSync(join(DOC, 'fr')).filter((f) => f.endsWith('.md'))
const PAGES_EN = readdirSync(join(DOC, 'en')).filter((f) => f.endsWith('.md'))

/** Les surfaces publiques derivees, controlees au meme titre que les pages. */
const SURFACES_DERIVEES = ['src/app/llms.txt/route.ts']

describe('CORPUS — le denominateur est reel', () => {
  it('12 pages FR et 12 pages EN existent sur le disque', () => {
    expect(PAGES_FR).toHaveLength(12)
    expect(PAGES_EN).toHaveLength(12)
  })

  it('chaque page declaree au manifeste existe dans LES DEUX langues', () => {
    for (const p of PAGES) {
      expect(PAGES_FR, `${p.id} manque en FR`).toContain(p.fr)
      expect(PAGES_EN, `${p.id} manque en EN`).toContain(p.en)
    }
  })

  it('aucune page orpheline — tout fichier sur disque est declare', () => {
    expect(PAGES_FR.sort()).toEqual(PAGES.map((p) => p.fr).sort())
    expect(PAGES_EN.sort()).toEqual(PAGES.map((p) => p.en).sort())
  })

  it('FR et EN declarent exactement le MEME ensemble d’identifiants', () => {
    // On compare les FAITS declares, jamais les textes : deux langues ne
    // peuvent pas se comparer mot a mot, mais elles doivent couvrir le meme
    // produit.
    const ids = PAGES.map((p) => p.id)
    expect(new Set(ids).size, 'identifiants dupliques').toBe(ids.length)
  })
})

describe('CORPUS — les blocs canoniques sont identiques AU CARACTERE PRES', () => {
  it('la phrase d’identite est reprise verbatim la ou elle apparait', () => {
    const porteusesFr = ['01-identite.md', '11-faq.md']
    for (const f of porteusesFr) {
      expect(lire('fr', f), `${f} reformule l’identite`).toContain(IDENTITE_FR)
    }
    for (const f of ['01-identity.md', '11-faq.md']) {
      expect(lire('en', f), `${f} reformule l’identite`).toContain(IDENTITE_EN)
    }
  })

  it('le modele concentrique est repris verbatim', () => {
    expect(lire('fr', '01-identite.md')).toContain(CONCENTRIQUE_FR)
    expect(lire('fr', '03-types-et-capacites.md')).toContain(CONCENTRIQUE_FR)
    expect(lire('en', '01-identity.md')).toContain(CONCENTRIQUE_EN)
    expect(lire('en', '03-site-types-and-capabilities.md')).toContain(CONCENTRIQUE_EN)
  })

  it('la phrase « aucune republication » est reprise verbatim partout', () => {
    for (const f of ['02-comment-ca-marche.md', '04-generation-et-edition.md', '11-faq.md']) {
      expect(lire('fr', f), `${f} reformule l’edition immediate`).toContain(IMMEDIAT_FR)
    }
    for (const f of ['02-how-it-works.md', '04-generation-and-editing.md', '11-faq.md']) {
      expect(lire('en', f), `${f} reformule l’edition immediate`).toContain(IMMEDIAT_EN)
    }
  })

  it('la surface derivee `llms.txt` ne redige rien : elle importe le manifeste', () => {
    const src = readFileSync(join(RACINE, 'src/app/llms.txt/route.ts'), 'utf-8')
    expect(src).toContain('IDENTITE_FR')
    expect(src).toContain('CONCENTRIQUE_FR')
    expect(src).toContain('IMMEDIAT_FR')
  })

  it('le JSON-LD reprend la phrase d’identite, jamais une variante', () => {
    const [org, , app] = jsonLdPlateforme('https://exemple.test', 'fr')
    expect(org.description).toBe(IDENTITE_FR)
    expect(app.description).toBe(IDENTITE_FR)
    // `Product` designerait un bien vendu : Deribfy est un logiciel, et ce
    // sont ses CLIENTS qui publient des produits.
    expect(JSON.stringify(jsonLdPlateforme('https://x.test'))).not.toContain('"Product"')
  })
})

describe('CORPUS — aucun motif interdit', () => {
  const fichiers = [
    ...PAGES_FR.map((f) => ({ nom: `fr/${f}`, contenu: lire('fr', f) })),
    ...PAGES_EN.map((f) => ({ nom: `en/${f}`, contenu: lire('en', f) })),
    ...SURFACES_DERIVEES.map((f) => ({ nom: f, contenu: readFileSync(join(RACINE, f), 'utf-8') })),
  ]

  /** Les lignes interrogatives sont les REQUETES que le corpus doit capter. */
  const lignesExaminees = (contenu: string, ignorerQuestions?: boolean) =>
    contenu
      .split('\n')
      .filter((l) => !ignorerQuestions || !l.trimEnd().endsWith('?'))
      .join('\n')

  for (const { motif, raison, ignorerQuestions } of MOTIFS_INTERDITS) {
    it(`aucun fichier ne contient : ${raison}`, () => {
      const fautifs = fichiers
        .filter((f) => motif.test(lignesExaminees(f.contenu, ignorerQuestions)))
        .map((f) => `${f.nom} (${(lignesExaminees(f.contenu, ignorerQuestions).match(motif) || [])[0]})`)
      expect(
        fautifs,
        `motif interdit (${raison}) trouve dans :\n  ${fautifs.join('\n  ')}`
      ).toEqual([])
    })
  }

  it('la liste de motifs est reelle — un corpus vide passerait aussi', () => {
    expect(MOTIFS_INTERDITS.length).toBeGreaterThanOrEqual(10)
    expect(fichiers.length).toBe(25)
  })
})

describe('CORPUS — aucune promesse de resultat', () => {
  it('la clause de non-garantie est presente la ou le referencement est decrit', () => {
    // Decrire une preparation technique sans dire qui decide du resultat est
    // ce qui transforme « prepare pour Google » en « garanti sur Google ».
    expect(lire('fr', '08-seo-google-visibilite-ia.md')).toMatch(/Google decide seul/)
    expect(lire('en', '08-seo-google-ai-visibility.md')).toMatch(/Google alone decides/)
  })

  it('aucune page ne promet une position, un trafic ou une date d’indexation', () => {
    const promesses = /garantit? (?:une position|le classement|du trafic|l'indexation)|guarantee[sd]? (?:a position|ranking|traffic|indexing)/i
    for (const f of PAGES_FR) expect(promesses.test(lire('fr', f)), `fr/${f}`).toBe(false)
    for (const f of PAGES_EN) expect(promesses.test(lire('en', f)), `en/${f}`).toBe(false)
  })
})

describe('CORPUS — chaque page est autonome et datee', () => {
  it('chaque page porte une definition en citation des son debut', () => {
    for (const f of PAGES_FR) {
      const debut = lire('fr', f).split('\n').slice(0, 4).join('\n')
      expect(debut, `fr/${f} n’ouvre pas sur une definition`).toMatch(/^#\s.+\n\n>\s/)
    }
    for (const f of PAGES_EN) {
      const debut = lire('en', f).split('\n').slice(0, 4).join('\n')
      expect(debut, `en/${f} n’ouvre pas sur une definition`).toMatch(/^#\s.+\n\n>\s/)
    }
  })

  it('chaque page porte sa date de verification, egale a celle du manifeste', () => {
    for (const f of PAGES_FR) expect(lire('fr', f), `fr/${f}`).toContain(VERIFIE_LE)
    for (const f of PAGES_EN) expect(lire('en', f), `en/${f}`).toContain(VERIFIE_LE)
  })

  it('chaque page declare sa PORTEE — sans elle, un extrait perd sa condition', () => {
    for (const f of PAGES_FR) expect(lire('fr', f), `fr/${f}`).toMatch(/\*\*Portee :\*\*/)
    for (const f of PAGES_EN) expect(lire('en', f), `en/${f}`).toMatch(/\*\*Scope:\*\*/)
  })
})
