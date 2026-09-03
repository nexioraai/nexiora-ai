-- PHASE 2 -- DURCISSEMENT DES PRIVILEGES SUPABASE (anon / authenticated)
--
-- A executer manuellement dans l'editeur SQL Supabase -- meme convention que
-- lot_g_final_field_level_authorization.sql / shop_order_status_machine.sql /
-- design_uploads.sql (aucun outillage de migration automatise dans ce depot).
--
-- POURQUOI CE FICHIER EXISTE
-- Les 5 etapes ci-dessous ont ete executees et prouvees en production le
-- 2026-08-22, mais n'existaient jusqu'ici QUE dans cette base. Un nouvel
-- environnement Supabase serait reparti avec les ~162 privileges excedentaires
-- ET la fuite multi-tenant de admin_sites_by_mode. Ce script rend l'etat
-- reproductible.
--
-- Integralement IDEMPOTENT : les boucles n'agissent que sur ce qui existe
-- reellement, les ALTER/DROP sont conditionnels. Rejouable sans effet de bord.
--
-- ============================================================
-- CAUSE RACINE COMMUNE
-- ============================================================
-- Supabase provisionne `anon` et `authenticated` avec un GRANT large sur le
-- schema public, et des DEFAULT PRIVILEGES qui reappliquent ce grant a chaque
-- nouvelle table. RLS filtre les LIGNES, mais :
--   * TRUNCATE ne passe PAS par RLS (contournement total, par conception) ;
--   * REFERENCES / TRIGGER sont du DDL, jamais exposes par PostgREST ;
--   * un GRANT sans policy correspondante est mort, mais devient vivant a la
--     seconde ou quelqu'un ajoute une policy permissive ;
--   * EXECUTE sur une fonction SECURITY DEFINER contourne RLS integralement.
--
-- ============================================================
-- LIMITE CONNUE, NON CONTOURNABLE
-- ============================================================
-- 4 entrees de pg_default_acl appartiennent au role `supabase_admin`
-- (2 x TRUNCATE, 2 x REFERENCES/TRIGGER... voir etapes 1 et 2). `postgres`
-- n'est PAS membre de supabase_admin (verifie : pg_has_role(...) = false), il
-- ne peut donc pas les modifier. Toute table creee dans `public` PAR LA
-- PLATEFORME Supabase elle-meme recevra ces privileges.
-- MITIGATION RETENUE : un REVOKE explicite dans chaque script de creation de
-- table (patron design_uploads.sql). Empiriquement valide : au moment de
-- l'audit, 4 tables sur 31 etaient deja propres -- exactement celles creees
-- avec ce REVOKE.

-- ============================================================
-- ETAPE 1/5 -- TRUNCATE
-- Le SEUL privilege de cette campagne dont la revocation apporte un gain de
-- securite non redondant : TRUNCATE ignore RLS. Un porteur de la cle anon
-- publique pouvait vider une table entiere sans qu'aucune policy n'intervienne.
-- Etat initial mesure : 54 privileges (27 tables x 2 roles). Resultat : 0.
-- ============================================================

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, a.grantee::regrole::text AS role
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND a.privilege_type = 'TRUNCATE'
      AND a.grantee::regrole::text IN ('anon','authenticated')
  LOOP
    EXECUTE format('REVOKE TRUNCATE ON TABLE public.%I FROM %I', r.tbl, r.role);
  END LOOP;
END $$;

-- ============================================================
-- ETAPE 2/5 -- REFERENCES / TRIGGER
-- Privileges DDL, jamais exposes par PostgREST, jamais utilises par le depot.
-- Gain de securite conditionnel et non nul : REFERENCES permet un oracle
-- d'existence de lignes (la verification d'integrite d'une FK s'execute en
-- interne et ne passe pas par RLS) ; TRIGGER permet de greffer une fonction
-- sur une table tierce. Les deux exigent de pouvoir creer un objet, donc
-- CREATE sur un schema -- mesure a 0 pour anon/authenticated, et ces roles
-- sont NOLOGIN. Non exploitables en l'etat : ce sont des amplificateurs de
-- second etage (le jour ou une injection SQL atteint le role anon).
-- Etat initial mesure : 108 privileges (27 tables x 2 roles x 2). Resultat : 0.
-- ============================================================

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, a.grantee::regrole::text AS role, a.privilege_type AS priv
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND a.privilege_type IN ('REFERENCES','TRIGGER')
      AND a.grantee::regrole::text IN ('anon','authenticated')
  LOOP
    EXECUTE format('REVOKE %s ON TABLE public.%I FROM %I', r.priv, r.tbl, r.role);
  END LOOP;
