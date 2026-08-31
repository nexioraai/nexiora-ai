// RUNTIME COPIÉ — REGISTRE DE SLOTS du projet généré (D-058).
//
// Fait fondateur : le compilateur ÉMETTAIT le code des slots (`slots/*.ts` +
// `slots/registry.ts`) et l'Oracle en refusait les exfiltrations — mais RIEN NE
// LES APPELAIT. `slotsInvoked: false`. Sur 152 promesses mortes du corpus,
// **44 visaient un slot**.
//
// Ce module fournit le registre au runtime, sur le patron EXACT du fournisseur
// de données : le code généré ne dépend jamais d'une implémentation concrète.
// Défaut : registre VIDE — un slot non fourni n'est pas invoqué, et le bloc
// garde la prop que le document a déclarée.
import { createContext, useContext } from "react";
import type { PropsWithChildren } from "react";

/** Un slot : entrées nommées → sorties nommées. Signature conservée telle quelle. */
export type SlotFn = (entrees: Readonly<Record<string, unknown>>) => Readonly<
  Record<string, unknown>
>;

export type SlotRegistry = Readonly<Record<string, SlotFn>>;

export const EMPTY_SLOT_REGISTRY: SlotRegistry = {};

const SlotContext = createContext<SlotRegistry>(EMPTY_SLOT_REGISTRY);

export function SlotRoot({
  registry,
  children,
}: PropsWithChildren<{ registry: SlotRegistry }>) {
  return <SlotContext.Provider value={registry}>{children}</SlotContext.Provider>;
}

export function useSlotRegistry(): SlotRegistry {
  return useContext(SlotContext);
}
