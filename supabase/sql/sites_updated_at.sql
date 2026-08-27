-- ============================================================
-- DEBT-034 — LA FRAICHEUR D'UN SITE, ET LES TROIS SURFACES QUI LA PUBLIENT.
--
-- LE DEFAUT MESURE. `sites` n'a AUCUNE colonne de derniere modification :
-- 41 colonnes editables + 18 protegees = 59 colonnes nommees, aucune
-- `updated_at`. Les trois surfaces qui publient une fraicheur se rabattent
-- donc toutes sur `created_at` :
--   * JsonLd.tsx                    -> `dateModified`
--   * llms.txt/route.ts             -> intitule « derniere mise a jour »
--   * internal/site-sitemap/route.ts-> `<lastmod>`
-- Les chantiers 3 a 8 ont ouvert a l'agent `lang`, `faq`, `whyus`,
-- `area_served`, `price_range`, la galerie, les produits et les sections :
-- AUCUNE de ces modifications n'est visible d'un crawler. Le sitemap aggrave
-- le cas en declarant `changefreq: daily` a cote d'un `lastmod` fige.
--
-- Mode 1 est le mode dont la valeur produit EST d'etre trouve : le
-- referencement y est la fonction principale, pas un accessoire.
--
-- ============================================================
-- CE SCRIPT EST ADDITIF ET NON DESTRUCTIF.
-- Aucun DROP, aucune colonne modifiee, aucune donnee ecrasee. Il est
-- IDEMPOTENT : re-executable sans effet de bord.
-- ============================================================
--
-- ORDRE DE DEPLOIEMENT — IL COMPTE, ET VOICI POURQUOI.
--
--   1. CE SCRIPT D'ABORD.
--   2. LE CODE ENSUITE (une seule ligne, voir l'etape 5 en bas).
--
-- Le code applicatif deja livre est SUR DANS LES DEUX ETATS DU SCHEMA : les
-- trois surfaces lisent `site.updated_at ?? site.created_at`, et
-- `fetchSite` interroge la vue en `select('*')` -- une colonne absente est
-- simplement absente, donc le repli s'applique et le comportement est
-- rigoureusement celui d'aujourd'hui.
--
-- LE SEUL PIEGE EST `fetchSitePreview`, qui lit la table `sites` avec la
-- liste EXPLICITE `PUBLIC_COLS`. Y inscrire `updated_at` AVANT ce script
-- ferait echouer la requete PostgREST entiere (42703, colonne inconnue) et
-- l'apercu repondrait « Apercu indisponible » a TOUS les proprietaires.
-- C'est pourquoi `PUBLIC_COLS` n'est PAS encore modifie : c'est l'etape 5,
-- a faire APRES avoir constate que ce script est passe.
-- ============================================================

-- ------------------------------------------------------------
-- 1/5 — La colonne. NULLABLE et SANS DEFAUT, delibere.
--
-- `DEFAULT now()` remplirait la colonne a l'insertion, ce qui est correct,
-- mais un `NOT NULL` exigerait un backfill atomique sur une table en
-- production. NULL signifie ici « jamais modifie depuis la creation », que le
-- code traduit deja par le repli sur `created_at`. Le backfill de l'etape 2
-- rend cette distinction sans consequence, et la garder nullable laisse le
-- code ancien et le code nouveau tous deux corrects.
-- ------------------------------------------------------------
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- ------------------------------------------------------------
-- 2/5 — Backfill : `created_at`, jamais `now()`.
--
-- Ecrire `now()` affirmerait que tous les sites viennent d'etre modifies --
-- un mensonge envoye aux moteurs et aux crawlers LLM des le lendemain.
-- `created_at` reproduit exactement ce que les trois surfaces publient
-- aujourd'hui : la migration ne CHANGE donc rien tant qu'aucune modification
-- reelle n'a lieu. C'est ce qui la rend sure.
--
-- `WHERE updated_at IS NULL` : idempotent, et ne touche jamais une valeur
-- deja posee par le declencheur.
-- ------------------------------------------------------------
UPDATE public.sites SET updated_at = created_at WHERE updated_at IS NULL;

-- ------------------------------------------------------------
-- 3/5 — Le declencheur, PORTE SUR LES COLONNES PUBLIEES SEULEMENT.
--
-- POURQUOI UN DECLENCHEUR ET NON UNE ECRITURE APPLICATIVE. Les marchands
-- ecrivent `sites` en PostgREST DIRECT depuis le navigateur (41 colonnes leur
-- sont accordees en UPDATE, cf. lot_g_final_field_level_authorization.sql).
-- Aucun code applicatif ne voit ce chemin : seul un declencheur le couvre.
--
-- POURQUOI `OF <colonnes>` ET NON UN `UPDATE` NU. Meme patron que
-- `trg_site_mode_keeps_orders_valid` (`before update of mode on sites`), et
-- pour la meme raison : la precision. Un declencheur sur tout UPDATE ferait
-- bouger la fraicheur a chaque ecriture de comptabilite interne -- les crons
-- de domaine touchent `custom_domain_google_attempts`,
-- `custom_domain_google_last_attempt_at`, `..._status`, `..._error` sans que
-- le contenu du site ait change d'un mot. Le signal annoncerait alors une
-- modification qui n'a pas eu lieu, ce qui est exactement le defaut inverse
-- de celui qu'on corrige.
--
-- LA LISTE EST CELLE DE `sites_public` MOINS L'IDENTITE : ce qui est PUBLIE
-- definit ce qui, en changeant, constitue une modification du site. `id`,
-- `slug`, `created_at` et `custom_domain` en sont donc exclus (identite et
-- adressage, non contenu).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_site_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Patron REVOKE/GRANT du depot (phase 2) : PostgreSQL accorde EXECUTE a
-- PUBLIC par defaut a la creation de toute fonction.
REVOKE ALL ON FUNCTION public.touch_site_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_site_updated_at() TO service_role;

DROP TRIGGER IF EXISTS trg_sites_touch_updated_at ON public.sites;
CREATE TRIGGER trg_sites_touch_updated_at
  BEFORE UPDATE OF
    name, slogan, type, mode, primary_color, hero_title, hero_subtitle,
    about, services, testimonials, gallery, products, contact, menu, team,
    hours, social_links, address, pages, cta, theme, hero_image, lang, faq,
    whyus, mission, vision, geo_lat, geo_lng, area_served, price_range,
    hidden_sections, section_label, sections, dropship_type, pod_designs,
    product_families, cj_margin_percent, cj_round_mode, shipping_flat
  ON public.sites
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_site_updated_at();

-- ------------------------------------------------------------
-- 4/5 — La vue publique doit exposer la colonne.
--
-- `fetchSite` interroge `sites_public` en `select('*')` : sans cette
-- recreation, la colonne existe sur la table et reste INVISIBLE de la
-- vitrine. La liste ci-dessous est celle de `sites_public_view.sql`, a
-- l'identique, PLUS `updated_at` -- aucune colonne retiree, aucune ajoutee
-- par ailleurs.
-- ------------------------------------------------------------
-- `security_invoker = false` -- IDENTIQUE A LA DEFINITION EXISTANTE, et ce
-- n'est PAS un detail de style. Une premiere redaction de ce script portait
-- `true` : verification avant execution, la difference aurait mis TOUTES LES
-- VITRINES PUBLIQUES HORS LIGNE.
--
-- POURQUOI. `CREATE OR REPLACE VIEW` accepte de changer cette option. Avec
-- `security_invoker = true`, la vue evalue la RLS de la table de base sous
-- l'identite de L'APPELANT. Or `sites_public_view.sql` (etape 3/4) a resserre
-- la policy SELECT de `sites` a la seule
--   "Owners can read their own site" -> TO authenticated USING (owner_id = auth.uid())
-- Il n'existe AUCUNE policy SELECT pour `anon`. La vitrine publique, servie
-- par le client anon, aurait donc recu ZERO LIGNE sur chaque site.
--
-- Avec `false` (le comportement en place), la vue s'execute sous l'identite de
-- SON PROPRIETAIRE et contourne donc la RLS de l'appelant -- c'est
-- precisement sa raison d'etre. Le filtrage public est assure par son propre
-- `WHERE published = true AND archived_at IS NULL`, juste en dessous.
--
-- Les 44 colonnes existantes sont reprises A L'IDENTIQUE ET DANS LE MEME
-- ORDRE : PostgreSQL refuse toute omission ou reordonnancement dans un
-- `CREATE OR REPLACE VIEW`, et n'autorise que l'ajout en fin. `updated_at`
-- est donc la 45e, en derniere position.
CREATE OR REPLACE VIEW public.sites_public
WITH (security_invoker = false)
AS SELECT
  id, slug, name, slogan, type, mode, custom_domain, primary_color,
  hero_title, hero_subtitle, about, services, testimonials, gallery,
  products, contact, menu, team, hours, social_links, address, pages,
  cta, theme, hero_image, lang, faq, whyus, mission, vision, geo_lat,
  geo_lng, area_served, price_range, hidden_sections, section_label,
  sections, created_at, dropship_type, pod_designs, product_families,
  cj_margin_percent, cj_round_mode, shipping_flat,
  updated_at
FROM public.sites
WHERE published = true AND archived_at IS NULL;

-- ============================================================
-- DEBT-073 -- REVOKE AVANT GRANT, ET C'EST OBLIGATOIRE SUR UNE VUE.
--
-- Supabase pose `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES`, et
-- `ON TABLES` couvre AUSSI les vues : cette vue est nee avec
-- INSERT/UPDATE/DELETE pour `anon` et `authenticated`. Un `GRANT SELECT`
-- n'annule rien -- il AJOUTE. Il faut donc REVOQUER d'abord.
--
-- Ce n'etait pas theorique : `sites_public` est AUTO-MODIFIABLE (une seule
-- relation dans son FROM) et en `security_invoker = false`. Les ecritures
-- s'executaient donc avec les droits du proprietaire, contournant la RLS de
-- `sites` et les grants de colonnes du LOT G -- un visiteur ANONYME pouvait
-- modifier ou supprimer les trois vitrines publiees. Ferme le 2026-08-26.
--
-- La CAUSE est traitee par `views_privileges_hardening.sql`. Ces deux lignes
-- rendent ce fichier-ci autonome et rejouable : ne jamais les separer.
-- ============================================================
REVOKE ALL ON public.sites_public FROM anon, authenticated;
GRANT SELECT ON public.sites_public TO anon, authenticated;

