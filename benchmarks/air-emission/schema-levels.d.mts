// Types du module d'échelle de dégradation — le harnais est en JS, ses
// consommateurs (tests) sont en TS. Déclarer ici évite qu'un `any` implicite
// prive les tests de toute vérification.
export type NoeudSchema = unknown;
export interface NiveauSchema {
  readonly name: string;
  readonly schema: NoeudSchema;
}
export function stripKeys(node: NoeudSchema, keys: readonly string[]): NoeudSchema;
export function oneOfToAnyOf(node: NoeudSchema): NoeudSchema;
export function clampMinItems(node: NoeudSchema): NoeudSchema;
export function makeLevels(jsonSchema: NoeudSchema): NiveauSchema[];
