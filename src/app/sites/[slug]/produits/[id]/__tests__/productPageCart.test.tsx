import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import CartShell from '../../../themes/CartShell';
import ProductPageView from '../ProductPageView';
import { getCartLabels } from '../../../themes/cartLabels';
import { getModeCapabilities } from '../../../themes/modeCapabilities';
import type { ProductPage } from '../fetchProduct';

// ============================================================
// M2-01 / M2-05 — LA FICHE PRODUIT, TESTEE DANS SA COMPOSITION REELLE.
//
// LE DEFAUT MESURE. `produits/[id]/page.tsx` etait le seul des trois montages
// de `CartShell` a ne pas transmettre `products`. Pour un Mode 2,
// `getModeCapabilities` repondait donc `hasShop = false`, `CartProvider`
// n'etait pas monte, et `AddToCartButton` -- rendu des que `forSale` --
// appelait `useCart()`, qui LEVE. La page renvoyait 500, sur un chemin atteint
// par chaque carte produit de la vitrine et annonce par les deux sitemaps.
//
// POURQUOI 2871 TESTS VERTS NE L'ONT PAS VU, et c'est le vrai enseignement.
// `ProductPageView.test.tsx` monte `<CartProvider>` A LA MAIN, avec un fixture
// `mode: 2`. Il teste donc le composant en isolation -- ce qui est legitime
// pour son propre objet (dette 6c : visible mais pas achetable) -- mais il
// valide une COMPOSITION QUI N'EXISTE PAS EN PRODUCTION : la vraie page passe
// par `CartShell`, qui refusait de monter le provider. Aucun test n'exercait
// l'assemblage reel, et `CartShell` n'en avait AUCUN dans tout le depot.
//
// CE FICHIER TESTE L'ASSEMBLAGE, PAS LES PIECES. Il reproduit exactement ce
// que la page monte, et il porte un cliquet indexe sur le DISQUE pour qu'un
// quatrieme montage ajoute demain ne puisse pas rejouer l'oubli.
// ============================================================

// La VRAIE page est un composant serveur asynchrone : on ne simule que ses
// deux dependances d'environnement (la source du produit et les en-tetes),
// jamais le panier ni la capacite -- c'est precisement ce qui est sous test.
// `@/lib/supabase` est simule pour la meme raison que dans le test voisin :
// il exige des variables d'environnement absentes du banc. Aucune logique
// metier n'est simulee par la.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

let produitCourant: ProductPage | null = null;
vi.mock('../fetchProduct', () => ({ fetchProduct: async () => produitCourant }));
vi.mock('next/headers', () => ({ headers: async () => new Map([['host', 'ma-boutique.test']]) }));

const labels = getCartLabels('fr');

function produit(over: Partial<ProductPage> = {}): ProductPage {
  return {
    id: 'p-1', name: 'Bougie de soja', description: 'Cire naturelle',
    priceNumber: 24.5, currency: 'CAD', images: [], inStock: true, forSale: true,
    siteName: 'Ma Boutique', siteSlug: 'ma-boutique', siteCustomDomain: null,
    primary: '#FA5D1E', theme: 'editorial', lang: 'fr', mode: 2, shippingFlat: 0,
    // LOT 4 -- champs AJOUTES au contrat de `ProductPage`. Neutres ici : un
    // produit du marchand n'a pas de variante fournisseur, donc le rendu de
    // ces cas est rigoureusement celui d'avant.
    supplierId: null, supplierProductId: null, requiresVariant: false,
    ...over,
  };
}

/** EXACTEMENT ce que `produits/[id]/page.tsx` monte, `products` compris. */
function pageReelle(p: ProductPage) {
  return renderToStaticMarkup(
    <CartShell
      primary={p.primary}
      labels={labels}
      slug={p.siteSlug}
      mode={p.mode}
      products={[p]}
      shippingFlat={p.shippingFlat ?? undefined}
      variant={p.theme === 'noir' ? 'dark' : 'light'}
    >
      <ProductPageView product={p} />
    </CartShell>
  );
}

// ------------------------------------------------------------
describe('M2-01 — 🔴 la fiche produit d’une boutique Mode 2 rend son bouton', () => {
  it('Mode 2, produit en vente : la page rend, sans exception', () => {
    expect(() => pageReelle(produit({ mode: 2 }))).not.toThrow();
    expect(pageReelle(produit({ mode: 2 }))).toContain('Ajouter au panier');
  });

  it('Mode 3 : comportement inchange (il ne dependait pas de `products`)', () => {
    expect(() => pageReelle(produit({ mode: 3 }))).not.toThrow();
    expect(pageReelle(produit({ mode: 3 }))).toContain('Ajouter au panier');
  });

  it('Mode 2, produit RETIRE DE LA VENTE : aucun bouton, et toujours aucune exception', () => {
    // Dette 6c : `forSale = false` ne rend pas le bouton du tout. Le panier
    // n'est alors jamais consomme -- mais la page doit rendre quand meme.
    const html = pageReelle(produit({ mode: 2, forSale: false }));
    expect(html).not.toContain('Ajouter au panier');
  });

  it('Mode 2, rupture de stock : bouton rendu mais desactive', () => {
    const html = pageReelle(produit({ mode: 2, inStock: false }));
    expect(html).toContain('Ajouter au panier');
    expect(html).toContain('disabled');
  });
});

