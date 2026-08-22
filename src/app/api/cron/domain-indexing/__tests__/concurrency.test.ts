import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Audit timeouts/CAS (lot prioritaire) : avant ce correctif, les transitions
// de statut de ce cron ne portaient qu'un `.eq('id', row.id)`, sans garde
// sur le statut attendu -- contrairement au sibling domain-indexing-byod
// (qui, lui, garde chaque transition via `.eq('custom_domain_google_status',
// expected)` + verification des lignes affectees). Ce fichier verifie
// specifiquement le COMPORTEMENT sous course simulee (deux passages qui
// traitent la meme ligne), pas seulement la presence du filtre .eq() --
// une ligne .eq() presente mais jamais verifiee ne protege rien.
//
// Modele : une "vraie" ligne DB simulee, partagee par tous les .from()
// successifs de l'appel GET() -- chaque UPDATE n'est applique que si son
// .eq('status', X) correspond au statut REEL courant au moment de
// l'evaluation, exactement la semantique d'un UPDATE...WHERE Postgres.

const startCronRunMock = vi.fn();
const finishCronRunMock = vi.fn();
vi.mock('@/lib/cron-tracker', () => ({
  startCronRun: (...args: unknown[]) => startCronRunMock(...args),
  finishCronRun: (...args: unknown[]) => finishCronRunMock(...args),
}));

const verifyDomainMock = vi.fn();
const addSiteMock = vi.fn();
const submitSitemapMock = vi.fn();
vi.mock('@/lib/domains/searchconsole', () => ({
  verifyDomain: (...args: unknown[]) => verifyDomainMock(...args),
  addSite: (...args: unknown[]) => addSiteMock(...args),
  submitSitemap: (...args: unknown[]) => submitSitemapMock(...args),
}));

type Row = Record<string, any>;

function makeFakeSiteDomains(initialRow: Row) {
  const real: Row = { ...initialRow };
  const appliedUpdates: Row[] = [];
  const rejectedUpdates: Row[] = [];

  function from(table: string) {
    if (table !== 'site_domains') throw new Error('unexpected table: ' + table);
    let updatePayload: Row | null = null;
    const filters: Record<string, any> = {};
    const b: any = {};
    b.select = () => b;
    b.in = () => b;
    b.lt = () => b;
    b.or = () => b;
    b.limit = () => b;
    b.eq = (col: string, val: any) => {
      filters[col] = val;
      return b;
    };
    b.update = (payload: Row) => {
      updatePayload = payload;
      return b;
    };
    // Appelé après .update(...).eq(...) pour lire les lignes affectées
    // (pattern CAS déjà utilisé par le sibling BYOD).
    b.select = () => {
      if (updatePayload) {
        const matches = Object.entries(filters).every(([k, v]) => real[k] === v);
        if (matches) {
          Object.assign(real, updatePayload);
          appliedUpdates.push({ ...updatePayload });
          const result = { data: [{ id: real.id }], error: null };
          return { then: (resolve: any) => resolve(result), maybeSingle: async () => ({ data: result.data[0], error: null }) };
        }
        rejectedUpdates.push({ ...updatePayload });
        const result = { data: [], error: null };
        return { then: (resolve: any) => resolve(result), maybeSingle: async () => ({ data: null, error: null }) };
      }
      return b;
    };
    // Requête initiale (fetch du lot) : jamais de .update() avant .then().
    b.then = (resolve: any) => resolve({ data: [real], error: null });
    return b;
  }

  return { from, appliedUpdates, rejectedUpdates, getReal: () => ({ ...real }) };
}

let currentMock: ReturnType<typeof makeFakeSiteDomains>;
vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() {
    return { from: (...a: [string]) => currentMock.from(...a) };
  },
}));

function makeRequest() {
  return new NextRequest('https://woorri.test/api/cron/domain-indexing', {
    headers: { authorization: 'Bearer test-secret' },
  });
}

beforeEach(() => {
  startCronRunMock.mockReset().mockResolvedValue('run-1');
  finishCronRunMock.mockReset().mockResolvedValue(undefined);
  verifyDomainMock.mockReset();
  addSiteMock.mockReset();
  submitSitemapMock.mockReset();
  process.env.CRON_SECRET = 'test-secret';
});

