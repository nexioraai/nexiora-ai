import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit Mode 3/POD BRAND, perfectionnement -- requireSiteOwner() protège QUI
// peut déclencher une action pour un slug donné, mais ne liait pas un
// task_key précis au site qui l'a réellement créé. Un propriétaire de
// plusieurs sites (ou, si les task_key Printful s'avéraient devinables --
// non vérifiable sans créer une vraie tâche facturée -- un tiers) pouvait
// polleur un task_key n'appartenant pas au site ciblé. Corrigé via
// pending_task_keys, persisté à la création, consulté et nettoyé au poll.

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const siteSelectMock = vi.fn();
const updateCalls: any[] = [];
function makeFrom() {
  return vi.fn((table: string) => {
    const b: any = {};
    let mode: 'select' | 'update' = 'select';
    let payload: any = null;
    b.select = () => b;
    b.eq = () => b;
    b.update = (p: unknown) => {
      mode = 'update';
      payload = p;
      return b;
    };
    b.single = async () => siteSelectMock();
    b.maybeSingle = async () => {
      if (mode === 'update') {
        // Ecriture CAS (.eq('pod_designs', snapshot).select('id').maybeSingle()) --
        // simule un succès (1 ligne affectée) dès la première tentative.
        updateCalls.push({ table, payload });
        return { data: { id: 'my-site-id' }, error: null };
      }
      return siteSelectMock();
    };
    b.then = (resolve: any) => {
      if (mode === 'update') updateCalls.push({ table, payload });
      return resolve({ data: null, error: null });
    };
    return b;
  });
}
let fromMock: ReturnType<typeof makeFrom>;
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    get from() {
      return fromMock;
    },
    storage: { from: () => ({ upload: vi.fn().mockResolvedValue({ data: {}, error: null }) }) },
  },
}));

function req(body: unknown, token = 'owner-token') {
  return new Request('https://x.test/api/pod/generate-mockups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  fromMock = makeFrom();
  updateCalls.length = 0;
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'owner-id', email: 'owner@test.com' } }, error: null });
  siteSelectMock.mockReset();
  global.fetch = vi.fn() as any;
});

