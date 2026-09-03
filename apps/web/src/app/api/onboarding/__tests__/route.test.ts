import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// LOT 1 / L1-01 + L1-05 -- LA SOURCE DES SITES SANS SOUS-TYPE.
//
// PREMIERE COUVERTURE DE CETTE ROUTE, et son prefixe n'etait pas collecte
// par `vitest run` (corrige dans le meme lot -- meme piege qu'au LOT 0).
//
// CE QUE CETTE ROUTE PRODUISAIT. L'entretien concluait `ready_to_generate`
// avec `mode: 3` et `dropshipType: null` des que le modele ne reconnaissait
// pas le sous-type. La generation partait, et `sites.dropship_type` recevait
// `null` DEFINITIVEMENT -- la colonne n'etant jamais modifiable ensuite.
// Trois sites de production sont dans cet etat, dont un publie, portant 12
// commandes reelles et 2 `cj_order_id`.
//
// ET LE CHOIX DE L'UTILISATEUR ETAIT IGNORE : `OnboardingChat` envoie deja
// `dropshipType` dans le corps de requete, cette route ne le lisait pas.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

const messagesCreateMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...a: unknown[]) => messagesCreateMock(...a) };
  },
}));

import { POST } from '../route';

/**
 * L'entretien conclut : mode 3, et le sous-type que le modele a su lire.
 *
 * L'ACCOLADE OUVRANTE EST OMISE, DELIBEREMENT. La route amorce la reponse du
 * modele par un tour assistant `{` et reconstitue `'{' + texte`. Un mock qui
 * renverrait l'objet complet produirait `{{...}`, donc un `JSON.parse` en
 * echec, donc le chemin d'extraction tolerante -- et le test mesurerait ce
 * chemin de secours au lieu du chemin nominal. Mesure faite : la premiere
 * version de ce fichier tombait exactement dans ce piege, et quatre de ses
 * cas passaient par accident, le repli produisant fortuitement la bonne
 * reponse. Le mock reproduit donc ce que l'API renvoie reellement.
 */
function entretienConclut(detectedDropshipType: unknown, detectedMode: unknown = 3) {
  const objet = JSON.stringify({
    type: 'done',
    summary: 'A dropshipping store selling gadgets.',
    detectedLang: 'fr',
    detectedMode,
    detectedDropshipType,
  });
  messagesCreateMock.mockResolvedValue({
    content: [{ type: 'text', text: objet.slice(1) }],
  });
}

function req(body: Record<string, unknown>) {
  return new Request('http://localhost/api/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
    body: JSON.stringify({
      history: [{ role: 'user', content: 'Je veux vendre des gadgets en dropshipping' }],
      ...body,
    }),
  });
}

beforeEach(() => {
  fromMock.mockReset();
  messagesCreateMock.mockReset();
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'm@test.com' } }, error: null });
  // Profil sous le plafond gratuit : la route poursuit.
  fromMock.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data: { generation_count: 0 }, error: null });
    return chain;
  });
});

describe('LOT 1 / L1-01 -- un Mode 3 sans sous-type n\'atteint plus la generation', () => {
  it.each([null, undefined, '', 'RESELLER', 'pod-brand', 'legacy_mode_x'])(
    'sous-type detecte = %s -> `need_dropship_type`, JAMAIS `ready_to_generate`',
    async (detecte) => {
      entretienConclut(detecte);
      const json = await (await POST(req({ chosenMode: 3 }))).json();
      expect(json.type).toBe('need_dropship_type');
      expect(json.type).not.toBe('ready_to_generate');
      // Rien qui puisse etre persiste ne sort de cette reponse.
      expect(json.dropshipType).toBeUndefined();
      expect(json.summary).toBeUndefined();
    }
  );

  it.each(['reseller', 'pod_brand', 'pod_custom'])(
    'sous-type detecte = %s -> generation autorisee, sous-type transmis tel quel',
    async (detecte) => {
      entretienConclut(detecte);
      const json = await (await POST(req({ chosenMode: 3 }))).json();
      expect(json.type).toBe('ready_to_generate');
      expect(json.mode).toBe(3);
      expect(json.dropshipType).toBe(detecte);
    }
  );
});

describe('LOT 1 / L1-01 -- le choix EXPLICITE de l\'utilisateur prime sur la detection', () => {
  it('le modele ne detecte rien, mais l\'utilisateur a choisi : la generation part avec SON choix', async () => {
    // Sans cela, le selecteur ouvert par `need_dropship_type` pourrait
    // redemander indefiniment un sous-type que l'utilisateur vient de
    // designer -- la correction produirait une boucle au lieu d'une impasse.
    entretienConclut(null);
    const json = await (await POST(req({ chosenMode: 3, dropshipType: 'pod_custom' }))).json();
    expect(json.type).toBe('ready_to_generate');
    expect(json.dropshipType).toBe('pod_custom');
  });

  it('un `dropshipType` invente dans le corps de requete ne prime sur rien', async () => {
    entretienConclut('reseller');
    const json = await (await POST(req({ chosenMode: 3, dropshipType: 'legacy_mode_x' }))).json();
    expect(json.type).toBe('ready_to_generate');
    expect(json.dropshipType).toBe('reseller');
  });

  it('un `dropshipType` invente, sans detection valide -> toujours refuse', async () => {
    entretienConclut(null);
    const json = await (await POST(req({ chosenMode: 3, dropshipType: { evil: true } }))).json();
    expect(json.type).toBe('need_dropship_type');
  });
});

describe('LOT 1 -- FRONTIERE : les modes 1 et 2 ne sont pas affectes', () => {
  it.each([1, 2])('mode %s sans sous-type -> `ready_to_generate`, comme avant', async (m) => {
    entretienConclut(null, m);
    const json = await (await POST(req({ chosenMode: m }))).json();
    expect(json.type).toBe('ready_to_generate');
    expect(json.mode).toBe(m);
    expect(json.dropshipType).toBeNull();
  });

  it('mode 2 AVEC un sous-type detecte -> genere quand meme : la regle ne bloque que le mode 3', async () => {
    entretienConclut('reseller', 2);
    const json = await (await POST(req({ chosenMode: 2 }))).json();
    expect(json.type).toBe('ready_to_generate');
    expect(json.mode).toBe(2);
  });
});
