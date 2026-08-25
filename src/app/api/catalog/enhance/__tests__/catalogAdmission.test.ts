import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// CHANTIER 6 (MODE 1) — `catalog/enhance` PASSE PAR LA PRIMITIVE.
//
// CE QUI TENAIT LIEU DE RÈGLE : L'ABSENCE DE DONNÉES. Un site sans ligne
// dans `site_catalog_selections` sortait en 200 « Tous les produits sont
// déjà optimisés ». Ce n'était pas une décision d'autorisation — c'était un
// message de fin de travail, rendu par hasard à un site qui n'aurait jamais
// dû atteindre cette route. « Sûr par absence de donnée » cesse de l'être
// dès qu'une ligne apparaît, par quelque chemin que ce soit.
//
// Ces tests exercent la ROUTE, avec un catalogue NON VIDE pour un site sans
// admission — précisément le cas que l'ancien comportement laissait passer.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const messagesCreateMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: (...a: unknown[]) => messagesCreateMock(...a) }; },
}));
vi.mock('@/lib/ai-usage', () => ({ logAiUsage: vi.fn() }));

type Row = Record<string, unknown>;
let siteRow: Row | null;
let selections: Row[];
let ecritures: Row[] = [];

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

const USER = { id: 'owner-1', email: 'm@test.com' };

/** Une sélection RÉELLE : le catalogue n'est pas vide. */
const SELECTION = {
  id: 'sel-1',
  catalog_products: { name: 'Wireless Earbuds', description: 'Bluetooth 5.3', category: 'audio', price: 12, currency: 'USD' },
};

function siteChain() {
  const b: any = {};
  b.select = () => b; b.eq = () => b;
  b.maybeSingle = async () => ({ data: siteRow, error: null });
  b.single = b.maybeSingle;
  return b;
}
function selectionsChain() {
  const b: any = {};
  b.select = () => b; b.eq = () => b; b.is = () => b; b.order = () => b;
  b.limit = async () => ({ data: selections, error: null });
  b.update = (p: Row) => { ecritures.push(p); return b; };
  b.then = (res: (v: unknown) => void) => res({ data: null, error: null });
  return b;
}

function req(body: unknown = { slug: 'yia' }) {
  return new Request('https://x.test/api/catalog/enhance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  ecritures = [];
  selections = [SELECTION];
  // LOT 2 -- `dropship_type` AJOUTE A LA FIXTURE, et c'est un constat : cette
  // fixture Mode 3 n'en portait aucun, si bien que les cas « la route
  // travaille » ne decrivaient aucun site reel. L'admission descendant du
  // mode au mecanisme de selection, ils decrivent desormais un vrai site
  // reseller. Les cas qui visent un sous-type precis l'ecrivent.
  siteRow = { id: 'site-1', owner_id: USER.id, owner_email: USER.email, type: 'audio', lang: 'fr', mode: 3, dropship_type: 'reseller' };
  getUserMock.mockReset().mockResolvedValue({ data: { user: { ...USER } }, error: null });
  messagesCreateMock.mockReset().mockResolvedValue({
    // La route attend du JSON `[{index,title,description}]` ; toute autre
    // forme sort en 500 "Erreur parsing". Mesure, pas supposition.
    content: [{ type: 'text', text: '[{"index":0,"title":"Écouteurs sans fil","description":"Une description."}]' }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  fromMock.mockReset().mockImplementation((table: string) => {
    if (table === 'sites') return siteChain();
    if (table === 'site_catalog_selections') return selectionsChain();
    throw new Error('table inattendue : ' + table);
  });
});

async function appeler() {
  const { POST } = await import('../route');
  const res = await POST(req() as any);
  return { statut: res.status, corps: await res.json().catch(() => null) };
}

describe('CHANTIER 6 — sans admission au catalogue, la route refuse', () => {
  it('🔴 Mode 1 → 400, AUCUN appel Claude, AUCUNE lecture de sélection', async () => {
    siteRow = { ...siteRow!, mode: 1 };
    const { statut, corps } = await appeler();
    expect(statut).toBe(400);
    expect(corps.error).toBe('Site non-dropshipping');
    expect(messagesCreateMock, 'un appel Claude facturé a eu lieu').not.toHaveBeenCalled();
    expect(ecritures).toHaveLength(0);
    // TROU RÉVÉLÉ PAR MUTATION. La garde promet d'agir « AVANT toute lecture
    // de sélection ». Sans cette assertion, la déplacer APRÈS la requête
    // passait vert : le refus était correct, mais la base était interrogée
    // pour un site qui n'a aucun catalogue. On teste la promesse écrite.
    expect(
      fromMock.mock.calls.map((c: unknown[]) => c[0]),
      'la table des sélections a été interrogée malgré le refus',
    ).not.toContain('site_catalog_selections');
  });

  it('🔴 Mode 2 → 400 également — l’admission au commerce ne vaut pas admission au catalogue', async () => {
    siteRow = { ...siteRow!, mode: 2 };
    expect((await appeler()).statut).toBe(400);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('🔴 fail-closed : toute valeur de mode inattendue refuse', async () => {
    for (const mode of [null, undefined, 0, 4, '3', 'trois', NaN, {}, [3], true]) {
      messagesCreateMock.mockClear();
      siteRow = { ...siteRow!, mode };
      const { statut } = await appeler();
      expect(statut, JSON.stringify(mode)).toBe(400);
      expect(messagesCreateMock, JSON.stringify(mode)).not.toHaveBeenCalled();
    }
  });

  it('🔴 LE CAS DÉCISIF : un catalogue NON VIDE ne rachète pas l’absence d’admission', async () => {
    // C'est exactement ce que l'ancien code laissait passer : la seule chose
    // qui arrêtait un site sans catalogue était la table vide. Avec une ligne
    // présente, il partait en appel Claude.
    selections = [SELECTION, { ...SELECTION, id: 'sel-2' }];
    siteRow = { ...siteRow!, mode: 1 };
    const { statut } = await appeler();
    expect(statut).toBe(400);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('la réponse de refus ne dépend PAS du nombre de sélections', async () => {
    for (const jeu of [[], [SELECTION], [SELECTION, SELECTION, SELECTION]]) {
      selections = jeu;
      siteRow = { ...siteRow!, mode: 1 };
      const { statut, corps } = await appeler();
      expect(statut, String(jeu.length)).toBe(400);
      expect(corps.error).toBe('Site non-dropshipping');
    }
  });
});

describe('CHANTIER 6 — avec admission, la logique normale se poursuit', () => {
  it('Mode 3 + sélections → la route travaille et appelle Claude', async () => {
    const { statut } = await appeler();
    expect(statut).toBe(200);
    expect(messagesCreateMock).toHaveBeenCalled();
  });

  it('Mode 3 sans sélection → le message métier d’origine, inchangé', async () => {
    // La garde d'admission ne remplace pas ce message : ce sont deux causes
    // distinctes, elles gardent deux réponses distinctes.
    selections = [];
    const { statut, corps } = await appeler();
    expect(statut).toBe(200);
    expect(corps.message).toContain('déjà optimisés');
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('🔴 le refus de propriété précède TOUJOURS l’admission', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'autre', email: 'x@t.com' } }, error: null });
    siteRow = { ...siteRow!, mode: 3 };
    const { statut } = await appeler();
    expect(statut).not.toBe(200);
    expect(statut).not.toBe(400);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });
});
