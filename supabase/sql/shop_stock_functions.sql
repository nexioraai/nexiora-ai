-- F7 (audit stock Mode 2) — fonction PostgreSQL pour la decrementation
-- atomique du stock a la confirmation de paiement. A executer manuellement
-- dans l'editeur SQL Supabase (meme convention que fulfillment_functions.sql,
-- system_health_checks.sql, generation_failures.sql : aucun outillage de
-- migration automatise n'existe dans ce repo).
--
-- Cette fonction existe pour la meme raison technique que celles de
-- fulfillment_functions.sql (voir son en-tete) : le client @supabase/supabase-js
-- (PostgREST) n'execute qu'UNE seule instruction SQL par appel HTTP -- une
-- decrementation "stock = stock - quantite" n'est PAS exprimable de facon
-- atomique via un simple .update() (PostgREST n'accepte que des valeurs
-- litterales, jamais une expression relative a la valeur actuelle de la
-- ligne). L'ancien code (src/lib/shop.ts, decrementStock) faisait une
-- lecture puis un calcul en JavaScript puis une ecriture separee -- un vrai
-- "lost update" possible sous concurrence (deux commandes differentes sur le
-- meme produit, webhooks traites en parallele), confirme par audit de code,
-- independant de toute question de reservation de stock.
--
-- Appelee depuis TypeScript via supabaseAdmin.rpc('decrement_shop_stock_batch',
-- { p_lines: [...] }). Executee sous le contexte service_role => bypass RLS
-- nativement, pas besoin de SECURITY DEFINER.
--
-- CORRECTIF POST-VERIFICATION (F7) : la premiere version de ce fichier ne
-- comportait aucun REVOKE/GRANT explicite. Verifie reellement (appel REST
-- direct avec la cle publishable/anon) : PostgreSQL accorde EXECUTE sur une
-- fonction a PUBLIC par defaut, et PostgREST expose donc cette RPC au role
-- "anon" -- n'importe quel visiteur non authentifie pouvait l'appeler
-- directement (HTTP 200), en contournant integralement handlePaidCheckout
-- et toute la logique metier. La mutation reelle du stock etait bloquee
-- dans ce cas uniquement par une consequence incidente de RLS sur
-- shop_products (SECURITY INVOKER => l'UPDATE s'execute avec les droits de
-- l'appelant), jamais par une decision explicite de cette fonction -- une
-- policy RLS future (ex: permettre a un marchand authentifie de modifier
-- son propre stock) rouvrirait immediatement la faille pour le role
-- "authenticated", sans aucun lien avec cette fonction. Le GRANT explicite
-- en bas de fichier rend cette restriction independante de RLS.
--
-- F9/F10 (audit annulation Mode 2) : signature etendue avec un parametre
-- p_order_id optionnel (defaut null, retro-compatible avec tout appelant
-- existant qui ne le fournit pas) -- voir cancel_shop_order() plus bas pour
-- le raisonnement complet. CREATE OR REPLACE ne remplace une fonction que
-- si la liste de types d'arguments est identique : changer la signature
-- cree un second overload au lieu de remplacer l'original si l'ancienne
-- version n'est pas explicitement supprimee -- d'ou le DROP FUNCTION
-- ci-dessous, necessaire pour eviter deux fonctions "decrement_shop_stock_batch"
-- coexistantes (l'une (jsonb) sans la nouvelle capacite, l'autre (jsonb, uuid)
-- avec, chacune necessitant ses propres REVOKE/GRANT si elles coexistaient).
drop function if exists decrement_shop_stock_batch(jsonb);

-- ============================================================
-- F9/F10 (audit annulation Mode 2) -- colonne de tracabilite exacte des
-- lignes de commande dont le stock a REELLEMENT ete decremente.
--
-- Pourquoi cette colonne est necessaire, plutot qu'une re-derivation a la
-- volee au moment de l'annulation (ex: rejouer la meme logique
-- d'exclusion CJ que decrementStock, en relisant shop_products.cj_vid a cet
-- instant-la) : cette re-derivation suppose implicitement que cj_vid ne
-- change jamais entre le paiement et l'annulation -- hypothese non
-- demontree (rien n'empeche techniquement un futur outil interne de le
-- modifier), et qui casserait de toute facon si le produit est supprime
-- entre-temps (deleteProduct existe et est appelable par le marchand
-- proprietaire, src/app/api/shop/products/[id]/route.ts). Enregistrer le
-- fait au moment ou il se produit, dans la MEME transaction que la
-- decrementation elle-meme (voir plus bas), rend la restauration
-- deterministe par construction -- une verite historique figee, jamais une
-- supposition sur un etat de shop_products qui peut avoir change.
alter table shop_order_items add column if not exists stock_decremented boolean not null default false;

