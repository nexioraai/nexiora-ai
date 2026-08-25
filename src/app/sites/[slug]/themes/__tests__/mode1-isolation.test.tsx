import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================
// Chantier Site Web / Mode 1 — Phase 1 (isolation).
// Verrouille les deux couplages niveau C identifies par le diagnostic
// d'isolation : le panier monte sans condition pour tous les modes, et le
// bloc Shop physiquement present dans le rendu des themes Mode 1.
//
// themes/shared.tsx importe @/lib/supabase (fetchSite/fetchSitePreview),
// jamais utilise par un rendu direct de composant en test -- mock minimal,
// meme principe que shipping-cache/__tests__/route.test.ts pour
// supabase-admin.
// ============================================================
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import EditorialTheme from '../EditorialTheme';
import VifTheme from '../VifTheme';
import CartShell from '../CartShell';
import { getCartLabels } from '../cartLabels';
import { getModeCapabilities } from '../modeCapabilities';
import { canTransact } from '@/lib/commerce-admission/canTransact';

type SiteOverrides = Record<string, unknown>;

function makeSite(overrides: SiteOverrides = {}): any {
  return {
    id: 'site-1',
    slug: 'entreprise-test',
    name: 'Entreprise Test',
    mode: 1,
    lang: 'fr',
    hidden_sections: [],
    hero_title: 'Bienvenue chez Entreprise Test',
    about: 'Une description authentique de notre activité.',
    contact: { phone: '+15145550100', email: 'contact@entreprise-test.com', address: '123 rue Test' },
    social_links: {},
    testimonials: [],
    sections: [],
    products: [],
    gallery: [],
    ...overrides,
  };
}

function renderEditorial(site: any) {
  return renderToStaticMarkup(<EditorialTheme site={site} />);
}
function renderVif(site: any) {
  return renderToStaticMarkup(<VifTheme site={site} />);
}

describe('Rendu minimal Mode 1 — ne lève jamais d\'exception', () => {
  it('EditorialTheme rend un site Mode 1 minimaliste sans erreur', () => {
    expect(() => renderEditorial(makeSite())).not.toThrow();
  });

  it('VifTheme rend un site Mode 1 minimaliste sans erreur', () => {
    expect(() => renderVif(makeSite())).not.toThrow();
  });
});

describe('Sections essentielles Mode 1 — présentes dans le rendu réel', () => {
  it('EditorialTheme affiche le nom, le hero et les coordonnées de contact', () => {
    const html = renderEditorial(makeSite());
    expect(html).toContain('Entreprise Test');
    expect(html).toContain('id="about"');
    expect(html).toContain('id="contact"');
    expect(html).toContain('+15145550100');
  });

  it('VifTheme affiche le nom, le hero et les coordonnées de contact', () => {
    const html = renderVif(makeSite());
    expect(html).toContain('Entreprise Test');
    expect(html).toContain('id="about"');
    expect(html).toContain('id="contact"');
    expect(html).toContain('+15145550100');
  });
});

describe('CartShell — panier absent pour Mode 1, présent pour Mode 2/3', () => {
  const labels = getCartLabels('fr');

  function renderCartShell(mode: number | null, products: unknown[] | null) {
    return renderToStaticMarkup(
      <CartShell primary="#111111" labels={labels} slug="test" mode={mode} products={products} shippingFlat={0}>
        CONTENU
      </CartShell>
    );
  }

  it('Mode 1 : aucune trace du panier (aside du drawer) dans le rendu', () => {
    const html = renderCartShell(1, []);
    expect(html).not.toContain('<aside');
    expect(html).toBe('CONTENU');
  });

  it('Mode 1 avec des lignes "products" orphelines : le panier reste absent (mode fait toujours foi)', () => {
    const html = renderCartShell(1, [{ id: 'x', name: 'Orphelin', priceNumber: 10, currency: 'CAD' }]);
    expect(html).not.toContain('<aside');
  });

  it('Mode 2 avec au moins un produit : le panier est monté', () => {
    const html = renderCartShell(2, [{ id: 'p1', name: 'Produit', priceNumber: 10, currency: 'CAD' }]);
    expect(html).toContain('<aside');
  });

  it('Mode 2 sans aucun produit : le panier reste absent', () => {
    const html = renderCartShell(2, []);
    expect(html).not.toContain('<aside');
  });

  it('Mode 3 même sans produit chargé : le panier est monté (dropshipping, toujours actif)', () => {
    const html = renderCartShell(3, []);
    expect(html).toContain('<aside');
  });
});

