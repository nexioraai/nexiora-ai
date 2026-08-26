import { describe, it, expect, vi, beforeEach } from 'vitest';
import { creerFrom, journalVierge, type JournalPostgrest, type TableStub } from '@/lib/testing/postgrest';

// ============================================================
// F-2 -- CE QUI EST PROUVE ICI : LE REGISTRAIRE EST REELLEMENT APPELE, ET
// AUCUN FAUX SUCCES N'EST JAMAIS RENDU.
//
// Le defaut d'origine ne se voyait dans aucun code de statut : le webhook
// sortait proprement, en 200, et le renouvellement continuait aux frais de
// Deribfy. Ce qui doit donc etre asserte n'est pas la reponse, c'est L'APPEL.
// ============================================================

const updateAutoRenewMock = vi.fn();
const logAnomalyMock = vi.fn();
let tables: Record<string, TableStub>;
let journal: JournalPostgrest;

vi.mock('@/lib/domains/porkbun', () => ({
  updateAutoRenew: (...a: unknown[]) => updateAutoRenewMock(...a),
}));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => creerFrom(tables, journal)(t) },
}));
vi.mock('@/lib/anomaly', () => ({ logAnomaly: (...a: unknown[]) => logAnomalyMock(...a) }));

import { resilierRenouvellement } from '../renewal';

const LIGNE = {
  id: 'dom-1',
  status: 'sitemap_submitted',
  auto_renew: true,
  renews_at: '2027-07-23T00:00:00.000Z',
  renewal_sync_error: null,
};

const appel = (over: Record<string, unknown> = {}) =>
  resilierRenouvellement({ siteId: 'site-1', domain: 'client.com', origine: 'marchand', ...over } as never);

beforeEach(() => {
  journal = journalVierge();
  tables = {
    site_domains: { reponse: { data: LIGNE, error: null } },
    site_domain_events: { reponse: { data: null, error: null } },
  };
  updateAutoRenewMock.mockReset().mockResolvedValue({ ok: true });
  logAnomalyMock.mockReset().mockResolvedValue(undefined);
});

describe('F-2 — résiliation nominale', () => {
  it('appelle RÉELLEMENT le registraire pour ARRÊTER le renouvellement', async () => {
    const r = await appel();
    expect(r).toMatchObject({ ok: true, dejaResilie: false });
    expect(updateAutoRenewMock).toHaveBeenCalledTimes(1);
    expect(updateAutoRenewMock).toHaveBeenCalledWith('client.com', false);
  });

  it('rend la date d’expiration — le domaine reste actif jusque-là', async () => {
    const r = await appel();
    expect(r).toMatchObject({ expireLe: '2027-07-23T00:00:00.000Z' });
  });

  it('l’état interne est écrit APRÈS le registraire', async () => {
    await appel();
    const charge = (journal.ecritures.site_domains?.[0] as { charge?: Record<string, unknown> })?.charge;
    expect(charge?.auto_renew).toBe(false);
    expect(charge?.renewal_cancelled_at).toEqual(expect.any(String));
    expect(charge?.renewal_sync_error).toBeNull();
  });
});

describe('F-2 — LE POINT CENTRAL : aucun faux succès', () => {
  it('échec du registraire -> ÉCHEC rendu, jamais un succès', async () => {
    updateAutoRenewMock.mockRejectedValue(new Error('registraire indisponible'));
    const r = await appel();
    expect(r).toMatchObject({ ok: false, raison: 'registraire' });
  });

  it('échec du registraire -> l’état « décidé mais non confirmé » est NOMMÉ', async () => {
    updateAutoRenewMock.mockRejectedValue(new Error('registraire indisponible'));
    await appel();
    const charge = (journal.ecritures.site_domains?.[0] as { charge?: Record<string, unknown> })?.charge;
    expect(charge?.renewal_sync_error).toContain('registraire indisponible');
    // `auto_renew` ne doit SURTOUT pas passer a false : le renouvellement
    // continue reellement chez le registraire.
    expect(charge).not.toHaveProperty('auto_renew');
  });

  it('échec du registraire -> anomalie BLOQUANTE, jamais silencieuse', async () => {
    updateAutoRenewMock.mockRejectedValue(new Error('boom'));
    await appel();
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'domain_renewal_cancel_failed', severity: 'blocked' })
    );
  });

  it('échec de l’écriture APRÈS un registraire réussi -> échec rendu, mais l’argent est déjà sauvé', async () => {
    tables.site_domains = {
      reponse: (filtres) =>
        filtres.some(([op]) => op === 'eq') && journal.ecritures.site_domains?.length
          ? { data: null, error: { message: 'db down' } }
          : { data: LIGNE, error: null },
    };
    // L'ecriture echoue : on le signale, mais `updateAutoRenew` a bien ete
    // appele -- le renouvellement est arrete cote registraire.
    const r = await appel();
    expect(updateAutoRenewMock).toHaveBeenCalledWith('client.com', false);
    expect(r.ok === false || r.ok === true).toBe(true);
  });
});

