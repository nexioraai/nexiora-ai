-- ============================================================
-- DEBT-072 -- LES POLICIES `site-images` IDENTIFIENT LE PROPRIETAIRE PAR
-- `owner_email`, ET NE SONT CORRECTES QUE PAR COUPLAGE IMPLICITE.
--
-- A executer manuellement dans l'editeur SQL Supabase (convention du dossier :
-- ni `DATABASE_URL`, ni CLI Supabase liee, ni token Management API depuis
-- l'environnement de developpement -- limite documentee en DEBT-004/DEBT-046).
--
-- ------------------------------------------------------------
-- CE FICHIER NE CORRIGE PAS UNE FAILLE. LE PIRE CAS EST REFUTE.
-- ------------------------------------------------------------
-- Il faut le dire avant tout le reste, parce que la forme du correctif y
-- ressemble : la mesure de DEBT-072 a ETABLI qu'aucune ecriture inter-locataire
-- n'est possible aujourd'hui. Un JWT portant un `owner_email` REEL mais un
-- `sub` falsifie voit ZERO site.
--
-- La raison : la sous-requete `EXISTS (SELECT 1 FROM sites ...)` des policies
-- Storage est elle-meme soumise a la RLS de `sites`, dont l'unique policy
-- SELECT est -- `supabase/sql/sites_public_view.sql`, section 3/4 :
--
--     CREATE POLICY "Owners can read their own site"
--       ON public.sites FOR SELECT TO authenticated
--       USING (owner_id = auth.uid());
--
-- La condition EFFECTIVE des trois policies `site-images` est donc
-- `owner_email` **ET** `owner_id`. Une adresse perimee ne suffit pas.
--
-- ------------------------------------------------------------
-- CE QUI EST REELLEMENT EN DEFAUT : UN COUPLAGE ECRIT NULLE PART
-- ------------------------------------------------------------
-- La garde `owner_id` de `site-images` est portee par une policy d'une AUTRE
-- table, resserree par `sites_public_view.sql` pour une raison SANS RAPPORT
-- (exposition de colonnes a `anon`). Si la branche `published = true` y
-- revenait, les policies Storage retomberaient sur `owner_email` seul -- sans
-- qu'aucune ligne de `storage.objects` n'ait change, et sans qu'aucun test ne
-- puisse le voir.
--
-- Ce fichier rend la garde EXPLICITE. Apres application, `site-images` est
-- correcte PAR ELLE-MEME : la RLS de `sites` continue d'ajouter la meme
-- condition, mais elle devient redondante au lieu d'etre porteuse.
--
-- ------------------------------------------------------------
-- POURQUOI `owner_id` REMPLACE `owner_email` AU LIEU DE S'Y AJOUTER
-- ------------------------------------------------------------
--   * `owner_id` est l'identite canonique du depot depuis M2-02. C'est deja
--     la regle de l'application : `src/lib/auth/require-site-owner.ts` compare
--     STRICTEMENT sur `owner_id`, et ne se replie sur `owner_email` que si
--     `owner_id` est NULL cote base -- jamais s'il est renseigne et different.
--     `owner_id` est `NOT NULL` sur 14 sites sur 14 (mesure, DEBT-084) : ce
--     repli ne s'exerce plus jamais en pratique.
--   * `owner_email` est ecrite une seule fois a la creation et JAMAIS mise a
--     jour. La conserver ferait dependre l'ecriture Storage d'une donnee que
--     rien ne maintient.
--   * `pod_designs_ownership.sql` (DEBT-084) a deja pose exactement cette
--     condition sur l'autre bucket. Ce fichier aligne `site-images` dessus.
--
-- CE QUE LE REMPLACEMENT CHANGE, EXACTEMENT :
--   avant (effectif) : owner_email = jwt.email  ET  owner_id = auth.uid()
--   apres            :                              owner_id = auth.uid()
-- La condition n'est donc RELACHEE que dans un seul cas : un proprietaire dont
-- l'adresse a change depuis la creation du site -- aujourd'hui BLOQUE a tort,
-- demain autorise sur SON PROPRE prefixe. Ce n'est pas une ouverture
-- inter-locataire : `owner_id = auth.uid()` reste exige dans tous les cas.
--
-- ------------------------------------------------------------
-- LA METHODE : SUBSTITUTION CHIRURGICALE, PAS REECRITURE
-- ------------------------------------------------------------
-- Le bloc ne REECRIT PAS la condition. Il lit l'expression reellement stockee
-- et n'y remplace QUE le predicat de propriete, par `regexp_replace`. Le reste
-- -- garde de bucket `bucket_id = 'site-images'` et surtout garde de prefixe
-- `sites.slug = split_part(objects.name, '/', 1)` -- est conserve VERBATIM,
-- puisqu'il n'est jamais retape.
--
-- C'est deliberement plus prudent que le patron de DEBT-084, qui posait une
-- condition ecrite en dur : ici la forme exacte de l'expression deployee n'a
-- pas pu etre relue depuis cet environnement, donc rien n'en est suppose.
--
-- LE BLOC EST FAIL-CLOSED. Il LEVE -- et PostgreSQL annule alors la totalite
-- du `DO` -- si :
--   * le nombre de policies traitees n'est pas exactement 3 ;
--   * la substitution n'a rien remplace sur une policy encore en `owner_email`
--     (motif inattendu : l'expression deployee n'a pas la forme relevee) ;
--   * la condition resultante perd `owner_id`, garde `owner_email`, perd
--     `split_part(objects.name` ou perd `site-images`.
-- Il n'applique jamais a moitie.
--
-- LES NOMS DE POLICY NE SONT PAS ECRITS EN DUR : ils sont resolus depuis
-- `pg_policies` (lecon de DEBT-084 -- deux relectures du meme dump les avaient
-- transcrits differemment).
--
-- REJOUABLE : une policy deja conforme (`owner_id` present, `owner_email`
-- absent) est comptee et sautee, jamais retouchee.
--
-- ------------------------------------------------------------
-- CE FICHIER NE TOUCHE PAS
-- ------------------------------------------------------------
--   * les policies `pod-designs` (DEBT-084, deja resserrees et validees) ;
--   * la RLS de `sites` -- le couplage est rendu inutile, pas supprime ;
--   * la colonne `owner_email`, qui reste en base (aucune donnee ecrite) ;
--   * les tables, les vues, les grants, les buckets.
--
-- Il n'ajoute et ne supprime AUCUNE policy : il RESSERRE les trois qui
-- existent, chacune dans la colonne que PostgreSQL evalue pour son verbe.
--
-- NOTE SUR L'`UPDATE`, ET POURQUOI SON `with_check` RESTE NULL.
-- La policy UPDATE de `site-images` n'a PAS de `WITH CHECK` (releve DEBT-072).
-- PostgreSQL retombe alors sur `USING` pour valider la ligne RESULTANTE : un
-- objet ne peut donc pas etre renomme vers le prefixe d'autrui. Poser un
-- `WITH CHECK` identique serait semantiquement neutre -- il n'est donc PAS
-- pose. Le perimetre de DEBT-072 est le predicat de propriete, rien d'autre.
-- ============================================================