describe('GET /api/cron/domain-indexing — garde CAS sous course simulée', () => {
  it('transition dns_configured -> google_verified appliquée si le statut réel correspond toujours', async () => {
    currentMock = makeFakeSiteDomains({
      id: 'dom-1', domain: 'ok.com', status: 'dns_configured', gsc_token: 'tok', gsc_attempts: 0, gsc_last_attempt_at: null,
    });
    verifyDomainMock.mockResolvedValue(true);
    addSiteMock.mockResolvedValue(undefined);
    submitSitemapMock.mockResolvedValue(undefined);

    const { GET } = await import('../route');
    await GET(makeRequest());

    expect(currentMock.getReal().status).toBe('sitemap_submitted');
    expect(currentMock.rejectedUpdates.length).toBe(0);
  });

  it("course perdue : le statut réel a déjà changé (autre passage) au moment de la transition -- l'UPDATE n'affecte aucune ligne, aucune corruption, sortie propre", async () => {
    // Reproduit "un autre passage gagne la course avant que celui-ci
    // n'atteigne sa propre transition" : pendant l'appel verifyDomain()
    // (point d'attente réel de ce cron), on simule l'autre worker en
    // appliquant directement une transition concurrente sur la ligne réelle
    // sous-jacente -- avant que ce passage ne tente la sienne.
    currentMock = makeFakeSiteDomains({
      id: 'dom-2', domain: 'course.com', status: 'dns_configured', gsc_token: 'tok', gsc_attempts: 0, gsc_last_attempt_at: null,
    });
    verifyDomainMock.mockImplementation(async () => {
      // Au moment même où ce passage a lu la ligne (status='dns_configured'
      // dans son `row`), un autre passage a déjà écrit 'google_failed' --
      // on le simule en modifiant la ligne réelle sous-jacente via une
      // update directe hors-guard (représente l'autre worker).
      const table = (currentMock as any).from('site_domains');
      table.update({ status: 'google_failed', last_error: 'gagné par un autre passage' });
      table.eq('id', 'dom-2');
      table.eq('status', 'dns_configured');
      await table.select();
      return true;
    });
    addSiteMock.mockResolvedValue(undefined);
    submitSitemapMock.mockResolvedValue(undefined);

    const { GET } = await import('../route');
    await GET(makeRequest());

    // La transition google_verified de CE passage n'a pas dû s'appliquer
    // (statut réel déjà 'google_failed' au moment de son UPDATE) --
    // le statut réel reste celui posé par "l'autre passage", jamais écrasé.
    expect(currentMock.getReal().status).toBe('google_failed');
    expect(currentMock.rejectedUpdates.some((u) => u.status === 'google_verified')).toBe(true);
  });

  it('transition google_verified -> sitemap_submitted appliquée uniquement si le statut réel est encore google_verified', async () => {
    currentMock = makeFakeSiteDomains({
      id: 'dom-3', domain: 'deja-verifie.com', status: 'google_verified', gsc_token: 'tok', gsc_attempts: 1, gsc_last_attempt_at: null,
    });
    addSiteMock.mockResolvedValue(undefined);
    submitSitemapMock.mockResolvedValue(undefined);

    const { GET } = await import('../route');
    await GET(makeRequest());

    expect(currentMock.getReal().status).toBe('sitemap_submitted');
    expect(verifyDomainMock).not.toHaveBeenCalled(); // déjà vérifié, pas de re-vérification
  });

  it("markTerminal n'incrémente failedTerminal que si sa propre garde de statut correspond réellement", async () => {
    const { MAX_ATTEMPTS } = await import('../route');
    currentMock = makeFakeSiteDomains({
      id: 'dom-4', domain: 'echec.com', status: 'dns_configured', gsc_token: 'tok', gsc_attempts: MAX_ATTEMPTS - 1, gsc_last_attempt_at: null,
    });
    verifyDomainMock.mockResolvedValue(false);

    const { GET } = await import('../route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(currentMock.getReal().status).toBe('google_failed');
    expect(body.failedTerminal).toBe(1);
  });
});
