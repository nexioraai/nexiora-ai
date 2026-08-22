-- VERIFIE APPLIQUE EN PRODUCTION (audit Mode 3/POD BRAND, perfectionnement
-- lot 3, 2026-08-21) : confirme par 3 tests reels (cle anon sur `sites` ->
-- 0 ligne ; JWT d'un compte jetable authentifie sans site -> 0 ligne sur
-- `sites`, 3 lignes (les sites publies) sur `sites_public` ; PATCH direct
-- sur `sites` avec ce meme JWT -> 0 ligne affectee, relu via service_role,
-- aucune donnee modifiee) et par l'absence des colonnes owner_email/
-- owner_id/payment_account_id/stripe_customer_id sur `sites_public`
-- (42703 sur les 4). Compte de test cree puis supprime dans la meme
-- session (voir KNOWN_ISSUES.md DEBT-018). Ce fichier reste comme
-- documentation de l'etat attendu / pour un futur environnement (staging,
-- reprovisioning) -- l'avertissement d'ordre d'execution ci-dessous reste
-- valide dans ce cas.
--
-- Audit Mode 3/POD BRAND, LOT 1 -- exposition de colonnes sensibles de
-- `sites` (owner_email, owner_id, stripe_customer_id, payment_account_id)
-- a anon ET a authenticated non-proprietaire, via select=* direct sur la
-- table de base. RLS protegeait deja correctement les LIGNES (policy
-- "Sites readable if published or owned", published=true OR
-- owner_id=auth.uid()) mais PostgreSQL n'offre aucun mecanisme de
-- restriction de colonne conditionnelle par ligne -- toute ligne visible
-- expose ses 58 colonnes.
--
-- Architecture retenue (voir audit complet) : vue publique limitee aux
-- colonnes reellement consommees par le storefront (PUBLIC_COLS,
-- src/app/sites/[slug]/themes/shared.tsx) + resserrement de la policy
-- SELECT de la table de base a owner_id=auth.uid() seul. Une vue seule,
-- sans ce resserrement, ne protege rien : la table de base resterait
-- interrogeable directement avec les memes colonnes sensibles.
--
-- cj_margin_percent / cj_round_mode / pod_designs restent dans la vue
-- volontairement : mockupsToProducts() (theme rendering, POD Brand) et
-- loadCatalogSelections() (reseller/pod_custom) lisent ces colonnes sur
-- l'objet site cote client -- les retirer casserait le calcul du prix
-- affiche (retomberait sur DEFAULT_MARGIN_PERCENT=100%, silencieusement).
-- Dette commerciale documentee, non resolue ici (voir rapport).
--
-- AVERTISSEMENT D'ORDRE D'EXECUTION (trouve en revue, audit Mode 3/POD
-- BRAND, perfectionnement lot 2) -- CRITIQUE, a lire avant d'executer ce
-- fichier : l'etape 3/4 ci-dessous resserre la policy SELECT a
-- `owner_id = auth.uid()` SEUL (retire le "OR owner_id=auth.uid()" combine
-- a published=true, et ne garde QUE la branche ownership pour les sites non
-- publies). `sites.owner_id` est une colonne additive SANS backfill pour
-- les sites reels preexistants (voir sites_owner_id_step1_add_column.sql) :
-- executer CE fichier AVANT sites_owner_id_step2_backfill.sql couperait
-- l'acces en lecture (RLS, donc y compris via un client anon correctement
-- filtre par owner_email cote application -- RLS s'applique AVANT tout
-- filtre applicatif, jamais apres) a TOUS les marchands existants sur leur
-- PROPRE site non publie, et casserait /edit/[slug] pour l'integralite du
-- parcours d'edition (Navbar.tsx, edit/[slug]/page.tsx -- voir
-- src/lib/supabase-owned-site.ts) pour ces memes sites. ORDRE OBLIGATOIRE :
-- 1) sites_owner_id_step1_add_column.sql (deja fait, colonne existe)
-- 2) sites_owner_id_step2_backfill.sql -- EXECUTER ET VERIFIER EN PREMIER
-- 3) SEULEMENT ENSUITE ce fichier (sites_public_view.sql)
-- Ne jamais executer ce fichier avant d'avoir confirme (SELECT count(*)
-- from sites where owner_id is null) que ce nombre est 0 ou ne concerne
-- que des sites reellement orphelins (compte auth.users supprime).
--
-- archived_at IS NULL : deja applique par fetchSite() (shared.tsx:153),
-- pas une nouvelle regle -- corrige au passage l'incoherence deja
-- existante sur fetchSiteByDomain/fetchSiteBrandByDomain/fetchProduct.ts/
-- sitemap.ts, qui ne le verifiaient pas.

-- ============================================================
-- 1/4 -- creation de la vue (additif, aucune donnee supprimee/modifiee)
-- ============================================================
CREATE OR REPLACE VIEW public.sites_public
WITH (security_invoker = false) AS
SELECT
  id, slug, name, slogan, type, mode, custom_domain, primary_color,
  hero_title, hero_subtitle, about, services, testimonials, gallery,
  products, contact, menu, team, hours, social_links, address, pages,
  cta, theme, hero_image, lang, faq, whyus, mission, vision, geo_lat,
  geo_lng, area_served, price_range, hidden_sections, section_label,
  sections, created_at, dropship_type, pod_designs, product_families,
  cj_margin_percent, cj_round_mode, shipping_flat
FROM public.sites
WHERE published = true AND archived_at IS NULL;

-- ============================================================
-- 2/4 -- grants sur la vue uniquement (jamais sur la table de base)
-- ============================================================
GRANT SELECT ON public.sites_public TO anon, authenticated;

-- ============================================================
-- 3/4 -- resserrement de la policy SELECT sur la table de base.
-- Idempotent : DROP POLICY IF EXISTS puis CREATE -- rejouable sans erreur
-- si deja applique. Ne touche AUCUNE policy INSERT/UPDATE/DELETE.
-- ============================================================
DROP POLICY IF EXISTS "Sites readable if published or owned" ON public.sites;
DROP POLICY IF EXISTS "Owners can read their own site" ON public.sites;

CREATE POLICY "Owners can read their own site"
  ON public.sites FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- ============================================================
-- 4/4 -- verification immediate en lecture seule (n'affecte rien, sert
-- uniquement a confirmer que les 2 policies attendues existent et que
-- INSERT/UPDATE/DELETE n'ont pas ete touchees). A me renvoyer.
-- ============================================================
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'sites'
ORDER BY policyname;
