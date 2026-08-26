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

/**
 * Ce fichier touche-t-il un champ `mode` ? Volontairement large : le tri se fait après.
 *
 * DEBT-054 — CE DÉTECTEUR NE VOYAIT QUE LA FORME QUE L'ARCHITECTURE INTERDIT.
 *
 * Les quatre alternatives d'origine reconnaissaient le mode uniquement sous la
 * forme d'un accès à un champ nommé LITTÉRALEMENT `mode` (`site.mode`,
 * `site['mode']`, `{ mode }`) ou d'une comparaison portant sur un identifiant
 * nommé exactement `mode`. Or `SITE_MODE_ACQUISITION_RULES` INTERDIT ces
 * formes dans le domaine contraint : la doctrine exige que le mode soit reçu
 * en PARAMÈTRE (`siteMode`). Les deux mécanismes se contredisaient — plus un
 * fichier respectait le registre, plus il devenait invisible au cliquet censé
 * garantir qu'aucun fichier n'échappe.
 *
 * MESURE, PAS DÉDUCTION. Trois sondes de sémantique STRICTEMENT identique,
 * écrites puis supprimées :
 *   `site.mode === 3`          -> NIVEAU 1 et NIVEAU 2 rouges  (détecté)
 *   `siteMode === 3`           -> 37/37 verts                  (INVISIBLE)
 *   `SONDE_MODES.has(siteMode)`-> 37/37 verts                  (INVISIBLE)
 * Conséquence mesurée : 0 des 6 AUTORITÉS de mode du dépôt était détectée.
 * `canTransact`, `catalogAdmission`, `subtypeAdmission`, `order-domain/resolve`
 * n'étaient dans le registre que parce qu'un humain les y avait inscrites ;
 * `toolCapabilities` et `modeGuidance` n'y étaient pas du tout.
 *
 * TROIS COUCHES AJOUTÉES :
 *   1. l'appartenance sur identifiant NU — `SET.has(siteMode)`, `MAP.get(x)`.
 *      C'est la couche dominante : elle seule rendait les autorités invisibles.
 *   2. la casse — `\w*[Mm]ode` couvre `siteMode`, `finalMode`, `chosenMode`.
 *   3. l'accès de propriété camelCase — `body.chosenMode`.
 *   4. le `switch` sur identifiant nu — `switch (siteMode)`. TROUVÉE PAR LE
 *      TEST DE CE BLOC, pas par l'analyse : DECISION connaissait déjà cette
 *      forme, LECTURE non. Comme `DECIDEURS = LECTEURS.filter(decide)`, un
 *      fichier dont le seul usage du mode était un `switch` camelCase
 *      n'atteignait JAMAIS le niveau 2. Seconde voie d'échappement, fermée.
 *   5. la CONSULTATION D'UNE AUTORITÉ de mode — `canTransact(mode)`,
 *      `getModeCapabilities(mode)`. TROISIÈME voie, trouvée par un balayage
 *      indépendant de tout `src/`. Un composant qui reçoit le mode en prop
 *      (`{ slug, primary, mode, labels }`) et le passe à l'autorité sans
 *      jamais le comparer ne présentait AUCUNE forme détectable : ni point,
 *      ni comparaison, ni `{ mode }` isolé. Mesuré : 6 fichiers dans ce cas,
 *      dont `PromoBanner.tsx` qui n'était classé nulle part.
 *
 *      LISTE NOMMÉE, PAS UN MOTIF GÉNÉRIQUE. Seules y figurent les autorités
 *      qui reçoivent LE MODE DU SITE. `showsVisitorCatalogSearch` en est
 *      volontairement absente : elle tranche sur `dropship_type`, et
 *      l'inclure faisait entrer son propre fichier de définition — un faux
 *      positif mesuré, écarté.
 *
 * LARGE ICI, PRÉCIS AU NIVEAU DÉCISION. Élargir la LECTURE fait entrer un
 * homonyme (`roundMode`), et c'est assumé : le cliquet est fail-closed, le tri
 * se fait par une raison ÉCRITE dans LECTEURS_TRANSITIFS — section HOMONYMES,
 * où `session.mode` de Stripe siège déjà. Un déni-liste dans le motif serait
 * l'inverse : fail-open, et silencieux. Ce qui ne doit JAMAIS admettre
 * d'homonyme, c'est DECISION — vérifié juste en dessous.
 */
