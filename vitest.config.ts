import { defineConfig } from 'vitest/config';
import path from 'path';

// P0-3.8 — configuration minimale, alignée sur l'alias `@/*` de tsconfig.json.
// Portée volontairement limitée à src/lib/fulfillment (périmètre de cette
// tâche) : ne force aucune convention de test sur le reste du repository.
export default defineConfig({
  test: {
    // P0-3.9 : périmètre étendu à src/lib/suppliers pour les tests
    // d'intégration de pod-fulfill.ts (restructuration P0-3.9).
    // P0-3.9.7 Audit #2 : périmètre étendu aux routes webhook Gelato/Printful
    // (mocks uniquement, jamais de réseau réel) — les routes API n'avaient
    // aucune couverture de test avant cet audit de clôture.
    // Phase 1 — registre fournisseurs : src/lib/__tests__/ ajouté pour
    // catalog-stock.ts (aucune couverture avant ce correctif, cible directe
    // du bug Gelato pré-checkout).
    // Phase 1 — D3 : src/lib/shop/ ajouté pour handlePaidCheckout.ts
    // (aucune couverture avant ce correctif).
    // Chantier Site Web / Mode 1 : src/lib/domains/ ajouté pour verrouiller
    // provisionDomain() (idempotence achat, non-régénération du token Google
    // au renouvellement) avant le premier test réel avec achat Porkbun.
    // Isolation Mode 1 (Phase 1) : src/app/sites/[slug]/themes/ ajouté pour
    // verrouiller que le rendu Mode 1 (Editorial/Vif) n'embarque jamais le
    // panier ni la section Shop — via renderToStaticMarkup, sans jsdom.
    // Bloc 2 (surveillance anti-régression) : src/lib/architecture/ ajouté
    // pour le moteur générique de frontières de domaine (DOMAIN_REGISTRY),
    // indépendant du nombre de modes/produits enregistrés.
    // Correction incident "boutique en ligne mode 2" : src/app/api/chat/
    // ajouté pour verrouiller que getSectorPrompt() ne redemande plus de
    // générer des produits quand le mode déjà connu (2 ou 3) l'interdit
    // explicitement — sans ce test, la contradiction pouvait revenir en
    // silence à la prochaine modification du prompt.
    // Audit Reseller/CJ (Mode 3) : src/lib/cj/ ajouté -- aucune couverture
    // avant cet audit (statusMap, reconciliation, idempotence/retry de
    // fulfillCjOrder).
    // Audit ownership/RLS (account/delete) : src/app/api/account/ ajouté --
    // aucune couverture avant ce correctif (résolution owner_id, archivage
    // atomique via RPC, deleteUser() jamais appelé si archivage incomplet).
    // Audit timeouts fournisseurs (lot prioritaire) : src/lib/http/ ajouté
    // pour fetchWithTimeout (point de correction central partagé par
    // cjFetch/glFetch/pfFetch/pyFetch, aucune couverture avant ce correctif).
    // Lot crons fail-open : src/app/api/ai-visibility/ ajouté (seule route
    // hors src/app/api/cron/ concernée par ce lot).
    // Audit Mode 3/POD BRAND, lot Stripe : src/app/api/checkout/ ajouté --
    // aucune couverture avant ce correctif (clé d'idempotence Stripe sur la
    // création du client, course de publication double-clic).
    // Audit Mode 3/POD BRAND, lot mockups : src/app/api/pod/ et
    // src/lib/auth/ ajoutés -- generate-mockups/route.ts n'avait aucune
    // authentification/vérification de propriété avant ce correctif
    // (requireSiteOwner, lui-même jamais testé isolément avant ce lot).
    // Audit Mode 3/POD BRAND, lot "commande POD invisible" :
    // src/components/edit/ ajouté -- OrderManager.tsx n'avait aucune
    // couverture, cause directe de la régression (statut 'processing'
    // absent de tous les onglets).
    // Audit Mode 3/POD BRAND, LOT 1 (sites_public) : src/app/__tests__/
    // ajouté -- sitemap.ts n'avait aucune couverture avant ce correctif.
    // Audit Mode 3/POD BRAND, perfectionnement (unicité domaine) :
    // src/app/api/domains/ ajouté -- ces routes (purchase, provision, BYOD)
    // n'avaient AUCUNE couverture avant ce lot, alors que src/lib/domains/
    // (provisionDomain) l'était déjà depuis le chantier Site Web/Mode 1 --
    // un test créé sans ce périmètre ne se serait jamais exécuté en CI.
    // Audit Mode 3/POD BRAND, perfectionnement (rate-limit image-search) :
    // src/app/api/catalog/ ajouté -- même constat, aucune route catalog/*
    // n'était couverte malgré catalog/curate, catalog/enhance et
    // catalog/selections déjà protégés par requireSiteOwner.
    // LOT I (Mode 3 global, F-I-2) : src/app/api/backfill-hero/ ajouté --
    // cette route n'avait aucune couverture et n'était surtout PAS incluse
    // ici avant ce lot ; un test créé sans cette ligne s'exécute avec
    // succès en isolation (`vitest run <fichier>`) mais n'est JAMAIS
    // collecté par `vitest run` sans argument (donc jamais en CI) --
    // silencieusement, sans erreur ni avertissement. Détecté en vérifiant
    // le delta de comptage de tests attendu après l'ajout du fichier de
    // test dédié à cette route dans ce même lot.
    // LOT K (Mode 3 global) : src/app/api/shipping-estimate/ ajouté (même
    // constat que backfill-hero -- route top-level hors de tout préfixe
    // déjà couvert, jamais collectée sans cette ligne).
    include: [
      'src/lib/__tests__/**/*.test.ts',
      'src/lib/http/**/*.test.ts',
      'src/lib/auth/**/*.test.ts',
      'src/app/api/ai-visibility/**/*.test.ts',
      'src/app/api/checkout/**/*.test.ts',
      'src/app/api/pod/**/*.test.ts',
      'src/components/edit/**/*.test.ts',
      'src/components/edit/**/*.test.tsx',
      'src/app/__tests__/**/*.test.ts',
      'src/lib/cj/**/*.test.ts',
      'src/lib/shop/**/*.test.ts',
      'src/lib/fulfillment/**/*.test.ts',
      'src/lib/suppliers/**/*.test.ts',
      'src/lib/payments/**/*.test.ts',
      'src/lib/domains/**/*.test.ts',
      'src/app/api/domains/**/*.test.ts',
      'src/app/api/catalog/**/*.test.ts',
      'src/lib/architecture/**/*.test.ts',
      // M1-1 — frontiere d'admission Mode 1 / Mode 2. Sans cette ligne le test
      // passe en isolation mais n'est JAMAIS collecte par `vitest run` : le
      // piege deja rencontre en phase 1 du chantier Mode 2 / Mode 3.
      'src/lib/commerce-admission/**/*.test.ts',
      'src/lib/systemHealth/**/*.test.ts',
      'src/app/api/webhooks/**/*.test.ts',
      'src/app/api/shop/**/*.test.ts',
      'src/app/api/stripe/**/*.test.ts',
      'src/app/api/cron/**/*.test.ts',
      'src/app/api/chat/**/*.test.ts',
      'src/app/api/account/**/*.test.ts',
      'src/app/sites/**/*.test.ts',
      'src/app/sites/**/*.test.tsx',
      'src/app/api/backfill-hero/**/*.test.ts',
      'src/app/api/shipping-estimate/**/*.test.ts',
      // M1-02 : premiere couverture de /api/contact. Sans cette ligne, le test
      // passe en isolation mais n'est JAMAIS collecte par `vitest run` -- le
      // piege deja documente plus bas dans ce fichier.
      'src/app/api/contact/**/*.test.ts',
      // Passe de cloture (reporting) : src/app/api/admin/ ajoute -- aucune
      // route admin n'etait couverte, et le prefixe n'etait pas inclus ici :
      // un test ecrit sans cette ligne passe en isolation mais n'est JAMAIS
      // collecte par `vitest run` (donc jamais en CI), silencieusement.
      'src/app/api/admin/**/*.test.ts',
      // Separation Mode 2 / Mode 3, PHASE 1 (docs/PLAN-SEPARATION-MODE2-MODE3.md) :
      // src/lib/order-domain/ porte le point de decision unique de la frontiere.
      // Sans cette ligne, son test passe en isolation mais n'est JAMAIS collecte
      // -- exactement le piege documente ci-dessus. Verifie par le delta de
      // comptage de tests apres ajout.
      'src/lib/order-domain/**/*.test.ts',
      // ETAPE 7 du chantier catalogue canonique -- DEUX prefixes ajoutes, tous
      // deux absents jusqu'ici :
      //   * src/lib/agent-tools/ porte la resolution nom -> produit (N7) ;
      //   * src/app/api/agent/ n'avait AUCUNE couverture, alors que
      //     `agent/[slug]/apply` est la seule route par laquelle un outil IA
      //     ecrit reellement (22 outils).
      // Sans ces lignes, leurs tests passent en isolation mais ne sont JAMAIS
      // collectes par `vitest run` -- donc jamais en CI, silencieusement.
      // C'est le piege deja documente six fois plus haut dans ce fichier ;
      // verifie ici par le delta de comptage de tests apres ajout.
      // CHANTIER 3 (MODE 1) -- src/lib/i18n/ porte le contrat des langues
      // reellement servies. Prefixe absent : sans cette ligne son test
      // passe en isolation mais n'est JAMAIS collecte par `vitest run`.
      'src/lib/i18n/**/*.test.ts',
      // CHANTIER 5 -- src/lib/site-profile/ porte la borne de `area_served`
      // et l'allowlist de `price_range`. Prefixe absent : sans cette ligne,
      // leurs tests passent en isolation mais ne sont JAMAIS collectes.
      'src/lib/site-profile/**/*.test.ts',
      'src/lib/agent-tools/**/*.test.ts',
      'src/app/api/agent/**/*.test.ts',
      // CHANTIER 4 -- variante `.tsx` AJOUTEE. Le prefixe ci-dessus ne
      // collecte que `.test.ts` : le test des outils faq/whyus rend du JSX
      // (il prouve que `JsonLdScript` neutralise une question hostile) et
      // n'etait donc JAMAIS collecte -- rencontre reellement, pas suppose.
      // C'est le piege deja documente sept fois dans ce fichier.
      'src/app/api/agent/**/*.test.tsx',
      // DETTE 6a, EXTENSION -- DEUX prefixes ajoutes, tous deux absents
      // jusqu'ici, alors que ces deux routes portaient chacune une garde de
      // propriete defaillante et AUCUN test :
      //   * src/app/api/sites/  -- le PATCH de `sites/[slug]` ecrit 19
      //     colonnes de contenu en service_role ;
      //   * src/app/api/marketing/ -- `generate` lit le site entier et le
      //     transmet a trois fournisseurs externes.
      // Sans ces lignes, leurs tests passent en isolation mais ne sont JAMAIS
      // collectes par `vitest run` -- donc jamais en CI, silencieusement.
      // C'est le piege deja documente huit fois plus haut dans ce fichier ;
      // verifie ici par le delta de comptage de tests apres ajout.
      'src/app/api/sites/**/*.test.ts',
      'src/app/api/marketing/**/*.test.ts',
      // ETAPE 2 du chantier des frontieres -- `src/lib/dropship/` n'etait pas
      // collecte, alors qu'il porte la « source UNIQUE » de la regle
      // fournisseur et desormais l'admission au catalogue. Sans cette ligne,
      // leurs tests passent en isolation mais ne sont JAMAIS collectes par
      // `vitest run` -- le piege deja documente neuf fois dans ce fichier.
      // Verifie ici par le delta de comptage apres ajout.
      'src/lib/dropship/**/*.test.ts',
    ],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // 'server-only' lève une erreur volontaire indépendamment de tout
      // bundler — nécessaire en dev/build Next.js, sans objet sous Vitest
      // (environnement Node pur, pas de risque de fuite client/serveur).
      'server-only': path.resolve(__dirname, './vitest.server-only-stub.ts'),
    },
  },
});
