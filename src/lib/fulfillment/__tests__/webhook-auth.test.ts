import { describe, it, expect } from 'vitest';
import { verifyWebhookSecret } from '../webhook-auth';

// LOT I (F-I-1) -- verrouille le comportement fail-closed partagé par les
// webhooks Printful et Gelato : aucun secret configuré côté serveur =
// toujours rejeté, quel que soit ce que la requête fournit.

function req(opts: { header?: string; query?: string } = {}) {
  const url = opts.query
    ? `https://woorri.test/api/webhooks/x?secret=${encodeURIComponent(opts.query)}`
    : 'https://woorri.test/api/webhooks/x';
  const headers: Record<string, string> = {};
  if (opts.header) headers['x-webhook-secret'] = opts.header;
  return new Request(url, { method: 'POST', headers });
}

describe('verifyWebhookSecret', () => {
  it('expectedSecret absent (undefined) -> false, même avec un secret correct fourni', () => {
    expect(verifyWebhookSecret(req({ header: 'anything' }), undefined)).toBe(false);
  });

  it('expectedSecret vide (chaîne vide) -> false', () => {
    expect(verifyWebhookSecret(req({ header: 'anything' }), '')).toBe(false);
  });

  it('aucun secret fourni côté requête -> false', () => {
    expect(verifyWebhookSecret(req(), 's3cr3t')).toBe(false);
  });

  it('secret correct via en-tête X-Webhook-Secret -> true', () => {
    expect(verifyWebhookSecret(req({ header: 's3cr3t' }), 's3cr3t')).toBe(true);
  });

  it('secret correct via ?secret= (repli) -> true', () => {
    expect(verifyWebhookSecret(req({ query: 's3cr3t' }), 's3cr3t')).toBe(true);
  });

  it("en-tête prioritaire sur la query si les deux sont fournis et divergent", () => {
    const r = new Request('https://woorri.test/api/webhooks/x?secret=wrong-in-query', {
      method: 'POST',
      headers: { 'x-webhook-secret': 'correct-in-header' },
    });
    expect(verifyWebhookSecret(r, 'correct-in-header')).toBe(true);
  });

  it('secret incorrect (mauvaise valeur) -> false', () => {
    expect(verifyWebhookSecret(req({ header: 'wrong' }), 's3cr3t')).toBe(false);
  });

  it('secret de longueur différente (évite un crash timingSafeEqual sur buffers de tailles différentes) -> false', () => {
    expect(verifyWebhookSecret(req({ header: 'short' }), 'a-much-longer-expected-secret-value')).toBe(false);
  });

  it('sensible à la casse', () => {
    expect(verifyWebhookSecret(req({ header: 'S3CR3T' }), 's3cr3t')).toBe(false);
  });
});
