-- =============================================================
-- CHANTIER CATALOGUE CANONIQUE — ÉTAPE 2 / 8
-- BARRIÈRE DE RÉACTIVATION DU SUIVI D'INVENTAIRE
--
-- À exécuter manuellement dans l'éditeur SQL Supabase (aucun outillage de
-- migration dans ce dépôt — même convention que M1-7 et shop_stock_functions).
--
-- ⚠️ À EXÉCUTER APRÈS l'étape 1 (colonnes `track_inventory` et
-- `stock_counted_at`), jamais avant.
--
-- ============================================================
-- L'INVARIANT POSÉ ICI, ET RIEN D'AUTRE
--
--     RÉACTIVER LE SUIVI D'INVENTAIRE (false -> true) EXIGE UNE AFFIRMATION
--     DE COMPTAGE. UN COMPTEUR PÉRIMÉ NE PEUT JAMAIS REDEVENIR ACTIF SEUL.
--
-- LE PROBLÈME EXACT QUE CELA RÉSOUT. Pendant une période `track_inventory =
-- false`, `stock` est inerte : personne ne le lit, personne ne le décrémente,
-- et des ventes ont pu avoir lieu sans qu'il bouge. Sa valeur devient donc
-- PÉRIMÉE — non pas fausse à cause d'un bug, mais fausse par construction, la
-- plateforme ayant délibérément cessé de compter. La réactiver sans nouveau
-- comptage transformerait cette valeur périmée en compteur faisant autorité,
-- et donc en survente.
--
-- POURQUOI LA BARRIÈRE NE PEUT PAS DEVINER, ET N'ESSAIE PAS.
-- Un trigger ne peut PAS distinguer ces deux instructions :
--     UPDATE shop_products SET track_inventory = true             WHERE id = X;
--     UPDATE shop_products SET track_inventory = true, stock = 5  WHERE id = X;
-- lorsque `stock` valait déjà 5. Le couple OLD/NEW y est IDENTIQUE. Tout test
-- fondé sur `new.stock IS DISTINCT FROM old.stock` mesurerait un CHANGEMENT DE
-- VALEUR, jamais une PRÉSENCE DANS LE SET — c'est une distinction inobservable,
-- et une barrière bâtie dessus serait fausse.
--
-- LA SOLUTION EST DE NE RIEN DEVINER : ON EXIGE UNE DÉCLARATION.
-- `stock_counted_at` porte l'acte d'affirmation du marchand. Une valeur de
-- stock périmée ne peut pas faire avancer un horodatage. La base observe alors
-- une DONNÉE, jamais la forme d'une instruction.
--
-- CE QUE CETTE BARRIÈRE NE FAIT PAS :
--   * elle n'écrit rien — ni `stock`, ni `stock_counted_at` ;
--   * elle ne contraint pas l'INSERT : un produit peut naître suivi (stock 0
--     par défaut, valeur honnête) ou non suivi. Aucune valeur périmée
--     n'existe à la création, donc rien à affirmer ;
--   * elle ne contraint pas `true -> false` : CESSER de compter n'affirme
--     rien. La contrainte porte sur l'affirmation, jamais sur l'abandon ;
--   * elle ne se prononce ni sur la vendabilité, ni sur le décrément
--     (étapes 4 et 5), ni sur le mode du site.
--
-- ============================================================
-- ÉTAT RÉEL MESURÉ AVANT ÉCRITURE (production, 2026-08-24)
--
--   * étape 1 appliquée et vérifiée :
--       track_inventory  boolean NOT NULL DEFAULT true   (0 ligne concernée)
--       stock_counted_at timestamptz NULL, 0 comptage affirmé
--   * shop_products : 0 ligne · 0 trigger non interne · 2 contraintes
--     (PK + FK site_id ON DELETE CASCADE) · 2 index · aucun CHECK
--   => AUCUN mécanisme préexistant ne peut interférer : ce trigger sera le
--      PREMIER de cette table.
--
-- ============================================================
-- POURQUOI UN TRIGGER, ET PAS AUTRE CHOSE — raisonnement déjà éprouvé ici
--
--   * CHECK    : ne peut PAS comparer un ancien et un nouvel état. Inapplicable.
--   * RLS      : `service_role` la contourne intégralement — or c'est le seul
--                rôle qui écrit dans shop_products (LOT G : REVOKE complet
--                pour anon/authenticated, aucun regrant).
--   * REVOKE UPDATE (colonne) : sans effet sur le propriétaire de la table.
--   * TRIGGER  : s'applique à TOUS les rôles, `service_role`, éditeur SQL et
--                script d'administration compris.
--
-- Ce raisonnement n'est pas nouveau : il est déjà écrit dans ce dépôt
-- (shop_orders_fulfillment_domain_step3) et déjà prouvé en production par M1-7.
--
-- LIMITE HONNÊTE, IDENTIQUE À CELLE DÉJÀ ACCEPTÉE POUR `status`,
-- `fulfillment_domain` ET M1-7 : un rôle SUPERUSER peut désactiver un trigger.
-- PostgreSQL n'offre pas mieux.
--
-- SECONDE LIMITE, PLUS IMPORTANTE, ET ASSUMÉE : aucun système ne peut vérifier
-- qu'un comptage PHYSIQUE a réellement eu lieu. Un appelant peut écrire
-- `stock_counted_at = clock_timestamp()` sans avoir compté. Ce qui est garanti
-- n'est pas la vérité du nombre — c'est qu'une valeur périmée ne peut jamais
-- redevenir active SANS QU'UN ACTE D'AFFIRMATION AIT ÉTÉ POSÉ. C'est la limite
-- réelle, et elle est écrite plutôt que masquée.
--
-- ============================================================
-- `>` ET NON `IS DISTINCT FROM` — conséquence d'une mesure, pas d'un goût
--
-- Mesuré sur cette base le 2026-08-24 : `now()` est FIGÉ (306 ms de retard sur
-- `clock_timestamp()` après un `pg_sleep(0.3)` exécuté dans une instruction
-- antérieure — donc évalué avant ce sleep). Seul `clock_timestamp()` avance.
--
--   * `IS DISTINCT FROM` accepterait un horodatage ANTIDATÉ — rejeté.
--   * `>` strict, combiné à `clock_timestamp()` côté écrivain, refuse
--     l'antidatage ET autorise deux réactivations légitimes dans une même
--     transaction. C'est la seule combinaison correcte.
--
-- LA BRANCHE `old.stock_counted_at IS NULL` N'EST PAS UNE COMMODITÉ.
-- Sans elle, la toute première réactivation évaluerait `x > NULL` -> NULL ->
-- faux -> refus systématique et définitif. C'est EXACTEMENT le piège qui a
-- failli rendre M1-7 fail-open (`mode NOT IN (2,3)` sur une colonne nullable).
-- On le nomme ici pour refuser de le rejouer.
--
-- IDEMPOTENT : `create or replace function` + `drop trigger if exists`.
--
-- ROLLBACK DE CETTE ÉTAPE :
--   drop trigger if exists trg_enforce_stock_tracking_requires_count on shop_products;
--   drop function if exists enforce_stock_tracking_requires_count();
-- Aucune donnée n'est concernée : cette étape n'écrit rien.
-- =============================================================


