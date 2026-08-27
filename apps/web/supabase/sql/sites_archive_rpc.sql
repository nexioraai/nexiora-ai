-- Archivage atomique de sites — remplace le DELETE physique dans les flux
-- self-service (account/delete, dashboard) après l'audit ownership/RLS.
-- À exécuter manuellement dans l'éditeur SQL Supabase (convention déjà
-- établie de ce projet : aucun outillage de migration automatisé --
-- ce fichier documente l'état RÉELLEMENT déployé, il n'est jamais rejoué
-- automatiquement par un quelconque pipeline).
--
-- Prérequis déjà appliqués (audit précédent, confirmés live) :
--   - shop_orders.site_id -> sites.id ON DELETE RESTRICT
--   - sites.archived_at timestamptz (nullable)
--
-- HISTORIQUE (important pour la reproductibilité) : une première version
-- single-site, archive_site_if_no_blocking_orders(uuid, uuid), a été
-- déployée puis retirée de la production (confirmé live : PGRST202,
-- "Could not find the function" -- absente du schema cache). Ce fichier ne
-- la recrée volontairement PAS -- elle ne doit plus exister. La fonction
-- ci-dessous, à grain multi-sites, est la seule actuellement déployée et
-- utilisée par le code (src/app/api/account/delete/route.ts,
-- src/app/api/sites/[slug]/archive/route.ts).
--
-- Pourquoi une RPC et pas un .update() PostgREST direct : PostgREST
-- n'exécute qu'UNE seule instruction SQL par appel HTTP et ne supporte pas
-- de sous-requête corrélée (NOT EXISTS) dans une clause WHERE via son
-- query builder -- même contrainte déjà documentée dans
-- shop_stock_functions.sql pour decrement_shop_stock_batch.
--
-- Tout-ou-rien réel sur PLUSIEURS sites : tous les sites concernés sont
-- verrouillés (FOR UPDATE, triés par id pour éviter tout deadlock entre
-- deux appels concurrents portant sur des ensembles qui se chevauchent)
-- avant toute vérification des commandes -- soit tous les sites éligibles
-- sont archivés en une seule instruction UPDATE, soit aucun ne l'est.
--
-- Liste blanche fail-closed : seuls canceled/refunded/shipped sont sûrs.
-- Tout statut absent de cette liste bloque l'archivage, y compris un
-- statut futur inconnu qui n'existe pas encore dans le code aujourd'hui.
--
-- security invoker (pas definer) + revoke/grant service_role uniquement :
-- même pattern que shop_stock_functions.sql, déjà audité et confirmé
-- correct en production (anon=false, authenticated=false, service_role=true,
-- revérifié rôle par rôle après chaque déploiement de cette fonction).

create or replace function archive_sites_if_no_blocking_orders(
  p_site_ids uuid[],
  p_owner_id uuid
)
returns table(all_archived boolean, blocked_site_id uuid, blocking_statuses text[])
language plpgsql
security invoker
as $$
declare
  v_ids uuid[];
  v_requested_count int;
  v_locked_count int;
  v_site_id uuid;
  v_blocking text[];
  v_any_blocked boolean := false;
begin
  if p_site_ids is null then
    raise exception 'INVALID_ARGUMENT: p_site_ids must not be null (use an empty array for no-op)'
      using errcode = 'P0001';
  end if;

  select array(select distinct unnest(p_site_ids)) into v_ids;
  v_requested_count := coalesce(array_length(v_ids, 1), 0);

  if v_requested_count = 0 then
    return query select true, null::uuid, null::text[];
    return;
  end if;

  perform 1 from sites
  where id = any(v_ids) and owner_id = p_owner_id
  order by id
  for update;
  get diagnostics v_locked_count = row_count;

  if v_locked_count <> v_requested_count then
    raise exception 'INVALID_SITE: one or more site_ids do not exist or do not belong to owner %', p_owner_id
      using errcode = 'P0001';
  end if;

  foreach v_site_id in array v_ids loop
    select coalesce(array_agg(distinct status), array[]::text[]) into v_blocking
    from shop_orders
    where site_id = v_site_id
    and status not in ('canceled', 'refunded', 'shipped');

    if array_length(v_blocking, 1) > 0 then
      v_any_blocked := true;
      return query select false, v_site_id, v_blocking;
    end if;
  end loop;

  if v_any_blocked then
    return;
  end if;

  update sites
  set archived_at = now()
  where id = any(v_ids) and owner_id = p_owner_id and archived_at is null;

  return query select true, null::uuid, null::text[];
end;
$$;

revoke all on function archive_sites_if_no_blocking_orders(uuid[], uuid) from public;
revoke all on function archive_sites_if_no_blocking_orders(uuid[], uuid) from anon;
revoke all on function archive_sites_if_no_blocking_orders(uuid[], uuid) from authenticated;
grant execute on function archive_sites_if_no_blocking_orders(uuid[], uuid) to service_role;

-- Override admin : ignore les commandes bloquantes (usage exceptionnel,
-- journalisé côté application via logAnomaly avant tout appel -- voir
-- src/app/api/admin/site-archive-override/route.ts). Inchangée depuis son
-- déploiement initial, non affectée par le passage single-site -> multi-sites
-- de la fonction ci-dessus (aucune dépendance entre les deux).
create or replace function admin_force_archive_site(
  p_site_id uuid
)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_archived boolean := false;
begin
  update sites
  set archived_at = now()
  where id = p_site_id
    and archived_at is null
  returning true into v_archived;

  return coalesce(v_archived, false);
end;
$$;

revoke all on function admin_force_archive_site(uuid) from public;
revoke all on function admin_force_archive_site(uuid) from anon;
revoke all on function admin_force_archive_site(uuid) from authenticated;
grant execute on function admin_force_archive_site(uuid) to service_role;
