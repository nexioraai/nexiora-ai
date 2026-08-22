-- ============================================================
-- LOT G (Mode 3 global, CRIT-1/CRIT-2) — SCRIPT FINAL DE CLÔTURE.
-- Consolide et remplace les fragments précédents. A exécuter manuellement
-- dans l'éditeur SQL Supabase. IDEMPOTENT : sûr à ré-exécuter intégralement
-- même si une partie a déjà été appliquée lors d'un tour précédent
-- (REVOKE d'un privilège déjà absent = no-op ; GRANT d'un privilège déjà
-- présent = no-op — aucune erreur, aucun effet de bord).
--
-- Revérifié contre le schéma RÉEL (introspection PostgREST en direct,
-- pas de mémoire) juste avant ce script :
--   sites         : 59 colonnes réelles, 18 protégées, 41 autorisées.
--   shop_products : 13 colonnes réelles, 0 chemin d'écriture client légitime
--                   (100% des écritures passent par service_role, confirmé
--                   par lecture de shop/products/route.ts et [id]/route.ts).
-- ============================================================

-- ------------------------------------------------------------
-- 1/4 — sites : REVOKE complet puis GRANT explicite (allowlist).
-- ------------------------------------------------------------
REVOKE UPDATE, INSERT, DELETE ON TABLE sites FROM anon, authenticated;

-- Les 41 colonnes légitimement éditables par le propriétaire du site
-- (contenu/branding/paramètres marchand — jamais un champ touchant
-- l'identité, le financier ou le sous-mode). Recalculées programmatiquement
-- contre le schéma réel, pas recopiées d'une version antérieure.
GRANT UPDATE (
  about, address, area_served, catalog_markup, cj_margin_percent, cj_round_mode,
  contact, cta, faq, gallery, geo_lat, geo_lng, hero_image, hero_subtitle,
  hero_title, hidden_sections, hours, lang, menu, mission, name, niche_keywords,
  pages, pod_designs, price_range, primary_color, product_families, products,
  published, section_label, sections, services, shipping_flat, slogan,
  social_links, team, testimonials, theme, type, vision, whyus
) ON TABLE sites TO authenticated;

-- Aucun GRANT INSERT/DELETE ré-ajouté : recherche exhaustive confirmée --
-- la création de site passe exclusivement par chat/route.ts (service_role),
-- aucune suppression client de sites n'existe (archivage via RPC dédiée
-- archive_sites_if_no_blocking_orders, jamais un DELETE direct).

-- ------------------------------------------------------------
-- 2/4 — shop_products : REVOKE complet, AUCUN regrant.
-- ------------------------------------------------------------
REVOKE UPDATE, INSERT, DELETE ON TABLE shop_products FROM anon, authenticated;
-- Pas de GRANT : 100% des écritures (création, modification, publication,
-- stock) passent par supabaseAdmin (service_role) dans les routes API
-- serveur, jamais par un accès PostgREST direct du navigateur.

-- ------------------------------------------------------------
-- 3/4 — VÉRIFICATIONS DÉCLARATIVES (lecture seule) — à exécuter et
-- me renvoyer intégralement.
-- ------------------------------------------------------------

-- A. Grants de table réels sur sites/shop_products pour anon/authenticated.
-- Attendu : AUCUNE ligne INSERT/DELETE pour anon ou authenticated, sur
-- aucune des 2 tables. UPDATE : présent uniquement pour authenticated sur
-- sites (colonnes restreintes, voir B) ; absent partout ailleurs.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name IN ('sites', 'shop_products')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

-- B. Colonnes réellement couvertes par le GRANT UPDATE de authenticated sur
-- sites. Attendu : exactement 41 lignes, aucune des 18 colonnes protégées
-- n'apparaît (dropship_type, mode, owner_id, owner_email,
-- payment_account_id, stripe_customer_id, id, slug, created_at,
-- archived_at, payment_provider, subscription_status, custom_domain,
-- custom_domain_google_attempts, custom_domain_google_last_attempt_at,
-- custom_domain_google_last_error, custom_domain_google_status,
-- custom_domain_google_token).
SELECT column_name
FROM information_schema.column_privileges
WHERE table_name = 'sites' AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
ORDER BY column_name;

