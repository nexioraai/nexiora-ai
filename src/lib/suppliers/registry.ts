import 'server-only';

import { cjAdapter, cjCredentials } from './cj-adapter';
import { printfulAdapter, printfulCredentials } from './printful-adapter';
import { printifyAdapter, printifyCredentials } from './printify-adapter';
import { gelatoAdapter, gelatoCredentials } from './gelato-adapter';
import type { SupplierAdapter } from './supplier-adapter';

// ============================================================
// Source unique de vérité fournisseur (Phase 1 — correction architecture
// SupplierAdapter/registres). Avant ce fichier, 5 endroits reconstruisaient
// indépendamment CREDS+ADAPTERS (catalog-stock.ts, catalog/variants/route.ts,
// shipping/calculate/route.ts, le bloc inline de checkout/route.ts,
// pod-fulfill.ts) — Gelato avait un fulfillment réel et une autorisation
// métier (dropship/suppliers.ts) mais était absent des 4 premiers, causant
// un refus de checkout pour tout produit Gelato en Mode 3.
//
// Centralisé ici : identité fournisseur, credentials, instance adapter,
// dérivation de capacité par présence réelle de méthode (pas une liste
// recopiée à la main — c'est cette recopie qui a permis l'oubli de Gelato).
//
// Volontairement NON centralisé ici (restent des registres explicites) :
//   - src/lib/dropship/suppliers.ts : quels fournisseurs sont autorisés
//     par sous-type Mode 3 — une règle métier, pas une capacité technique.
//   - src/app/api/cron/catalog-sync/route.ts : quels fournisseurs sont
//     synchronisés — une décision opérationnelle (Printify y est désactivé
//     pour une raison API documentée, pas une incapacité du contrat).
// Dériver ces deux-là automatiquement effacerait une distinction réelle :
// "techniquement capable" et "autorisé/activé" sont deux questions
// différentes.
// ============================================================

export interface SupplierDefinition {
  readonly id: string;
  readonly adapter: SupplierAdapter;
  readonly credentials: Record<string, string>;
}

const SUPPLIERS: Record<string, SupplierDefinition> = {
  cj: { id: 'cj', adapter: cjAdapter, credentials: cjCredentials },
  printful: { id: 'printful', adapter: printfulAdapter, credentials: printfulCredentials },
  printify: { id: 'printify', adapter: printifyAdapter, credentials: printifyCredentials },
  gelato: { id: 'gelato', adapter: gelatoAdapter, credentials: gelatoCredentials },
};

/** Résout un fournisseur par son id. `undefined` si inconnu — jamais de valeur inventée. */
export function getSupplier(id: string): SupplierDefinition | undefined {
  return SUPPLIERS[id];
}

/** Tous les fournisseurs déclarés dans la source centrale. */
export function allSuppliers(): SupplierDefinition[] {
  return Object.values(SUPPLIERS);
}

/**
 * Les 4 méthodes obligatoires du contrat sont toujours présentes par
 * construction TypeScript. calculateShipping/listVariants sont
 * optionnelles et reflètent une vraie différence entre fournisseurs
 * (ex. Gelato n'a pas listVariants : chaque CatalogProduct Gelato est
 * déjà la variante exacte, il n'y a rien à lister).
 */
type SupplierCapability = keyof Pick<
  SupplierAdapter,
  'syncCatalog' | 'checkStock' | 'createOrder' | 'getTracking' | 'calculateShipping' | 'listVariants'
>;

/**
 * Fournisseurs qui implémentent réellement cette capacité — dérivé de la
 * présence effective de la méthode sur l'adapter, jamais d'une liste
 * recopiée à la main. C'est ce qui rend l'oubli de type "Gelato manquant"
 * structurellement impossible pour toute capacité qu'il implémente déjà.
 */
export function suppliersWithCapability(capability: SupplierCapability): SupplierDefinition[] {
  return allSuppliers().filter((s) => typeof s.adapter[capability] === 'function');
}
