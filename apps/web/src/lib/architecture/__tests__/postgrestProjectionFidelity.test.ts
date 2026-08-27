import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'fs'
import { join, relative, sep } from 'path'
import { projeter } from '@/lib/testing/postgrest'

// ============================================================
// LOT 6 / CHAINE D — FERMER DEBT-068 A LA SOURCE, PAS DANS LES HARNAIS.
//
// LE DEFAUT. `/api/shop/upload-design` demandait `.select('id')` et gardait
// ensuite sur `site.mode`. PostgREST rend EXACTEMENT les colonnes demandees :
// en production `site.mode` valait `undefined`, la garde echouait pour tout le
// monde, et la route refusait TOUS les marchands en 403. Le harnais, lui,
// rendait le fixture entier — donc du vert. C'est DEBT-068 (P5-01).
//
// CE QUI A ETE MESURE. Soixante-neuf harnais du depot construisent leur double
// avec `b.select = () => b`, qui ignore la projection ; QUATRE seulement
// l'honoraient. La tentation evidente est de reecrire les soixante-neuf.
//
// CE N'EST PAS LA BONNE REPONSE, ET LA MESURE LE DIT. Corriger les harnais
// protege les routes QU'ILS COUVRENT, au moment ou on les corrige. Le defaut,
// lui, vit dans le CODE : une requete qui lit une colonne qu'elle n'a pas
// demandee. Ce cliquet-ci l'interdit partout, y compris dans les fichiers
// qu'aucun test ne couvre — ce qu'aucune reecriture de harnais n'atteindrait.
// Les deux mecanismes se completent ; celui-ci est le seul exhaustif.
//
// LE DENOMINATEUR EST LE DISQUE. Meme principe que le cliquet d'exhaustivite
// des surfaces de mode : une requete ecrite demain est analysee parce qu'elle
// existe.
// ============================================================

const RACINE = join(__dirname, '../../../..')
const SRC = join(RACINE, 'src')

/** Commentaires et chaines retires : sans cela, la prose des commentaires
 *  produit des faux positifs (mesure : `site.const`, `site.Un`). */
function codeUtile(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
}

function fichiersSource(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      if (e === 'node_modules') continue
      out.push(...fichiersSource(p))
    } else if (/\.tsx?$/.test(e)) {
      out.push(p)
    }
  }
  return out
}

const TOUS = fichiersSource(SRC)
const rel = (p: string) => relative(RACINE, p).split(sep).join('/')
const SOURCES = TOUS.filter((p) => !/__tests__|\.test\.tsx?$/.test(p))
const HARNAIS = TOUS.filter((p) => /\.test\.tsx?$/.test(p))

/** `const { data: X } = await client.from('T').select('a, b')` */
const REQUETE =
  /const\s*\{\s*data:\s*(\w+)[^}]*\}\s*=\s*await\s+(\w+)\s*\.from\(\s*['"](\w+)['"]\s*\)\s*\.select\(\s*(['"`])([^'"`]*)\4/g

/**
 * `let q = client.from('T').select('a, b')` ... `const { data: X } = await q`
 *
 * AUDIT GLOBAL / PASSE 2 — QUATRE REQUETES ETAIENT TOTALEMENT INVISIBLES.
 *
 * Une mutation a survecu : retirer `supplier_id` de la projection imbriquee de
 * la branche curated de `/api/catalog/search` ne faisait rougir aucun cliquet.
 * La cause n'etait ni la relation ni l'alias -- c'est que la requete est
 * CONSTRUITE EN DEUX TEMPS. Le motif exigeait `await client.from(...)` sur une
 * seule expression ; toute requete conditionnelle (filtres ajoutes selon les
 * parametres) lui echappait, par construction.
 *
 * Mesure : 121 requetes directes vues, 4 differees INVISIBLES -- dont celle
 * qui porte la garde d'eligibilite fournisseur de la recherche visiteur.
 */
const REQUETE_DIFFEREE =
  /(?:let|const)\s+(\w+)\s*=\s*(\w+)\s*\.from\(\s*['"](\w+)['"]\s*\)\s*\.select\(\s*(['"`])([^'"`]*)\4/g

type Requete = { nom: string; table: string; cols: string; suite: string; index: number }

