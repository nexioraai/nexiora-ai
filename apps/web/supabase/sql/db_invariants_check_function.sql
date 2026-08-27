-- =============================================================
-- DETTE 5 — LE SEUL POINT OÙ LE DÉPÔT PEUT INTERROGER LA BASE.
--
-- À exécuter manuellement dans l'éditeur SQL Supabase — même convention que
-- shop_products_inventory_policy_step1_add_columns.sql, shop_stock_functions.sql,
-- commerce_admission_orders_require_transacting_site.sql.
--
-- ============================================================
-- LE DÉFAUT CORRIGÉ
--
-- Cinq fichiers de test lisent des fichiers SQL ; AUCUN n'interroge la base.
-- `dbInvariant.test.ts` le dit lui-même : « Il n'y a pas de PostgreSQL sous
-- Vitest… Prétendre le contraire ici serait fabriquer du vert. »
--
-- Conséquence : le dépôt peut affirmer un invariant que la base n'applique
-- plus, et rien ne le verrait. La dette 1 en est l'illustration — le fichier
-- `shop_stock_functions.sql` porte désormais un avertissement d'obsolescence,
-- mais RIEN ne détecte qu'il a été rejoué.
--
-- ============================================================
-- POURQUOI UNE RPC, ET PAS UNE VUE NI UNE CONNEXION DIRECTE
--
-- MESURÉ : PostgREST n'expose que le schéma `public`. `information_schema`,
-- `pg_trigger` et `pg_proc` sont hors d'atteinte, et aucune vue du dépôt ne
-- les expose. La CI ne dispose que de SUPABASE_SERVICE_ROLE_KEY et de l'URL
-- PostgREST — aucune chaîne de connexion PostgreSQL directe.
--
-- Une VUE aurait exposé la structure interne à quiconque obtiendrait la clé
-- anon si la RLS était mal posée. Une connexion directe aurait exigé un
-- nouveau secret et une surface d'accès bien plus large. Une RPC fermée est
-- la porte la plus étroite qui atteigne les catalogues.
--
-- ============================================================
-- CE QU'ELLE NE FAIT PAS
--
-- Elle ne LIT AUCUNE DONNÉE MÉTIER. Ni produit, ni commande, ni site, ni
-- client. Elle interroge exclusivement les catalogues de structure et rend
-- des booléens et des noms d'objets. Une fuite de son résultat n'apprendrait
-- rien qu'un `select` sur une table publique n'apprenne déjà.
--
-- Elle ne CORRIGE RIEN. Elle constate. Réparer une divergence est une
-- décision humaine, jamais un effet de bord d'une vérification.
--
-- ============================================================
-- LE CONTRAT DE RETOUR, ET POURQUOI IL COMPTE
--
-- `performed_checks` existe pour une seule raison : distinguer « vérifié et
-- conforme » de « pas vérifié ». Sans ce compteur, un résultat tronqué —
-- version future partielle, erreur silencieuse — serait indistinguable d'une
-- base saine. L'appelant DOIT comparer `performed_checks` à
-- `expected_checks` et traiter tout écart comme INVÉRIFIABLE, jamais comme
-- conforme. C'est la règle que tout ce chantier applique depuis M1-7 :
-- l'inconnu ne vaut jamais l'accord.
--
-- IDEMPOTENT : `create or replace`. Rejouable sans effet de bord.
-- ROLLBACK : drop function if exists check_db_invariants();
-- =============================================================

create or replace function check_db_invariants()
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_violations jsonb := '[]'::jsonb;
  v_performed  integer := 0;
  v_expected   constant integer := 5;
  v_type       text;
  v_nullable   text;
  v_default    text;
  v_tgname     text;
  v_tgdef      text;
  v_prosrc     text;
