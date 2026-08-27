-- =============================================================
-- CHANTIER CATALOGUE CANONIQUE — ÉTAPE 4 / 8
-- LE DÉCRÉMENT CESSE DE FAIRE CONFIANCE À SON APPELANT
--
-- À exécuter manuellement dans l'éditeur SQL Supabase (aucun outillage de
-- migration dans ce dépôt — même convention que M1-7 et étapes 1 à 3).
--
-- ⚠️ REMPLACE la définition de `decrement_shop_stock_batch` publiée dans
-- supabase/sql/shop_stock_functions.sql (lignes 151-249). Ce fichier-ci
-- documente désormais l'état déployé de CETTE fonction ; celui-là reste la
-- référence pour `cancel_shop_order`, INCHANGÉE.
--
-- ============================================================
-- LE DÉFAUT CORRIGÉ, MESURÉ AVANT ÉCRITURE
--
-- La fonction actuelle porte son propre aveu en commentaire :
--   « p_lines ne contient jamais que des product_id shop_products reels
--     (filtres en amont par decrementStock(), src/lib/shop.ts) »
--
-- C'est une CONFIANCE, pas une défense. Et depuis l'étape 1, une seconde
-- question s'ajoute, qu'aucun appelant ne peut trancher correctement :
-- cette ligne a-t-elle un compteur ?
--
-- CE QUI SE PASSE AUJOURD'HUI SUR UNE LIGNE `track_inventory = false` :
--   `stock >= v_quantity` peut être faux (stock inerte, souvent 0)
--     -> 0 ligne mise à jour
--     -> `raise INSUFFICIENT_STOCK`
--     -> le bloc `exception when others` annule TOUT LE LOT
--     -> `decrementStock()` retourne ok:false
--     -> handlePaidCheckout journalise `stock_insufficient_after_payment`
--        et déclenche un REMBOURSEMENT STRIPE INTÉGRAL AUTOMATIQUE.
--
-- Autrement dit : UNE COMMANDE MIXTE (une ligne suivie + une ligne non
-- suivie) est aujourd'hui INTÉGRALEMENT REMBOURSÉE, y compris ses lignes
-- parfaitement valides. Financièrement sûr, fonctionnellement inopérant.
--
-- ============================================================
-- LE CHANGEMENT, ET POURQUOI IL EST MINIMAL
--
-- Le prédicat d'inventaire descend DANS LA CLAUSE `where` du décrément :
--
--     where id = v_product_id
--       and track_inventory is true     <-- ajouté
--       and stock >= v_quantity
--
-- Il est donc évalué dans la MÊME instruction atomique que le décrément.
-- Aucun verrou, aucune lecture préalable, aucune course : une ligne ne peut
-- pas être « suivie au moment de la lecture puis non suivie au moment de
-- l'écriture », puisqu'il n'y a qu'une seule écriture.
--
-- Reste à distinguer les trois raisons possibles d'un `row_count = 0`. Ce
-- diagnostic ne s'exécute QUE sur le chemin d'échec — coût nul sur le chemin
-- nominal :
--
--     non suivie          -> `continue` : ni décrément, ni erreur, ni marquage
--     suivie, insuffisante -> INSUFFICIENT_STOCK (contrat inchangé)
--     introuvable          -> INSUFFICIENT_STOCK (contrat inchangé, voir plus bas)
--
-- ============================================================
-- LE MARQUAGE DEVIENT SÉLECTIF — ET C'EST LA MOITIÉ LA PLUS IMPORTANTE
--
-- Aujourd'hui : `stock_decremented = true` est posé sur TOUTES les lignes de
-- `p_lines`, sans distinction. Désormais : uniquement sur celles réellement
-- décrémentées, accumulées dans `v_decremented`.
--
-- POURQUOI CELA SUFFIT À RENDRE `cancel_shop_order` CORRECT SANS Y TOUCHER.
-- Sa boucle de restauration est pilotée par `where stock_decremented = true` :
-- elle ne connaît ni `track_inventory`, ni les préfixes, ni les modes. Elle
-- restaure CE QUI A ÉTÉ DÉCRÉMENTÉ. Si le marquage est exact, la restauration
-- est exacte. `cancel_shop_order` n'est donc PAS modifiée — et le banc le
-- prouve (test 9 : seule la ligne suivie est restaurée).
--
-- ============================================================
-- CE QUI N'EST DÉLIBÉRÉMENT PAS CHANGÉ
--
--   * `INVALID_QUANTITY` (garde F7, ajoutée après un test réel : stock 3,
--     quantité -1 => stock 4) — intacte ;
--   * `ORDER_NOT_PAYABLE` (CAS `status = 'paid'`) — intact ;
--   * le tout-ou-rien : `exception when others` enveloppe tout le corps ;
--   * la non-négativité : `stock >= v_quantity`, propriété démontrée sous
--     concurrence dans ce dépôt (3 échecs sur 6 essais, jamais négatif) ;
--   * le filtrage `catalog-` en amont (`lib/shop.ts:166`) : c'est du ROUTAGE
--     (quel magasin ?), pas de l'INVENTAIRE (quel compteur ?). Deux questions
--     distinctes, deux couches distinctes ;
--   * `PRODUIT INTROUVABLE -> INSUFFICIENT_STOCK` : aujourd'hui l'UPDATE ne
--     trouve rien et lève ce code. Le conserver évite de modifier le `reason`
--     remonté à l'appelant. Un code plus explicite serait une amélioration —
--     HORS PÉRIMÈTRE de l'étape 4, signalée et non faite.
--
-- ============================================================
-- ÉTAT RÉEL MESURÉ AVANT ÉCRITURE (production, 2026-08-24)
--
--   * étapes 1 à 3 appliquées et prouvées (colonnes, barrière 12/12,
--     enable_stock_tracking 9/9)
--   * shop_products : 0 ligne · 2 contraintes · 2 index · 1 trigger
--     (trg_enforce_stock_tracking_requires_count, portée `track_inventory`)
--   * shop_orders : 26 · shop_order_items : 8 · stock_decremented=true : 0
--   * signatures intactes : decrement_shop_stock_batch(p_lines jsonb,
--     p_order_id uuid) et cancel_shop_order(p_order_id uuid)
--
-- IMPACT TYPESCRIPT : AUCUN. `decrementStock()` transmet ses lignes et lit
-- `{success, reason}` — contrat de retour inchangé. Les tests de
-- `src/lib/__tests__/shop.test.ts` MOCKENT la RPC : ils prouvent le contrat
-- TypeScript, jamais le corps SQL. Ils restent verts et pertinents.
--
-- IDEMPOTENT : `create or replace function`. Les privilèges sont préservés
-- par CREATE OR REPLACE ; ils sont néanmoins réaffirmés ci-dessous pour que
-- ce fichier décrive à lui seul l'état déployé.
--
-- ROLLBACK : réexécuter la définition de shop_stock_functions.sql
-- (lignes 151-249). Aucune donnée n'est concernée : cette étape ne modifie
-- aucune ligne à l'installation.
-- =============================================================

