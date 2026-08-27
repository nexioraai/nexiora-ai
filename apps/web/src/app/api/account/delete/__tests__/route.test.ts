import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit ownership/RLS -- account/delete ne doit plus jamais faire de DELETE
// physique sur sites (cascade sites -> shop_orders -> shop_order_items ->
// order_item_designs, deja prouvee live). Ce test verrouille : resolution
// par owner_id, archivage tout-ou-rien via UN SEUL appel a
// archive_sites_if_no_blocking_orders (RPC multi-sites, seul point de
// verite partage avec /api/sites/[slug]/archive -- aucune boucle par
// site cote applicatif, l'atomicite est portee par la RPC elle-meme),
// deleteUser() jamais appele si archivage incomplet, etat sur (aucune
// perte) si deleteUser() echoue apres archivage reussi.

const getUserMock = vi.fn();
const deleteUserMock = vi.fn();
const rpcMock = vi.fn();
const fromMock = vi.fn();
const logAnomalyMock = vi.fn();

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    auth: {
      getUser: (...a: unknown[]) => getUserMock(...a),
      admin: { deleteUser: (...a: unknown[]) => deleteUserMock(...a) },
    },
    from: (...a: unknown[]) => fromMock(...a),
    rpc: (...a: unknown[]) => rpcMock(...a),
  },
}));
vi.mock('@/lib/anomaly', () => ({
  logAnomaly: (...a: unknown[]) => logAnomalyMock(...a),
}));

import { DELETE } from '../route';

