-- P0-3.7 / P0-3.8 — Fonctions PostgreSQL pour les sequences transactionnelles
-- critiques du fulfillment (P0-3.7U/V/Z). A executer APRES fulfillment_tables.sql,
-- manuellement dans l'editeur SQL Supabase.
--
-- Ces fonctions existent parce que le client @supabase/supabase-js (PostgREST)
-- utilise partout ailleurs dans ce repo n'execute qu'UNE seule instruction SQL
-- par appel — aucune transaction multi-statements, aucun SELECT...FOR UPDATE
-- explicite n'est possible depuis le code applicatif sans passer par une
-- fonction. C'est la contradiction technique signalee et validee au debut de
-- P0-3.8 (Option A retenue par l'utilisateur).
--
-- Appelees depuis TypeScript via supabaseAdmin.rpc('nom_fonction', {...}).
-- Executees sous le contexte service_role (deja utilise par supabaseAdmin
-- partout ailleurs) => bypass RLS nativement, pas besoin de SECURITY DEFINER.
--
-- CORRECTIF SECURITE (audit OBS-03/OBS-04) : la version initiale de ce
-- fichier ne restreignait l'execution d'aucune des 5 fonctions ci-dessous,
-- contrairement au pattern deja etabli et deux fois valide dans ce projet
-- (sites_archive_rpc.sql, shop_stock_functions.sql : REVOKE ALL ... GRANT
-- EXECUTE ... TO service_role). Sans ce correctif, ces fonctions auraient
-- ete potentiellement appelables directement via /rpc/ par anon/authenticated,
-- permettant de manipuler le moteur fulfillment pour des commandes
-- arbitraires. Ajoute ci-dessous, apres chaque fonction.

-- ============================================================
-- create_provider_submission
--
-- Cree une nouvelle Provider Submission ET revendique/deplace le pointeur
-- fulfillment_unit_active_submission pour toutes les unites couvertes, de
-- maniere atomique (P0-3.7V Partie 1, Cas B ; P0-3.7T Partie 4/5 ; P0-3.7U
-- Partie 4 corrigee).
--
-- Regle stricte : si UNE SEULE des unites listees a deja un pointeur actif
-- vers une submission qui n'est PAS en echec terminal, TOUTE la creation
-- echoue (aucune ligne n'est ecrite) — jamais de creation partielle.
--
-- Retour JSONB :
--   { success: true, submission_id }
--   { success: false, reason: 'ACTIVE_SUBMISSION_NOT_TERMINAL', fulfillment_unit_id, active_submission_id, active_status }
--   { success: false, reason: 'EMPTY_UNIT_LIST' }
-- Peut aussi RAISE EXCEPTION (errcode P0001) si une vraie course est perdue
-- APRES le debut de l'ecriture — dans ce cas la fonction entiere est
-- annulee automatiquement (rollback complet), aucune ligne orpheline
-- (P0-3.7V Partie 4, demontre pour le cas "deux Provider Changes simultanes").
-- ============================================================
create or replace function create_provider_submission(
  p_order_id uuid,
  p_provider text,
  p_idempotency_key text,
  p_fulfillment_unit_ids uuid[]
) returns jsonb
language plpgsql
as $$
declare
  v_submission_id uuid;
  v_unit_id uuid;
  v_existing_active uuid;
  v_existing_status text;
  v_updated integer;
begin
  if p_fulfillment_unit_ids is null or array_length(p_fulfillment_unit_ids, 1) is null then
    return jsonb_build_object('success', false, 'reason', 'EMPTY_UNIT_LIST');
  end if;

  -- Verrouille toutes les lignes pointeur EXISTANTES concernees, triees par
  -- id pour un ordre de verrouillage stable (evite les deadlocks entre
  -- transactions concurrentes sur des ensembles d'unites qui se chevauchent).
  perform 1
  from fulfillment_unit_active_submission
  where fulfillment_unit_id = any(p_fulfillment_unit_ids)
  order by fulfillment_unit_id
  for update;

  -- Phase de verification (aucune ecriture encore) : toutes les unites
  -- doivent etre soit sans pointeur, soit pointees vers une submission en
  -- echec terminal. Une seule non-eligible bloque tout (P0-3.7U Partie 4).
  for v_unit_id in select unnest(p_fulfillment_unit_ids) loop
    select active_submission_id into v_existing_active
    from fulfillment_unit_active_submission
    where fulfillment_unit_id = v_unit_id;

    if v_existing_active is not null then
      select status into v_existing_status
      from provider_submissions
      where id = v_existing_active;

      if v_existing_status not in ('failed_confirmed', 'failed_permanent') then
        return jsonb_build_object(
          'success', false,
          'reason', 'ACTIVE_SUBMISSION_NOT_TERMINAL',
          'fulfillment_unit_id', v_unit_id,
          'active_submission_id', v_existing_active,
          'active_status', v_existing_status
        );
      end if;
    end if;
  end loop;

  -- Phase d'ecriture.
  insert into provider_submissions (order_id, provider, idempotency_key, status)
  values (p_order_id, p_provider, p_idempotency_key, 'pending')
  returning id into v_submission_id;

  insert into provider_submission_items (submission_id, fulfillment_unit_id)
  select v_submission_id, unnest(p_fulfillment_unit_ids);

  for v_unit_id in select unnest(p_fulfillment_unit_ids) loop
    select active_submission_id into v_existing_active
    from fulfillment_unit_active_submission
    where fulfillment_unit_id = v_unit_id;

    if v_existing_active is null then
      -- Premiere submission jamais tentee pour cette unite : l'unicite de
      -- la PK protege nativement contre une double-creation concurrente
      -- (P0-3.7U/V — c'est la propriete centrale qui a motive ce mecanisme
      -- plutot qu'un advisory lock ou SERIALIZABLE).
      insert into fulfillment_unit_active_submission (fulfillment_unit_id, active_submission_id)
      values (v_unit_id, v_submission_id)
      on conflict (fulfillment_unit_id) do nothing;

      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        raise exception 'CONCURRENT_SUBMISSION_RACE unit=%', v_unit_id using errcode = 'P0001';
      end if;
    else
      -- Deplacement conditionnel : ne reussit que si le pointeur n'a pas
      -- change depuis la lecture (protege par le FOR UPDATE ci-dessus,
      -- tenu jusqu'au COMMIT de cette fonction).
      update fulfillment_unit_active_submission
      set active_submission_id = v_submission_id, updated_at = now()
      where fulfillment_unit_id = v_unit_id and active_submission_id = v_existing_active;

      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        raise exception 'CONCURRENT_SUBMISSION_RACE unit=%', v_unit_id using errcode = 'P0001';
      end if;
    end if;
  end loop;

  return jsonb_build_object('success', true, 'submission_id', v_submission_id);
end;
$$;

revoke all on function create_provider_submission(uuid, text, text, uuid[]) from public;
revoke all on function create_provider_submission(uuid, text, text, uuid[]) from anon;
revoke all on function create_provider_submission(uuid, text, text, uuid[]) from authenticated;
grant execute on function create_provider_submission(uuid, text, text, uuid[]) to service_role;

-- ============================================================
-- claim_provider_submission_attempt
--
-- Generalisation du pattern cj_pay_status/cj_pay_attempts (src/lib/cj/fulfill.ts)
-- a provider_submissions. Revendique une tentative reseau (retry ou premiere
-- tentative) de maniere atomique — un seul worker gagne (P0-3.7T Partie 16,
-- P0-3.7Z Partie test retry).
-- ============================================================
create or replace function claim_provider_submission_attempt(
  p_submission_id uuid
) returns jsonb
language plpgsql
as $$
declare
  v_updated integer;
  v_attempt_count integer;
begin
  update provider_submissions
  set status = 'processing', attempt_count = attempt_count + 1, updated_at = now()
  where id = p_submission_id
    and status in ('pending', 'uncertain')
  returning attempt_count into v_attempt_count;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('success', false, 'reason', 'CLAIM_LOST_OR_INVALID_STATE');
  end if;

  return jsonb_build_object('success', true, 'attempt_count', v_attempt_count);
end;
$$;

revoke all on function claim_provider_submission_attempt(uuid) from public;
revoke all on function claim_provider_submission_attempt(uuid) from anon;
revoke all on function claim_provider_submission_attempt(uuid) from authenticated;
grant execute on function claim_provider_submission_attempt(uuid) to service_role;

-- ============================================================
-- transition_submission_status
--
-- Primitive generique de transition conditionnelle pour provider_submissions
-- (PROCESSING->SUCCESS, PROCESSING->UNCERTAIN, UNCERTAIN->FAILED_CONFIRMED,
-- etc. — P0-3.7A-F, machine a etats inchangee). N'ecrit JAMAIS retroactivement
-- une submission deja terminale (P0-3.7Z Partie 4 : l'historique n'est jamais
-- reecrit — garanti ici par la clause "status = any(p_expected_statuses)").
-- ============================================================
create or replace function transition_submission_status(
  p_submission_id uuid,
  p_new_status text,
  p_expected_statuses text[],
  p_provider_response jsonb default null
) returns jsonb
language plpgsql
as $$
declare
  v_updated integer;
begin
  update provider_submissions
  set status = p_new_status,
      last_provider_response = coalesce(p_provider_response, last_provider_response),
      updated_at = now()
  where id = p_submission_id
    and status = any(p_expected_statuses);

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('success', false, 'reason', 'UNEXPECTED_CURRENT_STATUS');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function transition_submission_status(uuid, text, text[], jsonb) from public;
revoke all on function transition_submission_status(uuid, text, text[], jsonb) from anon;
revoke all on function transition_submission_status(uuid, text, text[], jsonb) from authenticated;
grant execute on function transition_submission_status(uuid, text, text[], jsonb) to service_role;

-- ============================================================
-- upsert_provider_order
--
-- Point d'entree unique pour toute preuve d'existence d'un Provider Order
-- (reponse HTTP de creation OU webhook) — gere la course HTTP/webhook via
-- UNIQUE(provider, provider_order_id) (P0-3.7V Partie 11/14), relie les
-- items via les deux FK composites, et calcule le diagnostic "late webhook"
-- (P0-3.7Z) SANS JAMAIS deplacer le pointeur ni reecrire l'historique — le
-- late webhook est uniquement signale, jamais corrige automatiquement.
-- ============================================================
create or replace function upsert_provider_order(
  p_submission_id uuid,
  p_provider text,
  p_provider_order_id text,
  p_raw_status text,
  p_normalized_status text,
  p_provider_response jsonb,
  p_fulfillment_unit_ids uuid[]
) returns jsonb
language plpgsql
as $$
declare
  v_order_row_id uuid;
  v_is_new boolean := false;
  v_unit_id uuid;
  v_active_submission_id uuid;
  v_late boolean := false;
  v_late_units uuid[] := '{}';
begin
  insert into provider_orders (submission_id, provider, provider_order_id, raw_provider_status, normalized_status, last_provider_response)
  values (p_submission_id, p_provider, p_provider_order_id, p_raw_status, p_normalized_status, p_provider_response)
  on conflict (provider, provider_order_id) do nothing
  returning id into v_order_row_id;

  if v_order_row_id is not null then
    v_is_new := true;
  else
    select id into v_order_row_id
    from provider_orders
    where provider = p_provider and provider_order_id = p_provider_order_id;
  end if;

  if v_is_new and p_fulfillment_unit_ids is not null and array_length(p_fulfillment_unit_ids, 1) is not null then
    insert into provider_order_items (provider_order_id, submission_id, fulfillment_unit_id)
    select v_order_row_id, p_submission_id, unnest(p_fulfillment_unit_ids)
    on conflict (provider_order_id, fulfillment_unit_id) do nothing;
  end if;

  if p_fulfillment_unit_ids is not null then
    foreach v_unit_id in array p_fulfillment_unit_ids loop
      select active_submission_id into v_active_submission_id
      from fulfillment_unit_active_submission
      where fulfillment_unit_id = v_unit_id;

      if v_active_submission_id is distinct from p_submission_id then
        v_late := true;
        v_late_units := array_append(v_late_units, v_unit_id);
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'success', true,
    'provider_order_row_id', v_order_row_id,
    'was_new', v_is_new,
    'late_webhook', v_late,
    'late_units', to_jsonb(v_late_units)
  );
end;
$$;

revoke all on function upsert_provider_order(uuid, text, text, text, text, jsonb, uuid[]) from public;
revoke all on function upsert_provider_order(uuid, text, text, text, text, jsonb, uuid[]) from anon;
revoke all on function upsert_provider_order(uuid, text, text, text, text, jsonb, uuid[]) from authenticated;
grant execute on function upsert_provider_order(uuid, text, text, text, text, jsonb, uuid[]) to service_role;

-- ============================================================
-- apply_provider_order_status
--
-- Guard de transition categorielle (P0-3.7W/X) pour les mises a jour de
-- provider_orders.normalized_status APRES creation (webhooks de suivi).
-- Regle : accepte la progression pending..delivered (via le rang), accepte
-- toute entree vers 'failed' (sauf depuis 'delivered'), accepte toute
-- entree/sortie de 'unrecognized', rejette tout le reste (notamment toute
-- regression, P0-3.7W Partie 6-8).
--
-- Point important : cette contrainte etait identifiee en P0-3.7Y Partie 14
-- comme "discipline applicative uniquement, jamais garantie par le
-- schema" — cette fonction la fait devenir une garantie DB reelle,
-- strictement plus forte que ce qui avait ete demontre necessaire (a noter
-- dans le rapport comme amelioration, pas comme deviation).
-- ============================================================
create or replace function apply_provider_order_status(
  p_provider_order_row_id uuid,
  p_raw_status text,
  p_new_normalized_status text
) returns jsonb
language plpgsql
as $$
declare
  v_updated integer;
  v_current text;
begin
  select normalized_status into v_current from provider_orders where id = p_provider_order_row_id;
  if v_current is null then
    return jsonb_build_object('success', false, 'reason', 'PROVIDER_ORDER_NOT_FOUND');
  end if;

  update provider_orders
  set normalized_status = p_new_normalized_status,
      raw_provider_status = p_raw_status,
      updated_at = now()
  where id = p_provider_order_row_id
  and (
    normalized_status = p_new_normalized_status
    or normalized_status = 'unrecognized'
    or p_new_normalized_status = 'unrecognized'
    or (p_new_normalized_status = 'failed' and normalized_status <> 'delivered')
    or exists (
      select 1 from fulfillment_status_rank rc, fulfillment_status_rank rn
      where rc.status = normalized_status and rn.status = p_new_normalized_status and rn.rank > rc.rank
    )
  );

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('success', false, 'reason', 'TRANSITION_REJECTED', 'from_status', v_current, 'to_status', p_new_normalized_status);
  end if;

  return jsonb_build_object('success', true, 'from_status', v_current, 'to_status', p_new_normalized_status);
end;
$$;

revoke all on function apply_provider_order_status(uuid, text, text) from public;
revoke all on function apply_provider_order_status(uuid, text, text) from anon;
revoke all on function apply_provider_order_status(uuid, text, text) from authenticated;
grant execute on function apply_provider_order_status(uuid, text, text) to service_role;
