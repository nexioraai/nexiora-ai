-- ============================================================
-- DEBT-073 -- LES VUES N'ONT JAMAIS ETE DURCIES, ET LE CONTROLE NON PLUS.
--
-- A executer manuellement dans l'editeur SQL Supabase (convention du dossier).
--
-- ------------------------------------------------------------
-- CE QUI EST ARRIVE, ET COMMENT ON L'A SU
-- ------------------------------------------------------------
-- Supabase pose `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon,
-- authenticated, service_role` sur le schema `public`. Or `ON TABLES` couvre
-- AUSSI les vues : tout nouvel objet nait avec le jeu complet.
--
-- `phase2_privileges_hardening.sql` revoquait ces privileges -- mais ses CINQ
-- boucles de revocation (l. 61, 93, 125, 161, 233) ET ses CINQ requetes de
-- verification (l. 321, 325, 328, 332, 339) filtrent toutes `relkind = 'r'`,
-- c'est-a-dire les tables ordinaires SEULES. L'angle mort etait donc dans le
-- correctif ET dans sa preuve : le controle ne pouvait pas voir ce que le
-- correctif ne couvrait pas. Le fichier le note d'ailleurs a la ligne 217
-- (« `sites_public` est une VUE (relkind='v') : hors de portee de la boucle »)
-- mais n'y voit qu'une question de SELECT, jamais d'ecriture.
--
-- CONSEQUENCE MESUREE LE 2026-08-26 : `sites_public` -- AUTO-MODIFIABLE (une
-- seule relation dans son FROM, aucun agregat) et en `security_invoker = false`
-- -- portait `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`
-- pour `anon` ET pour `authenticated`. Les ecritures s'executant avec les
-- droits du PROPRIETAIRE de la vue, elles contournaient la RLS de `sites` et
-- les grants de colonnes du LOT G : un visiteur ANONYME pouvait modifier ou
-- supprimer les lignes des trois vitrines publiees.
--
-- La preuve n'a exige AUCUNE ecriture : `anon` lit 3 lignes de `sites_public`
-- alors que `sites` lui en rend 0. La seule policy SELECT de `sites` etant
-- `TO authenticated USING (owner_id = auth.uid())`, cette lecture n'est
-- possible que si le proprietaire de la vue contourne la RLS -- et le meme
-- mecanisme vaut mot pour mot pour UPDATE et DELETE.
--
-- LA MANIFESTATION EST DEJA FERMEE : `revoke all` + `grant select` ont ete
-- appliques aux deux vues existantes le 2026-08-26. CE FICHIER FERME LA CAUSE.
--
-- ------------------------------------------------------------
-- CE QUE CE FICHIER NE FAIT PAS, ET C'EST DELIBERE
-- ------------------------------------------------------------
--   * il NE touche AUCUNE table. Les 41 colonnes UPDATE de `sites` (LOT G),
--     l'INSERT de `score_history` et l'allowlist SELECT de `phase2` sont hors
--     de sa portee : il ne parle que de `relkind IN ('v','m')` et de defauts ;
--   * il NE revoque PAS le SELECT. Une vue publique existe POUR etre lue --
--     `sites_public` et `site_blog_posts_public` sont la surface publique du
--     produit. La dette porte sur l'ECRITURE, et le retrecissement s'arrete
--     ou la dette s'arrete ;
--   * il NE modifie PAS `phase2_privileges_hardening.sql`, qui documente
--     l'etat deploye a SA date. Un commentaire y renvoie desormais ici.
--
-- ENTIEREMENT RESTRICTIF ET REJOUABLE : aucun GRANT n'est pose, aucune donnee
-- n'est lue ni ecrite, aucune policy n'est creee ni supprimee. Le rejouer sur
-- une base deja corrigee n'affiche aucun NOTICE et ne change rien.
--
-- ------------------------------------------------------------
-- CE QUE LA PREMIERE EXECUTION A APPRIS (2026-08-26)
-- ------------------------------------------------------------
-- Le bloc 2 a echoue en 42501 :
--
--   permission denied to change default privileges
--   CONTEXT: ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
--            REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--            ON TABLES FROM anon, authenticated
--
-- DEUX FAITS, ET LE PREMIER VALIDE LA CONCEPTION :
--
--   1. Le defaut fautif appartient a `supabase_admin`, PAS a `postgres`.
--      Un `ALTER DEFAULT PRIVILEGES IN SCHEMA public ...` ecrit EN DUR aurait
--      vise le role COURANT (`postgres`), REUSSI SILENCIEUSEMENT, et laisse la
--      cause intacte. C'est precisement pour cela que ce bloc decouvre le role
--      dans `pg_default_acl` au lieu de le supposer.
--
--   2. Le role de l'editeur SQL (`postgres`) N'A PAS le droit de modifier les
--      defauts d'un AUTRE role : il n'est ni superutilisateur, ni membre de
--      `supabase_admin`. Ce defaut est une configuration de la PLATEFORME
--      Supabase, hors de portee d'une session SQL ordinaire.
--
-- LE BLOC 2 EST DONC DESORMAIS FAIL-SOFT : un refus sur un role est capture,
-- NOMME, et n'interrompt plus le balayage -- sans quoi un role inaccessible
-- masquerait tous les roles qui, eux, sont corrigeables.
--
-- AUCUNE DONNEE N'A ETE MODIFIEE PAR CET ECHEC : verifie apres coup --
-- `sites_public` rend toujours 3 lignes a `anon`, `sites` en rend 0, et
-- `service_role` voit ses 14 sites.
-- ============================================================