const LECTURE =
  /\.\s*\w*[Mm]ode\b|\[\s*['"]mode['"]\s*\]|\{\s*mode\s*\}|\b\w*[Mm]ode\s*[=!<>]=?|\.(?:includes|indexOf|has|get)\s*\([^)]*\b\w*[Mm]ode\b|\bswitch\s*\([^)]*\b\w*[Mm]ode\b|\b(?:canTransact|getModeCapabilities|hasSupplierCatalog|usesCatalogSelections|toolNamesForSite|guidanceForSite|resolveFulfillmentDomain)\s*\(/
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
/*  DEBT-054 — DEUX ÉCHAPPEMENTS SUPPLÉMENTAIRES, MESURÉS.
 *
 *  `.get()` manquait : `GUIDANCE_PAR_MODE.get(siteMode)` sélectionne une
 *  guidance par le mode — c'est une dérivation de règle, pas un transport.
 *
 *  La comparaison à une CONSTANTE NOMMÉE manquait : la contrainte `-?\d`
 *  exigeait un chiffre littéral, si bien que `siteMode === SUPPLIER_SITE_MODE`
 *  (order-domain/resolve) et `siteMode === SUPPLIER_GUIDANCE_MODE`
 *  (modeGuidance) passaient pour de simples lectures. Nommer sa constante —
 *  ce que le dépôt encourage — rendait la décision invisible.
 *
 *  `[A-Z][A-Z0-9_]{2,}` est sûr parce que `codeUtile` a DÉJÀ retiré les
 *  chaînes : `mode === 'signup'` est devenu `mode ===  ''`, jamais des
 *  majuscules. Les trois homonymes du dépôt restent donc écartés — le test
 *  « les HOMONYMES ne sont jamais des décideurs » le vérifie, et le test
 *  « un homonyme camelCase n'est jamais un décideur » l'étend à `roundMode`. */
const DECISION =
  /\b\w*[Mm]ode\b\s*\)?\s*(?:[=!]==?|[<>]=?)\s*(?:-?\d|[A-Z][A-Z0-9_]{2,})|\bswitch\s*\([^)]*\b\w*[Mm]ode\b|\.(?:includes|indexOf|has|get)\s*\([^)]*\b\w*[Mm]ode\b/
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
  // DEBT-054 — ENTRÉE RETIRÉE : SA RAISON ÉTAIT FACTUELLEMENT FAUSSE.
  //
  // Elle affirmait « ne dérive aucune règle de sa valeur ». Le fichier contient
  // `knownMode === 2 || knownMode === 3`, `parsedMode === 2 || parsedMode === 3`,
  // `finalMode === 2 || finalMode === 3` et `finalMode === 3` trois fois. Il
  // dérive donc des règles, et l'exemption disait l'inverse de ce que le code
  // fait. Le détecteur ne pouvait pas la contredire : il était aveugle au
  // camelCase. `src/app/api/chat/route.ts` est désormais DÉCLARÉ dans
  // `site-mode-decision-surfaces`, où le niveau 2 le tient.
  'src/app/api/shop/connect/route.ts': 'délègue l’admission à canTransact() ; ne lit le mode que pour la lui passer.',
  'src/app/api/shop/products/route.ts': 'idem — canTransact() décide, la route transmet.',
  'src/app/api/shop/shipping/calculate/route.ts': 'idem — canTransact() décide, la route transmet.',
  'src/app/api/shop/shipping/route.ts': 'idem — canTransact() décide, la route transmet.',
  'src/app/api/shop/upload-design/route.ts': 'idem — canTransact() décide, la route transmet.',
  'src/lib/auth/require-product-owner.ts': 'idem — canTransact() décide, la primitive transmet.',
  'src/app/api/shop/promo/active/route.ts': 'fermeture Mode 1 volet 2 — idem : canTransact() décide qu’une vitrine ne sert aucun code promo, la route transmet.',
  'src/app/api/shop/promo/validate/route.ts': 'fermeture Mode 1 volet 2 — idem : canTransact() décide, la route transmet ; la garde précède l’écriture dans checkout_anomalies.',
  'src/app/api/agent/[slug]/apply/route.ts': 'fermeture Mode 1 volet 1 — lit `mode` et `dropship_type` pour les passer à toolNamesForSite() ; aucune comparaison de mode, la décision reste dans toolCapabilities.',
  'src/app/sites/[slug]/produits/[id]/fetchProduct.ts': 'LOT 2 — lit aussi `mode`/`dropship_type` pour interroger usesCatalogSelections() ; aucune comparaison, la décision reste dans catalogAdmission.',
  'src/app/sitemap.ts': 'LOT 2 — lit `mode`/`dropship_type` pour les passer à usesCatalogSelections() ; aucune branche, la décision reste dans catalogAdmission.',
  'src/app/sites/[slug]/produits/[id]/page.tsx': 'passe `mode` en prop à CartShell ; aucune branche.',
  'src/app/sites/[slug]/themes/CartShell.tsx': 'passe `mode` à getModeCapabilities() et à CartDrawer ; la décision est ailleurs (étape A).',
  'src/app/sites/[slug]/themes/CartDrawer.tsx': 'consomme les capacités de getModeCapabilities() ; ne compare plus aucun mode (étape C).',

  'src/app/sites/[slug]/themes/PromoBanner.tsx': 'DEBT-054 — reçoit `mode` en prop et le passe à canTransact() ; ne le compare jamais, la décision « ce site sert-il un code promo » reste dans l’autorité.',
  'src/lib/generationFailures.ts': 'DEBT-054 — journalise `requested_mode` dans la table des échecs ; transport pur, aucune branche ne dépend de sa valeur.',

  // — HOMONYMES : le jeton `mode` y désigne autre chose que `sites.mode` —
  'src/app/login/page.tsx': 'homonyme — `mode` y vaut « signup » ou « login », un état de formulaire.',
  // LOT 6 / CHAINE E -- ENTREE RETIREE : elle ne s'appliquait JAMAIS.
  // `src/lib/pricing.ts` est declare dans `ownedFiles` du domaine
  // shop/pricing ; NIVEAU 1 le classait donc par `declare`, et cette ligne
  // etait du poids mort qui consommait une place sous le plafond. Trouvee par
  // l'audit agressif final, pas par le cliquet -- d'ou le test de
  // non-chevauchement ajoute ci-dessous, qui l'aurait trouvee.
  'src/app/api/stripe/webhook/route.ts': 'homonyme — `session.mode` est un champ Stripe (« payment »), pas le mode du site.',
  'src/components/edit/CatalogSelections.tsx': 'DEBT-054 — homonyme camelCase : `roundMode` y vaut « up » ou « down », un mode d’arrondi de prix ; le composant ne lit jamais `sites.mode`.',

  // — le registre lui-même —
  'src/lib/architecture/domainRegistry.ts': 'porte les MOTIFS de détection ; il décrit les frontières, il n’en franchit aucune.',
}