/** Les requetes d'un fichier, SOUS LEURS DEUX FORMES. */
function requetesDuFichier(code: string): Requete[] {
  const out: Requete[] = []
  for (const m of code.matchAll(REQUETE)) {
    out.push({ nom: m[1], table: m[3], cols: m[5], suite: code.slice(m.index! + m[0].length), index: m.index! })
  }
  for (const m of code.matchAll(REQUETE_DIFFEREE)) {
    const apres = code.slice(m.index! + m[0].length)
    // Le nom sous lequel le resultat est RECUPERE, pas celui du constructeur.
    const attente = apres.match(new RegExp(`const\\s*\\{\\s*data:\\s*(\\w+)[^}]*\\}\\s*=\\s*await\\s+${m[1]}\\b`))
    if (!attente) continue
    out.push({
      nom: attente[1],
      table: m[3],
      cols: m[5],
      suite: apres.slice(attente.index! + attente[0].length),
      index: m.index!,
    })
  }
  return out
}

/** Ce qui n'est pas une colonne : membres de tableau, d'objet, de promesse. */
const NON_COLONNES = new Set([
  'length', 'map', 'filter', 'forEach', 'find', 'some', 'every', 'reduce', 'slice',
  'sort', 'join', 'includes', 'indexOf', 'push', 'flatMap', 'then', 'catch',
])

type Lecture = { fichier: string; ligne: number; table: string; projetees: string[]; manquantes: string[] }

function analyser(): { requetes: number; fautives: Lecture[] } {
  let requetesVues = 0
  const fautives: Lecture[] = []
  for (const p of SOURCES) {
    const code = codeUtile(readFileSync(p, 'utf-8'))
    for (const q of requetesDuFichier(code)) {
      const { nom, table, cols, suite } = q
      // Les colonnes des jointures imbriquees sont traitees au NIVEAU 1 BIS ;
      // ici on ne garde que les colonnes de RACINE.
      const racine = cols.replace(/\([^)]*\)/g, '')
      const projetees = racine
        .split(',')
        .map((c) => c.trim().split(':')[0].trim())
        .filter(Boolean)
      if (projetees.length === 0 || projetees.includes('*')) continue
      requetesVues++
      // DEUX FORMES D'ACCES, ET LA SECONDE A ETE TROUVEE PAR UNE MUTATION
      // SURVIVANTE. `(site as { dropship_type?: unknown }).dropship_type` est
      // le tour le plus courant du depot pour lire une colonne optionnelle ;
      // un detecteur qui ne connait que `site.colonne` les manque TOUTES.
      const lues = new Set([
        ...[...suite.matchAll(new RegExp(`\\b${nom}\\s*[?!]?\\s*\\.\\s*(\\w+)`, 'g'))].map((x) => x[1]),
        ...[...suite.matchAll(new RegExp(`\\(\\s*${nom}\\s+as\\s+[^)]*\\)\\s*[?!]?\\s*\\.\\s*(\\w+)`, 'g'))].map((x) => x[1]),
      ])
      const manquantes = [...lues].filter((c) => !projetees.includes(c) && !NON_COLONNES.has(c))
      if (manquantes.length > 0) {
        fautives.push({
          fichier: rel(p),
          ligne: code.slice(0, q.index).split('\n').length,
          table,
          projetees,
          manquantes,
        })
      }
    }
  }
  return { requetes: requetesVues, fautives }
}

const { requetes, fautives } = analyser()

// ============================================================
// AUDIT GLOBAL / PASSE 2 — NIVEAU 1 BIS : LES RELATIONS IMBRIQUEES.
//
// LE NIVEAU 1 LES EXCLUAIT EXPLICITEMENT, ET C'ETAIT UN TROU. Mesure : retirer
// `supplier_id` de la projection imbriquee de `fetchProduct`
// (`catalog_products(...)`) rend AVEUGLE la garde d'eligibilite fournisseur --
// la fiche produit redevient servie pour un produit que le checkout refuse.
// Aucun des deux mecanismes ne le voyait : le harnais rendait le fixture
// entier, et ce cliquet sautait toute projection contenant une parenthese.
//
// POSTGREST APPLIQUE LA MEME REGLE AUX DEUX NIVEAUX : `catalog_products(name)`
// ne rend que `name`. Une garde posee sur une colonne non demandee de la
// relation lit `undefined`, exactement comme au niveau racine.
//
// L'ACCES SE FAIT PAR ALIAS, ET C'EST CE QUI RENDAIT LA SONDE DIFFICILE :
// le code ecrit `const cp = (sel as any).catalog_products` puis `cp.supplier_id`.
// Le detecteur suit donc l'alias -- y compris a travers un cast, angle mort
// deja rencontre deux fois dans ce depot.
// ============================================================
const RELATION = /(\w+)\s*\(([^)]*)\)/g