-- ============================================================
-- 1/3 -- LES VUES EXISTANTES : ecriture revoquee, lecture conservee.
--
-- Generalise a TOUTE vue et vue materialisee de `public`, presente ou future.
-- Sur les deux vues deja corrigees, ce bloc est un no-op -- et c'en est la
-- preuve : il n'affichera aucun NOTICE.
-- ============================================================
DO $$
DECLARE
  r record;
  n_revoques int := 0;
BEGIN
  FOR r IN
    SELECT c.relname            AS obj,
           c.relkind::text      AS kind,
           a.grantee::regrole::text AS role,
           a.privilege_type     AS priv
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE n.nspname = 'public'
      AND c.relkind IN ('v', 'm')
      AND a.privilege_type <> 'SELECT'
      AND a.grantee::regrole::text IN ('anon', 'authenticated')
  LOOP
    RAISE NOTICE 'REVOKE % ON public.% (relkind=%) FROM %', r.priv, r.obj, r.kind, r.role;
    EXECUTE format('REVOKE %s ON TABLE public.%I FROM %I', r.priv, r.obj, r.role);
    n_revoques := n_revoques + 1;
  END LOOP;

  IF n_revoques = 0 THEN
    RAISE NOTICE 'Aucun privilege d''ecriture sur une vue : etat deja conforme.';
  ELSE
    RAISE NOTICE '% privilege(s) d''ecriture revoque(s) sur des vues.', n_revoques;
  END IF;
END $$;


