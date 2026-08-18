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

export const DOMAIN_REGISTRY: DomainDefinition[] = [
  {
    id: 'mode-1-theme-rendering',
    description:
      "Rendu des thèmes Mode 1 (vitrine) — ne doit jamais embarquer le panier ni la logique Shop en dur, quelle que soit l'évolution des modes 2/3.",
    ownedFiles: [
      'src/app/sites/[slug]/themes/EditorialTheme.tsx',
      'src/app/sites/[slug]/themes/VifTheme.tsx',
      // MobileNav.tsx est partagé par tous les modes, mais sa correction
      // (bug trouvé en Phase 1) fait partie de la garantie Mode 1 : il ne
      // doit jamais coder en dur un accès direct au panier, seulement passer
      // par getModeCapabilities. C'est le mécanisme exact par lequel un
      // changement Mode 2/3 pourrait un jour recasser Mode 1 silencieusement.
      'src/app/sites/[slug]/themes/MobileNav.tsx',
    ],
    forbiddenPatterns: [
      { pattern: /\buseCart\s*\(/, reason: 'Mode 1 ne doit jamais dépendre du contexte panier (CartContext).' },
      { pattern: /\bAddToCartButton\b/, reason: 'Mode 1 ne doit jamais rendre un bouton d’ajout au panier.' },
      { pattern: /\bShippingEstimate\b/, reason: 'Mode 1 ne doit jamais afficher d’estimation de livraison (fonctionnalité e-commerce).' },
    ],
    ignoreLinePattern: /^import .*ShopSection/,
    capabilities: ['hasShop'],
    contractTestsPath: 'src/app/sites/[slug]/themes/__tests__/mode1-isolation.test.tsx',
  },
]
