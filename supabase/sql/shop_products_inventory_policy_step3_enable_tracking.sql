-- =============================================================
-- CHANTIER CATALOGUE CANONIQUE — ÉTAPE 3 / 8
-- FONCTION MÉTIER DE RÉACTIVATION DU SUIVI D'INVENTAIRE
--
-- À exécuter manuellement dans l'éditeur SQL Supabase (aucun outillage de
-- migration dans ce dépôt — même convention que M1-7, étapes 1 et 2).
--
-- ⚠️ À EXÉCUTER APRÈS l'étape 2 (barrière
-- trg_enforce_stock_tracking_requires_count), jamais avant : sans elle, cette
-- fonction n'aurait rien à satisfaire et son intérêt disparaîtrait.
--
-- ============================================================
-- CE QUE CETTE ÉTAPE APPORTE
--
-- L'étape 2 a posé une barrière : réactiver le suivi d'inventaire exige
-- d'affirmer un comptage. Elle rend l'état incohérent INATTEIGNABLE, mais elle
-- ne rend pas l'opération légitime COMMODE — un appelant doit aujourd'hui
-- composer lui-même les trois écritures, dans une seule instruction, avec
-- clock_timestamp().
--
-- Cette fonction est cette instruction, nommée une fois pour toutes :
--
--     enable_stock_tracking(p_product_id, p_stock)
--       ->  track_inventory  = true
--           stock            = p_stock
--           stock_counted_at = clock_timestamp()
--       dans UN SEUL UPDATE, donc atomiquement.
--
-- ELLE SATISFAIT LA BARRIÈRE — ELLE NE LA CONTOURNE PAS.
-- Propriété structurelle, pas une intention : `security invoker` fait que le
-- trigger s'applique à l'UPDATE exécuté À L'INTÉRIEUR de cette fonction,
-- exactement comme à un UPDATE tapé à la main. Ce dépôt l'énonce déjà pour
-- apply_shop_order_status : « la RPC ne peut structurellement PAS devenir une
-- primitive de contournement de la machine à états ». Le même raisonnement
-- vaut ici, et le banc le prouve (test 12 : un comptage antérieur au
-- précédent est refusé MÊME via cette fonction).
--
-- ============================================================
-- POURQUOI clock_timestamp() ET NON now()
--
-- Mesuré sur cette base le 2026-08-24, puis reconfirmé par le banc de
-- l'étape 2 (tests 6 et 9) : `now()` est FIGÉ sur la transaction. Deux appels
-- successifs dans une même transaction produiraient un horodatage IDENTIQUE,
-- et la barrière (`new.stock_counted_at > old.stock_counted_at`) refuserait le
-- second. `clock_timestamp()` avance à chaque évaluation : c'est la seule
-- horloge compatible avec un `>` strict.
--
-- ============================================================
-- CONVENTIONS REPRISES, MESURÉES DANS LE DÉPÔT
--
--   * `returns jsonb` avec `{success: bool, ...}` — forme des 8 RPC métier
--     existantes (apply_shop_order_status, cancel_shop_order,
--     decrement_shop_stock_batch, archive_sites_if_no_blocking_orders...).
--   * `language plpgsql`, `security invoker` — jamais `definer` : aucune
--     élévation de privilège n'est nécessaire, et `invoker` est ce qui
--     garantit que la barrière s'applique.
--   * REVOKE en TROIS instructions séparées (anon / authenticated / public) :
--     forme utilisée par les 8 RPC métier. La forme combinée est réservée aux
--     fonctions trigger. On ne crée pas une troisième convention.
--   * Bloc `exception when others` qui CLASSIFIE au lieu de propager — patron
--     exact de decrement_shop_stock_batch. Capturer n'est PAS contourner : la
--     sous-transaction est annulée, l'écriture n'a pas lieu, et l'appelant
--     reçoit un résultat structuré qu'il doit tester. C'est déjà ce que fait
--     `decrementStock()` côté TypeScript (`if (!result.ok)`).
--
-- ============================================================
-- CE QUE CETTE FONCTION NE FAIT PAS
--
--   * elle n'écrit AUCUNE autre colonne (ni name, ni price, ni currency, ni
--     published, ni description, ni position) ;
--   * elle ne désactive jamais le suivi — `true -> false` reste un simple
--     UPDATE, libre, sans affirmation requise ;
--   * elle ne touche ni au trigger de l'étape 2, ni à
--     decrement_shop_stock_batch (étape 4), ni à cancel_shop_order ;
--   * elle ne se prononce ni sur la vendabilité, ni sur le mode du site.
--
-- ============================================================
-- ÉTAT RÉEL MESURÉ AVANT ÉCRITURE (production, 2026-08-24)
--
--   * étape 1 appliquée : track_inventory NOT NULL DEFAULT true,
--     stock_counted_at nullable
--   * étape 2 appliquée et prouvée : banc 12/12, rollback volontaire
--   * shop_products : 0 ligne · 2 contraintes · 2 index
--   * `enable_stock_tracking` : INEXISTANTE avant ce fichier
--
-- IDEMPOTENT : `create or replace function`. Rejouable sans effet de bord.
--
-- ROLLBACK DE CETTE ÉTAPE :
--   drop function if exists enable_stock_tracking(uuid, integer);
-- Aucune donnée n'est concernée : cette étape ne modifie aucune ligne à
-- l'installation.
-- =============================================================


