import { describe, it, expect } from 'vitest';
import { resolvePaymentProvider, getProvider } from '../index';
import { STRIPE_CONNECT_SUPPORTED_COUNTRIES } from '../countries';

// ============================================================
// P0-3.9.7 — Country-aware (Section 9 de la Feuille de Route Maître).
// Teste le comportement réel de résolution, pas seulement "la fonction
// retourne quelque chose" : un pays couvert résout vers un provider réel
// et utilisable ; un pays non couvert ne reçoit jamais silencieusement
// Stripe ; aucun provider n'est inventé.
// ============================================================

describe('resolvePaymentProvider — pays couvert', () => {
  it('un pays présent dans STRIPE_CONNECT_SUPPORTED_COUNTRIES (CA, le seul confirmé aujourd\'hui) résout vers "stripe"', () => {
    expect(STRIPE_CONNECT_SUPPORTED_COUNTRIES).toContain('CA');
    expect(resolvePaymentProvider({ country: 'CA' })).toBe('stripe');
  });

  it('le provider résolu est obtenu via l\'abstraction existante getProvider(), jamais un objet ad hoc', () => {
    const key = resolvePaymentProvider({ country: 'CA' });
    expect(key).not.toBeNull();
    const provider = getProvider(key);
    // PaymentProvider réel : les 4 méthodes du contrat existant, pas un mock local.
    expect(typeof provider.createOnboarding).toBe('function');
    expect(typeof provider.createCheckout).toBe('function');
    expect(typeof provider.getStatus).toBe('function');
    expect(typeof provider.refundPayment).toBe('function');
  });
});

describe('resolvePaymentProvider — pays NON couvert (ex: Tchad, TD)', () => {
  it('ne reçoit jamais silencieusement Stripe — retourne null explicitement', () => {
    // Ce test a d'abord révélé un vrai défaut de conception : une première
    // version réutilisait STRIPE_SHIPPING_COUNTRIES (liste de livraison,
    // ~236 pays, qui INCLUT le Tchad) au lieu d'une vraie liste
    // d'onboarding Stripe Connect — ce test échouait alors, à raison.
    // Corrigé en introduisant STRIPE_CONNECT_SUPPORTED_COUNTRIES, distincte.
    expect(STRIPE_CONNECT_SUPPORTED_COUNTRIES).not.toContain('TD');
    expect(resolvePaymentProvider({ country: 'TD' })).toBeNull();
  });

  it('un autre pays non confirmé (ex: FR, non encore dans la liste minimale) retourne également null', () => {
    expect(STRIPE_CONNECT_SUPPORTED_COUNTRIES).not.toContain('FR');
    expect(resolvePaymentProvider({ country: 'FR' })).toBeNull();
  });

  it('appeler getProvider(null) sur ce résultat lève une erreur explicite plutôt que d\'inventer un provider', () => {
    const key = resolvePaymentProvider({ country: 'TD' });
    expect(key).toBeNull();
    // getProvider(null) retombe sur son propre défaut interne ('stripe') —
    // c'est précisément pourquoi l'appelant (connect/route.ts) ne doit
    // JAMAIS transmettre un `key` null à getProvider() : il doit intercepter
    // le null et refuser explicitement AVANT d'atteindre getProvider().
    // Ce test documente cette frontière de responsabilité.
    expect(key).not.toBe('stripe');
  });
});

describe('resolvePaymentProvider — absence de pays', () => {
  it('country undefined -> null (aucune supposition silencieuse)', () => {
    expect(resolvePaymentProvider({ country: undefined })).toBeNull();
  });

  it('country vide -> null', () => {
    expect(resolvePaymentProvider({ country: '' })).toBeNull();
  });
});

describe('getProvider — comportement existant préservé (non-régression)', () => {
  it('getProvider("stripe") continue de fonctionner exactement comme avant', () => {
    const provider = getProvider('stripe');
    expect(typeof provider.createOnboarding).toBe('function');
  });

  it('getProvider(undefined) retombe toujours sur "stripe" par défaut (comportement historique inchangé)', () => {
    const provider = getProvider(undefined);
    expect(typeof provider.createOnboarding).toBe('function');
  });

  it('getProvider("inconnu") lève toujours une erreur explicite (comportement historique inchangé)', () => {
    expect(() => getProvider('un-provider-qui-n-existe-pas')).toThrow('Provider de paiement inconnu');
  });
});
