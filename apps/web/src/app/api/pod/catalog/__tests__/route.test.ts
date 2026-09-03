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
    // LOT 2 -- `dropship_type` AJOUTE a la fixture, meme constat qu'ailleurs :
    // elle decrivait un site sans sous-type, forme qui n'existe pas pour
    // l'unique appelant reel de cette route (le bloc « Mes Designs POD » de
    // l'editeur, rendu sous `pod_brand`). L'assertion de ce cas -- « le
    // catalogue est bien interroge » -- est inchangee.
    requireSiteOwnerMock.mockResolvedValue({ ok: true, site: { id: 'site-1', dropship_type: 'pod_brand' } });
    const res = await GET(req('?slug=boutique'));
    expect(res.status).toBe(200);
    expect(requireSiteOwnerMock).toHaveBeenCalledWith(expect.anything(), 'boutique', expect.stringContaining('dropship_type'));
  });
});

// ============================================================
// LOT 2 -- LE CATALOGUE DE SUPPORTS EST RESERVE A `pod_brand`.
//
// La propriete seule ne suffisait pas : tout proprietaire de site pouvait
// lister le catalogue Printful complet. Meme garde que `generate-mockups`,
// l'autre moitie du meme mecanisme -- et son unique appelant reel est le
// bloc « Mes Designs POD » de l'editeur, rendu sous `pod_brand`.
// ============================================================
async function appelAvecSite(site: Record<string, unknown>) {
  requireSiteOwnerMock.mockResolvedValue({ ok: true, site });
  return GET(req('?slug=ma-marque'));
}

describe('GET /api/pod/catalog — LOT 2 : reserve au mecanisme des supports POD', () => {
  it.each([
    ['Mode 3 reseller', 'reseller'],
    ['Mode 3 pod_custom', 'pod_custom'],
    ['sans sous-type', null],
    ['sous-type inconnu', 'legacy_x'],
  ])('proprietaire legitime mais %s -> 403, aucun catalogue fournisseur expose', async (_l, dt) => {
    const res = await appelAvecSite({ id: 'site-1', dropship_type: dt });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Cette action est réservée aux boutiques POD Brand.' });
  });

  it('INVARIANT B — un pod_brand conserve son catalogue de supports', async () => {
    const res = await appelAvecSite({ id: 'site-1', dropship_type: 'pod_brand' });
    expect(res.status).toBe(200);
  });
});
