import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================
// Audit Mode 3 global (N2, meme cause racine que N1 -- checkout/route.ts) --
// POST /api/catalog/selections (ajout manuel d'un produit par le marchand)
// n'importait pas suppliersForDropshipType (source unique deja utilisee par
// catalog/curate et catalog/search) : un marchand reseller pouvait ajouter
// manuellement un produit Printful/Gelato a sa selection, visible ensuite
// dans la recherche "curated" et achetable au checkout en contradiction
// avec l'invariant du sous-mode.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.upsert = vi.fn(self);
  // CHANTIER 6 -- quatre maillons AJOUTES. Ce fichier ne testait que POST ;
  // GET, PATCH et DELETE empruntent `order`, `update` et `delete`. Ajout pur :
  // aucun maillon existant n'est modifie, donc aucun cas anterieur ne change.
  chain.order = vi.fn(async () => response);
  chain.update = vi.fn(self);
  chain.delete = vi.fn(self);
  chain.maybeSingle = vi.fn(async () => response);
  chain.single = vi.fn(async () => response);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { POST } from '../route';

function req(body: unknown, token = 'owner-token') {
  return new NextRequest('https://x.test/api/catalog/selections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  });
}

// CHANTIER 6 -- LA FIXTURE GAGNE `mode`, ET CE N'EST PAS UN AFFAIBLISSEMENT.
// Elle decrivait un site reseller SANS mode : une forme qui n'existe pas en
// base, puisqu'un site reseller est par definition un Mode 3. La route
// interroge desormais `hasSupplierCatalog(site.mode)` avant le sous-mode ;
// sans ce champ, ces cinq cas ne testaient plus le sous-mode mais le refus
// d'admission. Le `mode` est donc rendu explicite, et le refus d'admission
// obtient ses propres tests plus bas -- deux regles, deux jeux de tests.
function setup(site: { dropship_type: string | null; mode?: unknown }, product: { supplier_id: string | null } | null) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'sites') return tableChain({ data: { id: 'my-site-id', owner_id: 'owner-id', mode: 3, ...site }, error: null });
    if (table === 'catalog_products') return tableChain({ data: product ? { id: 'cp-1', ...product } : null, error: null });
    if (table === 'site_catalog_selections') return tableChain({ data: { id: 'sel-1', site_id: 'my-site-id', catalog_product_id: 'cp-1' }, error: null });
    return tableChain({ data: null, error: null });
  });
}

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'owner-id', email: 'owner@test.com' } }, error: null });
});

