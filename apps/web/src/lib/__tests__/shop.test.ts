// F7 (audit stock Mode 2) — decrementStock() ne faisait avant aucune
// décrémentation atomique : lecture (getProduct), calcul en JavaScript
// (Math.max(0, stock - qty)), puis écriture séparée -- un "lost update"
// démontrable sous concurrence (deux commandes différentes décrémentant le
// même produit en parallèle pouvaient en perdre une), indépendamment de
// toute question de réservation de stock. Délègue désormais entièrement à
// decrement_shop_stock_batch() (RPC Postgres, supabase/sql/shop_stock_functions.sql),
// seule façon d'obtenir une décrémentation réellement atomique avec
// PostgREST (qui n'accepte que des valeurs littérales dans un .update(),
// jamais une expression relative à la valeur actuelle de la ligne). Ces
// tests prouvent le contrat TypeScript de decrementStock() -- l'atomicité
// réelle sous concurrence est une propriété du moteur Postgres, démontrée
// dans le corps de la fonction SQL elle-même (voir son en-tête), pas
// reproductible par un test unitaire mocké.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const rpcMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));

import { decrementStock, cancelShopOrderAtomic } from '../shop';

beforeEach(() => {
  rpcMock.mockReset();
});

describe('decrementStock — délègue à la RPC atomique, aucun calcul de stock en JavaScript', () => {
  it('lignes normales -> appelle decrement_shop_stock_batch avec les bonnes lignes', async () => {
    rpcMock.mockResolvedValue({ data: { success: true }, error: null });
    const result = await decrementStock([{ id: 'p1', quantity: 2 }, { id: 'p2', quantity: 1 }]);
    expect(result).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith('decrement_shop_stock_batch', {
      p_lines: [
        { product_id: 'p1', quantity: 2 },
        { product_id: 'p2', quantity: 1 },
      ],
    });
  });

  it('lignes catalogue (préfixe "catalog-") exclues -- jamais envoyées à la RPC (stock hors périmètre Mode 2)', async () => {
    rpcMock.mockResolvedValue({ data: { success: true }, error: null });
    await decrementStock([{ id: 'catalog-abc', quantity: 1 }, { id: 'p1', quantity: 1 }]);
    expect(rpcMock).toHaveBeenCalledWith('decrement_shop_stock_batch', {
      p_lines: [{ product_id: 'p1', quantity: 1 }],
    });
  });

  it('uniquement des lignes catalogue -> aucun appel RPC, succès trivial', async () => {
    const result = await decrementStock([{ id: 'catalog-abc', quantity: 1 }]);
    expect(result).toEqual({ ok: true });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('tableau vide -> aucun appel RPC, succès trivial', async () => {
    const result = await decrementStock([]);
    expect(result).toEqual({ ok: true });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('RPC renvoie success:false (stock insuffisant) -> résultat FAIL exploitable par l\'appelant, jamais silencieux', async () => {
    rpcMock.mockResolvedValue({
      data: { success: false, reason: 'INSUFFICIENT_STOCK', product_id: 'p1' },
      error: null,
    });
    const result = await decrementStock([{ id: 'p1', quantity: 99 }]);
    expect(result).toEqual({ ok: false, reason: 'INSUFFICIENT_STOCK', productId: 'p1' });
  });

  it('erreur réseau/DB sur l\'appel RPC lui-même -> résultat FAIL, jamais un throw', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'connection refused' } });
    const result = await decrementStock([{ id: 'p1', quantity: 1 }]);
    expect(result).toEqual({ ok: false, reason: 'connection refused' });
  });

  // F7 (post-vérification) : la RPC rejette désormais aussi une quantité <= 0
  // (démontré par test réel sur Supabase : sans cette garde, quantité=-1
  // AUGMENTAIT le stock au lieu de le décrémenter). Ce test verrouille
  // uniquement le contrat TypeScript -- decrementStock() ne fait aucune
  // interprétation particulière de ce reason, il le propage tel quel comme
  // n'importe quel autre FAIL, exactement comme INSUFFICIENT_STOCK.
  it('RPC renvoie success:false (quantité invalide) -> résultat FAIL propagé tel quel', async () => {
    rpcMock.mockResolvedValue({
      data: { success: false, reason: 'INVALID_QUANTITY', product_id: 'p1' },
      error: null,
    });
    const result = await decrementStock([{ id: 'p1', quantity: -1 }]);
    expect(result).toEqual({ ok: false, reason: 'INVALID_QUANTITY', productId: 'p1' });
  });

  // F9/F10 (trouvé par test réel de concurrence contre Supabase, pas anticipé
  // à la conception) : une annulation concurrente peut gagner la course entre
  // la transition pending->paid de handlePaidCheckout et cet appel RPC --
  // sans ce reason, le stock décrémenté pour une commande déjà 'canceled'
  // n'était jamais restauré (perte nette, reproduit réellement : stock resté
  // à 3 au lieu de 5 après un cycle paiement+annulation concurrents). Ce test
  // verrouille uniquement le contrat TypeScript -- même propagation générique
  // que les autres reasons, aucune interprétation spéciale nécessaire ici.
  it('RPC renvoie success:false (commande plus payable, course perdue contre une annulation concurrente) -> résultat FAIL propagé tel quel', async () => {
    rpcMock.mockResolvedValue({
      data: { success: false, reason: 'ORDER_NOT_PAYABLE' },
      error: null,
    });
    const result = await decrementStock([{ id: 'p1', quantity: 1 }], 'order-1');
    expect(result).toEqual({ ok: false, reason: 'ORDER_NOT_PAYABLE', productId: undefined });
  });

  // F9/F10 : orderId transmis -> p_order_id passé à la RPC pour que
  // decrement_shop_stock_batch marque atomiquement les lignes réellement
  // décrémentées (seule source de vérité pour la restauration ultérieure).
  it('orderId fourni -> p_order_id transmis à la RPC', async () => {
    rpcMock.mockResolvedValue({ data: { success: true }, error: null });
    await decrementStock([{ id: 'p1', quantity: 1 }], 'order-42');
    expect(rpcMock).toHaveBeenCalledWith('decrement_shop_stock_batch', {
      p_lines: [{ product_id: 'p1', quantity: 1 }],
      p_order_id: 'order-42',
    });
  });

  it('orderId omis -> aucune clé p_order_id dans le payload (comportement F7 strictement inchangé)', async () => {
    rpcMock.mockResolvedValue({ data: { success: true }, error: null });
    await decrementStock([{ id: 'p1', quantity: 1 }]);
    const payload = rpcMock.mock.calls[0][1];
    expect('p_order_id' in payload).toBe(false);
  });
});

