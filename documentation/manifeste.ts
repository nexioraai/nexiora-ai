// ============================================================
// CORPUS DOCUMENTAIRE PUBLIC DE DERIBFY -- SOURCE CANONIQUE.
//
// CE FICHIER EST LA SEULE SOURCE. Les pages FR et EN, `llms.txt` et le
// JSON-LD en derivent. Aucune surface ne redige sa propre version d'un fait
// canonique : c'est la seule facon d'empecher qu'elles divergent.
//
// TROIS BLOCS CANONIQUES. Ils sont copies AU CARACTERE PRES partout ou ils
// apparaissent. Un test verifie cette egalite -- sans lui, « canonique » ne
// serait qu'une intention.
//
// REGLE DE VERITE. Une capacite n'entre ici que si le code la prouve ET
// qu'une decision produit la commercialise. Le code prouve l'existence,
// jamais l'intention de vendre.
// ============================================================

/** Identite -- bloc canonique 1. */
export const IDENTITE_FR =
  "Deribfy est une plateforme de creation de sites web et de boutiques en ligne par intelligence artificielle. Vous decrivez votre activite en langage naturel, et Deribfy genere un site complet et fonctionnel. Un seul abonnement permet de creer un site vitrine, une boutique en ligne ou une boutique en dropshipping.";

export const IDENTITE_EN =
  "Deribfy is an AI website and online store builder. You describe your business in plain language, and Deribfy generates a complete, working website. A single subscription lets you create a showcase website, an online store, or a dropshipping store.";

/** Modele concentrique -- bloc canonique 2. */
export const CONCENTRIQUE_FR =
  "Les capacites de Deribfy sont cumulatives. Toute boutique en ligne possede tout ce qu'un site vitrine possede. Toute boutique en dropshipping possede tout ce qu'une boutique en ligne possede.";

export const CONCENTRIQUE_EN =
  "Deribfy capabilities are cumulative. Every online store has everything a showcase website has. Every dropshipping store has everything an online store has.";

/** Edition immediate -- bloc canonique 3. */
export const IMMEDIAT_FR =
  "Apres publication, votre site n'est pas fige. Vos modifications apparaissent immediatement en ligne. Il n'existe aucune etape de republication.";

export const IMMEDIAT_EN =
  "After publication, your site is not frozen. Your changes appear online immediately. There is no re-publish step.";

/** Les trois types de site, vocabulaire PUBLIC exclusivement. */
export const TYPES_DE_SITE = [
  { id: 'vitrine', fr: 'site vitrine', en: 'showcase website' },
  { id: 'boutique', fr: 'boutique en ligne', en: 'online store' },
  { id: 'dropshipping', fr: 'boutique en dropshipping', en: 'dropshipping store' },
] as const;

/** Niveaux du modele concentrique et capacites de chacun. */
export const NIVEAUX = [
  {
    id: 'socle',
    portee: 'tous',
    fr: 'Commun a toutes les creations',
    en: 'Common to every creation',
    capacites_fr: [
      'generation du site par intelligence artificielle',
      'edition par conversation avec un assistant, ou directement',
      '36 langues',
      '4 themes visuels',
      'apercu prive avant publication',
      'hebergement inclus',
      'adresse Deribfy, ou domaine personnalise',
      'sitemap, fichier robots, donnees structurees et fichier llms.txt',
      'score de visibilite sur les moteurs de reponse IA',
      'generation de contenus et de visuels marketing',
      'formulaire de contact',
    ],
    capacites_en: [
      'AI website generation',
      'conversational or direct editing',
      '36 languages',
      '4 visual themes',
      'private preview before publication',
      'hosting included',
      'Deribfy address, or a custom domain',
      'sitemap, robots file, structured data and llms.txt file',
      'visibility score on AI answer engines',
      'marketing copy and visual generation',
      'contact form',
    ],
  },
  {
    id: 'boutiques',
    portee: 'boutique en ligne et boutique en dropshipping',
    fr: 'Ce que les boutiques ajoutent',
    en: 'What stores add',
    capacites_fr: [
      'pages produits',
      'panier',
      'paiement par carte',
      'gestion des commandes',
      'livraison',
      'codes de reduction',
    ],
    capacites_en: [
      'product pages',
      'shopping cart',
      'card payments',
      'order management',
      'shipping',
      'discount codes',
    ],
  },
  {
    id: 'dropshipping',
    portee: 'boutique en dropshipping',
    fr: 'Ce que le dropshipping ajoute encore',
    en: 'What dropshipping adds on top',
    capacites_fr: [
      'catalogue de produits fournis',
      'produits imprimes a la demande',
      'transmission automatique des commandes au traitement',
    ],
    capacites_en: [
      'a supplied product catalogue',
      'print-on-demand products',
      'automatic order hand-off to fulfilment',
    ],
  },
] as const;