begin
  -- ---------- 1 à 3 : les trois colonnes de shop_products ----------
  -- track_inventory  (étape 1) : la POLITIQUE d'inventaire
  -- stock_counted_at (étape 1) : l'AFFIRMATION de comptage
  -- for_sale         (étape 8A) : l'ACHETABILITÉ, distincte de published
  --
  -- Chacune est vérifiée sur son type ET sa nullabilité : un `is_nullable`
  -- devenu YES réintroduirait le troisième état que ces colonnes excluent, et
  -- obligerait chaque lecteur à choisir seul un repli.
  declare
    r record;
  begin
    for r in
      select * from (values
        ('track_inventory',  'boolean',                     'NO'),
        ('stock_counted_at', 'timestamp with time zone',    'YES'),
        ('for_sale',         'boolean',                     'NO')
      ) as t(col, expected_type, expected_nullable)
    loop
      select data_type, is_nullable, column_default
        into v_type, v_nullable, v_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'shop_products' and column_name = r.col;

      v_performed := v_performed + 1;

      if v_type is null then
        v_violations := v_violations || jsonb_build_object(
          'invariant', 'shop_products.' || r.col,
          'detail',    'colonne ABSENTE de la base'
        );
      elsif v_type <> r.expected_type then
        v_violations := v_violations || jsonb_build_object(
          'invariant', 'shop_products.' || r.col,
          'detail',    format('type %s (attendu %s)', v_type, r.expected_type)
        );
      elsif v_nullable <> r.expected_nullable then
        v_violations := v_violations || jsonb_build_object(
          'invariant', 'shop_products.' || r.col,
          'detail',    format('is_nullable %s (attendu %s)', v_nullable, r.expected_nullable)
        );
      end if;
    end loop;
  end;

  -- ---------- 4 : le trigger de l'étape 2, ET SA PORTÉE ----------
  -- Sa portée est ce qui compte autant que son existence : `before update OF
  -- track_inventory` signifie qu'il ne se réveille QUE si cette colonne
  -- figure dans le SET. Un trigger présent mais de portée élargie ou réduite
  -- ne protège plus la même chose.
  select t.tgname, pg_get_triggerdef(t.oid)
    into v_tgname, v_tgdef
  from pg_trigger t
  where t.tgrelid = 'public.shop_products'::regclass
    and not t.tgisinternal
    and t.tgname = 'trg_enforce_stock_tracking_requires_count';

  v_performed := v_performed + 1;

  if v_tgname is null then
    v_violations := v_violations || jsonb_build_object(
      'invariant', 'trigger trg_enforce_stock_tracking_requires_count',
      'detail',    'trigger ABSENT — la barriere de recomptage ne protege plus rien'
    );
  elsif v_tgdef !~* 'UPDATE OF track_inventory' then
    v_violations := v_violations || jsonb_build_object(
      'invariant', 'trigger trg_enforce_stock_tracking_requires_count',
      'detail',    'portee inattendue : ' || v_tgdef
    );
  end if;

  -- ---------- 5 : le corps DÉPLOYÉ de decrement_shop_stock_batch ----------
  -- C'est la vérification qui aurait détecté la dette 1. Le fichier
  -- shop_stock_functions.sql contient une version PÉRIMÉE de cette fonction,
  -- sans `track_inventory`. La rejouer ferait échouer EN BLOC toute commande
  -- mêlant un produit suivi et un produit non suivi, déclenchant un
  -- remboursement Stripe automatique — silencieusement, puisque les cliquets
  -- du dépôt lisent des fichiers et jamais la base.
  select p.prosrc into v_prosrc
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'decrement_shop_stock_batch';

  v_performed := v_performed + 1;

  if v_prosrc is null then
    v_violations := v_violations || jsonb_build_object(
      'invariant', 'decrement_shop_stock_batch',
      'detail',    'fonction ABSENTE du schema public'
    );
  elsif v_prosrc !~* 'and track_inventory is true' then
    v_violations := v_violations || jsonb_build_object(
      'invariant', 'decrement_shop_stock_batch',
      'detail',    'le corps deploye ne contient pas « and track_inventory is true » — version d''AVANT l''etape 4'
    );
  end if;

  return jsonb_build_object(
    'schema_version',   1,
    'expected_checks',  v_expected,
    'performed_checks', v_performed,
    'conforming',       jsonb_array_length(v_violations) = 0,
    'violations',       v_violations
  );
end;
$$;

comment on function check_db_invariants() is
  'DETTE 5 — constate, dans la base REELLEMENT deployee, les invariants que le depot affirme : les trois colonnes de shop_products (track_inventory, stock_counted_at, for_sale), le trigger de recomptage et sa portee, et la presence de « and track_inventory is true » dans le corps deploye de decrement_shop_stock_batch. Ne lit aucune donnee metier et ne corrige rien. `performed_checks` doit etre compare a `expected_checks` par l''appelant : tout ecart signifie INVERIFIABLE, jamais conforme.';

-- ---------- Privilèges ----------
-- Même convention que les 8 autres RPC du dépôt : fermée à tous, ouverte au
-- seul service_role. La CI l'appelle avec SUPABASE_SERVICE_ROLE_KEY ; aucune
-- clé publique ne peut l'atteindre.
revoke all on function check_db_invariants() from public;
revoke all on function check_db_invariants() from anon;
revoke all on function check_db_invariants() from authenticated;
grant execute on function check_db_invariants() to service_role;


-- =============================================================
-- VÉRIFICATIONS APRÈS APPLICATION (lecture seule, à exécuter séparément)
-- =============================================================
--
-- A. La fonction existe, rend du jsonb, et n'est pas SECURITY DEFINER.
--
--   select p.proname, pg_get_function_result(p.oid) as retour, p.prosecdef
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'check_db_invariants';
--
--   -- attendu : check_db_invariants | jsonb | false
--
-- B. Les privilèges sont fermés.
--
--   select has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
--          has_function_privilege('service_role', p.oid, 'EXECUTE')  as service_role
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'check_db_invariants';
--
--   -- attendu : false | false | true
--
-- C. Le verdict sur la base actuelle.
--
--   select check_db_invariants();
--
--   -- attendu si tout est conforme :
--   --   {"conforming": true, "violations": [], "schema_version": 1,
--   --    "expected_checks": 5, "performed_checks": 5}
--   --
--   -- performed_checks < 5 = STOP : resultat incomplet, a traiter comme
--   -- INVERIFIABLE et non comme conforme.
-- =============================================================