create or replace function decrement_shop_stock_batch(
  p_lines jsonb,
  p_order_id uuid default null
) returns jsonb
language plpgsql
as $$
declare
  v_line jsonb;
  v_updated integer;
  v_product_id uuid;
  v_quantity integer;
  v_tracked boolean;                        -- ETAPE 4
  v_decremented text[] := array[]::text[];  -- ETAPE 4 : lignes REELLEMENT decrementees
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    return jsonb_build_object('success', true);
  end if;

  if p_order_id is not null then
    update shop_orders set status = 'paid' where id = p_order_id and status = 'paid';
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'ORDER_NOT_PAYABLE:%', p_order_id;
    end if;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_quantity := (v_line->>'quantity')::integer;

    -- Garde F7, inchangee : demontree par test reel (stock 3, quantite -1
    -- => stock 4 sans elle). Dernier point de passage avant une mutation
    -- irreversible.
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'INVALID_QUANTITY:%', v_product_id;
    end if;

    -- ETAPE 4 : le predicat d'inventaire est porte par la clause WHERE --
    -- donc evalue dans la MEME instruction atomique que le decrement.
    -- Aucune lecture prealable, aucun verrou, aucune course possible.
    update shop_products
    set stock = stock - v_quantity
    where id = v_product_id
      and track_inventory is true
      and stock >= v_quantity;

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      -- Diagnostic execute UNIQUEMENT sur le chemin d'echec : trois raisons
      -- possibles a un row_count nul, et une seule est benigne.
      select track_inventory into v_tracked
      from shop_products
      where id = v_product_id;

      if found and v_tracked is not true then
        -- Ligne non suivie : ni decrement, ni erreur, ni marquage.
        -- C'est ce `continue` qui rend une commande MIXTE fonctionnelle.
        continue;
      end if;

      -- Suivie mais insuffisante, OU produit introuvable : code d'erreur
      -- inchange (voir en-tete).
      raise exception 'INSUFFICIENT_STOCK:%', v_product_id;
    end if;

    v_decremented := v_decremented || (v_line->>'product_id');
  end loop;

  -- F9/F10 + ETAPE 4 : marque EXACTEMENT les lignes reellement decrementees,
  -- dans la MEME transaction. `stock_decremented` reste un FAIT, jamais une
  -- intention -- c'est ce qui permet a cancel_shop_order de rester correcte
  -- sans etre modifiee. Comparaison text/text, comme avant (product_id de
  -- shop_order_items est stocke en text).
  if p_order_id is not null and coalesce(array_length(v_decremented, 1), 0) > 0 then
    update shop_order_items
    set stock_decremented = true
    where order_id = p_order_id
      and product_id = any(v_decremented);
  end if;

  return jsonb_build_object('success', true);

