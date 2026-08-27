import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/i18n/supportedLanguages';

// ============================================================
// CHANTIER 3 (MODE 1) — L'AGENT PEUT CHANGER `lang`, ET RIEN D'AUTRE.
//
// Le cas réel : YIA Global Commodities, contenu entièrement anglais, `lang`
// à `fr`. Le marchand qui le signale à l'agent doit pouvoir être corrigé —
// mais `propose_field_update` acceptait jusqu'ici du texte libre pour tous
// ses champs. `lang` est le premier champ borné de cette liste, et ces tests
// exercent la ROUTE réelle, pas le validateur seul.
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
  return new Request('https://x.test/api/agent/yia/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify({ tool_name, tool_input }),
  });
}
const ctx = { params: Promise.resolve({ slug: 'yia' }) };

beforeEach(() => {
  ecritures = [];
  siteRow = {
    id: 'site-1', slug: 'yia', name: 'YIA Global Commodities',
    owner_id: USER.id, owner_email: USER.email, mode: 1,
    lang: 'fr', sections: [], products: [],
  };
  getUserMock.mockReset().mockResolvedValue({ data: { user: { ...USER } }, error: null });
  fromMock.mockReset().mockImplementation(() => chain());
});

async function appeler(input: unknown) {
  const { POST } = await import('../route');
  const res = await POST(req('propose_field_update', input), ctx as any);
  return { statut: res.status, corps: await res.json().catch(() => null) };
}

describe('CHANTIER 3 — chaque langue supportée est acceptée et persistée', () => {
  for (const code of SUPPORTED_LANGUAGE_CODES) {
    it(`« ${code} » : accepté, et écrit tel quel dans la colonne lang`, async () => {
      const { statut } = await appeler({ field: 'lang', value: code, reason: 'r' });
      expect(statut).toBe(200);
      expect(ecritures).toHaveLength(1);
      expect(ecritures[0]).toEqual({ lang: code });
    });
  }
});

describe('CHANTIER 3 — 🔴 toute langue non supportée est refusée AVANT écriture', () => {
  for (const value of ['de', 'pt', 'it', 'zh', 'zz', 'english', 'FR', 'fr-FR', '']) {
    it(`« ${value} » : 400, et AUCUNE écriture`, async () => {
      const { statut } = await appeler({ field: 'lang', value, reason: 'r' });
      expect(statut).toBe(400);
      expect(ecritures, 'une écriture a eu lieu malgré le refus').toHaveLength(0);
    });
  }

  it('le refus nomme les langues réellement disponibles', async () => {
    const { corps } = await appeler({ field: 'lang', value: 'de', reason: 'r' });
    for (const code of SUPPORTED_LANGUAGE_CODES) expect(String(corps.error)).toContain(code);
  });

  it('🔴 une valeur non-chaîne est refusée', async () => {
    for (const value of [null, 42, ['fr'], { code: 'fr' }, true]) {
      ecritures = [];
      const { statut } = await appeler({ field: 'lang', value, reason: 'r' });
      expect(statut, String(value)).toBe(400);
      expect(ecritures).toHaveLength(0);
    }
  });
});

describe('CHANTIER 3 — la borne ne déborde pas sur les autres champs', () => {
  it('les six champs de texte libre restent libres', async () => {
    for (const field of ['name', 'slogan', 'about', 'hero_title', 'hero_subtitle', 'cta']) {
      ecritures = [];
      const { statut } = await appeler({ field, value: 'de', reason: 'r' });
      expect(statut, field).toBe(200);
      expect(ecritures[0], field).toEqual({ [field]: 'de' });
    }
  });

  it('🔴 un champ hors liste reste refusé — la liste n’a pas été élargie par mégarde', async () => {
    for (const field of ['mode', 'dropship_type', 'owner_email', 'owner_id', 'slug', 'for_sale', 'shipping_flat']) {
      ecritures = [];
      const { statut } = await appeler({ field, value: 'fr', reason: 'r' });
      expect(statut, field).toBe(400);
      expect(ecritures).toHaveLength(0);
    }
  });
});

describe('CHANTIER 3 — INVARIANTS : rien d’autre que lang ne bouge', () => {
  it('changer la langue n’écrit ni mode, ni capacité commerciale, ni contenu', async () => {
    await appeler({ field: 'lang', value: 'en', reason: 'r' });
    const ecrit = ecritures[0];
    expect(Object.keys(ecrit)).toEqual(['lang']);
    for (const interdit of ['mode', 'dropship_type', 'products', 'sections', 'faq', 'whyus', 'area_served', 'price_range', 'services']) {
      expect(ecrit, interdit).not.toHaveProperty(interdit);
    }
  });

  it('un site Mode 1 reste Mode 1 après le changement', async () => {
    await appeler({ field: 'lang', value: 'ar', reason: 'r' });
    expect(siteRow.mode).toBe(1);
  });

  it('les Modes 2 et 3 empruntent exactement le même chemin', async () => {
    for (const mode of [2, 3]) {
      ecritures = [];
      siteRow = { ...siteRow, mode };
      const { statut } = await appeler({ field: 'lang', value: 'es', reason: 'r' });
      expect(statut, `mode ${mode}`).toBe(200);
      expect(ecritures[0]).toEqual({ lang: 'es' });
    }
  });

  it('🔴 un non-propriétaire ne peut pas changer la langue', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'autre', email: 'x@test.com' } }, error: null });
    siteRow = { ...siteRow, owner_id: 'user-1', owner_email: 'm@test.com' };
    const { statut } = await appeler({ field: 'lang', value: 'en', reason: 'r' });
    expect(statut).not.toBe(200);
    expect(ecritures).toHaveLength(0);
  });
});