-- -------------------------------------------------------------
-- 1/2 — LA FONCTION MÉTIER.
--
-- VALIDATION DES ENTRÉES, ET POURQUOI ELLE EST DANS LA FONCTION.
-- `shop_products.stock` n'a AUCUNE contrainte CHECK (mesuré : 2 contraintes
-- seulement, PK et FK). Un stock négatif y est donc représentable. Un
-- compteur négatif n'est pas un comptage : la fonction le refuse au dernier
-- point de passage avant l'écriture, indépendamment de toute validation
-- applicative amont. Même raisonnement que la garde INVALID_QUANTITY de
-- decrement_shop_stock_batch, ajoutée après un test réel.
--
-- `p_stock = 0` EST LÉGITIME et accepté : « j'ai compté, il n'y a rien ». Le
-- produit devient alors suivi et en rupture — état honnête, et invendable par
-- la seule règle de stock. Refuser 0 obligerait à mentir.
-- -------------------------------------------------------------
create or replace function enable_stock_tracking(
  p_product_id uuid,
  p_stock integer
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_counted timestamptz;
begin
  if p_product_id is null then
    raise exception 'INVALID_ARGUMENT: p_product_id must not be null'
      using errcode = 'P0001';
  end if;

  if p_stock is null or p_stock < 0 then
    raise exception 'INVALID_ARGUMENT: p_stock must be a non-negative integer (got %)',
      coalesce(p_stock::text, 'NULL')
      using errcode = 'P0001';
  end if;

  -- UN SEUL UPDATE : les trois colonnes sont écrites atomiquement, et la
  -- barrière de l'étape 2 voit un NEW complet et cohérent. Les composer en
  -- plusieurs instructions exposerait un état intermédiaire où le suivi
  -- serait actif sur un compteur non encore affirmé.
  update shop_products
  set track_inventory  = true,
      stock            = p_stock,
      stock_counted_at = clock_timestamp()
  where id = p_product_id
  returning stock_counted_at into v_counted;

  if not found then
    raise exception 'PRODUCT_NOT_FOUND: %', p_product_id
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'stock', p_stock,
    'stock_counted_at', v_counted
  );

exception
  when others then
    -- Toute exception annule la sous-transaction : aucune écriture partielle.
    -- Classification identique à decrement_shop_stock_batch.
    if sqlerrm like 'INVALID_ARGUMENT:%' then
      return jsonb_build_object('success', false, 'reason', 'INVALID_ARGUMENT', 'detail', sqlerrm);
    end if;
    if sqlerrm like 'PRODUCT_NOT_FOUND:%' then
      return jsonb_build_object('success', false, 'reason', 'PRODUCT_NOT_FOUND');
    end if;
    -- Capture notamment STOCK_TRACKING_REQUIRES_COUNT levé par la barrière de
    -- l'étape 2 : elle reste l'autorité réelle, y compris pour un appel passant
    -- par cette fonction. Capturer n'est pas contourner -- l'écriture n'a pas eu lieu.
    return jsonb_build_object('success', false, 'reason', sqlerrm);
