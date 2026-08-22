import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit Mode 3/POD BRAND, perfectionnement -- CREATE et POLL font tous les
// deux un read-modify-write sur la même colonne JSONB pod_designs (lue une
// fois via requireSiteOwner) sans aucune garde : deux appels concurrents
// (deux onglets, ou CREATE + POLL en parallèle) pouvaient s'écraser
// mutuellement ("lost update"), avec pour conséquence directe qu'un
// pending_task_keys fraîchement ajouté par l'un pouvait disparaître si
// l'autre écrivait en se basant sur une lecture périmée -- ce qui aurait
// fait rejeter, à tort, un poll pourtant légitime par le filtre
// d'autorisation task_key <-> site.
//
// Le mécanisme choisi (CAS via .eq('pod_designs', snapshot), Postgres
// comparant les JSONB par égalité profonde) a été PROUVÉ LIVE au préalable
// (site jetable, données supprimées ensuite, aucune donnée réelle touchée) :
// une écriture basée sur un instantané périmé est réellement rejetée (0
// ligne affectée), jamais fusionnée ni silencieusement perdue. Ces tests
// vérifient le comportement de RETRY qui exploite cette garantie : en cas de
// conflit, on relit la valeur réelle et on réapplique la MÊME transformation
// dessus (jamais un écrasement aveugle du payload périmé), jusqu'à un nombre
// borné de tentatives.

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const siteSelectMock = vi.fn();
const updateAttempts: any[] = [];
const rereadResponses: any[] = [];
// Contrôle explicite, par tentative CAS, si l'update "réussit" (simulateur
// d'un site dont le pod_designs réel correspond encore à l'instantané fourni)
// ou "échoue" (0 ligne affectée -- un autre écrivain a changé la valeur
// entre-temps).
let updateOutcomes: Array<'succeed' | 'conflict'> = [];
let updateCallIndex = 0;
// Distingue la lecture d'ownership INITIALE (requireSiteOwner, avant toute
// écriture) de la relecture déclenchée par un conflit CAS -- même table
// 'sites', même verbe .select().maybeSingle(), mais des colonnes et un rôle
// différents : seule la relecture post-conflit doit consommer
// rereadResponses.
let anyUpdateStarted = false;

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
      anyUpdateStarted = true;
      return b;
    };
    b.single = async () => siteSelectMock();
    b.maybeSingle = async () => {
      if (mode === 'update') {
        const outcome = updateOutcomes[updateCallIndex] ?? 'succeed';
        updateAttempts.push({ table, payload });
        updateCallIndex++;
        if (outcome === 'succeed') return { data: { id: 'my-site-id' }, error: null };
        return { data: null, error: null }; // CAS : aucune ligne affectée
      }
      // Lookup initial d'ownership (avant toute écriture) : jamais routé
      // vers rereadResponses, même si celui-ci est déjà peuplé.
      if (anyUpdateStarted && rereadResponses.length > 0) return rereadResponses.shift();
      return siteSelectMock();
    };
    b.then = (resolve: any) => resolve({ data: null, error: null });
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
  updateAttempts.length = 0;
  rereadResponses.length = 0;
  updateOutcomes = [];
  updateCallIndex = 0;
  anyUpdateStarted = false;
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'owner-id', email: 'owner@test.com' } }, error: null });
  siteSelectMock.mockReset();
  global.fetch = vi.fn() as any;
});

