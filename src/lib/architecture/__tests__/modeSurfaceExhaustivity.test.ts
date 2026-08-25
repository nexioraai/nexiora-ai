import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'fs'
import { join, relative, sep } from 'path'
import { DOMAIN_REGISTRY } from '../domainRegistry'

// ============================================================
// ÉTAPE B — CLIQUET D'EXHAUSTIVITÉ PAR SURFACE DE DÉCISION.
//
// CE QUE LES EXHAUSTIVITÉS EXISTANTES NE POUVAIENT PAS VOIR. Elles sont
// indexées par RÉPERTOIRE — huit en tout (lib/cj, lib/mode2, lib/mode3,
// lib/order-domain, lib/suppliers, lib/commerce-admission, api/shop/checkout,
// api/shop/cancel-order). `src/app/sites/[slug]/themes/` n'en fait pas partie :
// ses 37 fichiers étaient STRUCTURELLEMENT invisibles. C'est ainsi que
// `modeCapabilities.ts` a pu porter une seconde définition de « ce site
// commerce » (étape A) et `CartDrawer.tsx` une frontière de facturation
// anonyme (étape C), sans qu'aucun test ne bronche. Le mécanisme fonctionnait ;
// il ne regardait simplement pas là.
//
// CE CLIQUET INVERSE L'INDEX : le dénominateur est le DISQUE, pas une liste de
// répertoires. Un fichier créé demain qui lit `sites.mode` est détecté parce
// qu'il existe, et échoue tant qu'il n'est pas classé.
//
// DEUX NIVEAUX, ET C'EST LEUR ARTICULATION QUI FAIT LA GARANTIE :
//   NIVEAU 1 — tout LECTEUR doit être déclaré dans un domaine OU inscrit dans
//              l'allowlist ci-dessous, avec une raison, sous un plafond.
//   NIVEAU 2 — tout DÉCIDEUR doit être déclaré dans un domaine. L'allowlist
//              du niveau 1 NE DISPENSE JAMAIS du niveau 2.
// Un fichier transitif aujourd'hui allowlisté qui se mettrait à décider échoue
// donc immédiatement, sans que personne ait à toucher l'allowlist.
//
// CE QUE CE CLIQUET NE FAIT PAS. Il ne juge pas la qualité d'une décision : il
// exige seulement qu'elle soit VISIBLE. Les règles de forme vivent dans les
// domaines (voir SITE_MODE_ACQUISITION_RULES) et ferment les voies
// d'acquisition qu'aucun motif textuel ne voit — `const m = site.mode` puis
// `m === 3`. Les deux se complètent ; aucun ne suffit seul.
// ============================================================

const RACINE = join(__dirname, '../../../..')
const SRC = join(RACINE, 'src')

/**
 * Le code UTILE : commentaires ET littéraux de chaîne retirés.
 *
 * Le retrait des chaînes n'est pas cosmétique. Sans lui, les quatre fichiers
 * de traduction entrent dans le dénominateur parce qu'ils contiennent la clé
 * `'home.mode.website'` — quatre faux positifs, mesurés. Et le registre
 * lui-même se dénoncerait, sa prose citant `s.mode === 3` dans une raison.
 */
