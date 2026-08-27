-- ============================================================
-- DEBT-078 -- ETAPE 1/2 : `marketing_assets` ET `marketing_briefs` SONT
-- RATTACHEES AUX SITES PAR `slug`, JAMAIS PAR `site_id`.
--
-- A executer manuellement dans l'editeur SQL Supabase (convention du dossier :
-- ni `DATABASE_URL`, ni CLI Supabase liee, ni `psql`, ni token Management API
-- depuis l'environnement de developpement -- limite documentee en DEBT-004,
-- DEBT-046 et DEBT-072).
--
-- ------------------------------------------------------------
-- L'ETAT RELEVE (schema reel, lu depuis le document OpenAPI de PostgREST)
-- ------------------------------------------------------------
--   marketing_assets(id pk, slug NOT NULL FK -> sites.slug, owner_email
--                    NOT NULL, type NOT NULL, platform, status,
--                    content jsonb NOT NULL, created_at)
--   marketing_briefs(id pk, slug NOT NULL FK -> sites.slug, owner_email
--                    NOT NULL, brief jsonb NOT NULL, created_at)
--
-- Ce sont de VRAIES cles etrangeres vers `sites.slug` -- pas des colonnes
-- libres. C'est le point le plus important de l'audit, et il joue en faveur
-- de la migration : l'integrite referentielle est deja tenue par la base.
--
-- ------------------------------------------------------------
-- POURQUOI `site_id`, ALORS QUE LE SLUG « MARCHE »
-- ------------------------------------------------------------
-- Meme raison que `site_blog_posts.sql` l'ecrit deja : « un slug est un
-- identifiant d'ADRESSAGE. Il ne porte ni integrite vers l'identite du site,
-- ni cascade, ni immutabilite. » Un rattachement par adresse survit mal a une
-- reattribution d'adresse -- et `marketing_briefs` est un CACHE, donc la
-- consequence d'une reattribution ne serait pas une erreur mais un brief
-- d'autrui servi silencieusement a un prompt LLM.
--
-- CE DEFAUT N'EST PAS ACTIF AUJOURD'HUI, et il faut le dire : la
-- reattribution de slug est pratiquement impossible dans l'etat du produit
-- (voir la section « SURETE » ci-dessous). DEBT-078 est un defaut STRUCTUREL.
--
-- ------------------------------------------------------------
-- SURETE : POURQUOI LE BACKFILL PAR `slug` EST FIABLE ICI
-- ------------------------------------------------------------
-- La derivation `slug -> sites.id` n'est legitime que si la correspondance
-- est UNIQUE, TOTALE et STABLE. Les trois sont etablies :
--
--   1. UNIQUE, structurellement. PostgreSQL exige un index unique sur la
--      colonne REFERENCEE par une cle etrangere. Les deux FK existantes
--      pointent `sites.slug` : `sites.slug` est donc unique, et `slug -> id`
--      est une fonction. Aucune ambiguite n'est possible. (Le bloc 0 le
--      reverifie tout de meme, plutot que de s'en remettre au raisonnement.)
--
--   2. TOTALE, par la FK elle-meme. Une ligne marketing dont le slug n'existe
--      pas dans `sites` ne peut pas exister -- SAUF si la contrainte a ete
--      creee `NOT VALID`, auquel cas les lignes ANTERIEURES n'ont jamais ete
--      controlees. Le bloc 0 mesure `convalidated`, et le bloc 3 refuse de
--      poser la FK tant qu'une seule ligne reste non rattachee.
--
--   3. STABLE, par le code. Verifie sur tout le depot :
--        * `sites.slug` n'est ECRIT qu'une fois, a la creation
--          (`api/chat/route.ts`, unique INSERT sur `sites`) ;
--        * il est absent du `FIELD_MAP` de `api/sites/[slug]/route.ts`
--          (allowlist du PATCH) ;
--        * il figure dans `SITE_FORBIDDEN_CLIENT_FIELDS` de
--          `lib/supabase-owned-site.ts` (denylist de l'ecriture navigateur) ;
--        * `generateSlug` suffixe TOUJOURS `-${Date.now()}`, donc deux sites
--          ne peuvent pas se disputer une adresse ;
--        * aucun `.delete()` sur `sites` dans le depot -- les sites sont
--          ARCHIVES, jamais supprimes.
--      Le slug d'un site ne change donc jamais, et n'est jamais recycle.
--
-- ------------------------------------------------------------
-- CE QUE CE FICHIER FAIT, ET DANS QUEL ORDRE
-- ------------------------------------------------------------
--   0.  RELEVE PREALABLE, lecture seule -- a executer et renvoyer AVANT tout.
--   1.  `add column if not exists site_id uuid` -- NULLABLE.
--   2.  Backfill par jointure sur `slug`, `where site_id is null`.
--   3.  BARRIERE fail-closed : LEVE si une seule ligne reste sans `site_id`.
--   4.  Cle etrangere vers `sites(id)`.
--   5.  Index.
--   6.  Verifications finales, lecture seule -- a renvoyer.
--
-- ------------------------------------------------------------
-- POURQUOI LA COLONNE RESTE NULLABLE (et ou est le `NOT NULL`)
-- ------------------------------------------------------------
-- Sequence EXPAND / CONTRACT, exactement celle de
-- `shop_orders_fulfillment_domain_step1_add_column.sql` :
--
--   ETAPE 1 (ce fichier)   colonne NULLABLE + backfill + FK
--   ETAPE 2 (applicatif)   `api/marketing/generate/route.ts` ecrit `site_id`
--   ETAPE 3 (step2 .sql)   re-backfill + `SET NOT NULL`
--
-- Poser `NOT NULL` des maintenant CASSERAIT la production : le code deploye
-- n'ecrit pas encore `site_id`, donc chaque `insert` de `marketing_assets` et
-- chaque `upsert` de `marketing_briefs` serait rejete. Les deux sont enrobes
-- d'un `try/catch` qui se contente de journaliser -- l'echec serait donc
-- SILENCIEUX, et les assets seraient perdus sans aucun signal. C'est
-- precisement le scenario que `NOT NULL` en etape 1 provoquerait.
--
-- ORDRE D'APPLICATION IMPERATIF : ce fichier AVANT le code de l'etape 2 ;
-- `..._step2_not_null.sql` seulement APRES que ce code soit en production.
--
-- ------------------------------------------------------------
-- CE QUE CE FICHIER NE FAIT PAS
-- ------------------------------------------------------------
--   * il ne SUPPRIME rien : ni la colonne `slug`, ni les FK vers
--     `sites.slug`, ni `owner_email`, ni une ligne de donnee. `slug` reste
--     d'ailleurs FONCTIONNELLEMENT NECESSAIRE tant que le code ne l'a pas
--     quitte : c'est la CLE DE CACHE de `marketing_briefs`
--     (`.eq('slug', ...)` et `upsert onConflict: 'slug'`) ;
--   * il ne DECIDE pas du comportement de suppression : la nouvelle FK
--     reprend a l'identique les actions `ON DELETE` / `ON UPDATE` de la FK
--     `slug` deja en place, resolues depuis `pg_constraint`. Rien n'est
--     suppose, et la semantique de suppression d'un site est INCHANGEE.
--     (Si `ON DELETE CASCADE` est souhaite, comme sur `site_blog_posts`,
--     c'est une decision distincte, a prendre explicitement.) ;
--   * il ne touche AUCUNE autre table, aucune policy, aucun grant, aucune
--     vue, aucune fonction ;
--   * il n'ajoute aucun trigger. Un trigger qui deriverait `site_id` du
--     `slug` a l'INSERT rendrait `NOT NULL` posable des l'etape 1 -- il a ete
--     ECARTE : il deplacerait en base une regle de rattachement que le code
--     doit porter, et creerait une seconde autorite la ou DEBT-078 existe
--     justement pour n'en avoir qu'une.
--
-- REJOUABLE : `add column if not exists`, backfill borne par
-- `where site_id is null`, FK et index poses seulement si absents. Un rejeu
-- sur une base deja migree est un no-op.
-- ============================================================


-- ============================================================
-- 0/6 -- RELEVE PREALABLE (lecture seule) -- A EXECUTER ET RENVOYER AVANT
--        LES BLOCS 1 A 5. Aucun de ces resultats n'a pu etre mesure depuis
--        l'environnement de developpement.
-- ============================================================

-- 0.A. `sites.slug` est-il reellement unique ? (fondement de l'unicite du
--      mapping). ATTENDU : au moins une contrainte u/p sur la colonne `slug`.
SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
WHERE con.conrelid = 'public.sites'::regclass
  AND con.contype IN ('u', 'p')
ORDER BY con.conname;

-- 0.B. Les FK existantes vers `sites`, et surtout leur VALIDITE.
--      ATTENDU : convalidated = true sur les deux. Si l'une est `false`, des
--      lignes anterieures n'ont jamais ete controlees et des orphelins sont
--      possibles -- le bloc 3 les arretera, mais autant le savoir avant.
SELECT con.conrelid::regclass::text AS table_source,
       con.conname,
       pg_get_constraintdef(con.oid)  AS definition,
       con.convalidated,
       con.confdeltype                AS on_delete_code,
       con.confupdtype                AS on_update_code
FROM pg_constraint con
WHERE con.contype = 'f'
  AND con.confrelid = 'public.sites'::regclass
  AND con.conrelid IN ('public.marketing_assets'::regclass,
                       'public.marketing_briefs'::regclass)
ORDER BY table_source;

-- 0.C. `marketing_briefs.slug` porte-t-il bien une contrainte UNIQUE ?
--      Le code fait `upsert(..., { onConflict: 'slug' })` et affirme en
--      commentaire « contrainte unique sur slug » -- sans elle, l'upsert
--      echoue, et il est enrobe d'un `try/catch` qui n'en dirait rien.
--      ATTENDU : une ligne. ZERO ligne serait une dette distincte a consigner.
SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
WHERE con.conrelid = 'public.marketing_briefs'::regclass
  AND con.contype IN ('u', 'p')
ORDER BY con.conname;

-- 0.D. Volumetrie et ORPHELINS. ATTENDU : orphelins = 0 sur les deux tables.
--      Un seul orphelin bloque la pose de la FK au bloc 3 -- et devra etre
--      arbitre explicitement, jamais rattache d'office.
SELECT 'marketing_assets' AS table_marketing,
       count(*)                                                        AS lignes,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM public.sites s WHERE s.slug = m.slug))          AS orphelins,
       count(DISTINCT m.slug)                                          AS slugs_distincts
