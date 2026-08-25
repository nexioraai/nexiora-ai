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

// DETTE 6d — `requireProductOwner` verifie desormais la FORME de
// l'identifiant avant toute requete. Les fixtures utilisaient `'p1'`, qui
// n'est pas un uuid : elles decrivaient une URL qu'aucun produit reel ne
// peut porter. Constante canonique, une seule fois.
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

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
    await PATCH(patchReq({ price: 3, cj_vid: 'attacker-chosen-variant', cost_price: 0.01 }), { params: Promise.resolve({ id: PRODUCT_ID }) });
    expect(updateProductMock).toHaveBeenCalledTimes(1);
    const sentPatch = updateProductMock.mock.calls[0][1];
    expect(sentPatch).not.toHaveProperty('cj_vid');
    expect(sentPatch).not.toHaveProperty('cost_price');
    expect(sentPatch).toEqual({ price: 3 });
  });

  it("slug/site_id/id (déjà exclus avant) restent également exclus", async () => {
    const { PATCH } = await import('../[id]/route');
    await PATCH(patchReq({ price: 3, slug: 'x', site_id: 'other-site', id: 'other-id' }), { params: Promise.resolve({ id: PRODUCT_ID }) });
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
      { params: Promise.resolve({ id: PRODUCT_ID }) }
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
      { params: Promise.resolve({ id: PRODUCT_ID }) }
    );
    const sentPatch = updateProductMock.mock.calls[0][1];
    expect(sentPatch, 'aucune clé non autorisée ne peut survivre au filtre').toEqual({});
  });

  it('les champs commerciaux légitimes continuent de passer — `stock` EXCLU (dette 2)', async () => {
    // Contrôle positif : la frontière ne doit pas se transformer en blocage.
    //
    // DETTE 2 — CE TEST RÉVOQUE UNE DÉCISION DE L'ÉTAPE 6. Il affirmait que
    // « `stock` reste librement modifiable — c'est la VALEUR ; seule la
    // POLITIQUE et l'AFFIRMATION sont réservées au chemin métier ». C'était
    // faux dans ses conséquences : le trigger de l'étape 2 a pour portée
    // `track_inventory` SEUL, donc un PATCH n'écrivant que `stock` ne le
    // réveille pas. Un comptage à 50 pouvait être ramené à 0 en laissant
    // `stock_counted_at` affirmer le contraire.
    const { PATCH } = await import('../[id]/route');
    await PATCH(
      patchReq({ name: 'Mug XL', description: 'grand', price: 9, currency: 'cad', images: ['a.png'], stock: 42, published: false, position: 3 }),
      { params: Promise.resolve({ id: PRODUCT_ID }) }
    );
    const sentPatch = updateProductMock.mock.calls[0][1];
    expect(sentPatch).toEqual({
      name: 'Mug XL', description: 'grand', price: 9, currency: 'cad',
      images: ['a.png'], published: false, position: 3,
    });
    expect(sentPatch).not.toHaveProperty('stock');
  });
});

