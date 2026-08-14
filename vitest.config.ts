import { defineConfig } from 'vitest/config';
import path from 'path';

// P0-3.8 — configuration minimale, alignée sur l'alias `@/*` de tsconfig.json.
// Portée volontairement limitée à src/lib/fulfillment (périmètre de cette
// tâche) : ne force aucune convention de test sur le reste du repository.
export default defineConfig({
  test: {
    // P0-3.9 : périmètre étendu à src/lib/suppliers pour les tests
    // d'intégration de pod-fulfill.ts (restructuration P0-3.9).
    // P0-3.9.7 Audit #2 : périmètre étendu aux routes webhook Gelato/Printful
    // (mocks uniquement, jamais de réseau réel) — les routes API n'avaient
    // aucune couverture de test avant cet audit de clôture.
    // Phase 1 — registre fournisseurs : src/lib/__tests__/ ajouté pour
    // catalog-stock.ts (aucune couverture avant ce correctif, cible directe
    // du bug Gelato pré-checkout).
    // Phase 1 — D3 : src/lib/shop/ ajouté pour handlePaidCheckout.ts
    // (aucune couverture avant ce correctif).
    include: [
      'src/lib/__tests__/**/*.test.ts',
      'src/lib/shop/**/*.test.ts',
      'src/lib/fulfillment/**/*.test.ts',
      'src/lib/suppliers/**/*.test.ts',
      'src/lib/payments/**/*.test.ts',
      'src/app/api/webhooks/**/*.test.ts',
      'src/app/api/shop/**/*.test.ts',
      'src/app/api/stripe/**/*.test.ts',
      'src/app/api/cron/**/*.test.ts',
    ],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // 'server-only' lève une erreur volontaire indépendamment de tout
      // bundler — nécessaire en dev/build Next.js, sans objet sous Vitest
      // (environnement Node pur, pas de risque de fuite client/serveur).
      'server-only': path.resolve(__dirname, './vitest.server-only-stub.ts'),
    },
  },
});
