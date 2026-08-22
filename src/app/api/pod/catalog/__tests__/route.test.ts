import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// LOT K (Mode 3 global, fuites d'info) -- première couverture de cette
// route (aucune avant ce lot). Avant ce correctif, aucune authentification
// n'existait : `price` renvoyé est catalog_products.price (le COÛT
// fournisseur réel, confirmé via checkout/route.ts) -- n'importe qui
// pouvait récupérer le coût Nexiora pour tout le catalogue POD sans jeton.

const requireSiteOwnerMock = vi.fn();
vi.mock('@/lib/auth/require-site-owner', () => ({
  requireSiteOwner: (...args: unknown[]) => requireSiteOwnerMock(...args),
}));

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.not = vi.fn(self);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { GET } from '../route';

function req(qs: string) {
  return new Request(`https://woorri.test/api/pod/catalog${qs}`, {
    headers: { authorization: 'Bearer test-token' },
  });
}

beforeEach(() => {
  requireSiteOwnerMock.mockReset();
  fromMock.mockReset();
  fromMock.mockReturnValue(tableChain({ data: [], error: null }));
});

describe('GET /api/pod/catalog — LOT K : authentification obligatoire (expose le coût fournisseur réel)', () => {
  it('slug absent -> 400, requireSiteOwner jamais appelé, aucune requête DB', async () => {
    const res = await GET(req(''));
    expect(res.status).toBe(400);
    expect(requireSiteOwnerMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('non authentifié / non propriétaire du site -> requireSiteOwner tranche, sa réponse est renvoyée telle quelle, aucune requête catalog_products', async () => {
    requireSiteOwnerMock.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Non authentifie.' }, { status: 401 }) });
    const res = await GET(req('?slug=boutique'));
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('propriétaire vérifié -> 200, le catalogue est bien interrogé', async () => {
    requireSiteOwnerMock.mockResolvedValue({ ok: true, site: { id: 'site-1' } });
    const res = await GET(req('?slug=boutique'));
    expect(res.status).toBe(200);
    expect(requireSiteOwnerMock).toHaveBeenCalledWith(expect.anything(), 'boutique');
  });
});
