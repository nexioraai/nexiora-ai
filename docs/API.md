# API Deribfy (nexiora-ai) — Référence

Documentation des routes API existantes sous `src/app/api/`, produite pour
satisfaire l'exigence "APIs documentées" de la Feuille de Route Maître
Deribfy (Section 10 — Environnement développeur).

**Méthode de production** : chaque route a été relue directement
(méthode HTTP, mécanisme d'authentification, objet manipulé) ; rien n'est
deviné à partir du seul nom de fichier. Le nombre de routes, leurs méthodes
et leur mécanisme d'auth ont été extraits par script (`scripts/check-api-docs.mjs`,
voir plus bas), puis complétés à la main pour l'objectif de chacune.

**Portée** : ce document décrit la surface API telle qu'elle existe
aujourd'hui. Il ne modifie aucune route, n'ajoute aucune validation, ne
change aucun comportement runtime.

**67 routes** au total (`find src/app/api -name route.ts | wc -l`), regroupées
ci-dessous par domaine. Légende authentification :

- **Public** — aucune authentification (visiteur du site marchand, ou route interne appelée sans identité utilisateur).
- **Utilisateur** — jeton Supabase Auth (`Authorization: Bearer <token>`), vérifié via `supabase.auth.getUser(token)`.
- **Propriétaire de site** — utilisateur authentifié + vérification qu'il possède le `site`/`slug` demandé (`requireSiteOwner()` ou motif équivalent inline).
- **Admin** — utilisateur authentifié + email dans une liste d'administrateurs (`ADMIN_EMAILS`).
- **Cron** — en-tête `Authorization: Bearer <CRON_SECRET>`, jamais un utilisateur.
- **Webhook** — secret partagé en paramètre de requête (Printful/Gelato) ou signature de charge utile (Stripe, `stripe-signature` + `STRIPE_WEBHOOK_SECRET`).

---

## 1. Boutique — parcours acheteur (public)

| Méthode | Chemin | Objectif | Auth |
|---|---|---|---|
| POST | `/api/shop/checkout` | Calcule le devis final (produits + livraison via `SupplierAdapter.calculateShipping`), crée la session de paiement chez le `PaymentProvider` du site. Body : `{slug, items, countryCode, shipmentTier}`. | Public |
| POST | `/api/shop/cancel-order` | Annulation par l'acheteur via un lien signé reçu par email — vérifie chez CJ que la commande n'est pas déjà expédiée, rembourse via `PaymentProvider.refundPayment`. | Public (token dans le lien) |
| GET | `/api/shop/promo/active` | Code promo actif à afficher en bannière pour un site (`?slug=`). | Public |
| POST | `/api/shop/promo/validate` | Valide un code promo saisi au panier, retourne le rabais applicable. Body : `{slug, code, subtotal}`. | Public |
| POST | `/api/shop/shipping/calculate` | Devis de livraison en temps réel par fournisseur, avec le pays de destination (`countryCode`) transmis à chaque adaptateur. | Public |
| POST | `/api/shipping-estimate` | Devis de livraison CJ seul (3 paliers eco/standard/express) pour un produit vers un pays — lit `shipping_cache` d'abord, appel CJ live en repli seulement. Body : `{siteId, countryCode, products}`. Le `vid` demandé doit appartenir à un produit du site qui soit **à la fois** `published = true` **et** `for_sale = true` — même conjonction que le checkout ; sinon `403`, avant le compteur de débit et avant toute acquisition de slot CJ. Le refus d'un produit non achetable n'est pas journalisé : c'est un état commercial normal, pas une anomalie. | Public |
| POST | `/api/shop/upload-design` | Upload d'un visuel personnalisé (POD) par le visiteur ; retourne l'URL publique de stockage. Multipart, limite 10 Mo. | Public |
| POST | `/api/checkout` | **Distinct du précédent** : abonnement du *marchand lui-même* à Deribfy (crée/réutilise un customer Stripe pour le `site`). | Utilisateur |
| POST | `/api/stripe/portal` | Ouvre le portail Stripe de gestion d'abonnement pour le marchand. Body : `{siteSlug}`. | Public (aucune vérification propriétaire trouvée — voir §8 Constats) |

