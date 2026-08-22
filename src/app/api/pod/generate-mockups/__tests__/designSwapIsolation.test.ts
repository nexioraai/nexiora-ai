import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Fermeture DEBT-017 (audit Mode 3/POD BRAND, perfectionnement) -- cause
// racine : pending_task_keys ne stockait que le task_key (string), jamais
// le design pour lequel la tâche Printful avait réellement été lancée. Le
// poll relisait "le design actuel" (pod_designs[0].url AU MOMENT DU POLL,
// pas au moment de la création) pour étiqueter le résultat -- un mockup
// rendu avec l'ANCIEN visuel (image_url envoyée à Printful à la création)
// pouvait donc être sauvegardé comme appartenant au NOUVEAU design si le
// marchand changeait de design entre la création et la fin du poll.
//
// Solution retenue : association IMMUABLE tâche<->design, capturée à la
// création (pending_task_keys: {task_key, design_url}[]), jamais relue
// depuis un état mutable à la résolution. Un résultat dont le design
// capturé ne correspond plus au design actif est ÉCARTÉ, jamais
// mislabélisé -- le marchand le voit comme "pas encore généré pour ce
// design", ce qui est littéralement vrai.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

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
        updateCalls.push({ table, payload });
        return { data: { id: 'my-site-id' }, error: null }; // succès dès la 1ère tentative
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
const siteSelectMock = vi.fn();
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

function pollFetchMock(taskKey: string) {
  return vi.fn((url: any) => {
    if (String(url).includes(taskKey)) {
      return Promise.resolve(new Response(JSON.stringify({
        result: { status: 'completed', mockups: [{ mockup_url: `https://x.test/mockup-${taskKey}.png`, extra: [] }] },
      })));
    }
    return Promise.resolve(new Response(new ArrayBuffer(8), { status: 200 })); // téléchargement image
  }) as any;
}