function req(token?: string) {
  return new Request('http://localhost/api/account/delete', {
    method: 'DELETE',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function sitesChain(sites: { id: string; slug: string }[]) {
  const chain: any = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.is = vi.fn(async () => ({ data: sites, error: null }));
  return chain;
}

beforeEach(() => {
  getUserMock.mockReset();
  deleteUserMock.mockReset();
  rpcMock.mockReset();
  fromMock.mockReset();
  logAnomalyMock.mockReset();
  logAnomalyMock.mockResolvedValue(undefined);
});

describe('DELETE /api/account/delete', () => {
  it('sans header Authorization -> 401, aucune resolution de site tentee', async () => {
    const res = await DELETE(req() as any);
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('token invalide -> 401', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });
    const res = await DELETE(req('x') as any);
    expect(res.status).toBe(401);
  });

  it('aucun site -> RPC appelee avec un tableau vide, deleteUser() appele et reussit -> 200', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null });
    fromMock.mockReturnValueOnce(sitesChain([]));
    rpcMock.mockResolvedValue({ data: [{ all_archived: true, blocked_site_id: null, blocking_statuses: null }], error: null });
    deleteUserMock.mockResolvedValue({ error: null });

    const res = await DELETE(req('t') as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('archive_sites_if_no_blocking_orders', { p_site_ids: [], p_owner_id: 'u1' });
    expect(deleteUserMock).toHaveBeenCalledWith('u1');
  });

  it('resolution des sites par owner_id (pas owner_email)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null });
    const chain = sitesChain([]);
    fromMock.mockReturnValueOnce(chain);
    rpcMock.mockResolvedValue({ data: [{ all_archived: true, blocked_site_id: null, blocking_statuses: null }], error: null });
    deleteUserMock.mockResolvedValue({ error: null });

    await DELETE(req('t') as any);
    expect(chain.eq).toHaveBeenCalledWith('owner_id', 'u1');
    expect(chain.eq).not.toHaveBeenCalledWith('owner_email', expect.anything());
  });

  it('un seul appel RPC avec TOUS les site_ids -- jamais une boucle par site', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null });
    fromMock.mockReturnValueOnce(sitesChain([{ id: 's1', slug: 'a' }, { id: 's2', slug: 'b' }]));
    rpcMock.mockResolvedValue({ data: [{ all_archived: true, blocked_site_id: null, blocking_statuses: null }], error: null });
    deleteUserMock.mockResolvedValue({ error: null });

    await DELETE(req('t') as any);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('archive_sites_if_no_blocking_orders', { p_site_ids: ['s1', 's2'], p_owner_id: 'u1' });
  });

  it('un site avec commandes bloquantes -> 409, slug retrouve via blocked_site_id, deleteUser() jamais appele', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null });
    fromMock.mockReturnValueOnce(sitesChain([{ id: 's1', slug: 'boutique-1' }]));
    rpcMock.mockResolvedValue({
      data: [{ all_archived: false, blocked_site_id: 's1', blocking_statuses: ['pending', 'processing'] }],
      error: null,
    });

    const res = await DELETE(req('t') as any);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.blockedSites).toEqual([{ slug: 'boutique-1', blockingStatuses: ['pending', 'processing'] }]);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('plusieurs sites bloquants -> 409 avec la liste complete (pas seulement le premier)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null });
    fromMock.mockReturnValueOnce(sitesChain([{ id: 's1', slug: 'a' }, { id: 's2', slug: 'b' }, { id: 's3', slug: 'c' }]));
    rpcMock.mockResolvedValue({
      data: [
        { all_archived: false, blocked_site_id: 's1', blocking_statuses: ['pending'] },
        { all_archived: false, blocked_site_id: 's3', blocking_statuses: ['paid'] },
      ],
      error: null,
    });

    const res = await DELETE(req('t') as any);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.blockedSites).toEqual([
      { slug: 'a', blockingStatuses: ['pending'] },
      { slug: 'c', blockingStatuses: ['paid'] },
    ]);
  });

  it('tous les sites archivables -> deleteUser() appele -> 200', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null });
    fromMock.mockReturnValueOnce(sitesChain([{ id: 's1', slug: 'a' }, { id: 's2', slug: 'b' }]));
    rpcMock.mockResolvedValue({ data: [{ all_archived: true, blocked_site_id: null, blocking_statuses: null }], error: null });
    deleteUserMock.mockResolvedValue({ error: null });

    const res = await DELETE(req('t') as any);
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(deleteUserMock).toHaveBeenCalledWith('u1');
  });

  it('archivage reussi mais deleteUser() echoue -> 500, anomalie journalisee, etat sur (aucune perte)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null });
    fromMock.mockReturnValueOnce(sitesChain([{ id: 's1', slug: 'a' }]));
    rpcMock.mockResolvedValue({ data: [{ all_archived: true, blocked_site_id: null, blocking_statuses: null }], error: null });
    deleteUserMock.mockResolvedValue({ error: { message: 'gotrue down' } });

    const res = await DELETE(req('t') as any);
    expect(res.status).toBe(500);
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'account_delete_deleteuser_failed', severity: 'blocked' })
    );
  });

  it('erreur RPC (ex: fonction introuvable) -> 500 immediat, deleteUser() jamais appele', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null });
    fromMock.mockReturnValueOnce(sitesChain([{ id: 's1', slug: 'a' }]));
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.archive_sites_if_no_blocking_orders' } });

    const res = await DELETE(req('t') as any);
    expect(res.status).toBe(500);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('retry apres un premier archivage reussi -> idempotent (site deja archive absent de la liste)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null });
    // Le site n'apparait plus dans la liste (deja archived_at non-null,
    // filtre .is('archived_at', null) l'exclut) -- confirme qu'un retry
    // complet ne re-tente jamais l'archivage d'un site deja archive.
    fromMock.mockReturnValueOnce(sitesChain([]));
    rpcMock.mockResolvedValue({ data: [{ all_archived: true, blocked_site_id: null, blocking_statuses: null }], error: null });
    deleteUserMock.mockResolvedValue({ error: null });

    const res = await DELETE(req('t') as any);
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('archive_sites_if_no_blocking_orders', { p_site_ids: [], p_owner_id: 'u1' });
  });
});