END $$;

-- ============================================================
-- ETAPE 3/5 -- INSERT / UPDATE / DELETE
--
-- ATTENTION -- POINT LE PLUS DELICAT DE CE SCRIPT :
-- les grants de COLONNES du LOT G (41 colonnes UPDATE sur `sites` pour
-- authenticated) vivent dans pg_attribute.attacl, PAS dans pg_class.relacl.
-- has_table_privilege() renvoie true des qu'UNE colonne est concernee : un
-- REVOKE UPDATE de niveau table effacerait les 41 colonnes et casserait
-- l'editeur de site. La boucle itere donc sur aclexplode(relacl), ce qui rend
-- les grants de colonnes STRUCTURELLEMENT invisibles pour elle.
--
-- 3a. Revocation des privileges PROUVABLEMENT MORTS : RLS actif ET aucune
--     policy n'autorise ce verbe pour ce role => l'operation est deja refusee
--     aujourd'hui => la revocation est un no-op fonctionnel garanti.
-- ============================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, a.grantee::regrole::text AS role, a.privilege_type AS priv
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relrowsecurity                       -- RLS actif => deny par defaut
      AND a.privilege_type IN ('INSERT','UPDATE','DELETE')
      AND a.grantee::regrole::text IN ('anon','authenticated')
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies pol
        WHERE pol.schemaname = 'public' AND pol.tablename = c.relname
          AND (pol.cmd = a.privilege_type OR pol.cmd = 'ALL')
          AND pol.roles && ARRAY['public', a.grantee::regrole::text]::name[])
  LOOP
    EXECUTE format('REVOKE %s ON TABLE public.%I FROM %I', r.priv, r.tbl, r.role);
  END LOOP;
END $$;

-- 3b. Revocation des 12 privileges restants qui SURVIVAIENT a 3a parce qu'une
--     policy les autorisait -- mais qu'AUCUN code du depot n'utilise.
--     Recherche exhaustive (piege : 12 fichiers font
--     `import { supabaseAdmin as supabase }`, un grep naif sur `supabase.from`
--     produit des faux positifs massifs) :
--       catalog_products  -- 16 fichiers, 100% supabaseAdmin ; le navigateur
--                            ne fait que la LIRE (embedding PostgREST)
--       marketing_assets  -- marketing/generate/route.ts, supabaseAdmin
--       marketing_briefs  -- marketing/generate/route.ts, supabaseAdmin
--       messages          -- contact/route.ts cree son propre client avec
--                            SUPABASE_SERVICE_ROLE_KEY
--     Cas `messages` : sa policy portait `WITH CHECK true`, sans aucune
--     contrainte -- anon pouvait y inserer un volume arbitraire. Vecteur de
--     flood reel, ferme ici.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, a.grantee::regrole::text AS role, a.privilege_type AS priv
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname IN ('catalog_products','marketing_assets','marketing_briefs','messages')
      AND a.privilege_type IN ('INSERT','UPDATE','DELETE')
      AND a.grantee::regrole::text IN ('anon','authenticated')
  LOOP
    EXECUTE format('REVOKE %s ON TABLE public.%I FROM %I', r.priv, r.tbl, r.role);
  END LOOP;
END $$;

-- Seule ecriture legitime conservee : score_history / authenticated / INSERT
-- (src/app/edit/[slug]/page.tsx, client navigateur).

-- ============================================================
-- ETAPE 4/5 -- SELECT + isolation tenant de score_history
--
-- 4a. FAILLE REELLE CORRIGEE ICI. La policy d'INSERT de score_history portait
--     `WITH CHECK true`, alors que sa policy de SELECT filtrait correctement
--     par propriete :
--        SELECT : using = slug IN (SELECT slug FROM sites WHERE owner_email = jwt.email)
--        INSERT : check = true                                  <-- aucune isolation
--     Tout utilisateur authentifie pouvait donc inserer un historique de score
--     sur le slug de N'IMPORTE QUEL marchand (sans pouvoir le relire ensuite).
--     Classe de defaut identique aux LOTS G et J, passee inapercue parce que
--     nos audits portaient sur les routes et les privileges, jamais sur les
--     predicats WITH CHECK.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname='public' AND tablename='score_history'
               AND policyname='auth users can insert score history') THEN
    ALTER POLICY "auth users can insert score history" ON public.score_history
      WITH CHECK (slug IN (SELECT s.slug FROM public.sites s
                           WHERE s.owner_email = (auth.jwt() ->> 'email')));
  END IF;
END $$;

