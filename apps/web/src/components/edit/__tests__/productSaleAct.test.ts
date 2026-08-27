import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  EMPTY_DRAFT,
  draftFromProduct,
  payloadFromDraft,
  type ProductDraft,
  type EditableProduct,
} from '../productDraft';

// ============================================================
// DETTE 6c — LA MISE EN VENTE EST UN ACTE, PAS UN DEFAUT.
//
// CE QUI EXISTAIT AVANT CE FICHIER. Une seule assertion touchait `for_sale`
// cote marchand :
//
//     expect(draft).toMatch(/for_sale: boolean;/)
//
// c'est-a-dire la PRESENCE D'UNE LIGNE DE CODE. Elle serait restee verte si
// l'etat initial du formulaire avait change, si une sauvegarde avait cesse de
// transporter le champ, ou si l'ouverture d'un produit en avait devendu un
// autre. Ce fichier remplace cette presence par du COMPORTEMENT : il appelle
// les fonctions que le composant appelle, avec les valeurs qu'il leur passe.
//
// CE QUE CE FICHIER NE PEUT PAS FAIRE, ET POURQUOI. Le depot n'a ni jsdom ni
// testing-library : aucun clic ne peut etre simule. « Decocher puis
// enregistrer » est donc verifie sur la CHAINE REELLE -- l'etat que la case
// produit, passe a la fonction qui construit la charge envoyee -- et non sur
// l'evenement DOM. C'est la meme chaine, sans le navigateur.
// ============================================================

const PM = readFileSync(join(__dirname, '../ProductManager.tsx'), 'utf-8');
const PM_CODE = PM.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function produit(over: Partial<EditableProduct> = {}): EditableProduct {
  return {
    name: 'Bougie',
    description: 'Cire de soja',
    price: 24.5,
    currency: 'CAD',
    images: ['https://x/1.png'],
    published: true,
    for_sale: true,
    ...over,
  };
}

/** L'etat que produit une case a cocher : `setDraft({ ...draft, for_sale: X })`. */
function coche(d: ProductDraft, champ: 'for_sale' | 'published', valeur: boolean): ProductDraft {
  return { ...d, [champ]: valeur };
}

describe('DETTE 6c — état initial : un produit neuf n’est PAS en vente', () => {
  it('`for_sale` vaut false dans le formulaire de création', () => {
    expect(EMPTY_DRAFT.for_sale).toBe(false);
  });

  it('`published` vaut toujours true : la VISIBILITÉ n’est pas touchée par cette décision', () => {
    expect(EMPTY_DRAFT.published).toBe(true);
  });

  it('les deux états sont bien distincts à la création — visible, et pas encore vendable', () => {
    expect(EMPTY_DRAFT.published).not.toBe(EMPTY_DRAFT.for_sale);
  });

  it("le formulaire DÉCLARE toujours `for_sale` : il ne s'en remet jamais au DEFAULT SQL", () => {
    // Le `DEFAULT true` de la colonne reste intact et répond à une AUTRE
    // question : « que vaut ce champ pour un appelant qui l'omet ? ». Ce
    // formulaire n'est jamais cet appelant-là.
    expect(Object.keys(payloadFromDraft(EMPTY_DRAFT))).toContain('for_sale');
    expect(payloadFromDraft(EMPTY_DRAFT).for_sale).toBe(false);
  });
});

describe('DETTE 6c — `startEdit` reflète l’état RÉEL du produit', () => {
  it('un produit en vente ouvre le formulaire avec la case cochée', () => {
    expect(draftFromProduct(produit({ for_sale: true })).for_sale).toBe(true);
  });

  it('un produit retiré de la vente ouvre le formulaire avec la case décochée', () => {
    expect(draftFromProduct(produit({ for_sale: false })).for_sale).toBe(false);
  });

  it("l'état initial de création ne CONTAMINE jamais l'édition d'un produit vendable", () => {
    // Le piège exact de cette dette : `EMPTY_DRAFT.for_sale` passe à false,
    // et l'édition d'un produit en vente le dévend en silence à la première
    // sauvegarde. `draftFromProduct` ne lit que le produit.
    const d = draftFromProduct(produit({ for_sale: true }));
    expect(payloadFromDraft(d).for_sale).toBe(true);
  });

  it('champ ABSENT de la lecture -> true : l’inconnu ne dévend jamais en silence', () => {
    const partiel = { ...produit() } as Record<string, unknown>;
    delete partiel.for_sale;
    expect(draftFromProduct(partiel as unknown as EditableProduct).for_sale).toBe(true);
  });

  it('`published` est relu tel quel, indépendamment de `for_sale`', () => {
    expect(draftFromProduct(produit({ published: false, for_sale: true })).published).toBe(false);
    expect(draftFromProduct(produit({ published: true, for_sale: false })).published).toBe(true);
  });
});

