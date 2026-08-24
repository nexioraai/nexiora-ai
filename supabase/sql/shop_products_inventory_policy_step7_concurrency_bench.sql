-- ============================================================================
-- ETAPE 7 du chantier catalogue canonique -- BANC N9 : CONCURRENCE ENTRE UN
-- COMPTAGE ET UNE VENTE.
--
-- CE QUE CE BANC PROUVE, ET CE QU'IL NE PROUVE PAS.
--
-- `enable_stock_tracking()` ECRIT une valeur absolue de `stock`, pendant que
-- `decrement_shop_stock_batch()` la DECREMENTE. Les deux touchent la meme
-- ligne. La question n'est donc pas academique : un comptage arrive au mauvais
-- moment pourrait-il produire un stock negatif, une survente, ou un compteur
-- incoherent avec `stock_counted_at` ?
--
-- POSTGRESQL SERIALISE DEJA CES DEUX ECRITURES. Un `UPDATE ... WHERE` prend un
-- verrou de ligne, et la clause `where stock >= v_quantity` du decrement est
-- REEVALUEE apres l'obtention du verrou (`EvalPlanQual`). Deux transactions
-- concurrentes sur la meme ligne ne peuvent donc produire QUE l'un des deux
-- ordres serialises -- il n'existe pas de troisieme resultat, ni de lecture
-- dechiree. Ce banc verifie que CHACUN de ces deux ordres est sain.
--
-- CE QU'IL NE PROUVE PAS : il s'execute dans UNE session, donc il ne cree pas
-- de parallelisme reel. Il n'a pas a le faire : le parallelisme reel se REDUIT
-- aux ordres testes ici. Ce qui resterait a observer en session double serait
-- l'ATTENTE (un verrou tenu), jamais un resultat different. C'est dit ici pour
-- que personne ne lise ce banc comme une preuve de plus que ce qu'il est.
--
-- FAIL-CLOSED ATTENDU : aucun scenario ne doit produire un stock negatif, une
-- survente (vendre plus que le compteur), ni un suivi reactive sans comptage.
--
-- AUCUNE ECRITURE CONSERVEE : le bloc se termine par une exception volontaire
-- qui annule tout, comme les bancs des etapes 2, 3 et 4.
-- ============================================================================

DO $$
DECLARE
  v_owner uuid; v_theme text; v_margin numeric; v_round text;
  v_site uuid;
  pA uuid;  -- suivi, sert aux scenarios comptage/vente
  pB uuid;  -- NON suivi, temoin
  o1 uuid; o2 uuid; o3 uuid; o4 uuid;
  v_res jsonb;
  v_stock integer;
  v_mark boolean;
  v_t1 timestamptz; v_t2 timestamptz;
  v_neg integer;
  v_n integer := 0;
