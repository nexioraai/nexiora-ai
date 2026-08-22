// Audit Mode 1↔Mode 2 non-régression / préparation Mode 3 — gap réel trouvé :
// createCheckout() n'était jamais testé directement (seule son existence
// l'était, resolvePaymentProvider.test.ts). checkout/route.test.ts vérifie
// uniquement les ARGUMENTS passés à createCheckout (mocké) -- jamais ce que
// createCheckout en fait réellement. Une future évolution Mode 3 de cette
// MÊME fonction (partagée Mode 2/3, aucune branche par mode ici) pourrait
// silencieusement appliquer une commission à une commande Mode 2 (qui doit
// TOUJOURS être 0 -- "pas de commission plateforme" est une règle produit
// Mode 2 explicite) sans qu'aucun test existant ne le détecte. Ces tests
// verrouillent le contrat réel de createCheckout, pas seulement son wrapper
// applicatif.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionsCreateMock = vi.fn();
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    checkout: { sessions: { create: (...a: unknown[]) => sessionsCreateMock(...a) } },
  }),
}));

import { stripeProvider } from '../stripe';
import type { CartItem } from '../types';

const ITEM: CartItem = { id: 'p1', name: 'T-Shirt', priceNumber: 20, currency: 'cad', quantity: 1 };

beforeEach(() => {
  sessionsCreateMock.mockReset();
  sessionsCreateMock.mockResolvedValue({ id: 'sess_1', url: 'https://pay.example/sess_1' });
});

describe('stripeProvider.createCheckout — commission (Mode 2 vs Mode 3), même fonction partagée', () => {
  it('Mode 2 (applicationFeeAmount omis) -> AUCUNE clé application_fee_amount envoyée à Stripe', async () => {
    await stripeProvider.createCheckout('acct_1', 'boutique', [ITEM], 'https://s', 'https://c', 0);
    const params = sessionsCreateMock.mock.calls[0][0];
    expect(params.payment_intent_data).not.toHaveProperty('application_fee_amount');
  });

  it('Mode 2 (applicationFeeAmount = 0 explicite) -> toujours aucune clé envoyée', async () => {
    await stripeProvider.createCheckout('acct_1', 'boutique', [ITEM], 'https://s', 'https://c', 0, 0);
    const params = sessionsCreateMock.mock.calls[0][0];
    expect(params.payment_intent_data).not.toHaveProperty('application_fee_amount');
  });

  it('Mode 3 (applicationFeeAmount > 0) -> commission transmise, arrondie en cents', async () => {
    await stripeProvider.createCheckout('acct_1', 'boutique', [ITEM], 'https://s', 'https://c', 0, 12.345);
    const params = sessionsCreateMock.mock.calls[0][0];
    expect(params.payment_intent_data.application_fee_amount).toBe(1235);
  });

  it('destination du transfert = TOUJOURS le compte connecté du site visité, quel que soit le mode ou la commission', async () => {
    await stripeProvider.createCheckout('acct_specific', 'boutique', [ITEM], 'https://s', 'https://c', 0, 5);
    const params = sessionsCreateMock.mock.calls[0][0];
    expect(params.payment_intent_data.transfer_data).toEqual({ destination: 'acct_specific' });
  });

  it('audit adresse Reseller/CJ partie 7 : phone_number_collection activé sur les deux tentatives (avec et sans Stripe Tax)', async () => {
    await stripeProvider.createCheckout('acct_1', 'boutique', [ITEM], 'https://s', 'https://c', 0, 5);
    const params = sessionsCreateMock.mock.calls[0][0];
    expect(params.phone_number_collection).toEqual({ enabled: true });
  });

  it('repli sans Stripe Tax (automatic_tax échoue) préserve exactement le même transfer_data/application_fee_amount', async () => {
    sessionsCreateMock.mockRejectedValueOnce(new Error('Stripe Tax not enabled'));
    sessionsCreateMock.mockResolvedValueOnce({ id: 'sess_2', url: 'https://pay.example/sess_2' });
    await stripeProvider.createCheckout('acct_1', 'boutique', [ITEM], 'https://s', 'https://c', 0, 5);
    expect(sessionsCreateMock).toHaveBeenCalledTimes(2);
    const firstAttempt = sessionsCreateMock.mock.calls[0][0];
    const retryAttempt = sessionsCreateMock.mock.calls[1][0];
    expect(retryAttempt.payment_intent_data).toEqual(firstAttempt.payment_intent_data);
  });
});
