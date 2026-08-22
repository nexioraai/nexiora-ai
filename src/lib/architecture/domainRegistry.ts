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
]