export function codeUtile(source: string): string {
  return (
    source
      // NORMALISATION AVANT TOUT RETRAIT. `site['mode']` est un accès de
      // propriété déguisé en chaîne : le retirer avec les autres littéraux
      // rendrait cette voie INVISIBLE — mesuré, le test du détecteur l'a
      // signalé. On la ramène donc à sa forme pointée d'abord.
      .replace(/\[\s*(['"`])mode\1\s*\]/g, '.mode')
  )
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/`(?:[^`\\]|\\.)*`/g, ' `` ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, " '' ")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, ' "" ')
}

/** Ce fichier touche-t-il un champ `mode` ? Volontairement large : le tri se fait après. */
const LECTURE = /\.\s*mode\b|\[\s*['"]mode['"]\s*\]|\{\s*mode\s*\}|\bmode\s*[=!<>]=?/
export function litLeMode(code: string): boolean {
  return LECTURE.test(code)
}

/**
 * Ce fichier DÉRIVE-t-il une règle du mode ?
 *
 * AGNOSTIQUE DU RECEVEUR, délibérément. Les règles du registre sont ancrées
 * sur `site.mode` ; or les décideurs réels écrivent aussi `s.mode`,
 * `data.mode`, ou `mode` tout court après destructuration. Un détecteur
 * ancré n'en aurait vu que 4 sur 11 — mesuré.
 *
 * La comparaison doit porter sur un NOMBRE : `sites.mode` est un smallint.
 * Tous les homonymes du dépôt (`mode === 'signup'`, `mode === 'up'`,
 * `obj.mode === 'payment'`) comparent des chaînes et sont donc écartés.
 */
const DECISION =
  /\bmode\b\s*\)?\s*(?:[=!]==?|[<>]=?)\s*-?\d|\bswitch\s*\([^)]*\bmode\b|\.(?:includes|indexOf|has)\s*\([^)]*\bmode\b/
export function decideSurLeMode(code: string): boolean {
  return DECISION.test(code)
}

function fichiersSource(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      if (e === '__tests__' || e === 'node_modules') continue
      out.push(...fichiersSource(p))
    } else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) {
      out.push(p)
    }
  }
  return out
}

const DECLARES = new Set(DOMAIN_REGISTRY.flatMap((d) => d.ownedFiles))

/**
 * LECTEURS TRANSITIFS — ils touchent un champ `mode` sans en dériver de règle.
 *
 * Chaque ligne porte SA raison. Une entrée sans justification est une
 * exemption silencieuse ; c'est précisément ce que ce fichier existe pour
 * empêcher. Et l'inscription ici NE DISPENSE PAS du niveau 2 : qu'un de ces
 * fichiers se mette à décider, et il échoue.
 */
const LECTEURS_TRANSITIFS: Record<string, string> = {
  // — le mode est LU puis PASSÉ, jamais comparé —
  'src/app/api/chat/route.ts': 'écrit `mode` à la création du site ; ne dérive aucune règle de sa valeur.',
  'src/app/api/shop/connect/route.ts': 'délègue l’admission à canTransact() ; ne lit le mode que pour la lui passer.',
  'src/app/api/shop/products/route.ts': 'idem — canTransact() décide, la route transmet.',
  'src/app/api/shop/shipping/calculate/route.ts': 'idem — canTransact() décide, la route transmet.',
  'src/app/api/shop/shipping/route.ts': 'idem — canTransact() décide, la route transmet.',
  'src/app/api/shop/upload-design/route.ts': 'idem — canTransact() décide, la route transmet.',
  'src/lib/auth/require-product-owner.ts': 'idem — canTransact() décide, la primitive transmet.',
  'src/app/sites/[slug]/produits/[id]/fetchProduct.ts': 'recopie `mode` dans l’objet de page ; aucune branche.',
  'src/app/sites/[slug]/produits/[id]/page.tsx': 'passe `mode` en prop à CartShell ; aucune branche.',
  'src/app/sites/[slug]/themes/CartShell.tsx': 'passe `mode` à getModeCapabilities() et à CartDrawer ; la décision est ailleurs (étape A).',
  'src/app/sites/[slug]/themes/CartDrawer.tsx': 'consomme les capacités de getModeCapabilities() ; ne compare plus aucun mode (étape C).',

  // — HOMONYMES : le jeton `mode` y désigne autre chose que `sites.mode` —
  'src/app/login/page.tsx': 'homonyme — `mode` y vaut « signup » ou « login », un état de formulaire.',
  'src/lib/pricing.ts': 'homonyme — `mode` y vaut « up » ou « down », un mode d’arrondi.',
  'src/app/api/stripe/webhook/route.ts': 'homonyme — `session.mode` est un champ Stripe (« payment »), pas le mode du site.',

  // — le registre lui-même —
  'src/lib/architecture/domainRegistry.ts': 'porte les MOTIFS de détection ; il décrit les frontières, il n’en franchit aucune.',
}

/**
 * PLAFOND. Il ne protège pas d'un ajout : il le rend VISIBLE. Élargir
 * l'allowlist devient un acte délibéré, lisible en diff, qu'une revue peut
 * refuser — au lieu d'une ligne de plus qui passe inaperçue.
 */
const PLAFOND_ALLOWLIST = 16

const TOUS = fichiersSource(SRC)
const rel = (p: string) => relative(RACINE, p).split(sep).join('/')

type Fiche = { chemin: string; decide: boolean; declare: boolean; allowliste: boolean }
const LECTEURS: Fiche[] = TOUS.map((p) => {
  const code = codeUtile(readFileSync(p, 'utf-8'))
  return { p, code }
})
  .filter(({ code }) => litLeMode(code))
  .map(({ p, code }) => {
    const chemin = rel(p)
    return {
      chemin,
      decide: decideSurLeMode(code),
      declare: DECLARES.has(chemin),
      allowliste: chemin in LECTEURS_TRANSITIFS,
    }
  })

const DECIDEURS = LECTEURS.filter((f) => f.decide)

describe('ÉTAPE B — NIVEAU 1 : tout lecteur de `sites.mode` est classé', () => {
  it('aucun lecteur n’échappe au registre ET à l’allowlist', () => {
    const orphelins = LECTEURS.filter((f) => !f.declare && !f.allowliste).map((f) => f.chemin)
    expect(
      orphelins,
      `fichier(s) lisant \`sites.mode\` sans appartenir à un domaine NI à l'allowlist des lecteurs transitifs :\n  ${orphelins.join(
        '\n  '
      )}\n\nCONDUITE À TENIR — l'un ou l'autre, jamais rien :\n  · le fichier DÉRIVE une règle du mode -> déclarez-le dans DOMAIN_REGISTRY.ownedFiles ;\n  · il ne fait que TRANSPORTER la valeur -> inscrivez-le dans LECTEURS_TRANSITIFS avec sa raison.\nUne exemption sans raison écrite est exactement ce que ce test existe pour empêcher.`
    ).toEqual([])
  })

  it('le dénominateur est réel et non vide — sinon ce test ne prouverait rien', () => {
    expect(TOUS.length).toBeGreaterThan(200)
    expect(LECTEURS.length).toBeGreaterThan(20)
  })

  it('l’allowlist reste sous son plafond', () => {
    const n = Object.keys(LECTEURS_TRANSITIFS).length
    expect(
      n,
      `l'allowlist compte ${n} entrées pour un plafond de ${PLAFOND_ALLOWLIST}. L'élargir est une décision, pas une formalité : justifiez chaque ajout, ou déclarez le fichier dans un domaine.`
    ).toBeLessThanOrEqual(PLAFOND_ALLOWLIST)
  })

  it('chaque entrée de l’allowlist porte une raison ET existe sur disque', () => {
    for (const [chemin, raison] of Object.entries(LECTEURS_TRANSITIFS)) {
      expect(raison.trim().length, `${chemin} : raison vide`).toBeGreaterThan(20)
      expect(TOUS.map(rel), `${chemin} : déclaré mais absent du disque`).toContain(chemin)
    }
  })
})

