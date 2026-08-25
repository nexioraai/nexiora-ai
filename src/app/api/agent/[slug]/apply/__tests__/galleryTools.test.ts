import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// DETTE 4 (volet gallery) — LA GALERIE SE CIBLE PAR URL.
//
// AUCUN test ne couvrait ces deux outils avant cette dette.
//
// LE DÉFAUT CORRIGÉ. `propose_gallery_remove` adressait par INDEX, alors que
// `gallery` est absent des 16 champs de CURRENT SITE STATE. Le modèle ne
// pouvait que DEVINER, et `/apply` n'opposait qu'un contrôle d'intervalle : une
// devinette dans les bornes supprimait la mauvaise image, sans erreur. La carte
// affichait « Remove gallery image #2 » — un numéro nu.
//
// `propose_gallery_clear` n'est PAS concerné : il n'adresse rien.
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

const A = 'https://x.test/a.jpg';
const B = 'https://x.test/b.jpg';
const C = 'https://x.test/c.jpg';

let galerie: unknown[];
let produits: unknown[];

beforeEach(() => {
  tablesTouchees.length = 0;
  getUserMock.mockReset().mockResolvedValue({
    data: { user: { id: 'owner-id', email: 'owner@test.com' } }, error: null,
  });
  galerie = [A, { url: B, alt: 'b' }, C];
  produits = [{ name: 'Café', price: '3', description: 'x' }];
  updateSpy.mockReset();
  siteLookupMock.mockReset().mockImplementation(async () => ({
    data: { id: 'site-1', slug: 'ma-vitrine', mode: 1, owner_email: 'owner@test.com', gallery: galerie, products: produits },
    error: null,
  }));
});

/** Ce qui a réellement été écrit dans `sites`, ou null. */
function ecrit(): Record<string, unknown> | null {
  const appel = updateSpy.mock.calls.find((c) => c[0] === 'sites');
  return appel ? (appel[1] as Record<string, unknown>) : null;
}
const galerieEcrite = () => (ecrit()?.gallery ?? null) as unknown[] | null;
const urls = (g: unknown[] | null) =>
  (g ?? []).map((e) => (typeof e === 'string' ? e : (e as { url?: string })?.url));