## 2. Boutique — espace marchand (propriétaire de site)

| Méthode | Chemin | Objectif | Auth |
|---|---|---|---|
| GET, POST | `/api/shop/products` | Liste / création des produits boutique du marchand. Champs admis : `name, description, price, currency, images, stock, published, position, for_sale`. `for_sale` omis ⇒ `true` (DEFAULT PostgreSQL, jamais reposé côté applicatif). **Dette 6c** : l'interface marchande, elle, ne l'omet jamais — son formulaire de création part de `for_sale = false` et envoie toujours une valeur explicite, si bien que mettre en vente est un acte du marchand. Le DEFAULT SQL reste `true` et continue de répondre pour tout autre appelant. | Propriétaire |
| PATCH, DELETE | `/api/shop/products/[id]` | Modification / suppression d'un produit. Même allowlist de 9 champs que le POST. `published` porte la **visibilité** (vitrine, fiche produit, sitemap) ; `for_sale` porte l'**achetabilité** — le checkout exige `published = true AND for_sale = true`, si bien qu'un produit `published = true, for_sale = false` reste **visible mais non payable**. **Dette 6c** : cette achetabilité est désormais honorée par toutes les surfaces publiques, et plus seulement au paiement — la projection du catalogue public expose `forSale`, les cinq thèmes et la fiche produit n'affichent aucun chemin d'ajout au panier quand il vaut `false`, et `/api/shipping-estimate` refuse (403, dette 6b). Aucune surface ne FILTRE dessus : retirer de la vente n'est jamais dépublier. `track_inventory` et `stock_counted_at` restent exclus (étape 6) : ils passent par `/inventory`. | Propriétaire |
| POST, DELETE | `/api/shop/products/[id]/inventory` | Politique d'inventaire d'un produit. `POST {units}` déclare un **comptage** et active le suivi de stock (passe obligatoirement par la RPC `enable_stock_tracking`, jamais par une écriture directe de `track_inventory`) ; `DELETE` cesse le suivi (`track_inventory = false` seul, `stock_counted_at` jamais effacé). Volontairement séparée du PATCH générique : `track_inventory` et `stock_counted_at` sont exclus des allowlists de `/api/shop/products`. Codes : 400 `units` non entier/négatif, 403 site Mode 1, 404 produit inexistant ou hors propriété, 409 refus de la barrière de comptage. | Propriétaire |
| GET, PATCH | `/api/shop/orders` | Liste des commandes du site ; mise à jour (ex. tracking). | Propriétaire |
| GET, PATCH | `/api/shop/shipping` | Lecture/écriture de la configuration de livraison du site. | Propriétaire |
| GET | `/api/shop/finances` | Résumé financier (`?slug=&period=`) pour le tableau de bord marchand. | Propriétaire |
| POST | `/api/shop/connect` | Démarre l'onboarding paiement (aujourd'hui : Stripe Connect uniquement, `payment_provider` écrit en dur à `'stripe'`). | Utilisateur |
| GET | `/api/shop/connect/status` | État de l'onboarding paiement du site. | Utilisateur |

## 3. Catalogue produits

| Méthode | Chemin | Objectif | Auth |
|---|---|---|---|
| GET | `/api/catalog/search` | Recherche produit visiteur (sélection marchand puis catalogue global), 100 % Supabase. | Public |
| GET | `/api/catalog/variants` | Variantes d'un produit fournisseur (taille/couleur), interroge l'adaptateur du fournisseur concerné. | Public |
| POST | `/api/catalog/image-search` | Recherche visuelle assistée par IA (Anthropic) dans le catalogue. | Public |
| POST | `/api/catalog/curate` | Sélection IA de produits pertinents pour le type de commerce du site. | Propriétaire |
| POST | `/api/catalog/enhance` | Réécriture IA des fiches produit (titres/descriptions) sélectionnées par le marchand. | Propriétaire |
| GET, POST, PATCH, DELETE | `/api/catalog/selections` | CRUD des produits sélectionnés par le marchand pour sa boutique. | Propriétaire |