describe('ÉTAPE B — NIVEAU 2 : tout décideur est déclaré dans un domaine', () => {
  it('aucun décideur ne reste hors registre — l’allowlist n’y dispense pas', () => {
    const hors = DECIDEURS.filter((f) => !f.declare).map((f) => f.chemin)
    expect(
      hors,
      `fichier(s) DÉRIVANT une règle de \`sites.mode\` sans appartenir à un domaine :\n  ${hors.join(
        '\n  '
      )}\n\nCONDUITE À TENIR : déclarez-le dans DOMAIN_REGISTRY.ownedFiles. L'inscrire dans LECTEURS_TRANSITIFS ne suffit PAS — c'est précisément le contournement que ce niveau interdit.`
    ).toEqual([])
  })

  it('il existe réellement des décideurs — un ensemble vide passerait aussi', () => {
    // PLANCHER, PAS CIBLE. Ce nombre DIMINUE à mesure que les décisions sont
    // nommées : l'étape 2 en a retiré deux (les gardes catalogue passent par
    // `hasSupplierCatalog`). Le fixer haut le ferait rougir à chaque progrès,
    // ce qui punirait le travail au lieu de le protéger. Ce qu'il garde, c'est
    // que l'ensemble ne soit pas VIDE — sinon l'assertion du niveau 2 passerait
    // sans rien constater. La garantie réelle est au-dessus : tout décideur,
    // quel que soit leur nombre, doit être déclaré.
    expect(DECIDEURS.length).toBeGreaterThanOrEqual(1)
  })

  it('les deux domaines de l’étape B couvrent bien 13 fichiers', () => {
    const d = (id: string) => DOMAIN_REGISTRY.find((x) => x.id === id)!
    // ETAPE 2 -- 6 depuis que `catalog/search` interroge `hasSupplierCatalog` :
    // il est devenu un lecteur, donc une surface a declarer.
    // CHANTIER 6 -- 8 : `catalog/enhance` et `catalog/selections` posent
    // desormais la meme question par la meme primitive. Le compte MONTE ici
    // alors que le PLANCHER des decideurs bruts baisse : ce n'est pas une
    // contradiction, c'est exactement le mouvement recherche -- une decision
    // qui cesse d'etre implicite devient une surface nommee et declaree.
    expect(d('site-mode-decision-surfaces').ownedFiles).toHaveLength(8)
    expect(d('human-ui-mode-display').ownedFiles).toHaveLength(5)
  })

  it('les 8 surfaces hors UI sont CONTRAINTES, les 5 UI seulement DÉCLARÉES', () => {
    const d = (id: string) => DOMAIN_REGISTRY.find((x) => x.id === id)!
    // Ampleur décidée : déclarer les dix, ne contraindre que les cinq
    // premières. Une comparaison de mode dans l'UI humaine est un choix
    // d'affichage, pas une frontière.
    expect(d('site-mode-decision-surfaces').forbiddenPatterns.length).toBeGreaterThanOrEqual(4)
    expect(d('human-ui-mode-display').forbiddenPatterns).toEqual([])
  })
})

