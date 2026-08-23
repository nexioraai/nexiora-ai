import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================
// M1-02 -- premiere couverture de /api/contact.
//
// Avant correctif, cette route publique et NON AUTHENTIFIEE construisait le
// corps de l'e-mail par concatenation de chaines, avec `name`, `email` et
// `site.name` inseres BRUTS. N'importe qui pouvait donc injecter du HTML dans
// un message envoye au marchand DEPUIS le domaine de la plateforme, donc
// signe DKIM par deribfy.com. Aucune borne de longueur, aucune validation de
// format, aucune limitation de debit.
// ============================================================

function tableChain(response: { data?: unknown; error?: unknown; count?: number }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.single = vi.fn(async () => response);
  chain.maybeSingle = vi.fn(async () => response);
  chain.gte = vi.fn(async () => response);
  chain.insert = vi.fn(async () => ({ error: null }));
  return chain;
}

const { fromMock, recent } = vi.hoisted(() => ({ fromMock: vi.fn(), recent: { value: 0 } }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (...a: unknown[]) => fromMock(...(a as [string])) }),
}));

const sendMock = vi.fn();
vi.mock('resend', () => ({ Resend: class { emails = { send: (...a: unknown[]) => sendMock(...a) }; } }));
vi.mock('@/lib/anomaly', () => ({ logAnomaly: vi.fn() }));

import { POST } from '../route';

const SITE = { id: 'site-1', name: 'Ma Boutique', contact: { email: 'marchand@test.com' } };

beforeEach(() => {
  fromMock.mockReset();
  sendMock.mockReset();
  recent.value = 0;
  fromMock.mockImplementation((table: string) => {
    if (table === 'sites') return tableChain({ data: SITE, error: null });
    if (table === 'checkout_anomalies') return tableChain({ count: recent.value });
    if (table === 'messages') return tableChain({});
    throw new Error('table inattendue: ' + table);
  });
});

const req = (body: unknown) =>
  new NextRequest('https://deribfy.test/api/contact', { method: 'POST', body: JSON.stringify(body) });

const OK = { slug: 's', name: 'Alice', email: 'alice@test.com', message: 'Bonjour' };

describe('M1-02 — injection HTML dans l’e-mail marchand', () => {
  it('un nom hostile ne produit AUCUNE balise dans le HTML envoyé', async () => {
    await POST(req({ ...OK, name: '<img src=x onerror=alert(1)>' }));
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');                 // neutralise, pas supprime
  });

  it('un e-mail hostile ne peut plus sortir de l’attribut href', async () => {
    await POST(req({ ...OK, email: 'a@b.co' }));
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).toContain('href="mailto:a@b.co"');
    // Le guillemet, seul caractere permettant de sortir de l'attribut, est echappe.
    expect(html).not.toMatch(/href="mailto:[^"]*"[^>]*on\w+=/);
  });

  it('le nom du site (contrôlé par le marchand) est échappé lui aussi', async () => {
    fromMock.mockImplementation((t: string) =>
      t === 'sites'
        ? tableChain({ data: { ...SITE, name: '<script>x</script>' }, error: null })
        : tableChain({ count: 0 })
    );
    await POST(req(OK));
    expect(sendMock.mock.calls[0][0].html as string).not.toContain('<script>');
  });

  it('le message multi-lignes est rendu en entier (le .replace sans /g n’en traitait qu’un)', async () => {
    await POST(req({ ...OK, message: 'a\nb\nc' }));
    const html = sendMock.mock.calls[0][0].html as string;
    expect((html.match(/<br \/>/g) || []).length).toBe(2);
  });
});

describe('M1-02 — validation d’entrée', () => {
  it.each([
    ['e-mail sans @', { email: 'pasunemail' }],
    ['e-mail avec saut de ligne (injection d’en-tête)', { email: 'a@b.co\nBcc: victime@x.com' }],
    ['e-mail avec chevron', { email: '<a@b.co>' }],
  ])('%s -> 400, aucun e-mail envoyé', async (_l, over) => {
    const res = await POST(req({ ...OK, ...over }));
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it.each([
    ['nom', { name: 'a'.repeat(121) }],
    ['message', { message: 'a'.repeat(5001) }],
    ['e-mail', { email: 'a'.repeat(250) + '@b.co' }],
  ])('%s trop long -> 400', async (_l, over) => {
    expect((await POST(req({ ...OK, ...over }))).status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('entrée légitime -> 200 et e-mail envoyé', async () => {
    const res = await POST(req(OK));
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});

describe('M1-02 — borne de débit', () => {
  it('sous la borne -> envoyé', async () => {
    recent.value = 19;
    expect((await POST(req(OK))).status).toBe(200);
  });

  it('borne atteinte -> 429, AUCUN e-mail (boîte du marchand protégée)', async () => {
    recent.value = 20;
    const res = await POST(req(OK));
    expect(res.status).toBe(429);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