-- ============================================================
-- 2/3 -- LA CAUSE : les privileges PAR DEFAUT.
--
-- POURQUOI UN BLOC DYNAMIQUE PLUTOT QU'UN `ALTER DEFAULT PRIVILEGES` ECRIT EN
-- DUR. Un defaut appartient au ROLE QUI CREE l'objet (`pg_default_acl.
-- defaclrole`). Ecrire `ALTER DEFAULT PRIVILEGES IN SCHEMA public ...` sans
-- `FOR ROLE` ne vise que le role COURANT : si Supabase a pose le sien pour
-- `supabase_admin`, l'instruction paraitrait reussir et ne changerait RIEN --
-- une garde presente mais qui ne s'applique pas, exactement la classe de
-- defaut que ce depot proscrit. Ce bloc lit donc le catalogue et vise le bon
-- role, quel qu'il soit.
--
-- `defaclobjtype = 'r'` designe la classe RELATION -- tables ET vues
-- partagent le meme defaut. C'est precisement le mecanisme du defaut.
--
-- SELECT EST CONSERVE dans le defaut : le retirer obligerait toute migration
-- future a poser un GRANT explicite, ce qui est defendable mais depasse cette
-- dette. La question ouverte est consignee au bas de ce fichier.
--
-- SI CE BLOC N'AFFICHE AUCUNE LIGNE, C'EST UNE INFORMATION EN SOI : les
-- privileges ne viennent alors pas de `pg_default_acl` et la cause est
-- ailleurs. Ne pas conclure a une correction dans ce cas -- me le renvoyer.
-- ============================================================
DO $$
DECLARE
  r record;
  n_defauts  int := 0;
  n_corriges int := 0;
  n_refuses  int := 0;
  -- PERIMETRE : les ECRITURES DE DONNEE, et elles seules. `MAINTAIN`
  -- (PostgreSQL 17) autorise VACUUM/ANALYZE/REINDEX/REFRESH -- ce n'est pas
  -- une ecriture, et DEBT-073 ne le vise pas. Il avait ete ajoute ici sur une
  -- attribution erronee, corrigee depuis : `postgres` porte `MAINTAIN, SELECT`
  -- et AUCUN privilege d'ecriture.
  privs text := 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER';
BEGIN
  RAISE NOTICE 'PostgreSQL % -- privileges vises : %',
               current_setting('server_version'), privs;
  FOR r IN
    SELECT DISTINCT
           d.defaclrole::regrole::text AS createur,
           n.nspname                   AS sch
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE n.nspname = 'public'
      AND d.defaclobjtype = 'r'
      AND a.grantee::regrole::text IN ('anon', 'authenticated')
      -- ECRITURES SEULES. `<> 'SELECT'` retenait aussi `MAINTAIN` et faisait
      -- donc paraitre `postgres` fautif alors qu'il ne porte rien d'ecriture.
      AND a.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
  LOOP
    n_defauts := n_defauts + 1;
    -- Tracer CE QUE LE CURSEUR VOIT : sans cela, un « 0 fautif » reste
    -- indemontrable, et c'est precisement ce qui a rendu la derniere
    -- execution incoherente avec l'inventaire.
    RAISE NOTICE 'FAUTIF : role createur % (schema %)', r.createur, r.sch;
    BEGIN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I '
        'REVOKE %s ON TABLES FROM anon, authenticated',
        r.createur, r.sch, privs);
      n_corriges := n_corriges + 1;
      RAISE NOTICE 'CORRIGE : defauts d''ecriture retires pour le role createur %', r.createur;
    EXCEPTION WHEN insufficient_privilege THEN
      -- Un refus sur UN role ne doit pas masquer les autres. `postgres` n'est
      -- ni superutilisateur ni membre de `supabase_admin` : les defauts de ce
      -- dernier relevent de la configuration de la plateforme.
      n_refuses := n_refuses + 1;
      RAISE NOTICE 'HORS DE PORTEE : le role % ne peut pas etre modifie depuis cette session (42501). '
                   'Ses defauts sont une configuration Supabase, pas du SQL applicatif.', r.createur;
    END;
  END LOOP;

  IF n_defauts = 0 THEN
    RAISE NOTICE 'Aucun privilege d''ecriture par defaut trouve dans pg_default_acl pour public. '
                 'Soit l''etat est deja conforme, soit la source des grants est AILLEURS : '
                 'ne pas conclure a une correction sans avoir verifie le bloc 3.';
  ELSE
    RAISE NOTICE 'Bilan defauts : % role(s) fautif(s), % corrige(s), % hors de portee.',
                 n_defauts, n_corriges, n_refuses;
  END IF;

  -- ETABLI PAR EXECUTION LE 2026-08-26 : `ALTER DEFAULT PRIVILEGES FOR ROLE
  -- supabase_admin` est REFUSE en 42501, et `pg_has_role(current_user,
  -- 'supabase_admin', 'MEMBER')` rend `false`. PostgreSQL exige d'etre membre
  -- du role vise, ou superutilisateur -- `postgres` n'est ni l'un ni l'autre
  -- chez Supabase. Ce n'est PAS une reussite silencieuse : l'instruction
  -- LEVE. Mais un bilan lu trop vite pourrait le confondre avec un succes.
  --
  -- CET AVERTISSEMENT REND CETTE CONFUSION IMPOSSIBLE : tant qu'un role reste
  -- hors de portee, la CAUSE n'est pas fermee pour les objets que CE role
  -- creerait, et il faut l'ecrire ainsi.
  IF n_refuses > 0 THEN
    RAISE WARNING 'DEBT-073 NON FERMEE POUR % ROLE(S). Leurs defauts relevent de la '
                  'configuration de la plateforme Supabase, pas du SQL applicatif : aucune '
                  'session `postgres` ne peut les modifier. Ne pas conclure a une resolution. '
                  'Portee reelle : les objets crees par les MIGRATIONS de ce depot le sont par '
                  '`postgres` -- ce sont donc les defauts de `postgres` qui les gouvernent, et '
                  'eux seuls doivent etre corriges ici.', n_refuses;
  END IF;
END $$;


-- ============================================================
-- 3/3 -- VERIFICATIONS (lecture seule) -- a executer et me renvoyer.
-- ============================================================

-- A. Toutes les vues et vues materialisees de `public`.
--    ATTENDU : `privileges = SELECT` pour anon ET authenticated, sur chacune.
--    Toute autre valeur signale un privilege d'ecriture restant.
SELECT c.relname                      AS vue,
       c.relkind::text                AS type,
       c.reloptions                   AS options,
       a.grantee::regrole::text       AS role,
       string_agg(a.privilege_type, ', ' ORDER BY a.privilege_type) AS privileges
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) a
WHERE n.nspname = 'public'
  AND c.relkind IN ('v', 'm')
  AND a.grantee::regrole::text IN ('anon', 'authenticated')
GROUP BY c.relname, c.relkind, c.reloptions, a.grantee
ORDER BY vue, role;

-- B. Les privileges PAR DEFAUT restants, par role createur.
--    ATTENDU : aucune ligne portant anon/authenticated avec un privilege
--    autre que SELECT.
SELECT d.defaclrole::regrole::text AS role_createur,
       n.nspname                   AS schema,
       d.defaclobjtype::text       AS type_objet,
       a.grantee::regrole::text    AS beneficiaire,
       string_agg(a.privilege_type, ', ' ORDER BY a.privilege_type) AS privileges_par_defaut
FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) a
WHERE n.nspname = 'public'
  AND a.grantee::regrole::text IN ('anon', 'authenticated', 'service_role')
GROUP BY d.defaclrole, n.nspname, d.defaclobjtype, a.grantee
ORDER BY role_createur, type_objet, beneficiaire;

-- C. NON-REGRESSION SUR LES TABLES -- ce fichier ne doit en avoir touche
--    AUCUNE. A comparer a l'etat connu :
--      * `sites`            : UPDATE pour authenticated (41 colonnes, LOT G) ;
--      * `score_history`    : INSERT pour authenticated ;
--      * allowlist SELECT   : sites, score_history, profiles,
--                             ai_visibility_checks, shop_products,
--                             site_catalog_selections, catalog_products,
--                             blog_posts -- et elles seules.
SELECT c.relname AS "table",
       a.grantee::regrole::text AS role,
       string_agg(a.privilege_type, ', ' ORDER BY a.privilege_type) AS privileges
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) a
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND a.grantee::regrole::text IN ('anon', 'authenticated')
GROUP BY c.relname, a.grantee
ORDER BY "table", role;

-- D. `service_role` intouche : REVOKE ... FROM anon, authenticated ne peut
--    pas l'atteindre. ATTENDU : il conserve tout sur les deux vues.
SELECT c.relname AS vue,
       has_table_privilege('service_role', c.oid, 'SELECT') AS peut_lire
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
ORDER BY vue;


-- ============================================================
-- QUESTION LAISSEE OUVERTE, DELIBEREMENT
-- ============================================================
-- Faut-il aussi retirer `SELECT` du defaut, pour que tout nouvel objet naisse
-- ILLISIBLE et exige un GRANT explicite ? C'est le « deny by default » complet,
-- et c'est defendable. Ce n'est PAS fait ici :
--   * la dette DEBT-073 porte nommement sur les privileges d'ECRITURE ;
--   * le retrait du SELECT ferait echouer silencieusement toute migration
--     future qui suppose une table lisible -- un changement de contrat qui
--     merite sa propre decision, pas un effet de bord de cette correction.
-- A trancher separement.
