import { describe, it, expect } from 'vitest';
import { getLlmsTxtLabels, LLMS_TXT_LABEL_CODES, type LlmsTxtLabels } from '../llmsTxtLabels';
import { SUPPORTED_LANGUAGE_CODES } from '../supportedLanguages';
import { getDict } from '@/app/sites/[slug]/themes/i18n';
import { getCartLabels, CART_LABEL_CODES } from '@/app/sites/[slug]/themes/cartLabels';

// ============================================================
// CHANTIER 8 (MODE 1) — TROIS DICTIONNAIRES, UNE SEULE RÈGLE.
//
// Le dépôt portait TROIS fonctions décidant de la langue d'une même page,
// et elles ne disaient pas la même chose. `getDict` normalisait, pas
// `getCartLabels` ; l'un retombait sur l'anglais, l'autre sur le français ;
// `llms.txt` n'avait pas de dictionnaire du tout. Ces tests exigent
// désormais UNE règle, vérifiée sur les trois.
// ============================================================

const CLES: (keyof LlmsTxtLabels)[] = [
  'about', 'sectionFallback', 'products', 'mission', 'vision', 'whyUs',
  'faq', 'areaServed', 'contact', 'phone', 'email', 'address',
  'website', 'lastUpdated', 'generatedBy',
];

describe('CHANTIER 8 — 🔒 CLIQUET : les trois dictionnaires couvrent le MÊME contrat', () => {
  it('llms.txt couvre exactement les langues supportées, ni plus ni moins', () => {
    expect([...LLMS_TXT_LABEL_CODES].sort()).toEqual([...SUPPORTED_LANGUAGE_CODES].sort());
  });

  it('le panier couvre exactement les langues supportées', () => {
    expect([...CART_LABEL_CODES].sort()).toEqual([...SUPPORTED_LANGUAGE_CODES].sort());
  });

  it('🔴 une langue non supportée n’a de dictionnaire NULLE PART', () => {
    // Traduire `llms.txt` en portugais devant une page que `getDict` ne sait
    // pas servir produirait un fichier plus traduit que le site.
    for (const code of ['pt', 'de', 'it', 'nl', 'zh']) {
      expect(LLMS_TXT_LABEL_CODES, code).not.toContain(code);
      expect(CART_LABEL_CODES, code).not.toContain(code);
      expect(getDict(code)).toBe(getDict('en'));
    }
  });
});

describe('CHANTIER 8 — llms.txt : chaque langue est réellement traduite', () => {
  for (const code of SUPPORTED_LANGUAGE_CODES) {
    it(`« ${code} » : les 16 intitulés existent et ne sont pas vides`, () => {
      const t = getLlmsTxtLabels(code);
      for (const cle of CLES) {
        expect(typeof t[cle], `${code}.${cle}`).toBe('string');
        expect(t[cle].trim(), `${code}.${cle}`).not.toBe('');
      }
    });
  }

  it('🔴 les quatre langues produisent quatre dictionnaires DISTINCTS', () => {
    const vus = new Set(SUPPORTED_LANGUAGE_CODES.map((c) => JSON.stringify(getLlmsTxtLabels(c))));
    expect(vus.size).toBe(4);
  });

  it('🔴 aucun intitulé français ne subsiste dans les trois autres langues', () => {
    // Le défaut d'origine : « Questions fréquentes » servi à un site anglais.
    const fr = getLlmsTxtLabels('fr');
    for (const code of ['en', 'es', 'ar']) {
      const t = getLlmsTxtLabels(code);
      const identiques = CLES.filter((c) => t[c] === fr[c]);
      // Trois intitulés s'écrivent à l'identique en français et en anglais —
      // « Services », « Contact », « Email ». Ce sont les mêmes mots, pas un
      // oubli de traduction, et ils diffèrent bien en espagnol
      // (« Servicios », « Contacto », « Correo electrónico ») et en arabe.
      const MEMES_MOTS = ['sectionFallback', 'contact', 'email'];
      expect(identiques.every((c) => MEMES_MOTS.includes(c)), `${code} : ${identiques}`).toBe(true);
      if (code !== 'en') {
        expect(identiques, `${code} : aucun mot ne devrait coïncider`).toEqual([]);
      }
    }
  });

  it('le repli anglais s’applique à l’inconnu, au vide et au non-texte', () => {
    for (const v of [undefined, null, '', 'de', 'zz', 42, {}, []]) {
      expect(getLlmsTxtLabels(v), String(v)).toBe(getLlmsTxtLabels('en'));
    }
  });

  it('la normalisation suit getDict : casse et variante régionale', () => {
    expect(getLlmsTxtLabels('FR')).toBe(getLlmsTxtLabels('fr'));
    expect(getLlmsTxtLabels('fr-FR')).toBe(getLlmsTxtLabels('fr'));
    expect(getLlmsTxtLabels('es-MX')).toBe(getLlmsTxtLabels('es'));
  });
});

describe('CHANTIER 8 — le panier dit désormais la MÊME chose que la page', () => {
  it('chaque langue supportée a ses propres libellés', () => {
    const vus = new Set(SUPPORTED_LANGUAGE_CODES.map((c) => JSON.stringify(getCartLabels(c))));
    expect(vus.size).toBe(4);
  });

  it('🔴 L’ASYMÉTRIE CORRIGÉE : une variante régionale ne sépare plus le panier de la page', () => {
    // Avant : `getDict('fr-FR')` rendait le FRANÇAIS (il normalise) et
    // `getCartLabels('fr-FR')` retombait sur l'ANGLAIS. Même page, même
    // instant, deux langues.
    for (const v of ['fr-FR', 'FR', 'Fr', 'fr_CA']) {
      expect(getCartLabels(v), v).toBe(getCartLabels('fr'));
      expect(getDict(v), v).toBe(getDict('fr'));
    }
  });

  it('🔴 L’ASYMÉTRIE CORRIGÉE : le repli est le même des deux côtés', () => {
    // Avant : `lang` absent donnait une page ANGLAISE et un panier FRANÇAIS.
    for (const v of [undefined, null, '', 'de', 'zz', 42]) {
      expect(getCartLabels(v), String(v)).toBe(getCartLabels('en'));
      expect(getDict(typeof v === 'string' ? v : undefined), String(v)).toBe(getDict('en'));
    }
  });

  it('🔴 les trois fonctions répondent la MÊME langue pour toute entrée', () => {
    // Le vrai invariant du chantier : trois surfaces, une seule décision.
    const memeReponse = (v: unknown, attendu: string) => {
      expect(getDict(typeof v === 'string' ? v : undefined), `dict/${String(v)}`).toBe(getDict(attendu));
      expect(getCartLabels(v), `cart/${String(v)}`).toBe(getCartLabels(attendu));
      expect(getLlmsTxtLabels(v), `llms/${String(v)}`).toBe(getLlmsTxtLabels(attendu));
    };
    for (const [entree, attendu] of [
      ['fr', 'fr'], ['en', 'en'], ['es', 'es'], ['ar', 'ar'],
      ['fr-FR', 'fr'], ['ES', 'es'], ['ar-MA', 'ar'],
      ['de', 'en'], ['zz', 'en'], ['', 'en'],
    ] as const) {
      memeReponse(entree, attendu);
    }
    for (const v of [undefined, null, 42, {}]) memeReponse(v, 'en');
  });
});