describe('DETTE 6c — cocher / décocher puis enregistrer', () => {
  it('DÉCOCHER puis enregistrer envoie `for_sale: false`', () => {
    const ouvert = draftFromProduct(produit({ for_sale: true }));
    const apresClic = coche(ouvert, 'for_sale', false);
    expect(payloadFromDraft(apresClic).for_sale).toBe(false);
  });

  it('COCHER puis enregistrer envoie `for_sale: true`', () => {
    const ouvert = draftFromProduct(produit({ for_sale: false }));
    const apresClic = coche(ouvert, 'for_sale', true);
    expect(payloadFromDraft(apresClic).for_sale).toBe(true);
  });

  it('à la création, cocher la case suffit à rendre le produit vendable', () => {
    expect(payloadFromDraft(coche(EMPTY_DRAFT, 'for_sale', true)).for_sale).toBe(true);
  });

  it('décocher `for_sale` ne touche PAS `published`, et réciproquement — les 4 combinaisons', () => {
    for (const published of [true, false]) {
      for (const for_sale of [true, false]) {
        const p = payloadFromDraft({ ...EMPTY_DRAFT, published, for_sale });
        expect(p.published, `published=${published} for_sale=${for_sale}`).toBe(published);
        expect(p.for_sale, `published=${published} for_sale=${for_sale}`).toBe(for_sale);
      }
    }
  });

  it('ÉTAPE 7 — non-régression : la charge ne transporte toujours AUCUN stock', () => {
    expect(Object.keys(payloadFromDraft(EMPTY_DRAFT))).not.toContain('stock');
    expect(Object.keys(payloadFromDraft(draftFromProduct(produit())))).not.toContain('stock');
  });

  it('la charge reste exactement celle attendue — aucun champ ajouté au passage', () => {
    expect(Object.keys(payloadFromDraft(EMPTY_DRAFT)).sort()).toEqual(
      ['currency', 'description', 'for_sale', 'images', 'name', 'price', 'published']
    );
  });
});

describe('DETTE 6c — le composant utilise réellement ces décisions', () => {
  // Sans ces trois constats, les tests ci-dessus verrouilleraient un module
  // que plus personne n'appelle : l'extraction doit rester branchée.
  it('`ProductManager` importe le module, et ne recompose rien à la main', () => {
    expect(PM_CODE).toMatch(/import \{[^}]*EMPTY_DRAFT[^}]*\} from '\.\/productDraft'/);
    expect(PM_CODE).toMatch(/setDraft\(draftFromProduct\(p\)\)/);
    expect(PM_CODE).toMatch(/const payload = payloadFromDraft\(draft\)/);
  });

  it('le formulaire de création et le `resetForm` partent du MÊME état initial', () => {
    expect(PM_CODE).toMatch(/useState<ProductDraft>\(EMPTY_DRAFT\)/);
    expect(PM_CODE).toMatch(/setDraft\(EMPTY_DRAFT\)/);
  });

  it('la case « en vente » est bien reliée à `draft.for_sale`', () => {
    expect(PM_CODE).toMatch(/checked=\{draft\.for_sale\}/);
    expect(PM_CODE).toMatch(/for_sale: e\.target\.checked/);
  });

  // STRUCTUREL, ET ASSUMÉ COMME TEL. Le badge vit dans la liste, qui n'est
  // peuplée que par un `useEffect` — non exécuté sans jsdom. Ce que ce test
  // peut prouver : la comparaison est STRICTE (`=== false`) et ne dépend pas
  // de `published`. Ce qu'il ne prouve pas : le rendu réel.
  it('le badge « pas en vente » suit `for_sale === false`, strictement, et jamais `published`', () => {
    const ligne = PM_CODE.split('\n').find((l) => l.includes('pm.notForSale'))!;
    expect(ligne, 'badge introuvable').toBeDefined();
    expect(ligne).toMatch(/p\.for_sale === false/);
    expect(ligne).not.toMatch(/!p\.for_sale/);
    expect(ligne).not.toMatch(/published/);
  });
});