describe('Shop — reste fonctionnel pour les modes qui en ont besoin', () => {
  // AddToCartButton exige un CartProvider (useCart() lève sinon) : on
  // englobe donc le thème dans CartShell, exactement comme le fait
  // sites/[slug]/page.tsx en production — un thème Mode 2/3 n'est jamais
  // rendu seul dans la vraie application.
  const labels = getCartLabels('fr');

  function renderWithCartShell(Theme: any, site: any) {
    return renderToStaticMarkup(
      <CartShell primary="#111111" labels={labels} slug={site.slug} mode={site.mode} products={site.products} shippingFlat={0}>
        <Theme site={site} />
      </CartShell>
    );
  }

  const product = { id: 'p1', name: 'Produit Vedette', priceNumber: 42, currency: 'CAD' };

  it('EditorialTheme Mode 2 avec produit : la section Shop et le produit apparaissent, panier fonctionnel', () => {
    const html = renderWithCartShell(EditorialTheme, makeSite({ mode: 2, products: [product] }));
    expect(html).toContain('id="shop"');
    expect(html).toContain('Produit Vedette');
    expect(html).toContain('href="#shop"');
    expect(html).toContain('<aside');
  });

  it('VifTheme Mode 3 même sans produit : la section Shop et le panier apparaissent (dropshipping toujours actif)', () => {
    const html = renderWithCartShell(VifTheme, makeSite({ mode: 3, products: [] }));
    expect(html).toContain('id="shop"');
    expect(html).toContain('<aside');
  });
});

describe('Bug ctaHref/MobileNav corrigés — jamais de lien #shop pour un site Mode 1', () => {
  it('EditorialTheme : aucun href="#shop" même avec des produits orphelins en base', () => {
    const html = renderEditorial(makeSite({ products: [{ id: 'x', name: 'Orphelin', priceNumber: 5, currency: 'CAD' }] }));
    expect(html).not.toContain('href="#shop"');
  });

  it('VifTheme : aucun href="#shop" même avec des produits orphelins en base', () => {
    const html = renderVif(makeSite({ products: [{ id: 'x', name: 'Orphelin', priceNumber: 5, currency: 'CAD' }] }));
    expect(html).not.toContain('href="#shop"');
  });
});

describe('getModeCapabilities — cohérence avec le rendu', () => {
  it('mode 1 : hasShop toujours faux, quel que soit le nombre de produits', () => {
    expect(getModeCapabilities({ mode: 1, products: [] }).hasShop).toBe(false);
    expect(getModeCapabilities({ mode: 1, products: [{}, {}] }).hasShop).toBe(false);
  });

  it('mode 2 : hasShop vrai seulement si au moins un produit', () => {
    expect(getModeCapabilities({ mode: 2, products: [] }).hasShop).toBe(false);
    expect(getModeCapabilities({ mode: 2, products: [{}] }).hasShop).toBe(true);
  });

  it('mode 3 : hasShop toujours vrai, même sans produit', () => {
    expect(getModeCapabilities({ mode: 3, products: [] }).hasShop).toBe(true);
    expect(getModeCapabilities({ mode: 3, products: null }).hasShop).toBe(true);
  });

  it('mode absent : traité comme mode 1 (repli sûr)', () => {
    expect(getModeCapabilities({ products: [{}] }).hasShop).toBe(false);
  });
});

// ============================================================
// ÉTAPE A — `canTransact` EST L'AUTORITÉ UNIQUE.
//
// `hasShop` se calculait par une comparaison NÉGATIVE au mode vitrine — une
// seconde définition de « ce site commerce », à côté de `canTransact`, dans
// la forme même que le registre d'architecture interdit. Les deux
// s'accordaient sur les trois modes connus et divergeaient sur tout le
// reste : `canTransact(4)` était faux, `hasShop(4, [produit])` était vrai.
//
// CES TESTS VÉRIFIENT UN COMPORTEMENT, PAS DES MOTS. Ils appellent la
// fonction réelle avec des valeurs réelles ; aucun n'inspecte le source.
// Le seul constat structurel est isolé en fin de fichier, et nommé comme tel.
// ============================================================

