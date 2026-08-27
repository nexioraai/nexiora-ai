// src/lib/commerce-admission/__tests__/dbInvariant.test.ts
//
// PHASE M1-7 — le verrou base de données de l'admission commerciale.
//
// ============================================================
// CE QUE CE FICHIER PEUT PROUVER, ET CE QU'IL NE PEUT PAS.
//
// Il n'y a pas de PostgreSQL sous Vitest. Ce fichier ne prouve donc PAS que
// les triggers refusent réellement une commande de Mode 1 — cette preuve-là
// est comportementale, elle s'exécute sur la base, et elle est écrite en toutes
// lettres dans la section E du fichier SQL (20 cas, rollback systématique).
// Prétendre le contraire ici serait fabriquer du vert.
//
// Ce que ce fichier prouve est autre chose, et c'est le seul risque qu'un test
// exécutable pouvait réellement couvrir :
//
//     LA LISTE DES MODES COMMERÇANTS EXISTE EN DEUX ENDROITS — TypeScript et
//     SQL — ET RIEN, JUSQU'ICI, N'EMPÊCHAIT L'UN DE BOUGER SANS L'AUTRE.
//
// Une divergence entre les deux ne casserait rien visiblement : l'application
// et la base continueraient chacune de fonctionner, simplement en désaccord sur
// qui a le droit de vendre. C'est exactement la forme de panne que personne ne
// remarque. Ce test la rend impossible à introduire en silence.
//
// POURQUOI LIRE LE FICHIER SQL PLUTÔT QUE LA BASE. Le fichier EST l'artefact
// versionné ; c'est lui qu'on relit, qu'on modifie et qu'on rejoue. La base
// n'est pas joignable depuis la CI. Cette convention — un test qui lit une
// source pour verrouiller une propriété structurelle — est déjà celle du dépôt
// (mode2Mode3Boundaries.test.ts, order-domain/resolve.test.ts,
// cj/singleCreationPath.test.ts).
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TRANSACTING_SITE_MODES } from '../canTransact'

const CHEMIN_SQL = 'supabase/sql/commerce_admission_orders_require_transacting_site.sql'
const SQL = readFileSync(join(process.cwd(), CHEMIN_SQL), 'utf8')

/**
 * Les corps des `create or replace function` — c'est-à-dire la LOGIQUE DE
 * DÉCISION du verrou, et elle seule.
 *
 * La distinction porte : le reste du fichier contient un banc de preuves qui
 * insère des commandes jetables, et une commande a des colonnes obligatoires
 * (`fulfillment_domain` notamment) qu'il faut bien renseigner. Renseigner une
 * colonne dans une fixture n'est pas en faire une autorité de décision.
 * Assertions portées sur le fichier entier, on interdirait au banc de preuves
 * d'exister ; portées sur les corps de fonctions, on interdit exactement ce
 * qu'on veut interdire.
 */
function corpsDesFonctions(): { nom: string; corps: string }[] {
  const re = /create\s+or\s+replace\s+function\s+(\w+)\s*\([^)]*\)([\s\S]*?)\n\$\$;/g
  const out: { nom: string; corps: string }[] = []
  for (let m = re.exec(SQL); m !== null; m = re.exec(SQL)) out.push({ nom: m[1], corps: m[2] })
  return out
}

/**
 * Retire les commentaires `--` d'un fragment SQL, pour ne scruter que ce qui
 * s'exécute.
 *
 * La distinction compte pour les motifs de fail-open ci-dessous : ce fichier
 * SQL EXPLIQUE longuement pourquoi `mode <> 1` est proscrit. Scruter la prose
 * en même temps que le code interdirait d'écrire cette explication — un test
 * qui empêche de documenter sa propre règle finit par être contourné.
 *
 * Approximation assumée : un `--` situé À L'INTÉRIEUR d'un littéral texte
 * tronque la ligne ici alors que PostgreSQL, lui, la lit entièrement. La
 * conséquence est toujours du même côté — ce lecteur voit MOINS que la base,
 * jamais plus — donc au pire une assertion de PRÉSENCE devient plus stricte.
 * Aucune assertion d'ABSENCE ne peut être affaiblie par cette troncature :
 * du texte retiré ne peut pas faire apparaître un motif de fail-open.
 */
const sansCommentaires = (fragment: string): string =>
  fragment
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')

/** Le fichier SQL entier, réduit à ce qui s'exécute. */
const SQL_EXECUTABLE = sansCommentaires(SQL)

