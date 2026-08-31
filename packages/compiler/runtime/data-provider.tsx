// RUNTIME COPIÉ (compilateur 4.3, D-026 S2/§15) — INTERFACE de données du
// projet généré. Contrat obligatoire dès le premier provider : le code
// généré ne dépend JAMAIS d'un provider concret. Implémentation par
// défaut : VIDE (déterministe). L'implémentation `demo` (fixtures
// déterministes seedées par contentHash) arrive en 4.5 ; Supabase en
// Phase 5 — sans changement de cette interface.
// Ce fichier est un ARTEFACT DE SORTIE du compilateur (copie régénérable,
// D-007) : jamais édité dans un projet généré.
import { createContext, useContext } from "react";
import type { PropsWithChildren } from "react";

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
}

export const EMPTY_DATA_PROVIDER: DataProvider = {
  listInstances: () => [],
  getInstance: () => undefined,
};

const DataContext = createContext<DataProvider>(EMPTY_DATA_PROVIDER);

export function DataRoot({
  provider,
  children,
}: PropsWithChildren<{ provider: DataProvider }>) {
  return <DataContext.Provider value={provider}>{children}</DataContext.Provider>;
}

export function useDataProvider(): DataProvider {
  return useContext(DataContext);
}
