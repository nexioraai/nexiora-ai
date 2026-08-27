import { describe, it, expect } from 'vitest';
import { isProviderOrderTransitionAllowed } from '../transition-rules';

// P0-3.7W/X — modèle catégoriel. Reproduit les scénarios de stress-test
// conceptuel de P0-3.7T à Z (self-attack, Phase 17).

describe('isProviderOrderTransitionAllowed — progression', () => {
  it('accepte la progression normale pending -> processing', () => {
    expect(isProviderOrderTransitionAllowed('pending', 'processing').allowed).toBe(true);
  });

  it('accepte la progression avec saut (pending -> shipped)', () => {
    expect(isProviderOrderTransitionAllowed('pending', 'shipped').allowed).toBe(true);
  });

  it('accepte processing -> shipped -> in_transit -> delivered', () => {
    expect(isProviderOrderTransitionAllowed('processing', 'shipped').allowed).toBe(true);
    expect(isProviderOrderTransitionAllowed('shipped', 'in_transit').allowed).toBe(true);
    expect(isProviderOrderTransitionAllowed('in_transit', 'delivered').allowed).toBe(true);
  });
});

describe('isProviderOrderTransitionAllowed — régression rejetée (Attack 4/5, P0-3.7T/V/Z)', () => {
  it('rejette shipped -> processing', () => {
    const r = isProviderOrderTransitionAllowed('shipped', 'processing');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('REGRESSION_REJECTED');
  });

  it('rejette delivered -> shipped', () => {
    expect(isProviderOrderTransitionAllowed('delivered', 'shipped').allowed).toBe(false);
  });

  it('rejette in_transit -> pending', () => {
    expect(isProviderOrderTransitionAllowed('in_transit', 'pending').allowed).toBe(false);
  });
});

describe('isProviderOrderTransitionAllowed — branche failed (P0-3.7W Partie 3)', () => {
  it('accepte processing -> failed', () => {
    expect(isProviderOrderTransitionAllowed('processing', 'failed').allowed).toBe(true);
  });
  it('accepte shipped -> failed', () => {
    expect(isProviderOrderTransitionAllowed('shipped', 'failed').allowed).toBe(true);
  });
  it('rejette delivered -> failed (succès terminal, P0-3.7X Partie 3)', () => {
    expect(isProviderOrderTransitionAllowed('delivered', 'failed').allowed).toBe(false);
  });
});

describe('isProviderOrderTransitionAllowed — unrecognized (P0-3.7X Partie 7-8)', () => {
  it('accepte toute entrée vers unrecognized', () => {
    expect(isProviderOrderTransitionAllowed('shipped', 'unrecognized').allowed).toBe(true);
  });
  it('accepte toute sortie depuis unrecognized (mapping corrigé plus tard)', () => {
    expect(isProviderOrderTransitionAllowed('unrecognized', 'shipped').allowed).toBe(true);
  });
});

describe('isProviderOrderTransitionAllowed — idempotence (duplicate webhook, P0-3.7V/W Partie 8)', () => {
  it('no-op accepté : même statut deux fois', () => {
    const r = isProviderOrderTransitionAllowed('shipped', 'shipped');
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('NO_OP');
  });
});

describe('Self-attack Phase 17 — Attack 4/5', () => {
  it('Attack 4 : PROCESSING -> SHIPPED -> PROCESSING (dernier rejeté)', () => {
    expect(isProviderOrderTransitionAllowed('processing', 'shipped').allowed).toBe(true);
    expect(isProviderOrderTransitionAllowed('shipped', 'processing').allowed).toBe(false);
  });
  it('Attack 5 : DELIVERED -> SHIPPED (rejeté)', () => {
    expect(isProviderOrderTransitionAllowed('delivered', 'shipped').allowed).toBe(false);
  });
});
