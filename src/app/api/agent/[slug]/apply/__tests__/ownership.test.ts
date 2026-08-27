import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================
// DETTE 6a — `owner_id` EST L'IDENTITÉ, `owner_email` NE L'EST PLUS.
//
// LE DÉFAUT CORRIGÉ, ET CE N'ÉTAIT PAS UNE SIMPLE INCOHÉRENCE.
// `/chat` et `/apply` filtraient sur `.eq('owner_email', user.email)`. Or
// `sites.owner_email` est écrite UNE SEULE FOIS, à la création, et n'est
// JAMAIS mise à jour — recherche exhaustive : aucun `update` sur cette colonne
// dans tout le dépôt.
//
// Si B change d'adresse, `sites.owner_email` garde l'ancienne. Qu'un tiers
// s'inscrive ensuite avec cette adresse libérée, et son `user.email` apparie
// la ligne de B : il LISAIT et MODIFIAIT le site de B.
//
// Le test décisif de ce fichier est le CAS 3 : `owner_id ≠ user` ET
// `owner_email = user`. Il doit être IMPOSSIBLE de le rendre accepté sans
// faire échouer ces tests.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const siteLookupMock = vi.fn();
const updateSpy = vi.fn();
const eqSpy = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const c: any = {};
      c.select = () => c;
      c.eq = (col: string, val: unknown) => { eqSpy(table, col, val); return c; };
      c.ilike = () => c; c.insert = () => c;
      c.update = (patch: unknown) => { updateSpy(table, patch); return c; };
      c.single = () => siteLookupMock();
      c.maybeSingle = () => siteLookupMock();
      return c;
    },
  },
}));

const USER = { id: 'user-A', email: 'a@test.com' };

function req(tool_input: unknown = { field: 'name', value: 'Nouveau' }, tool_name = 'propose_field_update') {
  return new Request('https://x.test/api/agent/mon-site/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer token-A' },
    body: JSON.stringify({ tool_name, tool_input }),
  });
}
const ctx = { params: Promise.resolve({ slug: 'mon-site' }) };

function site(over: Record<string, unknown> = {}) {
  // CHANTIER 1 — le site porte une section, comme tout Mode 1 réel : c'est
  // `sections` que les outils d'offre écrivent désormais, et l'ajout exige une
  // destination déterminée — aucun repli arbitraire n'est prévu.
  return {
    id: 'site-1', slug: 'mon-site', name: 'S',
    // FERMETURE MODE 1, VOLET 1 — `mode` AJOUTE AU FIXTURE. Il en etait
    // absent, ce qu'aucun site reel n'est : `sites.mode` est ecrit a la
    // creation et n'est jamais nul en base. Depuis que `/apply` applique la
    // frontiere de mode, un site sans mode ne recoit plus que les outils
    // UNIVERSELS — fail-closed correct, mais qui rendait ce test faux pour la
    // mauvaise raison. Mode 1 : les cinq outils exerces ci-dessous relevent
    // des familles `universal` et `content`, toutes deux ouvertes au Mode 1.
    mode: 1,
    owner_id: 'user-A', owner_email: 'a@test.com',
    sections: [{ name: 'Nos offres', items: [] }],
    ...over,
  };
}

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: { ...USER } }, error: null });
  siteLookupMock.mockReset().mockResolvedValue({ data: site(), error: null });
  updateSpy.mockReset();
  eqSpy.mockReset();
});