describe('ÉTAPE A — un mode non admis n’obtient AUCUNE boutique', () => {
  it('mode 4 : faux avec ou sans produit', () => {
    expect(getModeCapabilities({ mode: 4, products: [] }).hasShop).toBe(false);
    expect(getModeCapabilities({ mode: 4, products: [{}] }).hasShop).toBe(false);
  });

  it('valeurs inattendues : toutes fail-closed', () => {
    const inattendus: unknown[] = [null, undefined, 0, -1, 4, 42, '2', '3', NaN, Infinity, true, {}, []];
    for (const mode of inattendus) {
      const entree = { mode, products: [{}] } as unknown as Parameters<typeof getModeCapabilities>[0];
      expect(getModeCapabilities(entree).hasShop, `mode ${String(mode)}`).toBe(false);
    }
  });

  it("les chaînes ne sont jamais coercées : '2' et '3' ne valent pas 2 et 3", () => {
    const s2 = { mode: '2', products: [{}] } as unknown as Parameters<typeof getModeCapabilities>[0];
    const s3 = { mode: '3', products: [] } as unknown as Parameters<typeof getModeCapabilities>[0];
    expect(getModeCapabilities(s2).hasShop).toBe(false);
    expect(getModeCapabilities(s3).hasShop).toBe(false);
  });
});

describe('ÉTAPE A — l’invariant : hasShop ⟹ canTransact(mode)', () => {
  // C'est LA propriété qui empêche les deux définitions de redivergier :
  // quelle que soit l'entrée, une boutique affichée implique une
  // autorisation commerciale. L'inverse est faux, et doit le rester (mode 2
  // sans produit : autorisé, mais rien à montrer).
  const MODES: unknown[] = [1, 2, 3, 4, 0, -1, 42, null, undefined, '2', '3', NaN, true, {}];
  const CATALOGUES: (unknown[] | null)[] = [null, [], [{}], [{}, {}]];

  it('vrai sur les 56 combinaisons de modes et de catalogues', () => {
    let couples = 0;
    for (const mode of MODES) {
      for (const products of CATALOGUES) {
        const entree = { mode, products } as unknown as Parameters<typeof getModeCapabilities>[0];
        const { hasShop } = getModeCapabilities(entree);
        couples++;
        if (hasShop) {
          expect(canTransact(mode), `hasShop vrai alors que canTransact(${String(mode)}) est faux`).toBe(true);
        }
      }
    }
    // Dénominateur explicite : sans lui, une boucle vide passerait aussi.
    expect(couples).toBe(MODES.length * CATALOGUES.length);
  });

  it('la réciproque reste FAUSSE — autorisé ne veut pas dire affiché', () => {
    expect(canTransact(2)).toBe(true);
    expect(getModeCapabilities({ mode: 2, products: [] }).hasShop).toBe(false);
  });

  it('tout mode admis ET pourvu de produits affiche bien sa boutique', () => {
    for (const mode of [2, 3]) {
      expect(getModeCapabilities({ mode, products: [{}] }).hasShop, `mode ${mode}`).toBe(true);
    }
  });
});

describe('ÉTAPE A — la règle du catalogue anticipé ne peut pas disparaître', () => {
  // Le dropshipping charge son catalogue côté client (CatalogSearch), hors
  // de `site.products`, et CatalogSearch est rendu DANS CartShell. Si cette
  // règle sautait, le catalogue s'afficherait sans CartProvider : visible,
  // et impossible à mettre au panier.
  it('mode 3 sans aucun produit : la boutique est montée quand même', () => {
    expect(getModeCapabilities({ mode: 3, products: [] }).hasShop).toBe(true);
    expect(getModeCapabilities({ mode: 3, products: null }).hasShop).toBe(true);
    expect(getModeCapabilities({ mode: 3 }).hasShop).toBe(true);
  });

  it('elle ne s’étend à AUCUN autre mode', () => {
    for (const mode of [1, 2, 4, 5]) {
      expect(getModeCapabilities({ mode, products: [] }).hasShop, `mode ${mode}`).toBe(false);
    }
  });
});

