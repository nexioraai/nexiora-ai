import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Passe de cloture (reporting) -- premiere couverture de cette route.
// Cause racine corrigee : la liste des statuts comptables etait codee en dur
// et omettait 'processing' (commande POD deja payee, en preparation
// fournisseur), sous-evaluant le CA du POD par rapport au CJ (qui reste
// 'paid' a ce stade). Source unique desormais : REVENUE_STATUSES
// (orderStatusMachine.ts), la meme ou vit la machine a etats du LOT H.

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const ORDERS = [
  { status: 'pending', total: 1000, nexiora_commission: 60, supplier_cost: 400 },
  { status: 'paid', total: 100, nexiora_commission: 6, supplier_cost: 40 },
  { status: 'processing', total: 200, nexiora_commission: 12, supplier_cost: 80 },
  { status: 'shipped', total: 300, nexiora_commission: 18, supplier_cost: 120 },
  { status: 'delivered', total: 400, nexiora_commission: 24, supplier_cost: 160 },
  { status: 'canceled', total: 5000, nexiora_commission: 300, supplier_cost: 2000 },
  { status: 'refunded', total: 7000, nexiora_commission: 420, supplier_cost: 2800 },
];

function chain(data: unknown, count: number | null = 0) {
  const c: any = {};
  const self = () => c;
  c.select = vi.fn(self);
  c.eq = vi.fn(self);
  c.order = vi.fn(self);
  c.limit = vi.fn(self);
  c.then = (resolve: (v: unknown) => void) => resolve({ data, count, error: null });
  return c;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

import { GET } from '../route';

function req() {
  return new NextRequest('https://woorri.test/api/admin/stats', {
    headers: { authorization: 'Bearer admin-token' },
  });
}

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({
    data: { user: { email: 'issayamiyoussouf@gmail.com' } },
    error: null,
  });
  fromMock.mockReset();
  fromMock.mockImplementation((table: string) => {
    if (table === 'shop_orders') return chain(ORDERS, ORDERS.length);
    return chain([], 0);
  });
});

describe('GET /api/admin/stats — statuts comptabilises comme revenu', () => {
  it("compte paid + processing + shipped + delivered, et EXCLUT pending/canceled/refunded", async () => {
    const res = await GET(req());
    const json = await res.json();

    // paid(100) + processing(200) + shipped(300) + delivered(400) = 1000
    // pending(1000), canceled(5000), refunded(7000) exclus.
    expect(json.revenue.total).toBe(1000);
    expect(json.orders.paid).toBe(4);
  });

  it("REGRESSION CIBLEE : 'processing' est bien inclus -- une commande POD en preparation n'est plus invisible", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'shop_orders') {
        return chain([{ status: 'processing', total: 250, nexiora_commission: 15, supplier_cost: 100 }], 1);
      }
      return chain([], 0);
    });
    const res = await GET(req());
    const json = await res.json();
    expect(json.revenue.total).toBe(250);
    expect(json.orders.paid).toBe(1);
  });

  it('commission et cout fournisseur agreges sur le MEME ensemble de statuts (aucun double comptage)', async () => {
    const res = await GET(req());
    const json = await res.json();
    // 6 + 12 + 18 + 24 = 60 ; 40 + 80 + 120 + 160 = 400
    expect(json.revenue.commission).toBe(60);
    expect(json.revenue.supplierCost).toBe(400);
  });

  it.each(['pending', 'canceled', 'refunded'])(
    "'%s' seul -> revenu nul (argent jamais encaisse ou rendu)",
    async (status) => {
      fromMock.mockImplementation((table: string) => {
        if (table === 'shop_orders') {
          return chain([{ status, total: 999, nexiora_commission: 60, supplier_cost: 400 }], 1);
        }
        return chain([], 0);
      });
      const res = await GET(req());
      const json = await res.json();
      expect(json.revenue.total).toBe(0);
      expect(json.orders.paid).toBe(0);
    }
  );
});

describe('GET /api/admin/stats — controle d\'acces', () => {
  it('sans jeton -> 401', async () => {
    const res = await GET(new NextRequest('https://woorri.test/api/admin/stats'));
    expect(res.status).toBe(401);
  });

  it('utilisateur non admin -> 403, aucune donnee renvoyee', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'someone@else.com' } }, error: null });
    const res = await GET(req());
    expect(res.status).toBe(403);
  });
});

// ============================================================
// M2-01 -- le revenu de Deribfy ne doit agreger que des commissions
// REELLEMENT prelevees.
//
// Avant correctif, `nexiora_commission` etait ecrite pour TOUS les modes,
// alors que Stripe ne prelevait rien hors Mode 3 : cette agregation
// sur-evaluait donc le chiffre d'affaires de Deribfy des commissions
// fantomes du Mode 2.
//
// LA CORRECTION EST A L'ECRITURE, PAS ICI, ET C'EST DELIBERE. Une fois que
// `nexiora_commission` signifie "commission reellement prelevee", en sommer
// la colonne est exact PAR CONSTRUCTION. Ajouter ici un filtre par mode
// exigerait une jointure sur `sites` et reecrirait la meme regle metier a un
// SECOND endroit -- precisement la classe de defaut que M2-02 vient
// d'eliminer (une regle, N implementations).
//
// Ce test verrouille la propriete qui compte : une commande sans commission
// prelevee n'ajoute rien au revenu, quel que soit son montant.
// ============================================================

describe('M2-01 — une commande sans commission prélevée n’enfle pas le revenu', () => {
  it('commande Mode 2 (commission 0) comptée en revenu, mais commission inchangée', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'shop_orders') {
        return chain([
          { status: 'paid', total: 100, nexiora_commission: 6, supplier_cost: 40 },  // Mode 3
          { status: 'paid', total: 900, nexiora_commission: 0, supplier_cost: 0 },   // Mode 2
        ], 2);
      }
      return chain([], 0);
    });
    const json = await (await GET(req())).json();
    // Le chiffre d'affaires marchand agrege les deux ventes...
    expect(json.revenue.total).toBe(1000);
    // ...mais le revenu de Deribfy ne retient que ce qui a ete preleve.
    expect(json.revenue.commission).toBe(6);
  });

  it('aucune commande avec commission -> revenu Deribfy nul, jamais négatif ni fabriqué', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'shop_orders') {
        return chain([{ status: 'paid', total: 500, nexiora_commission: 0, supplier_cost: 0 }], 1);
      }
      return chain([], 0);
    });
    const json = await (await GET(req())).json();
    expect(json.revenue.total).toBe(500);
    expect(json.revenue.commission).toBe(0);
  });
});
