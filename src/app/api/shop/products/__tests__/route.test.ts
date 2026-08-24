import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Audit Mode 3 global (CRIT-2) -- POST /api/shop/products spreadait tout le
// JSON client (via `...productData`, typé `any`) directement dans
// createProduct(), sans liste blanche. shop_products.cj_vid déclenche une
// VRAIE commande CJ facturée (src/lib/cj/fulfill.ts:325-334) et cost_price
// est la source du garde-fou financier Mode 3 (checkout/route.ts) -- aucun
// des deux n'a de chemin d'écriture légitime ailleurs dans l'application
// (grep exhaustif : aucune UI, aucune route de sync). Ces tests verrouillent
// qu'un marchand ne peut plus les écrire via cette route, même en les
// glissant explicitement dans le body.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const siteLookupMock = vi.fn();
// M2-02 -- fixtures adaptees a la primitive canonique. Deux differences avec
// l'ancien `authSite`, toutes deux VOULUES :
//   * elle exige `user.id` (la comparaison porte sur `owner_id`), la ou
//     `authSite` se contentait de `user.email` ;
//   * elle interroge `.maybeSingle()` avec UN seul `.eq()` (la propriete est
//     verifiee en memoire, pas dans la clause SQL).
// Aucune assertion n'est modifiee : seule la forme des donnees simulees suit
// le code reel.
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => {
      // Chainable : la primitive fait select().eq().maybeSingle(),
      // l'ancien code faisait select().eq().eq().single().
      const c: any = {};
      c.select = () => c;
      c.eq = () => c;
      c.single = () => siteLookupMock();
      c.maybeSingle = () => siteLookupMock();
      return c;
    },
  },
}));

const createProductMock = vi.fn();
const updateProductMock = vi.fn();
const getProductMock = vi.fn();
const deleteProductMock = vi.fn();
vi.mock('@/lib/shop', () => ({
  createProduct: (...a: unknown[]) => createProductMock(...a),
  updateProduct: (...a: unknown[]) => updateProductMock(...a),
  getProduct: (...a: unknown[]) => getProductMock(...a),
  deleteProduct: (...a: unknown[]) => deleteProductMock(...a),
  getAllProducts: vi.fn(),
}));

function req(body: unknown, token = 'owner-token') {
  return new Request('https://x.test/api/shop/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'owner-id', email: 'owner@test.com' } }, error: null });
  siteLookupMock.mockReset().mockResolvedValue({ data: { id: 'my-site-id', mode: 2, owner_id: 'owner-id', owner_email: 'owner@test.com' }, error: null });
  createProductMock.mockReset().mockResolvedValue({ id: 'p1' });
  updateProductMock.mockReset().mockResolvedValue({ id: 'p1' });
  getProductMock.mockReset().mockResolvedValue({ id: 'p1', site_id: 'my-site-id' });
  deleteProductMock.mockReset();
});

describe('POST /api/shop/products — CRIT-2 : cj_vid/cost_price jamais écrivables via cette route', () => {
  it("un body contenant cj_vid/cost_price en plus des champs légitimes -> createProduct ne les reçoit JAMAIS", async () => {
    const { POST } = await import('../route');
    await POST(req({
      slug: 'my-shop',
      name: 'Mug',
      price: 5,
      cj_vid: 'real-expensive-cj-variant-id',
      cost_price: 1,
    }));
    expect(createProductMock).toHaveBeenCalledTimes(1);
    const sentInput = createProductMock.mock.calls[0][0];
    expect(sentInput).not.toHaveProperty('cj_vid');
    expect(sentInput).not.toHaveProperty('cost_price');
    expect(sentInput).toEqual({ site_id: 'my-site-id', name: 'Mug', price: 5 });
  });

  it("champs légitimes (description, currency, images, stock, published, position) passent normalement", async () => {
    const { POST } = await import('../route');
    await POST(req({
      slug: 'my-shop', name: 'Mug', price: 5, description: 'joli mug', currency: 'usd',
      images: ['x.png'], stock: 10, published: true, position: 1,
    }));
    const sentInput = createProductMock.mock.calls[0][0];
    expect(sentInput).toEqual({
      site_id: 'my-site-id', name: 'Mug', price: 5, description: 'joli mug', currency: 'usd',
      images: ['x.png'], stock: 10, published: true, position: 1,
    });
  });
});