function analyserRelations(): { relations: number; fautives: Lecture[] } {
  let relations = 0
  const fautives: Lecture[] = []
  for (const p of SOURCES) {
    const code = codeUtile(readFileSync(p, 'utf-8'))
    for (const q of requetesDuFichier(code)) {
      const { nom, table, cols, suite } = q
      for (const r of cols.matchAll(RELATION)) {
        const [, relation, sousColonnes] = r
        const projetees = sousColonnes
          .split(',')
          .map((c) => c.trim().split(':')[0].trim())
          .filter(Boolean)
        if (projetees.length === 0 || projetees.includes('*')) continue
        relations++

        const alias = new Set(
          [
            ...suite.matchAll(
              new RegExp(
                `(?:const|let|var)\\s+(\\w+)\\s*(?::[^=]+)?=\\s*(?:\\(\\s*[\\w.]+\\s+as\\s+[^)]*\\)|[\\w.]+)\\s*[?!]?\\s*\\.\\s*${relation}\\b`,
                'g'
              )
            ),
          ].map((x) => x[1])
        )

        // AUDIT GLOBAL / PASSE 2 — LES VARIABLES LIEES PAR UNE ITERATION.
        //
        // Une mutation a survecu ici aussi : `catSels.filter((s) =>
        // s.catalog_products.in_stock)` n'etait vu par AUCUNE des deux formes
        // precedentes. C'est pourtant la forme la plus courante des requetes
        // de LISTE -- la relation ne se lit presque jamais autrement.
        const ITERATEURS = '(?:map|filter|forEach|find|some|every|flatMap|reduce)'
        for (const x of suite.matchAll(
          new RegExp(`\\b${nom}\\s*[?!]?\\s*\\)?\\s*\\.\\s*${ITERATEURS}\\s*\\(\\s*\\(?\\s*(\\w+)`, 'g')
        ))
          alias.add(`__iter__${x[1]}`)
        for (const x of suite.matchAll(
          new RegExp(
            `\\(\\s*${nom}\\s*(?:\\?\\?|\\|\\|)\\s*\\[\\]\\s*\\)\\s*\\.\\s*${ITERATEURS}\\s*\\(\\s*\\(?\\s*(\\w+)`,
            'g'
          )
        ))
          alias.add(`__iter__${x[1]}`)

        const lues = new Set<string>()
        for (const brut of alias) {
          const estIterateur = brut.startsWith('__iter__')
          const a = estIterateur ? brut.slice('__iter__'.length) : brut
          if (estIterateur) {
            // La variable d'iteration porte la LIGNE : la relation se lit
            // encore d'un cran plus loin (`s.catalog_products.in_stock`).
            for (const x of suite.matchAll(
              new RegExp(`\\b${a}\\s*[?!]?\\s*\\.\\s*${relation}\\s*[?!]?\\s*\\.\\s*(\\w+)`, 'g')
            ))
              lues.add(x[1])
            continue
          }
          for (const x of suite.matchAll(new RegExp(`\\b${a}\\s*[?!]?\\s*\\.\\s*(\\w+)`, 'g'))) lues.add(x[1])
          for (const x of suite.matchAll(new RegExp(`\\(\\s*${a}\\s+as\\s+[^)]*\\)\\s*[?!]?\\s*\\.\\s*(\\w+)`, 'g'))) lues.add(x[1])
        }
        for (const x of suite.matchAll(
          new RegExp(`\\b${nom}\\s*[?!]?\\s*\\.\\s*${relation}\\s*[?!]?\\s*\\.\\s*(\\w+)`, 'g')
        ))
          lues.add(x[1])

        const manquantes = [...lues].filter((c) => !projetees.includes(c) && !NON_COLONNES.has(c))
        if (manquantes.length > 0) {
          fautives.push({
            fichier: rel(p),
            ligne: code.slice(0, q.index).split('\n').length,
            table: `${table} -> ${relation}`,
            projetees,
            manquantes,
          })
        }
      }
    }
  }
  return { relations, fautives }
}

