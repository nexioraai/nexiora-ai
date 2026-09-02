// RUNTIME COPIÉ (compilateur 4.3, D-026 S2/§15) — INTERFACE de données du
// projet généré. Contrat obligatoire dès le premier provider : le code
// généré ne dépend JAMAIS d'un provider concret. Implémentation par
// défaut : VIDE (déterministe). L'implémentation `demo` (fixtures
// déterministes seedées par contentHash) arrive en 4.5 ; Supabase en
// Phase 5 — sans changement de cette interface.
// Ce fichier est un ARTEFACT DE SORTIE du compilateur (copie régénérable,
// D-007) : jamais édité dans un projet généré.
import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { PropsWithChildren } from "react";
// E3.1 (D-130) — le contrat du magasin vit dans son module PUR ; ici on ne
// fait qu'en importer le TYPE (le cliquet d'exactitude de l'interface
// DataProvider ne doit voir que les opérations de données déclarées).
import type { MagasinDonnees } from "./magasin-donnees";

export interface EntityInstance {
  id: string;
  values: Readonly<Record<string, string>>;
}

export type DataStatus = "loading" | "ready" | "error";

export interface DataProvider {
  listInstances(entityId: string): readonly EntityInstance[];
  getInstance(entityId: string, instanceId?: string): EntityInstance | undefined;
  /**
   * ÉTAT DE LA SOURCE (1.1.0, D-060) — OPTIONNEL.
   *
   * Sans lui, les données sont immédiates et le comportement est celui de
   * 1.0.0, au caractère près. Avec lui, `loading` et `error` deviennent
   * ATTEIGNABLES : le bloc les rend, à condition que le document ait déclaré
   * leurs titres (F3 — le moteur n'invente aucun texte).
   *
   * Fait qui a rendu ce champ nécessaire : le fournisseur était PUREMENT
   * SYNCHRONE, donc `loading` était l'état d'une attente qui n'existait pas et
   * `error` celui d'un appel qui ne pouvait pas échouer. La dimension C d'A++
   * n'était pas non atteinte — elle était inatteignable (APP-D003).
   */
  status?(entityId: string): DataStatus;
  /**
   * ÉCRITURE (1.2.0, D-061) — OPTIONNELLE.
   *
   * Sans elle, une action `mutation` reste une non-opération et le moteur le
   * DIT (l'enveloppe le déclare, la gate de fidélité compte la promesse morte).
   * Avec elle, un bouton « Commander » commande réellement.
   *
   * Retourne `true` si l'écriture a été HONORÉE. Jamais un `void` optimiste :
   * un appelant doit pouvoir distinguer « écrit » de « refusé », sinon on
   * recrée `APP-D002` — une promesse que rien ne fonde.
   */
  create?(entityId: string, values: Readonly<Record<string, string>>): boolean;
  update?(entityId: string, instanceId: string, values: Readonly<Record<string, string>>): boolean;
  remove?(entityId: string, instanceId: string): boolean;
}

export const EMPTY_DATA_PROVIDER: DataProvider = {
  listInstances: () => [],
  getInstance: () => undefined,
};

const DataContext = createContext<DataProvider>(EMPTY_DATA_PROVIDER);

/**
 * OBSERVATION (E3.1, D-130) — ADDITIVE. Un provider qui expose `abonner` +
 * `versionGlobale` (le magasin observable) fait re-rendre le sous-arbre à
 * CHAQUE évolution réelle de ses données ; un provider ordinaire garde le
 * comportement historique au caractère près. La granularité anti-tempête est
 * dans le magasin (une évolution sans changement ne notifie pas) — ici on ne
 * fait qu'écouter.
 */
const estObservable = (p: DataProvider): p is DataProvider & MagasinDonnees =>
  typeof (p as Partial<MagasinDonnees>).abonner === "function" &&
  typeof (p as Partial<MagasinDonnees>).versionGlobale === "function";

function ObservationRoot({
  provider,
  children,
}: PropsWithChildren<{ provider: DataProvider & MagasinDonnees }>) {
  const version = useSyncExternalStore(
    provider.abonner,
    provider.versionGlobale,
    provider.versionGlobale,
  );
  // CAUSE RACINE DÉMONTRÉE (E3.1) : re-rendre ce composant ne re-rend PAS le
  // sous-arbre — `children` est le MÊME élément (bail-out React), et un
  // provider d'identité stable ne propage rien par le contexte. La VALEUR du
  // contexte change donc d'identité à CHAQUE version réelle : chaque
  // consommateur (`useDataProvider`) re-rend, et lit des données à jour.
  const valeur = useMemo<DataProvider>(() => ({ ...provider }), [provider, version]);
  return <DataContext.Provider value={valeur}>{children}</DataContext.Provider>;
}

export function DataRoot({
  provider,
  children,
}: PropsWithChildren<{ provider: DataProvider }>) {
  return estObservable(provider) ? (
    <ObservationRoot provider={provider}>{children}</ObservationRoot>
  ) : (
    <DataContext.Provider value={provider}>{children}</DataContext.Provider>
  );
}

export function useDataProvider(): DataProvider {
  return useContext(DataContext);
}
