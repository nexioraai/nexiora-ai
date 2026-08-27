import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// M2-06 — LE FORFAIT DE PORT EST BORNE, ET LA BORNE EST ENFIN TESTEE.
//
// LE DEFAUT MESURE. `PATCH /api/shop/shipping` refuse `< 0` depuis toujours,
// mais une mutation adversariale de l'audit — suppression pure de cette
// ligne — n'a cassé AUCUN test sur 2871. La route n'avait aucun repertoire de
// tests : seul son `canTransact` etait couvert, indirectement, par
// `mode1Admission.test.ts`. Une borne qu'aucun test ne tient peut disparaitre
// au premier refactor sans que rien ne le signale.
//
// POURQUOI CELA COMPTE POUR LE MODE 2, ET SEULEMENT LUI. `shipping_flat` n'est
// consomme que sous `billsFlatShipping`, et `FLAT_SHIPPING_MODES` vaut {2} :
// c'est le parametre commercial propre a la boutique locale. Verifie a
// l'execution : la coercition `Number(-100)` suivie du repli `ou 0` rend
// `-100` — un negatif TRAVERSE jusqu'a `shippingAmount` du checkout.
//
// CE QUI RESTE OUVERT, ET C'EST DIT : `shipping_flat` figure dans le
// `GRANT UPDATE` accorde a `authenticated`. Un proprietaire peut donc ecrire
// la colonne en PostgREST direct, hors de cette route et hors de cette borne.
// Le fermer exigerait une contrainte `CHECK` en base — du DDL, indisponible
// depuis cet environnement. Mesure du 2026-08-25 : 14 sites, tous a 0, aucune
// valeur negative. Impact reel : la commission Mode 2 vaut 0 et la RLS
// interdit a un tiers d'ecrire — le marchand ne leserait que lui-meme.
// ============================================================

let siteCourant: Record<string, unknown> = { id: 'site-1', mode: 2 };
let proprietaire = true;

vi.mock('@/lib/auth/require-site-owner', () => ({
  requireSiteOwner: async () =>
    proprietaire
      ? { ok: true, site: siteCourant, email: 'o@test.com' }
      : { ok: false, response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) },
}));

const updateSpy = vi.fn();
const selectResult = { data: { shipping_flat: 12.5 }, error: null };
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => {
      const c: Record<string, unknown> = {};
      const self = () => c;
      c.select = self; c.eq = self;
      c.single = async () => selectResult;
      c.update = (patch: unknown) => { updateSpy(patch); return c; };
      return c;
    },
  },
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const patch = async (body: unknown) => {
  const { PATCH } = await import('../route');
  const res = await PATCH(new Request('https://x.test/api/shop/shipping', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { statut: res.status, corps: await res.json() };
};

beforeEach(() => { updateSpy.mockReset(); siteCourant = { id: 'site-1', mode: 2 }; proprietaire = true; });

// ------------------------------------------------------------
describe('M2-06 — 🔴 la borne refuse, et n’ecrit RIEN', () => {
  const REFUSES: Array<[string, unknown]> = [
    ['negatif', -1],
    ['tres negatif', -100],
    ['negatif en chaine', '-50'],
    ['non numerique', 'abc'],
    ['NaN explicite', NaN],
    ['null', null],
    ['undefined', undefined],
    ['objet', {}],
    ['tableau', []],
  ];

  for (const [nom, valeur] of REFUSES) {
    it(`${nom} -> 400, aucune ecriture`, async () => {
      const { statut, corps } = await patch({ slug: 'ma-boutique', shippingFlat: valeur });
      expect(statut, nom).toBe(400);
      expect(corps.error, nom).toBe('Tarif invalide');
      expect(updateSpy, nom).not.toHaveBeenCalled();
    });
  }

  it('🔴 la coercition ne sauve plus rien — decouvert EN ECRIVANT ces tests', () => {
    // `Number(null)`, `Number([])` et `Number({})`... valent 0 ou NaN. La
    // borne d'origine, `isNaN(Number(x)) || x < 0`, absolvait donc `null`,
    // `[]` et `NaN` (que JSON serialise en `null`) : 200, et **0** ecrit,
    // c'est-a-dire livraison gratuite, en silence. Atteignable depuis
    // `PaymentConnect`, qui envoie `Number(champ_texte)`.
    expect(Number(null)).toBe(0);
    expect(Number([])).toBe(0);
    expect(JSON.parse(JSON.stringify({ v: NaN })).v).toBeNull();
  });
});

// ------------------------------------------------------------
describe('M2-06 — 🔴 CONTROLE POSITIF : les valeurs legitimes passent', () => {
  const ACCEPTES: Array<[string, unknown, number]> = [
    ['zero (livraison gratuite)', 0, 0],
    ['entier', 12, 12],
    ['decimal', 9.99, 9.99],
    ['chaine numerique', '15.5', 15.5],
    ['grand mais valide', 500, 500],
  ];

  for (const [nom, entree, attendu] of ACCEPTES) {
    it(`${nom} -> 200, ecrit la valeur coercee`, async () => {
      const { statut, corps } = await patch({ slug: 'ma-boutique', shippingFlat: entree });
      expect(statut, nom).toBe(200);
      expect(corps.shippingFlat, nom).toBe(attendu);
      expect(updateSpy, nom).toHaveBeenCalledWith({ shipping_flat: attendu });
    });
  }
});

// ------------------------------------------------------------
describe('M2-06 — 🔴 FRONTIERE : le forfait reste un parametre de vente', () => {
  it('Mode 1 : 403, et aucune ecriture — meme avec une valeur valide', async () => {
    siteCourant = { id: 'site-1', mode: 1 };
    const { statut } = await patch({ slug: 'ma-vitrine', shippingFlat: 10 });
    expect(statut).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('Mode 3 : accepte — le forfait sert de plancher au devis fournisseur', async () => {
    siteCourant = { id: 'site-1', mode: 3 };
    const { statut } = await patch({ slug: 'ma-boutique', shippingFlat: 10 });
    expect(statut).toBe(200);
  });

  for (const mode of [undefined, null, 0, 4, '2', NaN]) {
    it(`mode=${String(mode)} : refuse, fail-closed par canTransact`, async () => {
      siteCourant = { id: 'site-1', mode };
      const { statut } = await patch({ slug: 's', shippingFlat: 10 });
      expect(statut).toBe(403);
      expect(updateSpy).not.toHaveBeenCalled();
    });
  }

  it('non-proprietaire : refuse avant toute considération de valeur', async () => {
    proprietaire = false;
    const { statut } = await patch({ slug: 's', shippingFlat: 10 });
    expect(statut).toBe(401);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('slug absent -> 400 avant tout', async () => {
    const { statut } = await patch({ shippingFlat: 10 });
    expect(statut).toBe(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------
describe('M2-06 — GET rend le forfait, coerce', () => {
  it('renvoie la valeur en nombre', async () => {
    const { GET } = await import('../route');
    const res = await GET(new Request('https://x.test/api/shop/shipping?slug=ma-boutique'));
    expect(await res.json()).toEqual({ shippingFlat: 12.5 });
  });

  it('slug absent -> 400', async () => {
    const { GET } = await import('../route');
    const res = await GET(new Request('https://x.test/api/shop/shipping'));
    expect(res.status).toBe(400);
  });
});