exception
  when others then
    -- Toute exception annule TOUTE la transaction de cette fonction : aucun
    -- produit partiellement decremente, meme si des lignes precedentes de la
    -- boucle avaient deja reussi. Classification inchangee.
    if SQLERRM like 'INSUFFICIENT_STOCK:%' then
      return jsonb_build_object(
        'success', false,
        'reason', 'INSUFFICIENT_STOCK',
        'product_id', split_part(SQLERRM, ':', 2)
      );
    end if;
    if SQLERRM like 'INVALID_QUANTITY:%' then
      return jsonb_build_object(
        'success', false,
        'reason', 'INVALID_QUANTITY',
        'product_id', split_part(SQLERRM, ':', 2)
      );
    end if;
    if SQLERRM like 'ORDER_NOT_PAYABLE:%' then
      return jsonb_build_object('success', false, 'reason', 'ORDER_NOT_PAYABLE');
    end if;
    return jsonb_build_object('success', false, 'reason', SQLERRM);
end;
$$;

comment on function decrement_shop_stock_batch(jsonb, uuid) is
  'Decremente atomiquement le stock des lignes SUIVIES d''une commande (etape 4/8 du chantier catalogue canonique). Le predicat d''inventaire vit ICI, dans la clause WHERE du decrement : une ligne track_inventory=false est ignoree -- ni decrement, ni erreur, ni marquage -- et ne fait donc plus echouer tout le lot. `stock_decremented=true` n''est pose que sur les lignes REELLEMENT decrementees, ce qui rend cancel_shop_order correcte sans la modifier. Tout-ou-rien, non-negativite, INVALID_QUANTITY et ORDER_NOT_PAYABLE inchanges.';

-- Privileges : preserves par CREATE OR REPLACE, reaffirmes pour que ce
-- fichier decrive a lui seul l'etat deploye. Forme en trois instructions :
-- celle des 8 RPC metier.
revoke all on function decrement_shop_stock_batch(jsonb, uuid) from anon;
revoke all on function decrement_shop_stock_batch(jsonb, uuid) from authenticated;
revoke all on function decrement_shop_stock_batch(jsonb, uuid) from public;
grant execute on function decrement_shop_stock_batch(jsonb, uuid) to service_role;


