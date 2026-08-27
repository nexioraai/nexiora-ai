import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit Reseller/CJ §13 — aucune couverture avant cet audit. Verrouille la
// garde de statut sur la transition processing->shipped : une commande
// annulée/remboursée par une course avec ce cron ne doit jamais redevenir
// 'shipped', et l'email client ne doit jamais partir sans transition réelle.

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

const fromMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

import { GET } from '../route';

const ORDER = { id: 'order-1', site_id: 'site-1', status: 'processing', cj_order_id: 'cj-1', customer_email: 'c@test.com', customer_name: 'Client' };

function ordersChain(data: unknown) {
  const c: any = {};
  const self = () => c;
  c.select = vi.fn(self);
  c.not = vi.fn(self);
  c.is = vi.fn(self);
  c.neq = vi.fn(self);
  c.limit = vi.fn(async () => ({ data, error: null }));
  return c;
}
function sitesChain(data: unknown) {
  const c: any = {};
  const self = () => c;
  c.select = vi.fn(self);
  c.eq = vi.fn(self);
  c.maybeSingle = vi.fn(async () => ({ data, error: null }));
  return c;
}
function updateChain(matched: boolean) {
  const c: any = {};
  const self = () => c;
  c.update = vi.fn(self);
  c.eq = vi.fn(self);
  c.select = vi.fn(self);
  c.maybeSingle = vi.fn(async () => ({ data: matched ? { id: ORDER.id } : null, error: null }));
  return c;
}

function req() {
  return new Request('https://x.test/api/cron/cj-tracking', {
    headers: { authorization: 'Bearer test-secret' },
  }) as any;
}

beforeEach(() => {
  fromMock.mockReset();
  cjGetOrderDetailMock.mockReset();
  sendShippingEmailMock.mockReset();
  startCronRunMock.mockReset();
  finishCronRunMock.mockReset();
  startCronRunMock.mockResolvedValue('run-1');
  // Fail-closed (audit cj-tracking) : un secret doit desormais etre present
  // et correct pour passer l'authentification -- toutes les requetes de ce
  // fichier testent le comportement de tracking, pas la garde d'auth.
  process.env.CRON_SECRET = 'test-secret';
});

describe('GET /api/cron/cj-tracking', () => {
  it('tracking trouvé + statut encore processing -> shipped + email envoyé (chemin nominal, régression)', async () => {
    fromMock
      .mockImplementationOnce(() => ordersChain([ORDER]))
      .mockImplementationOnce(() => sitesChain({ name: 'Boutique' }))
      .mockImplementationOnce(() => updateChain(true));
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'found', data: { trackNumber: 'TRACK123' } });

    const res = await GET(req());
    const body = await res.json();

    expect(body.shipped).toBe(1);
    expect(sendShippingEmailMock).toHaveBeenCalledTimes(1);
  });

  it('commande annulée entre-temps (update ne matche plus status=processing) -> PAS de shipped compté, PAS d\'email', async () => {
    fromMock
      .mockImplementationOnce(() => ordersChain([ORDER]))
      .mockImplementationOnce(() => sitesChain({ name: 'Boutique' }))
      .mockImplementationOnce(() => updateChain(false)); // course : déjà canceled/refunded, l'update ne matche rien
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'found', data: { trackNumber: 'TRACK123' } });

    const res = await GET(req());
    const body = await res.json();

    expect(body.shipped).toBe(0);
    expect(sendShippingEmailMock).not.toHaveBeenCalled();
  });

  it('cjGetOrderDetail outcome "unknown" (timeout/429) -> ignoré ce passage, jamais traité comme absence de tracking', async () => {
    fromMock.mockImplementationOnce(() => ordersChain([ORDER])).mockImplementationOnce(() => sitesChain({ name: 'Boutique' }));
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'unknown', reason: 'timeout' });

    const res = await GET(req());
    const body = await res.json();

    expect(body.shipped).toBe(0);
    expect(sendShippingEmailMock).not.toHaveBeenCalled();
  });

  it('cjGetOrderDetail outcome "not_found" -> ignoré ce passage, aucune écriture', async () => {
    fromMock.mockImplementationOnce(() => ordersChain([ORDER])).mockImplementationOnce(() => sitesChain({ name: 'Boutique' }));
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'not_found' });

    const res = await GET(req());
    const body = await res.json();
    expect(body.shipped).toBe(0);
  });

  it('aucune commande à vérifier -> retour immédiat', async () => {
    fromMock.mockImplementationOnce(() => ordersChain([]));
    const res = await GET(req());
    const body = await res.json();
    expect(body.checked).toBe(0);
    expect(cjGetOrderDetailMock).not.toHaveBeenCalled();
  });

  it("LOT H (contre-audit, defense en profondeur) : si la SELECT d'eligibilite renvoyait malgre tout une commande a statut terminal (ex. filtre SQL futur regresse), la garde applicative supplementaire l'ecarte AVANT toute tentative d'UPDATE -- aucun 3e appel .from() n'a lieu", async () => {
    const terminalOrder = { ...ORDER, status: 'canceled' };
    fromMock
      .mockImplementationOnce(() => ordersChain([terminalOrder]))
      .mockImplementationOnce(() => sitesChain({ name: 'Boutique' }));
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'found', data: { trackNumber: 'TRACK-TERMINAL' } });

    const res = await GET(req());
    const body = await res.json();

    expect(body.shipped).toBe(0);
    expect(sendShippingEmailMock).not.toHaveBeenCalled();
    // Seuls les 2 appels .from() (orders, sites) ont eu lieu -- aucune
    // tentative d'UPDATE, contrairement au cas de course (updateChain(false))
    // ou l'UPDATE est bien tente puis rejete par le CAS.
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it("F-CJ-01 (LOT H) : la selection exclut explicitement les 4 statuts terminaux via .not('status','in',...), pas seulement 'shipped'", async () => {
    const chain = ordersChain([]);
    fromMock.mockImplementationOnce(() => chain);
    await GET(req());

    // Preuve directe de la requete construite : l'ancien code n'appelait
    // que .neq('status','shipped') (aucun .not sur 'status') -- une commande
    // 'canceled'/'refunded'/'delivered' avec tracking_number encore null
    // restait donc eligible et pouvait etre reexpediee (F-CJ-01). Ce test
    // verrouille la clause reellement envoyee a PostgREST, pas seulement un
    // comportement observable dans ce mock simplifie (qui ne filtre pas).
    expect(chain.not).toHaveBeenCalledWith('status', 'in', '(shipped,delivered,canceled,refunded)');
  });
});