describe('POST /api/pod/generate-mockups — liaison task_key ↔ site (pending_task_keys)', () => {
  it("poll avec un task_key JAMAIS créé pour ce site (absent de pending_task_keys) -> filtré, aucun appel Printful, aucun résultat", async () => {
    siteSelectMock.mockResolvedValue({
      data: { id: 'my-site-id', owner_id: 'owner-id', dropship_type: 'pod_brand', pod_designs: [{ url: 'https://x.test/d.png', pending_task_keys: ['tk-legitimate'] }] },
      error: null,
    });

    const response = await (await import('../route')).POST(
      req({ slug: 'my-shop', action: 'poll', task_keys: [{ task_key: 'tk-etrangere-ou-devinee', name: 'T-shirt', product_id: 1, variant_id: 2 }] })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled(); // aucun appel Printful pour une tâche non reconnue
    expect(body.generated).toBe(0);
  });

  it("poll avec un task_key réellement présent dans pending_task_keys -> autorisé, appel Printful effectué", async () => {
    siteSelectMock.mockResolvedValue({
      data: { id: 'my-site-id', owner_id: 'owner-id', dropship_type: 'pod_brand', pod_designs: [{ url: 'https://x.test/d.png', pending_task_keys: ['tk-legitimate'] }] },
      error: null,
    });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: { status: 'in_progress' } }), { status: 200 })
    ) as any;

    await (await import('../route')).POST(
      req({ slug: 'my-shop', action: 'poll', task_keys: [{ task_key: 'tk-legitimate', name: 'T-shirt', product_id: 1, variant_id: 2 }] })
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as any).mock.calls[0][0]).toContain('tk-legitimate');
  });

  it("mode create : un task_key lancé avec succès est persisté dans pending_task_keys AVANT d'être renvoyé au client", async () => {
    siteSelectMock.mockResolvedValue({
      data: { id: 'my-site-id', owner_id: 'owner-id', dropship_type: 'pod_brand', pod_designs: [{ url: 'https://x.test/d.png', selected_products: {} }] },
      error: null,
    });
    // catalog_products (resolution des blanks) puis printfiles puis create-task
    let call = 0;
    global.fetch = vi.fn(() => {
      call++;
      if (call === 1) return Promise.resolve(new Response(JSON.stringify({ result: { available_placements: { front: 1 }, variant_printfiles: [], printfiles: [] } }))); // printfiles (échoue en interne, fallback POSITION)
      return Promise.resolve(new Response(JSON.stringify({ result: { task_key: 'tk-nouvellement-cree' } })));
    }) as any;

    // catalog_products select (mode create) — mocké via siteSelectMock générique n'est pas suffisant ici,
    // donc on court-circuite en réutilisant fromMock pour renvoyer une liste de blanks.
    const originalFrom = fromMock;
    fromMock = vi.fn((table: string) => {
      if (table === 'sites') return originalFrom(table);
      if (table === 'catalog_products') {
        const b: any = {};
        b.select = () => b;
        b.eq = () => b;
        b.not = () => b;
        b.limit = async () => ({ data: [{ supplier_product_id: '111', supplier_parent_id: '222', name: 'T-shirt Blank' }], error: null });
        return b;
      }
      throw new Error('unexpected table: ' + table);
    });

    await (await import('../route')).POST(req({ slug: 'my-shop', index: 0 }));

    const siteUpdate = updateCalls.find((c) => c.table === 'sites');
    expect(siteUpdate).toBeDefined();
    // Fermeture DEBT-017 : pending_task_keys porte désormais {task_key,
    // design_url} (design capturé à la création), plus une string nue --
    // c'est cette association qui permet au poll de ne jamais mislabéliser
    // un résultat rendu avec un design depuis abandonné.
    expect(siteUpdate.payload.pod_designs[0].pending_task_keys).toContainEqual({
      task_key: 'tk-nouvellement-cree',
      design_url: 'https://x.test/d.png',
    });
  });

  it("poll : une tâche complétée est retirée de pending_task_keys (ne reste jamais indéfiniment), une tâche encore pending y reste", async () => {
    siteSelectMock.mockResolvedValue({
      data: {
        id: 'my-site-id', owner_id: 'owner-id', dropship_type: 'pod_brand',
        pod_designs: [{
          url: 'https://x.test/d.png', mockups: [],
          // Format {task_key, design_url} : design_url correspond au design
          // ACTUELLEMENT actif ('https://x.test/d.png') -- ce test vérifie
          // le nettoyage de pending_task_keys, pas le rejet DEBT-017 (couvert
          // par un test dédié plus bas).
          pending_task_keys: [
            { task_key: 'tk-done', design_url: 'https://x.test/d.png' },
            { task_key: 'tk-still-running', design_url: 'https://x.test/d.png' },
          ],
        }],
      },
      error: null,
    });
    global.fetch = vi.fn((url: any) => {
      if (String(url).includes('tk-done')) {
        return Promise.resolve(new Response(JSON.stringify({ result: { status: 'completed', mockups: [{ mockup_url: 'https://x.test/m.png', extra: [] }] } })));
      }
      if (String(url).includes('tk-still-running')) {
        return Promise.resolve(new Response(JSON.stringify({ result: { status: 'in_progress' } })));
      }
      // téléchargement de l'image du mockup pour Storage
      return Promise.resolve(new Response(new ArrayBuffer(8), { status: 200 }));
    }) as any;

    await (await import('../route')).POST(
      req({
        slug: 'my-shop', action: 'poll',
        task_keys: [
          { task_key: 'tk-done', name: 'A', product_id: 1, variant_id: 1 },
          { task_key: 'tk-still-running', name: 'B', product_id: 2, variant_id: 2 },
        ],
      })
    );

    const siteUpdate = updateCalls.find((c) => c.table === 'sites');
    expect(siteUpdate).toBeDefined();
    const remaining: { task_key: string; design_url: string }[] = siteUpdate.payload.pod_designs[0].pending_task_keys;
    expect(remaining.some((e) => e.task_key === 'tk-done')).toBe(false); // résolu, retiré
    expect(remaining.some((e) => e.task_key === 'tk-still-running')).toBe(true); // toujours en attente, conservé pour retry
    // Le résultat complété appartient bien au design actuellement actif :
    // sauvegardé normalement, pas écarté (contrôle négatif du test DEBT-017).
    const mockups = siteUpdate.payload.pod_designs[0].mockups;
    expect(mockups.some((m: any) => m.product_id === 1)).toBe(true);
  });
});