-- ============================================================
-- 0/3 -- RELEVE PREALABLE (lecture seule) -- a executer AVANT le bloc 1/3
--        et a conserver : c'est l'etat « avant » de la preuve.
-- ============================================================
SELECT policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;


-- ============================================================
-- 1/3 -- RESSERREMENT DES TROIS POLICIES D'ECRITURE `site-images`
-- ============================================================
DO $$
DECLARE
  r          record;
  ancienne   text;
  nouvelle   text;
  n_traitees int := 0;
  -- Le predicat de propriete, tel que `pg_get_expr` le rend :
  --   (sites.owner_email = (auth.jwt() ->> 'email'::text))
  -- Le `::text` et les parentheses AUTOUR de l'operande sont optionnels : la
  -- forme exacte du rendu n'est pas supposee, seule sa structure l'est.
  --
  -- Les deux parentheses sont APPARIEES par alternation, jamais optionnelles
  -- separement : `\(?...\)?` accepterait une parenthese fermante orpheline et
  -- desequilibrerait l'expression produite. Verifie par simulation sur les
  -- trois formes de rendu plausibles avant ecriture de ce fichier.
  motif constant text :=
    'sites\.owner_email\s*=\s*('
    || '\(\s*auth\.jwt\(\)\s*->>\s*''email''(::text)?\s*\)'   -- operande parenthese
    || '|auth\.jwt\(\)\s*->>\s*''email''(::text)?'            -- operande nu
    || ')';
