import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================
// DETTE 6d — CLIQUET SUR LA FORME DE L'IDENTIFIANT PRODUIT.
//
// `requireProductOwner` est le point de passage UNIQUE des quatre écritures
// produit (PATCH, DELETE, POST inventory, DELETE inventory). Avant cette
// dette, il transmettait le segment d'URL tel quel à `getProduct()`, donc à
// PostgreSQL, qui refusait toute valeur non-uuid. L'erreur remontait au
// try/catch de chaque route et donnait :
//
//     500  {"error":"getProduct: invalid input syntax for type uuid: \"xyz\""}
//
// DEUX DÉFAUTS : une erreur de CLIENT déclarée erreur de SERVEUR (elle entrait
// dans la supervision comme un incident, et un balayage d'URL suffisait à en
// fabriquer autant qu'on voulait), et le message brut de la base livré à
// l'appelant — moteur, type de colonne, nom de fonction interne.
//
// Ce fichier teste la primitive DIRECTEMENT, là où la décision vit, et non
// route par route : c'est ce qui garantit que les quatre écritures sont
// couvertes par construction plutôt que par répétition.
// ============================================================

const getProductMock = vi.fn();
vi.mock('@/lib/shop', () => ({
  getProduct: (...a: unknown[]) => getProductMock(...a),
}));

const requireSiteOwnerByIdMock = vi.fn();
vi.mock('../require-site-owner', () => ({
  requireSiteOwnerById: (...a: unknown[]) => requireSiteOwnerByIdMock(...a),
}));

import { requireProductOwner } from '../require-product-owner';

const VALIDE = '11111111-1111-4111-8111-111111111111';
const req = () => new Request('https://x.test/', { headers: { authorization: 'Bearer t' } });

beforeEach(() => {
  getProductMock.mockReset().mockResolvedValue({ id: VALIDE, site_id: 'site-1' });
  requireSiteOwnerByIdMock.mockReset().mockResolvedValue({ ok: true, site: { id: 'site-1', mode: 2 } });
});

const MALFORMES = [
  ['chaîne quelconque', 'not-a-uuid'],
  ['vide', ''],
  ['traversée de chemin', '../../etc/passwd'],
  ['injection SQL', "1' or '1'='1"],
  ['un chiffre de trop', '11111111-1111-4111-8111-1111111111111'],
  ['un chiffre de moins', '11111111-1111-4111-8111-11111111111'],
  ['caractère non hexadécimal', '1111111z-1111-4111-8111-111111111111'],
  ['sans tirets (Postgres l’accepterait)', '11111111111141118111111111111111'],
  ['entre accolades (Postgres l’accepterait)', '{11111111-1111-4111-8111-111111111111}'],
  ['espaces autour', ' 11111111-1111-4111-8111-111111111111 '],
] as const;

describe('DETTE 6d — un identifiant malformé ne désigne aucun produit', () => {
  for (const [libelle, valeur] of MALFORMES) {
    it(`${libelle} -> 404, message contrôlé, aucune requête`, async () => {
      const r = await requireProductOwner(req(), valeur);

      expect('error' in r, libelle).toBe(true);
      const res = (r as { error: Response }).error;
      expect(res.status, libelle).toBe(404);
      expect((await res.json()).error, libelle).toBe('Product not found');

      // Rien n'est parti : ni vers la base, ni vers la garde de propriété.
      expect(getProductMock, libelle).not.toHaveBeenCalled();
      expect(requireSiteOwnerByIdMock, libelle).not.toHaveBeenCalled();
    });
  }

  it('AUCUNE réponse ne laisse fuir un message Postgres', async () => {
    for (const [, valeur] of MALFORMES) {
      const r = await requireProductOwner(req(), valeur);
      const brut = JSON.stringify(await (r as { error: Response }).error.json());
      expect(brut).not.toMatch(/invalid input syntax|uuid|getProduct|postgres|column|type/i);
    }
  });

  it('un uuid bien formé mais INCONNU donne EXACTEMENT la même réponse', async () => {
    getProductMock.mockResolvedValue(null);
    const inconnu = (await requireProductOwner(req(), VALIDE)) as { error: Response };
    const malforme = (await requireProductOwner(req(), 'not-a-uuid')) as { error: Response };

    expect(inconnu.error.status).toBe(malforme.error.status);
    expect(await inconnu.error.json()).toEqual(await malforme.error.json());
  });
});

