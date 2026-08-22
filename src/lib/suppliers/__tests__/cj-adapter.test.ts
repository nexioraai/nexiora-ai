import { describe, it, expect, vi } from 'vitest';

// Audit hostile rate-limit/idempotence CJ, Phase 4 : verrouille que
// cj-adapter.ts:createOrder() est structurellement inutilisable pour créer
// une vraie commande CJ -- seul fulfillCjOrder() (src/lib/cj/fulfill.ts) a le
// droit de le faire (verrou atomique + réconciliation obligatoire + gestion
// 1603003, aucune de ces protections n'existe dans ce fichier générique).

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }));

import { cjAdapter } from '../cj-adapter';

describe('cjAdapter.createOrder — désactivé intentionnellement', () => {
  it('lève toujours une erreur explicite, jamais un appel réseau réel', async () => {
    await expect(
      cjAdapter.createOrder(
        {} as any,
        { email: 'x@x.com', apiKey: 'k' }
      )
    ).rejects.toThrow(/fulfillCjOrder/);
  });

  it('le message oriente explicitement vers le seul chemin autorisé', async () => {
    await expect(cjAdapter.createOrder({} as any, {})).rejects.toThrow(
      /verrou atomique|réconciliation|1603003/
    );
  });
});
