// ============================================================
// CHANTIER 3 (MODE 1) -- LE CONTRAT DES LANGUES REELLEMENT SERVIES.
//
// POURQUOI CE FICHIER EXISTE. La meme liste de quatre langues etait ecrite
// CINQ fois, dans cinq fichiers qui s'ignorent :
//   * `src/lib/translations/index.tsx:8`        type Lang = fr|en|ar|es  (tableau de bord)
//   * `src/components/LanguageSwitcher.tsx`     quatre <option>          (tableau de bord)
//   * `src/app/sites/[slug]/themes/i18n.ts`     DICTS { en, fr, es, ar } (vitrine)
//   * `src/app/sites/[slug]/themes/cartLabels.ts` DICT { fr, en, es, ar } (panier)
//   * `src/app/api/chat/route.ts:376`           ['fr','en','ar','es']    (generation)
// Elles concordent aujourd'hui -- par chance, pas par construction. Rien ne
// les tenait ensemble, et rien n'aurait signale une divergence.
//
// Ce module devient l'autorite unique du chemin d'ECRITURE de `sites.lang` :
// le selecteur de l'editeur et la validation de l'outil d'agent le lisent,
// tous les deux. Il n'impose rien aux cinq listes existantes -- il les
// SURVEILLE, par un test qui verifie que chaque code declare ici resout
// bien vers un vrai dictionnaire dans `i18n.ts` ET dans `cartLabels.ts`.
//
// LA CONTRAINTE PRODUIT QU'IL FAIT RESPECTER : ne jamais proposer au
// marchand une langue que le systeme ne sait pas servir. `AuroraTheme.tsx:55`
// mentionne `pt`, `de` et `it` -- aucun de ces trois n'a de dictionnaire.
// Les offrir dans un menu deroulant produirait un site a moitie traduit.
// ============================================================

export type SupportedLanguage = {
  /** Code ISO 639-1, tel qu'il est stocke dans `sites.lang`. */
  code: string;
  /** Nom de la langue DANS cette langue -- un marchand arabophone lit « العربية ». */
  label: string;
  flag: string;
  /**
   * Locale Open Graph. Facebook impose la forme `xx_XX` et n'accepte pas un
   * code nu : `og:locale` valait `'fr_FR'` EN DUR pour tous les sites avant
   * ce chantier, quelle que soit la langue du contenu.
   */
  ogLocale: string;
};

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  { code: 'fr', label: 'Français', flag: '🇫🇷', ogLocale: 'fr_FR' },
  { code: 'en', label: 'English', flag: '🇬🇧', ogLocale: 'en_US' },
  { code: 'es', label: 'Español', flag: '🇪🇸', ogLocale: 'es_ES' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦', ogLocale: 'ar_AR' },
] as const;

export const SUPPORTED_LANGUAGE_CODES: readonly string[] =
  SUPPORTED_LANGUAGES.map((l) => l.code);

/**
 * Allowlist positive, `Set.has`, jamais une negation -- meme forme que
 * `TRANSACTING_SITE_MODES` et `CATALOG_SITE_MODES`. Ecrire `lang !== 'xx'`
 * ferait de « supportee » l'etat par defaut de toute valeur inconnue.
 */
const CODES = new Set<unknown>(SUPPORTED_LANGUAGE_CODES);

/**
 * PORTE D'ECRITURE -- fail-closed et STRICTE. `'FR'`, `'fr-FR'`, `'  fr'`,
 * `null`, `undefined`, un nombre : tous refuses. Les deux seuls appelants
 * qui ecrivent (le menu deroulant de l'editeur et l'outil d'agent) emettent
 * un code exact issu de `SUPPORTED_LANGUAGES` ; tolerer des variantes ici
 * reviendrait a accepter, sans le voir, ce qu'un tiers a construit.
 */
export function isSupportedLanguage(value: unknown): boolean {
  return typeof value === 'string' && CODES.has(value);
}

/**
 * PORTE D'AFFICHAGE -- fail-open, et volontairement PLUS TOLERANTE que la
 * porte d'ecriture. Ce n'est pas une inconsistance : `og:locale` doit decrire
 * ce que la page SERT reellement, et ce que la page sert est decide par
 * `getDict()` (`i18n.ts:480`), qui normalise `slice(0, 2).toLowerCase()` puis
 * retombe sur l'anglais. On reproduit exactement cette regle, sinon une ligne
 * historique portant `'fr-FR'` afficherait du francais en annoncant `en_US`.
 */
export function ogLocaleFor(lang: unknown): string {
  const code = typeof lang === 'string' ? lang.slice(0, 2).toLowerCase() : '';
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.ogLocale ?? 'en_US';
}