// ------------------------------------------------------------
describe('DETTE 6a — la règle d\'identité, cas par cas', () => {
  it('CAS 1 — `owner_id` === user -> ACCEPTÉ', async () => {
    const { POST } = await import('../route');
    expect((await POST(req(), ctx)).status).toBe(200);
  });

  it('CAS 2 — `owner_id` === user MAIS `owner_email` différent -> ACCEPTÉ', async () => {
    // Le propriétaire a changé d'adresse. L'ancienne garde le REFUSAIT sur
    // son propre site ; l'identité stable le reconnaît.
    siteLookupMock.mockResolvedValue({ data: site({ owner_email: 'ancienne@test.com' }), error: null });
    const { POST } = await import('../route');
    expect((await POST(req(), ctx)).status).toBe(200);
  });

  it('🔴 CAS 3 — `owner_id` ≠ user ET `owner_email` === user -> REFUSÉ (403)', async () => {
    // LE test de cette dette. B a changé d'adresse, A s'est inscrit avec
    // l'ancienne : sous l'ancienne garde, A modifiait le site de B.
    siteLookupMock.mockResolvedValue({ data: site({ owner_id: 'user-B', owner_email: 'a@test.com' }), error: null });
    const { POST } = await import('../route');
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('CAS 4 — `owner_id` null + `owner_email` === user -> ACCEPTÉ (repli canonique)', async () => {
    siteLookupMock.mockResolvedValue({ data: site({ owner_id: null }), error: null });
    const { POST } = await import('../route');
    expect((await POST(req(), ctx)).status).toBe(200);
  });

  it('CAS 5 — `owner_id` null + `owner_email` différent -> REFUSÉ (403)', async () => {
    siteLookupMock.mockResolvedValue({ data: site({ owner_id: null, owner_email: 'autre@test.com' }), error: null });
    const { POST } = await import('../route');
    expect((await POST(req(), ctx)).status).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('CAS 6 — non authentifié -> 401', async () => {
    const { POST } = await import('../route');
    const anon = new Request('https://x.test/api/agent/mon-site/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_name: 'propose_field_update', tool_input: { field: 'name', value: 'x' } }),
    });
    expect((await POST(anon, ctx)).status).toBe(401);
  });

  it('CAS 6bis — jeton invalide -> 401', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });
    const { POST } = await import('../route');
    expect((await POST(req(), ctx)).status).toBe(401);
  });

  it('CAS 7 — site inexistant -> 404', async () => {
    siteLookupMock.mockResolvedValue({ data: null, error: null });
    const { POST } = await import('../route');
    expect((await POST(req(), ctx)).status).toBe(404);
  });

  it('CAS 8 — authentifié mais non propriétaire -> 403 (distinct du 404)', async () => {
    siteLookupMock.mockResolvedValue({ data: site({ owner_id: 'user-B', owner_email: 'b@test.com' }), error: null });
    const { POST } = await import('../route');
    expect((await POST(req(), ctx)).status).toBe(403);
  });
});

