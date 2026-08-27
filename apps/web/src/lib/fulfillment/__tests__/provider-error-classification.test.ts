import { describe, it, expect } from 'vitest';
import { classifyProviderError } from '../provider-error-classification';

describe('classifyProviderError — codes HTTP réels (pfFetch/glFetch)', () => {
  it('Printful 422 -> permanent', () => {
    expect(classifyProviderError('Printful 422: validation failed')).toBe('permanent');
  });
  it('Printful 404 -> permanent', () => {
    expect(classifyProviderError('Printful 404: not found')).toBe('permanent');
  });
  it('Printful 429 (rate limit) -> unknown, jamais permanent', () => {
    expect(classifyProviderError('Printful 429: too many requests')).toBe('unknown');
  });
  it('Printful 500 -> unknown (transitoire probable, jamais classé permanent)', () => {
    expect(classifyProviderError('Printful 500: internal error')).toBe('unknown');
  });
  it('Gelato 400 /v2/orders -> permanent', () => {
    expect(classifyProviderError('Gelato 400 /v2/orders: bad request')).toBe('permanent');
  });
  it('Gelato 503 /v2/orders -> unknown', () => {
    expect(classifyProviderError('Gelato 503 /v2/orders: service unavailable')).toBe('unknown');
  });
});

describe('classifyProviderError — messages de validation Gelato connus (cités depuis le code)', () => {
  it('design manquant -> permanent', () => {
    expect(classifyProviderError('Aucun design (fileUrl) fourni pour Gelato')).toBe('permanent');
  });
  it('deliveryPromiseId manquant -> permanent', () => {
    expect(classifyProviderError('Gelato: aucun deliveryPromiseId au quote')).toBe('permanent');
  });
});

describe('classifyProviderError — inconnu par défaut, jamais inventé', () => {
  it('erreur réseau sans code HTTP -> unknown', () => {
    expect(classifyProviderError('fetch failed: ECONNRESET')).toBe('unknown');
  });
  it('message vide/undefined -> unknown', () => {
    expect(classifyProviderError(undefined)).toBe('unknown');
    expect(classifyProviderError('')).toBe('unknown');
  });
});