end;
$$;

comment on function enable_stock_tracking(uuid, integer) is
  'Reactive le suivi d''inventaire d''un produit en affirmant un comptage (etape 3/8 du chantier catalogue canonique). Ecrit atomiquement track_inventory=true, stock=p_stock et stock_counted_at=clock_timestamp() en UN SEUL UPDATE. SATISFAIT la barriere trg_enforce_stock_tracking_requires_count, ne la contourne pas (security invoker : le trigger s''applique a l''UPDATE interne). p_stock=0 est legitime. Retourne {success:true,...} ou {success:false, reason} -- l''appelant DOIT tester success. N''ecrit aucune autre colonne et ne desactive jamais le suivi.';


-- -------------------------------------------------------------
-- 2/2 — PRIVILÈGES.
--
-- Forme en trois instructions : celle des 8 RPC métier déjà déployées.
-- OBJECTIF CHIFFRÉ : `fn_exposees` doit rester à 0 (référence production
-- 2026-08-22). Sans ces REVOKE, PostgreSQL accorderait EXECUTE à PUBLIC par
-- défaut et ce compteur passerait à 1.
--
-- Aucun trigger n'est créé ici : contrairement aux étapes 2 et M1-7, l'ordre
-- REVOKE/CREATE TRIGGER ne se pose pas.
-- -------------------------------------------------------------
revoke all on function enable_stock_tracking(uuid, integer) from anon;
revoke all on function enable_stock_tracking(uuid, integer) from authenticated;
revoke all on function enable_stock_tracking(uuid, integer) from public;
grant execute on function enable_stock_tracking(uuid, integer) to service_role;


