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
// plus régresser.
//
// ÉTAT DES CINQ VECTEURS DE FUSION, à jour :
//   F1 `handlePaidCheckout` — phase 3, devenu l'aiguillage (`order-dispatch`) ;
//   F2 `checkout/route.ts`  — phase 4 (`checkout-domain-selection`) ;
//   F3 `resolveShipping`    — phase 5, scindé : son cœur fournisseur est parti
//      dans `mode3/supplierShipping`, et il est ENTRÉ dans SHARED ;
//   F4 `cancel-order`       — phase 5 (`order-cancellation`) ;
//   F5 `catalog-stock`      — phase 5, devenu `mode3/catalogStock` en entier.
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
  // La règle précédente ne suffit pas — mesuré deux fois sur ce chantier :
  // `cancel-order` portait les identifiants CJ SANS aucun import, et
  // `resolveShipping` faisait de même (l. 242-243 avant scission). Une arête
  // de dépendance se reconstitue par la CONFIGURATION avant de se
  // reconstituer par un import, et aucun motif ancré sur `from '...'` ne la
  // voit. Stripe reste permis : c'est le mécanisme de paiement, une
  // responsabilité SHARED assumée (§4 du plan).
  {
    pattern: /process\.env\.(CJ|PRINTFUL|GELATO|PRINTIFY)_/,
    reason:
      'R2 — les identifiants d’un fournisseur appartiennent au domaine fournisseur. Les porter dans le tronc commun y ramène la dépendance sans passer par un import.',
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
  // Règle A9, installable depuis la phase 3 — c'est LE test anti-rechute.
  // Le domaine d'une commande est décidé une seule fois, à sa création, et
  // porté par la commande elle-même. Un moteur qui relirait `sites.mode`
  // rouvrirait exactement le défaut que ce chantier corrige : deux sources
  // de vérité concurrentes, dont l'une peut diverger de l'autre.
  // `dropship_type` reste lisible ici — c'est une question interne au domaine
  // fournisseur (quel parcours, quel design), pas une question de frontière.
  {
    pattern: /\.select\([^)]*\bmode\b/,
    reason:
      'A9 — un moteur de fulfillment ne doit jamais relire le mode du site. Le domaine se lit sur la commande (fulfillment_domain), décidé à la création et immuable en base.',
  },
]

/** Le point de vente ne DÉCIDE plus, il CONVERTIT.
 *
 *  La phase 4 a retiré de `checkout/route.ts` les sept branchements métier qui
 *  y lisaient `site.mode` (stock strict, pays livrable, devis exigé, coût
 *  compté, commission, frais d'application, garde-fous financiers). Cet acquis
 *  n'était prouvé que par un `grep` lancé à la main : rien n'empêchait un
 *  huitième branchement d'être écrit demain, et un branchement qui REPRODUIT
 *  le comportement actuel ne fait échouer aucun test de caractérisation — par
 *  construction. Ces règles sont le cliquet manquant.
 *
 *  RESTE AUTORISÉ, et doit le rester :
 *    - la conversion unique `resolveFulfillmentDomain(site.mode)` (phase 2) ;
 *    - la garde de reconnaissance `isRecognisedSiteMode(site.mode)` ;
 *    - la télémétrie qui transporte la valeur sans en tirer de conclusion
 *      (`siteMode:`, `mode: site.mode` dans un `details`).
 *  Ces trois formes PASSENT la valeur ; aucune n'en DÉRIVE une règle.
 *
 *  Les deux dernières règles ferment les voies d'ACQUISITION. Sans elles,
 *  `const m = site.mode` puis `if (m === 3)` traverserait le garde sans bruit :
 *  c'est exactement l'évasion que le contrôle de mutation de la phase 0 avait
 *  identifiée comme le trou d'un motif purement textuel. Interdire l'extraction
 *  ferme la dérivation en amont, plutôt que de courir après ses formes. */
// ETAPE B -- LES SIX REGLES SONT DESORMAIS NOMMEES, UNE PAR UNE.
//
// Leur CONTENU est rigoureusement inchange : meme motif, meme raison, meme
// ordre dans `CHECKOUT_MUST_NOT_DECIDE_ON_MODE`. Seule leur FORME change,
// pour qu'un autre domaine puisse en reutiliser un sous-ensemble sans le
// recopier -- recopier une regle, c'est en creer une seconde qui divergera.