describe('M1-7 — le lecteur de ce fichier lit réellement quelque chose', () => {
  // GARDE ANTI-VACUITÉ, et elle n'est pas décorative. Toutes les assertions
  // négatives de ce fichier (« aucun corps de fonction ne contient X ») sont
  // VRAIES PAR VACUITÉ si le parseur ne trouve aucune fonction. Un simple
  // renommage de fichier, ou une réécriture du SQL dans une autre forme
  // syntaxique, rendrait donc tout ce test vert sans plus rien vérifier —
  // exactement le faux verrou que ce chantier interdit de compter comme
  // protection. Ce test échoue AVANT les autres dans ce cas.
  it('les 3 fonctions du verrou sont extraites du fichier SQL', () => {
    const noms = corpsDesFonctions().map((f) => f.nom)
    expect(noms, `aucune fonction extraite de ${CHEMIN_SQL} : le parseur ne voit plus le SQL, et toutes les assertions négatives de ce fichier deviendraient vraies par vacuité`).toEqual([
      'site_mode_is_transacting',
      'enforce_shop_order_site_is_transacting',
      'enforce_site_mode_keeps_orders_valid',
    ])
  })

  it('chaque corps extrait est non vide', () => {
    for (const f of corpsDesFonctions()) {
      expect(f.corps.trim().length, `${f.nom} : corps vide`).toBeGreaterThan(0)
    }
  })
})

describe('M1-7 — le verrou DB et le module TypeScript ne peuvent pas diverger', () => {
  it("la liste SQL des modes commerçants est identique à TRANSACTING_SITE_MODES", () => {
    const m = SQL.match(/array\[([^\]]*)\]::smallint\[\]/)
    expect(m, "l'allowlist SQL doit rester exprimée comme `array[...]::smallint[]` — c'est la forme que ce test sait lire, et la seule qui garantisse la comparaison typée avec sites.mode (smallint)").not.toBeNull()

    const modesSql = m![1].split(',').map((v) => Number(v.trim()))
    expect(
      modesSql,
      `divergence TypeScript/SQL : l'application admet [${TRANSACTING_SITE_MODES.join(', ')}], la base admettrait [${modesSql.join(', ')}]. Les deux doivent bouger ensemble, sinon un mode peut vendre côté application et être refusé côté base (ou l'inverse), sans qu'aucune erreur ne le signale.`
    ).toEqual([...TRANSACTING_SITE_MODES])
  })

  it("la liste n'est définie QU'UNE FOIS dans toute la base", () => {
    const occurrences = SQL_EXECUTABLE.match(/array\[[^\]]*\]::smallint\[\]/g) ?? []
    expect(
      occurrences.length,
      "deux définitions de la même allowlist, c'est accepter qu'un jour l'une soit modifiée sans l'autre — et l'écart serait invisible, chaque trigger continuant de fonctionner en désaccord avec l'autre. La liste doit vivre uniquement dans site_mode_is_transacting()."
    ).toBe(1)
  })

  it('la fonction d’allowlist est bien celle que les deux triggers consultent', () => {
    const corps = corpsDesFonctions()
    const consommateurs = corps.filter((f) => f.nom.startsWith('enforce_'))
    expect(consommateurs.length, 'les deux sens de l’invariant doivent être portés par deux fonctions dédiées').toBe(2)
    for (const f of consommateurs) {
      expect(
        f.corps,
        `${f.nom} doit décider via site_mode_is_transacting() : toute autre écriture du test de mode réintroduit une seconde définition de la frontière`
      ).toContain('site_mode_is_transacting(')
    }
  })
})

describe('M1-7 — l’allowlist positive ne peut pas redevenir un fail-open', () => {
  // Chaque motif ci-dessous est une manière RÉELLE d'écrire « tout sauf le
  // mode 1 ». Toutes ont le même défaut : elles font du commerce le
  // comportement par défaut, et rendent commerçant un mode 4 que personne
  // n'a décidé d'admettre — en silence.
  const FAIL_OPEN: [string, RegExp][] = [
    ['mode <> 1', /mode\s*<>\s*1/i],
    ['mode != 1', /mode\s*!=\s*1/i],
    ['mode = 1 comme unique test', /mode\s*=\s*1\b/i],
    ['mode not in (1)', /mode\s+not\s+in\s*\(\s*1\s*\)/i],
    ['mode is distinct from 1', /mode\s+is\s+distinct\s+from\s+1\b/i],
  ]

  it.each(FAIL_OPEN)('aucun corps de fonction n’exclut le Mode 1 par la négative : %s', (_nom, motif) => {
    const corps = corpsDesFonctions()
    expect(corps.length, 'sans corps à inspecter, cette assertion serait vraie par vacuité').toBe(3)
    for (const f of corps) {
      expect(
        motif.test(sansCommentaires(f.corps)),
        `${f.nom} nomme ce qu'il EXCLUT au lieu de nommer ce qu'il AUTORISE. Un mode ajouté demain deviendrait commerçant sans décision et sans test. La règle du chantier est l'inverse : allowlist positive, un mode ne commerce que s'il a été inscrit.`
      ).toBe(false)
    }
  })

  it('un mode NULL ne peut pas passer pour commerçant', () => {
    const allowlist = corpsDesFonctions().find((f) => f.nom === 'site_mode_is_transacting')
    expect(allowlist, 'site_mode_is_transacting() doit exister').toBeDefined()
    expect(
      allowlist!.corps,
      "`p_mode = any(...)` vaut NULL quand p_mode est NULL, et `if NULL then raise` ne lève JAMAIS : sans coalesce(..., false), un site de mode NULL serait silencieusement admis au commerce. sites.mode EST nullable en production."
    ).toMatch(/coalesce\s*\([\s\S]*,\s*false\s*\)/i)
  })
})