-- =============================================================
-- VÉRIFICATIONS APRÈS APPLICATION (lecture seule, à exécuter séparément)
-- =============================================================
--
-- A. Existence, signature exacte, langage et modèle de sécurité.
--
--   select p.proname,
--          pg_get_function_identity_arguments(p.oid) as signature,
--          pg_get_function_result(p.oid)             as retour,
--          l.lanname                                 as langage,
--          p.prosecdef                               as security_definer
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   join pg_language  l on l.oid = p.prolang
--   where n.nspname = 'public' and p.proname = 'enable_stock_tracking';
--   -- attendu : EXACTEMENT 1 ligne
--   --   enable_stock_tracking | p_product_id uuid, p_stock integer
--   --   | jsonb | plpgsql | false
--   -- security_definer = true => STOP (le patron du depot est invoker).
--   -- 0 ligne ou plus d'une => STOP.
--
-- B. clock_timestamp() est bien utilise, now() ne l'est pas.
--
--   select (prosrc ilike '%clock_timestamp()%') as utilise_clock_timestamp,
--          (prosrc ilike '%now()%')             as utilise_now
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public' and p.proname='enable_stock_tracking';
--   -- attendu : true | false
--   -- utilise_now = true => STOP : now() est fige sur la transaction, un
--   -- second appel serait refuse par la barriere.
--
-- C. Aucune exposition a anon / authenticated.
--
--   select has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
--          has_function_privilege('service_role', p.oid, 'EXECUTE')  as service_role
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public' and p.proname='enable_stock_tracking';
--   -- attendu : false | false | true
--
-- D. `fn_exposees` reste a 0 (reference production 2026-08-22).
--
--   select count(*) as fn_exposees
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and (has_function_privilege('anon', p.oid, 'EXECUTE')
--       or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
--   -- attendu : 0
--
-- E. La barriere de l'etape 2 est intacte, portee colonne conservee.
--
--   select t.tgname,
--          case when t.tgattr = '' or t.tgattr is null then 'TOUTE LA TABLE'
--               else (select string_agg(a.attname, ', ')
--                     from unnest(string_to_array(t.tgattr::text, ' ')::int[]) k
--                     join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = k)
--          end as portee,
--          t.tgenabled
--   from pg_trigger t join pg_class c on c.oid = t.tgrelid
--   where c.relname = 'shop_products' and not t.tgisinternal;
--   -- attendu : EXACTEMENT 1 ligne
--   --   trg_enforce_stock_tracking_requires_count | track_inventory | O
--
-- F. Aucune fonction des etapes 4+ n'a ete creee, et celles de l'etape 4
--    n'ont pas ete modifiees (comparaison de signature uniquement).
--
--   select p.proname, pg_get_function_identity_arguments(p.oid) as signature
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('decrement_shop_stock_batch', 'cancel_shop_order', 'enable_stock_tracking')
--   order by p.proname;
--   -- attendu : EXACTEMENT 3 lignes
--   --   cancel_shop_order          | p_order_id uuid
--   --   decrement_shop_stock_batch | p_lines jsonb, p_order_id uuid
--   --   enable_stock_tracking      | p_product_id uuid, p_stock integer
--
-- G. Temoins hors perimetre — identiques aux etapes 1 et 2.
--
--   select (select count(*) from pg_constraint
--            where conrelid='public.shop_products'::regclass)                 as contraintes,
--          (select count(*) from pg_indexes
--            where schemaname='public' and tablename='shop_products')         as index,
--          (select count(*) from shop_products)                               as produits,
--          (select count(*) from shop_products where stock_counted_at is not null) as comptages,
--          (select count(*) from shop_orders)                                 as commandes,
--          (select count(*) from shop_order_items where stock_decremented)    as lignes_decrementees;
--   -- attendu : 2 | 2 | 0 | 0 | 26 | 0
-- =============================================================


-- =============================================================
-- H. BANC DE PREUVES COMPORTEMENTAL — 12 cas.
--
-- Même convention que l'étape 2 et M1-7 : chaque étape produit un NOTICE
-- 'REUSSI', ou interrompt le bloc avec 'TEST FAILED' en nommant l'étape.
--
-- AUCUNE ÉCRITURE DURABLE, PAR CONSTRUCTION : le bloc se termine TOUJOURS par
-- une exception volontaire ; PostgreSQL annule alors toute la transaction,
-- fixtures comprises. Les NOTICE, déjà envoyés, survivent au rollback.
--
-- ⚠️ RUN DÉDIÉ OBLIGATOIRE : ne jamais exécuter ce banc dans le même Run que
-- l'installation ci-dessus — l'exception finale annulerait la création de la
-- fonction en même temps que les fixtures.
--
-- MESSAGE FINAL ATTENDU :
--   ERROR: ETAPE 3 : 12/12 preuves passees -- rollback volontaire, aucune ecriture conservee.
-- C'est le SUCCÈS. Toute autre erreur est un échec.
-- =============================================================
DO $$
DECLARE
  v_owner  uuid;
  v_theme  text;
  v_margin numeric;
  v_round  text;
  v_site   uuid;
  p1 uuid;  -- non suivi, jamais compté
  p2 uuid;  -- non suivi, compté dans le passé
  p3 uuid;  -- suivi dès la création
  p4 uuid;  -- non suivi, comptage dans le FUTUR
  v_res    jsonb;
  v_c1     timestamptz;
  v_c2     timestamptz;
  v_n      integer := 0;
  v_row    record;
BEGIN
  select s.owner_id, s.theme, s.cj_margin_percent, s.cj_round_mode
    into v_owner, v_theme, v_margin, v_round
  from sites s limit 1;
  if v_owner is null then
    raise exception 'TEST FAILED (fixtures) : aucun site existant dont emprunter des valeurs valides';
  end if;

  v_site := gen_random_uuid();
  p1 := gen_random_uuid(); p2 := gen_random_uuid();
  p3 := gen_random_uuid(); p4 := gen_random_uuid();

  insert into sites (id, slug, name, theme, published, cj_margin_percent, cj_round_mode, owner_id, mode)
  values (v_site, 'e3-'||v_site, 'ETAPE3 site jetable', v_theme, false, v_margin, v_round, v_owner, 2);

  insert into shop_products (id, site_id, name, description, price, currency, stock, published, track_inventory, stock_counted_at) values
    (p1, v_site, 'E3 jamais compte', 'desc1', 10.00, 'CAD', 7, true,  false, null),
    (p2, v_site, 'E3 compte passe',  'desc2', 20.00, 'CAD', 3, true,  false, timestamptz '2026-01-01 00:00:00+00'),
    (p3, v_site, 'E3 deja suivi',    'desc3', 30.00, 'CAD', 5, true,  true,  null),
    (p4, v_site, 'E3 compte futur',  'desc4', 40.00, 'CAD', 2, false, false, timestamptz '2099-01-01 00:00:00+00');
  v_n := v_n + 1;
  raise notice 'TEST 1 REUSSI : fixtures creees (4 produits, etats de suivi et de comptage varies).';

  -- ---------- LE CHEMIN NOMINAL ----------
  v_res := enable_stock_tracking(p1, 12);
  if (v_res->>'success')::boolean is not true then
    raise exception 'TEST FAILED (2) : reactivation avec ancien comptage NULL aurait du reussir, obtenu : %', v_res;
  end if;
  select track_inventory, stock, stock_counted_at into v_row from shop_products where id = p1;
  if v_row.track_inventory is not true or v_row.stock <> 12 or v_row.stock_counted_at is null then
    raise exception 'TEST FAILED (2, ecriture) : track_inventory=%, stock=%, stock_counted_at=%',
      v_row.track_inventory, v_row.stock, v_row.stock_counted_at;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 2 REUSSI : les TROIS colonnes sont ecrites atomiquement (track_inventory=true, stock=12, stock_counted_at renseigne) -- branche old IS NULL.';

  v_res := enable_stock_tracking(p2, 4);
  if (v_res->>'success')::boolean is not true then
    raise exception 'TEST FAILED (3) : reactivation avec comptage passe aurait du reussir, obtenu : %', v_res;
  end if;
  select stock_counted_at into v_c1 from shop_products where id = p2;
  if v_c1 <= timestamptz '2026-01-01 00:00:00+00' then
    raise exception 'TEST FAILED (3, horodatage) : le comptage n''a pas avance (%).', v_c1;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 3 REUSSI : comptage strictement posterieur au precedent -- la barriere accepte.';

  -- ---------- clock_timestamp() AVANCE, now() N'AURAIT PAS PU ----------
  update shop_products set track_inventory = false where id = p2;   -- desactivation libre
  v_res := enable_stock_tracking(p2, 9);
  if (v_res->>'success')::boolean is not true then
    raise exception 'TEST FAILED (4) : seconde reactivation dans la MEME transaction aurait du reussir, obtenu : %', v_res;
  end if;
  select stock_counted_at into v_c2 from shop_products where id = p2;
  if v_c2 <= v_c1 then
    raise exception 'TEST FAILED (4, horodatage) : le second comptage (%) n''est pas strictement posterieur au premier (%) -- clock_timestamp() n''avance pas ?', v_c2, v_c1;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 4 REUSSI : DEUX reactivations du MEME produit dans la MEME transaction, comptages strictement croissants -- preuve que clock_timestamp() avance la ou now() aurait produit deux valeurs identiques et fait refuser la seconde.';

  -- ---------- IDEMPOTENCE SUR UN PRODUIT DEJA SUIVI ----------
  v_res := enable_stock_tracking(p3, 50);
  if (v_res->>'success')::boolean is not true then
    raise exception 'TEST FAILED (5) : appel sur un produit deja suivi aurait du reussir, obtenu : %', v_res;
  end if;
  select stock into v_row from shop_products where id = p3;
  if v_row.stock <> 50 then
    raise exception 'TEST FAILED (5, ecriture) : stock = % au lieu de 50', v_row.stock;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 5 REUSSI : appel sur un produit deja suivi accepte (la barriere sort a sa premiere branche) et le comptage est mis a jour.';

  -- ---------- LES REFUS D'ENTREE ----------
  v_res := enable_stock_tracking(p1, null);
  if (v_res->>'success')::boolean is not false or v_res->>'reason' <> 'INVALID_ARGUMENT' then
    raise exception 'TEST FAILED (6) : p_stock NULL aurait du etre refuse, obtenu : %', v_res;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 6 REUSSI : p_stock NULL refuse (INVALID_ARGUMENT) -- aucun stock n''est invente.';

  v_res := enable_stock_tracking(p1, -3);
  if (v_res->>'success')::boolean is not false or v_res->>'reason' <> 'INVALID_ARGUMENT' then
    raise exception 'TEST FAILED (7) : p_stock negatif aurait du etre refuse, obtenu : %', v_res;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 7 REUSSI : p_stock negatif refuse -- shop_products n''a aucun CHECK, cette garde est le dernier point de passage.';

  v_res := enable_stock_tracking(null, 5);
  if (v_res->>'success')::boolean is not false or v_res->>'reason' <> 'INVALID_ARGUMENT' then
    raise exception 'TEST FAILED (8) : p_product_id NULL aurait du etre refuse, obtenu : %', v_res;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 8 REUSSI : p_product_id NULL refuse.';

  v_res := enable_stock_tracking(gen_random_uuid(), 5);
  if (v_res->>'success')::boolean is not false or v_res->>'reason' <> 'PRODUCT_NOT_FOUND' then
    raise exception 'TEST FAILED (9) : produit inexistant aurait du etre refuse, obtenu : %', v_res;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 9 REUSSI : produit inexistant refuse (PRODUCT_NOT_FOUND) -- fail-closed.';

  -- ---------- p_stock = 0 EST LEGITIME ----------
  v_res := enable_stock_tracking(p1, 0);
  if (v_res->>'success')::boolean is not true then
    raise exception 'TEST FAILED (10) : p_stock = 0 aurait du etre ACCEPTE, obtenu : %', v_res;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 10 REUSSI : p_stock = 0 accepte -- « j''ai compte, il n''y a rien » est un comptage honnete, pas une erreur.';

  -- ---------- LA BARRIERE N'EST PAS CONTOURNEE ----------
  v_res := enable_stock_tracking(p4, 6);
  if (v_res->>'success')::boolean is not false
     or v_res->>'reason' not like 'STOCK_TRACKING_REQUIRES_COUNT%' then
    raise exception 'TEST FAILED (11) : un comptage anterieur au precedent (date future en base) aurait du etre REFUSE PAR LA BARRIERE, obtenu : %', v_res;
  end if;
  select track_inventory, stock into v_row from shop_products where id = p4;
  if v_row.track_inventory is not false or v_row.stock <> 2 then
    raise exception 'TEST FAILED (11, ecriture) : l''appel refuse a tout de meme ecrit (track_inventory=%, stock=%)', v_row.track_inventory, v_row.stock;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 11 REUSSI : la barriere de l''etape 2 refuse MEME via cette fonction, et aucune ecriture partielle n''a eu lieu -- la RPC satisfait la barriere, elle ne la contourne pas.';

  -- ---------- AUCUNE AUTRE COLONNE MODIFIEE ----------
  select name, description, price, currency, published into v_row from shop_products where id = p1;
  if v_row.name <> 'E3 jamais compte' or v_row.description <> 'desc1'
     or v_row.price <> 10.00 or v_row.currency <> 'CAD' or v_row.published is not true then
    raise exception 'TEST FAILED (12) : une colonne hors perimetre a ete modifiee (name=%, description=%, price=%, currency=%, published=%)',
      v_row.name, v_row.description, v_row.price, v_row.currency, v_row.published;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 12 REUSSI : name, description, price, currency et published sont INCHANGES -- la fonction n''ecrit que les trois colonnes de son contrat.';

  if v_n <> 12 then
    raise exception 'TEST FAILED (bilan) : % preuves comptees au lieu de 12', v_n;
  end if;

  raise exception 'ETAPE 3 : 12/12 preuves passees -- rollback volontaire, aucune ecriture conservee.';
END $$;