## 4. POD (Print-on-demand)

| Méthode | Chemin | Objectif | Auth |
|---|---|---|---|
| GET | `/api/pod/catalog` | Catalogue produits personnalisables d'un fournisseur POD (`?supplier=printful` par défaut). | Public |
| GET | `/api/pod/printfile-info` | Zone d'impression/gabarit d'un produit Printful (mise en cache mémoire). | Public |
| POST | `/api/pod/generate-mockups` | Génère les mockups visuels (produit + design client superposé). | Public |

## 5. Domaines personnalisés

| Méthode | Chemin | Objectif | Auth |
|---|---|---|---|
| POST | `/api/domains` | Rattache un domaine externe au projet Vercel du site. | Utilisateur |
| POST | `/api/domains/search` | Vérifie la disponibilité d'un nom de domaine (Porkbun), limité à 1 appel/10s (verrou en base, pas en mémoire — nécessaire car Vercel répartit les requêtes sur plusieurs instances). | Utilisateur |
| POST | `/api/domains/purchase` | Prépare l'achat (prix, exigences d'enregistrement, abonnement Stripe annuel) — **aucun achat Porkbun tant que le paiement n'est pas confirmé** (déclenché plus tard par le webhook Stripe). | Utilisateur |
| POST | `/api/domains/provision` | Provisionne un domaine déjà présent dans le compte Porkbun (transfert, ou achat hors Stripe) — n'achète rien. | Utilisateur + Cron |
| GET | `/api/domains/status` | État du domaine d'un site pour affichage marchand. | Utilisateur |
| POST | `/api/domains/renewal` | **Résilie ou réactive le renouvellement** d'un domaine. À ne pas confondre avec le détachement (`/api/domains`), qui retire le lien domaine ↔ site sans toucher à l'abonnement : **aucune des deux n'entraîne jamais l'autre**. Après résiliation, le domaine reste actif jusqu'à son expiration. | Propriétaire du site (`requireSiteOwner`) |

## 6. Génération de site / IA (Site Web)

| Méthode | Chemin | Objectif | Auth |
|---|---|---|---|
| POST | `/api/onboarding` | Conversation guidée de création de site (max 12 tours). | Utilisateur |
| POST | `/api/agent/[slug]/chat` | Assistant conversationnel sur le site publié — propose des modifications via un jeu d'outils whitelistés (`ALLOWED_TOOLS`). | Utilisateur |
| POST | `/api/agent/[slug]/apply` | Applique une proposition de l'assistant préalablement approuvée par le marchand. | Utilisateur |
| PATCH | `/api/sites/[slug]` | Modification directe des champs du site (mapping camelCase→snake_case). | Utilisateur |
| GET | `/api/ai-visibility` | Score de visibilité IA (interroge un LLM avec une question type sur le commerce, mesure la présence dans la réponse). | Cron |
| GET | `/api/backfill-hero` | Tâche ponctuelle : attribue une image hero (Pexels) aux sites qui n'en ont pas. | Cron |

## 7. Marketing & contenu

| Méthode | Chemin | Objectif | Auth |
|---|---|---|---|
| POST | `/api/marketing/generate` | Génère un post marketing (texte + image via GPT Image) à partir d'un brief. | Utilisateur |
| POST | `/api/blog/generate` | Génère un article du blog **de la plateforme** (`blog_posts`) sur un sujet donné. | **Administrateur de la plateforme** (`requirePlatformAdmin`), borné à 3 générations/minute (fail-closed) |
| POST | `/api/chat` | Chat général assistant (site + score IA). | Utilisateur |

