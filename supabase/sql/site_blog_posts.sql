-- ============================================================
-- BLOG MULTI-TENANT -- contenu editorial des SITES CLIENTS.
--
-- DEBT-074 -- CE FICHIER DOCUMENTE UN ETAT DEJA DEPLOYE. Il a ete execute
-- manuellement dans l'editeur SQL Supabase le 2026-08-26, puis VERIFIE par
-- treize controles (etape 6 du plan, 13/13 PASS). Il est ecrit ici APRES coup
-- parce que rien de ce lot n'etait versionne -- c'est precisement la lacune
-- que DEBT-074 nommait, et que ce fichier ferme.
--
-- REJOUABLE SANS DANGER : entierement additif, `if not exists` partout, aucun
-- DROP de table/vue/policy, aucune ecriture de donnee, aucune policy existante
-- touchee. Le rejouer sur une base ou il est deja applique est un no-op.
--
-- CE QUE CETTE TABLE N'EST PAS :
--   * `blog_posts`       -- blog de la PLATEFORME, aucune colonne de site,
--                           SELECT accorde a anon, ecriture reservee aux
--                           administrateurs Deribfy ;
--   * `marketing_assets` -- rattachee par `slug` (FK reelle vers sites.slug)
--                           + `owner_email`, jamais relue. Voir DEBT-078.
--
-- POURQUOI `site_id` ET JAMAIS `sites.slug` : un slug est un identifiant
-- d'ADRESSAGE. Il ne porte ni integrite vers l'identite du site, ni cascade,
-- ni immutabilite.
-- ============================================================

-- ------------------------------------------------------------
-- 1/4 -- TABLE
-- ------------------------------------------------------------
create table if not exists public.site_blog_posts (
  id                 uuid primary key default gen_random_uuid(),
  site_id            uuid not null references public.sites(id) on delete cascade,
  slug               text not null,
  title              text not null,
  excerpt            text,
  content            text not null,
  cover_image        text,
  cover_storage_path text,
  published          boolean not null default false,
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Un article publie SANS date de publication serait invisible de la vue
  -- publique tout en se declarant publie : deux verites contradictoires dans
  -- la meme ligne. La base refuse cet etat.
  constraint site_blog_posts_published_at_chk
    check (published = false or published_at is not null),

  -- Le slug est un segment d'URL, pas du texte libre. Borne posee ICI et pas
  -- seulement dans l'application : c'est la seule qui survive a la suppression
  -- d'une validation applicative.
  constraint site_blog_posts_slug_chk
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120),

  -- `btrim` : sans lui, un titre de trois espaces satisfait la borne.
  constraint site_blog_posts_title_chk
    check (length(btrim(title)) between 1 and 300)
);

-- ------------------------------------------------------------
-- 2/4 -- INDEX
-- ------------------------------------------------------------
-- L'INVARIANT CENTRAL. Unique DANS le site, jamais globalement : deux
-- marchands doivent pouvoir publier « nos-horaires » sans se voir.
create unique index if not exists site_blog_posts_site_slug_uidx
  on public.site_blog_posts (site_id, slug);

create index if not exists site_blog_posts_site_published_idx
  on public.site_blog_posts (site_id, published, published_at desc);

-- ------------------------------------------------------------
-- 3/4 -- RLS ET PRIVILEGES
-- ------------------------------------------------------------
-- AUCUNE POLICY N'EST CREEE, ET C'EST UNE DECISION, PAS UN OUBLI.
--   * anon / authenticated n'ont AUCUN grant -> PostgREST rend 401 AVANT
--     d'evaluer la moindre policy (mesure : 42501) ;
--   * service_role possede BYPASSRLS : une policy d'ecriture serait contournee
--     a chaque appel reel des routes serveur ;
--   * la lecture publique passe par la VUE en `security_invoker = false`.
-- Meme patron que design_uploads.sql.
--
-- NE JAMAIS poser `FORCE ROW LEVEL SECURITY` ici : le proprietaire cesserait
-- de contourner la RLS et la vue rendrait ZERO ligne a tout visiteur.
alter table public.site_blog_posts enable row level security;

revoke all on table public.site_blog_posts from anon, authenticated;
grant  all on table public.site_blog_posts to service_role;

-- ------------------------------------------------------------
-- 4/4 -- VUE PUBLIQUE
-- ------------------------------------------------------------
-- `security_invoker = false` : la vue s'execute avec les droits de son
-- proprietaire, la RLS de la table n'est jamais consultee. Sans cela elle
-- rendrait zero ligne -- c'est le defaut mesure sur `blog_posts` (DEBT-071) :
-- un GRANT sans policy est un zero silencieux.
--
-- JOINTURE SUR `sites_public`, JAMAIS SUR `sites` : l'invariant
-- « publie ET non archive » est ainsi HERITE et non recopie. Et comme
-- `sites_public` n'expose ni `published` ni `archived_at`, il devient
-- syntaxiquement impossible de le reecrire a la main ici.
create or replace view public.site_blog_posts_public
with (security_invoker = false) as
select
  p.id, p.site_id, s.slug as site_slug, p.slug, p.title, p.excerpt, p.content,
  p.cover_image, p.published_at, p.updated_at
from public.site_blog_posts p
join public.sites_public s on s.id = p.site_id
where p.published = true
  and p.published_at is not null
  and p.published_at <= now();

-- REVOKE PUIS GRANT, DANS CET ORDRE. Supabase pose
-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES`, et `ON TABLES` couvre
-- AUSSI les vues : un `GRANT SELECT` seul laisserait INSERT/UPDATE/DELETE en
-- place. C'est exactement le defaut trouve sur `sites_public` -- voir DEBT-073,
-- dont la CAUSE reste ouverte.
revoke all    on public.site_blog_posts_public from anon, authenticated;
grant  select on public.site_blog_posts_public to   anon, authenticated;

-- ------------------------------------------------------------
-- 5/5 -- FACULTATIF : fraicheur automatique
-- ------------------------------------------------------------
-- `updated_at` alimente le <lastmod> du sitemap : un lastmod faux contredit le
-- changefreq annonce (lecon DEBT-034). `set search_path` fige : une fonction
-- sans lui est vulnerable au shadowing (correction deja appliquee a
-- admin_sites_by_mode dans phase2_privileges_hardening.sql).
create or replace function public.touch_site_blog_posts_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp
as $$ begin new.updated_at := now(); return new; end $$;

revoke execute on function public.touch_site_blog_posts_updated_at()
  from public, anon, authenticated;

drop trigger if exists site_blog_posts_touch_updated_at on public.site_blog_posts;
create trigger site_blog_posts_touch_updated_at
  before update on public.site_blog_posts
  for each row execute function public.touch_site_blog_posts_updated_at();
