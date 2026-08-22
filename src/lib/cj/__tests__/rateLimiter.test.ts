import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit hostile rate-limit CJ, Phase 1-2 : verrouille que acquireCjSlot()
// (a) réclame réellement via UPDATE...WHERE...RETURNING (même primitif que
// le verrou de claim fulfillment, déjà prouvé fiable en conditions réelles),
// (b) reste en attente/réessaie tant que le créneau n'est pas libre,
// (c) dégrade gracieusement (jamais de throw) si la table n'existe pas
// encore -- scénario réel actuel tant que la migration n'est pas appliquée.

vi.useFakeTimers();

const fromMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({
  logAnomaly: (...a: unknown[]) => logAnomalyMock(...a),
}));

import { acquireCjSlot } from '../rateLimiter';

function chain(response: { data: unknown; error: unknown }) {
  const c: any = {};
  const self = () => c;
  c.update = vi.fn(self);
  c.eq = vi.fn(self);
  c.lt = vi.fn(self);
  c.select = vi.fn(async () => response);
  return c;
}

beforeEach(() => {
  fromMock.mockReset();
  logAnomalyMock.mockReset();
  logAnomalyMock.mockResolvedValue(undefined); // vrai contrat : logAnomaly() est toujours async
});

describe('acquireCjSlot', () => {
  it('créneau libre immédiatement -> une seule tentative, aucune attente', async () => {
    fromMock.mockImplementationOnce(() => chain({ data: [{ id: 1 }], error: null }));
    const p = acquireCjSlot();
    await vi.advanceTimersByTimeAsync(0);
    await p;
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('créneau occupé puis libéré -> réessaie jusqu\'à réussite, jamais un throw', async () => {
    fromMock
      .mockImplementationOnce(() => chain({ data: [], error: null })) // occupé
      .mockImplementationOnce(() => chain({ data: [], error: null })) // occupé
      .mockImplementationOnce(() => chain({ data: [{ id: 1 }], error: null })); // libre

    const p = acquireCjSlot();
    await vi.advanceTimersByTimeAsync(150);
    await vi.advanceTimersByTimeAsync(150);
    await vi.advanceTimersByTimeAsync(150);
    await p;
    expect(fromMock).toHaveBeenCalledTimes(3);
  });

  it('table absente (migration pas encore appliquée) -> RÉSILIENCE (dégrade gracieusement, jamais bloqué) ET GARANTIE perdue rendue OBSERVABLE (jamais silencieuse), mais une seule alerte pour plusieurs appels', async () => {
    const errorResponse = { data: null, error: { message: 'relation "cj_rate_limiter" does not exist' } };

    fromMock.mockImplementationOnce(() => chain(errorResponse));
    const p1 = acquireCjSlot();
    await vi.advanceTimersByTimeAsync(1100);
    await expect(p1).resolves.toBeUndefined(); // résilience : jamais de throw

    fromMock.mockImplementationOnce(() => chain(errorResponse));
    const p2 = acquireCjSlot();
    await vi.advanceTimersByTimeAsync(1100);
    await expect(p2).resolves.toBeUndefined();

    // Garantie perdue rendue observable (pas silencieuse), mais throttlée à
    // une seule alerte sur les deux appels -- ne noie pas checkout_anomalies
    // si la migration n'est simplement pas encore appliquée.
    expect(logAnomalyMock).toHaveBeenCalledTimes(1);
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_rate_limiter_unavailable', severity: 'warning' })
    );
  });
});

describe('acquireCjSlot — simulation de charge logique (audit hostile, Phase 10)', () => {
  // Modèle en mémoire fidèle à la sémantique WHERE réelle de Postgres :
  // une seule "colonne" partagée (fakeLastCallAt), la réservation ne réussit
  // que si la clause lt(threshold) est satisfaite au moment de l'évaluation
  // -- reproduit exactement ce que le vrai UPDATE...WHERE...RETURNING
  // garantit côté serveur (déjà prouvé fiable en conditions réelles cette
  // session sur le primitif identique du verrou de claim fulfillment).
  // N'appelle jamais l'API CJ -- teste uniquement la réservation du créneau DB.
  it('8 "instances" concurrentes -> 8 créneaux distincts, jamais deux attributions au même instant, aucune starvation', async () => {
    let fakeLastCallAt = Date.now() - 100_000; // libre initialement
    const acquiredAt: number[] = [];

    fromMock.mockImplementation(() => {
      const c: any = {};
      let newTs = 0;
      let threshold = 0;
      c.update = vi.fn((payload: { last_call_at: string }) => { newTs = new Date(payload.last_call_at).getTime(); return c; });
      c.eq = vi.fn(() => c);
      c.lt = vi.fn((_col: string, thresholdIso: string) => { threshold = new Date(thresholdIso).getTime(); return c; });
      c.select = vi.fn(async () => {
        if (fakeLastCallAt < threshold) {
          fakeLastCallAt = newTs; // réservation atomique -- personne d'autre ne peut réutiliser ce créneau
          acquiredAt.push(fakeLastCallAt);
          return { data: [{ id: 1 }], error: null };
        }
        return { data: [], error: null }; // créneau pas encore libre
      });
      return c;
    });

    // 8 "instances Vercel" simultanées -- même mécanisme, aucune mémoire
    // partagée entre elles (chaque appel repart de zéro), exactement comme
    // 8 invocations serverless indépendantes appelleraient acquireCjSlot().
    // Pire cas réaliste : 8 gagnants successifs, chacun devant attendre
    // ~1100ms après le précédent -> jusqu'à ~9s de temps simulé.
    const results = Promise.all(Array.from({ length: 8 }, () => acquireCjSlot()));
    for (let i = 0; i < 100 && acquiredAt.length < 8; i++) {
      await vi.advanceTimersByTimeAsync(200);
    }
    await results;

    expect(acquiredAt).toHaveLength(8); // aucune starvation
    expect(new Set(acquiredAt).size).toBe(8); // aucun double-attribution du même créneau
  }, 15000);
});