### 7.1 Blog des sites clients (`site_blog_posts`)

> **Ne pas confondre avec le blog de la plateforme.** `POST /api/blog/generate` écrit dans
> `blog_posts` — le blog central de Deribfy, sans aucune colonne de site, réservé aux
> administrateurs de la plateforme. Les routes ci-dessous écrivent dans `site_blog_posts`,
> table dédiée au contenu éditorial **des sites clients**, rattachée par
> `site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE`.
> Deux tables, deux surfaces, deux régimes d'autorisation — aucune n'emprunte l'autre.

Le blog est une **capacité commune aux trois modes** (vitrine, boutique, dropshipping) :
aucune garde d'admission commerciale n'y est appliquée.

| Méthode | Chemin | Objectif | Auth |
|---|---|---|---|
| GET | `/api/blog/posts` | Liste les articles d'un site, **brouillons compris**. Le site est nommé par `?site=<slug>`. | Propriétaire du site (`requireSiteOwner`) |
| POST | `/api/blog/posts` | Crée un brouillon. Corps : `{ site, title, slug?, excerpt?, content?, cover_image?, published? }`. | Propriétaire du site (`requireSiteOwner`) |
| PATCH | `/api/blog/posts/[id]` | Modifie, publie ou dépublie un article. | Propriétaire de l'article (`requireArticleOwner`) |
| DELETE | `/api/blog/posts/[id]` | Supprime un article. | Propriétaire de l'article (`requireArticleOwner`) |
| POST | `/api/blog/posts/generate` | Génère un **brouillon** d'article par IA et le persiste. Corps : `{ site }`. Réutilise le moteur de prompts partagé avec `/api/marketing/generate` — aucun prompt n'est dupliqué. Le cache `marketing_briefs` est **lu, jamais écrit**. Aucune garde « site publié » : rédiger avant de publier son site est le parcours normal. Slug en collision : suffixé, pas refusé. Borné à 3 générations/minute et par site. | Propriétaire du site (`requireSiteOwner`) |
| POST | `/api/blog/posts/[id]/cover` | Téléverse la couverture d'un article (`multipart/form-data`, champ `file`). Bucket `site-images`, chemin **construit côté serveur** `blog/{site_id}/{uuid}.{ext}` — jamais fourni par le client. ≤ 5 Mo, JPEG/PNG/WebP/GIF/AVIF (pas de SVG), 10 téléversements/minute et par site. Remplacer une couverture retire l'ancienne. | Propriétaire de l'article (`requireArticleOwner`) |

**Invariants de ces quatre routes :**

- `site_id` n'est **jamais** lu du corps ni de l'URL. Il provient soit du site vérifié par
  `requireSiteOwner`, soit de l'article vérifié par `requireArticleOwner`.
- **Allowlist explicite** : seuls `title`, `slug`, `excerpt`, `content`, `cover_image` et
  `published` sont acceptés. `id`, `site_id`, `created_at`, `updated_at`, `published_at` et
  `cover_storage_path` sont structurellement inatteignables depuis le corps.
- `published_at` est **dérivé** de `published` par le serveur : posé à la première
  publication, jamais écrasé ensuite — antidater ferait mentir le `<lastmod>` du sitemap et
  le `datePublished` du JSON-LD.
- Le `slug` d'article est **normalisé** côté serveur, qu'il vienne du client ou du titre.
  Son unicité est `UNIQUE (site_id, slug)` : deux sites peuvent publier le même lien, deux
  articles d'un même site non — une collision rend **409**, jamais 500.
- Un article appartenant à un **autre locataire** rend **404**, indiscernable d'un article
  inexistant (anti-énumération). Un appelant non authentifié rend 401.
- Le champ `site` du corps et le paramètre `?site=` portent le **slug du site** ; `slug`
  désigne toujours le slug de l'**article**. Divergence assumée avec `/api/shop/products`,
  où `slug` nomme le site : un article possède son propre `slug`, deux sens pour une même
  clé dans une même charge utile seraient un défaut.