-- -------------------------------------------------------------
-- 1/3 — LA BARRIÈRE.
--
-- `before update of track_inventory` : le trigger ne se réveille QUE si la
-- colonne figure dans le SET. Un UPDATE de `name`, `price`, `stock` ou
-- `published` ne le déclenche pas — coût nul sur tous les chemins existants.
-- -------------------------------------------------------------
create or replace function enforce_stock_tracking_requires_count()
returns trigger
language plpgsql
security invoker
as $$
begin
  -- Réécriture de la même valeur : ce n'est pas une transition.
  -- Même convention que enforce_shop_order_status_transition() et
  -- enforce_fulfillment_domain_immutable().
  if new.track_inventory is not distinct from old.track_inventory then
    return new;
  end if;

  -- true -> false : cesser de compter n'affirme rien. Libre.
  if new.track_inventory is not true then
    return new;
  end if;

  -- false -> true : une affirmation de comptage est exigée.
  if new.stock_counted_at is not null
     and (old.stock_counted_at is null
          or new.stock_counted_at > old.stock_counted_at) then
    return new;
  end if;

  raise exception
    'STOCK_TRACKING_REQUIRES_COUNT: product_id=% (stock_counted_at: % -> %). Reactiver le suivi d''inventaire exige d''affirmer un comptage : pendant la periode non suivie, `stock` n''a plus ete decremente et sa valeur est perimee. Fournir stock_counted_at (strictement posterieur au precedent, via clock_timestamp()) dans la MEME instruction, ou passer par la fonction metier dediee.',
    old.id,
    coalesce(old.stock_counted_at::text, 'NULL'),
    coalesce(new.stock_counted_at::text, 'NULL')
    using errcode = 'P0001';
