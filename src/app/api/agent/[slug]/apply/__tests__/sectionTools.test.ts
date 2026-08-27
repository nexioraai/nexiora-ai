import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================
// CHANTIER 1 (MODE 1) — LES TROIS OUTILS D'OFFRE ÉCRIVENT `sections`.
//
// Mesuré sur yiaglobalcommodities.com (Mode 1, thème Vif) : les six offres
// visibles vivent dans `sections[0].items`, et `services` vaut `[]`. Les
// outils écrivaient pourtant `services` — colonne qu'aucun thème ne rend et
// que le générateur ne produit pas. L'écriture réussissait, le site ne
// changeait jamais, et rien ne le signalait.
//
// Ces tests exercent la ROUTE réelle, pas le résolveur seul.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

let siteRow: Record<string, unknown>;
let ecritures: Record<string, unknown>[] = [];

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

const USER = { id: 'user-1', email: 'm@test.com' };

/** La forme réelle des offres de YIA, réduite à ce que la route lit. */
const SECTION_YIA = {
  name: 'Our Products',
  items: [
    { title: 'Sesame Seeds Grade A', description: 'Creamy white sesame seeds' },
    { title: 'Gum Arabic Acacia Senegal', description: 'Premium acacia gum' },
  ],
};

function chain() {
  const b: any = {};
  b.select = () => b;
  b.eq = () => b;
  b.maybeSingle = async () => ({ data: siteRow, error: null });
  b.single = b.maybeSingle;
  b.update = (payload: Record<string, unknown>) => { ecritures.push(payload); return b; };
  b.then = (res: (v: unknown) => void) => res({ data: siteRow, error: null });
  return b;
}

function req(tool_name: string, tool_input: unknown) {
  return new Request('https://x.test/api/agent/mon-site/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify({ tool_name, tool_input }),
  });
}
const ctx = { params: Promise.resolve({ slug: 'mon-site' }) };

beforeEach(() => {
  ecritures = [];
  siteRow = {
    id: 'site-1', slug: 'mon-site', name: 'YIA',
    owner_id: USER.id, owner_email: USER.email, mode: 1,
    sections: [JSON.parse(JSON.stringify(SECTION_YIA))],
    services: [],
  };
  getUserMock.mockReset().mockResolvedValue({ data: { user: { ...USER } }, error: null });
  fromMock.mockReset().mockImplementation(() => chain());
});

const sectionsEcrites = () =>
  (ecritures.find((e) => 'sections' in e)?.sections as any[]) ?? null;

describe('CHANTIER 1 — ajout d’une offre', () => {
  it('ajoute dans l’unique section, sans avoir à la nommer', async () => {
    const { POST } = await import('../route');
    const res = await POST(req('propose_add_service', { title: 'Shea Butter', description: 'Grade A' }), ctx);

    expect(res.status).toBe(200);
    const s = sectionsEcrites()!;
    expect(s[0].items).toHaveLength(3);
    expect(s[0].items[2]).toEqual({ title: 'Shea Butter', description: 'Grade A' });
    expect(s[0].name, 'la section n’est pas renommée').toBe('Our Products');
  });

  it('🔴 plusieurs sections sans destination nommée -> 409, AUCUNE écriture', async () => {
    siteRow.sections = [{ name: 'Produits', items: [] }, { name: 'Services', items: [] }];
    const { POST } = await import('../route');
    const res = await POST(req('propose_add_service', { title: 'X', description: 'D' }), ctx);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('Produits');
    expect(ecritures).toEqual([]);
  });

  it('destination nommée -> ajoutée là, et nulle part ailleurs', async () => {
    siteRow.sections = [{ name: 'Produits', items: [] }, { name: 'Services', items: [] }];
    const { POST } = await import('../route');
    await POST(req('propose_add_service', { title: 'Audit', description: 'D', section: 'Services' }), ctx);

    const s = sectionsEcrites()!;
    expect(s[0].items).toHaveLength(0);
    expect(s[1].items).toHaveLength(1);
  });

  it('titre vide -> 400, aucune écriture', async () => {
    const { POST } = await import('../route');
    expect((await POST(req('propose_add_service', { title: '  ', description: 'D' }), ctx)).status).toBe(400);
    expect(ecritures).toEqual([]);
  });
});