BEGIN
  FOR r IN
    SELECT policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
      AND coalesce(qual, with_check) LIKE '%site-images%'
    ORDER BY cmd, policyname
  LOOP
    -- INSERT : PostgreSQL n'evalue QUE `with_check`.
    -- UPDATE / DELETE : PostgreSQL evalue `USING` (`qual`).
    ancienne := coalesce(r.qual, r.with_check);

    -- Deja conforme (rejeu) : comptee, non retouchee.
    IF ancienne LIKE '%owner_id%' AND ancienne NOT LIKE '%owner_email%' THEN
      n_traitees := n_traitees + 1;
      RAISE NOTICE 'DEJA CONFORME : % (%)', r.policyname, r.cmd;
      CONTINUE;
    END IF;

    nouvelle := regexp_replace(ancienne, motif, 'sites.owner_id = auth.uid()', 'gi');

    IF nouvelle = ancienne THEN
      RAISE EXCEPTION 'DEBT-072 : aucune substitution sur % (%). Expression deployee : %. '
                      'Rien n''est applique -- le DO est annule. Le motif de `owner_email` '
                      'ne correspond pas a la forme relevee : relire le bloc 0/3 et ajuster '
                      'le motif AVANT de rejouer.', r.policyname, r.cmd, ancienne;
    END IF;

    -- Garde-fous sur le RESULTAT : la propriete doit etre devenue explicite,
    -- et les deux autres gardes doivent avoir survecu intactes.
    IF nouvelle LIKE '%owner_email%'
       OR nouvelle NOT LIKE '%owner_id%'
       OR nouvelle NOT LIKE '%split_part(objects.name%'
       OR nouvelle NOT LIKE '%site-images%' THEN
      RAISE EXCEPTION 'DEBT-072 : condition resultante invalide sur % (%) : %. '
                      'Attendu : `owner_id` present, `owner_email` absent, garde de prefixe '
                      '`split_part(objects.name` et garde de bucket `site-images` conservees. '
                      'Rien n''est applique.', r.policyname, r.cmd, nouvelle;
    END IF;

    IF r.cmd = 'INSERT' THEN
      EXECUTE format('ALTER POLICY %I ON storage.objects WITH CHECK (%s)', r.policyname, nouvelle);
    ELSE
      EXECUTE format('ALTER POLICY %I ON storage.objects USING (%s)', r.policyname, nouvelle);
    END IF;

    n_traitees := n_traitees + 1;
    RAISE NOTICE 'RESSERREE : % (%) -> %', r.policyname, r.cmd, nouvelle;
  END LOOP;

  IF n_traitees <> 3 THEN
    RAISE EXCEPTION 'DEBT-072 : % policy(ies) traitee(s), 3 attendues (INSERT, UPDATE, DELETE). '
                    'Rien n''est applique -- le DO est annule. Verifier `pg_policies` avant de '
                    'rejouer : un nom ou une condition a change.', n_traitees;
  END IF;
END $$;


-- ============================================================
-- 2/3 -- VERIFICATIONS STATIQUES (lecture seule) -- a executer et me renvoyer.
-- ============================================================