end;
$$;

comment on function enforce_stock_tracking_requires_count() is
  'Barriere de reactivation du suivi d''inventaire (etape 2/8 du chantier catalogue canonique). Sur shop_products, refuse la transition track_inventory false -> true si `stock_counted_at` n''est pas strictement avance (ou pose pour la premiere fois). Ne contraint ni l''INSERT, ni la desactivation, ni aucune autre colonne. N''ecrit rien.';


-- -------------------------------------------------------------
-- 2/3 — LE TRIGGER, à portée strictement colonne.
-- -------------------------------------------------------------
drop trigger if exists trg_enforce_stock_tracking_requires_count on shop_products;
create trigger trg_enforce_stock_tracking_requires_count
  before update of track_inventory on shop_products
  for each row
  execute function enforce_stock_tracking_requires_count();


-- -------------------------------------------------------------
-- 3/3 — PRIVILÈGES.
--
-- ORDRE IMPÉRATIF : ce REVOKE doit rester APRÈS le `create trigger`.
-- PostgreSQL exige EXECUTE sur la fonction au moment du CREATE TRIGGER, mais
-- PAS à son déclenchement — propriété prouvée comportementalement sur cette
-- base le 2026-08-22 (phase2_privileges_hardening.sql), et réappliquée sans
-- incident par M1-7.
--
-- OBJECTIF CHIFFRÉ : `fn_exposees` doit rester à 0 (référence production
-- 2026-08-22). Sans ce REVOKE, PostgreSQL accorderait EXECUTE à PUBLIC par
-- défaut et ce compteur passerait à 1.
-- -------------------------------------------------------------
revoke all on function enforce_stock_tracking_requires_count() from public, anon, authenticated;
grant execute on function enforce_stock_tracking_requires_count() to service_role;