**Surfaces publiques correspondantes** (pages, pas routes d'API — hors portée de
`check-api-docs`) :

| Chemin | Origine plateforme | Domaine personnalisé |
|---|---|---|
| Index du blog | `/sites/{slug}/blog` | `mondomaine.com/blog` |
| Article | `/sites/{slug}/blog/{slug-article}` | `mondomaine.com/blog/{slug-article}` |

Ces deux formes sont servies par **le même fichier** : la réécriture existante de
`src/proxy.ts` préfixe déjà `/sites/{slug}` sur un domaine personnalisé — **le proxy
n'a pas été modifié**. Elles lisent la vue `site_blog_posts_public` sous la clé `anon`,
jamais la table : « article publié ET site publié ET site non archivé » est un invariant
**de la base**, pas de l'application. Le corps d'article est rendu en **texte** (jamais
`dangerouslySetInnerHTML`) et aucune des deux pages ne déclare `revalidate` — elles
résolvent le `Host`, un cache serait partagé entre locataires.

## 8. Administration

| Méthode | Chemin | Objectif | Auth |
|---|---|---|---|
| GET | `/api/admin/stats` | Statistiques globales plateforme. | Admin |
| GET | `/api/admin/ai-usage` | Coût/usage IA agrégé (tarifs Anthropic appliqués aux tokens loggés). | Admin |
| GET | `/api/admin/cron-runs` | Historique des exécutions cron (`cron-tracker`). | Admin |
| DELETE | `/api/account/delete` | Suppression du compte et des sites de l'utilisateur courant. | Utilisateur |

| GET | `/api/admin/system-health` | État de santé du système (résultats des vérifications remontées par la CI et les crons, entrées considérées périmées au-delà de 48 h). | Administrateur |
| POST | `/api/admin/site-archive-override` | Archive un site **en ignorant** les commandes non résolues (litige, commande réellement bloquée) — contourne délibérément la garde de `/api/sites/[slug]/archive`. Même patron d'autorisation admin que `ai-usage`/`cron-runs`/`stats`. | Administrateur |

## 9. Cron (tâches planifiées internes)

Toutes protégées par `Authorization: Bearer <CRON_SECRET>` sauf mention contraire. Jamais appelées par un utilisateur.

| Méthode | Chemin | Objectif |
|---|---|---|
| GET | `/api/cron/catalog-sync` | Synchronise les catalogues fournisseurs (CJ/Printful/Gelato) dans `catalog_products`. |
| GET | `/api/cron/catalog-suggest` | Suggestions hebdomadaires de produits tendance par site reseller. |
| GET | `/api/cron/cj-tracking` | Récupère quotidiennement les numéros de tracking CJ, envoie l'email d'expédition. |
| GET | `/api/cron/shipping-cache` | Précalcule le coût de livraison CJ (produit × pays) pour que le checkout ne dépende jamais d'un appel CJ en direct. |
| GET | `/api/cron/supplier-watch` | Compare l'état réel chez le fournisseur au cache local, alerte si écart bloquant. |
| GET | `/api/cron/domain-indexing` | Termine l'indexation Google des domaines (repasse jusqu'à propagation DNS complète). |
| GET | `/api/cron/domain-retry` | Reprend les provisionnements de domaine en échec (idempotent, max 5 tentatives). |
| GET | `/api/cron/instant-payout` | Déclenche un virement instantané si le solde plateforme Stripe dépasse 5 $. |
| GET | `/api/cron/pod-reconciliation` | Réconciliation fulfillment POD (P0-3.7→3.9.7) — voir `src/lib/fulfillment/`, déjà testé en détail dans les rounds précédents. |
| GET | `/api/cron/watchdog` | Vérifie que chaque cron a bien tourné dans sa fenêtre attendue, alerte sinon. |