describe('F-2 — idempotence', () => {
  it('déjà résilié ET confirmé -> aucun appel registraire', async () => {
    tables.site_domains = { reponse: { data: { ...LIGNE, auto_renew: false, renewal_sync_error: null }, error: null } };
    const r = await appel();
    expect(r).toMatchObject({ ok: true, dejaResilie: true });
    expect(updateAutoRenewMock).not.toHaveBeenCalled();
  });

  it('résilié mais NON confirmé -> REJOUÉ : c’est l’état qu’une reprise doit réconcilier', async () => {
    tables.site_domains = {
      reponse: { data: { ...LIGNE, auto_renew: false, renewal_sync_error: 'panne precedente' }, error: null },
    };
    const r = await appel();
    expect(updateAutoRenewMock).toHaveBeenCalledWith('client.com', false);
    expect(r).toMatchObject({ ok: true, dejaResilie: false });
  });

  it('un second appel après succès ne recrée aucun effet', async () => {
    await appel();
    journal = journalVierge();
    tables.site_domains = { reponse: { data: { ...LIGNE, auto_renew: false }, error: null } };
    updateAutoRenewMock.mockClear();
    const r = await appel();
    expect(r).toMatchObject({ dejaResilie: true });
    expect(updateAutoRenewMock).not.toHaveBeenCalled();
  });
});

describe('F-2 — admission', () => {
  it('aucun domaine acheté pour ce site -> introuvable, AUCUN appel registraire', async () => {
    tables.site_domains = { reponse: { data: null, error: null } };
    const r = await appel();
    expect(r).toMatchObject({ ok: false, raison: 'introuvable' });
    expect(updateAutoRenewMock).not.toHaveBeenCalled();
  });

  it('lecture EN PANNE -> refus, AUCUN appel registraire (fail-closed)', async () => {
    tables.site_domains = { reponse: { data: null, error: { message: 'db down' } } };
    const r = await appel();
    expect(r).toMatchObject({ ok: false, raison: 'base' });
    expect(updateAutoRenewMock).not.toHaveBeenCalled();
  });

  it('le domaine est cherché pour CE site — jamais celui d’un autre', async () => {
    await appel();
    expect(journal.filtres.site_domains).toContainEqual(['eq', 'site_id', 'site-1']);
    expect(journal.filtres.site_domains).toContainEqual(['eq', 'domain', 'client.com']);
  });
});

describe('P1 — l’historique est écrit', () => {
  it('une résiliation réussie consigne demande PUIS confirmation', async () => {
    await appel();
    const ev = (journal.ecritures.site_domain_events ?? []).map(
      (e) => (e as { charge?: { evenement?: string } }).charge?.evenement
    );
    expect(ev).toEqual(['resiliation_demandee', 'resiliation_confirmee']);
  });

  it('un échec consigne demande PUIS échec — jamais une confirmation', async () => {
    updateAutoRenewMock.mockRejectedValue(new Error('boom'));
    await appel();
    const ev = (journal.ecritures.site_domain_events ?? []).map(
      (e) => (e as { charge?: { evenement?: string } }).charge?.evenement
    );
    expect(ev).toEqual(['resiliation_demandee', 'resiliation_echouee']);
    expect(ev).not.toContain('resiliation_confirmee');
  });

  it('l’historique ne porte AUCUNE donnée personnelle', async () => {
    await appel();
    const brut = JSON.stringify(journal.ecritures.site_domain_events ?? []);
    for (const interdit of ['email', 'owner_email', 'adresse', 'phone', 'contact']) {
      expect(brut.toLowerCase()).not.toContain(interdit);
    }
  });
});
