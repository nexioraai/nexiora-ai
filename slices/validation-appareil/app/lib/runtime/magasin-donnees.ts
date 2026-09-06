// MAGASIN OBSERVABLE (E3.1, D-130) — module PUR, aucun import react.
//
// L'UI continue de LIRE EN SYNCHRONE (le contrat DataProvider est inchangé) :
// le magasin sert un INSTANTANÉ par entité {rows, status, version}. Ce qui
// change : l'instantané peut ÉVOLUER — chargement, nouvelles données, erreur,
// écritures locales — et chaque évolution RÉELLE notifie les abonnés, qui
// re-rendent. Une évolution qui ne change rien ne notifie PAS (anti-tempête).
//
// FRONTIÈRE D'HONNÊTETÉ : ce module ne connaît NI le réseau, NI l'horloge,
// NI la moindre notion de « live ». Il applique des transitions qu'on lui
// DONNE — l'adaptateur scripté des bancs les donne en séquence déterministe ;
// un futur adaptateur (E3.3) les donnera depuis une source déclarée. Un seed
// sans transitions se comporte au caractère près comme le provider historique.
//
// ERREUR : le dernier instantané est CONSERVÉ et l'état passe à `error` — le
// bloc rend l'état d'erreur avec les titres du document (D-060/F3). Jamais du
// périmé présenté comme frais : c'est l'ÉTAT qui porte la vérité, pas les
// lignes.
// Types STRUCTURAUX locaux — zéro import (module pur, comme `list-pipeline`).
// Compatibles par FORME avec le contrat `DataProvider` de `data-provider.tsx` :
// le magasin s'y branche par typage structurel, jamais par héritage nominal.
export interface EntityInstance {
  id: string;
  values: Readonly<Record<string, string>>;
}
export type DataStatus = "loading" | "ready" | "error";

interface EtatEntite {
  rows: readonly EntityInstance[];
  status: DataStatus;
  version: number;
  serie: number;
}

export interface MagasinDonnees {
  listInstances(entityId: string): readonly EntityInstance[];
  getInstance(entityId: string, instanceId?: string): EntityInstance | undefined;
  status(entityId: string): DataStatus;
  create(entityId: string, values: Readonly<Record<string, string>>): boolean;
  update(entityId: string, instanceId: string, values: Readonly<Record<string, string>>): boolean;
  remove(entityId: string, instanceId: string): boolean;
  /** 1.13.0 — écriture à identifiant IMPOSÉ (création ou mise à jour). */
  upsert(entityId: string, instanceId: string, values: Readonly<Record<string, string>>): boolean;
  abonner(ecouteur: () => void): () => void;
  versionGlobale(): number;
  versionEntite(entityId: string): number;
  /** Transition : la source part chercher — les lignes actuelles restent servies. */
  appliquerChargement(entityId: string): void;
  /** Transition : données arrivées. IDENTIQUES ⇒ aucun changement, aucune notification. */
  appliquerDonnees(entityId: string, rows: readonly EntityInstance[]): void;
  /** Transition : échec. Le dernier instantané est conservé, l'état dit la vérité. */
  appliquerErreur(entityId: string): void;
}

const cloneRows = (rows: readonly EntityInstance[]): readonly EntityInstance[] =>
  rows.map((r) => ({ id: r.id, values: { ...r.values } }));

export function creerMagasin(
  seed: Readonly<Record<string, readonly EntityInstance[]>>,
): MagasinDonnees {
  const etats = new Map<string, EtatEntite>();
  for (const [entityId, rows] of Object.entries(seed)) {
    etats.set(entityId, { rows: cloneRows(rows), status: "ready", version: 0, serie: rows.length });
  }
  const etat = (entityId: string): EtatEntite => {
    const existant = etats.get(entityId);
    if (existant !== undefined) return existant;
    const neuf: EtatEntite = { rows: [], status: "ready", version: 0, serie: 0 };
    etats.set(entityId, neuf);
    return neuf;
  };
  let globale = 0;
  const ecouteurs = new Set<() => void>();
  const notifier = (e: EtatEntite): void => {
    e.version += 1;
    globale += 1;
    for (const l of [...ecouteurs]) l();
  };
  return {
    // ── Lectures : le contrat historique, au caractère près (repli rows[0]). ──
    listInstances: (entityId) => etat(entityId).rows,
    getInstance: (entityId, instanceId) => {
      const { rows } = etat(entityId);
      return instanceId === undefined ? rows[0] : rows.find((r) => r.id === instanceId);
    },
    status: (entityId) => etat(entityId).status,
    // ── Écritures locales (D-061) : vérité booléenne, observation réelle. ──
    create: (entityId, values) => {
      const e = etat(entityId);
      e.serie += 1;
      e.rows = [...e.rows, { id: `${entityId}_l${String(e.serie)}`, values: { ...values } }];
      notifier(e);
      return true;
    },
    update: (entityId, instanceId, values) => {
      const e = etat(entityId);
      const i = e.rows.findIndex((r) => r.id === instanceId);
      if (i < 0) return false;
      e.rows = e.rows.map((r, j) => (j === i ? { id: r.id, values: { ...r.values, ...values } } : r));
      notifier(e);
      return true;
    },
    upsert: (entityId, instanceId, values) => {
      const e = etat(entityId);
      const i = e.rows.findIndex((r) => r.id === instanceId);
      if (i >= 0) {
        e.rows = e.rows.map((r, j) =>
          j === i ? { id: r.id, values: { ...r.values, ...values } } : r,
        );
      } else {
        e.rows = [...e.rows, { id: instanceId, values: { ...values } }];
      }
      notifier(e);
      return true;
    },
    remove: (entityId, instanceId) => {
      const e = etat(entityId);
      const avant = e.rows.length;
      e.rows = e.rows.filter((r) => r.id !== instanceId);
      if (e.rows.length === avant) return false;
      notifier(e);
      return true;
    },
    // ── Observation. ──
    abonner: (ecouteur) => {
      ecouteurs.add(ecouteur);
      return () => ecouteurs.delete(ecouteur);
    },
    versionGlobale: () => globale,
    versionEntite: (entityId) => etat(entityId).version,
    // ── Transitions de source (données PAR l'appelant — jamais d'horloge ici). ──
    appliquerChargement: (entityId) => {
      const e = etat(entityId);
      if (e.status === "loading") return;
      // DET-033 (jugement propriétaire sur SM-A175F) : une revalidation en
      // ARRIÈRE-PLAN ne remplace pas des données affichées par un état de
      // chargement. Le polling repassait chaque écran par « Chargement… »
      // toutes les 30 s — l'UI clignotait, et le champ de recherche était
      // démonté en pleine frappe. Tant que des lignes existent, l'instantané
      // servi reste la vérité (l'erreur, elle, continue de se DIRE — D-060) ;
      // le chargement VISIBLE reste réservé au tout premier remplissage.
      if (e.rows.length > 0) return;
      e.status = "loading";
      notifier(e);
    },
    appliquerDonnees: (entityId, rows) => {
      const e = etat(entityId);
      const identiques =
        e.status === "ready" && JSON.stringify(e.rows) === JSON.stringify(rows);
      if (identiques) return; // anti-tempête : rien ne change, rien ne notifie
      e.rows = cloneRows(rows);
      e.status = "ready";
      notifier(e);
    },
    appliquerErreur: (entityId) => {
      const e = etat(entityId);
      if (e.status === "error") return;
      e.status = "error"; // les lignes RESTENT — l'état porte la vérité
      notifier(e);
    },
  };
}