describe("M1-7 — l’admission ne dépend jamais du domaine d’exécution", () => {
  it('aucun corps de fonction ne lit fulfillment_domain', () => {
    const corps = corpsDesFonctions()
    expect(corps.length, 'sans corps à inspecter, cette assertion serait vraie par vacuité').toBe(3)
    for (const f of corps) {
      expect(
        f.corps.includes('fulfillment_domain'),
        `${f.nom} confond ADMISSION et ROUTAGE. « Ce site a-t-il le droit de vendre ? » se pose en amont, sur sites.mode ; « qui exécute cette vente ? » se pose en aval, sur une commande déjà légitime. Faire dépendre la première de la seconde rejoue la confusion que neuf phases ont servi à défaire.`
      ).toBe(false)
    }
  })

  it('aucun corps de fonction ne lit dropship_type ni payment_account_id', () => {
    expect(corpsDesFonctions().length, 'garde anti-vacuité').toBe(3)
    // Ces colonnes peuvent empêcher une vente PAR ACCIDENT (compte Stripe
    // absent, sous-type non renseigné) ; aucune ne constitue une frontière.
    // La seule autorité de l'admission est sites.mode.
    for (const f of corpsDesFonctions()) {
      expect(f.corps).not.toContain('dropship_type')
      expect(f.corps).not.toContain('payment_account_id')
    }
  })
})

