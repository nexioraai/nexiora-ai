-- ============================================================
-- DEBT-071 -- LE BLOG CENTRAL DE DERIBFY NE SERT RIEN.
--
-- A executer manuellement dans l'editeur SQL Supabase (convention du dossier).
--
-- ------------------------------------------------------------
-- LE DEFAUT, MESURE EN PRODUCTION LE 2026-08-26
-- ------------------------------------------------------------
-- `blog_posts` porte bien le `GRANT SELECT` pour `anon` -- il figure meme dans
-- l'allowlist explicite de `phase2_privileges_hardening.sql` (l. 216, commentee
-- « blog_posts -- sitemap »). Mais la RLS y est active SANS AUCUNE POLICY
-- PERMISSIVE. Sondage direct :
--
--     service_role : blog_posts?published=eq.true  ->  5 articles
--     anon         : blog_posts?published=eq.true  ->  []          (HTTP 200)
--
-- UN GRANT SANS POLICY EST UN ZERO SILENCIEUX. Pas une erreur, pas un 403 :
-- un 200 vide. Les trois consommateurs utilisent le client anon
-- (`/blog`, `/blog/[slug]`, `sitemap.ts`) -- la liste est donc vide, les cinq
-- articles repondent 404, et le sitemap de la plateforme n'annonce aucune
-- route de blog. Personne ne l'a vu parce que rien n'echoue.
--
-- ------------------------------------------------------------
-- POURQUOI UNE POLICY, ET NON UNE VUE COMME `sites_public`
-- ------------------------------------------------------------
-- `sites_public` existe parce que `sites` porte 58 colonnes dont quatre
-- sensibles (owner_email, owner_id, stripe_customer_id, payment_account_id) :
-- il fallait PROJETER. `blog_posts` n'a que sept colonnes -- id, title, slug,
-- content, cover_image, published, created_at -- et aucune n'est sensible. Il
-- n'y a rien a masquer, donc rien a projeter.
--
-- Le depot applique deja exactement ce patron a `shop_products`
-- (« shop_products public read », SELECT conditionne a `published`). On reprend
-- la forme existante plutot que d'en inventer une seconde.
--
-- ------------------------------------------------------------
-- `published = true` STRICT, ET C'EST DELIBERE
-- ------------------------------------------------------------
-- La colonne est NULLABLE (verifie : `published boolean`, sans NOT NULL).
-- `published IS NOT FALSE` exposerait donc toute ligne dont `published` vaut
-- NULL. `/api/blog/generate` ecrit explicitement `published: false`, mais une
-- ligne ancienne ou une insertion future qui omettrait la colonne passerait.
-- Le strict est la seule lecture qui ne depende pas de ce qu'on suppose des
-- donnees.
--
-- ------------------------------------------------------------
-- CE QUE CE FICHIER NE FAIT PAS
-- ------------------------------------------------------------
--   * il n'ecrit AUCUNE donnee ;
--   * il ne touche ni les grants, ni la RLS, ni aucune autre table ;
--   * il ne cree AUCUNE policy d'ecriture. `blog_posts` reste ecrite
--     exclusivement par `/api/blog/generate` sous `service_role`, derriere
--     `requirePlatformAdmin`.
--
-- ============================================================
-- /!\  DECISION PRODUIT A PRENDRE AVANT D'EXECUTER  /!\
-- ============================================================
-- Trois des cinq articles publies portent L'ANCIENNE MARQUE « Nexiora » dans
-- leur titre ou leur lien :
--
--   * « Nexiora, le generateur de site web IA pour entrepreneurs »
--   * « Creer un site web au Tchad et en Afrique en 45 secondes avec Nexiora »
--   * « Comment creer un site vitrine ... avec Nexiora »
--
-- Executer ce fichier tel quel les rend PUBLICS sur deribfy.com. Ce n'est pas
-- un defaut technique -- c'est un choix editorial, et il n'appartient pas a ce
-- fichier de le faire a votre place.
--
-- SI VOUS VOULEZ LES GARDER MASQUES, executer D'ABORD ce bloc, puis la policy.
-- Il est REVERSIBLE (`set published = true`) et ne supprime rien -- les
-- articles redeviennent des brouillons, reecrivables puis republiables.
--
--   UPDATE public.blog_posts
--      SET published = false
--    WHERE slug IN (
--      'nexiora-le-generateur-de-site-web-ia-pour-entrepreneurs',
--      'creer-site-vitrine-boutique-en-ligne-dropshipping-canada-amerique-du-nord',
--      'creer-site-web-tchad-afrique-45-secondes-nexiora'
--    );
--
-- Les deux articles restants ne nomment aucune marque.
-- ============================================================


-- ============================================================
-- 1/2 -- LA POLICY. Idempotente : DROP IF EXISTS puis CREATE, rejouable sans
-- erreur. Aucune autre policy de la base n'est touchee.
-- ============================================================
DROP POLICY IF EXISTS "blog_posts public read" ON public.blog_posts;

CREATE POLICY "blog_posts public read"
  ON public.blog_posts FOR SELECT
  TO anon, authenticated
  USING (published = true);


-- ============================================================
-- 2/2 -- VERIFICATIONS (lecture seule) -- a executer et me renvoyer.
-- ============================================================

-- A. La policy existe, et elle est la SEULE sur cette table.
--    ATTENDU : 1 ligne -- cmd = SELECT, roles = {anon,authenticated},
--    qual = (published = true).
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'blog_posts'
ORDER BY policyname;

-- B. Les grants n'ont pas bouge. ATTENDU : SELECT pour anon ET authenticated,
--    et RIEN d'autre -- aucun INSERT/UPDATE/DELETE ne doit apparaitre.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'blog_posts'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;

-- C. La RLS reste active, et NON forcee.
--    ATTENDU : relrowsecurity = true, relforcerowsecurity = false.
SELECT relrowsecurity, relforcerowsecurity
FROM pg_class WHERE relname = 'blog_posts';

-- D. Ce que la policy laisse voir, vu depuis la base.
--    ATTENDU : `publies` = le nombre d'articles a `published = true`,
--    `brouillons_ou_null` = tous les autres. Seuls les premiers seront
--    servis a `anon`.
SELECT count(*) FILTER (WHERE published = true)      AS publies,
       count(*) FILTER (WHERE published IS NOT TRUE) AS brouillons_ou_null,
       count(*)                                      AS total
FROM public.blog_posts;