/**
 * PLAFOND. Il ne protège pas d'un ajout : il le rend VISIBLE. Élargir
 * l'allowlist devient un acte délibéré, lisible en diff, qu'une revue peut
 * refuser — au lieu d'une ligne de plus qui passe inaperçue.
 */
// FERMETURE MODE 1, VOLETS 1 ET 2 — RELEVEMENT DELIBERE : 16 -> 18.
//
// Le plafond a joué exactement son rôle : il a fait de ces trois inscriptions
// un acte visible en diff au lieu de trois lignes passées inaperçues. Les
// trois relèvent du même patron déjà porté par six entrées existantes —
// `canTransact()` décide, la route transmet — et aucune ne DÉRIVE de règle du
// mode (niveau 2 le vérifie indépendamment, et l'allowlist n'en dispense pas).
//
// Ce n'est pas un affaiblissement du cliquet : c'est le mouvement recherché.
// Trois surfaces qui franchissaient une frontière SANS JAMAIS LIRE LE MODE
// (donc invisibles à ce cliquet, cf. DEBT-032) la posent désormais
// explicitement — elles deviennent des lecteurs déclarés. Le compte MONTE ici
// parce que le nombre de décisions implicites BAISSE.
// LOT 2 — RELEVEMENT DELIBERE : 18 -> 19.
//
// Une seule entree : `src/app/sitemap.ts`. Sa branche catalogue n'avait
// AUCUNE garde -- elle publiait aux moteurs toute selection approuvee, y
// compris celles d'un `pod_brand`, dont la vitrine refuse pourtant de les
// afficher et dont la fiche produit est desormais refusee. Elle lit donc
// maintenant `mode`/`dropship_type` pour les PASSER a `usesCatalogSelections`.
// Meme patron que les huit entrees existantes -- l'autorite decide, le
// fichier transmet -- et le niveau 2 le verifie independamment.
// DEBT-054 — RELEVEMENT DELIBERE : 19 -> 21, puis 21 -> 20 (chaine E).
//
// Bilan NET de +1 pour DEUX ajouts et UN retrait :
//   + `generationFailures.ts`  — transport pur de `requested_mode` ;
//   + `CatalogSelections.tsx`  — homonyme `roundMode`, revele par
//                                l'elargissement de LECTURE au camelCase ;
//   + `PromoBanner.tsx`        — transport pur vers canTransact(), revele par
//                                la couche « consultation d'autorite » ;
//   - `api/chat/route.ts`      — RETIRE, car sa raison etait fausse : il
//                                decide, il est donc passe au REGISTRE.
//
// Le mouvement est le bon : une exemption mensongere quitte l'allowlist pour
// un domaine contraint, et deux transports honnetes s'y declarent. Le cliquet
// a fait exactement son travail -- il a rendu l'operation visible en diff.
const PLAFOND_ALLOWLIST = 20

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

  it('CHAINE E — aucun fichier n’est à la fois DÉCLARÉ et ALLOWLISTÉ', () => {
    // « L'UN OU L'AUTRE, JAMAIS RIEN » dit le message du niveau 1 -- mais rien
    // n'interdisait LES DEUX. Mesure : `src/lib/pricing.ts` etait declare dans
    // un domaine ET allowliste ; son exemption ne s'appliquait jamais et
    // consommait une place sous le plafond. Une exemption qui ne peut pas
    // servir est une exemption qu'on ne relit plus.
    const doubles = Object.keys(LECTEURS_TRANSITIFS).filter((c) => DECLARES.has(c))
    expect(
      doubles,
      `fichier(s) declare(s) dans un domaine ET inscrit(s) dans l'allowlist :\n  ${doubles.join(
        '\n  '
      )}\nLa declaration suffit. Retirez l'entree d'allowlist : elle ne s'applique pas, et elle occupe une place sous le plafond.`
    ).toEqual([])
  })

  it('DEBT-054 — chaque entrée de l’allowlist est RÉELLEMENT un lecteur aujourd’hui', () => {
    // SANS CE TEST, UN RÉTRÉCISSEMENT DU DÉTECTEUR PASSE INAPERÇU. Mesuré :
    // retirer la couche « consultation d'autorité » de LECTURE ne faisait
    // rougir aucun test — `PromoBanner.tsx` cessait simplement d'être un
    // lecteur, et son exemption devenait une ligne morte qui n'accusait rien.
    // Une exemption qui ne s'applique plus à rien est le symptôme exact d'un
    // détecteur qui a perdu la vue.
    const lus = new Set(LECTEURS.map((f) => f.chemin))
    const morts = Object.keys(LECTEURS_TRANSITIFS).filter((c) => !lus.has(c))
    expect(
      morts,
      `exemption(s) devenue(s) sans objet : le détecteur ne voit plus ces fichiers comme lecteurs.\n  ${morts.join(
        '\n  '
      )}\nSoit le fichier a cessé de lire le mode — retirez l'entrée ; soit le DÉTECTEUR a régressé — c'est le cas grave.`
    ).toEqual([])
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

  it('les deux domaines de l’étape B couvrent bien 19 fichiers', () => {
    const d = (id: string) => DOMAIN_REGISTRY.find((x) => x.id === id)!
    // ETAPE 2 -- 6 depuis que `catalog/search` interroge `hasSupplierCatalog` :
    // il est devenu un lecteur, donc une surface a declarer.
    // CHANTIER 6 -- 8 : `catalog/enhance` et `catalog/selections` posent
    // desormais la meme question par la meme primitive. Le compte MONTE ici
    // alors que le PLANCHER des decideurs bruts baisse : ce n'est pas une
    // contradiction, c'est exactement le mouvement recherche -- une decision
    // qui cesse d'etre implicite devient une surface nommee et declaree.
    // DEBT-054 -- 12 : quatre decideurs reels que le detecteur ne voyait pas
    // (toolCapabilities, modeGuidance, onboarding, chat) sont declares.
    expect(d('site-mode-decision-surfaces').ownedFiles).toHaveLength(14)
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

  // ============================================================
  // DEBT-054 — LES FORMES QUE LE DÉTECTEUR NE VOYAIT PAS.
  //
  // Chacune de ces entrées correspond à une SONDE RÉELLE qui a survécu au
  // cliquet à l'état `4ce0d01` : le fichier existait, décidait, et les 37
  // tests restaient verts. Elles ne sont pas hypothétiques.
  //
  // Sans ce bloc, la correction des motifs ne serait protégée par RIEN : un
  // rétrécissement futur de LECTURE ou DECISION rouvrirait la brèche en
  // silence, exactement comme elle s'était ouverte.
  // ============================================================
  const FORMES_054: [string, string][] = [
    // — couche 1 : appartenance sur identifiant NU (la couche dominante) —
    ['appartenance Set sur paramètre', 'const A = new Set([2,3]); export function f(siteMode: unknown) { return A.has(siteMode) }'],
    ['appartenance Map sur paramètre', 'const G = new Map(); export function f(siteMode: unknown) { return G.get(siteMode) }'],
    ['appartenance tableau sur paramètre', 'export function f(chosenMode: number) { return [1,2,3].includes(chosenMode) }'],
    ['appartenance sur propriété camelCase', 'export function f(body: any) { return [1,2,3].includes(body.chosenMode) }'],
    // — couche 2 : la casse —
    ['comparaison camelCase à un littéral', 'export function f(siteMode: number) { return siteMode === 3 }'],
    ['comparaison camelCase ordinale', 'export function f(finalMode: number) { return finalMode > 1 }'],
    ['switch camelCase', 'export function f(siteMode: number) { switch (siteMode) { case 3: return 1 } }'],
    // — couche 3 : la comparaison à une constante NOMMÉE —
    ['comparaison à une constante nommée', 'const SUPPLIER_SITE_MODE = 3; export function f(siteMode: number) { return siteMode === SUPPLIER_SITE_MODE }'],
  ]

  for (const [nom, src] of FORMES_054) {
    it(`DEBT-054 — détecté comme LECTURE : ${nom}`, () => {
      expect(litLeMode(codeUtile(src)), nom).toBe(true)
    })
    it(`DEBT-054 — détecté comme DÉCISION : ${nom}`, () => {
      expect(decideSurLeMode(codeUtile(src)), nom).toBe(true)
    })
  }

  it('DEBT-054 — un décideur camelCase non déclaré serait bien signalé aux DEUX niveaux', () => {
    // CONTRÔLE POSITIF de bout en bout : la forme exacte de la sonde V1, qui
    // laissait le cliquet vert avant correction.
    const sonde = codeUtile('const M = new Set([2,3]); export function f(siteMode: unknown) { return M.has(siteMode) }')
    expect(litLeMode(sonde), 'NIVEAU 1 le verrait').toBe(true)
    expect(decideSurLeMode(sonde), 'NIVEAU 2 le verrait').toBe(true)
    expect(DECLARES.has('src/lib/__sonde054.ts')).toBe(false)
    expect('src/lib/__sonde054.ts' in LECTEURS_TRANSITIFS).toBe(false)
  })

  it('DEBT-054 — les six AUTORITÉS de mode sont désormais TOUTES détectées', () => {
    // AVANT : 0 / 6. Elles n'étaient au registre que par déclaration manuelle.
    // C'est la mesure qui donne son sens à la correction : le cliquet garde
    // maintenant ce qu'il existe pour garder.
    const AUTORITES = [
      'src/lib/commerce-admission/canTransact.ts',
      'src/lib/dropship/catalogAdmission.ts',
      'src/lib/dropship/subtypeAdmission.ts',
      'src/lib/order-domain/resolve.ts',
      'src/lib/agent-tools/toolCapabilities.ts',
      'src/lib/agent-tools/modeGuidance.ts',
    ]
    const vues = DECIDEURS.map((f) => f.chemin)
    for (const a of AUTORITES) {
      expect(vues, `${a} doit être vue comme DÉCIDEUR par le détecteur, pas seulement déclarée à la main`).toContain(a)
    }
  })

  it('DEBT-054 — FAUX POSITIFS : un identifiant `*Mode` sans rapport n’est jamais un DÉCIDEUR', () => {
    // L'élargissement de LECTURE est assumé et absorbé par l'allowlist. Ce qui
    // ne doit JAMAIS céder, c'est le niveau 2 : aucune de ces formes ne dérive
    // une règle de `sites.mode`, aucune ne doit exiger une déclaration.
    const HOMONYMES_CAMEL = [
      "const roundMode = 'up'; if (roundMode === 'up') { arrondir() }",
      "if (session.mode === 'payment') { encaisser() }",
      "const displayMode = 'grid'; if (displayMode === 'grid') { grille() }",
      "if (themeMode === 'dark') { sombre() }",
      "const editMode = true; if (editMode) { editer() }",
      "if (viewMode !== 'list') { autre() }",
    ]
    for (const src of HOMONYMES_CAMEL) {
      expect(decideSurLeMode(codeUtile(src)), src).toBe(false)
    }
  })

  it('DEBT-054 — une variable sans aucun rapport avec le mode n’est classée NI lecteur NI décideur', () => {
    for (const src of [
      'export function total(a: number, b: number) { return a + b }',
      'const model = MODELS.get(id); return model.name',
      'const node = document.querySelector(sel)',
      'export function f(x: number) { return [1,2,3].includes(x) }',
    ]) {
      expect(litLeMode(codeUtile(src)), src).toBe(false)
      expect(decideSurLeMode(codeUtile(src)), src).toBe(false)
    }
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
      // LOT 2 — LE NOM DE LA PRIMITIVE CHANGE, L'INVARIANT NON.
      //
      // Ce que ce cliquet protège est « la route DÉLÈGUE au lieu de comparer
      // le mode en dur » — R4 juste au-dessus le vérifie, et il reste vrai.
      // Ces deux routes appellent désormais `usesCatalogSelections`, qui
      // appelle `hasSupplierCatalog` : la même autorité de mode, interrogée
      // une granularité plus bas pour couvrir aussi le sous-type. La
      // délégation n'est pas affaiblie, elle est resserrée.
      expect(code, `${f} passe désormais par la primitive`).toMatch(
        /\b(hasSupplierCatalog|usesCatalogSelections)\(site\.mode/
      )
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