// ------------------------------------------------------------
describe('propose_gallery_remove — ciblage par URL', () => {
  it('URL exacte d\'un élément CHAÎNE -> supprime la bonne image, et elle seule', async () => {
    const { POST } = await import('../route');
    const res = await POST(req('propose_gallery_remove', { image_url: C, reason: 'r' }), ctx);
    expect(res.status).toBe(200);
    expect(urls(galerieEcrite())).toEqual([A, B]);
  });

  it('URL exacte d\'un élément OBJET { url } -> supprime la bonne image', async () => {
    const { POST } = await import('../route');
    const res = await POST(req('propose_gallery_remove', { image_url: B, reason: 'r' }), ctx);
    expect(res.status).toBe(200);
    expect(urls(galerieEcrite())).toEqual([A, C]);
  });

  it('les éléments restants conservent leur FORME d\'origine', async () => {
    // Un objet enrichi ne doit pas être aplati en chaîne au passage : la
    // suppression retire une entrée, elle ne réécrit pas les autres.
    const { POST } = await import('../route');
    await POST(req('propose_gallery_remove', { image_url: A, reason: 'r' }), ctx);
    const g = galerieEcrite()!;
    expect(g[0]).toEqual({ url: B, alt: 'b' });
    expect(g[1]).toBe(C);
  });

  it('espaces autour de l\'URL -> résolus', async () => {
    const { POST } = await import('../route');
    expect((await POST(req('propose_gallery_remove', { image_url: `  ${A}  `, reason: 'r' }), ctx)).status).toBe(200);
    expect(urls(galerieEcrite())).toEqual([B, C]);
  });

  it('URL inconnue -> 404, AUCUNE écriture', async () => {
    const { POST } = await import('../route');
    const res = await POST(req('propose_gallery_remove', { image_url: 'https://x.test/zzz.jpg', reason: 'r' }), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain('zzz.jpg');
    expect(ecrit()).toBeNull();
  });

  it('URL DUPLIQUÉE -> 409 + désambiguïsation, AUCUNE écriture', async () => {
    galerie = [A, B, A];
    const { POST } = await import('../route');
    const res = await POST(req('propose_gallery_remove', { image_url: A, reason: 'r' }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('2 images');
    // Jamais « la première » : le marchand est seul à pouvoir départager.
    expect(ecrit()).toBeNull();
  });

  it('même URL sous DEUX formes -> 409, aucune écriture', async () => {
    galerie = [A, { url: A }];
    const { POST } = await import('../route');
    expect((await POST(req('propose_gallery_remove', { image_url: A, reason: 'r' }), ctx)).status).toBe(409);
    expect(ecrit()).toBeNull();
  });

  it('casse différente -> 404 (les URL sont sensibles à la casse)', async () => {
    const { POST } = await import('../route');
    const res = await POST(req('propose_gallery_remove', { image_url: 'https://x.test/A.jpg', reason: 'r' }), ctx);
    expect(res.status).toBe(404);
    expect(ecrit()).toBeNull();
  });

  it('sous-chaîne refusée : "a.jpg" n\'atteint pas l\'URL complète', async () => {
    const { POST } = await import('../route');
    expect((await POST(req('propose_gallery_remove', { image_url: 'a.jpg', reason: 'r' }), ctx)).status).toBe(404);
    expect(ecrit()).toBeNull();
  });

  it('`image_url` absent -> 404, aucune écriture', async () => {
    const { POST } = await import('../route');
    expect((await POST(req('propose_gallery_remove', { reason: 'r' }), ctx)).status).toBe(404);
    expect(ecrit()).toBeNull();
  });

  it('`index` CLANDESTIN seul -> 404, aucune écriture', async () => {
    // L'index n'est plus un chemin d'adressage. Le glisser dans tool_input ne
    // doit rien déclencher : c'est le contournement que cette dette ferme.
    const { POST } = await import('../route');
    expect((await POST(req('propose_gallery_remove', { index: 1, reason: 'r' }), ctx)).status).toBe(404);
    expect(ecrit()).toBeNull();
  });

  it('`index` clandestin AVEC une URL valide -> l\'index est IGNORÉ', async () => {
    const { POST } = await import('../route');
    // index 0 = A, mais l'URL désigne C.
    await POST(req('propose_gallery_remove', { image_url: C, index: 0, reason: 'r' }), ctx);
    expect(urls(galerieEcrite())).toEqual([A, B]);
  });

  it('élément objet SANS url exploitable -> non adressable, et n\'empêche pas les autres', async () => {
    galerie = [{ src: 'https://x.test/pas-url.jpg' }, A];
    const { POST } = await import('../route');
    // L'objet illisible est inatteignable...
    expect((await POST(req('propose_gallery_remove', { image_url: 'https://x.test/pas-url.jpg', reason: 'r' }), ctx)).status).toBe(404);
    updateSpy.mockClear();
    // ...mais il ne décale pas la position des autres.
    await POST(req('propose_gallery_remove', { image_url: A, reason: 'r' }), ctx);
    expect(galerieEcrite()).toEqual([{ src: 'https://x.test/pas-url.jpg' }]);
  });

  it('`gallery` absente -> 404, aucune écriture', async () => {
    galerie = undefined as never;
    const { POST } = await import('../route');
    expect((await POST(req('propose_gallery_remove', { image_url: A, reason: 'r' }), ctx)).status).toBe(404);
    expect(ecrit()).toBeNull();
  });

  it('`gallery` non-tableau -> 404, aucune écriture, aucun crash', async () => {
    galerie = 'pas un tableau' as never;
    const { POST } = await import('../route');
    expect((await POST(req('propose_gallery_remove', { image_url: A, reason: 'r' }), ctx)).status).toBe(404);
    expect(ecrit()).toBeNull();
  });

  it('galerie vide -> 404', async () => {
    galerie = [];
    const { POST } = await import('../route');
    expect((await POST(req('propose_gallery_remove', { image_url: A, reason: 'r' }), ctx)).status).toBe(404);
  });
});

// ------------------------------------------------------------
describe('propose_gallery_clear — INCHANGÉ', () => {
  it('vide toute la galerie, sans aucun ciblage', async () => {
    const { POST } = await import('../route');
    const res = await POST(req('propose_gallery_clear', { reason: 'r' }), ctx);
    expect(res.status).toBe(200);
    expect(ecrit()).toEqual({ gallery: [] });
  });

  it('n\'accepte ni `image_url` ni `index` — ils sont sans effet', async () => {
    const { POST } = await import('../route');
    await POST(req('propose_gallery_clear', { image_url: A, index: 1, reason: 'r' }), ctx);
    expect(ecrit()).toEqual({ gallery: [] });
  });

  it('fonctionne même sur une galerie absente', async () => {
    galerie = undefined as never;
    const { POST } = await import('../route');
    expect((await POST(req('propose_gallery_clear', { reason: 'r' }), ctx)).status).toBe(200);
    expect(ecrit()).toEqual({ gallery: [] });
  });
});

// ------------------------------------------------------------
describe('périmètre — aucun effet collatéral', () => {
  it('l\'écriture porte sur `sites` et ne contient QUE `gallery`', async () => {
    const { POST } = await import('../route');
    await POST(req('propose_gallery_remove', { image_url: A, reason: 'r' }), ctx);
    expect(Object.keys(ecrit()!)).toEqual(['gallery']);
  });

  it('AUCUN effet sur `sites.products`', async () => {
    const { POST } = await import('../route');
    await POST(req('propose_gallery_remove', { image_url: A, reason: 'r' }), ctx);
    expect(ecrit()).not.toHaveProperty('products');
  });

  it('AUCUN accès à `shop_products`', async () => {
    const { POST } = await import('../route');
    for (const outil of ['propose_gallery_remove', 'propose_gallery_clear']) {
      tablesTouchees.length = 0;
      await POST(req(outil, { image_url: A, reason: 'r' }), ctx);
      expect(tablesTouchees, outil).not.toContain('shop_products');
    }
  });

  it('appelant non authentifié -> 401, aucune écriture', async () => {
    const { POST } = await import('../route');
    const anon = new Request('https://x.test/api/agent/ma-vitrine/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_name: 'propose_gallery_remove', tool_input: { image_url: A } }),
    });
    expect((await POST(anon, ctx)).status).toBe(401);
    expect(ecrit()).toBeNull();
  });

  it('site n\'appartenant pas à l\'appelant -> 404, aucune écriture', async () => {
    siteLookupMock.mockResolvedValue({ data: null, error: null });
    const { POST } = await import('../route');
    expect((await POST(req('propose_gallery_remove', { image_url: A, reason: 'r' }), ctx)).status).toBe(404);
    expect(ecrit()).toBeNull();
  });
});
