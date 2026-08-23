import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit timeouts/CAS (lot prioritaire) : le PATCH "marquer expédié" écrivait
// `status: 'shipped'` sans garde -- le cron cj-tracking (transition
// automatique dès qu'un tracking CJ est détecté) peut modifier la même
// commande en parallèle. Garde CAS générique sur le statut lu juste avant
// (pas une valeur figée) : correcte quel que soit l'état légitime réel de
// la commande, sans hypothèse sur le cycle de vie exact (Mode 2/3/POD).

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
}));

// M2-02 -- fixtures adaptees a la primitive canonique. Deux differences avec
// l'ancien `authSite`, toutes deux VOULUES :
//   * elle exige `user.id` (la comparaison porte sur `owner_id`), la ou
//     `authSite` se contentait de `user.email` ;
//   * elle interroge `.maybeSingle()` avec UN seul `.eq()` (la propriete est
//     verifiee en memoire, pas dans la clause SQL).
// Aucune assertion n'est modifiee : seule la forme des donnees simulees suit
// le code reel.
const siteRow = { id: 'site-1', owner_id: 'owner-1', owner_email: 'merchant@example.com' };
const siteSelectMock = vi.fn();
const orderSelectMock = vi.fn();
const orderUpdateMock = vi.fn();

function makeFrom() {
  return vi.fn((table: string) => {
    if (table === 'sites') {
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.single = async () => siteSelectMock();
      b.maybeSingle = async () => siteSelectMock();
      return b;
    }
    if (table === 'shop_orders') {
      const b: any = {};
      let isUpdate = false;
      b.select = (cols?: string) => {
        if (isUpdate) {
          // .update(...).eq(...).eq(...).select('id').maybeSingle()
          return { maybeSingle: async () => orderUpdateMock() };
        }
        return b;
      };
      b.eq = () => b;
      b.update = (_payload: unknown) => {
        isUpdate = true;
        return b;
      };
      b.maybeSingle = async () => orderSelectMock();
      return b;
    }
    throw new Error('unexpected table: ' + table);
  });
}

let fromMock: ReturnType<typeof makeFrom>;
vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() {
    return { from: (...a: [string]) => fromMock(...a) };
  },
}));

function makeReq(body: unknown) {
  return new Request('https://woorri.test/api/shop/orders', {
    method: 'PATCH',
    headers: { authorization: 'Bearer test-token' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  fromMock = makeFrom();
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'owner-1', email: 'merchant@example.com' } }, error: null });
  siteSelectMock.mockReset().mockResolvedValue({ data: siteRow, error: null });
  orderSelectMock.mockReset();
  orderUpdateMock.mockReset();
});