describe('CHANTIER 1 — suppression par titre', () => {
  it('titre exact -> l’offre visée disparaît, l’autre reste', async () => {
    const { POST } = await import('../route');
    const res = await POST(req('propose_remove_service', { title: 'Sesame Seeds Grade A' }), ctx);

    expect(res.status).toBe(200);
    const s = sectionsEcrites()!;
    expect(s[0].items).toHaveLength(1);
    expect(s[0].items[0].title).toBe('Gum Arabic Acacia Senegal');
  });

  it('titre absent -> 404, AUCUNE écriture', async () => {
    const { POST } = await import('../route');
    expect((await POST(req('propose_remove_service', { title: 'Cacao' }), ctx)).status).toBe(404);
    expect(ecritures).toEqual([]);
  });

  it('🔴 titre présent dans deux sections -> 409, AUCUNE écriture', async () => {
    siteRow.sections = [
      { name: 'Produits', items: [{ title: 'Commun' }] },
      { name: 'Services', items: [{ title: 'Commun' }] },
    ];
    const { POST } = await import('../route');
    const res = await POST(req('propose_remove_service', { title: 'Commun' }), ctx);

    expect(res.status).toBe(409);
    expect(ecritures, 'supprimer « la première » était le défaut d’origine').toEqual([]);
  });

  it('AUCUN adressage par index n’est accepté', async () => {
    const { POST } = await import('../route');
    expect((await POST(req('propose_remove_service', { index: 0 }), ctx)).status).toBe(404);
    expect(ecritures).toEqual([]);
  });
});

describe('CHANTIER 1 — modification par titre', () => {
  it('modifie le champ visé de la bonne offre, et rien d’autre', async () => {
    const { POST } = await import('../route');
    const res = await POST(
      req('propose_service_update', { title: 'Gum Arabic Acacia Senegal', field: 'description', value: 'Nouvelle' }),
      ctx
    );

    expect(res.status).toBe(200);
    const s = sectionsEcrites()!;
    expect(s[0].items[1].description).toBe('Nouvelle');
    expect(s[0].items[1].title, 'le titre n’a pas bougé').toBe('Gum Arabic Acacia Senegal');
    expect(s[0].items[0]).toEqual(SECTION_YIA.items[0]);
  });

  it('renommer une offre est permis, et ne touche qu’elle', async () => {
    const { POST } = await import('../route');
    await POST(req('propose_service_update', { title: 'Sesame Seeds Grade A', field: 'title', value: 'Sesame Premium' }), ctx);
    const s = sectionsEcrites()!;
    expect(s[0].items[0].title).toBe('Sesame Premium');
    expect(s[0].items[1].title).toBe('Gum Arabic Acacia Senegal');
  });

  it('champ hors allowlist -> 400, aucune écriture', async () => {
    const { POST } = await import('../route');
    expect(
      (await POST(req('propose_service_update', { title: 'Sesame Seeds Grade A', field: 'price', value: '9' }), ctx)).status
    ).toBe(400);
    expect(ecritures).toEqual([]);
  });

  it('titre ambigu -> 409, aucune écriture', async () => {
    siteRow.sections = [
      { name: 'A', items: [{ title: 'Commun' }] },
      { name: 'B', items: [{ title: 'Commun' }] },
    ];
    const { POST } = await import('../route');
    expect((await POST(req('propose_service_update', { title: 'Commun', field: 'title', value: 'X' }), ctx)).status).toBe(409);
    expect(ecritures).toEqual([]);
  });
});

describe('CHANTIER 1 — `services` n’est plus jamais écrit', () => {
  it('aucun des trois outils ne touche la colonne legacy', async () => {
    const { POST } = await import('../route');
    const CAS: Array<[string, unknown]> = [
      ['propose_add_service', { title: 'N', description: 'D' }],
      ['propose_remove_service', { title: 'Sesame Seeds Grade A' }],
      ['propose_service_update', { title: 'Sesame Seeds Grade A', field: 'title', value: 'X' }],
    ];
    for (const [nom, input] of CAS) {
      ecritures = [];
      siteRow.sections = [JSON.parse(JSON.stringify(SECTION_YIA))];
      await POST(req(nom, input), ctx);
      for (const e of ecritures) expect(Object.keys(e), nom).not.toContain('services');
    }
  });

  it('constat structurel — la route ne lit plus `site.services`', () => {
    const src = readFileSync(join(__dirname, '../route.ts'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/site\.services/);
    expect(src).not.toMatch(/updates\.services/);
    expect(src).toContain('resolveSectionItem');
  });

  it('INVARIANT MODE 1 — aucune capacité commerciale n’est apparue', async () => {
    // Constat COMPORTEMENTAL, pas textuel : chercher « checkout » dans la
    // source échouerait sur la liste des interdits du prompt, qui le nomme
    // précisément pour l'interdire. Ce qui compte est la liste d'outils.
    const { toolNamesForSite } = await import('@/lib/agent-tools/toolCapabilities');
    const mode1 = toolNamesForSite(1, null);
    for (const commercial of [
      'count_product_stock', 'set_price', 'set_currency', 'set_for_sale',
      'create_promo_code', 'deactivate_promo_code',
      'catalog_curate', 'catalog_enhance', 'catalog_approve_all', 'catalog_set_margin',
    ]) {
      expect(mode1, commercial).not.toContain(commercial);
    }
    // Et les trois outils d'offre restent bien proposés à une vitrine.
    for (const editorial of ['propose_add_service', 'propose_remove_service', 'propose_service_update']) {
      expect(mode1, editorial).toContain(editorial);
    }
  });
});