// ============================================================
// ÉTAPE C — LE MODÈLE DE FACTURATION DE LA LIVRAISON.
//
// Le panier décidait de son modèle de livraison par TROIS comparaisons brutes
// (`mode === 2` deux fois, `mode !== 2` une fois). Conséquence mesurée : un
// mode inconnu tombait SILENCIEUSEMENT dans la branche fournisseur — pays
// exigé, appel à `/api/shop/shipping/calculate` déclenché.
//
// Cette règle est déjà nommée côté serveur (`CheckoutPolicy.requiresDeliverableCountry`
// et `.requiresResolvedShipping`, false/false en mode 2, true/true en mode 3),
// mais ces fichiers portent `import 'server-only'` : le client ne peut pas les
// lire. D'où ce miroir, en deux allowlists positives.
//
// POURQUOI CES TESTS PORTENT SUR LES CAPACITÉS ET NON SUR LE RENDU. Mesuré :
// le bloc contenant ces trois comparaisons est gardé par `items.length > 0`,
// et `CartContext` initialise son panier à `[]` sans hydratation. En
// `renderToStaticMarkup`, ce bloc n'est donc JAMAIS rendu — les branches sont
// inatteignables par la technique du dépôt. Seul un prédicat pur est
// réellement vérifiable ; c'est le même constat qu'à la dette 6c.
// ============================================================

describe('ÉTAPE C — forfait et devis sont deux allowlists positives', () => {
  const cap = (mode: unknown) =>
    getModeCapabilities({ mode } as unknown as Parameters<typeof getModeCapabilities>[0]);

  it('mode 2 : FORFAIT, et surtout pas de devis', () => {
    expect(cap(2).billsFlatShipping).toBe(true);
    expect(cap(2).requiresShippingQuote).toBe(false);
  });

  it('mode 3 : DEVIS, et surtout pas de forfait', () => {
    expect(cap(3).requiresShippingQuote).toBe(true);
    expect(cap(3).billsFlatShipping).toBe(false);
  });

  it('mode 1 : ni l’un ni l’autre — une vitrine ne facture aucune livraison', () => {
    expect(cap(1).billsFlatShipping).toBe(false);
    expect(cap(1).requiresShippingQuote).toBe(false);
  });

  it('🔴 un mode inconnu n’ouvre AUCUNE des deux branches', () => {
    const inconnus: unknown[] = [4, 5, 42, 0, -1, null, undefined, NaN, Infinity, true, {}, []];
    for (const mode of inconnus) {
      expect(cap(mode).billsFlatShipping, `flat, mode ${String(mode)}`).toBe(false);
      expect(cap(mode).requiresShippingQuote, `quote, mode ${String(mode)}`).toBe(false);
    }
  });

  it("les chaînes ne sont jamais coercées : '2' et '3' n’ouvrent rien", () => {
    for (const mode of ['2', '3']) {
      expect(cap(mode).billsFlatShipping, `flat, '${mode}'`).toBe(false);
      expect(cap(mode).requiresShippingQuote, `quote, '${mode}'`).toBe(false);
    }
  });

  it('EXCLUSIVITÉ : `flat && quoted` est faux sur toute entrée', () => {
    const modes: unknown[] = [1, 2, 3, 4, 0, -1, 42, null, undefined, '2', '3', NaN, true, {}];
    let vus = 0;
    for (const mode of modes) {
      const { billsFlatShipping, requiresShippingQuote } = cap(mode);
      vus++;
      expect(billsFlatShipping && requiresShippingQuote, `mode ${String(mode)}`).toBe(false);
    }
    expect(vus).toBe(modes.length);   // dénominateur : une boucle vide passerait aussi
  });

  it('les capacités de livraison ne dépendent PAS des produits', () => {
    // Le panier appelle `getModeCapabilities({ mode })` sans produits : ces
    // deux capacités doivent être stables quelle qu'en soit la présence.
    for (const products of [null, [], [{}], [{}, {}]] as (unknown[] | null)[]) {
      expect(getModeCapabilities({ mode: 2, products }).billsFlatShipping).toBe(true);
      expect(getModeCapabilities({ mode: 3, products }).requiresShippingQuote).toBe(true);
    }
  });

  it('NON-RÉGRESSION : `hasShop` n’a pas bougé pour les modes 2 et 3', () => {
    expect(getModeCapabilities({ mode: 2, products: [] }).hasShop).toBe(false);
    expect(getModeCapabilities({ mode: 2, products: [{}] }).hasShop).toBe(true);
    expect(getModeCapabilities({ mode: 3, products: [] }).hasShop).toBe(true);
  });
});

