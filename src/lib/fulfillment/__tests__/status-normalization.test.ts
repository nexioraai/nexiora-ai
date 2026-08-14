import { describe, it, expect } from 'vitest';
import { normalizeProviderStatus } from '../status-normalization';

describe('normalizeProviderStatus — printful (réutilise PRINTFUL_TRACKING_STATUS_MAP)', () => {
  it('mappe canceled -> failed (aligné sur printful-adapter.ts existant, P0-3.7Y Partie 12)', () => {
    expect(normalizeProviderStatus('printful', 'canceled')).toBe('failed');
  });
  it('mappe onhold -> processing (P0-3.7Y : ON_HOLD jamais une catégorie distincte)', () => {
    expect(normalizeProviderStatus('printful', 'onhold')).toBe('processing');
  });
  it('mappe fulfilled -> delivered', () => {
    expect(normalizeProviderStatus('printful', 'fulfilled')).toBe('delivered');
  });
  it('Attack 6 : statut inconnu -> unrecognized, jamais un statut inventé (P0-3.7W Partie 4)', () => {
    expect(normalizeProviderStatus('printful', 'some_new_status_never_seen')).toBe('unrecognized');
  });
});

describe('normalizeProviderStatus — gelato (fonction dédiée, distincte de mapGelatoStatus existant)', () => {
  it('mappe delivered', () => {
    expect(normalizeProviderStatus('gelato', 'delivered')).toBe('delivered');
  });
  it('mappe shipped', () => {
    expect(normalizeProviderStatus('gelato', 'shipped')).toBe('shipped');
  });
  it('mappe canceled -> failed (Attack 7, cohérent avec Printful)', () => {
    expect(normalizeProviderStatus('gelato', 'canceled')).toBe('failed');
  });
  it('mappe onhold -> processing', () => {
    expect(normalizeProviderStatus('gelato', 'onhold')).toBe('processing');
  });
  it('statut inconnu -> unrecognized, PAS un fallback silencieux vers pending (correction du gap identifié dans mapGelatoStatus existant)', () => {
    expect(normalizeProviderStatus('gelato', 'completely_unknown_gelato_status')).toBe('unrecognized');
  });
});

describe('normalizeProviderStatus — fournisseur sans normalizer', () => {
  it('retombe sur unrecognized plutôt que de supposer', () => {
    expect(normalizeProviderStatus('cj', 'anything')).toBe('unrecognized');
  });
});