describe('PATCH /api/shop/orders — garde CAS sur le statut', () => {
  it('chemin nominal : statut inchangé entre la lecture et l\'écriture -> transition appliquée', async () => {
    orderSelectMock.mockResolvedValue({ data: { id: 'order-1', status: 'paid' }, error: null });
    orderUpdateMock.mockResolvedValue({ data: { id: 'order-1' }, error: null });

    const { PATCH } = await import('../route');
    const res = await PATCH(makeReq({ slug: 'my-shop', orderId: 'order-1', trackingNumber: 'TRACK123' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("état concurrent simulé : le statut réel a changé entre la lecture et l'écriture (ex: cj-tracking a déjà transitionné la commande) -> écriture refusée, réponse 409, aucun faux succès", async () => {
    orderSelectMock.mockResolvedValue({ data: { id: 'order-2', status: 'paid' }, error: null });
    // L'UPDATE...WHERE...status=paid n'affecte aucune ligne : le statut réel
    // a déjà changé (ex: cj-tracking l'a passé à 'shipped' entre-temps).
    orderUpdateMock.mockResolvedValue({ data: null, error: null });

    const { PATCH } = await import('../route');
    const res = await PATCH(makeReq({ slug: 'my-shop', orderId: 'order-2', trackingNumber: 'TRACK999' }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.ok).toBeUndefined();
    expect(body.error).toMatch(/modifiee entre-temps/);
  });

  it('conserve les transitions légitimes pour un état de départ différent (ex: POD déjà en "processing")', async () => {
    orderSelectMock.mockResolvedValue({ data: { id: 'order-3', status: 'processing' }, error: null });
    orderUpdateMock.mockResolvedValue({ data: { id: 'order-3' }, error: null });

    const { PATCH } = await import('../route');
    const res = await PATCH(makeReq({ slug: 'my-shop', orderId: 'order-3', trackingNumber: null }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('commande introuvable pour ce site -> 404, jamais de tentative d\'écriture', async () => {
    orderSelectMock.mockResolvedValue({ data: null, error: null });

    const { PATCH } = await import('../route');
    const res = await PATCH(makeReq({ slug: 'my-shop', orderId: 'order-inconnue', trackingNumber: null }));

    expect(res.status).toBe(404);
    expect(orderUpdateMock).not.toHaveBeenCalled();
  });

  it('targetStatus invalide -> 400, aucune tentative de lecture ni écriture', async () => {
    const { PATCH } = await import('../route');
    const res = await PATCH(makeReq({ slug: 'my-shop', orderId: 'order-x', targetStatus: 'annule-arbitrairement' }));

    expect(res.status).toBe(400);
    expect(orderSelectMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/shop/orders — transition 'shipped' -> 'delivered' (perfectionnement Mode 3/POD BRAND)", () => {
  it("commande 'shipped' -> targetStatus='delivered' : transition appliquée, aucune écriture de tracking_number", async () => {
    orderSelectMock.mockResolvedValue({ data: { id: 'order-4', status: 'shipped' }, error: null });
    orderUpdateMock.mockResolvedValue({ data: { id: 'order-4' }, error: null });

    const { PATCH } = await import('../route');
    const res = await PATCH(makeReq({ slug: 'my-shop', orderId: 'order-4', targetStatus: 'delivered' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("commande encore 'processing' (jamais expédiée) -> targetStatus='delivered' rejeté 400, AUCUNE tentative d'écriture -- règle métier, pas juste une garde CAS", async () => {
    orderSelectMock.mockResolvedValue({ data: { id: 'order-5', status: 'processing' }, error: null });

    const { PATCH } = await import('../route');
    const res = await PATCH(makeReq({ slug: 'my-shop', orderId: 'order-5', targetStatus: 'delivered' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/déjà expédiée/);
    expect(orderUpdateMock).not.toHaveBeenCalled();
  });

  it("commande 'paid' -> targetStatus='delivered' rejeté 400 (même règle, CJ pur sans passer par 'shipped')", async () => {
    orderSelectMock.mockResolvedValue({ data: { id: 'order-6', status: 'paid' }, error: null });

    const { PATCH } = await import('../route');
    const res = await PATCH(makeReq({ slug: 'my-shop', orderId: 'order-6', targetStatus: 'delivered' }));

    expect(res.status).toBe(400);
    expect(orderUpdateMock).not.toHaveBeenCalled();
  });

  it("double-clic simulé : deux PATCH concurrents 'delivered' sur la même commande -- un seul réussit réellement, le second reçoit 409, jamais un faux succès", async () => {
    orderSelectMock.mockResolvedValue({ data: { id: 'order-7', status: 'shipped' }, error: null });
    // Premier appel : l'UPDATE...WHERE trouve encore status='shipped', réussit.
    // Second appel (simulé après coup) : le statut réel est déjà 'delivered', l'UPDATE n'affecte rien.
    orderUpdateMock
      .mockResolvedValueOnce({ data: { id: 'order-7' }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const { PATCH } = await import('../route');
    const [resA, resB] = await Promise.all([
      PATCH(makeReq({ slug: 'my-shop', orderId: 'order-7', targetStatus: 'delivered' })),
      PATCH(makeReq({ slug: 'my-shop', orderId: 'order-7', targetStatus: 'delivered' })),
    ]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]); // exactement un succès, un conflit -- jamais deux succès
  });
});

describe("PATCH /api/shop/orders — LOT H (contre-audit) : source illegale pour targetStatus='shipped'", () => {
  // Avant ce correctif, seul le CAS .eq('status', order.status) protegeait
  // ce PATCH : une commande deja 'canceled'/'refunded'/'delivered' pouvait
  // etre marquee 'shipped' (le CAS matche trivialement puisque la valeur
  // filtree == la valeur lue, aucune course requise). Ces tests prouvent
  // que la garde applicative (isLegalOrderStatusTransition, meme source que
  // le trigger DB) rejette desormais ces cas AVANT toute tentative
  // d'ecriture, independamment de la barriere DB.
  it.each(['canceled', 'refunded', 'delivered', 'pending'])(
    "commande '%s' -> targetStatus='shipped' rejete 400, AUCUNE tentative d'ecriture",
    async (status) => {
      orderSelectMock.mockResolvedValue({ data: { id: 'order-illegal', status }, error: null });

      const { PATCH } = await import('../route');
      const res = await PATCH(makeReq({ slug: 'my-shop', orderId: 'order-illegal', targetStatus: 'shipped' }));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toMatch(/ne peut pas être marquée expédiée/);
      expect(orderUpdateMock).not.toHaveBeenCalled();
    }
  );

  it.each(['paid', 'processing'])(
    "commande '%s' -> targetStatus='shipped' reste autorise (les deux departs legitimes, CJ et POD)",
    async (status) => {
      orderSelectMock.mockResolvedValue({ data: { id: 'order-legal', status }, error: null });
      orderUpdateMock.mockResolvedValue({ data: { id: 'order-legal' }, error: null });

      const { PATCH } = await import('../route');
      const res = await PATCH(makeReq({ slug: 'my-shop', orderId: 'order-legal', trackingNumber: 'T' }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    }
  );
});