-- 4b. Revocation du SELECT hors allowlist.
--
--     L'ALLOWLIST CI-DESSOUS EST DERIVEE D'UNE ANALYSE DU DEPOT ET DOIT ETRE
--     RE-DERIVEE si un nouveau composant lit une table avec la cle anon.
--     Methode : les 20 usages de `supabaseAnon` sont TOUS des auth.getUser() ;
--     les seules lectures reelles avec la cle anon sont :
--       sites                    -- supabase-owned-site.ts, dashboard, parametres,
--                                   visibilite-ia, themes/shared.tsx
--       score_history            -- dashboard, visibilite-ia, edit/[slug]
--       profiles                 -- login/page.tsx
--       ai_visibility_checks     -- visibilite-ia
--       shop_products            -- sitemap, shared.tsx, fetchProduct.ts
--       site_catalog_selections  -- sitemap, shared.tsx, fetchProduct.ts
--       catalog_products         -- EMBEDDING PostgREST dans shared.tsx:204 et
--                                   fetchProduct.ts:38. Ne figure dans AUCUN
--                                   .from() anon : un REVOKE naif aurait casse
--                                   toutes les fiches produit.
--       blog_posts               -- sitemap
-- ============================================================
--     DEBT-073 (2026-08-26) -- CE CONSTAT ETAIT JUSTE ET INCOMPLET.
--
--     Les CINQ boucles de revocation de ce fichier ET ses CINQ requetes de
--     verification filtrent `relkind = 'r'` : les vues sont hors de portee du
--     correctif ET de sa preuve. Le raisonnement ci-dessous ne porte que sur
--     le SELECT ; il ne dit rien des privileges d'ECRITURE, qui etaient bel et
--     bien accordes a `anon` sur `sites_public` -- vue AUTO-MODIFIABLE en
--     `security_invoker = false`, donc ecrivant avec les droits de son
--     proprietaire, RLS de `sites` contournee.
--
--     CE FICHIER N'EST PAS MODIFIE : il documente l'etat deploye a SA date.
--     La correction et sa cause vivent dans `views_privileges_hardening.sql`.
--     Le rejouer reste sans danger -- mais il ne suffit PAS.
-- ============================================================
--     `sites_public` est une VUE (relkind='v') : hors de portee de la boucle,
--     mais elle depend de `sites`, conservee. Aucun usage realtime dans le
--     depot (verifie) -- aucune souscription ne depend d'un SELECT revoque.
--     Etat initial mesure : 60 privileges. Resultat : 16 (8 tables x 2 roles).

DO $$
DECLARE
  r record;
  allow text[] := ARRAY['sites','score_history','profiles','ai_visibility_checks',
                        'shop_products','site_catalog_selections','catalog_products','blog_posts'];
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, a.grantee::regrole::text AS role
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND a.privilege_type = 'SELECT'
      AND a.grantee::regrole::text IN ('anon','authenticated')
      AND NOT (c.relname = ANY(allow))
  LOOP
    EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM %I', r.tbl, r.role);
  END LOOP;
END $$;

-- ============================================================
-- ETAPE 5/5 -- EXECUTE sur les fonctions
--
-- AXE JAMAIS AUDITE AVANT CETTE PASSE. Les LOTS G/H/J/K portaient sur les
-- routes HTTP et les privileges de TABLES ; PostgreSQL accorde EXECUTE a
-- PUBLIC par defaut a la creation de toute fonction.
--
-- FUITE MULTI-TENANT REELLE, MESUREE PUIS FERMEE :
--   admin_sites_by_mode() -- SECURITY DEFINER (donc RLS neutralise), corps
--   `SELECT mode, dropship_type, COUNT(*) FROM sites GROUP BY ...` SANS AUCUN
--   WHERE, et EXECUTE herite de PUBLIC. Appelable par tout porteur de la cle
--   anon publique via POST /rest/v1/rpc/admin_sites_by_mode.
--   Preuve comportementale sous `SET LOCAL ROLE anon` (ce que fait PostgREST
--   a chaque requete) : 6 lignes retournees, somme des compteurs = 14 = la
--   TOTALITE des sites en base, tous proprietaires confondus.
--   Aucune occurrence dans le depot -> revocation sans risque de regression.
--   `SET search_path` ajoute : une fonction SECURITY DEFINER sans search_path
--   fige est vulnerable au shadowing (non exploitable ici, CREATE = 0 sur tous
--   les schemas pour anon/authenticated, mais fragilite latente).
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname='public' AND p.proname='admin_sites_by_mode' AND p.pronargs=0) THEN
    REVOKE EXECUTE ON FUNCTION public.admin_sites_by_mode() FROM PUBLIC, anon, authenticated;
    GRANT  EXECUTE ON FUNCTION public.admin_sites_by_mode() TO service_role;
    ALTER  FUNCTION public.admin_sites_by_mode() SET search_path = public, pg_temp;
  END IF;
