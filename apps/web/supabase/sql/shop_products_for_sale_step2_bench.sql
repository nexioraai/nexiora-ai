-- ============================================================================
-- CHANTIER CATALOGUE CANONIQUE — ÉTAPE 8, VOLET A : BANC DE `for_sale`.
--
-- CE QUE CE BANC PROUVE.
-- Le contrat verrouillé de `for_sale`, et lui seul :
--   boolean, NOT NULL, DEFAULT true, libre dans les deux sens, sans effet de
--   bord sur les colonnes voisines, sans élargissement de privilèges.
--
-- CE QU'IL NE PROUVE PAS, DÉLIBÉRÉMENT.
-- Il ne teste AUCUNE règle métier d'achetabilité. La conjonction
-- `published AND for_sale` vit dans api/shop/checkout/route.ts, pas en base :
-- la vérifier ici reviendrait à affirmer qu'une garde DB existe, alors que la
-- décision du volet A est précisément qu'il n'en faut aucune. Cette règle est
-- couverte par les tests TypeScript du checkout.
--
-- AUCUNE ÉCRITURE CONSERVÉE : le bloc se termine par une exception volontaire
-- qui annule tout, comme les bancs des étapes 2, 3, 4 et 7.
--
-- PRÉREQUIS : shop_products_for_sale_step1_add_column.sql doit avoir été
-- exécuté. Sans lui, le banc échoue dès la preuve 1 (colonne absente).
-- ============================================================================

DO $$
DECLARE
  v_owner uuid; v_theme text; v_margin numeric; v_round text;
  v_site uuid;
  pA uuid;  -- créé SANS for_sale        -> doit valoir true (défaut)
  pB uuid;  -- créé AVEC for_sale = false -> doit valoir false
  pC uuid;  -- témoin voisin, jamais touché après création
  v_type text; v_nullable text; v_default text;
  v_for_sale boolean;
  v_published boolean;
  v_track boolean;
  v_stock integer;
  v_counted timestamptz;
  v_n integer := 0;
  v_cnt integer;
