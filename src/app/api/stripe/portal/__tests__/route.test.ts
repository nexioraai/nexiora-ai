import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// P0-3.9.7 — Route /api/stripe/portal. Avant correction : n'importe qui
// pouvait ouvrir le portail de facturation Stripe de n'importe quel site
// via un `siteSlug` deviné, sans authentification ni vérification de
// propriété. Ces tests démontrent le scénario réel (site A vs site B),
// pas seulement "une fonction a été ajoutée".
// ============================================================

const requireSiteOwnerMock = vi.fn();
vi.mock('@/lib/auth/require-site-owner', () => ({
  requireSiteOwner: (...args: unknown[]) => requireSiteOwnerMock(...args),
}));

const createSessionMock = vi.fn();
vi.mock('stripe', () => ({
  default: class {
    billingPortal = { sessions: { create: (...args: unknown[]) => createSessionMock(...args) } };
  },
}));

import { POST } from '../route';

function makeRequest(body: unknown, token?: string) {
  return new NextRequest('https://woorri.test/api/stripe/portal', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireSiteOwnerMock.mockReset();
  createSessionMock.mockReset();
  createSessionMock.mockResolvedValue({ url: 'https://billing.stripe.test/session' });
});

describe('POST /api/stripe/portal — utilisateur propriétaire (cas autorisé)', () => {
  it('site A, propriétaire de A -> succès, session créée pour le bon customer', async () => {
    requireSiteOwnerMock.mockResolvedValue({
      ok: true,
      site: { id: 'site-A', stripe_customer_id: 'cus_A' },
      email: 'owner-a@test.com',
    });

    const res = await POST(makeRequest({ siteSlug: 'site-a' }, 'token-owner-a'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.url).toBe('https://billing.stripe.test/session');
    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_A' })
    );
  });
});

describe('POST /api/stripe/portal — utilisateur d\'un AUTRE site (le scénario d\'abus réel)', () => {
  it('propriétaire du site A tente le siteSlug du site B -> refus, aucune session créée', async () => {
    // requireSiteOwner() est le point qui, avec les vraies données, refuse
    // ce cas : owner_email du site B ne correspond pas au token du site A.
    requireSiteOwnerMock.mockResolvedValue({
      ok: false,
      response: new NextResponse(
        JSON.stringify({ error: 'Acces refuse.' }),
        { status: 403 }
      ),
    });

    const res = await POST(makeRequest({ siteSlug: 'site-b' }, 'token-owner-a'));

    expect(res.status).toBe(403);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/stripe/portal — non authentifié', () => {
  it('aucun token -> refus, aucune session créée', async () => {
    requireSiteOwnerMock.mockResolvedValue({
      ok: false,
      response: new NextResponse(
        JSON.stringify({ error: 'Non authentifie.' }),
        { status: 401 }
      ),
    });

    const res = await POST(makeRequest({ siteSlug: 'site-a' }));

    expect(res.status).toBe(401);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/stripe/portal — non-régression', () => {
  it('site sans stripe_customer_id -> 404, comportement historique préservé', async () => {
    requireSiteOwnerMock.mockResolvedValue({
      ok: true,
      site: { id: 'site-A' },
      email: 'owner-a@test.com',
    });

    const res = await POST(makeRequest({ siteSlug: 'site-a' }, 'token-owner-a'));
    expect(res.status).toBe(404);
  });

  it('siteSlug manquant -> 400, comportement historique préservé', async () => {
    const res = await POST(makeRequest({}, 'token-owner-a'));
    expect(res.status).toBe(400);
    expect(requireSiteOwnerMock).not.toHaveBeenCalled();
  });
});