-- C. RLS inchangée (ne doit jamais avoir été modifiée par ce lot).
-- Attendu : identique à la preuve déjà fournie précédemment (5 policies sur
-- sites, UPDATE avec qual/with_check = owner_id = auth.uid()).
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('sites', 'shop_products')
ORDER BY tablename, policyname;

-- D. service_role non affecté (REVOKE FROM anon, authenticated ne touche
-- jamais les grants d'un autre rôle) — confirme l'absence de ligne
-- service_role dans la liste des rôles restreints ci-dessus (déjà couvert
-- par la requête A, qui filtre explicitement sur anon/authenticated).

-- ------------------------------------------------------------
-- 4/4 — TEST HOSTILE RÉEL (pas seulement déclaratif) : exécute de vraies
-- tentatives d'écriture SOUS L'IDENTITÉ anon/authenticated/service_role via
-- SET ROLE, sur des lignes qui n'existent pas (WHERE false) — le contrôle
-- de privilège PostgreSQL sur les colonnes du SET clause s'applique AVANT
-- toute évaluation du WHERE, donc ce test est probant même sans jamais
-- toucher une ligne réelle. Chaque échec attendu est capturé (le script ne
-- s'interrompt jamais) ; un comportement inattendu lève une erreur explicite
-- et arrête le bloc à l'endroit précis du problème. A exécuter et me
-- renvoyer TOUS les messages NOTICE produits.
-- ------------------------------------------------------------
DO $$
DECLARE
  forbidden_cols text[] := ARRAY[
    'dropship_type','mode','owner_id','owner_email','payment_account_id','stripe_customer_id',
    'id','slug','created_at','archived_at','payment_provider','subscription_status',
    'custom_domain','custom_domain_google_attempts','custom_domain_google_last_attempt_at',
    'custom_domain_google_last_error','custom_domain_google_status','custom_domain_google_token'
  ];
  col text;
BEGIN
  ------------------------------------------------------------
  -- SITES — anon : UPDATE/INSERT/DELETE doivent TOUS échouer (aucun grant).
  ------------------------------------------------------------
  EXECUTE 'SET ROLE anon';

  BEGIN
    UPDATE sites SET name = name WHERE false;
    RAISE EXCEPTION 'TEST FAILED: anon a pu tenter un UPDATE sur sites (meme une colonne autorisee a authenticated)';
  EXCEPTION
    WHEN insufficient_privilege THEN RAISE NOTICE 'OK sites/anon/UPDATE : refuse (%).', SQLERRM;
  END;

  BEGIN
    INSERT INTO sites (id) VALUES (gen_random_uuid());
    RAISE EXCEPTION 'TEST FAILED: anon a pu tenter un INSERT sur sites';
  EXCEPTION
    WHEN insufficient_privilege THEN RAISE NOTICE 'OK sites/anon/INSERT : refuse (%).', SQLERRM;
  END;

  BEGIN
    DELETE FROM sites WHERE false;
    RAISE EXCEPTION 'TEST FAILED: anon a pu tenter un DELETE sur sites';
  EXCEPTION
    WHEN insufficient_privilege THEN RAISE NOTICE 'OK sites/anon/DELETE : refuse (%).', SQLERRM;
  END;

  EXECUTE 'RESET ROLE';

  ------------------------------------------------------------
  -- SITES — authenticated : chacune des 18 colonnes protegees doit refuser
  -- l'UPDATE ; une colonne autorisee (name) doit au contraire reussir.
  ------------------------------------------------------------
  EXECUTE 'SET ROLE authenticated';

  FOREACH col IN ARRAY forbidden_cols LOOP
    BEGIN
      EXECUTE format('UPDATE sites SET %I = %I WHERE false', col, col);
      RAISE EXCEPTION 'TEST FAILED: authenticated a pu tenter un UPDATE sur sites.%', col;
    EXCEPTION
      WHEN insufficient_privilege THEN RAISE NOTICE 'OK sites/authenticated/UPDATE(%) : refuse.', col;
    END;
  END LOOP;

  BEGIN
    UPDATE sites SET name = name WHERE false;
    RAISE NOTICE 'OK sites/authenticated/UPDATE(name) : autorise comme attendu (0 ligne affectee, id inexistant).';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'TEST FAILED: authenticated NE PEUT PLUS modifier sites.name -- regression fonctionnelle (Navbar.tsx casserait).';
  END;

  BEGIN
    INSERT INTO sites (id) VALUES (gen_random_uuid());
    RAISE EXCEPTION 'TEST FAILED: authenticated a pu tenter un INSERT sur sites';
  EXCEPTION
    WHEN insufficient_privilege THEN RAISE NOTICE 'OK sites/authenticated/INSERT : refuse (%).', SQLERRM;
  END;

  BEGIN
    DELETE FROM sites WHERE false;
    RAISE EXCEPTION 'TEST FAILED: authenticated a pu tenter un DELETE sur sites';
  EXCEPTION
    WHEN insufficient_privilege THEN RAISE NOTICE 'OK sites/authenticated/DELETE : refuse (%).', SQLERRM;
  END;

  EXECUTE 'RESET ROLE';

  ------------------------------------------------------------
  -- SHOP_PRODUCTS — anon ET authenticated : UPDATE/INSERT/DELETE doivent
  -- TOUS echouer (aucun grant, aucune exception).
  ------------------------------------------------------------
  FOREACH col IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    EXECUTE format('SET ROLE %I', col);

    BEGIN
      UPDATE shop_products SET price = price WHERE false;
      RAISE EXCEPTION 'TEST FAILED: % a pu tenter un UPDATE sur shop_products', col;
    EXCEPTION
      WHEN insufficient_privilege THEN RAISE NOTICE 'OK shop_products/%/UPDATE : refuse (%).', col, SQLERRM;
    END;

    BEGIN
      INSERT INTO shop_products (id) VALUES (gen_random_uuid());
      RAISE EXCEPTION 'TEST FAILED: % a pu tenter un INSERT sur shop_products', col;
    EXCEPTION
      WHEN insufficient_privilege THEN RAISE NOTICE 'OK shop_products/%/INSERT : refuse (%).', col, SQLERRM;
    END;

    BEGIN
      DELETE FROM shop_products WHERE false;
      RAISE EXCEPTION 'TEST FAILED: % a pu tenter un DELETE sur shop_products', col;
    EXCEPTION
      WHEN insufficient_privilege THEN RAISE NOTICE 'OK shop_products/%/DELETE : refuse (%).', col, SQLERRM;
    END;

    EXECUTE 'RESET ROLE';
  END LOOP;

  ------------------------------------------------------------
  -- service_role : doit rester INTACT sur les 2 tables (REVOKE FROM
  -- anon, authenticated ne touche jamais un autre role) -- verifie une
  -- colonne protegee de sites ET shop_products, aucune ligne reelle.
  ------------------------------------------------------------
  EXECUTE 'SET ROLE service_role';

  BEGIN
    UPDATE sites SET dropship_type = dropship_type WHERE false;
    RAISE NOTICE 'OK sites/service_role/UPDATE(dropship_type) : toujours autorise comme attendu.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'TEST FAILED: service_role a perdu UPDATE sur sites -- le backend applicatif casserait entierement.';
  END;

  BEGIN
    UPDATE shop_products SET price = price WHERE false;
    RAISE NOTICE 'OK shop_products/service_role/UPDATE(price) : toujours autorise comme attendu.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'TEST FAILED: service_role a perdu UPDATE sur shop_products -- shop/products/route.ts casserait entierement.';
  END;

  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'TOUS LES TESTS HOSTILES LOT G ONT REUSSI.';
END $$;