const relationsAnalysees = analyserRelations()

describe('AUDIT GLOBAL — NIVEAU 1 BIS : les RELATIONS imbriquees obeissent a la meme regle', () => {
  it('aucune relation ne lit une colonne absente de sa propre projection', () => {
    const details = relationsAnalysees.fautives
      .map(
        (f) =>
          `  ${f.fichier}:${f.ligne} (${f.table})\n      projete : ${f.projetees.join(', ')}\n      LU MAIS NON PROJETE : ${f.manquantes.join(', ')}`
      )
      .join('\n')
    expect(
      relationsAnalysees.fautives.map((f) => `${f.fichier}:${f.ligne}`),
      'relation(s) imbriquee(s) lisant une colonne qu\'elles n\'ont pas demandee :\n' +
        details +
        "\n\nPostgREST applique la projection AUX DEUX NIVEAUX. Une garde posee sur une colonne non demandee de la relation lit `undefined` -- elle ne protege rien."
    ).toEqual([])
  })

  it('le denominateur est reel — un ensemble vide passerait aussi', () => {
    expect(relationsAnalysees.relations).toBeGreaterThanOrEqual(5)
  })
})

describe('CHAINE D — NIVEAU 1 : aucune requete ne lit une colonne qu’elle n’a pas demandee', () => {
  it('DEBT-068 ne peut plus se reproduire dans le code', () => {
    const details = fautives
      .map((f) => `  ${f.fichier}:${f.ligne} (${f.table})\n      projete : ${f.projetees.join(', ')}\n      LU MAIS NON PROJETE : ${f.manquantes.join(', ')}`)
      .join('\n')
    expect(
      fautives.map((f) => `${f.fichier}:${f.ligne}`),
      `requete(s) lisant une colonne absente de leur propre projection :\n${details}\n\nPostgREST rend EXACTEMENT les colonnes demandees. Une garde posee sur une colonne non projetee lit \`undefined\` — elle ne protege pas, elle refuse tout le monde, ou pire elle laisse tout passer selon le sens du test.\n\nCONDUITE A TENIR : ajoutez la colonne a la projection, ou cessez de la lire.`
    ).toEqual([])
  })

  it('le denominateur est reel — un ensemble vide passerait aussi', () => {
    // PLANCHER RELEVE APRES LA GENERALISATION AUX REQUETES DIFFEREES.
    // Il etait a 90 quand seule la forme directe etait vue ; le maintenir bas
    // aurait laisse passer une regression du COLLECTEUR lui-meme -- exactement
    // le defaut que la passe 2 a trouve.
    expect(requetes).toBeGreaterThan(115)
  })
})

// ============================================================
// NIVEAU 2 — L'INVENTAIRE DES HARNAIS, VISIBLE AU LIEU DE SILENCIEUX.
//
// Ce niveau ne reecrit rien : il empeche la POPULATION de croitre. Chaque
// harnais permissif existant est compte ; le plafond fait de tout ajout un
// acte delibere, lisible en diff. Un harnais NOUVEAU doit utiliser
// `lib/testing/postgrest`, qui honore la projection et capture les filtres.
//
// POURQUOI NE PAS EXIGER LA MIGRATION DES 43 ? Parce que le niveau 1
// ci-dessus rend leur permissivite INOFFENSIVE pour la classe DEBT-068 : une
// route ne PEUT plus lire une colonne non projetee, quel que soit son harnais.
// Migrer 43 harnais eprouves pour un risque deja ferme ailleurs serait un
// refactor a cout eleve et a gain nul — et chaque reecriture est une occasion
// de casser un test qui fonctionne. Ce qui reste vrai, et qui est ecrit ici
// plutot que tu : ces harnais ne prouvent RIEN sur la projection ni sur les
// filtres. Ils ne mentent plus en silence.
// ============================================================

