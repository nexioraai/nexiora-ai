import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// LOT I (F-I-2, audit Mode 3 global) -- première suite de tests pour cette
// route (aucune avant ce lot). Verrouille prioritairement le correctif
// fail-closed : avant ce lot, `authHeader !== \`Bearer ${process.env
// .CRON_SECRET}\`` acceptait littéralement la chaîne "Bearer undefined"
// quand CRON_SECRET était absent -- un appelant externe peut envoyer cette
// chaîne telle quelle sans rien connaître du tout. Le test le plus
// important de ce fichier est donc la reproduction EXACTE de cette attaque.
// ============================================================

const balanceRetrieveMock = vi.fn();
const payoutsCreateMock = vi.fn();
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    balance: { retrieve: (...args: unknown[]) => balanceRetrieveMock(...args) },
    payouts: { create: (...args: unknown[]) => payoutsCreateMock(...args) },
  }),
}));

const startCronRunMock = vi.fn();
const finishCronRunMock = vi.fn();
vi.mock('@/lib/cron-tracker', () => ({
  startCronRun: (...args: unknown[]) => startCronRunMock(...args),
  finishCronRun: (...args: unknown[]) => finishCronRunMock(...args),
}));

import { GET } from '../route';

function req(authHeader?: string | null) {
  const headers: Record<string, string> = {};
  if (authHeader !== null && authHeader !== undefined) headers.authorization = authHeader;
  return new Request('https://woorri.test/api/cron/instant-payout', { headers }) as any;
}

beforeEach(() => {
  balanceRetrieveMock.mockReset();
  payoutsCreateMock.mockReset();
  startCronRunMock.mockReset().mockResolvedValue('run-1');
  finishCronRunMock.mockReset().mockResolvedValue(undefined);
  process.env.CRON_SECRET = 'test-secret';
});

describe('GET /api/cron/instant-payout — authentification (LOT I, F-I-2, fail-closed)', () => {
  it('CRON_SECRET absent -> 401, AUCUN appel Stripe, même sans en-tête fourni', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(balanceRetrieveMock).not.toHaveBeenCalled();
    expect(payoutsCreateMock).not.toHaveBeenCalled();
  });

  it("REGRESSION CIBLÉE : CRON_SECRET absent + en-tête littéral 'Bearer undefined' (l'attaque exacte permise par l'ancien pattern `Bearer ${process.env.CRON_SECRET}`) -> 401, aucun virement déclenché", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req('Bearer undefined'));
    expect(res.status).toBe(401);
    expect(payoutsCreateMock).not.toHaveBeenCalled();
  });

  it('en-tête absent (aucune authorization) -> 401', async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(401);
    expect(balanceRetrieveMock).not.toHaveBeenCalled();
  });

  it('secret incorrect -> 401', async () => {
    const res = await GET(req('Bearer wrong-secret'));
    expect(res.status).toBe(401);
    expect(balanceRetrieveMock).not.toHaveBeenCalled();
  });

  it('secret correct -> 200, le solde Stripe est bien interrogé', async () => {
    balanceRetrieveMock.mockResolvedValue({ available: [] });
    const res = await GET(req('Bearer test-secret'));
    expect(res.status).toBe(200);
    expect(balanceRetrieveMock).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/cron/instant-payout — logique de virement (comportement métier, inchangé par LOT I)', () => {
  it('solde < 5$ (500 cents) -> aucun virement déclenché pour cette devise', async () => {
    balanceRetrieveMock.mockResolvedValue({ available: [{ currency: 'cad', amount: 499 }] });
    const res = await GET(req('Bearer test-secret'));
    const body = await res.json();
    expect(payoutsCreateMock).not.toHaveBeenCalled();
    expect(body.results[0]).toEqual(expect.objectContaining({ skipped: 'solde insuffisant' }));
  });

  it('solde >= 5$ -> stripe.payouts.create appelé avec le montant et la devise exacts', async () => {
    balanceRetrieveMock.mockResolvedValue({ available: [{ currency: 'usd', amount: 1000 }] });
    payoutsCreateMock.mockResolvedValue({ id: 'po_123' });
    const res = await GET(req('Bearer test-secret'));
    const body = await res.json();
    expect(payoutsCreateMock).toHaveBeenCalledWith({ amount: 1000, currency: 'usd', method: 'instant' });
    expect(body.payouts).toBe(1);
  });

  it('plusieurs devises : chacune traitée indépendamment, un échec sur une devise ne bloque pas les autres', async () => {
    balanceRetrieveMock.mockResolvedValue({
      available: [
        { currency: 'usd', amount: 1000 },
        { currency: 'cad', amount: 2000 },
      ],
    });
    payoutsCreateMock
      .mockRejectedValueOnce(new Error('carte non éligible'))
      .mockResolvedValueOnce({ id: 'po_456' });
    const res = await GET(req('Bearer test-secret'));
    const body = await res.json();
    expect(payoutsCreateMock).toHaveBeenCalledTimes(2);
    expect(body.payouts).toBe(1);
    expect(body.results[0]).toEqual(expect.objectContaining({ skipped: 'carte non éligible' }));
    expect(body.results[1]).toEqual(expect.objectContaining({ payoutId: 'po_456' }));
  });

  it('erreur Stripe au niveau balance.retrieve -> 500, finishCronRun signale l\'échec', async () => {
    balanceRetrieveMock.mockRejectedValue(new Error('Stripe indisponible'));
    const res = await GET(req('Bearer test-secret'));
    expect(res.status).toBe(500);
    expect(finishCronRunMock).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'error' }));
  });
});
