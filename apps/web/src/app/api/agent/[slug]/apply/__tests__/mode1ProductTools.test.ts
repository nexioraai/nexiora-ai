import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// ÉTAPE 8, VOLET B — LE CATALOGUE MODE 1 SE CIBLE PAR NOM.
//
// AUCUN test ne couvrait ces trois outils avant ce volet.
//
// LE DÉFAUT CORRIGÉ. `propose_product_remove` et `_update` adressaient par
// INDEX de tableau, alors que `products` est absent des 16 champs de
// CURRENT SITE STATE. Le modèle ne pouvait donc que DEVINER, et `/apply`
// n'opposait qu'un contrôle d'intervalle : une devinette dans les bornes
// supprimait ou modifiait le mauvais produit, sans erreur. La carte
// d'approbation affichait « Remove product #2 » — sans nom — donc le marchand
// ne pouvait pas davantage s'en apercevoir.
//
// LE CATALOGUE RESTE `sites.products`. Aucune migration vers `shop_products` :
// trois gardes indépendantes l'interdisent à une vitrine.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const siteLookupMock = vi.fn();
const updateSpy = vi.fn();
const tablesTouchees: string[] = [];
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      tablesTouchees.push(table);
      const c: any = {};
      c.select = () => c; c.eq = () => c; c.ilike = () => c; c.insert = () => c;
      c.update = (patch: unknown) => { updateSpy(table, patch); return c; };
      c.single = () => siteLookupMock();
      c.maybeSingle = () => siteLookupMock();
      return c;
    },
  },
}));

function req(tool_name: string, tool_input: unknown) {
  return new Request('https://x.test/api/agent/ma-vitrine/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer owner-token' },
    body: JSON.stringify({ tool_name, tool_input }),
  });
}
const ctx = { params: Promise.resolve({ slug: 'ma-vitrine' }) };

const CATALOGUE = [
  { name: 'Café Latte', price: '4.50', description: 'Doux' },
  { name: 'Thé Vert', price: '3.00', description: 'Léger' },
  { name: 'Croissant', price: '2.00', description: 'Beurre' },
];

let produits: unknown[];

beforeEach(() => {
  tablesTouchees.length = 0;
  getUserMock.mockReset().mockResolvedValue({
    data: { user: { id: 'owner-id', email: 'owner@test.com' } }, error: null,
  });
  produits = CATALOGUE.map((p) => ({ ...p }));
  updateSpy.mockReset();
  siteLookupMock.mockReset().mockImplementation(async () => ({
    data: { id: 'site-1', slug: 'ma-vitrine', mode: 1, owner_email: 'owner@test.com', products: produits },
    error: null,
  }));
});

/** Le tableau `products` réellement écrit dans `sites`, ou null si rien n'a été écrit. */
function ecrit(): unknown[] | null {
  const appel = updateSpy.mock.calls.find((c) => c[0] === 'sites');
  if (!appel) return null;
  return (appel[1] as { products?: unknown[] }).products ?? null;
}
const noms = (a: unknown[] | null) => (a ?? []).map((p) => (p as { name: string }).name);

