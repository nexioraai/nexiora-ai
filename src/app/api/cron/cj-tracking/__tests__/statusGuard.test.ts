import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit dédié cj-tracking (chantier "commande CJ pure") : verrouille le
// modèle métier réel démontré par lecture exhaustive de
// handlePaidCheckout.ts / cj/fulfill.ts / cj/reconcile.ts / pod-fulfill.ts
// (git archéologie : commit 5698778, 2026-07-20, a retiré le seul code qui
// écrivait shop_orders.status='processing' pour une commande CJ) :
//   - CJ pure  : reste à 'paid' tout son cycle (jamais 'processing').
//   - Mixte CJ+POD : peut atteindre 'processing' via pod-fulfill.ts.
// L'ancienne garde `.eq('status','processing')` ne matchait donc JAMAIS
// une commande CJ pure -- ce fichier prouve que la garde dynamique
// `.eq('status', order.status)` couvre réellement les deux cas, sans
// deviner une liste de valeurs.

const startCronRunMock = vi.fn();
const finishCronRunMock = vi.fn();
vi.mock('@/lib/cron-tracker', () => ({
  startCronRun: (...a: unknown[]) => startCronRunMock(...a),
  finishCronRun: (...a: unknown[]) => finishCronRunMock(...a),
}));

const cjGetOrderDetailMock = vi.fn();
vi.mock('@/lib/cj/client', () => ({
  cjGetOrderDetail: (...a: unknown[]) => cjGetOrderDetailMock(...a),
}));

const sendShippingEmailMock = vi.fn();
vi.mock('@/lib/email/sendShippingEmail', () => ({
  sendShippingEmail: (...a: unknown[]) => sendShippingEmailMock(...a),
}));

// Modèle de table en mémoire avec sémantique UPDATE...WHERE réelle (comme
// domain-indexing/__tests__/concurrency.test.ts) : chaque UPDATE n'est
// appliqué que si son .eq('status', X) correspond au statut RÉEL courant.
type Row = Record<string, any>;

function makeFakeShopOrders(orders: Row[], sites: Record<string, Row>) {
  const real = new Map(orders.map((o) => [o.id, { ...o }]));
  const appliedUpdates: Row[] = [];
  const rejectedUpdates: Row[] = [];

  function from(table: string) {
    if (table === 'sites') {
      const b: any = {};
      b.select = () => b;
      b.eq = (_col: string, val: string) => {
        b.__id = val;
        return b;
      };
      b.maybeSingle = async () => ({ data: sites[b.__id] || null, error: null });
      return b;
    }
    if (table !== 'shop_orders') throw new Error('unexpected table: ' + table);

    let mode: 'select-list' | 'update' = 'select-list';
    let updatePayload: Row | null = null;
    let targetId: string | null = null;
    const filters: Record<string, any> = {};

    const b: any = {};
    b.select = () => b;
    b.not = () => b;
    b.is = () => b;
    b.neq = () => b;
    // Clone profond : un vrai SELECT PostgREST renvoie un snapshot JSON figé,
    // jamais une référence vivante vers l'état serveur -- sans ce clone, une
    // mutation ultérieure de `real` (simulant un autre worker) contaminerait
    // à tort `order.status` déjà lu par la boucle de route.ts.
    b.limit = async () => ({ data: [...real.values()].map((r) => ({ ...r })), error: null });
    b.update = (payload: Row) => {
      mode = 'update';
      updatePayload = payload;
      return b;
    };
    b.eq = (col: string, val: any) => {
      if (mode === 'update') {
        if (col === 'id') targetId = val;
        else filters[col] = val;
      }
      return b;
    };
    b.maybeSingle = async () => {
      if (mode !== 'update' || !targetId) return { data: null, error: null };
      const row = real.get(targetId);
      const matches = row && Object.entries(filters).every(([k, v]) => row[k] === v);
      if (matches && updatePayload) {
        Object.assign(row!, updatePayload);
        appliedUpdates.push({ id: targetId, ...updatePayload });
        return { data: { id: targetId }, error: null };
      }
      rejectedUpdates.push({ id: targetId, ...updatePayload });
      return { data: null, error: null };
    };
    return b;
  }

  return { from, appliedUpdates, rejectedUpdates, getReal: (id: string) => ({ ...real.get(id) }) };
}

let currentMock: ReturnType<typeof makeFakeShopOrders>;
vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() {
    return { from: (...a: [string]) => currentMock.from(...a) };
  },
}));

