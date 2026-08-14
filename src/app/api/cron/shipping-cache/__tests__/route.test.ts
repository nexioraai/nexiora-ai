import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================
// P0-3.9.7 — Route /api/cron/shipping-cache. Avant correction : aucun
// contrôle CRON_SECRET, contrairement à ses 9 routes sœurs — n'importe
// qui pouvait déclencher des appels CJ facturés/limités en quota.
// ============================================================

const startCronRunMock = vi.fn();
const finishCronRunMock = vi.fn();
vi.mock('@/lib/cron-tracker', () => ({
  startCronRun: (...args: unknown[]) => startCronRunMock(...args),
  finishCronRun: (...args: unknown[]) => finishCronRunMock(...args),
}));

// supabase-admin.ts throw au chargement si SUPABASE_SERVICE_ROLE_KEY est
// absent — non pertinent pour ce test (qui porte sur le contrôle
// CRON_SECRET, avant tout accès aux données), donc mocké minimalement.
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn(() => ({ select: vi.fn(async () => ({ data: [], error: null })) })) },
}));

import { GET } from '../route';

function makeRequest(auth?: string) {
  return new NextRequest('https://woorri.test/api/cron/shipping-cache', {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  startCronRunMock.mockReset();
  finishCronRunMock.mockReset();
  startCronRunMock.mockResolvedValue('run-1');
  finishCronRunMock.mockResolvedValue(undefined);
  process.env.CRON_SECRET = 'test-secret';
});

describe('GET /api/cron/shipping-cache — sans secret', () => {
  it('aucun en-tête Authorization -> 401, aucun traitement démarré (aligné sur les 9 routes cron sœurs)', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(startCronRunMock).not.toHaveBeenCalled();
  });

  it('secret incorrect -> 401', async () => {
    const res = await GET(makeRequest('Bearer mauvais-secret'));
    expect(res.status).toBe(401);
    expect(startCronRunMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/cron/shipping-cache — avec secret valide', () => {
  it('secret correct -> passe le contrôle d\'auth, le traitement démarre réellement (comportement métier inchangé)', async () => {
    const res = await GET(makeRequest('Bearer test-secret'));
    // Le contrôle d'auth est franchi : startCronRun est bien appelé, la
    // route ne s'arrête jamais à 401. Le reste (succès/erreur métier CJ)
    // est un comportement pré-existant, hors périmètre de cette correction.
    expect(res.status).not.toBe(401);
    expect(startCronRunMock).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/cron/shipping-cache — CRON_SECRET non configuré (parité avec les routes sœurs)', () => {
  it('si process.env.CRON_SECRET est absent, la route ne bloque pas (même comportement que ses 9 sœurs)', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest());
    expect(res.status).not.toBe(401);
    expect(startCronRunMock).toHaveBeenCalledTimes(1);
  });
});
