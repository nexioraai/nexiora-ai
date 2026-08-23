// src/lib/architecture/domainRegistry.ts
//
// Source de vérité des frontières de domaine du produit.
//
// Un "domaine" est une zone du code dont l'isolation vis-à-vis du reste du
// produit doit rester garantie dans le temps — indépendamment du nombre de
// modes, produits ou capacités que Deribfy compte aujourd'hui. Ce n'est PAS
// un registre "Mode 1 / Mode 2 / Mode 3" : c'est un registre de frontières.
// Un mode peut être un domaine, mais un domaine peut tout aussi bien être un
// composant partagé (ex. la navigation mobile), un pipeline (ex. DNS/Google),
// ou un futur produit qui n'a rien à voir avec la notion de "mode".
//
// Pour intégrer un nouveau domaine (Mode 4, un nouveau produit, une nouvelle
// capacité) : ajouter une entrée à DOMAIN_REGISTRY ci-dessous. Rien d'autre
// à modifier — le moteur de vérification (checkDomainBoundaries.ts) et la
// suite de tests générique (__tests__/domainBoundaries.test.ts) prennent
// automatiquement en charge toute nouvelle entrée via describe.each.

export type ForbiddenImportRule = {
  // Motif interdit dans le code source du domaine (regex sur une ligne).
  pattern: RegExp
  // Pourquoi ce motif est interdit — apparaît dans le message d'échec du
  // test, donc dans les logs CI, sans avoir à ouvrir ce fichier.
  reason: string
}

export type DomainDefinition = {
  id: string
  description: string
  // Chemins relatifs à la racine du repo. Liste explicite, pas de glob :
  // au nombre de fichiers concerné aujourd'hui (quelques fichiers par
  // domaine), un glob ajouterait une dépendance (fast-glob/glob) pour un
  // gain nul. À revoir si un domaine dépasse largement une dizaine de
  // fichiers.
  ownedFiles: string[]
  forbiddenPatterns: ForbiddenImportRule[]
  // Ligne(s) à exclure du scan — typiquement l'import légitime d'un
  // sous-composant du domaine qui, lui, a le droit d'utiliser les motifs
  // interdits (ex. l'import de la section Shop extraite).
  ignoreLinePattern?: RegExp
  // Documentation uniquement : quelles capacités (voir modeCapabilities.ts
  // ou équivalent futur) ce domaine expose. Ne pilote aucune vérification
  // automatique — le contrat comportemental de chaque capacité reste
  // vérifié par des tests écrits à la main (mode1-isolation.test.tsx, puis
  // mode2/mode3 plus tard), car ces invariants sont trop spécifiques par
  // domaine pour être généralisés sans perdre en lisibilité.
  capabilities?: string[]
  // Où trouver les tests de contrat comportemental de ce domaine.
  contractTestsPath?: string
}

