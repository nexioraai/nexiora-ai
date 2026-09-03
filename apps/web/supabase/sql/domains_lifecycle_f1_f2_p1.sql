-- ============================================================
-- LOT DOMAINES -- F-1, F-2 et P1.
--
-- CE FICHIER N'EST PAS APPLIQUE PAR CE LOT. Aucune ecriture de production
-- n'a ete faite. Tant qu'il n'est pas execute, le code se comporte ainsi :
--   * la RESILIATION echoue explicitement (jamais un faux succes) ;
--   * l'HISTORIQUE n'est pas ecrit, et son echec est signale sans bloquer.
-- C'est volontaire : une garde qui ne peut pas ecrire son etat doit refuser,
-- un journal d'audit qui ne peut pas ecrire ne doit pas casser un parcours.
-- ============================================================

-- ---------- F-2 : etat de renouvellement ----------
-- `auto_renew` est le POINTEUR COURANT : le domaine se renouvelle-t-il ?
-- Il vaut `true` par defaut car c'est le comportement du registraire pour
-- tout domaine achete.
alter table public.site_domains
  add column if not exists auto_renew boolean not null default true;

-- Horodate la DECISION du client, distincte de l'expiration effective.
alter table public.site_domains
  add column if not exists renewal_cancelled_at timestamptz;

-- Marqueur de RECONCILIATION : la decision est prise cote Deribfy mais le
-- registraire ne l'a pas confirmee. Sans cette colonne, un echec de l'appel
-- registraire serait indistinguable d'une resiliation reussie.
alter table public.site_domains
  add column if not exists renewal_sync_error text;

-- ---------- P1 : journal d'evenements, en AJOUT SEUL ----------
-- CE QU'IL N'EST PAS : un remplacement de `sites.custom_domain`. Le pointeur
-- courant et l'historique sont deux concepts distincts -- l'un repond « quel
-- domaine sert ce site MAINTENANT », l'autre « que s'est-il passe ».
--
-- AUCUNE DONNEE PERSONNELLE N'Y EST STOCKEE : ni contact, ni adresse, ni
-- e-mail. Un nom de domaine et un identifiant de site suffisent a l'audit, et
-- cette sobriete est ce qui rend le journal compatible avec une obligation
-- d'effacement portant sur un compte.
create table if not exists public.site_domain_events (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid references public.sites (id) on delete set null,
  domain       text not null,
  evenement    text not null,
  origine      text not null,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists site_domain_events_site_idx
  on public.site_domain_events (site_id, created_at desc);
create index if not exists site_domain_events_domain_idx
  on public.site_domain_events (domain, created_at desc);

-- AJOUT SEUL, IMPOSE PAR LA BASE. Sans cela, « append-only » ne serait
-- qu'une intention de code -- exactement le genre de garantie declarative que
-- ce depot refuse.
revoke update, delete on public.site_domain_events from anon, authenticated, service_role;

alter table public.site_domain_events enable row level security;
-- Aucune policy de lecture pour anon/authenticated : ce journal est interne.