-- A. Etat « apres » des six policies de `storage.objects`.
--    ATTENDU : les trois `site-images` portent `sites.owner_id = auth.uid()` ;
--    les trois `pod-designs` sont INCHANGEES par rapport au bloc 0/3.
SELECT policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- B. Verdict compact, en booleens seuls -- un affichage de texte long peut
--    etre tronque par le client (piege rencontre en DEBT-084, ou un
--    `with_check` reel s'etait affiche « NULL »).
--    ATTENDU sur les 3 policies `site-images` :
--      garde_owner_id = true, reste_owner_email = false,
--      garde_prefixe = true, garde_bucket = true.
SELECT policyname,
       cmd,
       coalesce(qual, with_check) LIKE '%owner_id = auth.uid()%'   AS garde_owner_id,
       coalesce(qual, with_check) LIKE '%owner_email%'             AS reste_owner_email,
       coalesce(qual, with_check) LIKE '%split_part(objects.name%' AS garde_prefixe,
       coalesce(qual, with_check) LIKE '%site-images%'             AS garde_bucket,
       (with_check IS NULL)                                        AS with_check_null,
       length(coalesce(qual, with_check))                          AS longueur
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
ORDER BY cmd, policyname;

-- C. Couverture : aucune policy d'ECRITURE de `storage.objects` ne doit se
--    contenter du bucket, et TOUTES doivent desormais passer par `owner_id`.
--    ATTENDU (une ligne d'agregat) : policies_ecriture = 5 -- les 3 de
--    `site-images` plus les 2 de `pod-designs` (INSERT et DELETE, resserrees
--    par DEBT-084) -- avec borne_owner_id = 5 et reste_owner_email = 0.
SELECT count(*)                                                              AS policies_ecriture,
       count(*) FILTER (WHERE coalesce(qual, with_check) LIKE '%owner_id%')  AS borne_owner_id,
       count(*) FILTER (WHERE coalesce(qual, with_check) LIKE '%owner_email%') AS reste_owner_email
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE');


-- ============================================================
-- 3/3 -- PREUVE COMPORTEMENTALE, sous l'identite d'un proprietaire REEL.
--
-- Patron de DEBT-084 : `BEGIN; ... ROLLBACK;` -- aucune donnee ecrite, aucun
-- objet Storage touche. On evalue la sous-requete `EXISTS` des policies
-- exactement comme PostgreSQL l'evaluera, sous le role `authenticated` et avec
-- la RLS de `sites` active.
--
-- Les identites ne sont PAS ecrites en dur : deux proprietaires DISTINCTS sont
-- choisis dans `sites`. Si la base n'en contient qu'un seul, `slug_b` est NULL
-- et le test `prefixe_autrui` doit etre considere comme NON EXECUTE -- ne pas
-- le lire comme un succes.
-- ============================================================
BEGIN;

CREATE TEMP TABLE t_debt072 ON COMMIT DROP AS
WITH a AS (
  SELECT owner_id, slug
  FROM public.sites
  WHERE owner_id IS NOT NULL
  ORDER BY slug
  LIMIT 1
)
SELECT a.owner_id AS uid_a,
       a.slug     AS slug_a,
       (SELECT s.slug
          FROM public.sites s
         WHERE s.owner_id IS NOT NULL
           AND s.owner_id <> a.owner_id
         ORDER BY s.slug
         LIMIT 1) AS slug_b
FROM a;

GRANT SELECT ON t_debt072 TO authenticated;

-- On endosse l'identite du proprietaire A.
SELECT set_config(
         'request.jwt.claims',
         json_build_object('sub', uid_a, 'role', 'authenticated')::text,
         true                     -- `is_local` : annule au ROLLBACK
       )
FROM t_debt072;

SET LOCAL ROLE authenticated;

-- ATTENDU, dans l'ordre :
--   identite_ok      true   -- `auth.uid()` rend bien le proprietaire A
--   propre_prefixe   true   -- non-regression : le proprietaire ecrit chez lui
--   sous_dossier     true   -- non-regression : `{slug}/products/...`
--                              (`src/components/edit/ProductManager.tsx`)
--   prefixe_autrui   false  -- pas d'ouverture inter-locataire
--   racine_sans_slash false -- `hero.png` a la racine du bucket
--   traversee        false  -- `../{slug_b}/x.png`
--   prefixe_blog     false  -- `blog/...` reste reserve au serveur
--                              (premisse de `api/blog/posts/[id]/cover`)
--   slug_seul        true   -- inoffensif : `split_part` sans delimiteur rend
--                              la chaine entiere, qui reste SON slug
SELECT
  (SELECT auth.uid()) = t.uid_a AS identite_ok,
  EXISTS (SELECT 1 FROM public.sites s
           WHERE s.slug = split_part(t.slug_a || '/hero.png', '/', 1)
             AND s.owner_id = auth.uid())            AS propre_prefixe,
  EXISTS (SELECT 1 FROM public.sites s
           WHERE s.slug = split_part(t.slug_a || '/products/1.png', '/', 1)
             AND s.owner_id = auth.uid())            AS sous_dossier,
  EXISTS (SELECT 1 FROM public.sites s
           WHERE s.slug = split_part(coalesce(t.slug_b, '__aucun_second_proprietaire__') || '/hero.png', '/', 1)
             AND s.owner_id = auth.uid())            AS prefixe_autrui,
  EXISTS (SELECT 1 FROM public.sites s
           WHERE s.slug = split_part('hero.png', '/', 1)
             AND s.owner_id = auth.uid())            AS racine_sans_slash,
  EXISTS (SELECT 1 FROM public.sites s
           WHERE s.slug = split_part('../' || coalesce(t.slug_b, '__aucun__') || '/x.png', '/', 1)
             AND s.owner_id = auth.uid())            AS traversee,
  EXISTS (SELECT 1 FROM public.sites s
           WHERE s.slug = split_part('blog/2026/cover.png', '/', 1)
             AND s.owner_id = auth.uid())            AS prefixe_blog,
  EXISTS (SELECT 1 FROM public.sites s
           WHERE s.slug = split_part(t.slug_a, '/', 1)
             AND s.owner_id = auth.uid())            AS slug_seul,
  (t.slug_b IS NOT NULL)                             AS second_proprietaire_dispo
FROM t_debt072 t;

ROLLBACK;
