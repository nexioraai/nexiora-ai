import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getCartLabels, CART_LABEL_CODES } from '../cartLabels';
import { resolveShopCurrency } from '../shopCurrency';
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/i18n/supportedLanguages';

// ============================================================
// M2-03 / M2-04 — LE PIED DU PANIER ET LA BANNIERE PARLENT ENFIN LA LANGUE
// DU SITE, ET SA DEVISE.
//
// LE DEFAUT MESURE. Quatre litteraux francais en dur dans `CartDrawer`
// (`Livraison`, `Gratuite`, `Appliquer`, `Code appliqué`) et trois dans
// `PromoBanner` (`avec le code`, et le `$` de `-20$` et `(min. 50$)`) -- sur
// des surfaces PUBLIQUES, a deux lignes de `labels.promoPlaceholder`, traduit.
// `shipping`/`shippingFree` sont EXCLUSIVEMENT Mode 2 : ils ne sont rendus que
// sous `billsFlatShipping`, et `FLAT_SHIPPING_MODES` vaut {2}.
//
// LA DEVISE EST LE POINT SERIEUX, et ce n'est pas de la traduction : « min.
// 50$ » sur une boutique en euros est FAUX. La banniere est montee hors de
// `CartProvider` et s'affiche avant tout ajout au panier : elle ne pouvait
// pas tenir la devise de `useCart()`, qui la derive du premier article.
//
// PERIMETRE : `Pays de livraison` (meme fichier) est sous
// `requiresShippingQuote`, donc Mode 3 seul. Il est CONSIGNE, pas corrige.
// ============================================================

const RACINE = join(__dirname, '../../../../../..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

// ------------------------------------------------------------
describe('M2-04 — `resolveShopCurrency` : veridique ou rien', () => {
  it('devise unanime -> cette devise', () => {
    expect(resolveShopCurrency([{ currency: 'EUR' }, { currency: 'EUR' }])).toBe('EUR');
  });

  it('normalise la casse et les espaces, comme ProductManager', () => {
    expect(resolveShopCurrency([{ currency: ' eur ' }, { currency: 'EUR' }])).toBe('EUR');
  });

  it('🔴 devises DIVERGENTES -> `undefined`, jamais un choix arbitraire', () => {
    // Rien n'interdit structurellement la divergence : chaque ligne de
    // `shop_products` porte sa devise, il n'existe aucune colonne de site.
    expect(resolveShopCurrency([{ currency: 'EUR' }, { currency: 'CAD' }])).toBeUndefined();
  });

  it('aucun produit, aucune devise, entree invalide -> `undefined`', () => {
    expect(resolveShopCurrency([])).toBeUndefined();
    expect(resolveShopCurrency(null)).toBeUndefined();
    expect(resolveShopCurrency(undefined)).toBeUndefined();
    expect(resolveShopCurrency([{ currency: null }, { currency: '' }])).toBeUndefined();
    expect(resolveShopCurrency([{} as never])).toBeUndefined();
  });

  it('ignore les devises absentes mais garde l’unanimite des presentes', () => {
    expect(resolveShopCurrency([{ currency: 'CAD' }, { currency: null }])).toBe('CAD');
  });

  it('🔴 le module est PUR — aucune dependance, donc aucun mock', () => {
    expect(sansCommentaires(lire('src/app/sites/[slug]/themes/shopCurrency.ts')))
      .not.toMatch(/^\s*import\s/m);
  });
});

// ------------------------------------------------------------
describe('M2-03 — les six libelles existent dans TOUTES les langues servies', () => {
  const NOUVEAUX = ['shipping', 'shippingFree', 'promoApply', 'promoApplied',
                    'promoBannerWithCode', 'promoBannerMin'] as const;

  it('le dictionnaire couvre exactement les langues du contrat', () => {
    expect([...CART_LABEL_CODES].sort()).toEqual([...SUPPORTED_LANGUAGE_CODES].sort());
  });

  for (const code of SUPPORTED_LANGUAGE_CODES) {
    it(`« ${code} » : les six libelles existent et ne sont pas vides`, () => {
      const l = getCartLabels(code) as unknown as Record<string, string>;
      for (const k of NOUVEAUX) {
        expect(typeof l[k], `${code}/${k}`).toBe('string');
        expect(l[k].trim().length, `${code}/${k}`).toBeGreaterThan(0);
      }
    });
  }

  it('🔴 aucun libelle francais ne subsiste dans les trois autres langues', () => {
    // `promoBannerMin` est EXCLU, et c'est mesure : « (min. {min}) » est
    // identique en francais et en anglais parce que l'abreviation l'est --
    // l'espagnol dit « (mín. …) » et l'arabe « (الحد الأدنى …) », tous deux
    // distincts. Une abreviation commune n'est pas un libelle non traduit, et
    // fabriquer une difference artificielle reviendrait a modifier le produit
    // pour satisfaire un test.
    const PORTEURS_DE_MOTS = NOUVEAUX.filter((k) => k !== 'promoBannerMin');
    const fr = getCartLabels('fr') as unknown as Record<string, string>;
    for (const code of SUPPORTED_LANGUAGE_CODES.filter((c) => c !== 'fr')) {
      const l = getCartLabels(code) as unknown as Record<string, string>;
      for (const k of PORTEURS_DE_MOTS) {
        expect(l[k], `${code}/${k} identique au francais`).not.toBe(fr[k]);
      }
    }
  });

  it('et `promoBannerMin` reste distinct la ou la langue le permet', () => {
    // Le controle n'est pas abandonne, il est deplace ou il a un sens.
    const fr = getCartLabels('fr') as unknown as Record<string, string>;
    for (const code of ['es', 'ar']) {
      const l = getCartLabels(code) as unknown as Record<string, string>;
      expect(l.promoBannerMin, code).not.toBe(fr.promoBannerMin);
    }
  });

  it('les deux gabarits portent bien leurs emplacements', () => {
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      const l = getCartLabels(code) as unknown as Record<string, string>;
      expect(l.promoBannerWithCode, `${code}/discount`).toContain('{discount}');
      expect(l.promoBannerWithCode, `${code}/code`).toContain('{code}');
      expect(l.promoBannerMin, `${code}/min`).toContain('{min}');
    }
  });
});