FROM public.marketing_assets m
UNION ALL
SELECT 'marketing_briefs',
       count(*),
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM public.sites s WHERE s.slug = b.slug)),
       count(DISTINCT b.slug)
FROM public.marketing_briefs b;

-- 0.E. Un slug ne doit correspondre qu'a UN site. ATTENDU : zero ligne.
SELECT slug, count(*) AS n
FROM public.sites
GROUP BY slug
HAVING count(*) > 1;

-- 0.F. Une dependance non vue ? Vues, fonctions ou policies qui nommeraient
--      ces tables. ATTENDU : le releve sert a confirmer qu'il n'y en a pas
--      hors des deux routes applicatives deja identifiees.
SELECT 'policy' AS objet, schemaname || '.' || tablename AS nom, policyname AS detail
FROM pg_policies
WHERE tablename IN ('marketing_assets', 'marketing_briefs')
UNION ALL
SELECT 'vue', n.nspname || '.' || c.relname, ''
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('v', 'm')
  AND pg_get_viewdef(c.oid) ~ 'marketing_(assets|briefs)'
UNION ALL
SELECT 'fonction', n.nspname || '.' || p.proname, ''
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosrc ~ 'marketing_(assets|briefs)';


-- ============================================================
-- 1/6 -- LA COLONNE, NULLABLE
-- ============================================================
ALTER TABLE public.marketing_assets ADD COLUMN IF NOT EXISTS site_id uuid;
ALTER TABLE public.marketing_briefs ADD COLUMN IF NOT EXISTS site_id uuid;