BEGIN
  select s.owner_id, s.theme, s.cj_margin_percent, s.cj_round_mode
    into v_owner, v_theme, v_margin, v_round from sites s limit 1;
  if v_owner is null then
    raise exception 'TEST FAILED (fixtures) : aucun site existant dont emprunter des valeurs valides';
  end if;

  v_site := gen_random_uuid();
  pA := gen_random_uuid(); pB := gen_random_uuid();
  o1 := gen_random_uuid(); o2 := gen_random_uuid();
  o3 := gen_random_uuid(); o4 := gen_random_uuid();

  insert into sites (id, slug, name, theme, published, cj_margin_percent, cj_round_mode, owner_id, mode)
  values (v_site, 'e7-'||v_site, 'ETAPE7 site jetable', v_theme, false, v_margin, v_round, v_owner, 2);

  insert into shop_products (id, site_id, name, price, currency, stock, published, track_inventory) values
    (pA, v_site, 'E7 suivi',     10.00, 'CAD', 0, true, true),
    (pB, v_site, 'E7 non suivi', 20.00, 'CAD', 0, true, false);

  insert into shop_orders (id, site_id, status, total, currency, payment_provider, fulfillment_domain) values
    (o1, v_site, 'pending', 30, 'usd', 'stripe', 'merchant'),
    (o2, v_site, 'pending', 30, 'usd', 'stripe', 'merchant'),
    (o3, v_site, 'pending', 50, 'usd', 'stripe', 'merchant'),
    (o4, v_site, 'pending', 40, 'usd', 'stripe', 'merchant');
  update shop_orders set status = 'paid' where id in (o1, o2, o3, o4);

  -- Colonnes et types RELEVES sur le banc de l'etape 4 (l. 351-359), qui a
  -- tourne 12/12 en production : `product_name` / `unit_price`, et surtout
  -- `product_id` en TEXT -- c'est sur ce type que porte la comparaison
  -- `product_id = any(v_decremented)` du marquage, `v_decremented` etant un
  -- text[] construit depuis le jsonb.
  insert into shop_order_items (order_id, product_id, product_name, quantity, unit_price) values
    (o1, pA::text, 'E7 suivi', 3, 10.00),
    (o2, pA::text, 'E7 suivi', 3, 10.00),
    (o3, pA::text, 'E7 suivi', 5, 10.00),
    (o4, pA::text, 'E7 suivi', 4, 10.00);

  -- ==========================================================================
  -- 1. DOUBLE CLIC : deux comptages dans LA MEME transaction.
  --    `now()` est fige par transaction ; si la RPC l'utilisait, le second
  --    comptage serait refuse par la barriere (`>` strict) et un simple double
  --    clic casserait la fonctionnalite. `clock_timestamp()` avance.
  -- ==========================================================================
  v_res := enable_stock_tracking(pA, 10);
  if v_res->>'success' <> 'true' then
    raise exception 'TEST FAILED (1a) : premier comptage refuse -- %', v_res;
  end if;
  v_t1 := (v_res->>'stock_counted_at')::timestamptz;

  v_res := enable_stock_tracking(pA, 10);
  if v_res->>'success' <> 'true' then
    raise exception 'TEST FAILED (1b) : le SECOND comptage de la meme transaction est refuse -- %', v_res;
  end if;
  v_t2 := (v_res->>'stock_counted_at')::timestamptz;

  if v_t2 <= v_t1 then
    raise exception 'TEST FAILED (1c) : stock_counted_at n''avance pas dans la transaction (% -> %)', v_t1, v_t2;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 1 REUSSI : deux comptages successifs passent, l''horodatage AVANCE (% -> %).', v_t1, v_t2;

  -- ==========================================================================
  -- 2. UN COMPTAGE EST ABSOLU, JAMAIS UN DELTA.
  --    C'est la propriete qui rend tout rejeu inoffensif : deux fois "10"
  --    donnent 10, pas 20. Un rejeu reseau, un double clic ou un retry
  --    d'agent IA ne peuvent donc pas gonfler un stock.
  -- ==========================================================================
  select stock into v_stock from shop_products where id = pA;
  if v_stock <> 10 then
    raise exception 'TEST FAILED (2) : deux comptages de 10 donnent stock = % (attendu 10, jamais 20)', v_stock;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 2 REUSSI : comptage ABSOLU -- deux fois 10 donnent 10.';

  -- ==========================================================================
  -- 3. ORDRE SERIALISE A : COMPTAGE PUIS VENTE.
  --    stock 10, on vend 3 -> 7. Le decrement voit la valeur comptee.
  -- ==========================================================================
  v_res := decrement_shop_stock_batch(
    jsonb_build_array(jsonb_build_object('product_id', pA::text, 'quantity', 3)), o1);
  if v_res->>'success' <> 'true' then
    raise exception 'TEST FAILED (3a) : vente apres comptage refusee -- %', v_res;
  end if;
  select stock into v_stock from shop_products where id = pA;
  if v_stock <> 7 then
    raise exception 'TEST FAILED (3b) : stock = % apres 10 puis -3 (attendu 7)', v_stock;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 3 REUSSI : ordre A (comptage puis vente) -> 10 - 3 = 7.';

  -- ==========================================================================
  -- 4. ORDRE SERIALISE B : VENTE PUIS COMPTAGE.
  --    On vend encore 3 (-> 4), puis le marchand compte 12 : le comptage
  --    ECRASE, et c'est VOULU. Un humain vient de compter physiquement ; sa
  --    mesure prime sur toute arithmetique. Le point a prouver n'est pas que
  --    la vente est "perdue" -- elle ne l'est pas, elle est deja livree -- mais
  --    que le resultat reste coherent et jamais negatif.
  -- ==========================================================================
  v_res := decrement_shop_stock_batch(
    jsonb_build_array(jsonb_build_object('product_id', pA::text, 'quantity', 3)), o2);
  if v_res->>'success' <> 'true' then
    raise exception 'TEST FAILED (4a) : seconde vente refusee -- %', v_res;
  end if;
  select stock into v_stock from shop_products where id = pA;
  if v_stock <> 4 then
    raise exception 'TEST FAILED (4b) : stock = % apres 7 - 3 (attendu 4)', v_stock;
  end if;

  v_res := enable_stock_tracking(pA, 12);
  if v_res->>'success' <> 'true' then
    raise exception 'TEST FAILED (4c) : comptage apres vente refuse -- %', v_res;
  end if;
  select stock into v_stock from shop_products where id = pA;
  if v_stock <> 12 then
    raise exception 'TEST FAILED (4d) : stock = % apres comptage a 12 (attendu 12)', v_stock;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 4 REUSSI : ordre B (vente puis comptage) -> le comptage humain fait autorite, stock = 12.';

  -- ==========================================================================
  -- 5. AUCUNE SURVENTE, QUEL QUE SOIT LE COMPTAGE.
  --    On compte 3, puis on tente de vendre 5. La clause `stock >= quantity`
  --    du decrement est reevaluee sous verrou : le refus est structurel, pas
  --    une verification applicative qu'une course pourrait doubler.
  -- ==========================================================================
  v_res := enable_stock_tracking(pA, 3);
  if v_res->>'success' <> 'true' then
    raise exception 'TEST FAILED (5a) : comptage a 3 refuse -- %', v_res;
  end if;
  -- La fonction NE LEVE PAS : son `exception when others` convertit
  -- INSUFFICIENT_STOCK en `{success:false, reason:...}` (etape 4, l. 204-207).
  -- On assert donc le MOTIF, pas seulement l'echec : un refus obtenu pour une
  -- autre raison (produit introuvable, quantite invalide, ligne non suivie)
  -- ressemblerait a un succes de ce test tout en prouvant autre chose.
  v_res := decrement_shop_stock_batch(
    jsonb_build_array(jsonb_build_object('product_id', pA::text, 'quantity', 5)), o3);
  if (v_res->>'success')::boolean is not false or v_res->>'reason' <> 'INSUFFICIENT_STOCK' then
    raise exception 'TEST FAILED (5b) : vendre 5 sur un stock compte a 3 doit etre refuse en INSUFFICIENT_STOCK, obtenu : %', v_res;
  end if;
  select stock into v_stock from shop_products where id = pA;
  if v_stock <> 3 then
    raise exception 'TEST FAILED (5c) : stock = % apres une vente refusee (attendu 3, inchange)', v_stock;
  end if;
  -- Aucun marquage non plus : `stock_decremented` reste un FAIT, jamais une
  -- intention -- c'est ce qui garde `cancel_shop_order` correcte sans qu'elle
  -- ait ete modifiee.
  select stock_decremented into v_mark from shop_order_items where order_id = o3 and product_id = pA::text;
  if v_mark is not false then
    raise exception 'TEST FAILED (5d) : ligne marquee decrementee alors que la vente a ete refusee (%)', v_mark;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 5 REUSSI : vendre 5 sur un stock compte a 3 est REFUSE, stock inchange.';

  -- ==========================================================================
  -- 6. JAMAIS DE STOCK NEGATIF.
  -- ==========================================================================
  v_res := enable_stock_tracking(pA, 4);
  v_res := decrement_shop_stock_batch(
    jsonb_build_array(jsonb_build_object('product_id', pA::text, 'quantity', 4)), o4);
  if v_res->>'success' <> 'true' then
    raise exception 'TEST FAILED (6a) : vendre exactement le stock compte est refuse -- %', v_res;
  end if;
  select stock into v_stock from shop_products where id = pA;
  if v_stock <> 0 then
    raise exception 'TEST FAILED (6b) : stock = % apres 4 - 4 (attendu 0)', v_stock;
  end if;
  select count(*) into v_neg from shop_products where site_id = v_site and stock < 0;
  if v_neg <> 0 then
    raise exception 'TEST FAILED (6c) : % ligne(s) a stock negatif', v_neg;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 6 REUSSI : stock exactement epuise a 0, aucune ligne negative.';

  -- ==========================================================================
  -- 7. STOCK 0 N'EST PAS "NON SUIVI".
  --    Un produit compte a 0 reste SUIVI : il refuse les ventes. Confondre
  --    "compte a zero" et "non suivi" serait la survente par excellence.
  -- ==========================================================================
  select track_inventory into v_mark from shop_products where id = pA;
  if v_mark is not true then
    raise exception 'TEST FAILED (7a) : un produit epuise a perdu son suivi (%)', v_mark;
  end if;
  v_res := decrement_shop_stock_batch(
    jsonb_build_array(jsonb_build_object('product_id', pA::text, 'quantity', 1)));
  if (v_res->>'success')::boolean is not false or v_res->>'reason' <> 'INSUFFICIENT_STOCK' then
    raise exception 'TEST FAILED (7b) : vendre 1 sur un produit SUIVI a stock 0 doit etre refuse en INSUFFICIENT_STOCK, obtenu : %', v_res;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 7 REUSSI : compte a 0 reste SUIVI et refuse la vente.';

  -- ==========================================================================
  -- 8. CYCLE COMPLET SOUS CONCURRENCE : suivre -> ne plus suivre -> recompter.
  --    La desactivation est libre ; la reactivation ne passe QUE par un
  --    comptage. C'est la barriere de l'etape 2, verifiee ici dans la meme
  --    transaction que des ventes -- la ou `now()` fige aurait tout bloque.
  -- ==========================================================================
  update shop_products set track_inventory = false where id = pA;
  select track_inventory into v_mark from shop_products where id = pA;
  if v_mark is not false then
    raise exception 'TEST FAILED (8a) : la desactivation a echoue (%)', v_mark;
  end if;

  begin
    update shop_products set track_inventory = true where id = pA;
    raise exception 'TEST FAILED (8b) : REACTIVATION SANS COMPTAGE ACCEPTEE -- la barriere ne protege plus rien';
  exception when others then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
    if sqlerrm not like 'STOCK_TRACKING_REQUIRES_COUNT%' then
      raise exception 'TEST FAILED (8c) : refus obtenu, mais par une autre garde -- %', sqlerrm;
    end if;
  end;

  v_res := enable_stock_tracking(pA, 25);
  if v_res->>'success' <> 'true' then
    raise exception 'TEST FAILED (8d) : reactivation par comptage refusee -- %', v_res;
  end if;
  select stock, track_inventory into v_stock, v_mark from shop_products where id = pA;
  if v_stock <> 25 or v_mark is not true then
    raise exception 'TEST FAILED (8e) : etat final incoherent (stock=%, track=%)', v_stock, v_mark;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 8 REUSSI : desactivation libre, reactivation IMPOSSIBLE sans comptage, comptage accepte.';

  -- ==========================================================================
  -- 9. UN PRODUIT NON SUIVI EST INSENSIBLE AUX COMPTAGES D'UN AUTRE.
  --    Verifie qu'aucun scenario ci-dessus n'a deborde sur la ligne voisine.
  -- ==========================================================================
  select stock, track_inventory into v_stock, v_mark from shop_products where id = pB;
  if v_mark is not false or v_stock <> 0 then
    raise exception 'TEST FAILED (9) : le produit non suivi a ete altere (stock=%, track=%)', v_stock, v_mark;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 9 REUSSI : le produit voisin NON SUIVI est intact.';

  -- ==========================================================================
  -- 10. `stock_counted_at` NE RECULE JAMAIS, meme apres desactivations et
  --     ventes intercalees. C'est la propriete dont depend la barriere.
  -- ==========================================================================
  select stock_counted_at into v_t2 from shop_products where id = pA;
  if v_t2 is null or v_t2 <= v_t1 then
    raise exception 'TEST FAILED (10) : stock_counted_at = % n''a pas avance depuis % ', v_t2, v_t1;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 10 REUSSI : stock_counted_at a monotonement avance sur toute la transaction.';

  -- ==========================================================================
  -- 11. INVARIANT GLOBAL DE FIN : aucune corruption sur AUCUNE ligne du site.
  -- ==========================================================================
  select count(*) into v_neg
  from shop_products
  where site_id = v_site
    and (stock < 0 or (track_inventory is true and stock_counted_at is null and stock <> 0));
  if v_neg <> 0 then
    raise exception 'TEST FAILED (11) : % ligne(s) incoherente(s) en fin de banc', v_neg;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 11 REUSSI : aucune ligne negative, aucun suivi sans comptage.';

  -- ==========================================================================
  -- 12. LES DROITS N'ONT PAS ETE ELARGIS PAR CETTE ETAPE.
  -- ==========================================================================
  -- Forme `p.oid`, identique aux temoins de privileges des etapes 2 et 3 :
  -- c'est celle dont le resultat a ete releve en production (anon=false,
  -- authenticated=false, service_role=true). Elle prouve accessoirement que la
  -- fonction EXISTE dans `public` -- un `select ... into` sans ligne laisserait
  -- v_mark a NULL, cas traite explicitement.
  select has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
    into v_mark
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'enable_stock_tracking';

  if v_mark is null then
    raise exception 'TEST FAILED (12) : enable_stock_tracking est introuvable dans le schema public';
  end if;
  if v_mark is not false then
    raise exception 'TEST FAILED (12a) : enable_stock_tracking est exposee a anon ou authenticated';
  end if;

  select has_function_privilege('service_role', p.oid, 'EXECUTE') into v_mark
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'enable_stock_tracking';
  if v_mark is not true then
    raise exception 'TEST FAILED (12b) : service_role a perdu l''acces a enable_stock_tracking';
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 12 REUSSI : droits inchanges (anon/authenticated refuses, service_role autorise).';

  if v_n <> 12 then
    raise exception 'TEST FAILED (bilan) : % preuves comptees au lieu de 12', v_n;
  end if;

  raise exception 'ETAPE 7 / N9 : 12/12 preuves passees -- rollback volontaire, aucune ecriture conservee.';
END $$;
