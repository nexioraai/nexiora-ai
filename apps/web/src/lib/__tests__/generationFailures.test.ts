import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit /api/chat (FUNC-05/OBS-05) -- defaut reel trouve : logGenerationFailure()
// ne lisait jamais `error` sur le retour de `.insert()`, qui ne leve PAS
// d'exception Supabase sur un rejet DB (RLS/contrainte/type) -- seul un
// `catch` ne pouvait donc jamais le detecter. Ce test verrouille que
// l'echec DB (error non-null, pas d'exception) est desormais bien logue,
// avec le contenu diagnostique complet en secours.

const insertMock = vi.fn();
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (...a: unknown[]) => ({ insert: (...b: unknown[]) => insertMock(...a, ...b) }),
  },
}));

import { logGenerationFailure } from '../generationFailures';

function baseParams(overrides: Partial<Parameters<typeof logGenerationFailure>[0]> = {}) {
  return {
    owner_id: 'user-1',
    owner_email: 'a@b.com',
    requested_mode: null,
    detected_sector: 'restaurant',
    failure_type: 'json_parse' as const,
    stop_reason: 'max_tokens',
    parse_error: 'Unterminated string',
    raw_response_tail: '...contenu brut Claude tronque...',
    message_excerpt: 'Restaurant marocain...',
    ...overrides,
  };
}

describe('logGenerationFailure', () => {
  beforeEach(() => {
    insertMock.mockReset();
    consoleErrorSpy.mockClear();
  });

  it('insertion reussie (error: null) -> aucun log de secours, un seul insert', async () => {
    insertMock.mockResolvedValue({ data: null, error: null });
    await logGenerationFailure(baseParams());
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(
      'generation_failures',
      expect.objectContaining({
        owner_id: 'user-1',
        failure_type: 'json_parse',
        stop_reason: 'max_tokens',
        raw_response_tail: '...contenu brut Claude tronque...',
      })
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('rejet DB (error non-null, PAS d\'exception) -> detecte et logue avec le contenu diagnostique complet -- le defaut reel corrige', async () => {
    // Reproduit exactement le comportement reel du client Supabase sur un
    // rejet DB : la promesse se resout normalement, elle ne rejette jamais.
    insertMock.mockResolvedValue({ data: null, error: { message: 'permission denied for table generation_failures' } });
    await logGenerationFailure(baseParams({ failure_type: 'schema_validation', zod_issues: [{ path: ['testimonials', 0, 'rating'], message: 'Expected number, received string' }] }));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[generation_failures] insert rejete par la DB:',
      'permission denied for table generation_failures'
    );
    // Le contenu diagnostique complet (notamment raw_response_tail) doit
    // rester recuperable dans les logs meme si la DB refuse l'ecriture.
    const fallbackCall = consoleErrorSpy.mock.calls.find((c) =>
      String(c[0]).includes('DB indisponible')
    );
    expect(fallbackCall).toBeDefined();
    const loggedPayload = JSON.parse(fallbackCall![1] as string);
    expect(loggedPayload.raw_response_tail).toBe('...contenu brut Claude tronque...');
    expect(loggedPayload.zod_issues).toEqual([{ path: ['testimonials', 0, 'rating'], message: 'Expected number, received string' }]);
  });

  it('exception reseau/client -> toujours capturee (chemin deja existant, non regresse)', async () => {
    insertMock.mockRejectedValue(new Error('fetch failed'));
    await logGenerationFailure(baseParams());

    expect(consoleErrorSpy).toHaveBeenCalledWith('[generation_failures] insert a leve une exception:', expect.any(Error));
    const fallbackCall = consoleErrorSpy.mock.calls.find((c) => String(c[0]).includes('DB indisponible'));
    expect(fallbackCall).toBeDefined();
  });

  it('ne leve jamais -- un echec de journalisation ne doit jamais casser l\'appelant', async () => {
    insertMock.mockRejectedValue(new Error('reseau indisponible'));
    await expect(logGenerationFailure(baseParams())).resolves.toBeUndefined();
  });
});
