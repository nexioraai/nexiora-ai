import { describe, it, expect } from 'vitest';
import { toolNamesForSite, PRODUCT_FIELD_TOOLS, INVENTORY_TOOLS } from '../toolCapabilities';
import { guidanceForSite } from '../modeGuidance';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================
// M2-02 — CE QUE LA GUIDANCE AFFIRME DOIT ETRE VRAI DES OUTILS ACCORDES.
//
// LE DEFAUT MESURE. La guidance Mode 2 affirmait « You CANNOT add, edit or
// remove products yourself », en citant nommement `price` et `stock` comme
// reserves au tableau de bord -- alors que les etapes 7 et 8-D, POSTERIEURES
// a sa redaction, lui avaient accorde `set_price`, `set_currency`,
// `set_for_sale` et `count_product_stock`, dont les descriptions disent au
// modele de les utiliser. Deux instructions contradictoires dans le MEME
// prompt, la guidance siegeant dans la section qui fait autorite.
//
// CE FICHIER NE TESTE PAS LE CAS, IL TESTE LA CLASSE. Deux proprietes,
// verifiees sur TOUS les couples (mode, sous-type) par appel reel des deux
// autorites -- aucune association n'est reenumeree ici :
//
//   P1  une guidance ne peut pas NIER une capacite que le mode POSSEDE ;
//   P2  une guidance ne peut pas nommer un outil que le mode N'A PAS, sauf
//       dans une tournure negative (« do NOT suggest catalog_curate »).
//
// P2 attrape le defaut miroir : promettre au marchand un outil inexistant.
// ============================================================

const COUPLES: Array<[unknown, unknown, string]> = [
  [1, null, 'mode 1'],
  [2, null, 'mode 2'],
  [3, 'reseller', 'mode 3 reseller'],
  [3, 'pod_brand', 'mode 3 pod_brand'],
  [3, 'pod_custom', 'mode 3 pod_custom'],
];

/** Les outils qui EDITENT un produit existant, toutes familles confondues. */
const EDITION_PRODUIT = [...PRODUCT_FIELD_TOOLS, ...INVENTORY_TOOLS] as readonly string[];

/** Tous les noms d'outils du produit, pour detecter une mention. */
const TOUS_LES_OUTILS = (() => {
  const src = readFileSync(join(__dirname, '../toolCapabilities.ts'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const noms = new Set<string>();
  for (const m of src.matchAll(/'([a-z_]+)'/g)) {
    if (/^(propose_|catalog_|set_|create_promo|deactivate_promo|count_product)/.test(m[1])) noms.add(m[1]);
  }
  return [...noms];
})();

describe('M2-02 — le denominateur est reel', () => {
  it('les outils du produit sont bien detectes', () => {
    expect(TOUS_LES_OUTILS.length).toBeGreaterThan(25);
    expect(TOUS_LES_OUTILS).toContain('set_price');
    expect(TOUS_LES_OUTILS).toContain('catalog_curate');
  });

  it('chaque couple teste recoit reellement une guidance', () => {
    for (const [m, st, nom] of COUPLES) {
      expect(guidanceForSite(m, st).trim().length, nom).toBeGreaterThan(50);
    }
  });
});

// ------------------------------------------------------------
describe('M2-02 — 🔴 P1 : une guidance ne NIE jamais une capacite possedee', () => {
  for (const [mode, st, nom] of COUPLES) {
    it(`${nom} : pas de negation globale de l’edition produit s’il en a les outils`, () => {
      const outils = toolNamesForSite(mode, st);
      const possede = EDITION_PRODUIT.filter((t) => outils.includes(t));
      if (possede.length === 0) return; // rien a contredire
      const g = guidanceForSite(mode, st);
      expect(
        g,
        `${nom} possede ${possede.join(', ')} : la guidance ne peut pas nier l'edition de produit`
      ).not.toMatch(/CANNOT[^.]*\bedit\b[^.]*products/i);
    });
  }

  it('🔴 le Mode 2 annonce desormais ce qu’il peut reellement faire', () => {
    const g = guidanceForSite(2, null);
    for (const t of ['set_price', 'set_currency', 'set_for_sale', 'count_product_stock']) {
      expect(g, t).toContain(t);
    }
  });

  it('🔴 et ce qu’il ne peut TOUJOURS pas — aucune frontiere n’a bouge', () => {
    const g = guidanceForSite(2, null);
    expect(g).toMatch(/cannot create or delete a product/i);
    const outils = toolNamesForSite(2, null);
    for (const t of ['propose_product_add', 'propose_product_remove', 'propose_product_update']) {
      expect(outils, t).not.toContain(t);
    }
    // Et les champs restes au tableau de bord ne sont couverts par aucun outil.
    expect(g).toMatch(/name, description, images or visibility/i);
  });
});

// ------------------------------------------------------------
describe('M2-02 — 🔴 P2 : une guidance ne promet jamais un outil absent', () => {
  for (const [mode, st, nom] of COUPLES) {
    it(`${nom} : tout outil nomme est possede, ou nomme negativement`, () => {
      const outils = toolNamesForSite(mode, st);
      const g = guidanceForSite(mode, st);
      const fautifs = TOUS_LES_OUTILS.filter((t) => {
        if (!g.includes(t) || outils.includes(t)) return false;
        // Tournure negative admise : « do NOT suggest catalog_curate ».
        const phrase = g.split('\n').find((l) => l.includes(t)) ?? '';
        return !/\bNOT\b|\bNO\b/.test(phrase);
      });
      expect(fautifs, `${nom} nomme affirmativement des outils qu'il n'a pas`).toEqual([]);
    });
  }
});

// ------------------------------------------------------------
describe('M2-02 — 🔒 les autres modes restent coherents (non-regression)', () => {
  it('Mode 1 conserve sa gestion manuelle annoncee', () => {
    expect(guidanceForSite(1, null)).toMatch(/add\/edit\/remove services, products/);
    expect(toolNamesForSite(1, null)).toContain('propose_product_add');
  });

  it('Mode 3 pod_brand refuse toujours la curation, et ne l’a toujours pas', () => {
    expect(guidanceForSite(3, 'pod_brand')).toContain('do NOT suggest catalog_curate');
    expect(toolNamesForSite(3, 'pod_brand')).not.toContain('catalog_curate');
  });

  it('un mode inconnu ne recoit aucune guidance — fail-closed inchange', () => {
    for (const m of [undefined, null, 0, 4, '2', NaN]) {
      expect(guidanceForSite(m, null), String(m)).toBe('');
    }
  });
});
