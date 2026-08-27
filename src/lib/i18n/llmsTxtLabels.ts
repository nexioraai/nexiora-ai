// ============================================================
// CHANTIER 8 (MODE 1) -- LES INTITULES DE `llms.txt`.
//
// LE DEFAUT, MESURE SUR LE SITE REEL. `llms.txt` composait ONZE intitules
// EN DUR EN FRANCAIS -- « ## A propos », « ## Questions frequentes »,
// « ## Pourquoi nous choisir », « - Telephone : »... -- quelle que soit la
// langue du site. Sur yiaglobalcommodities.com (`lang = 'en'`, contenu
// integralement anglais), le fichier servi aux crawlers LLM encadrait donc
// du texte anglais de titres francais. Le fichier existe precisement pour
// etre lu par des machines qui en tirent une comprehension du commerce :
// lui faire annoncer une langue que le contenu ne parle pas est une erreur
// de fond, pas de presentation.
//
// MEME CONTRAT DE LANGUES QUE TOUT LE RESTE. Ce dictionnaire est indexe par
// les codes de `SUPPORTED_LANGUAGES` (chantier 3), et un test l'exige :
// aucune langue de plus, aucune de moins. Ajouter ici une langue que
// `getDict` ne sert pas produirait un `llms.txt` traduit devant une page qui
// ne l'est pas.
//
// MEME REGLE DE REPLI QUE `getDict`. `slice(0, 2).toLowerCase()` puis repli
// anglais : c'est la seule autorite de ce que la page rend reellement, et le
// fichier doit decrire la page, pas diverger d'elle.
// ============================================================

import { SUPPORTED_LANGUAGE_CODES } from './supportedLanguages';

export type LlmsTxtLabels = {
  about: string;
  /** Repli quand une section n'a pas de nom -- le site en impose un sinon. */
  sectionFallback: string;
  products: string;
  mission: string;
  vision: string;
  whyUs: string;
  faq: string;
  areaServed: string;
  /**
   * DEBT-035 -- `price_range` etait emis en JSON-LD (`priceRange`) et ABSENT
   * de ce fichier. Le chantier 5 a rendu les deux champs de profil editables
   * ensemble et n'en a publie qu'un dans le fichier destine aux crawlers LLM.
   */
  priceRange: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  lastUpdated: string;
  generatedBy: string;
};

const en: LlmsTxtLabels = {
  about: 'About',
  sectionFallback: 'Services',
  products: 'Products',
  mission: 'Our mission',
  vision: 'Our vision',
  whyUs: 'Why choose us',
  faq: 'Frequently asked questions',
  areaServed: 'Area served',
  priceRange: 'Price range',
  contact: 'Contact',
  phone: 'Phone',
  email: 'Email',
  address: 'Address',
  website: 'Website',
  lastUpdated: 'Last updated',
  generatedBy: 'Site generated and hosted by Deribfy',
};

const fr: LlmsTxtLabels = {
  about: 'À propos',
  sectionFallback: 'Services',
  products: 'Produits',
  mission: 'Notre mission',
  vision: 'Notre vision',
  whyUs: 'Pourquoi nous choisir',
  faq: 'Questions fréquentes',
  areaServed: 'Zone desservie',
  priceRange: 'Gamme de prix',
  contact: 'Contact',
  phone: 'Téléphone',
  email: 'Email',
  address: 'Adresse',
  website: 'Site web',
  lastUpdated: 'Dernière mise à jour',
  generatedBy: 'Site généré et hébergé par Deribfy',
};

const es: LlmsTxtLabels = {
  about: 'Acerca de',
  sectionFallback: 'Servicios',
  products: 'Productos',
  mission: 'Nuestra misión',
  vision: 'Nuestra visión',
  whyUs: 'Por qué elegirnos',
  faq: 'Preguntas frecuentes',
  areaServed: 'Zona de servicio',
  priceRange: 'Rango de precios',
  contact: 'Contacto',
  phone: 'Teléfono',
  email: 'Correo electrónico',
  address: 'Dirección',
  website: 'Sitio web',
  lastUpdated: 'Última actualización',
  generatedBy: 'Sitio generado y alojado por Deribfy',
};

const ar: LlmsTxtLabels = {
  about: 'نبذة عنا',
  sectionFallback: 'الخدمات',
  products: 'المنتجات',
  mission: 'مهمتنا',
  vision: 'رؤيتنا',
  whyUs: 'لماذا تختارنا',
  faq: 'الأسئلة الشائعة',
  areaServed: 'منطقة الخدمة',
  priceRange: 'نطاق الأسعار',
  contact: 'اتصل بنا',
  phone: 'الهاتف',
  email: 'البريد الإلكتروني',
  address: 'العنوان',
  website: 'الموقع الإلكتروني',
  lastUpdated: 'آخر تحديث',
  generatedBy: 'موقع تم إنشاؤه واستضافته بواسطة Deribfy',
};

const LABELS: Record<string, LlmsTxtLabels> = { en, fr, es, ar };

/** Expose pour le cliquet : le dictionnaire ne doit couvrir que le contrat. */
export const LLMS_TXT_LABEL_CODES: readonly string[] = Object.keys(LABELS);

export function getLlmsTxtLabels(lang?: unknown): LlmsTxtLabels {
  const code = (typeof lang === 'string' ? lang : 'en').slice(0, 2).toLowerCase();
  return LABELS[code] || en;
}

// Verrou de construction : si un code du contrat n'a pas de dictionnaire, le
// module ne se charge pas -- plutot qu'un site servi a moitie traduit.
for (const code of SUPPORTED_LANGUAGE_CODES) {
  if (!LABELS[code]) {
    throw new Error(`llmsTxtLabels : aucun dictionnaire pour la langue supportee "${code}"`);
  }
}