-- `updated_at` n'est PAS accordee en UPDATE a `authenticated` : elle est
-- posee par le declencheur, jamais par le marchand. L'y ajouter permettrait
-- de falsifier la fraicheur publiee.

-- ------------------------------------------------------------
-- 5/5 — VERIFICATIONS A EXECUTER ET A RENVOYER INTEGRALEMENT.
--
-- Tant que ces quatre resultats n'ont pas ete constates, la migration est
-- PREPAREE, pas EXECUTEE, et l'etape de code ci-dessous ne doit PAS etre
-- faite.
-- ------------------------------------------------------------

-- A. La colonne existe, nullable, sans defaut.
--    Attendu : 1 ligne, is_nullable = YES, column_default = NULL.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sites' AND column_name = 'updated_at';

-- B. Plus aucune ligne sans fraicheur.
--    Attendu : 0.
SELECT count(*) AS lignes_sans_updated_at FROM public.sites WHERE updated_at IS NULL;

-- C. Le declencheur est actif et porte bien sur des colonnes.
--    Attendu : 1 ligne, tgenabled = 'O' (la lettre O), nb_colonnes = 40.
SELECT t.tgname, t.tgenabled, array_length(t.tgattr, 1) AS nb_colonnes
FROM pg_trigger t
WHERE t.tgrelid = 'public.sites'::regclass AND NOT t.tgisinternal
  AND t.tgname = 'trg_sites_touch_updated_at';

-- D. La vue expose la colonne.
--    Attendu : 1 ligne.
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sites_public' AND column_name = 'updated_at';

-- ------------------------------------------------------------
-- ETAPE DE CODE, APRES A/B/C/D SEULEMENT :
--
--   `src/app/sites/[slug]/themes/shared.tsx`, constante `PUBLIC_COLS` :
--   ajouter `,updated_at` en fin de chaine.
--
-- C'est la SEULE ligne de code restante. Elle fait beneficier
-- `fetchSitePreview` (apercu proprietaire) de la meme fraicheur que la
-- vitrine publique, qui l'obtient deja par `select('*')` sur la vue.
-- Sans elle, l'apercu continue simplement de se rabattre sur `created_at` --
-- degrade, jamais casse.
-- ------------------------------------------------------------