const PERMISSIF = /\.select\s*=\s*\(\s*\)\s*=>|\bselect:\s*\(\s*\)\s*=>|select:\s*vi\.fn\(\s*\)\s*\.mockReturnThis|\.select\s*=\s*self|select:\s*self/
const FIDELE = /creerFrom|colonnesDemandees|projeter\(/

const PERMISSIFS = HARNAIS.filter((p) => {
  const s = readFileSync(p, 'utf-8')
  return !FIDELE.test(s) && PERMISSIF.test(s)
}).map(rel)

/** PLAFOND. Il ne protege pas d'un ajout : il le rend VISIBLE. */
// CLIQUET MONOTONE DECROISSANT. 43 au depart ; 40 apres la migration des
// trois harnais les plus exposes (checkout, sitemap, orders). Ce nombre ne
// doit que BAISSER : chaque migration future doit l'abaisser d'autant, ce qui
// interdit qu'une reecriture soit annulee en silence.
const PLAFOND_HARNAIS_PERMISSIFS = 40

describe('CHAINE D — NIVEAU 2 : la population de harnais permissifs ne croit plus', () => {
  it('aucun harnais permissif supplementaire', () => {
    expect(
      PERMISSIFS.length,
      `${PERMISSIFS.length} harnais ignorent la projection PostgREST, pour un plafond de ${PLAFOND_HARNAIS_PERMISSIFS}.\n\nUn NOUVEAU harnais doit utiliser \`@/lib/testing/postgrest\` (creerFrom / projeter) : il honore \`.select(...)\` comme PostgREST et capture les filtres poses, ce qui rend observable le retrait d'un \`.eq('site_id', ...)\`.\n\nHarnais concernes :\n  ${PERMISSIFS.join('\n  ')}`
    ).toBeLessThanOrEqual(PLAFOND_HARNAIS_PERMISSIFS)
  })

  it('l’utilitaire fidele est REELLEMENT utilise — sinon ce plafond ne mene nulle part', () => {
    const fideles = HARNAIS.filter((p) => FIDELE.test(readFileSync(p, 'utf-8')))
    expect(fideles.length).toBeGreaterThanOrEqual(4)
  })
})

// ============================================================
// NIVEAU 3 — L'UTILITAIRE LUI-MEME EST EPROUVE.
//
// Un double « fidele » qu'aucun test n'eprouve est un second systeme a
// croire. `projeter` reproduit la regle de PostgREST : ces cas la verrouillent.
// ============================================================

describe('CHAINE D — NIVEAU 3 : `projeter` se comporte comme PostgREST', () => {
  const LIGNE = { id: 'a', mode: 3, dropship_type: 'reseller', secret: 'x' }

  it('seules les colonnes demandees sortent', () => {
    expect(projeter(LIGNE, 'id, mode')).toEqual({ id: 'a', mode: 3 })
  })

  it('une colonne non demandee est ABSENTE, pas `undefined` masque', () => {
    const r = projeter(LIGNE, 'id') as Record<string, unknown>
    expect('mode' in r).toBe(false)
    expect(r.mode).toBeUndefined()
  })

  it('`*` rend la ligne entiere', () => {
    expect(projeter(LIGNE, '*')).toEqual(LIGNE)
  })

  it('une projection vide rend la ligne entiere (comportement de `.select()` sans argument)', () => {
    expect(projeter(LIGNE, '')).toEqual(LIGNE)
  })

  it('les tableaux sont projetes ligne a ligne', () => {
    expect(projeter([LIGNE, LIGNE], 'mode')).toEqual([{ mode: 3 }, { mode: 3 }])
  })

  it('`null` et `undefined` traversent sans erreur', () => {
    expect(projeter(null, 'id')).toBeNull()
    expect(projeter(undefined, 'id')).toBeUndefined()
  })

  it('une colonne demandee mais absente de la donnee reste absente', () => {
    expect(projeter({ id: 'a' }, 'id, mode')).toEqual({ id: 'a' })
  })

  it('les relations imbriquees demandees sont conservees', () => {
    const avec = { id: 'a', catalog_products: { id: 'p' }, secret: 'x' }
    expect(projeter(avec, 'id, catalog_products(id, name)')).toEqual({ id: 'a', catalog_products: { id: 'p' } })
  })
})