// ------------------------------------------------------------
describe('propose_product_remove — ciblage par nom', () => {
  it('nom exact -> supprime LE BON produit, et lui seul', async () => {
    const { POST } = await import('../route');
    const res = await POST(req('propose_product_remove', { product_name: 'Thé Vert', reason: 'r' }), ctx);
    expect(res.status).toBe(200);
    expect(noms(ecrit())).toEqual(['Café Latte', 'Croissant']);
  });

  it('casse différente -> résolu', async () => {
    const { POST } = await import('../route');
    expect((await POST(req('propose_product_remove', { product_name: 'thé vert', reason: 'r' }), ctx)).status).toBe(200);
    expect(noms(ecrit())).toEqual(['Café Latte', 'Croissant']);
  });

  it('espaces autour du nom -> résolus', async () => {
    const { POST } = await import('../route');
    expect((await POST(req('propose_product_remove', { product_name: '  Croissant  ', reason: 'r' }), ctx)).status).toBe(200);
    expect(noms(ecrit())).toEqual(['Café Latte', 'Thé Vert']);
  });

  it('nom inconnu -> 404, AUCUNE écriture', async () => {
    const { POST } = await import('../route');
    const res = await POST(req('propose_product_remove', { product_name: 'Chocolat', reason: 'r' }), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain('Chocolat');
    expect(ecrit()).toBeNull();
  });

  it('homonymes -> 409 + désambiguïsation, AUCUNE écriture', async () => {
    produits = [{ name: 'Café' }, { name: 'Café' }, { name: 'Thé' }];
    const { POST } = await import('../route');
    const res = await POST(req('propose_product_remove', { product_name: 'Café', reason: 'r' }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('2 produits');
    // Jamais « le premier ». Un doublon de nom rend la cible ambiguë, et une
    // suppression est irréversible : le refus est la seule réponse sûre.
    expect(ecrit()).toBeNull();
  });

  it('sous-chaîne refusée : "Café" n\'atteint pas "Café Latte"', async () => {
    const { POST } = await import('../route');
    const res = await POST(req('propose_product_remove', { product_name: 'Café', reason: 'r' }), ctx);
    expect(res.status).toBe(404);
    expect(ecrit()).toBeNull();
  });

  it('accents non repliés : "the vert" n\'atteint pas "Thé Vert"', async () => {
    const { POST } = await import('../route');
    expect((await POST(req('propose_product_remove', { product_name: 'the vert', reason: 'r' }), ctx)).status).toBe(404);
    expect(ecrit()).toBeNull();
  });

  it('`product_name` absent -> 404, aucune écriture', async () => {
    const { POST } = await import('../route');
    expect((await POST(req('propose_product_remove', { reason: 'r' }), ctx)).status).toBe(404);
    expect(ecrit()).toBeNull();
  });

  it('`index` CLANDESTIN sans product_name -> 404, aucune écriture', async () => {
    // L'index n'est plus un chemin d'adressage. Le glisser dans tool_input ne
    // doit rien déclencher : c'est précisément le contournement que ce volet
    // ferme.
    const { POST } = await import('../route');
    expect((await POST(req('propose_product_remove', { index: 1, reason: 'r' }), ctx)).status).toBe(404);
    expect(ecrit()).toBeNull();
  });

  it('`index` clandestin AVEC un product_name valide -> l\'index est IGNORÉ', async () => {
    const { POST } = await import('../route');
    // index 0 = « Café Latte », mais le nom désigne « Croissant ».
    await POST(req('propose_product_remove', { product_name: 'Croissant', index: 0, reason: 'r' }), ctx);
    expect(noms(ecrit())).toEqual(['Café Latte', 'Thé Vert']);
  });

  it('catalogue vide -> 404, aucune écriture', async () => {
    produits = [];
    const { POST } = await import('../route');
    expect((await POST(req('propose_product_remove', { product_name: 'Café Latte', reason: 'r' }), ctx)).status).toBe(404);
    expect(ecrit()).toBeNull();
  });
});

// ------------------------------------------------------------
describe('propose_product_update — ciblage par nom', () => {
  it('nom exact -> modifie LE BON produit, et lui seul', async () => {
    const { POST } = await import('../route');
    const res = await POST(req('propose_product_update', { product_name: 'Thé Vert', field: 'price', value: '3.50', reason: 'r' }), ctx);
    expect(res.status).toBe(200);
    expect(ecrit()).toEqual([
      { name: 'Café Latte', price: '4.50', description: 'Doux' },
      { name: 'Thé Vert', price: '3.50', description: 'Léger' },
      { name: 'Croissant', price: '2.00', description: 'Beurre' },
    ]);
  });

  it('les autres champs du produit ciblé sont préservés', async () => {
    const { POST } = await import('../route');
    await POST(req('propose_product_update', { product_name: 'Croissant', field: 'description', value: 'Pur beurre', reason: 'r' }), ctx);
    const cible = (ecrit() as Array<Record<string, string>>)[2];
    expect(cible).toEqual({ name: 'Croissant', price: '2.00', description: 'Pur beurre' });
  });

  it('renommer par le nom fonctionne (le nom résolu est celui d\'AVANT)', async () => {
    const { POST } = await import('../route');
    await POST(req('propose_product_update', { product_name: 'Croissant', field: 'name', value: 'Croissant au beurre', reason: 'r' }), ctx);
    expect(noms(ecrit())).toEqual(['Café Latte', 'Thé Vert', 'Croissant au beurre']);
  });

  it('casse et espaces -> résolus', async () => {
    const { POST } = await import('../route');
    await POST(req('propose_product_update', { product_name: '  café latte ', field: 'price', value: '5.00', reason: 'r' }), ctx);
    expect((ecrit() as Array<Record<string, string>>)[0].price).toBe('5.00');
  });

  it('nom inconnu -> 404, AUCUNE écriture', async () => {
    const { POST } = await import('../route');
    expect((await POST(req('propose_product_update', { product_name: 'Chocolat', field: 'price', value: '1', reason: 'r' }), ctx)).status).toBe(404);
    expect(ecrit()).toBeNull();
  });

  it('homonymes -> 409, AUCUNE écriture', async () => {
    produits = [{ name: 'Café' }, { name: 'Café' }];
    const { POST } = await import('../route');
    const res = await POST(req('propose_product_update', { product_name: 'Café', field: 'price', value: '9', reason: 'r' }), ctx);
    expect(res.status).toBe(409);
    expect(ecrit()).toBeNull();
  });

  it('sous-chaîne refusée', async () => {
    const { POST } = await import('../route');
    expect((await POST(req('propose_product_update', { product_name: 'Thé', field: 'price', value: '9', reason: 'r' }), ctx)).status).toBe(404);
    expect(ecrit()).toBeNull();
  });

  it('`product_name` absent -> 404, aucune écriture', async () => {
    const { POST } = await import('../route');
    expect((await POST(req('propose_product_update', { field: 'price', value: '9', reason: 'r' }), ctx)).status).toBe(404);
    expect(ecrit()).toBeNull();
  });

  it('`index` clandestin AVEC product_name valide -> l\'index est IGNORÉ', async () => {
    const { POST } = await import('../route');
    await POST(req('propose_product_update', { product_name: 'Croissant', index: 0, field: 'price', value: '2.50', reason: 'r' }), ctx);
    const écrit = ecrit() as Array<Record<string, string>>;
    expect(écrit[0].price).toBe('4.50');  // index 0 intact
    expect(écrit[2].price).toBe('2.50');  // c'est bien la cible nommée
  });

  it('champ hors allowlist -> 400 AVANT toute résolution, aucune écriture', async () => {
    const { POST } = await import('../route');
    for (const field of ['image', 'id', 'stock', 'for_sale', 'published']) {
      const res = await POST(req('propose_product_update', { product_name: 'Thé Vert', field, value: 'x', reason: 'r' }), ctx);
      expect(res.status, field).toBe(400);
    }
    expect(ecrit()).toBeNull();
  });

  it('valeur non-chaîne -> 400, aucune écriture', async () => {
    const { POST } = await import('../route');
    expect((await POST(req('propose_product_update', { product_name: 'Thé Vert', field: 'price', value: 3.5, reason: 'r' }), ctx)).status).toBe(400);
    expect(ecrit()).toBeNull();
  });
});

// ------------------------------------------------------------
describe('propose_product_add — INCHANGÉ', () => {
  it('ajoute en fin de tableau, sans ciblage', async () => {
    const { POST } = await import('../route');
    const res = await POST(req('propose_product_add', { name: 'Muffin', price: '3.00', description: 'Myrtille', reason: 'r' }), ctx);
    expect(res.status).toBe(200);
    expect(noms(ecrit())).toEqual(['Café Latte', 'Thé Vert', 'Croissant', 'Muffin']);
  });

  it('AUCUNE règle d\'unicité n\'a été introduite : un homonyme est accepté', async () => {
    // Décision D3 : le contrat de l'ajout ne change pas. Le doublon reste
    // légal, et c'est la RÉSOLUTION qui refuse ensuite — jamais la création
    // qui prévient. Inventer une contrainte d'unicité ici serait une règle
    // produit que personne n'a décidée (`shop_products.name` n'en a pas non
    // plus).
    const { POST } = await import('../route');
    const res = await POST(req('propose_product_add', { name: 'Croissant', price: '2.50', reason: 'r' }), ctx);
    expect(res.status).toBe(200);
    expect(noms(ecrit())).toEqual(['Café Latte', 'Thé Vert', 'Croissant', 'Croissant']);
  });

  it('nom manquant -> 400 (garde d\'origine conservée)', async () => {
    const { POST } = await import('../route');
    expect((await POST(req('propose_product_add', { price: '1', reason: 'r' }), ctx)).status).toBe(400);
  });
});

// ------------------------------------------------------------
describe('sécurité et frontières', () => {
  it('AUCUN accès à `shop_products` — le catalogue M1 reste `sites.products`', async () => {
    const { POST } = await import('../route');
    for (const [outil, input] of [
      ['propose_product_remove', { product_name: 'Thé Vert', reason: 'r' }],
      ['propose_product_update', { product_name: 'Thé Vert', field: 'price', value: '9', reason: 'r' }],
      ['propose_product_add', { name: 'X', reason: 'r' }],
    ] as Array<[string, unknown]>) {
      tablesTouchees.length = 0;
      await POST(req(outil, input), ctx);
      expect(tablesTouchees, outil).not.toContain('shop_products');
    }
  });

  it('l\'écriture porte sur `sites`, et ne contient QUE `products`', async () => {
    const { POST } = await import('../route');
    await POST(req('propose_product_remove', { product_name: 'Thé Vert', reason: 'r' }), ctx);
    const appel = updateSpy.mock.calls.find((c) => c[0] === 'sites')!;
    expect(Object.keys(appel[1] as object)).toEqual(['products']);
  });

  it('appelant non authentifié -> 401, aucune écriture', async () => {
    const { POST } = await import('../route');
    const anon = new Request('https://x.test/api/agent/ma-vitrine/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_name: 'propose_product_remove', tool_input: { product_name: 'Thé Vert' } }),
    });
    expect((await POST(anon, ctx)).status).toBe(401);
    expect(ecrit()).toBeNull();
  });

  it('site n\'appartenant pas à l\'appelant -> 404, aucune écriture', async () => {
    siteLookupMock.mockResolvedValue({ data: null, error: null });
    const { POST } = await import('../route');
    expect((await POST(req('propose_product_remove', { product_name: 'Thé Vert', reason: 'r' }), ctx)).status).toBe(404);
    expect(ecrit()).toBeNull();
  });
});