describe('DETTE 6d — les identifiants valides passent, exactement comme avant', () => {
  it('forme canonique minuscule -> la chaîne se déroule normalement', async () => {
    const r = await requireProductOwner(req(), VALIDE);
    expect('ok' in r && r.ok).toBe(true);
    expect(getProductMock).toHaveBeenCalledWith(VALIDE);
  });

  it('MAJUSCULES acceptées : PostgREST rend du minuscule, mais un client peut renvoyer autre chose', async () => {
    const r = await requireProductOwner(req(), VALIDE.toUpperCase());
    expect('ok' in r && r.ok).toBe(true);
  });

  it('la garde de propriété reste la SEULE autorité une fois la forme validée', async () => {
    requireSiteOwnerByIdMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Acces refuse.' }), { status: 403 }),
    });
    const r = await requireProductOwner(req(), VALIDE);
    expect((r as { error: Response }).error.status).toBe(403);
  });

  it('l’admission Mode 1 reste posée APRÈS, et rend toujours 403', async () => {
    requireSiteOwnerByIdMock.mockResolvedValue({ ok: true, site: { id: 'site-1', mode: 1 } });
    const r = await requireProductOwner(req(), VALIDE);
    expect((r as { error: Response }).error.status).toBe(403);
  });
});

describe('DETTE 6d — cliquet structurel', () => {
  const SRC = readFileSync(join(__dirname, '../require-product-owner.ts'), 'utf-8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('la vérification de forme précède `getProduct` — un ordre inverse ne protégerait plus rien', () => {
    const garde = CODE.indexOf('UUID_CANONIQUE');
    const lecture = CODE.indexOf('getProduct(');
    expect(garde).toBeGreaterThan(-1);
    expect(lecture).toBeGreaterThan(-1);
    expect(garde).toBeLessThan(lecture);
  });

  it('la primitive ne rend jamais de message dérivé d’une erreur', () => {
    // Le seul message d'échec de forme est une constante. Toute
    // interpolation d'un `e.message` ici rouvrirait la fuite.
    expect(CODE).not.toMatch(/e\.message|error\.message|catch\s*\(/);
    expect(CODE).toContain("error: 'Product not found'");
  });

  it('les QUATRE écritures produit passent bien par cette primitive', () => {
    const API = join(__dirname, '../../../app/api/shop/products');
    const verbes = [
      ['[id]/route.ts', 'PATCH'], ['[id]/route.ts', 'DELETE'],
      ['[id]/inventory/route.ts', 'POST'], ['[id]/inventory/route.ts', 'DELETE'],
    ] as const;
    for (const [fichier, verbe] of verbes) {
      const s = readFileSync(join(API, fichier), 'utf-8');
      const bloc = s.match(new RegExp(`export async function ${verbe}\\([\\s\\S]*?requireProductOwner`));
      expect(bloc, `${fichier} ${verbe}`).not.toBeNull();
    }
  });

  it('`lib/shop.ts` et `require-site-owner.ts` n’ont pas eu à bouger', () => {
    // La correction tient dans le point de passage unique. Si elle avait dû
    // descendre dans `getProduct`, elle aurait changé un contrat partagé par
    // tout le module d'accès à `shop_products`.
    const shop = readFileSync(join(__dirname, '../../shop.ts'), 'utf-8');
    expect(shop).toContain('if (error) throw new Error(`getProduct: ${error.message}`);');
    const siteOwner = readFileSync(join(__dirname, '../require-site-owner.ts'), 'utf-8');
    expect(siteOwner).not.toMatch(/UUID|uuid/);
  });
});
