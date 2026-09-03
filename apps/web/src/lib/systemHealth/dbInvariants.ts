// src/lib/systemHealth/dbInvariants.ts
//
// DETTE 5 — LE VERDICT DE LA BASE, ET LA RÈGLE QUI L'ENCADRE.
//
// LE DÉFAUT CORRIGÉ. Cinq fichiers de test lisent des fichiers SQL ; aucun
// n'interroge la base. Le dépôt pouvait donc affirmer un invariant que la
// base n'appliquait plus — et rien ne l'aurait vu.
//
// LA RÈGLE, ET ELLE NE SOUFFRE AUCUNE EXCEPTION :
//
//     L'ABSENCE DE PREUVE N'EST JAMAIS UNE PREUVE DE CONFORMITÉ.
//
// RPC absente, HTTP ≠ 200, erreur PostgREST, JSON illisible, résultat
// incomplet, exception, timeout — TOUT chemin non concluant produit
// `unverifiable`, jamais `conforming`. Sans cette règle, un contrôle en panne
// serait indistinguable d'une base saine, et le cliquet fabriquerait du vert :
// exactement ce que `dbInvariant.test.ts` refuse en toutes lettres depuis
// M1-7.
//
// LE CANAL. Le verdict voyage dans `raw_failures`, dont le contrat est
// « une entrée = un problème ». Une base conforme n'y écrit donc RIEN — sans
// quoi l'Admin afficherait un succès sous le bandeau « Autres échecs ».

/** Une entrée de `raw_failures`, exactement la forme attendue par HealthReport. */
export type HealthFailureEntry = { test: string; message: string }

/**
 * Trois états, et trois seulement.
 *
 * `conforming`   — la base a répondu, et tous les invariants tiennent.
 * `violated`     — la base a répondu, et au moins un invariant est rompu.
 * `unverifiable` — on ne sait pas. Ce n'est PAS un synonyme de conforme.
 */
export type DbInvariantsState = 'conforming' | 'violated' | 'unverifiable'

export type DbInvariantsVerdict = {
  state: DbInvariantsState
  /** Vide si et seulement si `state === 'conforming'`. */
  entries: HealthFailureEntry[]
}

/** Préfixe obligatoire : dans l'Admin, un écart de base et un échec de test partagent le même cartouche. Seul ce préfixe les distingue. */
export const DB_INVARIANT_PREFIX = 'DB_INVARIANTS:'

const UNVERIFIABLE_TEST = `${DB_INVARIANT_PREFIX} verification impossible`

function unverifiable(constat: string): DbInvariantsVerdict {
  return { state: 'unverifiable', entries: [{ test: UNVERIFIABLE_TEST, message: constat }] }
}

/**
 * Interprète la réponse BRUTE de `check_db_invariants()`.
 *
 * Fonction PURE : aucun réseau, aucune horloge. C'est elle qui porte la règle
 * ci-dessus, et c'est donc elle que les tests doivent pouvoir malmener.
 *
 * `expected_checks` / `performed_checks` ne sont pas décoratifs : un résultat
 * tronqué — version future partielle, boucle interrompue — serait sinon
 * indistinguable d'une base saine.
 */
export function interpretDbInvariants(raw: unknown): DbInvariantsVerdict {
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return unverifiable(`reponse RPC inattendue (${raw === null ? 'null' : Array.isArray(raw) ? 'tableau' : typeof raw})`)
  }

  const r = raw as Record<string, unknown>

  const expected = r.expected_checks
  const performed = r.performed_checks
  if (typeof expected !== 'number' || typeof performed !== 'number') {
    return unverifiable('reponse RPC sans compteurs expected_checks/performed_checks')
  }
  if (performed !== expected) {
    // Ni conforme, ni violé : on n'a pas tout regardé.
    return unverifiable(`resultat incomplet : ${performed}/${expected} controles effectues`)
  }

  const violations = r.violations
  if (!Array.isArray(violations)) {
    return unverifiable('reponse RPC sans tableau `violations`')
  }

  if (typeof r.conforming !== 'boolean') {
    return unverifiable('reponse RPC sans booleen `conforming`')
  }

  // Incohérence interne : le drapeau et la liste se contredisent. On ne
  // tranche pas à la place de la base — on refuse de conclure.
  if (r.conforming !== (violations.length === 0)) {
    return unverifiable(
      `reponse RPC incoherente : conforming=${r.conforming} avec ${violations.length} violation(s)`
    )
  }

  if (violations.length === 0) {
    // Le seul chemin qui n'écrit rien dans raw_failures.
    return { state: 'conforming', entries: [] }
  }

  return {
    state: 'violated',
    entries: violations.map((v) => {
      const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
      const nom = typeof o.invariant === 'string' && o.invariant ? o.invariant : 'invariant inconnu'
      const detail = typeof o.detail === 'string' && o.detail ? o.detail : 'aucun detail fourni'
      return { test: `${DB_INVARIANT_PREFIX} ${nom}`, message: detail }
    }),
  }
}

/**
 * Appelle la RPC via PostgREST et rend le verdict.
 *
 * PostgREST UNIQUEMENT — la CI ne dispose d'aucune connexion PostgreSQL
 * directe, et lui en donner une élargirait la surface d'accès bien au-delà de
 * ce que cette vérification demande.
 *
 * Ne lève JAMAIS. Toute exception devient `unverifiable` : une panne du
 * contrôle ne doit ni casser la CI, ni se faire passer pour un succès.
 */
export async function fetchDbInvariants(config: {
  url: string
  key: string
  fetchImpl?: typeof fetch
}): Promise<DbInvariantsVerdict> {
  const doFetch = config.fetchImpl ?? fetch
  try {
    const res = await doFetch(`${config.url}/rest/v1/rpc/check_db_invariants`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })

    if (!res.ok) {
      const corps = await res.text().catch(() => '')
      // 404 = la RPC n'existe pas (migration non jouee). C'est le cas que ce
      // module existe pour ne PAS confondre avec une base saine.
      return unverifiable(`RPC injoignable : HTTP ${res.status}${corps ? ' — ' + corps.slice(0, 300) : ''}`)
    }

    let parsed: unknown
    try {
      parsed = await res.json()
    } catch {
      return unverifiable('reponse RPC illisible (JSON invalide)')
    }

    return interpretDbInvariants(parsed)
  } catch (e) {
    return unverifiable(`appel RPC en echec : ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * Relit un verdict DB depuis les `raw_failures` d'un rapport déjà stocké.
 *
 * Utilisé par l'Admin, qui n'a que la table et doit pourtant en déduire un
 * état global. Le contrat est asymétrique et c'est voulu : une base conforme
 * n'écrit RIEN, donc l'absence d'entrée vaut `conforming`.
 *
 * RÉSERVE HONNÊTE : un rapport produit AVANT l'existence de ce contrôle n'a
 * évidemment aucune entrée, et sera donc lu comme `conforming`. La fraîcheur
 * (`isStale`, 48 h) est ce qui borne cette ambiguïté, pas ce module.
 */
export function deriveDbInvariantsState(rawFailures: HealthFailureEntry[] | null | undefined): DbInvariantsState {
  if (!Array.isArray(rawFailures)) return 'conforming'
  const entrees = rawFailures.filter((f) => typeof f?.test === 'string' && f.test.startsWith(DB_INVARIANT_PREFIX))
  if (entrees.length === 0) return 'conforming'
  if (entrees.some((f) => f.test === UNVERIFIABLE_TEST)) return 'unverifiable'
  return 'violated'
}