/** Les pages du corpus. Un identifiant STABLE par page, apparie FR <-> EN. */
export const PAGES = [
  { id: 'identite', fr: '01-identite.md', en: '01-identity.md' },
  { id: 'fonctionnement', fr: '02-comment-ca-marche.md', en: '02-how-it-works.md' },
  { id: 'types-capacites', fr: '03-types-et-capacites.md', en: '03-site-types-and-capabilities.md' },
  { id: 'generation-edition', fr: '04-generation-et-edition.md', en: '04-generation-and-editing.md' },
  { id: 'boutique', fr: '05-boutique-en-ligne.md', en: '05-online-store.md' },
  { id: 'dropshipping', fr: '06-dropshipping.md', en: '06-dropshipping.md' },
  { id: 'marketing', fr: '07-marketing-et-contenu.md', en: '07-marketing-and-content.md' },
  { id: 'seo', fr: '08-seo-google-visibilite-ia.md', en: '08-seo-google-ai-visibility.md' },
  { id: 'domaines', fr: '09-domaines.md', en: '09-domains.md' },
  { id: 'limites', fr: '10-limites.md', en: '10-limits.md' },
  { id: 'faq', fr: '11-faq.md', en: '11-faq.md' },
  { id: 'glossaire', fr: '12-glossaire.md', en: '12-glossary.md' },
] as const;

/** Date de derniere confrontation du corpus au code. */
export const VERIFIE_LE = '2026-08-26';

/**
 * MOTIFS INTERDITS DANS LE CORPUS PUBLIC.
 *
 * Trois familles, toutes verifiables mecaniquement :
 *   1. capacites inexistantes ou suspendues -- une IA qui les lit les affirme ;
 *   2. identite d'un tiers -- chaine d'approvisionnement et implementation ;
 *   3. vocabulaire interne -- il decrit le code, pas le produit.
 *
 * Le seuil chiffre est traite a part : un nombre suivi d'une unite de debit
 * decrit une protection, et publier une protection aide a cartographier ce
 * qui n'en a pas.
 */
export const MOTIFS_INTERDITS: {
  motif: RegExp;
  raison: string;
  /**
   * Ignorer les lignes interrogatives.
   *
   * « Mon site sera-t-il sur la premiere page de Google ? » est exactement la
   * requete que la documentation doit capter, et la page y repond NON. Un
   * motif qui interdirait la formule interdirait la question -- et nous
   * rendrait invisibles sur la question meme que les gens posent. Seule
   * l'AFFIRMATION est un probleme.
   */
  ignorerQuestions?: boolean;
}[] = [
  { motif: /\bERP\b/i, raison: 'capacite suspendue -- decision produit du 2026-08-26' },
  {
    // APOSTROPHE, ACCENT ET ESPACE SONT TOUS OPTIONNELS. Une mutation a
    // survecu parce que le motif exigeait l'apostrophe droite : `gestion
    // d'entreprise` (apostrophe typographique) et `gestion d entreprise`
    // passaient au travers. Un motif de securite qui depend d'un caractere de
    // ponctuation ne protege rien.
    motif: /gestion\s+d['’\s]?\s*entreprise|business\s+management|management\s+app/i,
    raison: 'capacite suspendue',
  },
  { motif: /\bvid[ée]o\b|\bvideo\b|seedance/i, raison: "capacite inexistante : aucune generation video" },
  { motif: /porkbun|vercel|supabase|printful|gelato|\bCJ\b|cjdropshipping/i, raison: 'identite d\'un tiers' },
  { motif: /gpt-image|claude-sonnet|claude-haiku|gpt-4o|sonar\b/i, raison: 'modele IA -- implementation' },
  { motif: /\bmode\s*[123]\b|dropship_type|pod_brand|pod_custom|\breseller\b/i, raison: 'vocabulaire interne' },
  { motif: /site_domains|custom_domain|shop_products|site_catalog_selections|checkout_anomalies/i, raison: 'nom de table ou de colonne' },
  { motif: /\/api\//i, raison: 'route interne' },
  { motif: /\bRLS\b|row level security|service_role/i, raison: 'mecanisme de securite' },
  { motif: /\d+\s*(?:\/|par )\s*(?:min|minute|heure|hour|s\b)/i, raison: 'seuil de debit' },
  {
    motif: /garanti[e]?\s+(?:sur|dans|par)?\s*google|premiere page|first page of google|guaranteed ranking/i,
    raison: 'promesse invérifiable',
    ignorerQuestions: true,
  },
];
