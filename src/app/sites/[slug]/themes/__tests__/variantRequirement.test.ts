import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { achatPossible, choixDeVarianteRequis } from '../variantRequirement';

// ============================================================
// LOT 4 / R4-02 -- LE SCENARIO FALSIFICATEUR DE LA CONTRE-VERIFICATION.
//
// Les trois surfaces d'achat portaient chacune le PROXY
// `variants.length > 0 && !selectedVariant`. Il s'effondre quand la liste
// revient VIDE -- rupture totale de stock, ou erreur avalee par
// `/api/catalog/variants`, qui rend `{variants: []}` dans les deux cas :
// le bouton s'activait pour un produit que le checkout refuse.
//
// Ma propre correction du LOT 4 portait encore ce proxy sur la fiche produit.
// ============================================================

const CJ = { requiresVariant: true };      // ligne sans parent -> PRODUIT
const POD = { requiresVariant: false };    // ligne avec parent -> deja une variante
const SANS_FOURNISSEUR = { requiresVariant: undefined };

describe('LOT 4 / R4-02 — le SCENARIO FALSIFICATEUR : liste de variantes VIDE', () => {
  it('produit CJ + liste VIDE -> achat IMPOSSIBLE (le proxy disait le contraire)', () => {
    expect(
      achatPossible({ ...CJ, variantesConnues: 0, varianteChoisie: null, chargementEnCours: false })
    ).toBe(false);
    // Le proxy d'origine (`variants.length > 0 && !selectedVariant`) valait
    // FAUX sur cet etat -- il aurait donc autorise l'achat. C'est exactement
    // la divergence que cette regle ferme.
  });

  it('produit CJ + variantes proposees mais AUCUNE choisie -> impossible', () => {
    expect(
      achatPossible({ ...CJ, variantesConnues: 4, varianteChoisie: null, chargementEnCours: false })
    ).toBe(false);
  });

  it('produit CJ + variante choisie -> possible', () => {
    expect(
      achatPossible({ ...CJ, variantesConnues: 4, varianteChoisie: 'vid-7', chargementEnCours: false })
    ).toBe(true);
  });

  it('FAIL-CLOSED pendant le chargement : aucune fenetre de clic', () => {
    for (const p of [CJ, POD, SANS_FOURNISSEUR]) {
      expect(
        achatPossible({ ...p, variantesConnues: 4, varianteChoisie: 'vid-7', chargementEnCours: true })
      ).toBe(false);
    }
  });
});

describe('LOT 4 / R4-02 — NON-REGRESSION : les surfaces sans variante obligatoire', () => {
  it('produit POD (ligne AVEC parent) sans option -> achat direct, comme avant', () => {
    expect(
      achatPossible({ ...POD, variantesConnues: 0, varianteChoisie: null, chargementEnCours: false })
    ).toBe(true);
  });

  it('produit sans fournisseur (Mode 2, maquette POD) -> achat direct', () => {
    expect(
      achatPossible({ ...SANS_FOURNISSEUR, variantesConnues: 0, varianteChoisie: null, chargementEnCours: false })
    ).toBe(true);
  });

  it('produit POD qui expose malgre tout des options -> il faut choisir', () => {
    // La disjonction est voulue : `requiresVariant` seul ne suffit pas.
    expect(
      achatPossible({ ...POD, variantesConnues: 3, varianteChoisie: null, chargementEnCours: false })
    ).toBe(false);
    expect(
      achatPossible({ ...POD, variantesConnues: 3, varianteChoisie: 'v1', chargementEnCours: false })
    ).toBe(true);
  });

  it('la matrice complete est deterministe', () => {
    const vrais: string[] = [];
    for (const rv of [true, false, undefined]) {
      for (const n of [0, 3]) {
        for (const choix of [null, 'v1']) {
          for (const chargement of [true, false]) {
            if (achatPossible({ requiresVariant: rv, variantesConnues: n, varianteChoisie: choix, chargementEnCours: chargement })) {
              vrais.push(`${String(rv)}/${n}/${choix}/${chargement}`);
            }
          }
        }
      }
    }
    expect(vrais.sort()).toEqual([
      'false/0/null/false', 'false/0/v1/false',
      'false/3/v1/false',
      'true/0/v1/false', 'true/3/v1/false',
      'undefined/0/null/false', 'undefined/0/v1/false',
      'undefined/3/v1/false',
    ]);
  });
});

describe('LOT 4 / R4-02 — les TROIS surfaces consomment la meme regle', () => {
  // La duplication est ce qui a produit la divergence. Ce cliquet verifie
  // qu'aucune surface ne reecrit la condition pour son compte.
  const RACINE = join(__dirname, '../../../../../..');
  const lire = (p: string) =>
    readFileSync(join(RACINE, p), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');

  const SURFACES = [
    'src/app/sites/[slug]/themes/ProductModal.tsx',
    'src/app/sites/[slug]/themes/MerchantProductModal.tsx',
    'src/app/sites/[slug]/produits/[id]/ProductPageView.tsx',
  ];

  it.each(SURFACES)('%s appelle `achatPossible`', (f) => {
    expect(lire(f)).toContain('achatPossible(');
  });

  it.each(SURFACES)('%s ne reecrit plus le proxy `variants.length > 0 && !…`', (f) => {
    expect(lire(f)).not.toMatch(/variants\.length > 0 && !selectedVariant/);
    expect(lire(f)).not.toMatch(/variantes\.length > 0 && !varianteChoisie/);
  });

  // LIMITE DU HARNAIS, NOMMEE. La valeur reellement PASSEE a `achatPossible`
  // n'est observable qu'apres l'execution d'un effet React : ce depot n'a ni
  // jsdom ni testing-library, et `renderToStaticMarkup` n'execute aucun effet.
  // Les mutations U8/U9/U10 -- « la surface passe `undefined` au lieu du vrai
  // signal » -- ne changent donc RIEN au premier rendu, seul etat observable.
  //
  // Ce cliquet observe l'argument reel dans le fichier : c'est la meilleure
  // preuve disponible, et ce n'est pas la preuve complete. La garantie qui
  // compte reste posee cote SERVEUR (`lib/mode3/catalogStock.ts`), ou elle est
  // incontournable et testee comportementalement : un identifiant sans
  // variante y est refuse quoi qu'affiche l'interface.
  it.each([
    ['src/app/sites/[slug]/produits/[id]/ProductPageView.tsx', 'product.requiresVariant'],
    ['src/app/sites/[slug]/themes/ProductModal.tsx', 'p.requires_variant'],
    ['src/app/sites/[slug]/themes/MerchantProductModal.tsx', 'p.requiresVariant'],
  ])('%s transmet le VRAI signal, jamais une constante', (f, expression) => {
    expect(lire(f)).toContain(`requiresVariant: ${expression}`);
  });
});

describe('LOT 4 / R4-02 — le signal remonte bien de la BASE jusqu\'aux surfaces', () => {
  const RACINE = join(__dirname, '../../../../../..');
  const lire = (p: string) => readFileSync(join(RACINE, p), 'utf-8');

  it.each([
    ['la vitrine', 'src/app/sites/[slug]/themes/shared.tsx'],
    ['la recherche', 'src/app/api/catalog/search/route.ts'],
    ['la fiche produit', 'src/app/sites/[slug]/produits/[id]/fetchProduct.ts'],
  ])('%s demande `supplier_parent_id` et en derive l\'exigence', (_l, f) => {
    const src = lire(f);
    expect(src).toContain('supplier_parent_id');
    expect(src).toMatch(/requires?_?[Vv]ariant:\s*!/);
  });
});
