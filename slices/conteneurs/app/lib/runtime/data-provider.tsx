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

export interface DataProvider {
  listInstances(entityId: string): readonly EntityInstance[];
  getInstance(entityId: string, instanceId?: string): EntityInstance | undefined;
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
