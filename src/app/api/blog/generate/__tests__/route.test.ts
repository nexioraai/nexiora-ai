import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// LOT 6 -- PREMIERE COUVERTURE DE `/api/blog/generate`.
//
// Aucun test, et son prefixe n'etait pas collecte par `vitest run` (corrige
// dans le meme lot -- meme piege qu'au LOT 0 et au LOT 1).
//
// CE QUE LA ROUTE PERMETTAIT. Aucune authentification, aucune limite : un
// tiers postait un `topic` arbitraire, faisait executer un appel Claude
// Sonnet FACTURE sur son propre prompt, et faisait INSERER le resultat dans
// `blog_posts` -- table lue par `/blog`, `/blog/[slug]` et le sitemap.
//
// LES TESTS OBSERVENT LA DEPENSE ET L'ECRITURE, pas des chaines de
// caracteres : `messagesCreateMock` et `insertMock` sont les deux effets
// dangereux, et chaque refus doit les laisser a zero.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const messagesCreateMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...a: unknown[]) => messagesCreateMock(...a) };
  },
}));

const logAiUsageMock = vi.fn();
vi.mock('@/lib/ai-usage', () => ({ logAiUsage: (...a: unknown[]) => logAiUsageMock(...a) }));

const insertMock = vi.fn();
/** Compteur renvoye par la requete de limite de debit, et filtres reellement poses. */
let compteRecent = 0;
const filtres: [string, unknown][] = [];
const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

import { POST } from '../route';

const ADMIN = 'issayamiyoussouf@gmail.com';

function req(body: unknown, token: string | null = 'jeton-admin') {
  return new Request('https://deribfy.test/api/blog/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body),
  }) as never;
}

const ARTICLE = JSON.stringify({ title: 'Titre', slug: 'titre', content: 'Contenu' });

beforeEach(() => {
  compteRecent = 0;
  filtres.length = 0;
  getUserMock.mockReset().mockResolvedValue({ data: { user: { email: ADMIN } }, error: null });
  messagesCreateMock.mockReset().mockResolvedValue({
    content: [{ type: 'text', text: ARTICLE }],
    usage: { input_tokens: 10, output_tokens: 900 },
  });
  logAiUsageMock.mockReset();
  insertMock.mockReset().mockResolvedValue({ error: null });
  fromMock.mockReset().mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    // La requete de limite se termine par `.gte(...)` et est attendue
    // directement : la chaine est thenable et rend `{ count }`.
    chain.select = vi.fn(self);
    chain.eq = vi.fn((c: string, v: unknown) => { filtres.push([c, v]); return chain; });
    chain.is = vi.fn((c: string, v: unknown) => { filtres.push([c, v]); return chain; });
    chain.gte = vi.fn((c: string, v: unknown) => {
      // LOT 6 -- l'horodatage est CONSERVE tel quel. Une premiere version le
      // normalisait en 'horodatage' : n'importe quelle borne passait alors,
      // y compris l'epoque zero -- la fenetre devenait infinie et la limite
      // inoperante, sans qu'aucun test ne bronche (mutation O6, survivante).
      filtres.push([c, v]);
      return { then: (r: (x: unknown) => void) => r({ count: compteRecent, error: null }) };
    });
    chain.insert = vi.fn((p: unknown) => insertMock(p));
    chain.then = (r: (x: unknown) => void) => r({ count: compteRecent, error: null });
    return chain;
  });
});