-- ============================================================
-- decrement_shop_stock_batch
--
-- Decremente atomiquement le stock de plusieurs produits en une seule
-- transaction. Regle stricte, comme create_provider_submission : si UN SEUL
-- produit de la liste n'a pas un stock suffisant, TOUTE la fonction echoue
-- et AUCUN produit n'est decremente (rollback complet via l'exception) --
-- jamais de decrementation partielle sur une commande multi-produits.
--
-- p_lines : jsonb, tableau de {"product_id": uuid, "quantity": integer}.
-- p_order_id : uuid optionnel (F9/F10). Quand fourni, et uniquement si la
--   decrementation reussit entierement, marque atomiquement (meme
--   transaction) les lignes shop_order_items correspondantes comme
--   stock_decremented = true -- seule source de verite utilisee ensuite par
--   cancel_shop_order() pour savoir exactement quoi restaurer. Omis (ou
--   null) : comportement 100% identique a l'ancienne signature (aucune
--   ecriture sur shop_order_items) -- c'est le seul appelant qui a besoin de
--   ce marquage (handlePaidCheckout, au moment precis ou le paiement vient
--   d'etre confirme) ; tout autre appel (aucun autre n'existe aujourd'hui)
--   continue de fonctionner sans aucun changement de comportement.
--
-- Retour JSONB :
--   { success: true }
--   { success: false, reason: 'INSUFFICIENT_STOCK', product_id }
--     -- au moins un produit de la liste n'avait pas stock >= quantite au
--     -- moment de sa ligne (le tout premier trouve dans l'ordre du tableau ;
--     -- les autres n'ont pas ete tentes, la transaction est deja annulee).
--   { success: false, reason: 'INVALID_QUANTITY', product_id }
--     -- quantite nulle ou <= 0 sur une ligne.
--   { success: false, reason: 'ORDER_NOT_PAYABLE' }
--     -- p_order_id fourni, mais la commande n'est PLUS 'paid' au moment de
--     -- cet appel (voir CORRECTIF F9/F10 ci-dessous).
--
-- Concurrence (demontre, pas suppose) : sous stock=1 et deux appels
-- concurrents quantite=1 sur le meme produit, Postgres serialise les deux
-- UPDATE via le verrouillage de ligne standard (MVCC) -- le second a
-- toujours a se resoudre contre l'etat COMMIT du premier, jamais contre un
-- etat perime. Le stock ne peut donc jamais devenir negatif et aucune
-- decrementation n'est jamais perdue, par construction du moteur, pas par
-- discipline applicative.
--
-- CORRECTIF F9/F10 v3 -- HISTORIQUE DES DEUX TENTATIVES PRECEDENTES,
-- TOUTES DEUX REJETEES APRES CONTRE-AUDIT :
--
-- v1 (rejetee) : "perform 1 ... for update" avant la boucle. Rompt avec le
-- SEUL patron de concurrence deja prouve dans ce projet (UPDATE...WHERE...
-- GET DIAGNOSTICS -- Test L de l'audit F7, gardes F4). Teste reellement en
-- concurrence repetee : 3 echecs sur 6 essais, stock decremente jamais
-- restaure.
--
-- v2 (rejetee) : ajout d'une SECONDE verification apres la boucle -- mais
-- elle aussi un simple "perform" SANS "for update", donc une lecture nue
-- sans aucun verrou : ne peut structurellement offrir aucune garantie
-- transactionnelle, quel que soit son taux de reussite empirique observe.
--
-- v3 (retenue) : UNE SEULE verification, mais qui n'est PLUS un SELECT/
-- PERFORM -- c'est un veritable UPDATE, qui reecrit status sur lui-meme
-- ('paid' -> 'paid'). Ce n'est pas cosmetique : PostgreSQL acquiert le
-- MEME verrou de ligne pour un UPDATE qui ne change aucune valeur que pour
-- un UPDATE qui en change une -- ce n'est jamais optimise/elide a ce
-- niveau. Cette ecriture devient une REVENDICATION ("claim") de la ligne,
-- via EXACTEMENT le meme primitive que cancel_shop_order utilise pour SA
-- propre transition ('paid' -> 'canceled') sur la meme ligne. Les deux
-- fonctions se disputent desormais le meme type de verrou, acquis de la
-- meme facon, jamais un SELECT face a un UPDATE.
--
-- Preuve de serialisation (pas juste des tests) : deux UPDATE concurrents
-- sur la MEME ligne shop_orders, avec la MEME clause WHERE status='paid',
-- ne peuvent jamais s'executer "simultanement" au niveau moteur -- l'un
-- des deux acquiert le verrou de ligne standard en premier (lequel, n'est
-- pas deterministe, mais qu'il y en ait toujours EXACTEMENT un ne depend
-- d'aucune hypothese specifique a ce code, c'est la definition meme de
-- l'isolation au niveau ligne sous MVCC) ; le second ATTEND
-- obligatoirement la fin (commit ou rollback) du premier avant de
-- re-evaluer sa propre clause WHERE contre l'etat ALORS reellement
-- committe. Aucun etat ou les deux transactions "croient" avoir
-- legitimement gagne sans que l'une ait vu le resultat commit de l'autre
-- n'est possible, par construction du moteur -- pas par discipline
-- applicative, exactement le meme raisonnement deja demontre par le Test L
-- de l'audit F7 (course shop_orders.status webhook vs annulation) et les
-- Tests J/K (course shop_products.stock).
-- ============================================================
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

    -- CORRECTIF POST-VERIFICATION (F7) : demontre par test reel -- sans
    -- cette garde, une quantite negative passe la clause
    -- "where stock >= v_quantity" (trivialement vraie des que le stock est
    -- >= 0) et "stock = stock - v_quantity" AUGMENTE alors le stock au lieu
    -- de le decrementer (teste : stock 3, quantite -1 => stock 4). Une
    -- quantite = 0 ne corromptrait pas le stock (stock - 0 = stock) mais ne
    -- correspond a aucune ligne de commande valide -- rejetee ici aussi,
    -- au tout dernier point de passage avant une mutation irreversible,
    -- independamment de toute validation (absente aujourd'hui, F6) en amont
    -- a la creation de la commande.
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'INVALID_QUANTITY:%', v_product_id;
    end if;

    update shop_products
    set stock = stock - v_quantity
    where id = v_product_id
      and stock >= v_quantity;

    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'INSUFFICIENT_STOCK:%', v_product_id;
    end if;
  end loop;

  -- F9/F10 : toute la boucle ci-dessus a reussi -- marque exactement les
  -- lignes shop_order_items concernees, dans la MEME transaction (rollback
  -- automatique avec le reste si quoi que ce soit echoue apres ce point,
  -- bien qu'il ne reste plus rien d'autre a faire ici). p_lines ne contient
  -- jamais que des product_id shop_products reels (filtres en amont par
  -- decrementStock(), src/lib/shop.ts, avant meme l'appel RPC) -- jamais de
  -- lignes catalogue -- donc aucun probleme de comparaison de type ici
  -- (product_id de shop_order_items est stocke en text, compare a des uuid
  -- convertis en text par ->>'product_id', jamais l'inverse).
  if p_order_id is not null then
    update shop_order_items
    set stock_decremented = true
    where order_id = p_order_id
      and product_id in (
        select value->>'product_id' from jsonb_array_elements(p_lines)
      );
  end if;

  return jsonb_build_object('success', true);
exception
  when others then
    -- Toute exception ici (y compris le raise ci-dessus) annule TOUTE la
    -- transaction de cette fonction -- aucun produit partiellement
    -- decremente, meme si des lignes precedentes de la boucle avaient deja
    -- reussi avant l'echec de celle-ci.
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

revoke all on function decrement_shop_stock_batch(jsonb, uuid) from public;
revoke all on function decrement_shop_stock_batch(jsonb, uuid) from anon;
revoke all on function decrement_shop_stock_batch(jsonb, uuid) from authenticated;
grant execute on function decrement_shop_stock_batch(jsonb, uuid) to service_role;

-- ============================================================
-- cancel_shop_order (F9/F10)
--
-- Transition atomique d'une commande vers 'canceled', et -- uniquement si
-- elle etait reellement 'paid' -- restauration atomique tout-ou-rien du
-- stock exactement decremente pour cette commande, dans la MEME
-- transaction que la transition de statut elle-meme.
--
-- Pourquoi une seule fonction pour les deux (statut + stock), plutot que
-- deux etapes separees cote TypeScript (lire le statut, puis decider, puis
-- restaurer, puis mettre a jour le statut) : c'est exactement le meme
-- probleme qu'un simple SELECT-puis-UPDATE JavaScript pour le stock (F7) --
-- une race entre cette annulation et le webhook de paiement
-- (checkout.session.completed) sur LA MEME commande. Demontre reellement
-- ce meme tour (course concurrente sur shop_orders.status, cf. Test L de
-- l'audit F7) : Postgres serialise deux UPDATE...WHERE concurrents sur la
-- meme ligne via son verrouillage de ligne standard -- le second des deux
-- UPDATE ci-dessous se resout TOUJOURS contre l'etat COMMIT du premier,
-- jamais contre un etat perime, quel que soit l'ordre reel d'arrivee entre
-- ce webhook et cette annulation. Aucune lecture prealable cote TypeScript
-- n'est fiable pour decider quoi faire : seule une decision prise DANS la
-- meme transaction que l'ecriture peut etre correcte sous concurrence.
--
-- Deux transitions possibles, tentees dans l'ordre :
--   1) pending -> canceled : aucun paiement n'a jamais eu lieu, rien a
--      restaurer, rien a rembourser.
--   2) paid -> canceled : le paiement avait ete confirme (webhook), le
--      stock avait ete decremente -- restaure exactement les lignes
--      marquees stock_decremented = true par decrement_shop_stock_batch (et
--      seulement celles-la : jamais une ligne CJ-fulfilled, jamais une
--      ligne d'un produit depuis supprime qui n'avait jamais ete
--      decremente). Retourne aussi payment_intent_id -- LU FRAICHEMENT ICI,
--      jamais celui lu par l'appelant avant l'appel RPC (qui peut etre
--      perime si le webhook vient de le definir pendant la course) -- pour
--      que l'appelant TypeScript sache QUEL paiement rembourser sans jamais
--      se fier a une lecture anterieure a cette transaction.
--
-- Toute autre transition (deja 'canceled', 'refunded' -- le chemin F7
-- stock-insuffisant emprunte cet etat sans jamais decrementer de stock,
-- donc rien a y restaurer non plus --, 'shipped', 'delivered', ou une
-- course perdue contre un webhook/une autre annulation concurrente) ne
-- correspond a AUCUNE des deux clauses WHERE ci-dessous : la fonction
-- retourne alors success:false sans avoir touche quoi que ce soit.
--
-- Restauration par ligne, tolerante a un produit disparu : si
-- shop_products ne contient plus le produit (supprime par le marchand
-- entre le paiement et l'annulation), l'UPDATE de cette ligne particuliere
-- ne touche simplement aucune ligne (0 rows, pas une exception) -- la
-- restauration des AUTRES lignes et surtout la transition de statut
-- elle-meme ne sont jamais bloquees pour cette raison : retenir le
-- remboursement d'un client parce qu'un produit a ete supprime depuis
-- serait strictement pire qu'un compteur de stock legerement inexact sur
-- un produit qui de toute facon n'est plus en vente.
--
-- Idempotence : un second appel sur la meme commande deja 'canceled' ne
-- correspond a aucune des deux clauses WHERE -> success:false,
-- restocked:false implicite -- jamais de double restauration, par
-- construction (meme mecanisme que le double-decrement, deja demontre F7).
-- ============================================================
create or replace function cancel_shop_order(
  p_order_id uuid
) returns jsonb
language plpgsql
as $$
declare
  v_updated integer;
  v_payment_intent_id text;
  v_line record;
begin
  -- 1) pending -> canceled : rien n'a jamais ete decremente.
  update shop_orders
  set status = 'canceled', cj_pay_status = 'canceled'
  where id = p_order_id and status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated > 0 then
    return jsonb_build_object('success', true, 'restocked', false);
  end if;

  -- 2) paid -> canceled : le paiement etait confirme, le stock avait ete
  -- decremente -- capture payment_intent_id FRAIS (etat post-transition,
  -- garanti a jour par le meme UPDATE qui vient de reussir).
  update shop_orders
  set status = 'canceled', cj_pay_status = 'canceled'
  where id = p_order_id and status = 'paid'
  returning payment_intent_id into v_payment_intent_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    -- Ni pending ni paid : deja canceled/refunded/shipped/delivered, ou
    -- course perdue contre une autre transition concurrente. Rien touche.
    return jsonb_build_object('success', false, 'reason', 'NOT_CANCELABLE');
  end if;

  for v_line in
    select id as item_id, product_id, quantity
    from shop_order_items
    where order_id = p_order_id and stock_decremented = true
  loop
    update shop_products
    set stock = stock + v_line.quantity
    where id = v_line.product_id::uuid;

    update shop_order_items
    set stock_decremented = false
    where id = v_line.item_id;
  end loop;

  return jsonb_build_object(
    'success', true,
    'restocked', true,
    'payment_intent_id', v_payment_intent_id
  );
end;
$$;

revoke all on function cancel_shop_order(uuid) from public;
revoke all on function cancel_shop_order(uuid) from anon;
revoke all on function cancel_shop_order(uuid) from authenticated;
grant execute on function cancel_shop_order(uuid) to service_role;