describe('cancelShopOrderAtomic — transition atomique + restauration de stock (F9/F10)', () => {
  it('commande pending -> canceled : restocked:false', async () => {
    rpcMock.mockResolvedValue({ data: { success: true, restocked: false }, error: null });
    const result = await cancelShopOrderAtomic('order-1');
    expect(result).toEqual({ ok: true, restocked: false });
    expect(rpcMock).toHaveBeenCalledWith('cancel_shop_order', { p_order_id: 'order-1' });
  });

  it('commande paid -> canceled : restocked:true, payment_intent_id transmis tel que renvoyé par la RPC', async () => {
    rpcMock.mockResolvedValue({
      data: { success: true, restocked: true, payment_intent_id: 'pi_abc' },
      error: null,
    });
    const result = await cancelShopOrderAtomic('order-1');
    expect(result).toEqual({ ok: true, restocked: true, paymentIntentId: 'pi_abc' });
  });

  it('RPC renvoie success:false (NOT_CANCELABLE) -> résultat FAIL exploitable, jamais silencieux', async () => {
    rpcMock.mockResolvedValue({ data: { success: false, reason: 'NOT_CANCELABLE' }, error: null });
    const result = await cancelShopOrderAtomic('order-1');
    expect(result).toEqual({ ok: false, reason: 'NOT_CANCELABLE' });
  });

  it('erreur réseau/DB sur l\'appel RPC -> résultat FAIL, jamais un throw', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'connection refused' } });
    const result = await cancelShopOrderAtomic('order-1');
    expect(result).toEqual({ ok: false, reason: 'connection refused' });
  });
});
