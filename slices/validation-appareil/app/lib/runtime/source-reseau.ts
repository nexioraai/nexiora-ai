// ADAPTATEUR DE SOURCE DISTANTE (E3.3) — générique et SECTOR-AGNOSTIC : il ne
// connaît que le contrat (cibles résolues par le LOCK, politique de domaines,
// magasin observable). AUCUNE logique métier, AUCUN secteur.
//
// Doctrine :
//  - FAIL-CLOSED : une cible dont l'URL ne se prouve pas admissible (https,
//    hôte EXACTEMENT dans la politique, forme saine) n'atteint JAMAIS le
//    transport — l'état passe en erreur et dit la vérité.
//  - Le transport est INJECTÉ : l'app émise branche `fetch`, les bancs
//    injectent un transport déterministe. L'adaptateur ne fabrique aucune
//    donnée : une réponse hors contrat (forme inattendue) est REFUSÉE.
//  - Les transitions appartiennent au magasin (E3.1) : chargement → données /
//    erreur ; l'identique ne notifie pas — l'adaptateur n'invente donc jamais
//    de « nouveauté ».
//  - Le rafraîchissement périodique est du POLLING (planificateur injecté,
//    `refreshSeconds`) — ce n'est PAS du temps réel poussé, et rien ici ne
//    doit être présenté comme tel.
//  - Journal APPEND-ONLY sans horloge : la trace est déterministe — mêmes
//    entrées ⇒ même journal, byte pour byte.
import type { EntityInstance, MagasinDonnees } from "./magasin-donnees";

export interface ReponseTransport {
  readonly ok: boolean;
  readonly status: number;
  readonly corps: unknown;
}

/** Contrat du transport injecté : une URL, une réponse — rien d'autre. */
export type Transport = (url: string) => Promise<ReponseTransport>;

/** Planificateur injecté (polling) : rend la fonction d'annulation. */
export type Planificateur = (cb: () => void, secondes: number) => () => void;

/** Cible résolue par le LOCK (jamais construite ici — l'adaptateur ne décide
 *  pas des endpoints, il les applique). */
export interface CibleRemote {
  readonly datasetId: string;
  readonly entityId: string;
  readonly integrationId: string;
  readonly url: string;
  readonly refreshSeconds?: number;
}

export interface AdaptateurReseau {
  /** Charge toutes les cibles admissibles, puis arme le polling déclaré. */
  demarrer(): Promise<void>;
  rafraichir(entityId: string): Promise<void>;
  arreter(): void;
  /** Trace déterministe des décisions — matière des preuves, jamais du décor. */
  journal(): readonly string[];
}

// Hôte d'une URL https SANS port : le port n'est pas exprimable dans
// `network.allowedDomains` (regex du contrat), donc une URL portée est
// inadmissible par construction — fail-closed, pas de tolérance.
const HOTE_HTTPS = /^https:\/\/([a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+)\/[^\s]*$/;

const estInstance = (x: unknown): x is EntityInstance => {
  if (typeof x !== "object" || x === null) return false;
  const inst = x as { id?: unknown; values?: unknown };
  if (typeof inst.id !== "string" || inst.id.length === 0) return false;
  if (typeof inst.values !== "object" || inst.values === null) return false;
  return Object.values(inst.values).every((v) => typeof v === "string");
};

const lignesValides = (corps: unknown): readonly EntityInstance[] | undefined => {
  if (!Array.isArray(corps)) return undefined;
  return corps.every(estInstance) ? (corps as readonly EntityInstance[]) : undefined;
};

/**
 * Transport APPAREIL par défaut (câblé par l'app émise) : `fetch` global de
 * React Native. SEUL point réseau du runtime — exemption NOMMÉE du cliquet
 * zéro-réseau (D-132) : ce code ne s'exécute JAMAIS pendant la compilation,
 * uniquement dans l'app émise, sur l'appareil, vers des cibles résolues par
 * le lock et revérifiées contre `network.allowedDomains`.
 */
export const transportHttp: Transport = async (url) => {
  const r = await fetch(url);
  let corps: unknown = null;
  try {
    corps = await r.json();
  } catch {
    corps = null;
  }
  return { ok: r.ok, status: r.status, corps };
};

/** Planificateur APPAREIL par défaut — POLLING, jamais du temps réel poussé. */
export const planificateurIntervalle: Planificateur = (cb, secondes) => {
  const t = setInterval(cb, secondes * 1000);
  return () => clearInterval(t);
};

export function creerAdaptateurReseau(options: {
  readonly magasin: MagasinDonnees;
  readonly cibles: readonly CibleRemote[];
  readonly domainesAutorises: readonly string[];
  readonly transport: Transport;
  readonly planificateur?: Planificateur;
}): AdaptateurReseau {
  const { magasin, cibles, domainesAutorises, transport, planificateur } = options;
  const journal: string[] = [];
  const annulations: (() => void)[] = [];

  // Admissibilité prouvée UNE fois, AVANT tout transport (fail-closed).
  const admissibles = new Map<string, CibleRemote>();
  for (const cible of cibles) {
    const hote = HOTE_HTTPS.exec(cible.url)?.[1];
    if (hote === undefined) {
      journal.push(`refus_url:${cible.entityId}:${cible.url}`);
      magasin.appliquerErreur(cible.entityId);
      continue;
    }
    if (!domainesAutorises.includes(hote)) {
      journal.push(`refus_domaine:${cible.entityId}:${hote}`);
      magasin.appliquerErreur(cible.entityId);
      continue;
    }
    admissibles.set(cible.entityId, cible);
  }

  const rafraichir = async (entityId: string): Promise<void> => {
    const cible = admissibles.get(entityId);
    if (cible === undefined) {
      journal.push(`refus_cible:${entityId}`);
      return;
    }
    journal.push(`chargement:${entityId}`);
    magasin.appliquerChargement(entityId);
    let reponse: ReponseTransport;
    try {
      reponse = await transport(cible.url);
    } catch {
      journal.push(`erreur_transport:${entityId}`);
      magasin.appliquerErreur(entityId);
      return;
    }
    if (!reponse.ok) {
      journal.push(`erreur_statut:${entityId}:${reponse.status}`);
      magasin.appliquerErreur(entityId);
      return;
    }
    const lignes = lignesValides(reponse.corps);
    if (lignes === undefined) {
      journal.push(`refus_forme:${entityId}`);
      magasin.appliquerErreur(entityId);
      return;
    }
    // La NOUVEAUTÉ se mesure sur les LIGNES, jamais sur la version : le
    // cycle chargement→prêt bouge légitimement la version (transition
    // d'état réelle et observable) même quand les données sont identiques.
    const avant = JSON.stringify(magasin.listInstances(entityId));
    magasin.appliquerDonnees(entityId, lignes);
    const apres = JSON.stringify(magasin.listInstances(entityId));
    journal.push(`donnees:${entityId}:${lignes.length}:${avant === apres ? "identiques" : "nouvelles"}`);
  };

  return {
    demarrer: async () => {
      for (const cible of admissibles.values()) {
        await rafraichir(cible.entityId);
        if (cible.refreshSeconds !== undefined && planificateur !== undefined) {
          journal.push(`polling:${cible.entityId}:${cible.refreshSeconds}`);
          annulations.push(planificateur(() => void rafraichir(cible.entityId), cible.refreshSeconds));
        }
      }
    },
    rafraichir,
    arreter: () => {
      for (const annuler of annulations.splice(0)) annuler();
      journal.push("arret");
    },
    journal: () => [...journal],
  };
}