-- =============================================================
-- VÉRIFICATIONS APRÈS APPLICATION (lecture seule, à exécuter séparément)
-- =============================================================
--
-- A. Le trigger existe, avec la bonne portée colonne et actif.
--
--   select t.tgname,
--          case when (t.tgtype::int & 2) > 0 then 'BEFORE' else 'AFTER' end as timing,
--          case when t.tgattr = '' or t.tgattr is null then 'TOUTE LA TABLE'
--               else (select string_agg(a.attname, ', ')
--                     from unnest(string_to_array(t.tgattr::text, ' ')::int[]) k
--                     join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = k)
--          end as portee,
--          p.proname as fonction, t.tgenabled
--   from pg_trigger t
--   join pg_class c on c.oid = t.tgrelid
--   join pg_proc  p on p.oid = t.tgfoid
--   where c.relname = 'shop_products' and not t.tgisinternal;
--   -- attendu : EXACTEMENT 1 ligne
--   --   trg_enforce_stock_tracking_requires_count | BEFORE | track_inventory
--   --   | enforce_stock_tracking_requires_count | O
--   -- portee = 'TOUTE LA TABLE' => STOP (le trigger se declencherait a chaque
--   -- ecriture de produit). tgenabled = 'D' => STOP (barriere inactive).
--
-- B. `fn_exposees` reste à 0.
--
--   select count(*) as fn_exposees
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and (has_function_privilege('anon', p.oid, 'EXECUTE')
--       or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
--   -- attendu : 0
--
-- C. Aucune fonction de l'étape 3 n'existe.
--
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'enable_stock_tracking';
--   -- attendu : 0 ligne
--
-- D. Témoins hors périmètre — identiques à l'étape 1.
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
-- E. BANC DE PREUVES COMPORTEMENTAL — 12 cas.
--
-- Sans lui, tout ce qui précède ne serait qu'une intention. Même convention
-- que M1-7 et shop_order_status_machine.sql : chaque étape produit un NOTICE
-- 'REUSSI', ou interrompt le bloc avec 'TEST FAILED' en nommant l'étape.
--
-- AUCUNE ÉCRITURE DURABLE, PAR CONSTRUCTION. Le bloc se termine TOUJOURS par
-- une exception volontaire : PostgreSQL annule alors l'intégralité de la
-- transaction, site et produits jetables compris. Aucun `delete` de nettoyage
-- à oublier ; un arrêt prématuré ne laisse rien non plus. Les NOTICE, déjà
-- envoyés au client, survivent au rollback.
--
-- AUCUNE DONNÉE RÉELLE N'EST TOUCHÉE, à une exception assumée : un
-- `select ... limit 1` sur `sites` emprunte des valeurs valides (owner_id,
-- theme, cj_*) pour le site jetable. Emprunter plutôt que deviner évite qu'un
-- échec de fixture ressemble à un échec de barrière.
--
-- MESSAGE FINAL ATTENDU :
--   ERROR: ETAPE 2 : 12/12 preuves passees -- rollback volontaire, aucune ecriture conservee.
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
  p3 uuid;  -- suivi (défaut)
  p4 uuid;  -- non suivi, compté à now() de CETTE transaction
  v_n integer := 0;
  v_stock integer;
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
  values (v_site, 'e2-'||v_site, 'ETAPE2 site jetable', v_theme, false, v_margin, v_round, v_owner, 2);

  -- L'INSERT n'est pas contraint par la barriere (trigger BEFORE UPDATE OF) :
  -- ces quatre lignes le demontrent en existant.
  insert into shop_products (id, site_id, name, stock, track_inventory, stock_counted_at) values
    (p1, v_site, 'E2 non suivi jamais compte', 7, false, null),
    (p2, v_site, 'E2 non suivi compte passe',  3, false, timestamptz '2026-01-01 00:00:00+00'),
    (p3, v_site, 'E2 suivi par defaut',        5, true,  null),
    (p4, v_site, 'E2 non suivi compte now()',  2, false, now());
  v_n := v_n + 1;
  raise notice 'TEST 1 REUSSI : INSERT de 4 produits (suivis et non suivis) accepte -- la barriere ne contraint pas la creation.';

  -- ---------- LES REFUS ----------
  begin
    update shop_products set track_inventory = true where id = p1;
    raise exception 'TEST FAILED (2) : false->true sans stock_counted_at aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'STOCK_TRACKING_REQUIRES_COUNT%' then v_n := v_n + 1;
      raise notice 'TEST 2 REUSSI : false->true sans affirmation de comptage refuse.';
    else raise exception 'TEST FAILED (2, erreur inattendue) : %', sqlerrm; end if;
  end;

  begin
    update shop_products set track_inventory = true, stock = 3 where id = p2;
    raise exception 'TEST FAILED (3) : false->true avec stock_counted_at INCHANGE aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'STOCK_TRACKING_REQUIRES_COUNT%' then v_n := v_n + 1;
      raise notice 'TEST 3 REUSSI : false->true avec stock mentionne mais comptage NON affirme refuse -- c''est le cas exact que OLD/NEW ne peut pas distinguer.';
    else raise exception 'TEST FAILED (3, erreur inattendue) : %', sqlerrm; end if;
  end;

  begin
    update shop_products set track_inventory = true,
           stock_counted_at = timestamptz '2025-12-01 00:00:00+00' where id = p2;
    raise exception 'TEST FAILED (4) : un horodatage ANTIDATE aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'STOCK_TRACKING_REQUIRES_COUNT%' then v_n := v_n + 1;
      raise notice 'TEST 4 REUSSI : comptage antidate refuse (c''est pourquoi la barriere utilise > et non IS DISTINCT FROM).';
    else raise exception 'TEST FAILED (4, erreur inattendue) : %', sqlerrm; end if;
  end;

  begin
    update shop_products set track_inventory = true, stock_counted_at = null where id = p2;
    raise exception 'TEST FAILED (5) : stock_counted_at mis a NULL aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'STOCK_TRACKING_REQUIRES_COUNT%' then v_n := v_n + 1;
      raise notice 'TEST 5 REUSSI : effacer le comptage tout en reactivant le suivi refuse.';
    else raise exception 'TEST FAILED (5, erreur inattendue) : %', sqlerrm; end if;
  end;

  begin
    update shop_products set track_inventory = true, stock_counted_at = now() where id = p4;
    raise exception 'TEST FAILED (6) : now() dans la meme transaction aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'STOCK_TRACKING_REQUIRES_COUNT%' then v_n := v_n + 1;
      raise notice 'TEST 6 REUSSI : now() est FIGE sur la transaction -- valeur identique au comptage precedent, donc refusee. C''est la preuve executable que la fonction metier de l''etape 3 devra utiliser clock_timestamp().';
    else raise exception 'TEST FAILED (6, erreur inattendue) : %', sqlerrm; end if;
  end;

  -- ---------- LES ACCEPTATIONS ----------
  -- Une barriere qui refuse tout n'est pas une barriere, c'est une panne.
  begin
    update shop_products set track_inventory = true, stock = 12,
           stock_counted_at = clock_timestamp() where id = p1;
    v_n := v_n + 1;
    raise notice 'TEST 7 REUSSI : false->true accepte quand le comptage est affirme, ancien comptage NULL (branche old IS NULL -- sans elle, la premiere reactivation serait refusee a jamais).';
  exception when others then
    raise exception 'TEST FAILED (7) : aurait du etre ACCEPTE, obtenu : %', sqlerrm;
  end;

  begin
    update shop_products set track_inventory = true,
           stock_counted_at = clock_timestamp() where id = p2;
    v_n := v_n + 1;
    raise notice 'TEST 8 REUSSI : false->true accepte, comptage strictement posterieur au precedent.';
  exception when others then
    raise exception 'TEST FAILED (8) : aurait du etre ACCEPTE, obtenu : %', sqlerrm;
  end;

  begin
    update shop_products set track_inventory = true,
           stock_counted_at = clock_timestamp() where id = p4;
    v_n := v_n + 1;
    raise notice 'TEST 9 REUSSI : clock_timestamp() AVANCE dans la meme transaction -- la reactivation refusee au test 6 est acceptee ici.';
  exception when others then
    raise exception 'TEST FAILED (9) : aurait du etre ACCEPTE, obtenu : %', sqlerrm;
  end;

  begin
    update shop_products set track_inventory = false where id = p3;
    v_n := v_n + 1;
    raise notice 'TEST 10 REUSSI : true->false accepte sans aucune affirmation -- cesser de compter n''affirme rien.';
  exception when others then
    raise exception 'TEST FAILED (10) : aurait du etre ACCEPTE, obtenu : %', sqlerrm;
  end;

  begin
    update shop_products set track_inventory = false where id = p3;  -- meme valeur
    v_n := v_n + 1;
    raise notice 'TEST 11 REUSSI : round-trip (meme valeur) accepte, ce n''est pas une transition.';
  exception when others then
    raise exception 'TEST FAILED (11) : le round-trip aurait du etre ACCEPTE, obtenu : %', sqlerrm;
  end;

  begin
    update shop_products set name = 'E2 renomme', price = 9.99, published = false where id = p2;
    v_n := v_n + 1;
    raise notice 'TEST 12 REUSSI : UPDATE de colonnes sans rapport non bloque -- portee minimale du trigger (before update OF track_inventory).';
  exception when others then
    raise exception 'TEST FAILED (12) : un UPDATE hors de la colonne track_inventory ne doit jamais reveiller ce trigger, obtenu : %', sqlerrm;
  end;

  -- ---------- LA BARRIERE N'ECRIT RIEN ----------
  select stock into v_stock from shop_products where id = p3;
  if v_stock <> 5 then
    raise exception 'TEST FAILED (bilan) : la barriere a modifie `stock` (p3 = % au lieu de 5)', v_stock;
  end if;
  select stock into v_stock from shop_products where id = p4;
  if v_stock <> 2 then
    raise exception 'TEST FAILED (bilan) : la barriere a modifie `stock` (p4 = % au lieu de 2)', v_stock;
  end if;
  raise notice 'CONTROLE : `stock` inchange sur les produits que le banc n''a pas explicitement modifies (p3=5, p4=2) -- la barriere n''ecrit rien.';

  if v_n <> 12 then
    raise exception 'TEST FAILED (bilan) : % preuves comptees au lieu de 12', v_n;
  end if;

  raise exception 'ETAPE 2 : 12/12 preuves passees -- rollback volontaire, aucune ecriture conservee.';
END $$;