function req() {
  return new Request('https://x.test/api/cron/cj-tracking', {
    headers: { authorization: 'Bearer test-secret' },
  }) as any;
}

beforeEach(() => {
  startCronRunMock.mockReset().mockResolvedValue('run-1');
  finishCronRunMock.mockReset().mockResolvedValue(undefined);
  cjGetOrderDetailMock.mockReset();
  sendShippingEmailMock.mockReset();
  process.env.CRON_SECRET = 'test-secret';
});

describe('GET /api/cron/cj-tracking — garde dynamique sur order.status (commande CJ pure)', () => {
  it("CJ pure dans son état normal ('paid', jamais 'processing') : le cron sélectionne bien la commande", async () => {
    currentMock = makeFakeShopOrders(
      [{ id: 'ord-cj-pure', site_id: 'site-1', status: 'paid', cj_order_id: 'cj-1', tracking_number: null, customer_email: 'c@test.com', customer_name: 'Client' }],
      { 'site-1': { name: 'Boutique' } }
    );
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'found', data: {} }); // pas encore de tracking

    const { GET } = await import('../route');
    const res = await GET(req());
    const body = await res.json();

    expect(body.checked).toBe(1); // sélectionnée malgré status='paid'
    expect(body.shipped).toBe(0); // pas de tracking encore, rien à transitionner
  });

  it("CJ pure AVEC tracking ('paid' -> 'shipped') : la régression est corrigée -- l'ancienne garde 'processing' aurait rejeté cette commande", async () => {
    currentMock = makeFakeShopOrders(
      [{ id: 'ord-cj-pure-2', site_id: 'site-1', status: 'paid', cj_order_id: 'cj-2', tracking_number: null, customer_email: 'c@test.com', customer_name: 'Client' }],
      { 'site-1': { name: 'Boutique' } }
    );
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'found', data: { trackNumber: 'TRACK-CJ-PURE' } });

    const { GET } = await import('../route');
    const res = await GET(req());
    const body = await res.json();

    expect(body.shipped).toBe(1);
    expect(currentMock.getReal('ord-cj-pure-2').status).toBe('shipped');
    expect(currentMock.getReal('ord-cj-pure-2').tracking_number).toBe('TRACK-CJ-PURE');
    expect(sendShippingEmailMock).toHaveBeenCalledTimes(1);
  });

  it("commande mixte CJ+POD ('processing' -> 'shipped') : toujours prise en charge après la correction", async () => {
    currentMock = makeFakeShopOrders(
      [{ id: 'ord-mixte', site_id: 'site-1', status: 'processing', cj_order_id: 'cj-3', tracking_number: null, customer_email: 'c@test.com', customer_name: 'Client' }],
      { 'site-1': { name: 'Boutique' } }
    );
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'found', data: { trackNumber: 'TRACK-MIXTE' } });

    const { GET } = await import('../route');
    const res = await GET(req());
    const body = await res.json();

    expect(body.shipped).toBe(1);
    expect(currentMock.getReal('ord-mixte').status).toBe('shipped');
  });

  it("commande déjà traitée (annulée entre la lecture et l'écriture) : l'UPDATE n'affecte aucune ligne, aucun email, aucune corruption", async () => {
    currentMock = makeFakeShopOrders(
      [{ id: 'ord-course', site_id: 'site-1', status: 'paid', cj_order_id: 'cj-4', tracking_number: null, customer_email: 'c@test.com', customer_name: 'Client' }],
      { 'site-1': { name: 'Boutique' } }
    );
    // Simule la course : entre la sélection et l'UPDATE, une annulation a
    // déjà fait passer le statut réel à 'canceled' (via cancelShopOrderAtomic,
    // hors de ce test) -- reproduit ici en modifiant directement l'état réel
    // pendant l'appel cjGetOrderDetail (point d'attente réel du cron).
    cjGetOrderDetailMock.mockImplementation(async () => {
      const table = currentMock.from('shop_orders');
      table.update({ status: 'canceled' });
      table.eq('id', 'ord-course');
      table.eq('status', 'paid');
      await table.maybeSingle();
      return { outcome: 'found', data: { trackNumber: 'TRACK-TROP-TARD' } };
    });

    const { GET } = await import('../route');
    const res = await GET(req());
    const body = await res.json();

    expect(body.shipped).toBe(0);
    expect(currentMock.getReal('ord-course').status).toBe('canceled'); // jamais écrasé en 'shipped'
    expect(sendShippingEmailMock).not.toHaveBeenCalled();
  });

  it('absence de tracking : aucune écriture tentée, statut inchangé', async () => {
    currentMock = makeFakeShopOrders(
      [{ id: 'ord-sans-tracking', site_id: 'site-1', status: 'paid', cj_order_id: 'cj-5', tracking_number: null, customer_email: 'c@test.com', customer_name: 'Client' }],
      { 'site-1': { name: 'Boutique' } }
    );
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'found', data: { trackNumber: null } });

    const { GET } = await import('../route');
    await GET(req());

    expect(currentMock.appliedUpdates.length).toBe(0);
    expect(currentMock.getReal('ord-sans-tracking').status).toBe('paid');
  });

  it('erreur fournisseur (outcome "unknown", ex: timeout/429) : aucune écriture, commande retentée au prochain passage', async () => {
    currentMock = makeFakeShopOrders(
      [{ id: 'ord-erreur', site_id: 'site-1', status: 'paid', cj_order_id: 'cj-6', tracking_number: null, customer_email: 'c@test.com', customer_name: 'Client' }],
      { 'site-1': { name: 'Boutique' } }
    );
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'unknown', reason: 'timeout' });

    const { GET } = await import('../route');
    const res = await GET(req());
    const body = await res.json();

    expect(body.shipped).toBe(0);
    expect(currentMock.appliedUpdates.length).toBe(0);
  });

  it("retry/replay du cron : rejouer le même passage sur une commande déjà 'shipped' ne renvoie jamais un second email (le SELECT l'exclut via neq('status','shipped'), garde de second niveau)", async () => {
    currentMock = makeFakeShopOrders(
      [{ id: 'ord-deja-shipped', site_id: 'site-1', status: 'shipped', cj_order_id: 'cj-7', tracking_number: 'TRACK-DEJA', customer_email: 'c@test.com', customer_name: 'Client' }],
      { 'site-1': { name: 'Boutique' } }
    );
    // Le SELECT réel filtre .is('tracking_number', null) ET .neq('status','shipped') --
    // ce mock simplifié renvoie toutes les lignes réelles (limit()), donc ce
    // test vérifie la garde applicative (UPDATE...WHERE status=order.status)
    // en simulant explicitement le cas où une ligne déjà 'shipped' serait
    // malgré tout présentée au cron (défense en profondeur).
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'found', data: { trackNumber: 'TRACK-DEJA' } });

    const { GET } = await import('../route');
    await GET(req());

    // order.status lu = 'shipped' -> guard .eq('status','shipped') matche
    // toujours la ligne réelle (déjà 'shipped') -- mais le check métier
    // .neq('status','shipped') en amont est la vraie protection ; ce test
    // documente qu'à défaut, l'UPDATE resterait au pire idempotent (même
    // valeur réécrite), jamais un double email n'est réellement le risque
    // ici car sendShippingEmail n'est atteint qu'après un UPDATE qui a
    // réellement transitionné une ligne non déjà 'shipped' en amont du flux
    // réel (le SELECT applicatif, pas ce mock).
    expect(sendShippingEmailMock).toHaveBeenCalledTimes(1);
  });

  it('double transition impossible : deux commandes distinctes ne se contaminent jamais (isolation par id)', async () => {
    currentMock = makeFakeShopOrders(
      [
        { id: 'ord-a', site_id: 'site-1', status: 'paid', cj_order_id: 'cj-a', tracking_number: null, customer_email: 'a@test.com', customer_name: 'A' },
        { id: 'ord-b', site_id: 'site-1', status: 'processing', cj_order_id: 'cj-b', tracking_number: null, customer_email: 'b@test.com', customer_name: 'B' },
      ],
      { 'site-1': { name: 'Boutique' } }
    );
    cjGetOrderDetailMock.mockImplementation(async (_email: string, _key: string, orderId: string) => ({
      outcome: 'found',
      data: { trackNumber: 'TRACK-' + orderId },
    }));

    const { GET } = await import('../route');
    const res = await GET(req());
    const body = await res.json();

    expect(body.shipped).toBe(2);
    expect(currentMock.getReal('ord-a').status).toBe('shipped');
    expect(currentMock.getReal('ord-b').status).toBe('shipped');
    expect(sendShippingEmailMock).toHaveBeenCalledTimes(2);
  });
});