BEGIN
  select s.owner_id, s.theme, s.cj_margin_percent, s.cj_round_mode
    into v_owner, v_theme, v_margin, v_round from sites s limit 1;
  if v_owner is null then
    raise exception 'TEST FAILED (fixtures) : aucun site existant dont emprunter des valeurs valides';
  end if;

  v_site := gen_random_uuid();
  pA := gen_random_uuid(); pB := gen_random_uuid(); pC := gen_random_uuid();

  -- Site Mode 2 : un produit n'existe que pour un site commercant (M1-7).
  insert into sites (id, slug, name, theme, published, cj_margin_percent, cj_round_mode, owner_id, mode)
  values (v_site, 'e8a-'||v_site, 'ETAPE8A site jetable', v_theme, false, v_margin, v_round, v_owner, 2);

  -- ==========================================================================
  -- 1. LA COLONNE EXISTE, AVEC LE TYPE, LA NULLABILITE ET LE DEFAUT ATTENDUS.
  --    Un `is_nullable = YES` reintroduirait le troisieme etat que le contrat
  --    exclut ; un defaut autre que `true` devendrait tout produit existant.
  -- ==========================================================================
  select data_type, is_nullable, column_default
    into v_type, v_nullable, v_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'shop_products' and column_name = 'for_sale';

  if v_type is null then
    raise exception 'TEST FAILED (1a) : la colonne for_sale n''existe pas -- l''etape 1 du volet A n''a pas ete executee';
  end if;
  if v_type <> 'boolean' then
    raise exception 'TEST FAILED (1b) : for_sale est de type % (attendu boolean)', v_type;
  end if;
  if v_nullable <> 'NO' then
    raise exception 'TEST FAILED (1c) : for_sale est NULLABLE (%) -- le piege NULL est reintroduit', v_nullable;
  end if;
  if v_default is null or v_default not like 'true%' then
    raise exception 'TEST FAILED (1d) : column_default = % (attendu true)', coalesce(v_default, 'NULL');
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 1 REUSSI : for_sale boolean NOT NULL DEFAULT true (default lu : %).', v_default;

  -- ==========================================================================
  -- 2. CREATION SANS `for_sale` -> true.
  --    C'est LE cas normal : createProduct() fait un `.insert()` des seuls
  --    champs fournis, donc tout appelant qui n'envoie pas le champ tombe ici.
  -- ==========================================================================
  insert into shop_products (id, site_id, name, price, currency, stock, published)
  values (pA, v_site, 'E8A sans for_sale', 10.00, 'CAD', 5, true);

  select for_sale into v_for_sale from shop_products where id = pA;
  if v_for_sale is not true then
    raise exception 'TEST FAILED (2) : produit cree sans for_sale obtient % (attendu true) -- il serait publie mais invendable, en silence', v_for_sale;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 2 REUSSI : creation SANS for_sale -> true (le defaut vit en base, pas dans le TypeScript).';

  -- ==========================================================================
  -- 3. CREATION EXPLICITE AVEC `for_sale = false` -> false.
  --    L'appelant garde la main : le defaut n'est pas une contrainte.
  -- ==========================================================================
  insert into shop_products (id, site_id, name, price, currency, stock, published, for_sale)
  values (pB, v_site, 'E8A for_sale false', 20.00, 'CAD', 5, true, false);

  select for_sale, published into v_for_sale, v_published from shop_products where id = pB;
  if v_for_sale is not false then
    raise exception 'TEST FAILED (3a) : for_sale explicite a false obtient % (attendu false)', v_for_sale;
  end if;
  if v_published is not true then
    raise exception 'TEST FAILED (3b) : poser for_sale=false a altere published (%) -- les deux colonnes doivent rester independantes', v_published;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 3 REUSSI : creation avec for_sale = false -> false, published intact a true.';

  -- ==========================================================================
  -- 4. `published = true` ET `for_sale = false` COEXISTENT.
  --    C'est LA capacite que ce volet ajoute : presente, mais pas vendable.
  --    Aucune contrainte ne doit s'y opposer -- un CHECK ajoute par megarde
  --    rendrait l'etat impossible et viderait le volet A de son objet.
  -- ==========================================================================
  select count(*) into v_cnt
  from shop_products
  where id = pB and published is true and for_sale is false;
  if v_cnt <> 1 then
    raise exception 'TEST FAILED (4) : l''etat (published=true, for_sale=false) n''existe pas -- une contrainte l''interdit';
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 4 REUSSI : (published=true, for_sale=false) est un etat legal -- visible et non achetable.';

  -- ==========================================================================
  -- 5. MODIFICATION LIBRE DANS LES DEUX SENS.
  --    Contrairement a track_inventory, aucune barriere ne garde `for_sale` :
  --    la valeur ne se perime jamais, donc rien n'a a etre reaffirme.
  -- ==========================================================================
  update shop_products set for_sale = false where id = pA;
  select for_sale into v_for_sale from shop_products where id = pA;
  if v_for_sale is not false then
    raise exception 'TEST FAILED (5a) : true -> false refuse (%)', v_for_sale;
  end if;

  update shop_products set for_sale = true where id = pA;
  select for_sale into v_for_sale from shop_products where id = pA;
  if v_for_sale is not true then
    raise exception 'TEST FAILED (5b) : false -> true refuse (%) -- aucune barriere ne doit exister sur for_sale', v_for_sale;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 5 REUSSI : transitions true<->false libres, aucune affirmation exigee.';

  -- ==========================================================================
  -- 6. `for_sale` N'ACCEPTE PAS NULL.
  --    Le NOT NULL est ce qui dispense chaque lecteur de choisir un repli.
  -- ==========================================================================
  begin
    update shop_products set for_sale = null where id = pA;
    raise exception 'TEST FAILED (6) : for_sale = NULL ACCEPTE -- le troisieme etat est de retour';
  exception when others then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
    if sqlerrm not like '%null%' and sqlerrm not like '%NULL%' then
      raise exception 'TEST FAILED (6b) : refus obtenu, mais par une autre garde -- %', sqlerrm;
    end if;
  end;
  v_n := v_n + 1;
  raise notice 'TEST 6 REUSSI : for_sale = NULL refuse par la contrainte NOT NULL.';

  -- ==========================================================================
  -- 7. AUCUN EFFET DE BORD SUR LES COLONNES DES ETAPES 1 A 7.
  --    Ecrire for_sale ne doit toucher ni la politique d'inventaire, ni le
  --    compteur, ni l'affirmation de comptage, ni la publication.
  -- ==========================================================================
  insert into shop_products (id, site_id, name, price, currency, stock, published, track_inventory)
  values (pC, v_site, 'E8A temoin', 30.00, 'CAD', 7, true, true);
  update shop_products set stock_counted_at = clock_timestamp() where id = pC;
  select stock_counted_at into v_counted from shop_products where id = pC;

  update shop_products set for_sale = false where id = pC;

  select track_inventory, stock, published, stock_counted_at
    into v_track, v_stock, v_published, v_counted
  from shop_products where id = pC;

  if v_track is not true then
    raise exception 'TEST FAILED (7a) : track_inventory altere par une ecriture de for_sale (%)', v_track;
  end if;
  if v_stock <> 7 then
    raise exception 'TEST FAILED (7b) : stock altere par une ecriture de for_sale (%)', v_stock;
  end if;
  if v_published is not true then
    raise exception 'TEST FAILED (7c) : published altere par une ecriture de for_sale (%)', v_published;
  end if;
  if v_counted is null then
    raise exception 'TEST FAILED (7d) : stock_counted_at efface par une ecriture de for_sale';
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 7 REUSSI : track_inventory, stock, published et stock_counted_at INCHANGES.';

  -- ==========================================================================
  -- 8. LA BARRIERE DE L'ETAPE 2 EST INTACTE ET N'A PAS ETE ETENDUE.
  --    Sa portee doit rester `track_inventory` SEUL : si `for_sale` l'avait
  --    elargie, toute ecriture de for_sale sur un produit non suivi serait
  --    refusee -- une regression invisible depuis le TypeScript.
  -- ==========================================================================
  update shop_products set track_inventory = false where id = pC;
  update shop_products set for_sale = true where id = pC;   -- ne doit RIEN declencher
  select for_sale, track_inventory into v_for_sale, v_track from shop_products where id = pC;
  if v_for_sale is not true or v_track is not false then
    raise exception 'TEST FAILED (8a) : etat inattendu (for_sale=%, track=%)', v_for_sale, v_track;
  end if;

  begin
    update shop_products set track_inventory = true where id = pC;
    raise exception 'TEST FAILED (8b) : REACTIVATION SANS COMPTAGE ACCEPTEE -- la barriere de l''etape 2 ne protege plus rien';
  exception when others then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
    if sqlerrm not like 'STOCK_TRACKING_REQUIRES_COUNT%' then
      raise exception 'TEST FAILED (8c) : refus obtenu, mais par une autre garde -- %', sqlerrm;
    end if;
  end;
  v_n := v_n + 1;
  raise notice 'TEST 8 REUSSI : barriere etape 2 intacte, de portee track_inventory SEUL.';

  -- ==========================================================================
  -- 9. AUCUNE CONTRAINTE NI TRIGGER AJOUTE PAR CE VOLET.
  -- ==========================================================================
  select count(*) into v_cnt
  from pg_trigger t
  where t.tgrelid = 'shop_products'::regclass and not t.tgisinternal;
  if v_cnt <> 1 then
    raise exception 'TEST FAILED (9a) : % trigger(s) non interne(s) sur shop_products (attendu 1 : celui de l''etape 2)', v_cnt;
  end if;

  select count(*) into v_cnt
  from pg_constraint where conrelid = 'shop_products'::regclass and contype = 'c';
  if v_cnt <> 0 then
    raise exception 'TEST FAILED (9b) : % CHECK sur shop_products (attendu 0 -- ce volet n''en ajoute aucun)', v_cnt;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 9 REUSSI : 1 seul trigger (etape 2), 0 CHECK -- aucune garde ajoutee.';

  -- ==========================================================================
  -- 10. AUCUNE DONNEE EXISTANTE CORROMPUE.
  --     Hors du site jetable, aucun produit ne doit etre non vendable du seul
  --     fait de la migration.
  -- ==========================================================================
  select count(*) into v_cnt
  from shop_products
  where site_id <> v_site and for_sale is not true;
  if v_cnt <> 0 then
    raise exception 'TEST FAILED (10) : % produit(s) preexistant(s) a for_sale <> true -- la migration a devendu des lignes', v_cnt;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 10 REUSSI : aucun produit preexistant devendu par la migration.';

  -- ==========================================================================
  -- 11. LES PRIVILEGES N'ONT PAS ETE ELARGIS.
  --     lot_g a revoque la table entiere pour anon/authenticated, sans
  --     regrant : une colonne nouvelle en herite, et ce test le verifie.
  -- ==========================================================================
  select count(*) into v_cnt
  from information_schema.role_table_grants
  where table_name = 'shop_products'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if v_cnt <> 0 then
    raise exception 'TEST FAILED (11) : % privilege(s) d''ecriture pour anon/authenticated sur shop_products (attendu 0)', v_cnt;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 11 REUSSI : anon et authenticated n''ont aucun droit d''ecriture sur shop_products.';

  -- ==========================================================================
  -- 12. LE COMMENTAIRE DE COLONNE EST POSE.
  --     C'est la seule documentation que porte la base elle-meme ; sans elle,
  --     la distinction published/for_sale n'existe que dans ce depot.
  -- ==========================================================================
  if col_description('shop_products'::regclass,
       (select ordinal_position from information_schema.columns
        where table_schema = 'public' and table_name = 'shop_products'
          and column_name = 'for_sale')::int) is null then
    raise exception 'TEST FAILED (12) : aucun commentaire sur shop_products.for_sale';
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 12 REUSSI : commentaire de colonne present.';

  if v_n <> 12 then
    raise exception 'TEST FAILED (bilan) : % preuves comptees au lieu de 12', v_n;
  end if;

  raise exception 'ETAPE 8 / VOLET A : 12/12 preuves passees -- rollback volontaire, aucune ecriture conservee.';
END $$;
