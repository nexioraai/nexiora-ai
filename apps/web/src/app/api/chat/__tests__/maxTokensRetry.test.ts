import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit /api/chat (FUNC-04) : max_tokens=4500 etait fixe DANS la marge de
// variance naturelle du modele (mesure reelle : 4227/4416 tokens en succes,
// troncature a 4500 sur un essai identique) -- releve a 8000 (precedent
// deja en production, meme modele, catalog/enhance/route.ts) + un retry
// unique, strictement conditionne a stop_reason==='max_tokens'. Ce test
// verrouille : aucun retry hors de ce cas precis, aucune boucle, aucune
// double ecriture DB.

const getUserMock = vi.fn();
const fromMock = vi.fn();
const anthropicCreateMock = vi.fn();
const logGenerationFailureMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...a) },
}));
vi.mock('@/lib/generationFailures', () => ({
  logGenerationFailure: (...a: unknown[]) => logGenerationFailureMock(...a),
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...a: unknown[]) => anthropicCreateMock(...a) };
  },
}));
vi.mock('@/app/lib/aiScore', () => ({
  computeAiScore: () => ({ score: 50 }),
}));

import { POST } from '../route';

function req(body: Record<string, unknown>) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

const VALID_SITE_JSON = JSON.stringify({
  name: 'Riad Essaada',
  slogan: 'Un voyage culinaire',
  type: 'Restaurant marocain',
  heroTitle: 'Bienvenue',
  about: 'Un restaurant marocain authentique.',
  mode: 1,
  contact: { phone: '', email: '', address: '123 Rue Sainte-Catherine, Montreal' },
  products: [],
  sections: [],
});

function anthropicMsg(stop_reason: string, text = VALID_SITE_JSON) {
  return { content: [{ type: 'text', text }], stop_reason, usage: { output_tokens: 100 } };
}

// Message assez long pour sauter le pre-check (>=40 car, >=5 mots) --
// evite un 3e appel Anthropic qui fausserait le comptage.
const LONG_MESSAGE = 'Restaurant marocain haut de gamme avec specialites variees et service traiteur pour les evenements a Montreal';

function mockSitesChain() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { generation_count: 0 }, error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    single: vi.fn().mockResolvedValue({ data: { id: 'site-1' }, error: null }),
  };
}

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
  anthropicCreateMock.mockReset();
  logGenerationFailureMock.mockReset();
  logGenerationFailureMock.mockResolvedValue(undefined);

  getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null });
  fromMock.mockImplementation(() => mockSitesChain());

  // Geocode/Pexels : reponses vides mais reussies -- hors perimetre de ce
  // test (voir DISPO-01), ne doit pas faire echouer/ralentir ces scenarios.
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ([]),
  }) as any;
});

describe('POST /api/chat -- retry max_tokens (FUNC-04)', () => {
  it('1. end_turn direct -- un seul appel Anthropic, aucun retry', async () => {
    anthropicCreateMock.mockResolvedValue(anthropicMsg('end_turn'));
    const res = await POST(req({ message: LONG_MESSAGE, location: 'Montreal, Canada' }));
    expect(res.status).toBe(200);
    expect(anthropicCreateMock).toHaveBeenCalledTimes(1);
  });

  it('2. max_tokens au 1er essai -- exactement un retry (2 appels total)', async () => {
    anthropicCreateMock
      .mockResolvedValueOnce(anthropicMsg('max_tokens', '{"incomplete'))
      .mockResolvedValueOnce(anthropicMsg('end_turn'));
    const res = await POST(req({ message: LONG_MESSAGE, location: 'Montreal, Canada' }));
    expect(anthropicCreateMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it('3. retry reussi -- le resultat du 2e appel est bien celui traite (site cree avec les vraies donnees)', async () => {
    const secondPayload = JSON.stringify({ ...JSON.parse(VALID_SITE_JSON), name: 'Nom Du Retry Reussi' });
    anthropicCreateMock
      .mockResolvedValueOnce(anthropicMsg('max_tokens', '{"broken'))
      .mockResolvedValueOnce(anthropicMsg('end_turn', secondPayload));
    const res = await POST(req({ message: LONG_MESSAGE, location: 'Montreal, Canada' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.name).toBe('Nom Du Retry Reussi');
  });

  it('4. retry qui echoue aussi (2e max_tokens) -- erreur propre 502, jamais un 3e appel', async () => {
    anthropicCreateMock
      .mockResolvedValueOnce(anthropicMsg('max_tokens', '{"incomplete'))
      .mockResolvedValueOnce(anthropicMsg('max_tokens', '{"incomplete_again'));
    const res = await POST(req({ message: LONG_MESSAGE, location: 'Montreal, Canada' }));
    expect(anthropicCreateMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(502);
    expect(logGenerationFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({ failure_type: 'json_parse', stop_reason: 'max_tokens' })
    );
  });

  it('5. erreur reseau sur le 1er appel -- aucun retry indu (l\'exception se propage avant toute logique de retry)', async () => {
    anthropicCreateMock.mockRejectedValue(new Error('network down'));
    const res = await POST(req({ message: LONG_MESSAGE, location: 'Montreal, Canada' }));
    expect(anthropicCreateMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(500);
  });

  it('6. JSON invalide avec end_turn (pas une troncature) -- aucun retry, erreur directe', async () => {
    anthropicCreateMock.mockResolvedValue(anthropicMsg('end_turn', 'ceci n\'est pas du JSON'));
    const res = await POST(req({ message: LONG_MESSAGE, location: 'Montreal, Canada' }));
    expect(anthropicCreateMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(502);
    expect(logGenerationFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({ failure_type: 'json_parse', stop_reason: 'end_turn' })
    );
  });

  it('7. echec Zod avec end_turn (pas une troncature) -- aucun retry', async () => {
    anthropicCreateMock.mockResolvedValue(anthropicMsg('end_turn', JSON.stringify({ name: '' })));
    const res = await POST(req({ message: LONG_MESSAGE, location: 'Montreal, Canada' }));
    expect(anthropicCreateMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(502);
    expect(logGenerationFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({ failure_type: 'schema_validation', stop_reason: 'end_turn' })
    );
  });

  it('8. aucune boucle -- jamais plus de 2 appels Anthropic quel que soit le scenario', async () => {
    anthropicCreateMock.mockResolvedValue(anthropicMsg('max_tokens', '{"toujours_tronque'));
    await POST(req({ message: LONG_MESSAGE, location: 'Montreal, Canada' }));
    expect(anthropicCreateMock.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('9. comportement existant preserve -- generation nominale toujours creee correctement (sites.insert appele une seule fois, pas de doublon)', async () => {
    anthropicCreateMock.mockResolvedValue(anthropicMsg('end_turn'));
    const sitesInsertMock = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementation((table: string) => {
      const chain = mockSitesChain();
      if (table === 'sites') chain.insert = sitesInsertMock;
      return chain;
    });
    const res = await POST(req({ message: LONG_MESSAGE, location: 'Montreal, Canada' }));
    expect(res.status).toBe(200);
    expect(sitesInsertMock).toHaveBeenCalledTimes(1);
  });
});