COMMENT ON COLUMN public.marketing_assets.site_id IS
  'Rattachement CANONIQUE au site (DEBT-078). Remplace le rattachement historique par `slug`, conserve tant que le code ne l''a pas quitte. NULL uniquement pendant la fenetre de migration, entre l''etape 1 (ce backfill) et l''etape 2 (le code qui l''ecrit) ; `..._step2_not_null.sql` ferme cette fenetre.';

COMMENT ON COLUMN public.marketing_briefs.site_id IS
  'Rattachement CANONIQUE au site (DEBT-078). `slug` reste par ailleurs la CLE DE CACHE lue par `api/marketing/generate` et `api/blog/posts/generate` : il n''est pas supprime par ce chantier. NULL uniquement pendant la fenetre de migration.';


-- ============================================================
-- 2/6 -- BACKFILL, borne par `site_id is null` (donc rejouable, et incapable
--        d'ecraser une valeur ecrite depuis par le code de l'etape 2).
--        La jointure exclut d'office toute ligne dont le site serait
--        introuvable : elle resterait NULL plutot que de recevoir une valeur
--        inventee. Le bloc 3 refuse alors d'aller plus loin.
-- ============================================================
UPDATE public.marketing_assets m
SET site_id = s.id
FROM public.sites s
WHERE s.slug = m.slug
  AND m.site_id IS NULL;