END $$;

-- Residu de diagnostic sans aucun usage : retourne les entiers 1,2,3, ne lit
-- aucune table. Definition conservee ici pour recreation eventuelle :
--   CREATE FUNCTION public.test_return_query_behavior() RETURNS TABLE(n integer)
--   LANGUAGE plpgsql AS $f$ begin for i in 1..3 loop return query select i; end loop; end; $f$;
DROP FUNCTION IF EXISTS public.test_return_query_behavior();

-- Fonctions trigger (enforce_shop_order_status_transition,
-- reject_order_if_site_archived) : elles aussi conservaient EXECUTE herite de
-- PUBLIC, faute du patron REVOKE/GRANT dans leur script de creation.
-- Leur seul vecteur reel etait le privilege TRIGGER (greffer la fonction sur
-- une autre table pour en bloquer les ecritures), deja ferme a l'etape 2 --
-- le gain ici est l'alignement sur le patron du depot, pas la fermeture d'une
-- faille.
--
-- SECURITE DE CETTE OPERATION, PROUVEE ET NON SUPPOSEE : PostgreSQL exige
-- EXECUTE au CREATE TRIGGER, mais ne le re-verifie PAS au declenchement.
-- Verifie comportementalement sur cette base (2026-08-22) : table + fonction
-- trigger jetables, trigger installe, REVOKE ALL applique, INSERT declencheur
-- -> la fonction a bien tire malgre le REVOKE ; le tout annule par une
-- exception finale. Ce REVOKE ne peut donc pas casser les triggers existants.
--
-- Auto-calcule : cible toute fonction de `public` retournant `trigger` encore
-- accessible a anon/authenticated, sans dependre d'une liste de signatures.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype = 'trigger'::regtype
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;

-- ============================================================
-- VERIFICATION FINALE -- une seule ligne, a comparer aux valeurs de reference
-- obtenues en production le 2026-08-22.
-- ============================================================

SELECT format(
'truncate=%s | ref_trig=%s | ecritures=%s | select=%s | fn_exposees=%s | sr_select=%s | colonnes_sites_LOTG=%s | policies=%s',
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   CROSS JOIN (VALUES ('anon'),('authenticated')) x(role)
   WHERE n.nspname='public' AND c.relkind='r' AND has_table_privilege(x.role,c.oid,'TRUNCATE')),
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   CROSS JOIN (VALUES ('anon'),('authenticated')) x(role)
   CROSS JOIN (VALUES ('REFERENCES'),('TRIGGER')) p(priv)
   WHERE n.nspname='public' AND c.relkind='r' AND has_table_privilege(x.role,c.oid,p.priv)),
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE n.nspname='public' AND c.relkind='r' AND a.privilege_type IN ('INSERT','UPDATE','DELETE')
     AND a.grantee::regrole::text IN ('anon','authenticated')),
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE n.nspname='public' AND c.relkind='r' AND a.privilege_type='SELECT'
     AND a.grantee::regrole::text IN ('anon','authenticated')),
 (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND (has_function_privilege('anon',p.oid,'EXECUTE')
       OR has_function_privilege('authenticated',p.oid,'EXECUTE'))),
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r' AND has_table_privilege('service_role',c.oid,'SELECT')),
 (SELECT count(*) FROM pg_attribute a WHERE a.attrelid='public.sites'::regclass
   AND a.attnum>0 AND NOT a.attisdropped
   AND has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')),
 (SELECT count(*) FROM pg_policies WHERE schemaname='public')
) AS bilan_phase2;

-- REFERENCE PRODUCTION (2026-08-22, base nexiora-ai) :
--   truncate=0 | ref_trig=0 | ecritures=1 | select=16 | fn_exposees=0
--   | sr_select=31 | colonnes_sites_LOTG=41 | policies=19
--
-- (`fn_exposees` valait 2 avant le traitement des fonctions trigger ci-dessus.)
-- `sr_select`, `colonnes_sites_LOTG` et `policies` sont des TEMOINS HORS
-- PERIMETRE : ils doivent etre identiques avant et apres. Leurs valeurs
-- dependent de l'environnement (31 tables, 41 colonnes, 19 policies en
-- production) -- ce qui compte est qu'ils ne BOUGENT pas.
