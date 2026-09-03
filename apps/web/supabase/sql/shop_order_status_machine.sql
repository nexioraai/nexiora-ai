-- LOT H (Mode 3 global) -- machine a etats centralisee pour shop_orders.status.
-- A executer manuellement dans l'editeur SQL Supabase (aucun outillage de
-- migration automatise dans ce depot -- meme convention que
-- fulfillment_functions.sql / sites_archive_rpc.sql / shop_stock_functions.sql).
--
-- ============================================================
-- CAUSE RACINE (audit, re-confirmee par recherche exhaustive apres
-- corrections) : 8 points d'ecriture reels de shop_orders.status trouves
-- par recherche exhaustive (grep sur .update/.insert/.upsert/.rpc/SQL
-- direct dans tout src/ + tous les fichiers SQL versionnes), aucun 9e
-- trouve :
--   1. checkout/route.ts            INSERT status='pending' (creation, seul
--                                    point d'INSERT de tout le projet)
--   2. handlePaidCheckout.ts:91     UPDATE 'paid'      WHERE status='pending' (CAS)
--   3. handlePaidCheckout.ts:190    UPDATE 'refunded'  WHERE status='paid' (CAS)
--   4. connect-webhook/route.ts:54  UPDATE 'canceled'  WHERE status='pending' (CAS)
--   5. orders/route.ts PATCH        UPDATE 'shipped'/'delivered' WHERE status=lu (CAS
--                                    dynamique + verification de legalite applicative
--                                    via orderStatusMachine.ts -- LOT H contre-audit :
--                                    le PATCH acceptait auparavant 'shipped' depuis
--                                    N'IMPORTE QUEL statut de depart, le CAS ne
--                                    protegeant que contre une COURSE, jamais contre
--                                    une transition simplement illegale)
--   6. cj-tracking/route.ts:104     UPDATE 'shipped'   WHERE status=lu (CAS dynamique
--                                    + exclusion SQL amont + garde applicative
--                                    supplementaire juste avant l'UPDATE -- F-CJ-01)
--   7. pod-fulfill.ts:350           UPDATE 'processing' via RPC apply_shop_order_status,
--                                    p_allowed_current=['paid'] -- F-POD-01
--   8. cancel_shop_order (RPC)      UPDATE 'canceled'  WHERE status IN ('pending','paid') (CAS)
--
-- Tous les points d'ecriture ont desormais une garde CAS applicative
-- correcte. Le probleme reel n'a jamais ete "CAS absent" mais l'absence
-- d'une BARRIERE UNIQUE validant la LEGALITE de la transition elle-meme
-- (independamment de toute course) -- une garde CAS protege contre une
-- COURSE, jamais contre une transition ILLEGALE tentee par un appelant qui
-- n'a jamais eu de bug de concurrence (ex. orders/route.ts PATCH avant
-- correction : aucune course requise pour marquer 'shipped' une commande
-- deja 'canceled', le CAS matchait trivialement).
--
-- ARCHITECTURE RETENUE : trigger BEFORE INSERT + BEFORE UPDATE OF status
-- (barriere reelle, incontournable par TOUT appelant y compris service_role
-- et une requete SQL directe -- meme mecanisme deja prouve fonctionner dans
-- ce projet via reject_order_if_site_archived) + RPC apply_shop_order_status()
-- (utilisee uniquement par pod-fulfill.ts, le seul point sans aucune garde
-- prealable avant ce lot). Les 5 autres points d'ecriture deja/desormais
-- correctement gardes cote application ne sont PAS migres vers cette RPC :
-- ils sont proteges PAR LE TRIGGER, les migrer serait du remaniement sans
-- gain de securite.
--
-- DURCISSEMENT AJOUTE (contre-audit, cette revision) : le trigger initial ne
-- couvrait que UPDATE OF status. Or AUCUN trigger ne validait l'INSERT --
-- un appelant futur (ou un service_role compromis, ou une requete SQL
-- directe) pouvait creer une ligne shop_orders directement a un statut
-- terminal ('shipped'/'delivered'/'canceled'/'refunded'), contournant
-- INTEGRALEMENT la machine a etats sans jamais passer par une transition
-- validee. Le seul point d'INSERT reel de tout le projet (checkout/route.ts)
-- ecrit 'pending' en dur -- confirme par recherche exhaustive (aucun autre
-- fichier .ts/.sql du depot n'insere dans shop_orders). Le trigger couvre
-- desormais aussi BEFORE INSERT : toute creation doit demarrer a 'pending',
-- sans exception. Un CHECK constraint enumerant les 7 valeurs licites a ete
-- envisage en plus mais ecarte : deja redondant, chaque branche du trigger
-- ne peut deja produire/accepter qu'une valeur explicitement listee dans le
-- code (aucune valeur arbitraire ne peut passer le trigger, INSERT ou
-- UPDATE) -- l'ajouter serait de la complexite sans reduction de risque
-- reelle (principe : architecture minimale mais robuste).
--
-- Le trigger NE remplace PAS les gardes CAS applicatives existantes : elles
-- restent necessaires pour un risque DIFFERENT (deux ecritures concurrentes
-- vers la MEME valeur cible avec des donnees annexes differentes, ex.
-- tracking_number -- le trigger authorise silencieusement NEW.status =
-- OLD.status, la garde CAS applicative est ce qui rejette la seconde
-- ecriture entiere, tracking_number inclus).
-- ============================================================

-- ------------------------------------------------------------
-- 1/3 -- fonction de validation (appelee par les 2 triggers ci-dessous)
-- ------------------------------------------------------------
create or replace function enforce_shop_order_status_transition()
returns trigger
language plpgsql
security invoker
as $$
begin
  -- Creation (INSERT) : aucune transition n'a de sens (pas d'OLD). Seul
  -- point d'entree legitime dans la machine a etats -- doit toujours
  -- demarrer a 'pending' (seul point d'INSERT reel du projet, verifie par
  -- recherche exhaustive : checkout/route.ts). Bloque toute creation
  -- directe a un statut terminal ou intermediaire, y compris via
  -- service_role/SQL direct.
  if TG_OP = 'INSERT' then
    if new.status is distinct from 'pending' then
      raise exception 'ILLEGAL_STATUS_TRANSITION: INSERT must start at pending (got %) (order_id=%)', new.status, new.id
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE OF status : reecriture de la meme valeur (round-trip, meme
  -- convention CAS que decrement_shop_stock_batch) toujours autorisee, ce
  -- n'est pas une transition.
  if new.status = old.status then
    return new;
  end if;

  if not (new.status = any(
    case old.status
      when 'pending'    then array['paid', 'canceled']
      when 'paid'       then array['processing', 'shipped', 'canceled', 'refunded']
      when 'processing' then array['shipped', 'canceled', 'refunded']
      when 'shipped'    then array['delivered']
      -- delivered / canceled / refunded / toute valeur non reconnue :
      -- aucune transition sortante -- terminal par defaut, fail-closed.
      else array[]::text[]
    end
  )) then
    raise exception 'ILLEGAL_STATUS_TRANSITION: % -> % (order_id=%)', old.status, new.status, old.id
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_shop_order_status_insert on shop_orders;
create trigger trg_enforce_shop_order_status_insert
  before insert on shop_orders
  for each row
  execute function enforce_shop_order_status_transition();

drop trigger if exists trg_enforce_shop_order_status_transition on shop_orders;
create trigger trg_enforce_shop_order_status_transition
  before update of status on shop_orders
  for each row
  execute function enforce_shop_order_status_transition();

-- ------------------------------------------------------------
-- DEFAUT DE CE SCRIPT, identifie a la passe de cloture (phase 2, etape 5).
--
-- PostgreSQL accorde EXECUTE a PUBLIC par defaut a la creation de toute
-- fonction. Ce script ne le retirait pas, contrairement au patron deja
-- etabli ailleurs dans ce depot (sites_archive_rpc.sql,
-- shop_stock_functions.sql : REVOKE ALL ... puis GRANT EXECUTE TO
-- service_role). `anon` et `authenticated` detenaient donc EXECUTE sur
-- enforce_shop_order_status_transition() -- c'est l'une des 4 seules
-- fonctions de `public` qui leur restaient accessibles a l'audit.
--
-- IMPACT REEL : nul en l'etat. Une fonction retournant `trigger` ne peut pas
-- etre appelee directement (PostgreSQL leve une erreur), et PostgREST ne les
-- expose pas. Le seul vecteur etait de GREFFER cette fonction sur une AUTRE
-- table pour en bloquer toutes les ecritures -- ce qui exige le privilege
-- TRIGGER, revoque depuis (phase2_privileges_hardening.sql, etape 2).
--
-- ORDRE OBLIGATOIRE : ce REVOKE doit rester APRES les deux `create trigger`
-- ci-dessus. PostgreSQL exige EXECUTE sur la fonction au moment du
-- CREATE TRIGGER -- mais PAS au declenchement.
--
-- PROPRIETE PROUVEE COMPORTEMENTALEMENT sur cette base (2026-08-22), et non
-- supposee : table + fonction trigger jetables creees, trigger installe,
-- `REVOKE ALL ... FROM PUBLIC` applique, puis INSERT declencheur -- la
-- fonction a bien tire malgre le REVOKE (marqueur ecrit dans la ligne), le
-- tout annule par une exception finale. C'est ce resultat qui a leve le refus
-- initial d'appliquer ce REVOKE a la machine a etats des commandes.
revoke all on function enforce_shop_order_status_transition() from public, anon, authenticated;
grant execute on function enforce_shop_order_status_transition() to service_role;
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 2/3 -- RPC ergonomique, utilisee par pod-fulfill.ts (le seul point
-- d'ecriture sans aucune garde prealable avant ce lot). Les autres points
-- d'ecriture deja correctement gardes ne sont PAS migres vers cette RPC.
-- security invoker + revoke/grant : meme patron que les 9 fonctions RPC
-- deja existantes dans ce projet (fulfillment_functions.sql,
-- shop_stock_functions.sql, sites_archive_rpc.sql).
--
-- p_allowed_current ne fait QUE determiner le CAS (etat attendu avant
-- ecriture, protection contre une course) -- ce n'est PAS lui qui decide de
-- la legalite de la transition : meme si un futur appelant passait un
-- p_allowed_current trop permissif (ex. tous les statuts), le trigger
-- BEFORE UPDATE OF status s'applique inconditionnellement a l'UPDATE
-- execute a l'interieur de cette fonction (SECURITY INVOKER : le trigger
-- ne peut pas etre contourne depuis l'interieur d'une fonction, il
-- s'applique a l'UPDATE lui-meme, quel que soit l'appelant). Cette
-- separation des responsabilites (RPC = CAS, trigger = legalite) est
-- deliberee : la RPC ne peut structurellement PAS devenir une primitive de
-- contournement de la machine a etats, quels que soient ses parametres.
-- ------------------------------------------------------------
create or replace function apply_shop_order_status(
  p_order_id uuid,
  p_target_status text,
  p_allowed_current text[]
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_updated integer;
begin
  update shop_orders
  set status = p_target_status
  where id = p_order_id
    and status = any(p_allowed_current);

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('success', false, 'reason', 'CAS_MISMATCH_OR_NOT_FOUND');
  end if;

  return jsonb_build_object('success', true);
exception
  when others then
    -- Capture notamment ILLEGAL_STATUS_TRANSITION leve par le trigger --
    -- le trigger reste la barriere reelle meme pour un appel via cette RPC,
    -- pas seulement pour un UPDATE direct.
    return jsonb_build_object('success', false, 'reason', SQLERRM);
end;
$$;

revoke all on function apply_shop_order_status(uuid, text, text[]) from public;
revoke all on function apply_shop_order_status(uuid, text, text[]) from anon;
revoke all on function apply_shop_order_status(uuid, text, text[]) from authenticated;
grant execute on function apply_shop_order_status(uuid, text, text[]) to service_role;

-- ------------------------------------------------------------
-- 3/3 -- VERIFICATION IMMEDIATE (lecture seule) + TESTS HOSTILES (ecriture
-- sur UNE SEULE commande jetable, creee puis supprimee dans le meme bloc --
-- ne touche aucune donnee reelle, aucun test destructif permanent). A
-- executer et a renvoyer INTEGRALEMENT (chaque SELECT + tous les messages
-- NOTICE/EXCEPTION produits par les blocs DO).
-- ------------------------------------------------------------

-- A. Trigger present sur shop_orders (les 2 : INSERT et UPDATE OF status).
-- Attendu : 2 lignes, tgenabled = 'O' (origin, actif) pour les deux.
SELECT tgname, tgenabled, tgtype
FROM pg_trigger
WHERE tgrelid = 'public.shop_orders'::regclass
  AND tgname IN ('trg_enforce_shop_order_status_insert', 'trg_enforce_shop_order_status_transition')
ORDER BY tgname;

-- B. Fonction trigger existante, proprietaire et securite.
-- Attendu : 1 ligne, prosecdef = false (SECURITY INVOKER, jamais DEFINER).
SELECT proname, prosecdef, proowner::regrole AS owner
FROM pg_proc
WHERE proname = 'enforce_shop_order_status_transition';

-- C+D. RPC apply_shop_order_status existante, securite/proprietaire corrects.
-- Attendu : 1 ligne, prosecdef = false (SECURITY INVOKER).
SELECT proname, prosecdef, proowner::regrole AS owner
FROM pg_proc
WHERE proname = 'apply_shop_order_status';

-- E. EXECUTE de la RPC : DOIT lister UNIQUEMENT service_role. Si une ligne
-- anon/authenticated/PUBLIC apparait ici, le lot n'est PAS valide.
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'apply_shop_order_status'
ORDER BY grantee;

-- F+G. TEST HOSTILE COMPLET : commande jetable, creee puis supprimee.
-- Chaque etape produit un message NOTICE explicite en cas de succes, et
-- interrompt le bloc avec 'TEST FAILED' (exception non catchee, visible
-- immediatement) si le comportement reel ne correspond pas a l'attendu.
-- Aucune ambiguite possible : soit tous les NOTICE 'REUSSI' apparaissent,
-- soit une erreur 'TEST FAILED' apparait et identifie precisement l'etape
-- en cause.
DO $$
DECLARE
  v_test_id uuid;
  v_site_id uuid;
  v_rpc_result jsonb;
BEGIN
  SELECT id INTO v_site_id FROM sites WHERE archived_at IS NULL LIMIT 1;

  -- Test 1 : INSERT direct a un statut non-'pending' -- DOIT etre rejete
  -- (F durci : personne, y compris SQL direct/service_role, ne peut creer
  -- une commande deja 'shipped').
  BEGIN
    INSERT INTO shop_orders (site_id, status, total, currency, payment_provider, cancel_token)
    VALUES (v_site_id, 'shipped', 0, 'usd', 'stripe', gen_random_uuid());
    RAISE EXCEPTION 'TEST FAILED (etape 1) : INSERT direct a status=''shipped'' aurait du etre rejete';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'ILLEGAL_STATUS_TRANSITION%' THEN
        RAISE NOTICE 'TEST 1 REUSSI : INSERT direct a un statut non-pending bien rejete (%.)', SQLERRM;
      ELSE
        RAISE EXCEPTION 'TEST FAILED (etape 1, erreur inattendue) : %', SQLERRM;
      END IF;
  END;

  -- Creation legitime de la commande jetable (seule voie autorisee : 'pending').
  INSERT INTO shop_orders (site_id, status, total, currency, payment_provider, cancel_token)
  VALUES (v_site_id, 'pending', 0, 'usd', 'stripe', gen_random_uuid())
  RETURNING id INTO v_test_id;
  RAISE NOTICE 'Commande jetable creee (id=%), status=pending.', v_test_id;

  -- Test 2 : transition ILLEGALE directe (bypass total de l'application),
  -- pending -> shipped n'existe pas dans le graphe -- DOIT etre rejetee.
  BEGIN
    UPDATE shop_orders SET status = 'shipped' WHERE id = v_test_id;
    RAISE EXCEPTION 'TEST FAILED (etape 2) : la transition pending->shipped aurait du etre rejetee';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'ILLEGAL_STATUS_TRANSITION%' THEN
        RAISE NOTICE 'TEST 2 REUSSI : transition pending->shipped bien rejetee (%.)', SQLERRM;
      ELSE
        RAISE EXCEPTION 'TEST FAILED (etape 2, erreur inattendue) : %', SQLERRM;
      END IF;
  END;

  -- Test 3 : transition LEGALE (pending -> paid) -- DOIT reussir.
  UPDATE shop_orders SET status = 'paid' WHERE id = v_test_id;
  RAISE NOTICE 'TEST 3 REUSSI : transition legale pending->paid appliquee sans erreur.';

  -- Test 4 : round-trip (paid -> paid) -- DOIT reussir (pas une transition).
  UPDATE shop_orders SET status = 'paid' WHERE id = v_test_id;
  RAISE NOTICE 'TEST 4 REUSSI : round-trip paid->paid (meme valeur) autorise sans erreur.';

  -- Test 5 : RPC apply_shop_order_status avec p_allowed_current correct
  -- (paid -> processing, exactement l'appel reel de pod-fulfill.ts) --
  -- DOIT reussir.
  SELECT apply_shop_order_status(v_test_id, 'processing', ARRAY['paid']) INTO v_rpc_result;
  IF (v_rpc_result->>'success')::boolean IS TRUE THEN
    RAISE NOTICE 'TEST 5 REUSSI : RPC apply_shop_order_status(paid->processing) a reussi (%).', v_rpc_result;
  ELSE
    RAISE EXCEPTION 'TEST FAILED (etape 5) : RPC aurait du reussir, resultat = %', v_rpc_result;
  END IF;

  -- Test 6 : RPC apply_shop_order_status avec CAS errone (p_allowed_current
  -- ne correspond plus a l'etat reel, deja 'processing') -- DOIT echouer
  -- proprement (success:false), jamais lever d'exception non geree.
  SELECT apply_shop_order_status(v_test_id, 'shipped', ARRAY['paid']) INTO v_rpc_result;
  IF (v_rpc_result->>'success')::boolean IS FALSE AND v_rpc_result->>'reason' = 'CAS_MISMATCH_OR_NOT_FOUND' THEN
    RAISE NOTICE 'TEST 6 REUSSI : RPC avec CAS errone rejetee proprement (%).', v_rpc_result;
  ELSE
    RAISE EXCEPTION 'TEST FAILED (etape 6) : resultat inattendu = %', v_rpc_result;
  END IF;

  -- Test 7 : RPC apply_shop_order_status utilisee comme tentative de
  -- CONTOURNEMENT de la machine a etats -- p_allowed_current correspond
  -- reellement a l'etat courant ('processing', le CAS passerait donc), mais
  -- la cible visee ('pending') n'existe dans AUCUNE branche du graphe
  -- depuis 'processing'. Prouve que la RPC ne peut pas devenir une
  -- primitive generique de reecriture de statut meme avec un
  -- p_allowed_current parfaitement exact : la legalite de la transition
  -- reste entierement decidee par le trigger, jamais par la RPC elle-meme.
  -- DOIT echouer via le trigger (capture par le bloc exception de la RPC).
  SELECT apply_shop_order_status(v_test_id, 'pending', ARRAY['processing']) INTO v_rpc_result;
  IF (v_rpc_result->>'success')::boolean IS FALSE AND v_rpc_result->>'reason' LIKE 'ILLEGAL_STATUS_TRANSITION%' THEN
    RAISE NOTICE 'TEST 7 REUSSI : RPC ne peut PAS contourner le trigger meme avec p_allowed_current permissif (%).', v_rpc_result;
  ELSE
    RAISE EXCEPTION 'TEST FAILED (etape 7) : la RPC a permis une transition illegale ! resultat = %', v_rpc_result;
  END IF;

  -- Etat reel actuel : 'processing' (test 5 a reussi, test 6/7 ont echoue
  -- sans modifier la ligne). Passe a 'canceled' (legal depuis 'processing')
  -- pour tester l'etat terminal.
  UPDATE shop_orders SET status = 'canceled' WHERE id = v_test_id;
  RAISE NOTICE 'TEST 8 REUSSI : transition legale processing->canceled appliquee sans erreur.';

  -- Test 9 : etat terminal reellement terminal -- canceled -> shipped DOIT
  -- etre rejetee (c'est le scenario exact du gap identifie et corrige dans
  -- orders/route.ts PATCH : sans le trigger, seule la garde applicative
  -- protegeait ce cas).
  BEGIN
    UPDATE shop_orders SET status = 'shipped' WHERE id = v_test_id;
    RAISE EXCEPTION 'TEST FAILED (etape 9) : la transition canceled->shipped aurait du etre rejetee';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'ILLEGAL_STATUS_TRANSITION%' THEN
        RAISE NOTICE 'TEST 9 REUSSI : transition canceled->shipped bien rejetee (%.)', SQLERRM;
      ELSE
        RAISE EXCEPTION 'TEST FAILED (etape 9, erreur inattendue) : %', SQLERRM;
      END IF;
  END;

  DELETE FROM shop_orders WHERE id = v_test_id;
  RAISE NOTICE 'Commande jetable supprimee (id=%). TOUS LES TESTS HOSTILES ONT REUSSI.', v_test_id;
END $$;
