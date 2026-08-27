import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'fs'
import { join, relative, sep } from 'path'

// ============================================================
// AUDIT GLOBAL — LA FRONTIERE QUI REND UNE APP NATIVE POSSIBLE PLUS TARD.
//
// CE CLIQUET NE CONSTRUIT RIEN DE MOBILE, ET C'EST DELIBERE. Il ne suppose
// aucune technologie, n'ajoute aucun contrat, ne prejuge d'aucun calendrier.
// Il PRESERVE une propriete que le depot possede DEJA et qu'il serait couteux
// de reconquerir : la couche metier (`src/lib/` + `src/app/api/`) ne depend
// d'aucune API de navigateur.
//
// POURQUOI MAINTENANT PLUTOT QUE PLUS TARD. Cette propriete se perd par
// accident, une ligne a la fois -- un `localStorage` pose dans un helper
// partage, un `window.location` lu dans une regle de prix. Chaque occurrence
// est anodine seule ; leur accumulation est ce qui oblige a refaire les
// fondations. Mesure au moment de l'ecriture : DEUX fichiers seulement, tous
// deux justifies ci-dessous. Le cout de tenir la ligne est donc nul
// aujourd'hui, et croissant chaque mois ou personne ne la tient.
//
// CE QU'IL NE DIT PAS. Il ne dit pas que le dépôt est « pret pour le mobile ».
// Il dit seulement que la couche metier reste consommable par un client qui
// n'est pas un navigateur -- condition NECESSAIRE, jamais suffisante.
// ============================================================

const RACINE = join(__dirname, '../../../..')
const SRC = join(RACINE, 'src')

function fichiers(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      if (e === '__tests__' || e === 'node_modules') continue
      out.push(...fichiers(p))
    } else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p)
  }
  return out
}

const rel = (p: string) => relative(RACINE, p).split(sep).join('/')

/** La couche METIER : ce qu'un client non-navigateur devrait pouvoir consommer. */
const METIER = fichiers(SRC)
  .map(rel)
  .filter((f) => f.startsWith('src/lib/') || f.startsWith('src/app/api/'))
  .filter((f) => !f.startsWith('src/lib/testing/'))

/**
 * APIs de navigateur. Ancrees pour eviter les homonymes : `history.map` sur un
 * tableau de conversation est un faux positif mesure, `document.` ne l'est pas.
 */
const NAVIGATEUR =
  /\blocalStorage\b|\bsessionStorage\b|\bdocument\s*\.\s*(?:getElementById|querySelector|createElement|cookie|body|head)\b|\bwindow\s*\.\s*\w+|\bnavigator\s*\.\s*\w+|\bIndexedDB\b/

/**
 * DEROGATIONS, chacune avec sa raison ECRITE et sa portee.
 *
 * Une derogation dit « ce fichier depend du navigateur ET c'est acceptable » ;
 * elle n'efface pas la dependance, elle la rend lisible.
 */
const DEROGATIONS: Record<string, string> = {
  'src/lib/shop/buyerNonce.ts':
    "identifiant d'acheteur cote client, volontairement stocke dans le navigateur. Le SERVEUR ne le lit jamais depuis le stockage : `shop/checkout` le recoit comme PARAMETRE OPAQUE et le compose avec son propre etat commercial (checkoutSignature.ts). Un client natif fournirait son propre identifiant stable par appareil sans qu'une ligne de serveur change — la dependance est cote emetteur, pas cote contrat.",
  'src/lib/translations/index.tsx':
    "detection de langue et persistance du choix, purement presentationnelles. Aucune regle metier n'en depend : `mode`, sous-type, admission, prix et checkout sont tous decides sans consulter ce module.",
}

describe('AUDIT GLOBAL — la couche metier reste consommable hors navigateur', () => {
  const fautifs = METIER.filter((f) => {
    if (f in DEROGATIONS) return false
    const code = readFileSync(join(RACINE, f), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ')
    return NAVIGATEUR.test(code)
  })

  it('aucune API de navigateur dans `src/lib/` ni `src/app/api/`', () => {
    expect(
      fautifs,
      'fichier(s) de la couche metier dependant du navigateur :\n  ' +
        fautifs.join('\n  ') +
        "\n\nCe n'est pas une interdiction de principe : c'est la frontiere qui permet a un client NON-navigateur (application native, service, tache planifiee) de consommer ces regles sans les reimplementer." +
        "\n\nCONDUITE A TENIR — l'un ou l'autre :\n  · deplacez la dependance vers la couche de presentation (src/components/, src/app/sites/, src/app/edit/) ;\n  · ou inscrivez le fichier dans DEROGATIONS avec la raison, si la dependance est cote EMETTEUR et non cote CONTRAT."
    ).toEqual([])
  })

  it('le denominateur est reel — un ensemble vide passerait aussi', () => {
    expect(METIER.length).toBeGreaterThan(100)
  })

  it('chaque derogation porte une raison ET existe sur disque', () => {
    for (const [f, raison] of Object.entries(DEROGATIONS)) {
      expect(raison.trim().length, `${f} : raison trop courte`).toBeGreaterThan(80)
      expect(METIER, `${f} : declare mais absent de la couche metier`).toContain(f)
    }
  })

  it('une derogation devenue sans objet est signalee', () => {
    // Meme cliquet que l'allowlist des lecteurs de mode : une exemption qui ne
    // s'applique plus est le symptome d'un detecteur qui a perdu la vue.
    const mortes = Object.keys(DEROGATIONS).filter((f) => {
      const code = readFileSync(join(RACINE, f), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ')
      return !NAVIGATEUR.test(code)
    })
    expect(mortes, `derogation(s) sans objet : ${mortes.join(', ')}`).toEqual([])
  })
})

describe('AUDIT GLOBAL — l’authentification des routes API ne depend pas du navigateur', () => {
  const ROUTES = METIER.filter((f) => f.startsWith('src/app/api/') && f.endsWith('/route.ts'))

  it('aucune route API ne lit de COOKIE — le jeton Bearer est le seul porteur d’identite', () => {
    // Une dependance au cookie enfermerait l'authentification dans le
    // navigateur : un client natif ne pourrait pas la reproduire proprement.
    const avecCookie = ROUTES.filter((f) => {
      const code = readFileSync(join(RACINE, f), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ')
      // ANCRE SUR L'ACCES, PAS SUR LE RECEVEUR. Une mutation a survecu parce
      // que le motif exigeait `req.cookies` : `(req as any).cookies` -- la
      // forme la plus courante du depot pour contourner un type -- passait au
      // travers. Meme angle mort que le cliquet de projection (chaine D).
      return /\bcookies\s*\(\s*\)|\.\s*cookies\b|get\s*\(\s*['"]cookie['"]/i.test(code)
    })
    expect(avecCookie, `route(s) dependant d'un cookie : ${avecCookie.join(', ')}`).toEqual([])
  })

  it('le denominateur des routes est reel', () => {
    expect(ROUTES.length).toBeGreaterThan(50)
  })
})
