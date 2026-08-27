import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SUPPORTED_LANGUAGES,
  SUPPORTED_LANGUAGE_CODES,
  isSupportedLanguage,
  ogLocaleFor,
} from '../supportedLanguages';
import { getDict } from '@/app/sites/[slug]/themes/i18n';
import { getCartLabels } from '@/app/sites/[slug]/themes/cartLabels';

// ============================================================
// CHANTIER 3 (MODE 1) — LE CONTRAT DES LANGUES SERVIES.
//
// La contrainte produit est explicite : ne jamais proposer au marchand une
// langue que le système ne sait pas servir. Ces tests ne vérifient donc PAS
// que la liste ressemble à quelque chose — ils vérifient que chaque code
// déclaré RÉSOUT vers un vrai dictionnaire, dans les deux dictionnaires que
// la vitrine utilise, et que les langues absentes tombent bien en repli.
// ============================================================

const RACINE = join(__dirname, '..', '..', '..', '..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf8');

describe('CHANTIER 3 — quatre langues, et seulement celles-là', () => {
  it('la liste déclarée est exactement fr, en, es, ar', () => {
    expect([...SUPPORTED_LANGUAGE_CODES].sort()).toEqual(['ar', 'en', 'es', 'fr']);
  });

  it('chaque langue porte un libellé, un drapeau et une locale Open Graph', () => {
    for (const l of SUPPORTED_LANGUAGES) {
      expect(l.label.trim(), l.code).not.toBe('');
      expect(l.flag.trim(), l.code).not.toBe('');
      expect(l.ogLocale, l.code).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
    }
  });

  it('aucun doublon de code ni de locale', () => {
    expect(new Set(SUPPORTED_LANGUAGE_CODES).size).toBe(SUPPORTED_LANGUAGES.length);
    expect(new Set(SUPPORTED_LANGUAGES.map((l) => l.ogLocale)).size).toBe(SUPPORTED_LANGUAGES.length);
  });
});

describe('CHANTIER 3 — 🔒 CLIQUET : chaque langue déclarée est RÉELLEMENT servie', () => {
  // `getDict` et `getCartLabels` retombent tous deux sur l'anglais. Une
  // langue manquante renverrait donc l'OBJET anglais lui-même : on compare
  // les RÉFÉRENCES, pas les valeurs — la seule façon de distinguer « es
  // existe » de « es est tombé en repli ».
  const replisDict = getDict('zz');
  const replisCart = getCartLabels('zz');

  for (const code of ['fr', 'es', 'ar']) {
    it(`« ${code} » possède un dictionnaire de thème distinct du repli anglais`, () => {
      expect(getDict(code)).not.toBe(replisDict);
    });
    it(`« ${code} » possède des libellés de panier distincts du repli anglais`, () => {
      expect(getCartLabels(code)).not.toBe(replisCart);
    });
  }

  it('« en » est servi, et c’est bien lui le repli', () => {
    expect(getDict('en')).toBe(replisDict);
    expect(getCartLabels('en')).toBe(replisCart);
  });

  it('🔴 pt, de et it — cités par AuroraTheme — ne sont PAS servis et ne sont pas offerts', () => {
    // `AuroraTheme.tsx:55` teste `site.lang === 'pt' | 'de' | 'it'` pour un
    // mot isolé. Aucun des trois n'a de dictionnaire : les offrir dans le
    // menu déroulant livrerait un site anglais avec un mot lusophone.
    for (const code of ['pt', 'de', 'it']) {
      expect(SUPPORTED_LANGUAGE_CODES, code).not.toContain(code);
      expect(getDict(code), code).toBe(replisDict);
    }
    expect(lire('src/app/sites/[slug]/themes/AuroraTheme.tsx')).toContain("'pt'");
  });
});