| GET | `/api/cron/cj-fulfillment-reconciliation` | Reprend les commandes CJ payées restées sans commande fournisseur : nouvelle tentative de création tant que le budget `cj_pay_attempts` n'est pas épuisé, et reprise des verrous `processing` abandonnés. Ne crée jamais directement — `fulfillCjOrder()` réconcilie avant toute création. | `CRON_SECRET` |
| GET | `/api/cron/domain-indexing-byod` | Vérification de propriété Google et soumission de sitemap pour les domaines **BYOD** (le marchand possède sa propre zone DNS — contrairement au domaine acheté, Deribfy n'y écrit jamais). | `CRON_SECRET` |
| GET | `/api/cron/route-canary` | Canari de production sur les routes sensibles au routage (`sitemap.xml`, `robots.txt`), plateforme **et** domaine personnalisé. Ne vérifie pas la logique applicative (couverte par les tests) mais le routage réel en production. | `CRON_SECRET` |

## 10. Webhooks

| Méthode | Chemin | Objectif | Auth |
|---|---|---|---|
| POST | `/api/webhooks/printful` | Suivi de commande Printful — voir `src/lib/fulfillment/webhook-handler.ts`. | Secret partagé (query param) |
| POST | `/api/webhooks/gelato` | Suivi de commande Gelato, enrichi via `GET /v4/orders/{id}` — voir P0-3.9.6 Gap #1. | Secret partagé (query param) |
| POST | `/api/stripe/webhook` | Paiements d'abonnement plateforme (achat domaine, abonnement marchand). | Signature Stripe |
| POST | `/api/stripe/connect-webhook` | Paiements boutique (comptes connectés marchands) — secret de signature distinct du webhook ci-dessus. | Signature Stripe |

## 11. Divers

| Méthode | Chemin | Objectif | Auth |
|---|---|---|---|
| POST | `/api/contact` | Formulaire de contact, envoie un email (Resend). | Public |
| POST | `/api/welcome` | Email de bienvenue à l'inscription. | Public |
| POST | `/api/geocode` | Géocodage d'adresse (Nominatim/OpenStreetMap), appelé uniquement au blur d'un champ adresse. | Public |

---

| POST | `/api/sites/[slug]/archive` | Archive un site (remplace la suppression physique). **Bloque** tant qu'une commande n'est pas dans un statut sûr — RPC `archive_sites_if_no_blocking_orders`, tout-ou-rien. | Propriétaire |
| GET | `/api/internal/site-sitemap/[slug]` | Sitemap XML d'un site marchand. Placé **hors** de `src/app/sites/[slug]/` délibérément : un dossier `sitemap.xml` imbriqué sous `[slug]`, avec un catch-all frère, provoquait un 404/500 propre à la production Vercel. Atteint par réécriture depuis `src/proxy.ts`, jamais appelé directement. | Public (interne) |

## Constats (observations factuelles, non corrigées dans cette passe)

Cette section documente ce qui existe réellement, y compris des routes sans
authentification détectée. **Aucune de ces observations n'a été corrigée** —
cela sortirait du périmètre de cette tâche (documentation uniquement, aucune
modification fonctionnelle demandée).

- `/api/stripe/portal` : aucun mécanisme
  d'authentification détecté dans le code source à date de rédaction.
- `/api/checkout` (abonnement marchand → Deribfy) et `/api/shop/checkout`
  (achat client → boutique marchande) sont deux routes distinctes qui
  partagent un nom proche — à ne pas confondre lors de la lecture du code.

## Comment cette documentation reste à jour

`scripts/check-api-docs.mjs` compare la liste réelle des fichiers
`route.ts` sous `src/app/api/` à la liste des chemins référencés dans ce
document, et signale tout écart (route non documentée, ou entrée obsolète
pointant vers une route supprimée). Il ne vérifie pas le contenu de la
documentation (paramètres/réponses), seulement sa couverture.

```bash
node scripts/check-api-docs.mjs
```