describe('M1-7 — les deux sens de l’invariant sont réellement installés', () => {
  // Un seul des deux sens ne suffit pas : sans le sens B, la règle du sens A
  // se contourne en deux temps — créer la commande sur un site mode 2, puis
  // basculer le site en mode 1. État final identique, aucune erreur levée.
  const TRIGGERS: [string, RegExp][] = [
    [
      'A/INSERT — une commande naît sur un site commerçant',
      /create\s+trigger\s+trg_shop_order_site_is_transacting_insert\s+before\s+insert\s+on\s+shop_orders/i,
    ],
    [
      'A/UPDATE — une commande ne se déplace pas vers un site non commerçant',
      /create\s+trigger\s+trg_shop_order_site_is_transacting_update\s+before\s+update\s+of\s+site_id\s+on\s+shop_orders/i,
    ],
    [
      'B — un site portant des commandes ne sort pas de l’allowlist',
      /create\s+trigger\s+trg_site_mode_keeps_orders_valid\s+before\s+update\s+of\s+mode\s+on\s+sites/i,
    ],
  ]

  it.each(TRIGGERS)('%s', (_nom, motif) => {
    expect(
      motif.test(SQL_EXECUTABLE),
      "ce trigger manque, ou sa portée a changé. Les trois sont nécessaires : retirer l'un d'eux laisse un chemin d'écriture complet vers l'état que l'invariant interdit."
    ).toBe(true)
  })

  it('la portée des triggers UPDATE reste limitée à leur colonne', () => {
    // `before update on <table>` sans `of <colonne>` réveillerait le trigger à
    // CHAQUE écriture — verrou FOR SHARE inclus — sur les 23 chemins d'UPDATE
    // existants de shop_orders et sur toute sauvegarde d'éditeur de site.
    expect(/before\s+update\s+on\s+shop_orders/i.test(SQL_EXECUTABLE)).toBe(false)
    expect(/before\s+update\s+on\s+sites/i.test(SQL_EXECUTABLE)).toBe(false)
  })

  it('chaque trigger est précédé de son `drop trigger if exists` (rejouable)', () => {
    for (const nom of [
      'trg_shop_order_site_is_transacting_insert',
      'trg_shop_order_site_is_transacting_update',
      'trg_site_mode_keeps_orders_valid',
    ]) {
      expect(
        new RegExp(`drop\\s+trigger\\s+if\\s+exists\\s+${nom}\\s+on\\s+`, 'i').test(SQL_EXECUTABLE),
        `sans ce drop, rejouer le fichier échoue sur « trigger already exists » — et un fichier non rejouable finit par ne plus être rejoué du tout`
      ).toBe(true)
    }
  })

  it('le refus est explicite et identifiable par un préfixe stable', () => {
    // Un `return null` silencieux annulerait la ligne sans rien dire :
    // l'appelant croirait avoir écrit. Le contrat est de LEVER.
    expect(SQL_EXECUTABLE).toMatch(/raise\s+exception\s*\n?\s*'ORDER_SITE_NOT_TRANSACTING:/i)
    expect(SQL_EXECUTABLE).toMatch(/raise\s+exception\s*\n?\s*'SITE_MODE_WOULD_ORPHAN_ORDERS:/i)
  })
})

describe('M1-7 — les fonctions ajoutées ne rouvrent pas de surface exposée', () => {
  // Référence mesurée en production le 2026-08-22 (phase2_privileges_hardening.sql) :
  // `fn_exposees = 0`. PostgreSQL accorde EXECUTE à PUBLIC par défaut à la
  // création de TOUTE fonction : sans REVOKE explicite, ce compteur passerait
  // de 0 à 3 du seul fait de ce fichier.
  it.each(['site_mode_is_transacting', 'enforce_shop_order_site_is_transacting', 'enforce_site_mode_keeps_orders_valid'])(
    '%s : REVOKE de public/anon/authenticated puis GRANT à service_role',
    (nom) => {
      expect(
        new RegExp(`revoke\\s+all\\s+on\\s+function\\s+${nom}\\s*\\([^)]*\\)\\s+from\\s+public,\\s*anon,\\s*authenticated`, 'i').test(SQL_EXECUTABLE),
        `${nom} conserverait EXECUTE hérité de PUBLIC — le patron REVOKE/GRANT du dépôt n'est pas optionnel`
      ).toBe(true)
      expect(
        new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${nom}\\s*\\([^)]*\\)\\s+to\\s+service_role`, 'i').test(SQL_EXECUTABLE)
      ).toBe(true)
    }
  )

  it('les REVOKE restent APRÈS les `create trigger`', () => {
    // PostgreSQL exige EXECUTE au moment du CREATE TRIGGER (mais pas à son
    // déclenchement). Un REVOKE placé avant ferait échouer l'installation.
    const dernierTrigger = SQL_EXECUTABLE.lastIndexOf('create trigger')
    const premierRevoke = SQL_EXECUTABLE.indexOf('revoke all on function')
    expect(dernierTrigger, 'aucun `create trigger` trouvé').toBeGreaterThan(-1)
    expect(premierRevoke, 'aucun `revoke all on function` trouvé').toBeGreaterThan(-1)
    expect(premierRevoke).toBeGreaterThan(dernierTrigger)
  })
})

describe('M1-7 — le banc de preuves comportemental existe et ne laisse rien derrière lui', () => {
  it('les 20 cas sont présents dans le fichier SQL', () => {
    const reussis = SQL.match(/TEST \d+ REUSSI/g) ?? []
    expect(
      new Set(reussis).size,
      "la section E est la SEULE preuve que les triggers refusent réellement quelque chose : aucun test Vitest ne peut l'établir, faute de PostgreSQL. La réduire, c'est perdre la preuve."
    ).toBe(20)
  })

  it('le banc se termine par un rollback volontaire, jamais par un `delete` de nettoyage', () => {
    expect(
      /raise\s+exception\s+'M1-7\s*:\s*20\/20/.test(SQL),
      "le banc doit se terminer par une exception : PostgreSQL annule alors toute la transaction, y compris les fixtures. Un nettoyage par `delete` s'oublie, et un arrêt prématuré laisserait des lignes jetables en production."
    ).toBe(true)
    expect(
      /delete\s+from\s+shop_orders/i.test(SQL_EXECUTABLE),
      'aucune commande ne doit être supprimée par ce fichier, sous aucun prétexte'
    ).toBe(false)
  })

  it('le banc couvre les deux acceptations qui distinguent un verrou d’une panne', () => {
    expect(SQL).toContain('INSERT sur site mode 2 accepte')
    expect(SQL).toContain('INSERT sur site mode 3 accepte')
  })
})
