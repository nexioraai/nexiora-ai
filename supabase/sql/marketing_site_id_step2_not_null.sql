-- ============================================================
-- DEBT-078 -- ETAPE 2/2 : FERMETURE DE LA FENETRE DE MIGRATION.
--
-- ⚠️ NE PAS EXECUTER CE FICHIER TANT QUE LES DEUX CONDITIONS SUIVANTES NE
--    SONT PAS VRAIES. Il n'est pas dangereux -- il est fail-closed et ne
--    modifie rien tant qu'il n'est pas sur de lui -- mais lance trop tot il
--    ne fera qu'echouer, et masquer la vraie sequence.
--
--   CONDITION 1 -- `marketing_site_id_step1_add_column_backfill_and_fk.sql`
--                  a ete execute, et ses verifications 6.A a 6.D renvoyees.
--
--   CONDITION 2 -- LE CODE DE L'ETAPE 2 EST EN PRODUCTION, c'est-a-dire que
--                  `src/app/api/marketing/generate/route.ts` ecrit `site_id`
--                  dans SES DEUX ECRITURES :
--
--                    .from('marketing_briefs')
--                    .upsert({ slug, site_id: site.id, owner_email, brief },
--                            { onConflict: 'slug' })
--
--                    .from('marketing_assets')
--                    .insert({ slug, site_id: site.id, owner_email, type,
--                              platform, status, content })
--
--                  `site.id` y est deja disponible -- la route s'en sert pour
--                  `logAiUsage({ siteId: site.id })`. Aucune requete nouvelle,
--                  aucune autorite nouvelle : `requireSiteOwner` a deja
--                  tranche, et `site` EST la ligne autorisee.
--
--                  `onConflict` reste sur `'slug'` a cette etape : `slug` est
--                  toujours unique, et deplacer la cle de conflit en meme
--                  temps que la colonne melangerait deux changements. L'index
--                  UNIQUE sur `site_id` pose par l'etape 1 rend ce
--                  deplacement possible plus tard, quand il sera decide.
--
-- POURQUOI CET ORDRE, ET PAS L'INVERSE. Entre l'etape 1 et le deploiement du
-- code, toute nouvelle ligne marketing nait avec `site_id` NULL. Poser
-- `NOT NULL` avant que le code n'ecrive la colonne ferait echouer chaque
-- ecriture -- et les deux ecritures de la route sont enrobees d'un `try/catch`
-- qui se contente de `console.error`. La panne serait donc TOTALE et
-- SILENCIEUSE : plus aucun asset persiste, plus aucun brief mis en cache,
-- aucune erreur visible cote utilisateur.
--
-- CE FICHIER : re-backfille les lignes nees pendant la fenetre, VERIFIE, puis
-- pose `NOT NULL`. Il ne supprime toujours rien -- ni `slug`, ni sa FK, ni
-- `owner_email`. La sortie de `slug` est un chantier distinct, qui ne pourra
-- s'ouvrir que lorsque plus aucun code ne le LIT (aujourd'hui il reste la cle
-- de cache de `marketing_briefs`, lue par deux routes).
--
-- REJOUABLE : le backfill est borne par `site_id is null`, et `SET NOT NULL`
-- sur une colonne deja NOT NULL est un no-op.
-- ============================================================


-- ============================================================
-- 1/3 -- RE-BACKFILL des lignes creees pendant la fenetre de migration.
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
-- 2/3 -- BARRIERE, puis `SET NOT NULL` -- dans la MEME transaction implicite
--        du bloc DO : si la barriere leve, aucune contrainte n'est posee.
--
--        La barriere verifie DEUX choses, pas une :
--          * plus aucune ligne sans `site_id` ;
--          * `site_id` CONCORDE avec `slug` sur 100% des lignes -- une
--            divergence signalerait un rattachement ecrit a tort par le code,
--            et `NOT NULL` la figerait au lieu de la reveler.
-- ============================================================
DO $$
DECLARE
  n_null_a int; n_null_b int;
  n_ecart_a int; n_ecart_b int;
BEGIN
  SELECT count(*) FILTER (WHERE site_id IS NULL),
         count(*) FILTER (WHERE site_id IS DISTINCT FROM
           (SELECT s.id FROM public.sites s WHERE s.slug = m.slug))
    INTO n_null_a, n_ecart_a
  FROM public.marketing_assets m;

  SELECT count(*) FILTER (WHERE site_id IS NULL),
         count(*) FILTER (WHERE site_id IS DISTINCT FROM
           (SELECT s.id FROM public.sites s WHERE s.slug = b.slug))
    INTO n_null_b, n_ecart_b
  FROM public.marketing_briefs b;

  IF n_null_a <> 0 OR n_null_b <> 0 THEN
    RAISE EXCEPTION 'DEBT-078 : % / % ligne(s) sans site_id (assets / briefs). `NOT NULL` n''est '
                    'PAS pose. Soit le code de l''etape 2 n''est pas deploye, soit des slugs '
                    'orphelins subsistent -- a arbitrer un par un.', n_null_a, n_null_b;
  END IF;

  IF n_ecart_a <> 0 OR n_ecart_b <> 0 THEN
    RAISE EXCEPTION 'DEBT-078 : % / % ligne(s) ou site_id NE CORRESPOND PAS au site du slug '
                    '(assets / briefs). C''est un defaut de rattachement, pas une fenetre de '
                    'migration : `NOT NULL` le figerait. Diagnostiquer avant toute contrainte.',
                    n_ecart_a, n_ecart_b;
  END IF;

  ALTER TABLE public.marketing_assets ALTER COLUMN site_id SET NOT NULL;
  ALTER TABLE public.marketing_briefs ALTER COLUMN site_id SET NOT NULL;

  RAISE NOTICE 'DEBT-078 : site_id est desormais NOT NULL sur les deux tables.';
END $$;


-- ============================================================
-- 3/3 -- VERIFICATIONS (lecture seule) -- a executer et renvoyer.
-- ============================================================

-- 3.A. ATTENDU : 4 lignes -- `site_id` NOT NULL (is_nullable = NO) ET `slug`
--      toujours present et NOT NULL sur les deux tables.
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('marketing_assets', 'marketing_briefs')
  AND column_name IN ('site_id', 'slug')
ORDER BY table_name, column_name;

-- 3.B. ATTENDU : les FK `site_id` ET les FK `slug` -- les deux coexistent.
--      Rien n'a ete supprime par ce chantier.
SELECT con.conrelid::regclass::text AS table_source,
       con.conname,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
WHERE con.contype = 'f'
  AND con.conrelid IN ('public.marketing_assets'::regclass,
                       'public.marketing_briefs'::regclass)
ORDER BY table_source, con.conname;