describe('ÉTAPE C — constat structurel sur CartDrawer (assumé comme tel)', () => {
  // Le bloc décisionnel du panier est inatteignable en rendu statique (voir
  // ci-dessus). Ce constat ne prouve donc rien du rendu : il empêche
  // seulement la réapparition d'une comparaison brute dans ce fichier.
  const CD = readFileSync(join(__dirname, '../CartDrawer.tsx'), 'utf-8');
  const CD_CODE = CD.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('plus aucune comparaison directe de mode', () => {
    expect(CD_CODE).not.toMatch(/mode\s*===\s*[0-9]/);
    expect(CD_CODE).not.toMatch(/mode\s*!==\s*[0-9]/);
    expect(CD_CODE).not.toMatch(/mode\s*==\s*[0-9]/);
    expect(CD_CODE).not.toMatch(/mode\s*!=\s*[0-9]/);
  });

  it('les deux capacités sont bien celles qui pilotent le panier', () => {
    expect(CD_CODE).toMatch(/from '\.\/modeCapabilities'/);
    expect(CD_CODE).toMatch(/billsFlatShipping/);
    expect(CD_CODE).toMatch(/requiresShippingQuote/);
  });

  it('le panier ne lit PAS `hasShop` — il l’obtiendrait faux, faute de produits', () => {
    // Piège réel : `getModeCapabilities({ mode })` sans `products` rend
    // `hasShop: false` pour un mode 2 pourtant pourvu. La décision de monter
    // le panier appartient à CartShell, jamais ici.
    expect(CD_CODE).not.toMatch(/hasShop/);
  });

  it('la frontière de ROUTAGE n’est pas entrée dans le panier', () => {
    expect(CD_CODE).not.toMatch(/order-domain/);
    expect(CD_CODE).not.toMatch(/SUPPLIER_SITE_MODE/);
    expect(CD_CODE).not.toMatch(/canTransact/);
  });

  it('la garde FAIL-CLOSED du bouton de commande est présente', () => {
    // Trou trouvé par mutation : supprimer cette garde ne faisait rougir
    // AUCUN test (mutation C-M5 verte). C'est le seul terme qui empêche un
    // mode inscrit dans aucune des deux listes de commander malgré tout —
    // et il vit dans le bloc que le rendu statique n'atteint pas. Constat
    // structurel faute de mieux, et déclaré comme tel.
    expect(CD_CODE).toMatch(/!billsFlatShipping\s*&&\s*!requiresShippingQuote/);
  });

  it('le devis reste le SEUL terme qui exige un pays', () => {
    // Empêche le retour d'une condition de pays attachée à autre chose que
    // la capacité de devis (c'était `mode !== 2`).
    const gardePays = CD_CODE.match(/\(([^()]*)&&\s*\(!country[^)]*\)\)/);
    expect(gardePays, 'garde de pays introuvable').not.toBeNull();
    expect(gardePays![1]).toContain('requiresShippingQuote');
  });
});

describe('ÉTAPE A — constat structurel (assumé comme tel)', () => {
  // Les tests ci-dessus mesurent le COMPORTEMENT et sont la vraie garantie.
  // Ce constat-ci ne prouve rien du comportement : il empêche seulement la
  // réapparition silencieuse de la forme négative dans le source, y compris
  // sur une branche que les tests n'atteindraient pas encore.
  const SRC = readFileSync(join(__dirname, '../modeCapabilities.ts'), 'utf-8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('aucune comparaison négative au mode vitrine ne subsiste', () => {
    expect(CODE).not.toMatch(/!==\s*1\b/);
    expect(CODE).not.toMatch(/!=\s*1\b/);
  });

  it('l’autorité est bien `canTransact`, importée et appelée', () => {
    expect(CODE).toMatch(/from '@\/lib\/commerce-admission\/canTransact'/);
    expect(CODE).toMatch(/canTransact\(mode\)/);
  });

  it('la règle du catalogue est une allowlist, jamais une comparaison', () => {
    expect(CODE).toMatch(/new Set<unknown>\(\[3\]\)/);
    expect(CODE).not.toMatch(/mode\s*===\s*[0-9]/);
  });

  it('la frontière de ROUTAGE n’est pas importée dans une décision d’affichage', () => {
    expect(CODE).not.toMatch(/order-domain/);
    expect(CODE).not.toMatch(/SUPPLIER_SITE_MODE/);
  });
});

// La frontière statique (le tronc commun Mode 1 ne référence jamais le
// panier en dur) est désormais vérifiée par le moteur générique de
// domaines — voir src/lib/architecture/domainRegistry.ts (domaine
// "mode-1-theme-rendering") et src/lib/architecture/__tests__/domainBoundaries.test.ts.
// Elle n'est plus dupliquée ici pour éviter que les deux copies divergent.