describe('CHANTIER 3 — porte d’ÉCRITURE : fail-closed et stricte', () => {
  it('chaque langue supportée est acceptée', () => {
    for (const code of SUPPORTED_LANGUAGE_CODES) expect(isSupportedLanguage(code), code).toBe(true);
  });

  it('🔴 toute valeur inconnue est refusée', () => {
    for (const v of ['de', 'pt', 'it', 'zz', 'english', 'français', '']) {
      expect(isSupportedLanguage(v), String(v)).toBe(false);
    }
  });

  it('🔴 les variantes d’un code supporté sont refusées à l’écriture', () => {
    // L'éditeur et l'agent émettent un code exact. Tolérer `FR` ou `fr-FR`
    // ferait entrer en base une forme que `getCartLabels` — qui, lui, ne
    // normalise pas — ne saurait pas relire.
    for (const v of ['FR', 'fr-FR', ' fr', 'fr ', 'Fr']) {
      expect(isSupportedLanguage(v), v).toBe(false);
    }
  });

  it('🔴 les non-chaînes sont refusées, jamais coercées', () => {
    for (const v of [null, undefined, 0, 1, {}, [], ['fr'], true, NaN]) {
      expect(isSupportedLanguage(v), String(v)).toBe(false);
    }
  });
});

describe('CHANTIER 3 — porte d’AFFICHAGE : og:locale suit ce que la page sert', () => {
  it('chaque langue supportée produit sa locale', () => {
    expect(ogLocaleFor('fr')).toBe('fr_FR');
    expect(ogLocaleFor('en')).toBe('en_US');
    expect(ogLocaleFor('es')).toBe('es_ES');
    expect(ogLocaleFor('ar')).toBe('ar_AR');
  });

  it('🔴 le cas YIA : contenu anglais, lang « en » → en_US, JAMAIS fr_FR', () => {
    expect(ogLocaleFor('en')).not.toBe('fr_FR');
  });

  it('l’affichage tolère ce que l’écriture refuse, et suit getDict', () => {
    // `getDict('fr-FR')` rend du français (il normalise) : annoncer `en_US`
    // décrirait faux. Les deux portes divergent VOLONTAIREMENT.
    expect(isSupportedLanguage('fr-FR')).toBe(false);
    expect(ogLocaleFor('fr-FR')).toBe('fr_FR');
    expect(ogLocaleFor('FR')).toBe('fr_FR');
  });

  it('inconnu, vide ou absent → en_US, comme getDict retombe sur l’anglais', () => {
    for (const v of [null, undefined, '', 'de', 'zz', 42, {}]) {
      expect(ogLocaleFor(v), String(v)).toBe('en_US');
      expect(getDict(typeof v === 'string' ? v : undefined)).toBe(getDict('en'));
    }
  });
});

describe('CHANTIER 3 — les cinq listes historiques concordent avec le contrat', () => {
  // Ce module ne réécrit aucune des cinq listes existantes ; il les surveille.
  // Si l'une d'elles gagne ou perd une langue, ce test le dit.
  const SOURCES: [string, string][] = [
    ['src/lib/translations/index.tsx', "export type Lang"],
    ['src/components/LanguageSwitcher.tsx', '<option value='],
    ['src/app/sites/[slug]/themes/i18n.ts', 'const DICTS'],
    ['src/app/sites/[slug]/themes/cartLabels.ts', 'const DICT'],
    ['src/app/api/chat/route.ts', "['fr','en','ar','es']"],
  ];

  for (const [fichier, ancre] of SOURCES) {
    it(`${fichier} déclare les quatre mêmes codes`, () => {
      const src = lire(fichier);
      expect(src, `ancre « ${ancre} » introuvable — le fichier a bougé`).toContain(ancre);
      for (const code of SUPPORTED_LANGUAGE_CODES) {
        expect(src.includes(`'${code}'`) || src.includes(`"${code}"`) || src.includes(`${code}:`) || src.includes(`value="${code}"`), `${code} absent`).toBe(true);
      }
    });
  }
});