describe('generate-mockups — garde CAS JSONB sur pod_designs (retry en cas de conflit)', () => {
  it("CREATE : conflit sur la 1ère tentative (un autre écrivain a modifié pod_designs entre-temps) -> relecture réelle, la transformation est réappliquée dessus, PAS d'écrasement du changement concurrent", async () => {
    siteSelectMock.mockResolvedValue({
      data: { id: 'my-site-id', owner_id: 'owner-id', dropship_type: 'pod_brand', pod_designs: [{ url: 'https://x.test/d.png', selected_products: {}, pending_task_keys: [] }] },
      error: null,
    });
    // Un autre écrivain concurrent a déjà ajouté 'tk-from-another-tab' pendant
    // que cette requête traitait sa propre logique métier (appels Printful).
    rereadResponses.push({
      data: { pod_designs: [{ url: 'https://x.test/d.png', selected_products: {}, pending_task_keys: [{ task_key: 'tk-from-another-tab', design_url: 'https://x.test/d.png' }] }] },
      error: null,
    });
    updateOutcomes = ['conflict', 'succeed'];

    let call = 0;
    global.fetch = vi.fn(() => {
      call++;
      if (call === 1) return Promise.resolve(new Response(JSON.stringify({ result: { available_placements: { front: 1 }, variant_printfiles: [], printfiles: [] } })));
      return Promise.resolve(new Response(JSON.stringify({ result: { task_key: 'tk-nouvellement-cree' } })));
    }) as any;

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

    const response = await (await import('../route')).POST(req({ slug: 'my-shop', index: 0 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.task?.task_key).toBe('tk-nouvellement-cree');
    // Exactement 2 tentatives d'écriture : la 1ère en conflit, la 2e réussie.
    expect(updateAttempts.length).toBe(2);
    // La 2e tentative (réussie) doit être calculée sur la valeur RELUE
    // (avec tk-from-another-tab), pas sur l'instantané périmé de départ --
    // preuve que le changement concurrent n'a pas été écrasé.
    const finalPending: { task_key: string; design_url: string }[] = updateAttempts[1].payload.pod_designs[0].pending_task_keys;
    // préservé, pas perdu
    expect(finalPending.some((e) => e.task_key === 'tk-from-another-tab')).toBe(true);
    // notre propre ajout, avec le design capturé à la création
    expect(finalPending).toContainEqual({ task_key: 'tk-nouvellement-cree', design_url: 'https://x.test/d.png' });
  });

  it("CREATE : conflit persistant sur TOUTES les tentatives -> abandon propre après la limite, 503 explicite, le task_key N'EST PAS renvoyé au client comme si tout avait réussi", async () => {
    siteSelectMock.mockResolvedValue({
      data: { id: 'my-site-id', owner_id: 'owner-id', dropship_type: 'pod_brand', pod_designs: [{ url: 'https://x.test/d.png', selected_products: {}, pending_task_keys: [] }] },
      error: null,
    });
    // Chaque relecture renvoie une valeur toujours différente (contention
    // soutenue et improbable) -- le générateur ci-dessous fournit assez de
    // relectures pour couvrir les 5 tentatives.
    for (let i = 0; i < 10; i++) {
      rereadResponses.push({
        data: { pod_designs: [{ url: 'https://x.test/d.png', selected_products: {}, pending_task_keys: [`tk-churn-${i}`] }] },
        error: null,
      });
    }
    updateOutcomes = ['conflict', 'conflict', 'conflict', 'conflict', 'conflict'];

    let call = 0;
    global.fetch = vi.fn(() => {
      call++;
      if (call === 1) return Promise.resolve(new Response(JSON.stringify({ result: { available_placements: { front: 1 }, variant_printfiles: [], printfiles: [] } })));
      return Promise.resolve(new Response(JSON.stringify({ result: { task_key: 'tk-orpheline' } })));
    }) as any;

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

    const response = await (await import('../route')).POST(req({ slug: 'my-shop', index: 0 }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.task).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('tk-orpheline'); // jamais renvoyé comme si lié avec succès
    expect(updateAttempts.length).toBe(5); // MAX_CAS_ATTEMPTS, ni plus ni moins
  });

  it("POLL : conflit sur la 1ère tentative -> relecture réelle, PAS de perte du mockup déjà persisté par un autre appel concurrent", async () => {
    siteSelectMock.mockResolvedValue({
      data: {
        id: 'my-site-id', owner_id: 'owner-id', dropship_type: 'pod_brand',
        pod_designs: [{ url: 'https://x.test/d.png', mockups: [], pending_task_keys: [{ task_key: 'tk-a', design_url: 'https://x.test/d.png' }] }],
      },
      error: null,
    });
    // Entre l'instantané initial et notre écriture, un autre poll concurrent
    // a déjà persisté un mockup pour un AUTRE produit -- ce mockup ne doit
    // pas disparaître.
    rereadResponses.push({
      data: {
        pod_designs: [{
          url: 'https://x.test/d.png',
          mockups: [{ product_id: 99, variant_id: 99, design_url: 'https://x.test/d.png' }],
          pending_task_keys: [{ task_key: 'tk-a', design_url: 'https://x.test/d.png' }],
        }],
      },
      error: null,
    });
    updateOutcomes = ['conflict', 'succeed'];

    global.fetch = vi.fn((url: any) => {
      if (String(url).includes('tk-a')) {
        return Promise.resolve(new Response(JSON.stringify({ result: { status: 'completed', mockups: [{ mockup_url: 'https://x.test/m.png', extra: [] }] } })));
      }
      return Promise.resolve(new Response(new ArrayBuffer(8), { status: 200 })); // téléchargement image
    }) as any;

    const response = await (await import('../route')).POST(
      req({ slug: 'my-shop', action: 'poll', task_keys: [{ task_key: 'tk-a', name: 'A', product_id: 1, variant_id: 1 }] })
    );

    expect(response.status).toBe(200);
    expect(updateAttempts.length).toBe(2);
    const finalMockups = updateAttempts[1].payload.pod_designs[0].mockups;
    // Le mockup du poll concurrent (product 99) est préservé...
    expect(finalMockups.some((m: any) => m.product_id === 99)).toBe(true);
    // ...ET le nouveau résultat de CETTE requête est bien ajouté.
    expect(finalMockups.some((m: any) => m.product_id === 1)).toBe(true);
  });
});