describe('POST /api/blog/generate — LOT 6 : reserve a l\'administration Deribfy', () => {
  it.each([
    ['aucune en-tete Authorization', null, { data: { user: null }, error: null }, 401],
    ['jeton invalide', 'jeton-pourri', { data: { user: null }, error: { message: 'bad jwt' } }, 401],
    ['compte sans courriel', 'jeton', { data: { user: {} }, error: null }, 401],
  ])('%s -> %s : AUCUNE depense IA, AUCUNE ecriture', async (_l, token, auth, statut) => {
    getUserMock.mockResolvedValue(auth as never);
    const res = await POST(req({ topic: 'dropshipping' }, token as string | null));
    expect(res.status).toBe(statut as number);
    expect(messagesCreateMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(logAiUsageMock).not.toHaveBeenCalled();
  });

  it.each([
    ['Basic dXNlcjpwYXNz', 'un schema d\'authentification etranger'],
    ['jeton-sans-schema', 'un jeton sans schema'],
    ['bearer minuscule', 'un schema de mauvaise casse'],
  ])('en-tete `%s` (%s) -> 401, et le jeton n\'est meme pas soumis', async (header) => {
    // Une premiere version de ce fichier n'envoyait JAMAIS d'en-tete mal
    // formee : remplacer l'extraction du jeton par `header || 'x'` passait
    // alors tous les tests (mutation O11, survivante). Seul `Bearer ` fait
    // un jeton.
    const r = new Request('https://deribfy.test/api/blog/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: header },
      body: JSON.stringify({ topic: 'sujet' }),
    }) as never;
    const res = await POST(r);
    expect(res.status).toBe(401);
    expect(getUserMock).not.toHaveBeenCalled();
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('un jeton `Bearer` est transmis SANS son schema', async () => {
    await POST(req({ topic: 'sujet' }, 'mon-jeton-exact'));
    expect(getUserMock).toHaveBeenCalledWith('mon-jeton-exact');
  });

  it('compte authentifie mais NON administrateur -> 403, aucune depense, aucune ecriture', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'marchand@exemple.com' } }, error: null });
    const res = await POST(req({ topic: 'dropshipping' }));
    expect(res.status).toBe(403);
    expect(messagesCreateMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('administrateur -> generation ET insertion dans blog_posts', async () => {
    const res = await POST(req({ topic: 'dropshipping' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, slug: 'titre' });
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Titre', slug: 'titre', published: false })
    );
  });

  it('l\'identite est verifiee AVANT la lecture du corps : un corps illisible ne contourne rien', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'intrus@exemple.com' } }, error: null });
    const mauvais = new Request('https://deribfy.test/api/blog/generate', {
      method: 'POST',
      headers: { authorization: 'Bearer x' },
      body: 'pas du json',
    }) as never;
    expect((await POST(mauvais)).status).toBe(403);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/blog/generate — LOT 6 : la depense IA est bornee', () => {
  it('sous le plafond -> la generation a lieu, et la depense est tracee', async () => {
    compteRecent = 2;
    expect((await POST(req({ topic: 'sujet' }))).status).toBe(200);
    expect(messagesCreateMock).toHaveBeenCalled();
    expect(logAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: null, usageType: 'blog' })
    );
  });

  it.each([3, 4, 50])('%s appels dans la fenetre -> 429, AUCUN appel Claude, AUCUNE ecriture', async (n) => {
    compteRecent = n;
    const res = await POST(req({ topic: 'sujet' }));
    expect(res.status).toBe(429);
    expect(messagesCreateMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('le comptage porte bien sur le blog CENTRAL (site_id null)', async () => {
    await POST(req({ topic: 'sujet' }));
    expect(filtres).toContainEqual(['site_id', null]);
    expect(filtres).toContainEqual(['usage_type', 'blog']);
  });

  it('la fenetre est REELLEMENT courte : une borne trop ancienne rendrait la limite inoperante', async () => {
    const avant = Date.now();
    await POST(req({ topic: 'sujet' }));
    const borne = filtres.find(([c]) => c === 'created_at')?.[1];
    expect(typeof borne).toBe('string');
    const ecart = avant - Date.parse(borne as string);
    // Une minute, comme `catalog/image-search`. On tolere la duree du test.
    expect(ecart).toBeGreaterThan(0);
    expect(ecart).toBeLessThan(5 * 60_000);
  });

  it('la limite est evaluee AVANT la depense : le refus precede l\'appel facture', async () => {
    compteRecent = 99;
    await POST(req({ topic: 'sujet' }));
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/blog/generate — LOT 6 : le sujet est borne', () => {
  it.each([
    ['vide', ''],
    ['non-chaine', 12345],
    ['objet', { evil: true }],
    ['trop long (injection de prompt)', 'x'.repeat(201)],
  ])('topic %s -> 400, aucune depense', async (_l, topic) => {
    const res = await POST(req({ topic }));
    expect(res.status).toBe(400);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('un sujet legitime de 200 caracteres passe encore', async () => {
    expect((await POST(req({ topic: 'x'.repeat(200) }))).status).toBe(200);
  });
});

describe('LOT 6 — PERIMETRE : le blog des sites clients n\'est pas touche', () => {
  it('cette route n\'ecrit QUE dans `blog_posts`, jamais dans les tables marketing', async () => {
    await POST(req({ topic: 'sujet' }));
    const tables = fromMock.mock.calls.map((c) => c[0]);
    expect(tables).toContain('blog_posts');
    expect(tables).not.toContain('marketing_assets');
    expect(tables).not.toContain('marketing_briefs');
  });

  it('elle n\'accepte ni slug ni site : le contenu central n\'appartient a aucun locataire', async () => {
    await POST(req({ topic: 'sujet', slug: 'boutique-x', siteId: 'site-1' }));
    const charge = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(charge).not.toHaveProperty('site_id');
    expect(charge).not.toHaveProperty('slug', 'boutique-x');
    expect(filtres).not.toContainEqual(['site_id', 'site-1']);
  });
});