describe('generate-mockups — isolation design (DEBT-017)', () => {
  it("propriété 1 : un résultat généré pour Design A n'est JAMAIS attribué à Design B -- design changé entre CREATE et fin du POLL", async () => {
    siteSelectMock.mockResolvedValue({
      data: {
        id: 'my-site-id', owner_id: 'owner-id', dropship_type: 'pod_brand',
        pod_designs: [{
          // Le design ACTUEL est déjà B -- le marchand l'a changé après avoir
          // lancé la tâche pour A.
          url: 'https://x.test/design-B.png',
          mockups: [],
          pending_task_keys: [{ task_key: 'tk-pour-A', design_url: 'https://x.test/design-A.png' }],
        }],
      },
      error: null,
    });
    global.fetch = pollFetchMock('tk-pour-A');

    const response = await (await import('../route')).POST(
      req({ slug: 'my-shop', action: 'poll', task_keys: [{ task_key: 'tk-pour-A', name: 'T-shirt', product_id: 1, variant_id: 1 }] })
    );
    const body = await response.json();

    // Le task_key était bien autorisé (lié à ce site) -> Printful interrogé.
    expect(global.fetch).toHaveBeenCalled();
    // Mais le résultat n'apparaît NULLE PART comme généré pour le design
    // actuel : ni dans la réponse HTTP, ni persisté dans mockups.
    expect(body.generated).toBe(0);
    expect(body.mockups).toEqual([]);
    const siteUpdate = updateCalls.find((c) => c.table === 'sites');
    expect(siteUpdate).toBeDefined();
    const savedMockups = siteUpdate.payload.pod_designs[0].mockups;
    expect(savedMockups.some((m: any) => m.product_id === 1)).toBe(false); // jamais mislabélisé comme design B
  });

  it("contrôle positif : task_key résolu AVANT tout changement de design -> sauvegardé normalement, associé au bon design_url", async () => {
    siteSelectMock.mockResolvedValue({
      data: {
        id: 'my-site-id', owner_id: 'owner-id', dropship_type: 'pod_brand',
        pod_designs: [{
          url: 'https://x.test/design-A.png', // toujours A, aucun changement
          mockups: [],
          pending_task_keys: [{ task_key: 'tk-pour-A', design_url: 'https://x.test/design-A.png' }],
        }],
      },
      error: null,
    });
    global.fetch = pollFetchMock('tk-pour-A');

    const response = await (await import('../route')).POST(
      req({ slug: 'my-shop', action: 'poll', task_keys: [{ task_key: 'tk-pour-A', name: 'T-shirt', product_id: 1, variant_id: 1 }] })
    );
    const body = await response.json();

    expect(body.generated).toBe(1);
    const siteUpdate = updateCalls.find((c) => c.table === 'sites');
    const savedMockups = siteUpdate.payload.pod_designs[0].mockups;
    const saved = savedMockups.find((m: any) => m.product_id === 1);
    expect(saved).toBeDefined();
    expect(saved.design_url).toBe('https://x.test/design-A.png');
  });

  it("propriété 4 : changement rapide de design avec DEUX tâches en vol (une pour A, une pour B) -- chacune reste attribuée à son propre design", async () => {
    siteSelectMock.mockResolvedValue({
      data: {
        id: 'my-site-id', owner_id: 'owner-id', dropship_type: 'pod_brand',
        pod_designs: [{
          url: 'https://x.test/design-B.png', // le design actuel est B
          mockups: [],
          pending_task_keys: [
            { task_key: 'tk-pour-A', design_url: 'https://x.test/design-A.png' }, // lancée avant le swap
            { task_key: 'tk-pour-B', design_url: 'https://x.test/design-B.png' }, // lancée après le swap
          ],
        }],
      },
      error: null,
    });
    global.fetch = vi.fn((url: any) => {
      const u = String(url);
      if (u.includes('tk-pour-A')) {
        return Promise.resolve(new Response(JSON.stringify({ result: { status: 'completed', mockups: [{ mockup_url: 'https://x.test/mockup-A.png', extra: [] }] } })));
      }
      if (u.includes('tk-pour-B')) {
        return Promise.resolve(new Response(JSON.stringify({ result: { status: 'completed', mockups: [{ mockup_url: 'https://x.test/mockup-B.png', extra: [] }] } })));
      }
      return Promise.resolve(new Response(new ArrayBuffer(8), { status: 200 }));
    }) as any;

    const response = await (await import('../route')).POST(
      req({
        slug: 'my-shop', action: 'poll',
        task_keys: [
          { task_key: 'tk-pour-A', name: 'A', product_id: 1, variant_id: 1 },
          { task_key: 'tk-pour-B', name: 'B', product_id: 2, variant_id: 2 },
        ],
      })
    );
    const body = await response.json();

    // Seule la tâche B (design actuel) est comptée comme générée.
    expect(body.generated).toBe(1);
    const siteUpdate = updateCalls.find((c) => c.table === 'sites');
    const savedMockups = siteUpdate.payload.pod_designs[0].mockups;
    expect(savedMockups.some((m: any) => m.product_id === 1)).toBe(false); // A écarté
    expect(savedMockups.some((m: any) => m.product_id === 2)).toBe(true); // B sauvegardé
    // Propriété 2 : le vieux job (A) ne peut pas écraser/polluer le résultat
    // de B, ni réciproquement -- vérifié par la présence exclusive de B.
    // Les DEUX task_keys sont retirés de pending_task_keys (résolus, l'un
    // sauvegardé, l'autre écarté -- mais aucun des deux ne doit rester
    // indéfiniment "en attente").
    const remaining = siteUpdate.payload.pod_designs[0].pending_task_keys;
    expect(remaining).toEqual([]);
  });

  it("rétro-compatibilité : ancien format pending_task_keys (string nue, design_url inconnu) -> ne plante jamais, résultat écarté proprement plutôt que mislabélisé", async () => {
    siteSelectMock.mockResolvedValue({
      data: {
        id: 'my-site-id', owner_id: 'owner-id', dropship_type: 'pod_brand',
        pod_designs: [{
          url: 'https://x.test/design-actuel.png',
          mockups: [],
          pending_task_keys: ['tk-legacy'], // ancien format, pré-migration
        }],
      },
      error: null,
    });
    global.fetch = pollFetchMock('tk-legacy');

    const response = await (await import('../route')).POST(
      req({ slug: 'my-shop', action: 'poll', task_keys: [{ task_key: 'tk-legacy', name: 'T-shirt', product_id: 1, variant_id: 1 }] })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    // Autorisé (reconnu dans pending_task_keys malgré le format legacy).
    expect(global.fetch).toHaveBeenCalled();
    // Design inconnu ('' capturé) ne correspond à aucun design réel -> écarté,
    // jamais mislabélisé comme appartenant au design actuel.
    expect(body.generated).toBe(0);
    const siteUpdate = updateCalls.find((c) => c.table === 'sites');
    expect(siteUpdate).toBeDefined();
    const savedMockups = siteUpdate.payload.pod_designs[0].mockups;
    expect(savedMockups.some((m: any) => m.product_id === 1)).toBe(false);
    // Nettoyé de pending_task_keys malgré tout (résolu, pas orphelin indéfiniment).
    const remaining = siteUpdate.payload.pod_designs[0].pending_task_keys;
    expect(remaining).toEqual([]);
  });
});