describe('ÉTAPE B — le détecteur lui-même est éprouvé', () => {
  const VUES: [string, string][] = [
    ['comparaison directe', 'if (site.mode === 4) { vendre() }'],
    ['comparaison négative', 'if (site.mode !== 1) { vendre() }'],
    ['égalité faible', 'if (site.mode == 2) { a() }'],
    ['inégalité faible', 'if (site.mode != 2) { a() }'],
    ['ordinale', 'if (site.mode > 1) { vendre() }'],
    ['destructuration', 'const { mode } = site; if (mode === 2) { forfait() }'],
    ['alias de variable', 'const m = site.mode; if (m === 2) { forfait() }'],
    ['alias du site', 'const s = site; if (s.mode === 3) { devis() }'],
    ['switch', 'switch (site.mode) { case 2: forfait(); break }'],
    ['includes', 'if ([2, 3].includes(site.mode)) { vendre() }'],
    ['indexOf', 'if (MODES.indexOf(site.mode) >= 0) { vendre() }'],
    ['has', 'if (ADMIS.has(site.mode)) { vendre() }'],
    ['ternaire', 'const f = site.mode === 2 ? a : b'],
    ['accès par crochets', "if (site['mode'] === 2) { forfait() }"],
    ['coercition', 'if (Number(site.mode) === 2) { forfait() }'],
  ]

  for (const [nom, src] of VUES) {
    it(`détecté comme LECTURE : ${nom}`, () => {
      expect(litLeMode(codeUtile(src))).toBe(true)
    })
  }

  it('les formes qui DÉCIDENT sont reconnues comme telles', () => {
    // `const m = site.mode` seul n'est pas une décision : c'est une
    // ACQUISITION. Elle est fermée par MODE_RULE_EXTRACTION, dans le domaine,
    // pas ici — chaque mécanisme sur son terrain.
    const decideurs = VUES.filter(([nom]) => nom !== 'alias de variable')
    for (const [nom, src] of decideurs) {
      expect(decideSurLeMode(codeUtile(src)), nom).toBe(true)
    }
  })

  it('CONTRÔLE POSITIF — un fichier fictif non classé serait bien signalé', () => {
    const invente = codeUtile('export function f(site: any) { return site.mode === 2 }')
    expect(litLeMode(invente)).toBe(true)
    expect(decideSurLeMode(invente)).toBe(true)
    expect(DECLARES.has('src/inexistant/nouveau.ts')).toBe(false)
    expect('src/inexistant/nouveau.ts' in LECTEURS_TRANSITIFS).toBe(false)
  })

  it('CONTRÔLE NÉGATIF — un fichier sans lecture du mode ne déclenche rien', () => {
    const propre = codeUtile('export function total(a: number, b: number) { return a + b }')
    expect(litLeMode(propre)).toBe(false)
    expect(decideSurLeMode(propre)).toBe(false)
  })

  it('les COMMENTAIRES ne comptent pas', () => {
    expect(litLeMode(codeUtile('// if (site.mode === 3) { … }'))).toBe(false)
    expect(litLeMode(codeUtile('/* site.mode === 3 */'))).toBe(false)
  })

  it('les LITTÉRAUX DE CHAÎNE ne comptent pas — sinon les traductions entrent', () => {
    expect(litLeMode(codeUtile("const t = { 'home.mode.website': 'Site web' }"))).toBe(false)
    expect(litLeMode(codeUtile('const r = "s.mode === 3"'))).toBe(false)
    expect(litLeMode(codeUtile('const g = `mode === 2`'))).toBe(false)
  })

  it('les HOMONYMES ne sont jamais des décideurs', () => {
    for (const src of ["if (mode === 'signup') {}", "if (mode === 'up') {}", "if (obj.mode === 'payment') {}"]) {
      expect(decideSurLeMode(codeUtile(src)), src).toBe(false)
    }
  })
})

