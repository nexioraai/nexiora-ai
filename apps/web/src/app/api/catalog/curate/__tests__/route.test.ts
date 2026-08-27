import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================
// LOT 2 -- PREMIERE COUVERTURE DE `POST /api/catalog/curate`.
//
// CETTE ROUTE N'AVAIT AUCUN TEST. Elle ECRIT pourtant dans
// `site_catalog_selections` -- c'est la route qui remplit le catalogue d'une
// boutique. Mesure : retirer entierement sa garde d'admission ne cassait
// aucun des 3088 tests du depot (mutation A3, survivante).
//
// LE CAS QUI COMPTE EST `pod_brand`. Il A un catalogue fournisseur -- ses
// produits SONT des Printful, via ses mockups -- mais il n'utilise PAS le
// mecanisme de selection : son agent n'a aucun outil de curation
// (`CATALOG_SUBTYPES`), sa vitrine ne charge aucune selection
// (`shared.tsx`), sa barre de recherche n'est jamais montee
// (`showsVisitorCatalogSearch`). Trois couches disaient non ; cette route
// disait oui et lui creait des lignes orphelines.
//
// SON PIPELINE LEGITIME NE PASSE PAS ICI : `pod_designs` -> mockups ->
// `catalog-*` lit `catalog_products` directement, sans jamais toucher
// `site_catalog_selections`. Le refus ci-dessous ne l'affecte donc pas --
// c'est l'invariant B, verifie explicitement en fin de fichier.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const messagesCreateMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: function AnthropicMock(this: any) {
    this.messages = { create: (...a: unknown[]) => messagesCreateMock(...a) };
  },
}));

vi.mock('@/lib/ai-usage', () => ({ logAiUsage: vi.fn() }));

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'in', 'ilike', 'not', 'or', 'order', 'limit', 'upsert', 'update', 'delete']) {
    chain[m] = vi.fn(self);
  }
  chain.single = vi.fn(async () => response);
  chain.maybeSingle = vi.fn(async () => response);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { POST } from '../route';

const USER = { id: 'user-1', email: 'owner@test.com' };

function setupSite(site: Record<string, unknown>) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'sites') return tableChain({ data: site, error: null });
    if (table === 'catalog_products') return tableChain({ data: [], error: null });
    return tableChain({ data: [], error: null });
  });
}

function req() {
  return new NextRequest('https://x.test/api/catalog/curate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer owner-token' },
    body: JSON.stringify({ slug: 'ma-boutique' }),
  });
}

const SITE_BASE = {
  id: 'site-1',
  owner_id: USER.id,
  owner_email: USER.email,
  type: 'fashion',
  lang: 'fr',
  mode: 3,
  cj_margin_percent: 30,
  niche_keywords: ['sneakers'],
};

beforeEach(() => {
  fromMock.mockReset();
  messagesCreateMock.mockReset();
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: USER }, error: null });
});

describe('POST /api/catalog/curate — LOT 2 : admission au mecanisme de selection', () => {
  it.each([
    ['Mode 1 vitrine', { mode: 1, dropship_type: null }],
    ['Mode 2 boutique', { mode: 2, dropship_type: null }],
    ['Mode 3 pod_brand', { mode: 3, dropship_type: 'pod_brand' }],
    ['Mode 3 sans sous-type', { mode: 3, dropship_type: null }],
    ['Mode 3 sous-type inconnu', { mode: 3, dropship_type: 'legacy_mode_x' }],
    ['Mode inconnu', { mode: 4, dropship_type: 'reseller' }],
  ])('%s -> 400, AUCUNE selection ecrite, AUCUN appel Claude facture', async (_l, over) => {
    setupSite({ ...SITE_BASE, ...over });
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Site non-dropshipping');
    // La garde est AVANT tout travail : ni catalogue lu, ni selection ecrite,
    // ni token IA consomme.
    expect(fromMock).not.toHaveBeenCalledWith('catalog_products');
    expect(fromMock).not.toHaveBeenCalledWith('site_catalog_selections');
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it.each(['reseller', 'pod_custom'])(
    'Mode 3 %s -> la route travaille : le chemin legitime n\'est pas casse',
    async (t) => {
      setupSite({ ...SITE_BASE, dropship_type: t });
      const res = await POST(req());
      // Elle depasse l'admission et interroge reellement le catalogue.
      expect(res.status).toBe(200);
      expect(fromMock).toHaveBeenCalledWith('catalog_products');
    }
  );

  it('un non-proprietaire est refuse avant toute question de sous-mode', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });
    setupSite({ ...SITE_BASE, dropship_type: 'reseller' });
    const res = await POST(req());
    expect([401, 403, 404]).toContain(res.status);
    expect(fromMock).not.toHaveBeenCalledWith('site_catalog_selections');
  });
});

describe('LOT 2 / INVARIANT B — le pipeline legitime de pod_brand ne passe pas par cette route', () => {
  it('la route de curation ne lit jamais `pod_designs`, et le pipeline POD ne lit jamais `site_catalog_selections`', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const racine = join(__dirname, '../../../../../..');
    // Commentaires retires : ce fichier PARLE de `pod_designs` pour expliquer
    // pourquoi il ne s'en sert pas. C'est le CODE qui est assere, pas la prose
    // -- meme patron que `sansCommentaires` ailleurs dans le depot.
    const lire = (p: string) =>
      readFileSync(join(racine, p), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ');

    expect(lire('src/app/api/catalog/curate/route.ts')).not.toContain('pod_designs');
    // Les deux surfaces du pipeline pod_brand : generation des mockups et
    // conversion en produits vendables. Ni l'une ni l'autre ne depend du
    // mecanisme de selection, donc le refus pose ci-dessus ne les touche pas.
    for (const f of [
      'src/app/api/pod/generate-mockups/route.ts',
      'src/app/sites/[slug]/themes/shared.tsx',
    ]) {
      expect(lire(f), f).not.toContain('usesCatalogSelections');
    }
    expect(lire('src/app/api/pod/generate-mockups/route.ts')).not.toContain('site_catalog_selections');
  });
});