UPDATE public.marketing_briefs b
SET site_id = s.id
FROM public.sites s
WHERE s.slug = b.slug
  AND b.site_id IS NULL;


-- ============================================================
-- 3/6 -- BARRIERE FAIL-CLOSED. Rien de ce qui suit ne doit s'executer si une
--        seule ligne n'a pas pu etre rattachee. `RAISE EXCEPTION` annule le
--        DO ; les blocs 4 et 5, qui suivent dans le meme script, ne doivent
--        alors PAS etre lances.
-- ============================================================
DO $$
DECLARE
  n_assets int;
  n_briefs int;
BEGIN
  SELECT count(*) INTO n_assets FROM public.marketing_assets WHERE site_id IS NULL;
  SELECT count(*) INTO n_briefs FROM public.marketing_briefs WHERE site_id IS NULL;

  IF n_assets <> 0 OR n_briefs <> 0 THEN
    RAISE EXCEPTION 'DEBT-078 : backfill incomplet -- marketing_assets: % ligne(s) sans site_id, '
                    'marketing_briefs: % ligne(s). NE PAS exécuter les blocs 4 et 5. Ces lignes '
                    'portent un slug absent de `sites` : elles doivent etre ARBITREES une par une '
                    '(rattachement explicite ou suppression decidee), jamais rattachees d''office. '
                    'Requete de diagnostic : SELECT id, slug FROM public.marketing_assets WHERE '
                    'site_id IS NULL UNION ALL SELECT id, slug FROM public.marketing_briefs WHERE '
                    'site_id IS NULL;', n_assets, n_briefs;
  END IF;

  RAISE NOTICE 'DEBT-078 : backfill complet -- 0 ligne sans site_id sur les deux tables.';
END $$;


-- ============================================================
-- 4/6 -- LES CLES ETRANGERES VERS `sites(id)`.
--
--        Les actions ON DELETE / ON UPDATE ne sont PAS choisies ici : elles
--        sont RECOPIEES depuis la FK `slug` deja posee sur la meme table. La
--        semantique de suppression d'un site reste donc exactement celle
--        d'aujourd'hui -- ce fichier ajoute un chemin d'integrite, il n'en
--        change aucun.
--
--        LEVE si la FK `slug` de reference est introuvable : sans elle, les
--        actions devraient etre devinees, et ce fichier ne devine pas.
-- ============================================================
DO $$
DECLARE
  t          text;
  ref        record;
  nom_fk     text;
  clause_del text;
  clause_upd text;
  action     constant text[] := ARRAY['a', 'r', 'c', 'n', 'd'];
  libelle    constant text[] := ARRAY['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'];
  i          int;
BEGIN
  FOREACH t IN ARRAY ARRAY['marketing_assets', 'marketing_briefs'] LOOP
    nom_fk := t || '_site_id_fkey';

    -- Deja posee : rejeu, on passe.
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = nom_fk AND conrelid = ('public.' || t)::regclass
    ) THEN
      RAISE NOTICE 'DEJA POSEE : %', nom_fk;
      CONTINUE;
    END IF;

    -- La FK `slug` existante sert de REFERENCE pour les actions.
    SELECT con.confdeltype, con.confupdtype INTO ref
    FROM pg_constraint con
    WHERE con.contype = 'f'
      AND con.conrelid  = ('public.' || t)::regclass
      AND con.confrelid = 'public.sites'::regclass
      AND EXISTS (
        SELECT 1 FROM unnest(con.conkey) k
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
        WHERE a.attname = 'slug'
      )
    LIMIT 1;

    IF ref IS NULL THEN
      RAISE EXCEPTION 'DEBT-078 : aucune FK `slug` -> sites trouvee sur public.%. Les actions '
                      'ON DELETE / ON UPDATE de la nouvelle FK devraient etre DEVINEES -- ce '
                      'fichier ne devine pas. Relire le bloc 0.B, decider explicitement, puis '
                      'poser la FK a la main.', t;
    END IF;

    -- `::text` OBLIGATOIRE -- et c'est MESURE, pas prophylactique. Sans lui,
    -- PostgreSQL rend : `42883 function array_position(text[], "char") does
    -- not exist`. `confdeltype` et `confupdtype` sont de type `"char"` (un
    -- seul octet), et la resolution de `anyarray`/`anyelement` n'y applique
    -- AUCUNE fonte implicite vers `text`. Erreur obtenue en production le
    -- 2026-08-26, des la premiere iteration de la boucle, avant tout ALTER --
    -- le DO ayant ete annule en entier, aucune FK n'avait ete posee.
    i := array_position(action, ref.confdeltype::text); clause_del := libelle[i];
    i := array_position(action, ref.confupdtype::text); clause_upd := libelle[i];

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (site_id) '
      || 'REFERENCES public.sites(id) ON DELETE %s ON UPDATE %s',
      t, nom_fk, clause_del, clause_upd
    );
    RAISE NOTICE 'POSEE : % -> sites(id) ON DELETE % ON UPDATE %', nom_fk, clause_del, clause_upd;
  END LOOP;