// ------------------------------------------------------------
describe('M2-03 / M2-04 — 🔒 CLIQUET : plus aucun litteral sur ces surfaces', () => {
  const DRAWER = sansCommentaires(lire('src/app/sites/[slug]/themes/CartDrawer.tsx'));
  const BANNER = sansCommentaires(lire('src/app/sites/[slug]/themes/PromoBanner.tsx'));

  it('le pied Mode 2 du panier passe par les libelles', () => {
    expect(DRAWER).toContain('labels.shipping');
    expect(DRAWER).toContain('labels.shippingFree');
    expect(DRAWER).not.toMatch(/>Livraison</);
    expect(DRAWER).not.toContain("'Gratuite'");
  });

  it('le bloc promo du panier passe par les libelles', () => {
    expect(DRAWER).toContain('labels.promoApply');
    expect(DRAWER).toContain('labels.promoApplied');
    expect(DRAWER).not.toContain("'Appliquer'");
    expect(DRAWER).not.toContain('Code appliqué :');
  });

  it('🔴 la banniere n’ecrit plus aucune devise en dur', () => {
    // Le defaut n'etait pas cosmetique : un montant faux etait publie.
    expect(BANNER).not.toMatch(/\$`/);
    expect(BANNER).not.toContain('avec le code');
    expect(BANNER).toContain('labels.promoBannerWithCode');
    expect(BANNER).toContain('labels.promoBannerMin');
  });

  it('la banniere recoit langue ET devise RESOLUES de ses appelants', () => {
    // Verifier la seule PRESENCE du prop ne suffit pas : une mutation
    // `currency={undefined}` a survecu a une premiere version de ce test.
    // On exige donc que l'AUTORITE soit appelee, pas qu'un attribut existe.
    for (const p of ['src/app/sites/[slug]/page.tsx', 'src/app/preview/[slug]/page.tsx']) {
      const src = lire(p);
      const balise = src.match(/<PromoBanner\b[^>]*\/>/)![0];
      expect(balise, `${p} / labels`).toMatch(/\blabels=\{cartLabels\}/);
      expect(balise, `${p} / currency`).toMatch(/\bcurrency=\{resolveShopCurrency\(/);
      expect(src, `${p} importe l'autorite`).toContain('resolveShopCurrency');
    }
  });

  it('HORS PERIMETRE, consigne : `Pays de livraison` (Mode 3) reste en dur', () => {
    // Sous `requiresShippingQuote`, donc jamais rendu pour un Mode 2. Cette
    // assertion DOCUMENTE la frontiere du chantier : si quelqu'un le traduit,
    // ce test rougit et l'oubli devient une decision.
    expect(DRAWER).toContain('Pays de livraison');
  });
});