describe('PATCH /api/shop/products/[id] — CRIT-2 : même garde sur la mise à jour', () => {
  function patchReq(body: unknown, token = 'owner-token') {
    return new Request('https://x.test/api/shop/products/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
  }

  it("body contenant cj_vid/cost_price -> updateProduct ne les reçoit jamais", async () => {
    const { PATCH } = await import('../[id]/route');
    await PATCH(patchReq({ price: 3, cj_vid: 'attacker-chosen-variant', cost_price: 0.01 }), { params: Promise.resolve({ id: 'p1' }) });
    expect(updateProductMock).toHaveBeenCalledTimes(1);
    const sentPatch = updateProductMock.mock.calls[0][1];
    expect(sentPatch).not.toHaveProperty('cj_vid');
    expect(sentPatch).not.toHaveProperty('cost_price');
    expect(sentPatch).toEqual({ price: 3 });
  });

  it("slug/site_id/id (déjà exclus avant) restent également exclus", async () => {
    const { PATCH } = await import('../[id]/route');
    await PATCH(patchReq({ price: 3, slug: 'x', site_id: 'other-site', id: 'other-id' }), { params: Promise.resolve({ id: 'p1' }) });
    const sentPatch = updateProductMock.mock.calls[0][1];
    expect(sentPatch).toEqual({ price: 3 });
  });
});

// ============================================================
// ÉTAPE 6 / 8 du chantier catalogue canonique — LA FRONTIÈRE ENTRE LE PATCH
// GÉNÉRIQUE ET L'ACTION MÉTIER.
//
// `track_inventory` et `stock_counted_at` ne sont pas des champs produit
// ordinaires : ensemble, ils portent une AFFIRMATION DE COMPTAGE. Les rendre
// modifiables par ces routes contournerait `enable_stock_tracking()`
// (étape 3), qui les écrit atomiquement avec `clock_timestamp()` pour
// satisfaire la barrière DB de l'étape 2 — laquelle exige un horodatage
// strictement avancé. Un patch générique poserait `track_inventory = true`
// sans affirmation, sur un compteur périmé : exactement la survente que
// l'architecture existe pour rendre impossible.
//
// Les tests CRIT-2 ci-dessus prouvent que le MÉCANISME de liste blanche
// fonctionne (cj_vid, cost_price, slug, site_id, id). Ceux-ci prouvent qu'il
// couvre AUSSI les deux champs de ce chantier — ce qu'aucun test existant
// n'établissait.
// ============================================================
describe("ÉTAPE 6 — la politique d'inventaire échappe aux patches génériques", () => {
  function patchReq(body: unknown, token = 'owner-token') {
    return new Request('https://x.test/api/shop/products/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
  }

  it('POST : track_inventory et stock_counted_at ne parviennent JAMAIS à createProduct', async () => {
    const { POST } = await import('../route');
    await POST(req({
      slug: 'my-shop',
      name: 'Mug',
      price: 5,
      track_inventory: true,
      stock_counted_at: '2099-01-01T00:00:00Z',
    }));
    expect(createProductMock).toHaveBeenCalledTimes(1);
    const sentInput = createProductMock.mock.calls[0][0];
    expect(sentInput, "la politique d'inventaire ne se déclare pas dans un body de création générique").not.toHaveProperty('track_inventory');
    expect(sentInput, "un comptage ne s'affirme que par enable_stock_tracking()").not.toHaveProperty('stock_counted_at');
    expect(sentInput).toEqual({ site_id: 'my-site-id', name: 'Mug', price: 5 });
  });

  it('PATCH : track_inventory et stock_counted_at ne parviennent JAMAIS à updateProduct', async () => {
    const { PATCH } = await import('../[id]/route');
    await PATCH(
      patchReq({ price: 3, track_inventory: true, stock_counted_at: '2099-01-01T00:00:00Z' }),
      { params: Promise.resolve({ id: 'p1' }) }
    );
    expect(updateProductMock).toHaveBeenCalledTimes(1);
    const sentPatch = updateProductMock.mock.calls[0][1];
    expect(
      sentPatch,
      "réactiver le suivi par un PATCH générique poserait track_inventory = true sur un compteur périmé, sans affirmation de comptage"
    ).not.toHaveProperty('track_inventory');
    expect(sentPatch).not.toHaveProperty('stock_counted_at');
    expect(sentPatch).toEqual({ price: 3 });
  });

  it('PATCH : un body ne contenant QUE ces deux champs produit un patch VIDE', async () => {
    // La preuve la plus forte : la boucle de filtrage est une INCLUSION
    // positive (l'objet part vide, seules les clés autorisées y entrent), et
    // non une suppression. Aucune fuite partielle n'est donc représentable.
    const { PATCH } = await import('../[id]/route');
    await PATCH(
      patchReq({ track_inventory: true, stock_counted_at: '2099-01-01T00:00:00Z' }),
      { params: Promise.resolve({ id: 'p1' }) }
    );
    const sentPatch = updateProductMock.mock.calls[0][1];
    expect(sentPatch, 'aucune clé non autorisée ne peut survivre au filtre').toEqual({});
  });

  it('les champs commerciaux légitimes continuent de passer, `stock` compris', async () => {
    // Contrôle positif : la frontière ne doit pas se transformer en blocage.
    // `stock` reste librement modifiable — c'est la VALEUR ; seule la
    // POLITIQUE (`track_inventory`) et l'AFFIRMATION (`stock_counted_at`)
    // sont réservées au chemin métier.
    const { PATCH } = await import('../[id]/route');
    await PATCH(
      patchReq({ name: 'Mug XL', description: 'grand', price: 9, currency: 'cad', images: ['a.png'], stock: 42, published: false, position: 3 }),
      { params: Promise.resolve({ id: 'p1' }) }
    );
    const sentPatch = updateProductMock.mock.calls[0][1];
    expect(sentPatch).toEqual({
      name: 'Mug XL', description: 'grand', price: 9, currency: 'cad',
      images: ['a.png'], stock: 42, published: false, position: 3,
    });
  });
});

// ============================================================
// ÉTAPE 8, VOLET A — `for_sale` EST UN CHAMP PRODUIT ORDINAIRE.
//
// L'étape 6 avait exclu `track_inventory` et `stock_counted_at` des deux
// allowlists : rouvrir un suivi de stock est une AFFIRMATION sur un compteur
// peut-être périmé, qui exige une preuve et donc un acte dédié.
//
// `for_sale` n'affirme rien sur un état antérieur. La valeur ne se périme
// jamais — il n'existe aucune condition sous laquelle elle deviendrait fausse
// d'elle-même. Un PATCH générique est donc la forme EXACTE du besoin, et lui
// inventer une route dédiée serait de la cérémonie. Ces tests figent cette
// asymétrie : `for_sale` passe, les deux autres continuent d'être refusés.
// ============================================================
describe('ÉTAPE 8, VOLET A — `for_sale` traverse les allowlists, la politique d\'inventaire non', () => {
  function patchReq(body: unknown, token = 'owner-token') {
    return new Request('https://x.test/api/shop/products/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
  }

  it('POST : `for_sale` parvient à createProduct', async () => {
    const { POST } = await import('../route');
    await POST(req({ slug: 'my-shop', name: 'Mug', price: 5, for_sale: false }));
    expect(createProductMock.mock.calls[0][0]).toEqual({
      site_id: 'my-site-id', name: 'Mug', price: 5, for_sale: false,
    });
  });

  it('POST : `for_sale` OMIS n\'est jamais reposé par le serveur — le DEFAULT PostgreSQL fait foi', async () => {
    const { POST } = await import('../route');
    await POST(req({ slug: 'my-shop', name: 'Mug', price: 5 }));
    const envoye = createProductMock.mock.calls[0][0];
    // Si la route posait `for_sale: true` ici, le défaut existerait à DEUX
    // endroits — la colonne et le TypeScript — et divergerait au premier
    // changement. `createProduct` doit rester muet sur les champs non fournis.
    expect(envoye).not.toHaveProperty('for_sale');
  });

  it('PATCH : `for_sale` parvient à updateProduct, dans les deux sens', async () => {
    const { PATCH } = await import('../[id]/route');
    await PATCH(patchReq({ for_sale: false }), { params: Promise.resolve({ id: 'p1' }) });
    expect(updateProductMock.mock.calls[0][1]).toEqual({ for_sale: false });

    updateProductMock.mockClear();
    await PATCH(patchReq({ for_sale: true }), { params: Promise.resolve({ id: 'p1' }) });
    expect(updateProductMock.mock.calls[0][1]).toEqual({ for_sale: true });
  });

  it('PATCH : `for_sale` et `published` restent INDÉPENDANTS dans le patch', async () => {
    const { PATCH } = await import('../[id]/route');
    await PATCH(patchReq({ published: true, for_sale: false }), { params: Promise.resolve({ id: 'p1' }) });
    // Le serveur ne dérive jamais l'un de l'autre : c'est le marchand qui
    // décide, et le checkout qui les conjugue.
    expect(updateProductMock.mock.calls[0][1]).toEqual({ published: true, for_sale: false });
  });

  it('PATCH : `for_sale` légitime NE rouvre PAS la politique d\'inventaire', async () => {
    const { PATCH } = await import('../[id]/route');
    await PATCH(
      patchReq({ for_sale: true, track_inventory: true, stock_counted_at: '2099-01-01T00:00:00Z' }),
      { params: Promise.resolve({ id: 'p1' }) }
    );
    const patch = updateProductMock.mock.calls[0][1];
    expect(patch).toEqual({ for_sale: true });
    expect(patch).not.toHaveProperty('track_inventory');
    expect(patch).not.toHaveProperty('stock_counted_at');
  });

  it('les 9 champs légitimes passent ensemble, et RIEN de plus', async () => {
    const { POST } = await import('../route');
    await POST(req({
      slug: 'my-shop', name: 'Mug', price: 5, description: 'd', currency: 'usd',
      images: ['x.png'], stock: 10, published: true, position: 1, for_sale: true,
      track_inventory: true, stock_counted_at: '2099-01-01T00:00:00Z', cj_vid: 'x', cost_price: 1,
    }));
    expect(createProductMock.mock.calls[0][0]).toEqual({
      site_id: 'my-site-id', name: 'Mug', price: 5, description: 'd', currency: 'usd',
      images: ['x.png'], stock: 10, published: true, position: 1, for_sale: true,
    });
  });
});