// ============================================================
// ÉTAPE 4 — CE QUE R4 FERME, ET CE QUE R1 NE PEUT PAS FERMER.
//
// R4 (`MODE_RULE_TRUTHINESS`) était retenue à l'étape B parce que deux
// fichiers la violaient : `catalog/curate` et `catalog/image-search`
// écrivaient tous deux `if (site.mode !== 3)`. L'étape 2 a remplacé cette
// comparaison par `hasSupplierCatalog(site.mode)` ; les deux violations ont
// disparu, et la règle est désormais réellement appliquée.
//
// R1 (`MODE_RULE_COMPARISON`) reste dehors, et c'est un CONSTAT MESURÉ, pas
// une tolérance. Ses cinq dernières occurrences sont des caractères ÉCHAPPÉS
// dans le template `systemPrompt` : le fichier contient un dollar échappé,
// donc du TEXTE, jamais une interpolation. La règle y verrait du prompt qui
// ressemble à du code. Ces tests verrouillent les deux moitiés de ce constat.
// ============================================================

describe('ÉTAPE 4 — R4 est réellement appliquée', () => {
  const domaine = DOMAIN_REGISTRY.find((d) => d.id === 'site-mode-decision-surfaces')!
  const R4 = /\bsite\.mode\s*\?(?!\?)|\bif\s*\(\s*!?\s*site\.mode\b/
  const R1 = /\bsite\.mode\s*(===|!==|==|!=|>=|<=|>|<)|(===|!==|==|!=|>=|<=|>|<)\s*site\.mode\b/
  const sansCommentaires = (f: string) =>
    readFileSync(join(RACINE, f), 'utf-8')
      .split('\n')
      .filter((l) => !/^(\/\/|\*|\/\*)/.test(l.trim()))
      .join('\n')

  it('la règle figure bien dans le jeu appliqué au domaine', () => {
    const motifs = domaine.forbiddenPatterns.map((r) => r.pattern.toString())
    expect(motifs).toContain(R4.toString())
    // 6 depuis que l'étape 4 y a ajouté MODE_RULE_COMPARISON.
    expect(domaine.forbiddenPatterns).toHaveLength(6)
  })

  it('AUCUN fichier du domaine ne la viole — elle est tenue, pas décorative', () => {
    for (const f of domaine.ownedFiles) {
      expect(R4.test(sansCommentaires(f)), `${f} viole R4`).toBe(false)
    }
  })

  it('les deux violations de l’étape B ont bien disparu', () => {
    for (const f of ['src/app/api/catalog/curate/route.ts', 'src/app/api/catalog/image-search/route.ts']) {
      const code = sansCommentaires(f)
      expect(R4.test(code), f).toBe(false)
      expect(code, `${f} passe désormais par la primitive`).toContain('hasSupplierCatalog(site.mode)')
    }
  })
})

describe('ÉTAPE 4 — R1 est désormais APPLIQUÉE, et tenue', () => {
  // CE BLOC A CHANGÉ DE CAMP, ET C'ÉTAIT SA FONCTION. Il constatait que R1
  // restait dehors parce que ses cinq occurrences étaient du TEXTE DE PROMPT
  // ÉCHAPPÉ. L'évaluation réelle du prompt avec Node a montré que cet
  // échappement était un DÉFAUT : l'agent recevait les cinq guidances au lieu
  // de la sienne. La décision a été extraite dans `modeGuidance.ts`, la route
  // ne compare plus rien, et la règle peut enfin être appliquée pour de bon.
  const domaine = DOMAIN_REGISTRY.find((d) => d.id === 'site-mode-decision-surfaces')!
  const R1 = /\bsite\.mode\s*(===|!==|==|!=|>=|<=|>|<)|(===|!==|==|!=|>=|<=|>|<)\s*site\.mode\b/
  const sansCommentaires = (f: string) =>
    readFileSync(join(RACINE, f), 'utf-8')
      .split('\n')
      .filter((l) => !/^(\/\/|\*|\/\*)/.test(l.trim()))
      .join('\n')

  it('la règle figure dans le jeu appliqué au domaine', () => {
    expect(domaine.forbiddenPatterns.map((r) => r.pattern.toString())).toContain(R1.toString())
    expect(domaine.forbiddenPatterns).toHaveLength(6)
  })

  it('AUCUN fichier du domaine ne la viole — y compris la route de l’agent', () => {
    for (const f of domaine.ownedFiles) {
      expect(R1.test(sansCommentaires(f)), `${f} viole R1`).toBe(false)
    }
  })

  it('les cinq occurrences ont bien QUITTÉ la route pour une primitive', () => {
    const route = sansCommentaires('src/app/api/agent/[slug]/chat/route.ts')
    expect(route).toContain('guidanceForSite(site.mode, site.dropship_type)')
    expect(route).not.toMatch(/site\.mode === [0-9]/)
  })
})

describe('ÉTAPE B — les mécanismes existants ne sont pas affaiblis', () => {
  it('les 8 répertoires historiques restent couverts par leurs propres exhaustivités', () => {
    // Ce cliquet AJOUTE un cinquième mécanisme ; il ne remplace aucun des
    // quatre blocs par répertoire de mode2Mode3Boundaries.test.ts.
    for (const id of [
      'mode-3-supplier-domain',
      'mode-2-merchant-domain',
      'order-domain-frontier',
      'checkout-domain-selection',
      'order-cancellation',
      'mode-1-showcase-domain',
    ]) {
      expect(DOMAIN_REGISTRY.some((d) => d.id === id), id).toBe(true)
    }
  })

  it('les domaines des étapes A et C sont intacts', () => {
    const a = DOMAIN_REGISTRY.find((d) => d.id === 'mode-1-shop-surface')!
    expect(a).toBeDefined()
    expect(a.ownedFiles).toContain('src/app/sites/[slug]/themes/modeCapabilities.ts')
  })
})
