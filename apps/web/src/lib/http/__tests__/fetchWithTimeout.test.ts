import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout, DEFAULT_FETCH_TIMEOUT_MS } from '../fetchWithTimeout';

// Audit timeouts fournisseurs -- verrouille le comportement réel du point
// de correction central (cjFetch, glFetch, pfFetch, pyFetch en dépendent
// tous). Utilise le vrai AbortSignal.timeout() natif (aucun mock du
// mécanisme d'abort lui-même) contre un fetch mocké qui ne résout jamais,
// pour prouver un rejet réel dans le délai, pas seulement la présence du
// code.

describe('fetchWithTimeout', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('appel nominal : résout normalement si fetch répond avant le délai', async () => {
    const fakeResponse = new Response('{}', { status: 200 });
    global.fetch = vi.fn().mockResolvedValue(fakeResponse);

    const res = await fetchWithTimeout('https://example.test/x', {}, 5000);
    expect(res).toBe(fakeResponse);
  });

  it('timeout : rejette après le délai configuré si fetch ne résout jamais', async () => {
    // fetch() réel : ne résout que si le signal est abandonné, exactement
    // le contrat AbortSignal -- reproduit le comportement réel de undici.
    global.fetch = vi.fn((url: any, init: any) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new DOMException('The operation was aborted.', 'TimeoutError');
          reject(err);
        });
      });
    }) as any;

    const start = Date.now();
    await expect(fetchWithTimeout('https://example.test/hang', {}, 50)).rejects.toThrow();
    const elapsed = Date.now() - start;
    // Respect du délai maximal : ne doit jamais attendre significativement
    // plus que le timeout configuré (marge large pour l'exécution du test).
    expect(elapsed).toBeLessThan(500);
  });

  it("erreur réseau : une vraie rejection fetch (DNS/connexion) se propage sans attendre le timeout", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(fetchWithTimeout('https://example.test/dns-fail', {}, 5000)).rejects.toThrow('fetch failed');
  });

  it('délai par défaut appliqué si aucun timeoutMs explicite', async () => {
    let capturedSignal: AbortSignal | undefined;
    global.fetch = vi.fn((url: any, init: any) => {
      capturedSignal = init.signal;
      return Promise.resolve(new Response('{}'));
    }) as any;

    await fetchWithTimeout('https://example.test/default', {});
    expect(capturedSignal).toBeDefined();
    expect(DEFAULT_FETCH_TIMEOUT_MS).toBe(15_000);
  });

  it('ne modifie pas les autres options fetch (method, headers, body transmis intacts)', async () => {
    let capturedInit: any;
    global.fetch = vi.fn((url: any, init: any) => {
      capturedInit = init;
      return Promise.resolve(new Response('{}'));
    }) as any;

    await fetchWithTimeout('https://example.test/post', {
      method: 'POST',
      headers: { 'X-Test': '1' },
      body: 'payload',
    }, 3000);

    expect(capturedInit.method).toBe('POST');
    expect(capturedInit.headers).toEqual({ 'X-Test': '1' });
    expect(capturedInit.body).toBe('payload');
    expect(capturedInit.signal).toBeInstanceOf(AbortSignal);
  });
});