END $$;


-- ============================================================
-- 5/6 -- INDEX.
--
--   * `marketing_assets`  : plusieurs assets par site -> index simple.
--   * `marketing_briefs`  : UN brief par site (le code fait
--     `upsert onConflict: 'slug'`, et `slug` y est unique) -> index UNIQUE,
--     qui rend possible le futur `onConflict: 'site_id'` de l'etape 2.
--     `slug` etant unique et `slug -> id` etant une fonction, l'unicite sur
--     `site_id` en decoule ; la creation echouerait si ce n'etait pas le cas,
--     ce qui est le comportement voulu.
-- ============================================================
CREATE INDEX IF NOT EXISTS marketing_assets_site_id_idx
  ON public.marketing_assets (site_id);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_briefs_site_id_key
  ON public.marketing_briefs (site_id);


-- ============================================================
-- 6/6 -- VERIFICATIONS FINALES (lecture seule) -- a executer et renvoyer.
-- ============================================================

-- 6.A. Les deux colonnes existent, sont `uuid`, et restent NULLABLE.
--      ATTENDU : 2 lignes, data_type = uuid, is_nullable = YES.
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('marketing_assets', 'marketing_briefs')
  AND column_name = 'site_id'
ORDER BY table_name;

-- 6.B. Plus aucune ligne sans rattachement, et le rattachement `site_id`
--      CONCORDE avec le rattachement `slug` sur 100% des lignes.
--      ATTENDU : sans_site_id = 0 et desaccord_slug_vs_site_id = 0 partout.
SELECT 'marketing_assets' AS table_marketing,
       count(*)                                              AS lignes,
       count(*) FILTER (WHERE m.site_id IS NULL)             AS sans_site_id,
       count(*) FILTER (WHERE m.site_id IS DISTINCT FROM (
         SELECT s.id FROM public.sites s WHERE s.slug = m.slug)) AS desaccord_slug_vs_site_id
FROM public.marketing_assets m
UNION ALL
SELECT 'marketing_briefs',
       count(*),
       count(*) FILTER (WHERE b.site_id IS NULL),
       count(*) FILTER (WHERE b.site_id IS DISTINCT FROM (
         SELECT s.id FROM public.sites s WHERE s.slug = b.slug))
FROM public.marketing_briefs b;

-- 6.C. Les FK et index poses. ATTENDU : les 2 FK `*_site_id_fkey` vers
--      `sites(id)`, avec les MEMES actions que les FK `slug` du bloc 0.B ;
--      les FK `slug` toujours presentes (rien n'a ete supprime).
SELECT con.conrelid::regclass::text AS table_source,
       con.conname,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
WHERE con.contype = 'f'
  AND con.conrelid IN ('public.marketing_assets'::regclass,
                       'public.marketing_briefs'::regclass)
ORDER BY table_source, con.conname;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('marketing_assets', 'marketing_briefs')
ORDER BY tablename, indexname;

-- 6.D. NON-REGRESSION : la colonne `slug` est intacte, toujours NOT NULL, et
--      sa FK vers `sites.slug` n'a pas bouge. ATTENDU : 2 lignes, NO.
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('marketing_assets', 'marketing_briefs')
  AND column_name = 'slug'
ORDER BY table_name;