const MODE_RULE_COMPARISON: ForbiddenImportRule = {
  pattern: /\bsite\.mode\s*(===|!==|==|!=|>=|<=|>|<)|(===|!==|==|!=|>=|<=|>|<)\s*site\.mode\b/,
  reason:
    "Phase 4 — comparer `site.mode` à une valeur, c'est réintroduire une règle de domaine dans le point de vente. La règle appartient à mode2/checkoutPolicy.ts ou mode3/checkoutPolicy.ts ; la route interroge la politique, elle ne la connaît pas.",
}

const MODE_RULE_SWITCH: ForbiddenImportRule = {
  pattern: /\bswitch\s*\(\s*site\.mode\b/,
  reason:
    "Phase 4 — aiguiller sur `site.mode` est un branchement métier, quelle que soit sa syntaxe. La seule conversion autorisée est resolveFulfillmentDomain().",
}

const MODE_RULE_MEMBERSHIP: ForbiddenImportRule = {
  pattern: /\.(includes|indexOf|has)\s*\(\s*site\.mode\b/,
  reason:
    "Phase 4 — tester l'appartenance de `site.mode` à un ensemble de modes est un branchement métier déguisé en test d'appartenance.",
}

const MODE_RULE_TRUTHINESS: ForbiddenImportRule = {
  pattern: /\bsite\.mode\s*\?(?!\?)|\bif\s*\(\s*!?\s*site\.mode\b/,
  reason:
    "Phase 4 — brancher sur la véracité de `site.mode` (ternaire ou `if` direct) est une décision de domaine. `??` reste permis : il transporte une valeur, il n'en dérive rien.",
}

const MODE_RULE_EXTRACTION: ForbiddenImportRule = {
  pattern: /\b(const|let|var)\s+[A-Za-z_$][\w$]*\s*(:[^=]+)?=\s*site\.mode\b|\{[^}]*\bmode\b[^}]*\}\s*=\s*site\b|\bsite\s*\[\s*['"`]mode['"`]\s*\]/,
  reason:
    "Phase 4 — extraire le mode dans une variable (affectation, destructuration ou accès par crochets) rend invisible le branchement qui suivra. Passer `site.mode` directement à resolveFulfillmentDomain() est la seule sortie prévue.",
}

const MODE_RULE_SITE_ALIAS: ForbiddenImportRule = {
  pattern: /\b(const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*site\s*[;,)]/,
  reason:
    "Phase 4 — aliaser le site entier contourne toutes les règles ci-dessus en une ligne (`const s = site` puis `s.mode === 3`). La route n'a aucun besoin d'un alias du site.",
}

const CHECKOUT_MUST_NOT_DECIDE_ON_MODE: ForbiddenImportRule[] = [
  MODE_RULE_COMPARISON,
  MODE_RULE_SWITCH,
  MODE_RULE_MEMBERSHIP,
  MODE_RULE_TRUTHINESS,
  MODE_RULE_EXTRACTION,
  MODE_RULE_SITE_ALIAS,
]

/**
 * ETAPE B -- LES VOIES D'ACQUISITION DU MODE, sans la comparaison elle-meme.
 *
 * Ce sous-ensemble ferme les formes qu'AUCUN detecteur textuel ne voit :
 * extraire le mode dans une variable (`const m = site.mode` puis `m === 3`),
 * aliaser le site entier, brancher par `switch` ou par appartenance. Le
 * cliquet d'exhaustivite, lui, detecte les COMPARAISONS -- les deux se
 * completent au lieu de se doubler.
 *
 * ETAPE 4 -- `MODE_RULE_TRUTHINESS` A REJOINT CE TABLEAU.
 * A l'etape B, deux fichiers la violaient (`catalog/curate`,
 * `catalog/image-search`) : tous deux ecrivaient `if (site.mode !== 3)`.
 * L'etape 2 a remplace cette comparaison par `hasSupplierCatalog(site.mode)`,
 * primitive unique d'admission au catalogue fournisseur. Les deux violations
 * ont disparu, et la regle peut donc etre appliquee reellement -- mesure
 * refaite fichier par fichier avant de l'ajouter : R4 = 0 sur les six.
 *
 * ================================================================
 * ETAPE 4 -- `MODE_RULE_COMPARISON` A REJOINT CE TABLEAU A SON TOUR.
 *
 * Elle en etait absente pour une raison mesuree : ses cinq dernieres
 * occurrences vivaient dans le template `systemPrompt` de
 * `agent/[slug]/chat/route.ts`, ECHAPPEES -- du texte, pas du code. La regle
 * y aurait vu du prompt qui ressemble a une decision.
 *
 * L'evaluation reelle du prompt avec Node a montre que cet echappement etait
 * un DEFAUT, pas une intention : les quatre autres interpolations du meme
 * template fonctionnaient toutes, et l'agent recevait en consequence LES CINQ
 * guidances -- 5 312 caracteres sur 14 780, 36 % du prompt, dont 6 lignes
 * utiles sur 49 pour un site vitrine.
 *
 * La correction a extrait la decision dans `lib/agent-tools/modeGuidance.ts`
 * plutot que de simplement desechapper : desechapper aurait rendu les cinq
 * `site.mode === N` vivants DANS la route, ce que cette regle interdit
 * precisement. La route interpole desormais `guidanceForSite(...)` et ne
 * compare plus rien. Mesure refaite avant d'ajouter la regle : R1 = 0 sur les
 * six fichiers du domaine.
 * ================================================================ */
export const SITE_MODE_ACQUISITION_RULES: ForbiddenImportRule[] = [
  MODE_RULE_COMPARISON,
  MODE_RULE_SWITCH,
  MODE_RULE_MEMBERSHIP,
  MODE_RULE_TRUTHINESS,
  MODE_RULE_EXTRACTION,
  MODE_RULE_SITE_ALIAS,
]


/** Les lignes de commentaire sont exclues du scan de ce domaine.
 *
 *  DÉROGATION ASSUMÉE au comportement des autres domaines, qui scannent les
 *  commentaires (limite connue du moteur, documentée plus haut). Ici elle est
 *  nécessaire ET sûre : la route doit pouvoir EXPLIQUER en prose la règle
 *  qu'elle n'applique plus — c'est même la meilleure protection contre une
 *  réintroduction par méconnaissance — et un branchement mis en commentaire
 *  n'est pas un branchement. Aucun code exécutable ne peut se cacher derrière
 *  ce filtre : il ne saute que les lignes DÉBUTANT par un marqueur. Une ligne
 *  de code suivie d'un commentaire reste scannée intégralement. */
const IGNORE_COMMENT_LINES = /^(\/\/|\*|\/\*)/

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
      'Tronc commun du commerce — responsabilités réellement partagées par Mode 2 et Mode 3 (stock, machine à états, prix, anomalies, mécanisme de paiement, e-mail acheteur, empreintes de panier, propriété du site). Ne doit brancher sur aucun mode, ne dépendre d’aucun fournisseur, et ne recevoir ni site ni commande complète. `resolveShipping` y est entré en phase 5 après scission de son cœur fournisseur ; `catalog-stock` est devenu `mode3/catalogStock` (domaine fournisseur en entier). `handlePaidCheckout` reste hors de ce domaine : il est l\'aiguillage, couvert par `order-dispatch`.',
    ownedFiles: [
      'src/lib/shop.ts',
      'src/lib/shop/orderStatusMachine.ts',
      'src/lib/shop/buyerNonce.ts',
      'src/lib/shop/quote/basketHash.ts',
      'src/lib/shop/quote/checkoutSignature.ts',
      // PHASE 5 / F3 -- admis apres scission : ses quatre aretes fournisseur
      // (registre, adaptateur, paliers CJ, client CJ) et les identifiants CJ
      // sont partis dans mode3/supplierShipping. Il ne garde que le cache de
      // devis, son budget, la purge, la marge, les libelles et l'agregation.
      'src/lib/shop/quote/resolveShipping.ts',
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
    id: 'mode-2-merchant-domain',
    description:
      "Domaine marchand (phase 4, regle A1) — une boutique autonome detient son stock, prepare et expedie elle-meme. Ce domaine ne doit dependre d'AUCUN fournisseur ni du domaine fournisseur : c'est ce qui garantit qu'une evolution Mode 3 ne peut pas atteindre le chemin Mode 2. Il ne lit pas non plus le sous-type, qui est une notion interne au Mode 3 et n'a aucun sens ici.",
    ownedFiles: ['src/lib/mode2/checkoutPolicy.ts'],
    forbiddenPatterns: [
      {
        pattern: /from ['"]@\/lib\/(cj|suppliers|dropship|mode3)/,
        reason:
          "A1 — mode2/ ne doit jamais importer un fournisseur, le registre fournisseur, la table des sous-types, ni le domaine Mode 3.",
      },
      {
        pattern: /\bdropship_type\b/,
        reason:
          "A1 — le sous-type est interne au domaine fournisseur. Le domaine marchand n'a pas de fournisseur, donc pas de sous-type.",
      },
    ],
    contractTestsPath: 'src/lib/order-domain/__tests__/checkoutPolicy.test.ts',
  },
  {
    id: 'checkout-domain-selection',
    description:
      "Point de vente (phase 4) — le SEUL endroit du produit ou le domaine d'une commande est decide, et il le decide une fois, a partir du seul mode du site. En contrepartie il ne doit contenir AUCUNE regle de domaine : il convertit le mode en domaine, choisit la politique correspondante, puis interroge cette politique. Avant la phase 4, sept branchements metier lisaient directement `site.mode` ici — un fichier que les deux modes traversent. Cette entree empeche le huitieme.",
    ownedFiles: ['src/app/api/shop/checkout/route.ts'],
    forbiddenPatterns: CHECKOUT_MUST_NOT_DECIDE_ON_MODE,
    ignoreLinePattern: IGNORE_COMMENT_LINES,
    contractTestsPath: 'src/lib/architecture/__tests__/mode2Mode3Boundaries.test.ts',
  },
  {
    id: 'mode-1-showcase-domain',
    description:
      "Admission au commerce (M1-2) — le Mode 1 est une VITRINE : il presente un business, il ne le fait pas commercer. Ce domaine porte la frontiere d'ADMISSION (« ce site a-t-il le droit de produire un artefact commercial ? »), qui se pose EN AMONT de tout artefact. Elle ne doit jamais etre confondue avec la frontiere de ROUTAGE (order-domain/, « qui execute cette vente ? »), qui se pose EN AVAL sur une vente deja admise. Confondre les deux serait rejouer le defaut que neuf phases ont servi a defaire.",
    ownedFiles: ['src/lib/commerce-admission/canTransact.ts'],
    forbiddenPatterns: [
      {
        pattern: /\bfulfillment_domain\b/,
        reason:
          "M1-2 — l'admission ne connait pas le domaine d'execution. `fulfillment_domain` repond a « qui execute ? » ; ce module repond a « a-t-on le droit de vendre ? ». Les melanger reintroduirait la confusion entre admission et routage.",
      },
      {
        pattern: /from ['\"]@\/lib\/(cj|suppliers|dropship|mode2|mode3|order-domain)/,
        reason:
          "M1-2 — le point d'admission ne depend d'aucun domaine ni d'aucun fournisseur : c'est ce qui le rend verifiable d'un seul regard, et ce qui garantit qu'il reste utilisable avant toute decision d'execution.",
      },
      {
        pattern: /\bdropship_type\b/,
        reason:
          "M1-2 — le sous-type est interne au Mode 3. L'admission ne descend jamais a ce niveau : elle ne distingue que commercant / non commercant.",
      },
      {
        pattern: /!==\s*1\b/,
        reason:
          "M1-2 — `!== 1` ferait du commerce le comportement PAR DEFAUT : un mode 4 ajoute demain serait commercant sans decision, et aucun test ne le verrait. L'allowlist positive inverse la charge de la preuve. C'est la propriete centrale du contrat M1-1.",
      },
    ],
    // Le module doit pouvoir EXPLIQUER en prose pourquoi `!== 1` est proscrit —
    // c'est meme la meilleure protection contre une reintroduction par
    // meconnaissance. Meme derogation, meme raison qu'a `checkout-domain-selection`.
    ignoreLinePattern: IGNORE_COMMENT_LINES,
    contractTestsPath: 'src/lib/commerce-admission/__tests__/canTransact.test.ts',
  },
  {
    // ETAPE A du chantier des frontieres -- NOUVEAU DOMAINE.
    //
    // POURQUOI IL NE POUVAIT PAS REJOINDRE `mode-1-showcase-domain`. Ce
    // dernier est soumis a un test d'EXHAUSTIVITE indexe sur
    // MODE_1_OWNED_DIRECTORIES = ['src/lib/commerce-admission'] : tout fichier
    // declare hors de ce repertoire y devient un « fantome » et fait rougir la
    // suite. Mesure faite avant toute modification. `modeCapabilities.ts` vit
    // dans les themes ; il lui fallait donc son propre domaine, ce qui est de
    // toute facon plus juste -- l'un porte l'ADMISSION, l'autre le RENDU.
    id: 'mode-1-shop-surface',
    description:
      "Surface boutique de la vitrine (etape A) -- `getModeCapabilities` decide si un site AFFICHE une section Shop et monte un panier. Cette decision doit DERIVER de l'admission (`canTransact`), jamais la redefinir. Elle la redefinissait : une comparaison negative au mode vitrine y tenait lieu de frontiere, si bien qu'un mode inconnu obtenait une boutique des qu'il avait un produit -- alors que `canTransact` le refusait. Deux definitions de « ce site commerce » coexistaient, d'accord sur les trois modes connus et divergentes sur tout le reste. Ce domaine interdit le retour de cette forme, et l'entree de la frontiere de ROUTAGE dans une decision d'AFFICHAGE.",
    ownedFiles: ['src/app/sites/[slug]/themes/modeCapabilities.ts'],
    forbiddenPatterns: [
      {
        pattern: /!==?\s*1\b/,
        reason:
          "Etape A -- une comparaison NEGATIVE au mode vitrine fait du commerce le comportement PAR DEFAUT : un mode ajoute demain obtiendrait une boutique sans que personne l'ait decide. L'autorite est `canTransact`, allowlist positive. C'est la meme regle que celle qui garde `canTransact.ts` lui-meme.",
      },
      {
        pattern: /from ['"]@\/lib\/order-domain/,
        reason:
          "Etape A -- `order-domain/` porte la frontiere de ROUTAGE (« qui execute la vente ? »). L'importer ici la ferait entrer dans une decision d'AFFICHAGE, rejouant la confusion entre admission et routage que neuf phases ont servi a defaire.",
      },
      {
        pattern: /\bSUPPLIER_SITE_MODE\b/,
        reason:
          "Etape A -- meme raison : la coincidence de valeur entre le mode fournisseur et le mode a catalogue anticipe n'est PAS une dependance. Ces deux regles doivent pouvoir diverger sans se contredire ; l'allowlist locale les tient separees.",
      },
      {
        pattern: /\bmode\s*===\s*[0-9]/,
        reason:
          "Etape A -- une valeur de mode comparee en dur est une frontiere ecrite sans nom. Les deux regles de ce fichier sont des allowlists (`canTransact` pour l'admission, `CATALOG_BEFORE_OWN_PRODUCTS` pour le catalogue anticipe) : y ajouter un mode doit rester une decision visible dans un diff.",
      },
      {
        pattern: /\bdropship_type\b/,
        reason:
          "Etape A -- le sous-type est interne au domaine fournisseur. La surface boutique ne descend jamais a ce niveau : elle ne distingue que « affiche une boutique » de « n'en affiche pas ».",
      },
    ],
    // Le fichier EXPLIQUE en prose pourquoi la forme negative est proscrite et
    // pourquoi `SUPPLIER_SITE_MODE` n'est pas importe -- c'est meme la
    // meilleure protection contre une reintroduction par meconnaissance.
    // Meme derogation, meme raison qu'a `mode-1-showcase-domain`.
    ignoreLinePattern: IGNORE_COMMENT_LINES,
    capabilities: ['hasShop'],
    contractTestsPath: 'src/app/sites/[slug]/themes/__tests__/mode1-isolation.test.tsx',
  },
  {
    // ETAPE B -- LES SURFACES DE DECISION SUR LE MODE, HORS UI HUMAINE.
    //
    // Ces cinq fichiers derivent une regle du mode du site. Ils etaient
    // invisibles a l'exhaustivite du registre, indexee par REPERTOIRE : aucun
    // `*_OWNED_DIRECTORIES` ne pointait sur eux. C'est le meme angle mort qui
    // avait laisse passer `modeCapabilities.ts` et `CartDrawer.tsx` -- le
    // mecanisme fonctionnait, il ne regardait simplement pas la.
    //
    // AMPLEUR DELIBEREE. Ils recoivent les regles d'ACQUISITION, pas celles de
    // COMPARAISON : trois d'entre eux comparent le mode aujourd'hui, et leur
    // imposer `MODE_RULE_COMPARISON` aurait exige de corriger leur code --
    // un autre chantier. La comparaison reste couverte par le NIVEAU 2 du
    // cliquet d'exhaustivite, qui les oblige a etre declares ici.
    id: 'site-mode-decision-surfaces',
    description:
      "Surfaces de decision sur `sites.mode` hors interface humaine (etape B) -- ces fichiers derivent une regle du mode : groupement analytique, familles d'outils IA, admission au catalogue fournisseur, chargement des selections. Ils n'ont pas a ACQUERIR le mode par une voie detournee : l'extraire dans une variable, aliaser le site, brancher par switch ou par appartenance rend invisible le branchement qui suit. Ces quatre voies leur sont fermees, avec les regles deja eprouvees par `checkout-domain-selection`. La comparaison directe leur reste permise en l'etat, et c'est un constat, pas une approbation : le niveau 2 du cliquet d'exhaustivite les tient declares ici, donc visibles.",
    ownedFiles: [
      'src/app/api/admin/stats/route.ts',
      'src/app/api/agent/[slug]/chat/route.ts',
      'src/app/api/catalog/curate/route.ts',
      'src/app/api/catalog/image-search/route.ts',
      // ETAPE 2 -- entree AJOUTEE. Cette route ne lisait pas le mode ; elle le
      // lit desormais pour interroger `hasSupplierCatalog`, ce qui en fait un
      // lecteur que le cliquet d'exhaustivite doit voir. C'est le mecanisme
      // qui fonctionne : une surface nouvelle doit se declarer.
      'src/app/api/catalog/search/route.ts',
      'src/app/sites/[slug]/themes/shared.tsx',
    ],
    forbiddenPatterns: SITE_MODE_ACQUISITION_RULES,
    ignoreLinePattern: IGNORE_COMMENT_LINES,
    capabilities: ['siteMode'],
    contractTestsPath: 'src/lib/architecture/__tests__/modeSurfaceExhaustivity.test.ts',
  },
  {
    // ETAPE B -- L'INTERFACE HUMAINE : DECLAREE, PAS CONTRAINTE.
    //
    // Ces cinq fichiers comparent le mode pour decider ce qu'ils AFFICHENT --
    // monter un onglet, activer un champ, choisir un libelle. C'est un choix
    // d'affichage legitime, pas une frontiere metier. Leur interdire
    // mecaniquement toute comparaison produirait des faux positifs en serie et
    // pousserait a contourner le registre plutot qu'a s'y conformer.
    //
    // `forbiddenPatterns` VIDE, ET C'EST LE POINT. La valeur de cette entree
    // n'est pas d'interdire : c'est de rendre ces fichiers VISIBLES au niveau
    // 2 du cliquet. Sans elle, ils resteraient hors registre -- exactement
    // l'etat qui a produit les deux breches. Declarer n'est pas contraindre,
    // et c'est ici l'ampleur voulue.
    id: 'human-ui-mode-display',
    description:
      "Interface humaine pilotee par le mode (etape B) -- editeur marchand, apercu, page publique, connexion des paiements, onboarding. Ces fichiers lisent `sites.mode` pour decider d'un AFFICHAGE, jamais d'une regle de vente : aucune admission, aucun routage, aucune facturation n'en depend. Ils sont declares pour etre visibles du cliquet d'exhaustivite -- toute nouvelle decision sur le mode ailleurs dans le depot devra rejoindre un domaine, celui-ci ou un autre -- mais ils ne recoivent volontairement aucune regle : une comparaison de mode y est un choix d'interface, pas une frontiere.",
    ownedFiles: [
      'src/app/edit/[slug]/page.tsx',
      'src/app/preview/[slug]/page.tsx',
      'src/app/sites/[slug]/page.tsx',
      'src/components/edit/PaymentConnect.tsx',
      'src/components/onboarding/OnboardingChat.tsx',
    ],
    forbiddenPatterns: [],
    capabilities: ['siteMode'],
    contractTestsPath: 'src/lib/architecture/__tests__/modeSurfaceExhaustivity.test.ts',
  },
  {
    id: 'order-cancellation',
    description:
      "Annulation acheteur (phase 5, vecteur F4) — un acheteur annule sa commande de la meme facon, qu'elle soit executee par le marchand ou par un fournisseur : cette route est traversee par les DEUX domaines. Elle importait pourtant `cj/client` et portait les identifiants CJ en tete de fichier. Elle ne s'adresse desormais qu'au point d'entree du domaine fournisseur. Le declencheur reste la presence d'une commande fournisseur, jamais le mode ni le sous-type.",
    ownedFiles: ['src/app/api/shop/cancel-order/route.ts'],
    forbiddenPatterns: [
      // Ancre sur le REPERTOIRE : contrairement a l'aiguillage post-paiement,
      // cette route n'a aucun besoin legitime d'un module fournisseur, quel
      // qu'il soit. `@/lib/mode3/...` reste autorise : c'est precisement le
      // point d'entree de domaine que la phase 5 lui donne.
      {
        pattern: /from ['"]@\/lib\/(cj|suppliers|dropship)\//,
        reason:
          "R2 / F4 — l'annulation ne parle qu'au point d'entree du domaine fournisseur, jamais a un fournisseur, un adaptateur ou le registre fournisseur.",
      },
      // La regle precedente ne suffit pas : les identifiants CJ vivaient ici
      // SANS import, en constantes de tete de fichier. Une arete peut se
      // reconstituer par la configuration avant de se reconstituer par un
      // import.
      {
        pattern: /process\.env\.(CJ|PRINTFUL|GELATO|PRINTIFY)_/,
        reason:
          "R2 / F4 — les identifiants d'un fournisseur appartiennent au domaine fournisseur. Les porter ici, c'est y ramener la dependance sans passer par un import.",
      },
      {
        pattern: /\.\s*mode\b/,
        reason:
          "R1 — l'annulation ne lit jamais le mode d'un site : elle agit sur une commande deja creee, dont le domaine a ete decide a la creation.",
      },
      {
        pattern: /\bdropship_type\b/,
        reason:
          "R1 — le sous-type est interne au domaine fournisseur. L'annulation n'a pas a le connaitre.",
      },
    ],
    contractTestsPath: 'src/app/api/shop/cancel-order/__tests__/route.test.ts',
  },
  {
    id: 'order-dispatch',
    description:
      "Aiguillage post-paiement (phase 3, regle A5) — le SEUL fichier partage autorise a referencer les points d'entree des domaines. En contrepartie il ne doit contenir AUCUNE decision metier : il lit le domaine porte par la commande et delegue. Un aiguillage qui ne decide rien ne peut pas redevenir un lieu de fusion entre Mode 2 et Mode 3 — c'est la propriete centrale de cette phase. Avant elle, ce fichier appelait les deux moteurs fournisseur INCONDITIONNELLEMENT, et une commande Mode 2 atteignait reellement CJ et Printful.",
    ownedFiles: ['src/lib/shop/handlePaidCheckout.ts'],
    forbiddenPatterns: [
      {
        pattern: /\bdropship_type\b/,
        reason:
          "A5 — l'aiguillage ne connait que le domaine. Le sous-type est interne au domaine fournisseur : le lire ici recreerait une seconde logique de decision.",
      },
      {
        pattern: /\.\s*mode\b/,
        reason:
          "A5 — l'aiguillage ne lit jamais le mode d'un site. Le domaine a ete decide a la creation de la commande et n'a pas a etre recalcule.",
      },
      {
        pattern: /\bsuppliersForDropshipType\b/,
        reason:
          "A5 — la selection du fournisseur appartient au domaine Mode 3, jamais a l'aiguillage.",
      },
      // Ancre sur l'IMPORT, pas sur le mot : c'est la dependance qui constitue
      // la violation, pas une mention en prose. Les deux points d'entree de
      // domaine (cj/fulfill, suppliers/pod-fulfill) restent autorises — c'est
      // precisement le role de ce fichier.
      {
        pattern: /from ['"]@\/lib\/(cj\/client|dropship\/|suppliers\/[a-z-]*adapter|suppliers\/registry)/,
        reason:
          "A5 — l'aiguillage ne parle qu'aux points d'entree de domaine, jamais directement a un fournisseur, un adaptateur ou le registre fournisseur.",
      },
    ],
    contractTestsPath: 'src/lib/shop/__tests__/handlePaidCheckout.test.ts',
  },
  {
    id: 'order-domain-frontier',
    description:
      'Point de décision unique de la frontière (phase 1) — répond à « qui exécute cette vente ? » à partir du seul mode du site. C’est le SEUL module autorisé à connaître le mode pour en déduire un domaine ; en contrepartie il ne doit connaître ni sous-type, ni fournisseur, ni aucun des deux domaines. Une garde antérieure qui consultait `dropship_type` a modifié le comportement de pod_brand et pod_custom : cette entrée rend cette erreur détectable au moment où elle est écrite.',
    ownedFiles: ['src/lib/order-domain/resolve.ts', 'src/lib/order-domain/checkoutPolicy.ts'],
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
      'src/lib/dropship/catalogAdmission.ts',
      'src/lib/dropship/suppliers.ts',
      'src/lib/mode3/cancelSupplierOrder.ts',
      'src/lib/mode3/catalogStock.ts',
      'src/lib/mode3/checkoutPolicy.ts',
      'src/lib/mode3/supplierShipping.ts',
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
  'src/lib/mode3',
  'src/lib/cj',
  'src/lib/suppliers',
  'src/lib/dropship',
  'src/lib/fulfillment',
] as const

/** Répertoires entièrement possédés par `mode-2-merchant-domain`. Même rôle et
 *  même mécanisme que MODE_3_OWNED_DIRECTORIES ci-dessus — la protection est
 *  volontairement SYMÉTRIQUE, pas nouvelle.
 *
 *  Elle manquait : la phase 4 a créé le domaine marchand avec un unique fichier
 *  déclaré, et `ownedFiles` étant une liste explicite, un second fichier —
 *  `src/lib/mode2/pricing.ts`, par exemple — n'aurait été couvert par AUCUNE
 *  règle. A1 aurait été vraie par coïncidence de contenu, pas tenue par un
 *  garde. Le test d'exhaustivité échoue tant qu'un fichier du répertoire n'est
 *  pas déclaré ci-dessus dans `ownedFiles`.
 *
 *  Le domaine marchand est jeune et ne compte qu'un fichier : c'est précisément
 *  le moment où le cliquet coûte le moins cher à poser. */
export const MODE_2_OWNED_DIRECTORIES = ['src/lib/mode2'] as const

/** Répertoire du point de décision unique de la frontière. Même mécanisme que
 *  les deux constantes ci-dessus.
 *
 *  Ce domaine interdit `dropship_type` et toute dépendance de domaine à
 *  l'endroit précis où « qui exécute cette vente ? » est tranché. Une liste
 *  explicite non gardée y était le trou le plus coûteux du registre : un
 *  fichier ajouté ici échapperait aux deux règles qui empêchent de rejouer
 *  l'erreur mesurée sur 13bec0e — une garde qui consultait le sous-type et
 *  modifiait le comportement de pod_brand et pod_custom. */
export const ORDER_DOMAIN_OWNED_DIRECTORIES = ['src/lib/order-domain'] as const

/** Répertoire du point de vente.
 *
 *  Le cliquet posé sur `route.ts` interdit tout branchement métier sur
 *  `site.mode`. Sans exhaustivité, il se contournait en une ligne : extraire
 *  un `checkout/policyHelpers.ts` — le refactor le plus naturel qui soit sur
 *  une route de neuf cents lignes — et y écrire la décision. Le fichier voisin
 *  n'étant déclaré nulle part, aucune règle ne l'aurait vu.
 *
 *  Ce répertoire ne contient que la route : tout `.ts` qui y apparaît est donc
 *  un helper du point de vente, et doit être soumis aux mêmes règles. */
export const CHECKOUT_OWNED_DIRECTORIES = ['src/app/api/shop/checkout'] as const

/** Répertoire de la route d'annulation. Même mécanisme que les quatre
 *  constantes ci-dessus.
 *
 *  NOTE ARCHITECTURALE — c'est la CINQUIÈME liste manuelle de ce type. Le
 *  constat inscrit au plan lors de la phase 4 se confirme : le mécanisme
 *  d'exhaustivité n'a pas lui-même d'exhaustivité, et rien ne détecterait
 *  l'oubli d'une sixième. Dette 🟡 déjà documentée, volontairement non
 *  traitée ici — la corriger dépasserait le périmètre F4. */
export const CANCEL_ORDER_OWNED_DIRECTORIES = ['src/app/api/shop/cancel-order'] as const

/** Repertoire du point d'admission commerciale. Meme mecanisme que les cinq
 *  constantes ci-dessus.
 *
 *  Le Mode 1 etait jusqu'ici defini par SOUSTRACTION — « ce qui n'est pas une
 *  boutique ». Un mode qui n'existe que negativement ne peut pas etre garde
 *  positivement : c'est la cause structurelle de l'absence de frontiere
 *  mesuree en M1-0. Cette entree lui donne une existence architecturale. */
export const MODE_1_OWNED_DIRECTORIES = ['src/lib/commerce-admission'] as const