// ------------------------------------------------------------
describe('DETTE 6a — CAS 11 : l\'ÉCRITURE est protégée par la même règle', () => {
  it('un utilisateur dont l\'email correspond mais pas l\'`owner_id` n\'écrit RIEN', async () => {
    siteLookupMock.mockResolvedValue({ data: site({ owner_id: 'user-B', owner_email: 'a@test.com' }), error: null });
    const { POST } = await import('../route');
    await POST(req(), ctx);
    // Ni patch construit, ni UPDATE émis.
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('l\'écriture cible l\'`id` de la ligne vérifiée, PLUS `owner_email`', async () => {
    const { POST } = await import('../route');
    await POST(req(), ctx);
    const filtres = eqSpy.mock.calls.filter((c) => c[0] === 'sites');
    expect(filtres.some(([, col, val]) => col === 'id' && val === 'site-1')).toBe(true);
    // `owner_email` n'est plus une clé de filtre à l'écriture.
    expect(filtres.some(([, col]) => col === 'owner_email')).toBe(false);
  });
});

// ------------------------------------------------------------
describe('DETTE 6a — CAS 9 et 12 : cohérence et non-régression', () => {
  const CHAT = readFileSync(join(__dirname, '../../chat/route.ts'), 'utf-8');
  const APPLY = readFileSync(join(__dirname, '../route.ts'), 'utf-8');
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('CAS 9 — les TROIS emplacements appliquent la même règle', () => {
    // chat lecture · apply lecture · apply écriture.
    expect(code(CHAT)).toMatch(/requireSiteOwner\(req, slug, '\*'\)/);
    expect(code(APPLY)).toMatch(/requireSiteOwner\(req, slug, '\*'\)/);
    expect(code(APPLY)).toMatch(/\.eq\('id', site\.id\)/);
  });

  it('CAS 10 (borné) — plus aucun `.eq(\'owner_email\')` dans les routes AGENT', () => {
    // Portée volontairement limitée aux deux routes de cette dette.
    // Voir le rapport : trois AUTRES fichiers de `src/app/api/` portent encore
    // le même motif (checkout, sites/[slug], marketing/generate). Les inclure
    // ici ferait passer un cliquet pour une garantie globale qu'il n'apporte
    // pas — et étendre la correction sortirait du périmètre arbitré.
    expect(code(CHAT)).not.toMatch(/\.eq\('owner_email'/);
    expect(code(APPLY)).not.toMatch(/\.eq\('owner_email'/);
  });

  it('aucun nouveau mécanisme d\'autorisation n\'a été introduit', () => {
    // La primitive canonique est réutilisée, pas dupliquée.
    for (const [nom, src] of [['chat', CHAT], ['apply', APPLY]] as const) {
      expect(code(src), nom).toContain("from '@/lib/auth/require-site-owner'");
      expect(code(src), nom).not.toMatch(/auth\.getUser\(/);
      expect(code(src), nom).not.toMatch(/owner_id === |isOwner/);
    }
  });

  // CHANTIER 4 — 26 → 32. Ce cliquet vaut surtout par son ÉGALITÉ : il exige
  // que la déclaration (`chat`) et l'allowlist d'exécution (`apply`) portent
  // le même nombre. Un outil déclaré mais non exécutable — ou l'inverse — le
  // fait échouer, quel que soit le total.
  // CHANTIER 7 — 32 → 33. La valeur de ce cliquet reste son ÉGALITÉ : la
  // déclaration (`chat`) et l'allowlist d'exécution (`apply`) doivent porter
  // le même nombre. Un outil déclaré mais non exécutable — ou l'inverse — le
  // fait échouer, quel que soit le total.
  it('CAS 12 — les 33 outils restent déclarés et exécutables', () => {
    expect([...CHAT.matchAll(/^ {4}name: '/gm)]).toHaveLength(33);
    const allowlist = APPLY.match(/const ALLOWED_TOOLS = new Set\(\[[\s\S]*?\]\);/)![0];
    expect([...allowlist.matchAll(/^ {2}'/gm)]).toHaveLength(33);
  });

  it('`require-site-owner.ts` est INTACT — il reste canonique', () => {
    const PRIM = readFileSync(join(__dirname, '../../../../../../lib/auth/require-site-owner.ts'), 'utf-8');
    expect(PRIM).toMatch(/const isOwner = siteOwnerId != null\s*\n\s*\? siteOwnerId === user\.id/);
    expect(PRIM).toMatch(/status: 403/);
  });
});

// ------------------------------------------------------------
describe('DETTE 6a — les 26 outils fonctionnent toujours', () => {
  it('un outil représentatif de chaque famille aboutit pour un propriétaire légitime', async () => {
    const { POST } = await import('../route');
    const CAS: Array<[string, unknown]> = [
      ['propose_field_update', { field: 'name', value: 'X' }],
      ['propose_color_update', { color: '#112233' }],
      ['propose_theme_change', { theme: 'noir' }],
      // CHANTIER 1 — l'outil écrit désormais `sections[].items[]`. Une seule
      // section existe : la destination est donc non ambiguë sans la nommer.
      ['propose_add_service', { title: 'T', description: 'D' }],
      ['propose_gallery_clear', {}],
    ];
    for (const [nom, input] of CAS) {
      updateSpy.mockClear();
      const res = await POST(req(input, nom), ctx);
      expect(res.status, nom).toBe(200);
      expect(updateSpy.mock.calls.some((c) => c[0] === 'sites'), nom).toBe(true);
    }
  });
});
