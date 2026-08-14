import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// P0-3.9.7 — Route /api/shop/connect. Mocks uniquement, aucun appel
// réseau réel (Stripe, Supabase). Couvre le comportement country-aware
// réel (pas seulement "la fonction accepte un paramètre country") et la
// non-régression du flux historique.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
}));

function makeSupabaseChain(siteResponse: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(async () => siteResponse);
  chain.update = vi.fn(() => chain);
  return chain;
}

const fromMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));

const createOnboardingMock = vi.fn();
vi.mock('@/lib/payments', async () => {
  const actual = await vi.importActual<typeof import('@/lib/payments')>('@/lib/payments');
  return {
    ...actual,
    getProvider: vi.fn(() => ({ createOnboarding: createOnboardingMock })),
  };
});

import { POST } from '../route';

function makeRequest(body: unknown) {
  return new Request('https://woorri.test/api/shop/connect', {
    method: 'POST',
    headers: { authorization: 'Bearer fake-token' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
  createOnboardingMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { email: 'owner@site.test' } }, error: null });
  fromMock.mockReturnValue(makeSupabaseChain({ data: { id: 'site-1' }, error: null }));
  createOnboardingMock.mockResolvedValue({ url: 'https://connect.stripe.test/onboard', accountId: 'acct_123' });
});

describe('POST /api/shop/connect — pays couvert', () => {
  it('country="CA" (couvert) -> succès, provider "stripe" utilisé et persisté', async () => {
    const res = await POST(makeRequest({ slug: 'my-shop', country: 'CA' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.url).toBe('https://connect.stripe.test/onboard');

    // Le provider persisté doit être 'stripe', résolu via le pays — pas un littéral aveugle.
    const updateCall = (fromMock.mock.results.find((r) => (r.value as { update?: unknown }).update) as { value: { update: ReturnType<typeof vi.fn> } } | undefined);
    expect(updateCall?.value.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_provider: 'stripe' })
    );
  });
});

describe('POST /api/shop/connect — pays NON couvert (ex: Tchad)', () => {
  it('country="TD" -> refus explicite 409, AUCUN provider inventé, AUCUN compte créé', async () => {
    const res = await POST(makeRequest({ slug: 'my-shop', country: 'TD' }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toContain('Aucun prestataire de paiement disponible');
    // Le coeur de la preuve : createOnboarding n'est JAMAIS appelé pour un
    // pays non couvert — pas de compte Stripe créé "quand même".
    expect(createOnboardingMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/shop/connect — absence de country (compatibilité historique)', () => {
  it('aucun country fourni -> comportement historique préservé, succès avec "stripe"', async () => {
    const res = await POST(makeRequest({ slug: 'my-shop' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.url).toBe('https://connect.stripe.test/onboard');
    expect(createOnboardingMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/shop/connect — autorisation (non-régression, comportement déjà existant)', () => {
  it('sans token -> 401, jamais de tentative de résolution provider', async () => {
    const req = new Request('https://woorri.test/api/shop/connect', {
      method: 'POST',
      body: JSON.stringify({ slug: 'my-shop', country: 'CA' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(createOnboardingMock).not.toHaveBeenCalled();
  });

  it('utilisateur authentifié mais pas propriétaire du site -> 404, jamais de tentative de résolution provider', async () => {
    fromMock.mockReturnValue(makeSupabaseChain({ data: null, error: { message: 'not found' } }));
    const res = await POST(makeRequest({ slug: 'site-dun-autre', country: 'CA' }));
    expect(res.status).toBe(404);
    expect(createOnboardingMock).not.toHaveBeenCalled();
  });
});