-- =============================================================
-- VÉRIFICATIONS APRÈS APPLICATION (lecture seule, à exécuter séparément)
-- =============================================================
--
-- A. Signature, langage et modèle de sécurité inchangés.
--
--   select p.proname, pg_get_function_identity_arguments(p.oid) as signature,
--          pg_get_function_result(p.oid) as retour, l.lanname as langage,
--          p.prosecdef as security_definer
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   join pg_language l on l.oid = p.prolang
--   where n.nspname='public'
--     and p.proname in ('decrement_shop_stock_batch','cancel_shop_order')
--   order by p.proname;
--   -- attendu : EXACTEMENT 2 lignes
--   --   cancel_shop_order          | p_order_id uuid          | jsonb | plpgsql | false
--   --   decrement_shop_stock_batch | p_lines jsonb, p_order_id uuid | jsonb | plpgsql | false
--
-- B. Le prédicat d'inventaire est bien dans la fonction, et cancel_shop_order
--    ne l'a PAS reçu.
--
--   select p.proname,
--          (prosrc ilike '%track_inventory%')   as connait_track_inventory,
--          (prosrc ilike '%v_decremented%')     as marquage_selectif
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public'
--     and p.proname in ('decrement_shop_stock_batch','cancel_shop_order')
--   order by p.proname;
--   -- attendu :
--   --   cancel_shop_order          | false | false   <-- NON MODIFIEE
--   --   decrement_shop_stock_batch | true  | true
--   -- cancel_shop_order a `true` quelque part => STOP : elle a ete modifiee.
--
-- C. fn_exposees reste à 0.
--
--   select count(*) as fn_exposees
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public'
--     and (has_function_privilege('anon', p.oid, 'EXECUTE')
--       or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
--   -- attendu : 0
--
-- D. Témoins hors périmètre.
--
--   select (select count(*) from pg_constraint
--            where conrelid='public.shop_products'::regclass)                 as contraintes,
--          (select count(*) from pg_indexes
--            where schemaname='public' and tablename='shop_products')         as index,
--          (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
--            where c.relname='shop_products' and not t.tgisinternal)          as triggers,
--          (select count(*) from shop_products)                               as produits,
--          (select count(*) from shop_orders)                                 as commandes,
--          (select count(*) from shop_order_items)                            as lignes,
--          (select count(*) from shop_order_items where stock_decremented)    as lignes_decrementees;
--   -- attendu : 2 | 2 | 1 | 0 | 26 | 8 | 0
-- =============================================================


-- =============================================================
-- E. BANC DE PREUVES COMPORTEMENTAL — 12 cas.
--
-- Même convention que les étapes 2 et 3 : NOTICE 'REUSSI' à chaque cas, ou
-- 'TEST FAILED' nommant l'étape. Rollback volontaire final : aucune écriture
-- durable, aucune commande réelle touchée.
--
-- ⚠️ RUN DÉDIÉ OBLIGATOIRE : jamais dans le même Run que l'installation.
--
-- MESSAGE FINAL ATTENDU :
--   ERROR: ETAPE 4 : 12/12 preuves passees -- rollback volontaire, aucune ecriture conservee.
-- =============================================================
DO $$
DECLARE
  v_owner uuid; v_theme text; v_margin numeric; v_round text;
  v_site uuid;
  pA uuid;  -- suivi,     stock 10
  pB uuid;  -- NON suivi, stock 5
  pC uuid;  -- suivi,     stock 1
  o1 uuid; o2 uuid; o3 uuid; o4 uuid; o5 uuid; o6 uuid;
  v_res jsonb;
  v_stock integer;
  v_mark boolean;
  v_n integer := 0;
BEGIN
  select s.owner_id, s.theme, s.cj_margin_percent, s.cj_round_mode
    into v_owner, v_theme, v_margin, v_round from sites s limit 1;
  if v_owner is null then
    raise exception 'TEST FAILED (fixtures) : aucun site existant dont emprunter des valeurs valides';
  end if;

  v_site := gen_random_uuid();
  pA := gen_random_uuid(); pB := gen_random_uuid(); pC := gen_random_uuid();
  o1 := gen_random_uuid(); o2 := gen_random_uuid(); o3 := gen_random_uuid();
  o4 := gen_random_uuid(); o5 := gen_random_uuid(); o6 := gen_random_uuid();

  -- Site Mode 2 : requis par M1-7 (une commande n'existe que pour un site commercant).
  insert into sites (id, slug, name, theme, published, cj_margin_percent, cj_round_mode, owner_id, mode)
  values (v_site, 'e4-'||v_site, 'ETAPE4 site jetable', v_theme, false, v_margin, v_round, v_owner, 2);

  insert into shop_products (id, site_id, name, price, currency, stock, published, track_inventory) values
    (pA, v_site, 'E4 suivi',     10.00, 'CAD', 10, true, true),
    (pB, v_site, 'E4 non suivi', 20.00, 'CAD',  5, true, false),
    (pC, v_site, 'E4 rupture',   30.00, 'CAD',  1, true, true);

  -- Commandes : creees 'pending' (seul statut legal a l'INSERT), puis passees
  -- a 'paid' -- transition legale de la machine a etats.
  insert into shop_orders (id, site_id, status, total, currency, payment_provider, fulfillment_domain) values
    (o1, v_site, 'pending', 20, 'usd', 'stripe', 'merchant'),
    (o2, v_site, 'pending', 60, 'usd', 'stripe', 'merchant'),
    (o3, v_site, 'pending', 50, 'usd', 'stripe', 'merchant'),
    (o4, v_site, 'pending', 150,'usd', 'stripe', 'merchant'),
    (o5, v_site, 'pending', 160,'usd', 'stripe', 'merchant'),
    (o6, v_site, 'pending', 10, 'usd', 'stripe', 'merchant');
  update shop_orders set status = 'paid' where id in (o1, o2, o3, o4, o5);  -- o6 reste 'pending'

  insert into shop_order_items (order_id, product_id, product_name, quantity, unit_price) values
    (o1, pA::text, 'E4 suivi',     2, 10.00),
    (o2, pB::text, 'E4 non suivi', 3, 20.00),
    (o3, pA::text, 'E4 suivi',     1, 10.00),
    (o3, pB::text, 'E4 non suivi', 2, 20.00),
    (o4, pC::text, 'E4 rupture',   5, 30.00),
    (o5, pA::text, 'E4 suivi',     1, 10.00),
    (o5, pC::text, 'E4 rupture',   5, 30.00),
    (o6, pA::text, 'E4 suivi',     1, 10.00);
  v_n := v_n + 1;
  raise notice 'TEST 1 REUSSI : fixtures creees (3 produits suivi/non-suivi/rupture, 6 commandes dont 5 payees).';

  -- ---------- 2. LIGNE SUIVIE, STOCK SUFFISANT ----------
  v_res := decrement_shop_stock_batch(jsonb_build_array(jsonb_build_object('product_id', pA::text, 'quantity', 2)), o1);
  if (v_res->>'success')::boolean is not true then
    raise exception 'TEST FAILED (2) : ligne suivie avec stock suffisant, obtenu : %', v_res;
  end if;
  select stock into v_stock from shop_products where id = pA;
  select stock_decremented into v_mark from shop_order_items where order_id = o1 and product_id = pA::text;
  if v_stock <> 8 or v_mark is not true then
    raise exception 'TEST FAILED (2, effet) : stock=% (attendu 8), stock_decremented=% (attendu true)', v_stock, v_mark;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 2 REUSSI : ligne SUIVIE decrementee (10 -> 8) et marquee stock_decremented=true.';

  -- ---------- 3. LIGNE NON SUIVIE SEULE ----------
  v_res := decrement_shop_stock_batch(jsonb_build_array(jsonb_build_object('product_id', pB::text, 'quantity', 3)), o2);
  if (v_res->>'success')::boolean is not true then
    raise exception 'TEST FAILED (3) : une ligne NON suivie ne doit provoquer AUCUNE erreur, obtenu : %', v_res;
  end if;
  select stock into v_stock from shop_products where id = pB;
  select stock_decremented into v_mark from shop_order_items where order_id = o2 and product_id = pB::text;
  if v_stock <> 5 or v_mark is not false then
    raise exception 'TEST FAILED (3, effet) : stock=% (attendu 5), stock_decremented=% (attendu false)', v_stock, v_mark;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 3 REUSSI : ligne NON SUIVIE ignoree -- aucun decrement (stock reste 5), aucune erreur, stock_decremented reste false.';

  -- ---------- 4. COMMANDE MIXTE -- LE COEUR DE L'ETAPE 4 ----------
  v_res := decrement_shop_stock_batch(
    jsonb_build_array(
      jsonb_build_object('product_id', pA::text, 'quantity', 1),
      jsonb_build_object('product_id', pB::text, 'quantity', 2)
    ), o3);
  if (v_res->>'success')::boolean is not true then
    raise exception 'TEST FAILED (4) : une commande MIXTE aurait du reussir, obtenu : %', v_res;
  end if;
  select stock into v_stock from shop_products where id = pA;
  if v_stock <> 7 then raise exception 'TEST FAILED (4, pA) : stock=% (attendu 7)', v_stock; end if;
  select stock into v_stock from shop_products where id = pB;
  if v_stock <> 5 then raise exception 'TEST FAILED (4, pB) : stock=% (attendu 5, inchange)', v_stock; end if;
  select stock_decremented into v_mark from shop_order_items where order_id = o3 and product_id = pA::text;
  if v_mark is not true then raise exception 'TEST FAILED (4, marquage pA) : % (attendu true)', v_mark; end if;
  select stock_decremented into v_mark from shop_order_items where order_id = o3 and product_id = pB::text;
  if v_mark is not false then raise exception 'TEST FAILED (4, marquage pB) : % (attendu false)', v_mark; end if;
  v_n := v_n + 1;
  raise notice 'TEST 4 REUSSI : COMMANDE MIXTE -- ligne suivie traitee (7) et marquee, ligne non suivie ignoree (5) et NON marquee, aucun echec global. C''est le defaut que l''etape 4 corrige.';

  -- ---------- 5. STOCK INSUFFISANT SUR UNE LIGNE SUIVIE ----------
  v_res := decrement_shop_stock_batch(jsonb_build_array(jsonb_build_object('product_id', pC::text, 'quantity', 5)), o4);
  if (v_res->>'success')::boolean is not false or v_res->>'reason' <> 'INSUFFICIENT_STOCK' then
    raise exception 'TEST FAILED (5) : stock insuffisant sur ligne suivie doit rester fail-closed, obtenu : %', v_res;
  end if;
  select stock into v_stock from shop_products where id = pC;
  select stock_decremented into v_mark from shop_order_items where order_id = o4 and product_id = pC::text;
  if v_stock <> 1 or v_mark is not false then
    raise exception 'TEST FAILED (5, effet) : stock=% (attendu 1), stock_decremented=% (attendu false)', v_stock, v_mark;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 5 REUSSI : stock insuffisant sur ligne SUIVIE -> INSUFFICIENT_STOCK, aucun decrement, aucun marquage.';

  -- ---------- 6. INVALID_QUANTITY INCHANGE ----------
  v_res := decrement_shop_stock_batch(jsonb_build_array(jsonb_build_object('product_id', pA::text, 'quantity', 0)));
  if (v_res->>'success')::boolean is not false or v_res->>'reason' <> 'INVALID_QUANTITY' then
    raise exception 'TEST FAILED (6) : garde F7 INVALID_QUANTITY alteree, obtenu : %', v_res;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 6 REUSSI : garde F7 INVALID_QUANTITY intacte.';

  -- ---------- 7. TOUT-OU-RIEN INCHANGE ----------
  v_res := decrement_shop_stock_batch(
    jsonb_build_array(
      jsonb_build_object('product_id', pA::text, 'quantity', 1),
      jsonb_build_object('product_id', pC::text, 'quantity', 5)
    ), o5);
  if (v_res->>'success')::boolean is not false or v_res->>'reason' <> 'INSUFFICIENT_STOCK' then
    raise exception 'TEST FAILED (7) : le lot aurait du echouer, obtenu : %', v_res;
  end if;
  select stock into v_stock from shop_products where id = pA;
  if v_stock <> 7 then
    raise exception 'TEST FAILED (7, tout-ou-rien) : pA a ete decremente (%) alors que le lot a echoue', v_stock;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 7 REUSSI : tout-ou-rien intact -- la ligne suivie valide (pA) n''a PAS ete decrementee car une autre ligne du lot a echoue.';

  -- ---------- 8. ORDER_NOT_PAYABLE INCHANGE ----------
  v_res := decrement_shop_stock_batch(jsonb_build_array(jsonb_build_object('product_id', pA::text, 'quantity', 1)), o6);
  if (v_res->>'success')::boolean is not false or v_res->>'reason' <> 'ORDER_NOT_PAYABLE' then
    raise exception 'TEST FAILED (8) : CAS ORDER_NOT_PAYABLE altere, obtenu : %', v_res;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 8 REUSSI : ORDER_NOT_PAYABLE intact (commande restee pending).';

  -- ---------- 9. cancel_shop_order INCHANGEE, ET CORRECTE ----------
  v_res := cancel_shop_order(o3);
  if (v_res->>'success')::boolean is not true or (v_res->>'restocked')::boolean is not true then
    raise exception 'TEST FAILED (9) : annulation de o3 aurait du restocker, obtenu : %', v_res;
  end if;
  select stock into v_stock from shop_products where id = pA;
  if v_stock <> 8 then
    raise exception 'TEST FAILED (9, pA) : stock=% (attendu 8 apres restock de la ligne suivie)', v_stock;
  end if;
  select stock into v_stock from shop_products where id = pB;
  if v_stock <> 5 then
    raise exception 'TEST FAILED (9, pB) : stock=% -- une ligne NON SUIVIE a ete restockee, ce qui est faux', v_stock;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 9 REUSSI : cancel_shop_order NON MODIFIEE restaure EXACTEMENT la ligne suivie (7 -> 8) et laisse la ligne non suivie intacte (5) -- le marquage selectif suffit a la rendre correcte.';

  -- ---------- 10. LE MARQUAGE EST REMIS A false PAR L'ANNULATION ----------
  select stock_decremented into v_mark from shop_order_items where order_id = o3 and product_id = pA::text;
  if v_mark is not false then
    raise exception 'TEST FAILED (10, pA) : stock_decremented=% apres annulation (attendu false)', v_mark;
  end if;
  select stock_decremented into v_mark from shop_order_items where order_id = o3 and product_id = pB::text;
  if v_mark is not false then
    raise exception 'TEST FAILED (10, pB) : stock_decremented=% (attendu false, jamais marquee)', v_mark;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 10 REUSSI : apres annulation, stock_decremented est false sur les deux lignes -- la creance est soldee, et la ligne non suivie n''en a jamais porte.';

  -- ---------- 11. PRODUIT INTROUVABLE : CONTRAT D'ERREUR INCHANGE ----------
  v_res := decrement_shop_stock_batch(jsonb_build_array(jsonb_build_object('product_id', gen_random_uuid()::text, 'quantity', 1)));
  if (v_res->>'success')::boolean is not false or v_res->>'reason' <> 'INSUFFICIENT_STOCK' then
    raise exception 'TEST FAILED (11) : produit introuvable doit conserver le code INSUFFICIENT_STOCK, obtenu : %', v_res;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 11 REUSSI : produit introuvable -> INSUFFICIENT_STOCK, contrat d''erreur deliberement inchange (un code plus explicite serait hors perimetre de l''etape 4).';

  -- ---------- 12. AUCUNE COLONNE HORS PERIMETRE MODIFIEE ----------
  if exists (
    select 1 from shop_products
    where id in (pA, pB, pC)
      and (published is not true
        or currency <> 'CAD'
        or stock_counted_at is not null)
  ) then
    raise exception 'TEST FAILED (12) : une colonne hors perimetre a ete modifiee (published, currency ou stock_counted_at)';
  end if;
  select track_inventory into v_mark from shop_products where id = pB;
  if v_mark is not false then
    raise exception 'TEST FAILED (12, track_inventory) : la politique d''inventaire de pB a ete modifiee (%)', v_mark;
  end if;
  v_n := v_n + 1;
  raise notice 'TEST 12 REUSSI : published, currency, stock_counted_at et track_inventory INCHANGES -- le decrement ne touche que `stock`.';

  if v_n <> 12 then
    raise exception 'TEST FAILED (bilan) : % preuves comptees au lieu de 12', v_n;
  end if;

  raise exception 'ETAPE 4 : 12/12 preuves passees -- rollback volontaire, aucune ecriture conservee.';
END $$;