describe("POST /api/catalog/selections — N1/N2 : le produit ajouté doit appartenir à un fournisseur éligible pour le sous-mode du site", () => {
  it("site reseller + produit Printful -> 409, jamais ajouté à la sélection", async () => {
    setup({ dropship_type: 'reseller' }, { supplier_id: 'printful' });
    const res = await POST(req({ slug: 'my-shop', catalogProductId: 'cp-1' }));
    expect(res.status).toBe(409);
  });

  // LOT 2 -- CES DEUX CAS CHANGENT DE CODE, ET C'EST VOULU. Ils prouvaient
  // le cloisonnement FOURNISSEUR sur des sous-types qui, depuis le LOT 2,
  // n'atteignent plus ce controle : `pod_brand` n'utilise pas le mecanisme de
  // selection, et un sous-type absent non plus. Le refus est desormais posé
  // PLUS TOT (400) et il est plus fort. La preuve du cloisonnement
  // fournisseur, elle, est conservee ci-dessous sur un sous-type qui atteint
  // reellement ce controle -- sans quoi la correction du LOT 2 aurait efface
  // une garantie en la deplacant.
  it("site pod_custom + produit CJ -> 409 : le cloisonnement fournisseur reste prouve", async () => {
    setup({ dropship_type: 'pod_custom' }, { supplier_id: 'cj' });
    const res = await POST(req({ slug: 'my-shop', catalogProductId: 'cp-1' }));
    expect(res.status).toBe(409);
  });

  it("site pod_brand -> 400 AVANT tout controle fournisseur : il n'utilise pas le mecanisme de selection", async () => {
    setup({ dropship_type: 'pod_brand' }, { supplier_id: 'printful' });
    const res = await POST(req({ slug: 'my-shop', catalogProductId: 'cp-1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Site non-dropshipping');
  });

  it("site sans sous-type -> 400 : ni mecanisme, ni fournisseur devine", async () => {
    setup({ dropship_type: null }, { supplier_id: 'printful' });
    const res = await POST(req({ slug: 'my-shop', catalogProductId: 'cp-1' }));
    expect(res.status).toBe(400);
  });

  it("site reseller + produit CJ (cas légitime) -> 200, ajouté", async () => {
    setup({ dropship_type: 'reseller' }, { supplier_id: 'cj' });
    const res = await POST(req({ slug: 'my-shop', catalogProductId: 'cp-1' }));
    expect(res.status).toBe(200);
  });

  it("site pod_custom + produit Gelato (cas légitime) -> 200", async () => {
    setup({ dropship_type: 'pod_custom' }, { supplier_id: 'gelato' });
    const res = await POST(req({ slug: 'my-shop', catalogProductId: 'cp-1' }));
    expect(res.status).toBe(200);
  });
});

// ============================================================
// CHANTIER 6 (MODE 1) — L'ADMISSION AU CATALOGUE, SUR LES QUATRE VERBES.
//
// CE QUI TENAIT LIEU DE RÈGLE, ET QUI N'EN ÉTAIT PAS UNE :
//   * GET / PATCH / DELETE : rien. Un site Mode 1 obtenait `{selections: []}`
//     — « sûr » uniquement parce que la table était vide pour lui.
//   * POST : `suppliersForDropshipType`, qui répond « QUELS fournisseurs »,
//     jamais « ce site en a-t-il un ». Mesuré : un Mode 1 a `dropship_type`
//     null, et ce repli rend `RESELLER_SUPPLIERS` — donc CJ. Un produit CJ
//     passait le contrôle et entrait dans les sélections d'une VITRINE. La
//     ligne ainsi créée rendait ensuite les trois autres verbes opérants :
//     la protection « par absence de donnée » se détruisait elle-même au
//     premier appel.
//
// La question du MODE précède désormais celle du SOUS-MODE.
// ============================================================

const MODES_REFUSES: unknown[] = [1, 2, null, undefined, 0, 4, '3', 'trois', NaN, {}, [3], true];

// GET et DELETE lisent `req.nextUrl` : un `Request` nu n'en a pas. On
// construit donc un `NextRequest`, comme le fait le test de `catalog/search`.
function requete(verbe: 'GET' | 'DELETE') {
  const url = verbe === 'GET'
    ? 'https://x.test/api/catalog/selections?slug=yia'
    : 'https://x.test/api/catalog/selections?slug=yia&id=sel-1';
  return new NextRequest(url, { method: verbe, headers: { authorization: 'Bearer t' } });
}
function requeteCorps(verbe: 'POST' | 'PATCH', body: unknown) {
  return new NextRequest('https://x.test/api/catalog/selections', {
    method: verbe,
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

describe('CHANTIER 6 — sans admission, les QUATRE verbes refusent', () => {
  it('🔴 Mode 1 : GET, PATCH, DELETE et POST renvoient tous 400', async () => {
    setup({ dropship_type: null, mode: 1 }, { supplier_id: 'cj' });
    const mod = await import('../route');
    const reponses = [
      await mod.GET(requete('GET')),
      await mod.PATCH(requeteCorps('PATCH', { slug: 'yia', id: 'sel-1', sell_price: 10 })),
      await mod.DELETE(requete('DELETE')),
      await mod.POST(requeteCorps('POST', { slug: 'yia', catalogProductId: 'cp-1' })),
    ];
    for (const [i, r] of reponses.entries()) {
      expect(r.status, `verbe #${i}`).toBe(400);
      expect((await r.json()).error, `verbe #${i}`).toBe('Site non-dropshipping');
    }
  });

  it('🔴 LE CAS DÉCISIF : Mode 1 + produit CJ éligible au repli → refusé', async () => {
    // Avant ce chantier : `suppliersForDropshipType(null)` rend CJ, le produit
    // est CJ, le contrôle de sous-mode passe, la ligne est écrite. C'est la
    // création d'une sélection sur une vitrine.
    setup({ dropship_type: null, mode: 1 }, { supplier_id: 'cj' });
    const { POST } = await import('../route');
    const res = await POST(requeteCorps('POST', { slug: 'yia', catalogProductId: 'cp-1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Site non-dropshipping');
  });

  it('🔴 Mode 2 refusé aussi — vendre n’est pas avoir un catalogue fournisseur', async () => {
    setup({ dropship_type: 'reseller', mode: 2 }, { supplier_id: 'cj' });
    const { POST, GET } = await import('../route');
    expect((await POST(requeteCorps('POST', { slug: 'yia', catalogProductId: 'cp-1' }))).status).toBe(400);
    expect((await GET(requete('GET'))).status).toBe(400);
  });

  it('🔴 fail-closed : toute valeur de mode inattendue refuse', async () => {
    for (const mode of MODES_REFUSES) {
      setup({ dropship_type: 'reseller', mode }, { supplier_id: 'cj' });
      const { POST } = await import('../route');
      const res = await POST(requeteCorps('POST', { slug: 'yia', catalogProductId: 'cp-1' }));
      expect(res.status, JSON.stringify(mode)).toBe(400);
    }
  });

  it('🔴 la présence de données ne rachète jamais l’absence d’admission', async () => {
    // Un produit catalogue parfaitement conforme, un site qui n'y a pas droit.
    setup({ dropship_type: 'reseller', mode: 1 }, { supplier_id: 'cj' });
    const { POST } = await import('../route');
    expect((await POST(requeteCorps('POST', { slug: 'yia', catalogProductId: 'cp-1' }))).status).toBe(400);
  });
});

describe('CHANTIER 6 — avec admission, les quatre verbes fonctionnent', () => {
  it('Mode 3 : GET, PATCH, DELETE et POST poursuivent leur logique normale', async () => {
    setup({ dropship_type: 'reseller', mode: 3 }, { supplier_id: 'cj' });
    const mod = await import('../route');
    expect((await mod.GET(requete('GET'))).status).toBe(200);
    expect((await mod.PATCH(requeteCorps('PATCH', { slug: 'yia', id: 'sel-1', sell_price: 10 }))).status).toBe(200);
    expect((await mod.DELETE(requete('DELETE'))).status).toBe(200);
    expect((await mod.POST(requeteCorps('POST', { slug: 'yia', catalogProductId: 'cp-1' }))).status).toBe(200);
  });

  it('🔴 l’admission ne remplace PAS le contrôle de sous-mode — les deux tiennent', async () => {
    // Mode 3 admis, mais produit d'un fournisseur du mauvais sous-mode : le
    // 409 d'origine subsiste. Deux règles distinctes, deux refus distincts.
    setup({ dropship_type: 'reseller', mode: 3 }, { supplier_id: 'printful' });
    const { POST } = await import('../route');
    const res = await POST(requeteCorps('POST', { slug: 'yia', catalogProductId: 'cp-1' }));
    expect(res.status).toBe(409);
  });

  it('🔴 le refus de propriété précède l’admission', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'un-autre', email: 'x@t.com' } }, error: null });
    setup({ dropship_type: 'reseller', mode: 1 }, { supplier_id: 'cj' });
    const { POST } = await import('../route');
    const res = await POST(requeteCorps('POST', { slug: 'yia', catalogProductId: 'cp-1' }));
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(200);
  });
});

describe('CHANTIER 6 — INVARIANTS', () => {
  it('les cinq routes catalogue interrogent toutes la MÊME primitive', async () => {
    // LOT 2 — LA PRIMITIVE COMMUNE DESCEND D'UN CRAN. Ce que ce cliquet
    // protège — « une seule règle pour cinq routes, jamais cinq
    // interprétations » — est inchangé ; c'est la règle qui est plus fine.
    // `usesCatalogSelections` appelle `hasSupplierCatalog` : l'admission de
    // mode reste la même autorité, complétée par le mécanisme de sélection.
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const base = join(__dirname, '../../');
    for (const r of ['curate', 'search', 'image-search', 'enhance', 'selections']) {
      const src = readFileSync(join(base, r, 'route.ts'), 'utf-8');
      expect(src, r).toContain('usesCatalogSelections');
    }
  });

  it('🔴 aucune route ne réintroduit une comparaison de mode en dur', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    for (const r of ['enhance', 'selections']) {
      const src = readFileSync(join(__dirname, '../../', r, 'route.ts'), 'utf-8')
        .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      expect(src, r).not.toMatch(/mode\s*[!=]==?\s*[0-9]/);
    }
  });

  it('la primitive garde son allowlist : le mode 3, et lui seul', async () => {
    const { hasSupplierCatalog } = await import('@/lib/dropship/catalogAdmission');
    expect(hasSupplierCatalog(3)).toBe(true);
    for (const m of [1, 2, 0, 4, '3', null, undefined]) {
      expect(hasSupplierCatalog(m), String(m)).toBe(false);
    }
  });
});
