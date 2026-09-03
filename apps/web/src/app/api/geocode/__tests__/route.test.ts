import { describe, it, expect, vi, beforeEach } from 'vitest';
import { creerFrom, journalVierge, type JournalPostgrest } from '@/lib/testing/postgrest';

// ============================================================
// AUDIT GLOBAL — CE QUI EST PROUVE : NOMINATIM N'EST PAS APPELE.
//
// Aucune cle n'est depensee sur cette route ; ce qui est expose, c'est la
// REPUTATION de notre `User-Agent` aupres d'OpenStreetMap. Un bannissement
// couperait le geocodage de tous les marchands. `fetch` est donc l'espion.
// ============================================================

const fetchMock = vi.fn();
const getUserMock = vi.fn();
let compteur: { count: number | null; error: unknown };
let journal: JournalPostgrest;
const filtres = () => journal.filtres.checkout_anomalies ?? [];

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));
// Le double PARTAGE, qui honore la projection et capture les filtres
// (cf. CHAINE D / lib/testing/postgrest). Un harnais nouveau ne doit plus
// reconstruire un faux `select` permissif.
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => creerFrom({ checkout_anomalies: { reponse: () => compteur as never } }, journal)(t) },
}));
vi.mock('@/lib/anomaly', () => ({ logAnomaly: vi.fn() }));

import { POST } from '../route';

const req = (h: Record<string, string> = {}, body: unknown = { address: '10 rue X, Montreal' }) =>
  new Request('https://woorri.test/api/geocode', { method: 'POST', headers: h, body: JSON.stringify(body) });
const AVEC = { authorization: 'Bearer jeton' };

beforeEach(() => {
  journal = journalVierge();
  compteur = { count: 0, error: null };
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.c' } }, error: null });
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => [{ lat: '45.5', lon: '-73.5' }] });
  vi.stubGlobal('fetch', fetchMock);
});

describe('POST /api/geocode — appel légitime', () => {
  it('un marchand authentifié obtient ses coordonnées', async () => {
    const res = await POST(req(AVEC));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lat: 45.5, lng: -73.5 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('nominatim.openstreetmap.org');
  });
});

describe('POST /api/geocode — appel direct hors UI', () => {
  it('aucun jeton -> 401, AUCUN appel Nominatim', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('jeton refusé -> 401, AUCUN appel Nominatim', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    const res = await POST(req(AVEC));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("l'identité est vérifiée AVANT même la lecture du corps", async () => {
    // Un corps malformé ne doit pas produire un 500 avant le 401 : l'ordre
    // des gardes est ce qui rend la route non sondable.
    const mauvais = new Request('https://woorri.test/api/geocode', { method: 'POST', body: 'pas du json' });
    const res = await POST(mauvais);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/geocode — borne de débit', () => {
  it('plafond atteint -> 429, AUCUN appel Nominatim', async () => {
    compteur = { count: 20, error: null };
    const res = await POST(req(AVEC));
    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('compteur en PANNE -> 503, AUCUN appel Nominatim (jamais fail-open)', async () => {
    compteur = { count: null, error: { message: 'db down' } };
    const res = await POST(req(AVEC));
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('la borne porte sur CE compte', async () => {
    await POST(req(AVEC));
    expect(filtres()).toContainEqual(['eq', 'details->>user_id', 'user-1']);
    expect(filtres()).toContainEqual(['eq', 'type', 'geocode_request']);
  });
});
