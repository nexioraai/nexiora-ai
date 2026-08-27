// src/app/api/shop/__tests__/mode1Admission.test.ts
//
// PHASE M1-4 — admission commerciale sur les portes d'ECRITURE marchandes.
//
// ============================================================
// LA CONDITION DE MODE EST ISOLEE, ET C'EST TOUT L'INTERET.
//
// `require-site-owner` est mocke : la propriete est donc TOUJOURS accordee,
// et le site est TOUJOURS trouve. Le seul parametre qui varie d'un cas a
// l'autre est `sites.mode`.
//
// Sans cette isolation, un refus pourrait venir d'une absence de proprietaire,
// d'un `payment_account_id` manquant ou d'un produit inexistant — et ne
// prouverait rien de la frontiere Mode 1. C'est exactement le faux verrou que
// le chantier interdit de compter comme protection.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const site = { id: 'site-1', mode: 1 as unknown };
vi.mock('@/lib/auth/require-site-owner', () => ({
  requireSiteOwner: async () => ({ ok: true, site, email: 'o@test.com' }),
  requireSiteOwnerById: async () => ({ ok: true, site, email: 'o@test.com' }),
}));

const createProductMock = vi.fn();
const updateProductMock = vi.fn();
const deleteProductMock = vi.fn();
vi.mock('@/lib/shop', () => ({
  createProduct: (...a: unknown[]) => createProductMock(...a),
  updateProduct: (...a: unknown[]) => updateProductMock(...a),
  deleteProduct: (...a: unknown[]) => deleteProductMock(...a),
  getProduct: async () => ({ id: 'p1', site_id: 'site-1', name: 'T', price: 10, stock: 5 }),
  getAllProducts: async () => [],
}));

const fromMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    accounts: { create: async () => ({ id: 'acct_1' }) },
    accountLinks: { create: async () => ({ url: 'https://stripe.test/onboard' }) },
  }),
}));

import { POST as productsPOST } from '../products/route';
import { PATCH as productPATCH, DELETE as productDELETE } from '../products/[id]/route';
import { POST as connectPOST } from '../connect/route';
import { PATCH as shippingPATCH } from '../shipping/route';

function chain() {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const m of ['select', 'eq', 'update', 'insert', 'single', 'maybeSingle']) c[m] = vi.fn(self);
  c.single = vi.fn(async () => ({ data: { id: 'site-1' }, error: null }));
  c.maybeSingle = vi.fn(async () => ({ data: { id: 'site-1' }, error: null }));
  c.then = (r: (v: unknown) => void) => r({ data: null, error: null });
  return c;
}

const req = (body: unknown, method = 'POST') =>
  new Request('https://woorri.test/api', { method, body: JSON.stringify(body) });
// DETTE 6d — `requireProductOwner` verifie desormais la FORME de
// l'identifiant avant toute requete : un segment d'URL qui n'est pas un
// uuid ne designe aucun produit. `'p1'` decrivait une URL qu'aucun produit
// reel ne peut porter. Fixture seule -- aucune assertion ne change de sens.
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const ctx = { params: Promise.resolve({ id: PRODUCT_ID }) };

beforeEach(() => {
  fromMock.mockReset().mockImplementation(chain);
  createProductMock.mockReset().mockResolvedValue({ id: 'p1' });
  updateProductMock.mockReset().mockResolvedValue({ id: 'p1' });
  deleteProductMock.mockReset().mockResolvedValue(undefined);
});

/** Les quatre portes d'ecriture marchandes couvertes par M1-4. */
const PORTES: [string, (m: unknown) => Promise<Response>][] = [
  ['POST shop/products', async (m) => { site.mode = m; return productsPOST(req({ slug: 'b', name: 'T', price: 10 })); }],
  ['PATCH shop/products/[id]', async (m) => { site.mode = m; return productPATCH(req({ name: 'X' }, 'PATCH'), ctx); }],
  ['DELETE shop/products/[id]', async (m) => { site.mode = m; return productDELETE(req({}, 'DELETE'), ctx); }],
  ['POST shop/connect', async (m) => { site.mode = m; return connectPOST(req({ slug: 'b' })); }],
  ['PATCH shop/shipping', async (m) => { site.mode = m; return shippingPATCH(req({ slug: 'b', shippingFlat: 5 }, 'PATCH')); }],
];

describe('M1-4 — Mode 1 refusé sur toutes les portes d’écriture commerciale', () => {
  it.each(PORTES)('%s : mode 1 -> 403', async (_nom, appel) => {
    const res = await appel(1);
    expect(
      res.status,
      "le refus doit venir de la frontière de mode, pas d'une donnée manquante : la propriété est accordée et le site est trouvé"
    ).toBe(403);
  });

  it.each(PORTES)('%s : mode 1 -> AUCUNE écriture commerciale', async (_nom, appel) => {
    await appel(1);
    expect(createProductMock).not.toHaveBeenCalled();
    expect(updateProductMock).not.toHaveBeenCalled();
    expect(deleteProductMock).not.toHaveBeenCalled();
  });
});

describe('M1-4 — les modes commerçants restent autorisés (contrôle positif)', () => {
  it.each(PORTES)('%s : mode 2 -> jamais 403', async (_nom, appel) => {
    const res = await appel(2);
    expect(res.status, 'une boutique doit pouvoir exercer : une garde qui refuse tout est une panne').not.toBe(403);
  });

  it.each(PORTES)('%s : mode 3 -> jamais 403', async (_nom, appel) => {
    const res = await appel(3);
    expect(res.status, "le Mode 3 commerce aussi : l'admission oppose 1 à {2,3}").not.toBe(403);
  });
});

describe('M1-4 — fail-closed : un mode inattendu est refusé', () => {
  it.each(PORTES)('%s : mode null -> 403', async (_nom, appel) => {
    expect((await appel(null)).status).toBe(403);
  });

  it.each(PORTES)('%s : mode 4 (futur) -> 403', async (_nom, appel) => {
    expect((await appel(4)).status).toBe(403);
  });
});