// Partagé par les domaines "mode-1-theme-rendering-*" ci-dessous : même
// motif interdit, même raison métier, un seul endroit à faire évoluer si
// la règle change un jour. Ce n'est PAS un raccourci générique — chaque
// domaine reste une entrée distincte, avec son propre ownedFiles et sa
// propre identité dans les rapports (Bloc 4 : un thème = un domaine, pour
// qu'une régression identifie immédiatement LEQUEL est cassé, plutôt
// qu'une alerte générique regroupant les 4 thèmes).
const NO_CART_IN_MODE_1: ForbiddenImportRule[] = [
  { pattern: /\buseCart\s*\(/, reason: 'Mode 1 ne doit jamais dépendre du contexte panier (CartContext).' },
  { pattern: /\bAddToCartButton\b/, reason: 'Mode 1 ne doit jamais rendre un bouton d’ajout au panier.' },
  { pattern: /\bShippingEstimate\b/, reason: 'Mode 1 ne doit jamais afficher d’estimation de livraison (fonctionnalité e-commerce).' },
]
const IGNORE_SHOP_SECTION_IMPORT = /^import .*ShopSection/

// ============================================================
// SÉPARATION MODE 2 / MODE 3 — PHASE 0
// Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// Frontière : `mode` détermine le DOMAINE (qui exécute la commande) ;
// `dropship_type` est un détail INTERNE au domaine fournisseur et ne doit
// jamais servir à décider du domaine. Les deux domaines déclarés plus bas
// installent cette frontière AVANT toute modification de code produit —
// une violation future est donc détectée au moment où elle est écrite,
// pas après une régression.
//
// PORTÉE CROISSANTE, VOULUE : `ownedFiles` ne liste ici que les fichiers
// qui respectent DÉJÀ la règle sur le SHA de départ (13bec0e). Chaque phase
// du plan ajoute à ces listes le fichier qu'elle vient d'assainir — le
// registre devient ainsi le cliquet du chantier : un fichier admis ne peut
// plus régresser. Les fichiers encore fusionnés (F1 handlePaidCheckout,
// F3 resolveShipping, F5 catalog-stock) sont volontairement ABSENTS et
// rejoindront le domaine à leur phase respective (3, 5, 5).
//
// LIMITE CONNUE du moteur (checkDomainBoundaries) : la détection est une
// regex ligne à ligne, commentaires inclus. Écrire « dropship_type » dans
// un commentaire d'un fichier SHARED fera donc échouer la frontière. C'est
// le comportement déjà en vigueur pour les domaines Mode 1, conservé tel
// quel : ce fichier n'est pas modifié par ce chantier.
// ============================================================

/** SHARED = responsabilité réellement commune aux deux modes. Les quatre
 *  règles R1-R4 du plan, traduites en motifs vérifiables. R3 (signature
 *  étroite) est la règle décisive : un composant ne peut pas brancher sur
 *  une information qu'il ne reçoit jamais. */
const SHARED_MUST_STAY_NEUTRAL: ForbiddenImportRule[] = [
  // Le motif porte sur l'ACCÈS, pas sur le nom de la variable. Un premier
  // jet visait `site.mode` : un contrôle de mutation (phase 0) a prouvé
  // qu'il laissait passer `s.mode === 3`, la forme la plus probable après
  // une destructuration ou un renommage. C'est exactement le trou qu'un
  // garde structurel ne doit pas avoir.
  {
    pattern: /\.\s*mode\b/,
    reason:
      'R1 — un composant SHARED ne doit jamais lire le mode d’un site : une règle propre à un mode appartient à mode2/ ou mode3/, jamais au tronc commun.',
  },
  {
    pattern: /\bmode\s*(===|!==|==|!=)\s*[0-9]/,
    reason:
      'R1 — comparaison directe à un numéro de mode dans un composant SHARED. Le tronc commun ne connaît pas les modes.',
  },
  {
    pattern: /\.eq\(\s*['"]mode['"]/,
    reason:
      'R1 — lecture du mode en base depuis un composant SHARED. Après création de la commande, le domaine se lit sur la commande, jamais sur le site.',
  },
  // Ferme la dernière voie d'obtention : recevoir le mode en paramètre.
  // Volontairement limité à `number` — `mode: string` désigne le mode
  // d'arrondi (pricing.apply99), qui n'a aucun rapport avec les modes du
  // produit. Reste hors de portée : un paramètre délibérément renommé
  // (`m: number`), que le contrôle de mutation de la phase 0 a confirmé
  // indétectable par regex. Ce n'est pas un vecteur d'erreur accidentelle :
  // toutes les voies d'obtention non renommées sont couvertes ci-dessus.
  {
    pattern: /\bmode\s*\??\s*:\s*number/,
    reason:
      'R3 — un composant SHARED ne doit pas recevoir le mode en paramètre : le recevoir, c’est rendre le branchement possible. Passer la donnée déjà décidée par le domaine appelant.',
  },
  {
    pattern: /\bdropship_type\b/,
    reason:
      'R1 — `dropship_type` est un discriminant INTERNE au Mode 3. Le lire depuis SHARED reintroduit exactement la confusion mode/sous-type que ce chantier corrige.',
  },
  {
    pattern: /from ['"]@\/lib\/(cj|suppliers|dropship)\//,
    reason:
      'R2 — un composant SHARED ne doit dépendre d’aucun fournisseur : cette arête est le vecteur par lequel une commande Mode 2 atteignait CJ et Printful.',
  },
  {
    pattern: /\b(site|order):\s*(Site|ShopOrder|Order)\b/,
    reason:
      'R3 — une signature SHARED ne doit recevoir ni un site ni une commande complète : recevoir l’objet, c’est recevoir le mode, donc rendre le branchement possible. Passer des primitives ou un DTO étroit.',
  },
]

/** Le domaine fournisseur ne doit jamais dépendre du domaine marchand.
 *  L’arête inverse est couverte par le domaine `mode-2-*`, déclaré en
 *  phase 4 (le module n’existe pas encore). */
const MODE_3_MUST_NOT_DEPEND_ON_MODE_2: ForbiddenImportRule[] = [
  {
    pattern: /from ['"]@\/lib\/mode2/,
    reason:
      'Acyclicité des domaines — mode3/ ne doit jamais importer mode2/. Sans cette règle, une évolution Mode 2 pourrait modifier le comportement Mode 3.',
  },
]

export const DOMAIN_REGISTRY: DomainDefinition[] = [
  {
    id: 'mode-1-theme-rendering-editorial',
    description: "Thème Editorial — ne doit jamais embarquer le panier ni la logique Shop en dur en Mode 1.",
    ownedFiles: ['src/app/sites/[slug]/themes/EditorialTheme.tsx'],
    forbiddenPatterns: NO_CART_IN_MODE_1,
    ignoreLinePattern: IGNORE_SHOP_SECTION_IMPORT,
    capabilities: ['hasShop'],
    contractTestsPath: 'src/app/sites/[slug]/themes/__tests__/mode1-isolation.test.tsx',
  },
  {
    id: 'mode-1-theme-rendering-vif',
    description: "Thème Vif — ne doit jamais embarquer le panier ni la logique Shop en dur en Mode 1.",
    ownedFiles: ['src/app/sites/[slug]/themes/VifTheme.tsx'],
    forbiddenPatterns: NO_CART_IN_MODE_1,
    ignoreLinePattern: IGNORE_SHOP_SECTION_IMPORT,
    capabilities: ['hasShop'],
    contractTestsPath: 'src/app/sites/[slug]/themes/__tests__/mode1-isolation.test.tsx',
  },
  {
    id: 'mode-1-theme-rendering-noir',
    description: "Thème Noir — ne doit jamais embarquer le panier ni la logique Shop en dur en Mode 1 (Bloc 4).",
    ownedFiles: ['src/app/sites/[slug]/themes/NoirTheme.tsx'],
    forbiddenPatterns: NO_CART_IN_MODE_1,
    ignoreLinePattern: IGNORE_SHOP_SECTION_IMPORT,
    capabilities: ['hasShop'],
    contractTestsPath: 'src/app/sites/[slug]/themes/__tests__/noir-isolation.test.tsx',
  },
  {
    id: 'mode-1-theme-rendering-aurora',
    description: "Thème Aurora — ne doit jamais embarquer le panier ni la logique Shop en dur en Mode 1 (Bloc 4). Pas de section Shop extraite : la bascule catalogue (StorefrontDense) est déléguée à un fichier séparé, jamais présente dans ce fichier.",
    ownedFiles: ['src/app/sites/[slug]/themes/AuroraTheme.tsx'],
    forbiddenPatterns: NO_CART_IN_MODE_1,
    capabilities: ['hasShop'],
    contractTestsPath: 'src/app/sites/[slug]/themes/__tests__/aurora-isolation.test.tsx',
  },
  {
    id: 'mode-1-shared-navigation',
    description: "MobileNav — partagé par les 4 thèmes. Ne doit jamais coder en dur un accès au panier, uniquement passer par getModeCapabilities (bug trouvé et corrigé en Phase 1) : c'est le mécanisme exact par lequel un changement Mode 2/3 pourrait recasser silencieusement le Mode 1 de n'importe quel thème.",
    ownedFiles: ['src/app/sites/[slug]/themes/MobileNav.tsx'],
    forbiddenPatterns: NO_CART_IN_MODE_1,
    capabilities: ['hasShop'],
    contractTestsPath: 'src/app/sites/[slug]/themes/__tests__/mode1-isolation.test.tsx',
  },

  // ---- Séparation Mode 2 / Mode 3 (phase 0) ----
  {
    id: 'shared-commerce-core',
    description:
      'Tronc commun du commerce — responsabilités réellement partagées par Mode 2 et Mode 3 (stock, machine à états, prix, anomalies, mécanisme de paiement, e-mail acheteur, empreintes de panier, propriété du site). Ne doit brancher sur aucun mode, ne dépendre d’aucun fournisseur, et ne recevoir ni site ni commande complète. Fichiers encore fusionnés volontairement absents : handlePaidCheckout (phase 3), resolveShipping et catalog-stock (phase 5).',
    ownedFiles: [
      'src/lib/shop.ts',
      'src/lib/shop/orderStatusMachine.ts',
      'src/lib/shop/buyerNonce.ts',
      'src/lib/shop/quote/basketHash.ts',
      'src/lib/shop/quote/checkoutSignature.ts',
      'src/lib/pricing.ts',
      'src/lib/anomaly.ts',
      'src/lib/payments/stripe.ts',
      'src/lib/payments/index.ts',
      'src/lib/email/sendOrderConfirmationEmail.ts',
      'src/lib/auth/require-site-owner.ts',
    ],
    forbiddenPatterns: SHARED_MUST_STAY_NEUTRAL,
    contractTestsPath: 'src/lib/architecture/__tests__/mode2Mode3Boundaries.test.ts',
  },
  {
    id: 'order-domain-frontier',
    description:
      'Point de décision unique de la frontière (phase 1) — répond à « qui exécute cette vente ? » à partir du seul mode du site. C’est le SEUL module autorisé à connaître le mode pour en déduire un domaine ; en contrepartie il ne doit connaître ni sous-type, ni fournisseur, ni aucun des deux domaines. Une garde antérieure qui consultait `dropship_type` a modifié le comportement de pod_brand et pod_custom : cette entrée rend cette erreur détectable au moment où elle est écrite.',
    ownedFiles: ['src/lib/order-domain/resolve.ts'],
    forbiddenPatterns: [
      {
        pattern: /\bdropship_type\b/,
        reason:
          'La frontière est de niveau DOMAINE. Consulter le sous-type ici, c’est exactement l’erreur mesurée sur 13bec0e : elle n’apporte rien au Mode 2 et modifie le Mode 3.',
      },
      {
        pattern: /from ['"]@\/lib\/(cj|suppliers|dropship|mode2|mode3)/,
        reason:
          'Le point de décision ne doit dépendre d’aucun domaine ni d’aucun fournisseur : c’est ce qui le rend vérifiable d’un seul regard.',
      },
    ],
    contractTestsPath: 'src/lib/order-domain/__tests__/resolve.test.ts',
  },
  {
    id: 'mode-3-supplier-domain',
    description:
      'Domaine fournisseur (Mode 3) — CJ, Printful, Gelato, Printify, le registre fournisseur, le moteur transactionnel de soumissions et la règle de sous-type. Déjà physiquement isolé : ses seuls imports hors domaine sont anomaly, fetchWithTimeout et supabase-admin. Ne doit jamais dépendre du domaine marchand. Le contenu métier de ce domaine est HORS PÉRIMÈTRE du chantier de séparation.',
    ownedFiles: [
      'src/lib/cj/auth.ts',
      'src/lib/cj/client.ts',
      'src/lib/cj/fulfill.ts',
      'src/lib/cj/rateLimiter.ts',
      'src/lib/cj/reconcile.ts',
      'src/lib/cj/shipping-tiers.ts',
      'src/lib/cj/statusMap.ts',
      'src/lib/dropship/suppliers.ts',
      'src/lib/fulfillment/idempotency-key.ts',
      'src/lib/fulfillment/observability.ts',
      'src/lib/fulfillment/provider-change.ts',
      'src/lib/fulfillment/provider-error-classification.ts',
      'src/lib/fulfillment/provider-lookup.ts',
      'src/lib/fulfillment/provider-order-service.ts',
      'src/lib/fulfillment/status-normalization.ts',
      'src/lib/fulfillment/submission-service.ts',
      'src/lib/fulfillment/transition-rules.ts',
      'src/lib/fulfillment/types.ts',
      'src/lib/fulfillment/webhook-auth.ts',
      'src/lib/fulfillment/webhook-handler.ts',
      'src/lib/suppliers/cj-adapter.ts',
      'src/lib/suppliers/gelato-adapter.ts',
      'src/lib/suppliers/pod-fulfill.ts',
      'src/lib/suppliers/printful-adapter.ts',
      'src/lib/suppliers/printify-adapter.ts',
      'src/lib/suppliers/registry.ts',
      'src/lib/suppliers/supplier-adapter.ts',
    ],
    forbiddenPatterns: MODE_3_MUST_NOT_DEPEND_ON_MODE_2,
    contractTestsPath: 'src/lib/architecture/__tests__/mode2Mode3Boundaries.test.ts',
  },
]

/** Répertoires entièrement possédés par `mode-3-supplier-domain`. Sert au
 *  test d’exhaustivité : `ownedFiles` étant une liste explicite (choix du
 *  moteur, jamais un glob), un fichier ajouté dans l’un de ces répertoires
 *  ne serait couvert par AUCUNE règle — un trou silencieux. Le test
 *  correspondant échoue tant que le nouveau fichier n’est pas déclaré. */
export const MODE_3_OWNED_DIRECTORIES = [
  'src/lib/cj',
  'src/lib/suppliers',
  'src/lib/dropship',
  'src/lib/fulfillment',
] as const