// ============================================================
// DETTE 2 — LE STOCK NE SE MODIFIE PLUS PAR PATCH.
//
// Le POST le conserve : créer un produit avec un stock initial n'écrase rien,
// la ligne n'existe pas encore. Le PATCH le perd : il met à jour une ligne
// existante, et écrasait le compteur SANS réveiller la barrière de l'étape 2
// (portée `track_inventory` seul).
//
// Les deux allowlists ne sont donc plus identiques, et c'est la première fois
// depuis leur création. Ces tests bornent l'écart à ce seul champ.
// ============================================================
describe('DETTE 2 — `stock` : POST oui, PATCH non', () => {
  function patchReq(body: unknown, token = 'owner-token') {
    return new Request('https://x.test/api/shop/products/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
  }

  it('PATCH { stock: 42 } -> `stock` n\'atteint JAMAIS updateProduct', async () => {
    const { PATCH } = await import('../[id]/route');
    await PATCH(patchReq({ stock: 42 }), { params: Promise.resolve({ id: PRODUCT_ID }) });
    expect(updateProductMock).toHaveBeenCalledTimes(1);
    expect(updateProductMock.mock.calls[0][1]).toEqual({});
  });

  it('PATCH { price: 10, stock: 42 } -> seul `price` passe', async () => {
    const { PATCH } = await import('../[id]/route');
    await PATCH(patchReq({ price: 10, stock: 42 }), { params: Promise.resolve({ id: PRODUCT_ID }) });
    expect(updateProductMock.mock.calls[0][1]).toEqual({ price: 10 });
  });

  it('SÉMANTIQUE INCHANGÉE : un `stock` envoyé est IGNORÉ, jamais rejeté par 400', async () => {
    // L'allowlist omet les champs inconnus, elle ne les refuse pas. Un client
    // tiers qui enverrait encore `stock` ne recevra aucune erreur — sa valeur
    // sera simplement absente du patch. Transformer cela en 400 serait une
    // autre décision, que la dette 2 n'a pas prise.
    const { PATCH } = await import('../[id]/route');
    const res = await PATCH(patchReq({ stock: 42 }), { params: Promise.resolve({ id: PRODUCT_ID }) });
    expect(res.status).toBe(200);
  });

  it('POST { stock: 10 } -> `stock` est bien transmis à createProduct', async () => {
    const { POST } = await import('../route');
    await POST(req({ slug: 'my-shop', name: 'Mug', price: 5, stock: 10 }));
    expect(createProductMock.mock.calls[0][0]).toEqual({
      site_id: 'my-site-id', name: 'Mug', price: 5, stock: 10,
    });
  });

  it('ANTI-ÉCRASEMENT : aucun chemin PATCH ne peut plus contredire un comptage', async () => {
    // Après `enable_stock_tracking`, `stock` et `stock_counted_at` décrivent
    // le même instant. Le PATCH ne peut plus rompre ce couple : ni la valeur,
    // ni l'horodatage, ni la politique ne le traversent.
    const { PATCH } = await import('../[id]/route');
    await PATCH(
      patchReq({ stock: 0, stock_counted_at: '2099-01-01T00:00:00Z', track_inventory: false, price: 3 }),
      { params: Promise.resolve({ id: PRODUCT_ID }) }
    );
    const sentPatch = updateProductMock.mock.calls[0][1];
    expect(sentPatch).toEqual({ price: 3 });
    for (const interdit of ['stock', 'stock_counted_at', 'track_inventory']) {
      expect(sentPatch, interdit).not.toHaveProperty(interdit);
    }
  });

  it('POST et PATCH n\'ont PLUS la même allowlist', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const champs = (rel: string) =>
      readFileSync(join(__dirname, rel), 'utf-8')
        .match(/const ALLOWED_PRODUCT_FIELDS = \[([^\]]*)\]/)![1]
        .split(',').map((c) => c.trim().replace(/'/g, '')).filter(Boolean);
    const post = champs('../route.ts');
    const patch = champs('../[id]/route.ts');
    expect(post).not.toEqual(patch);
    expect(post.filter((c) => !patch.includes(c))).toEqual(['stock']);
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
    await PATCH(patchReq({ for_sale: false }), { params: Promise.resolve({ id: PRODUCT_ID }) });
    expect(updateProductMock.mock.calls[0][1]).toEqual({ for_sale: false });

    updateProductMock.mockClear();
    await PATCH(patchReq({ for_sale: true }), { params: Promise.resolve({ id: PRODUCT_ID }) });
    expect(updateProductMock.mock.calls[0][1]).toEqual({ for_sale: true });
  });

  it('PATCH : `for_sale` et `published` restent INDÉPENDANTS dans le patch', async () => {
    const { PATCH } = await import('../[id]/route');
    await PATCH(patchReq({ published: true, for_sale: false }), { params: Promise.resolve({ id: PRODUCT_ID }) });
    // Le serveur ne dérive jamais l'un de l'autre : c'est le marchand qui
    // décide, et le checkout qui les conjugue.
    expect(updateProductMock.mock.calls[0][1]).toEqual({ published: true, for_sale: false });
  });

  it('PATCH : `for_sale` légitime NE rouvre PAS la politique d\'inventaire', async () => {
    const { PATCH } = await import('../[id]/route');
    await PATCH(
      patchReq({ for_sale: true, track_inventory: true, stock_counted_at: '2099-01-01T00:00:00Z' }),
      { params: Promise.resolve({ id: PRODUCT_ID }) }
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

// ============================================================
// DETTE 6d — `[id]` NON-UUID : 404 CONTRÔLÉ, JAMAIS 500.
//
// PATCH et DELETE de cette route n'avaient AUCUN test de ce cas : seule la
// route soeur `[id]/inventory` en portait, en caractérisation d'un 500 hérité.
// Or les deux partagent `requireProductOwner`. Le défaut vivait donc ici tout
// autant, sans que rien ne puisse le voir.
//
// CE QUI SORTAIT AVANT : `getProduct()` transmettait l'id à PostgreSQL, qui
// refusait la valeur, l'erreur remontait au try/catch et donnait
//     500 {"error":"getProduct: invalid input syntax for type uuid: \"xyz\""}
// — une erreur de CLIENT déclarée erreur de SERVEUR, et le message brut de la
// base livré à l'appelant (moteur, type de colonne, nom de fonction interne).
// ============================================================
describe('DETTE 6d — PATCH/DELETE avec un id non-UUID', () => {
  function patchReq(body: unknown, token = 'owner-token') {
    return new Request('https://x.test/api/shop/products/xyz', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
  }
  function deleteReq(token = 'owner-token') {
    return new Request('https://x.test/api/shop/products/xyz', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ' + token },
    });
  }
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it('PATCH -> 404, message contrôlé, AUCUNE écriture', async () => {
    const { PATCH } = await import('../[id]/route');
    const res = await PATCH(patchReq({ price: 3 }), ctx('not-a-uuid'));

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Product not found');
    expect(updateProductMock).not.toHaveBeenCalled();
  });

  it('DELETE -> 404, message contrôlé, AUCUNE suppression', async () => {
    const { DELETE } = await import('../[id]/route');
    const res = await DELETE(deleteReq(), ctx('not-a-uuid'));

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Product not found');
    expect(deleteProductMock).not.toHaveBeenCalled();
  });

  it('la base n’est pas interrogée : la forme est refusée avant getProduct', async () => {
    getProductMock.mockClear();
    const { PATCH } = await import('../[id]/route');
    await PATCH(patchReq({ price: 3 }), ctx('not-a-uuid'));
    expect(getProductMock).not.toHaveBeenCalled();
  });

  it('AUCUN message Postgres ne sort, quelle que soit l’entrée', async () => {
    const { PATCH } = await import('../[id]/route');
    for (const mauvais of [
      'not-a-uuid', '', '../../secret', "1' or '1'='1",
      '11111111-1111-4111-8111-11111111111',        // 11 chiffres au lieu de 12
      '11111111111141118111111111111111',           // sans tirets : refusé, cf. commentaire de la primitive
      '{11111111-1111-4111-8111-111111111111}',     // entre accolades : idem
    ]) {
      const res = await PATCH(patchReq({ price: 3 }), ctx(mauvais));
      const brut = JSON.stringify(await res.json());
      expect(res.status, mauvais).toBe(404);
      expect(brut, mauvais).not.toMatch(/invalid input syntax|uuid|getProduct|postgres|syntax/i);
    }
    expect(updateProductMock).not.toHaveBeenCalled();
  });

  it('un uuid VALIDE (majuscules incluses) continue de fonctionner', async () => {
    const { PATCH } = await import('../[id]/route');
    const res = await PATCH(patchReq({ price: 3 }), ctx('11111111-1111-4111-8111-111111111111'.toUpperCase()));
    expect(res.status).toBe(200);
    expect(updateProductMock).toHaveBeenCalled();
  });

  it('uuid bien formé mais INCONNU -> réponse IDENTIQUE à un id malformé', async () => {
    getProductMock.mockResolvedValue(null);
    const { PATCH } = await import('../[id]/route');
    const inconnu = await PATCH(patchReq({ price: 3 }), ctx('22222222-2222-4222-8222-222222222222'));
    const malforme = await PATCH(patchReq({ price: 3 }), ctx('not-a-uuid'));

    expect(inconnu.status).toBe(malforme.status);
    expect(await inconnu.json()).toEqual(await malforme.json());
  });
});
