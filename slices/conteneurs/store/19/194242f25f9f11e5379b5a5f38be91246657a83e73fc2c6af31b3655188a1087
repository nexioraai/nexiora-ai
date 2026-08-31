// RUNTIME COPIÉ (compilateur 4.5, D-026 S2/D-030) — provider `demo` :
// les lignes de démonstration sont GÉNÉRÉES À LA COMPILATION (module
// canonique demo.data.ts, fonction pure seedée par le contentHash du
// dataset — D-013 : preview = données de démo uniquement) ; ce module ne
// fait que les SERVIR derrière l'interface DataProvider (§15). Instance
// par défaut d'un écran de détail sans paramètre = PREMIÈRE ligne
// (déterministe, lecture D-030).
import type { DataProvider, EntityInstance } from "./data-provider";

export type DemoData = Readonly<Record<string, readonly EntityInstance[]>>;

export function buildDemoProvider(data: DemoData): DataProvider {
  return {
    listInstances: (entityId) => data[entityId] ?? [],
    getInstance: (entityId, instanceId) => {
      const rows = data[entityId] ?? [];
      if (instanceId === undefined) return rows[0];
      return rows.find((r) => r.id === instanceId);
    },
  };
}