// ------------------------------------------------------------
// LA VRAIE PAGE, pas une reconstruction.
//
// POURQUOI CE BLOC EXISTE, et c'est une lecon de l'audit lui-meme : le bloc
// precedent reconstruit le montage a la main. Une mutation l'a prouve
// insuffisant -- remplacer `products={[product]}` par `products={[]}` dans la
// vraie page reintroduit le 500 et SURVIVAIT, parce qu'aucun test ne lisait ce
// fichier. Un test qui rebatit ce qu'il pretend verifier ne verifie que
// lui-meme. Ici, c'est le module de page qui est importe et rendu.
// ------------------------------------------------------------
describe('M2-01 — 🔴 LE MODULE DE PAGE REEL rend la fiche produit', () => {
  async function rendreLaVraiePage(p: ProductPage) {
    produitCourant = p;
    const { default: ProductPage_ } = await import('../page');
    const arbre = await ProductPage_({ params: Promise.resolve({ slug: p.siteSlug, id: p.id }) });
    return renderToStaticMarkup(arbre as React.ReactElement);
  }

  it('Mode 2 : la page reelle rend, et contient le bouton', async () => {
    const html = await rendreLaVraiePage(produit({ mode: 2 }));
    expect(html).toContain('Ajouter au panier');
  });

  it('Mode 3 : la page reelle rend aussi', async () => {
    const html = await rendreLaVraiePage(produit({ mode: 3 }));
    expect(html).toContain('Ajouter au panier');
  });

  it('🔴 la page reelle emet bien son JSON-LD Product/Offer', async () => {
    // Non-regression : la correction ne devait toucher que le montage du
    // panier, pas la donnee structuree publiee aux moteurs.
    const html = await rendreLaVraiePage(produit({ mode: 2 }));
    expect(html).toContain('application/ld+json');
    expect(html).toContain('schema.org');
  });
});

// ------------------------------------------------------------
describe('M2-01 — 🔴 LE DEFAUT SE REPRODUIT si `products` disparait', () => {
  it('sans `products`, le Mode 2 leve — la correction est donc NECESSAIRE', () => {
    // Contre-preuve : sans cette assertion, un futur retrait de `products`
    // repasserait inapercu, exactement comme la premiere fois.
    const p = produit({ mode: 2 });
    expect(() =>
      renderToStaticMarkup(
        <CartShell primary={p.primary} labels={labels} slug={p.siteSlug} mode={p.mode} variant="light">
          <ProductPageView product={p} />
        </CartShell>
      )
    ).toThrow(/CartProvider/);
  });

  it('la capacite calculee explique le defaut, et n’a PAS ete deplacee', () => {
    // Aucune frontiere n'a bouge : c'est l'APPELANT qui a ete corrige.
    expect(getModeCapabilities({ mode: 2, products: undefined }).hasShop).toBe(false);
    expect(getModeCapabilities({ mode: 2, products: [{ id: 'p-1' }] }).hasShop).toBe(true);
    expect(getModeCapabilities({ mode: 3, products: undefined }).hasShop).toBe(true);
  });
});

// ------------------------------------------------------------
describe('M2-01 — 🔴 FRONTIERE : le Mode 1 ne gagne rien', () => {
  it('un Mode 1 n’obtient aucun panier, meme avec un produit en main', () => {
    // `canTransact` reste seul juge de l'admission : passer `products` ne
    // peut donc pas ouvrir une boutique a une vitrine.
    expect(getModeCapabilities({ mode: 1, products: [{ id: 'p-1' }] }).hasShop).toBe(false);
  });

  for (const mode of [undefined, null, 0, 4, '2', NaN]) {
    it(`mode=${String(mode)} : aucun panier, meme avec un produit`, () => {
      expect(getModeCapabilities({ mode: mode as never, products: [{ id: 'p-1' }] }).hasShop).toBe(false);
    });
  }
});

// ------------------------------------------------------------
// M2-05 — LE CLIQUET. Indexe sur le DISQUE, pas sur une liste.
// ------------------------------------------------------------
describe('M2-05 — 🟠 TOUT montage de CartShell transmet `products`', () => {
  const SRC = join(__dirname, '../../../../..');

  function fichiers(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        if (e === '__tests__' || e === 'node_modules') continue;
        out.push(...fichiers(p));
      } else if (/\.tsx$/.test(e) && !/\.test\.tsx$/.test(e)) out.push(p);
    }
    return out;
  }

  const montages = fichiers(SRC)
    .map((f) => ({ f, src: readFileSync(f, 'utf-8') }))
    .flatMap(({ f, src }) =>
      [...src.matchAll(/<CartShell\b[\s\S]*?>/g)].map((m) => ({ f, balise: m[0] }))
    );

  it('il en existe reellement — un ensemble vide passerait aussi', () => {
    expect(montages.length).toBeGreaterThanOrEqual(3);
  });

  for (const { f, balise } of montages) {
    it(`${f.split('/src/')[1]} transmet \`products\``, () => {
      // Le defaut venait d'un montage sur trois qui l'avait oublie. Un
      // quatrieme ajoute demain entre dans le denominateur parce qu'il
      // existe sur le disque, et echoue tant qu'il ne le transmet pas.
      expect(balise).toMatch(/\bproducts=\{/);
    });
  }
});
