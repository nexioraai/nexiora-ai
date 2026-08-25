-- ============================================================
-- M2-09 — `consume_promo_code` : LA SEULE RPC APPELEE SANS SCRIPT VERSIONNE.
--
-- LE CONSTAT, MESURE. Inventaire du depot : 12 RPC appelees par le code, 19
-- fonctions definies dans `supabase/sql/`, et **19 sur 19 portent un REVOKE
-- explicite**. Une seule fonction appelee n'a aucune definition versionnee :
-- `consume_promo_code`, invoquee par `handlePaidCheckout.ts` sur TOUTE
-- commande Mode 2 ou Mode 3 comportant un code promo.
--
-- CE QUE CELA COUTE. Son etat de privilege n'est ni documente ni
-- reproductible : une base recreee depuis ce depot n'aurait pas la fonction,
-- et personne ne peut relire ici ce qu'elle fait ni qui peut l'appeler.
--
-- CE QUI EST DEJA MESURE, ET RASSURANT. Sonde adversariale du 2026-08-25,
-- cle anon, UUID nul (donc 0 ligne appariee, aucune mutation possible) :
--   POST /rest/v1/rpc/consume_promo_code  ->  401, code 42501,
--   « permission denied for function consume_promo_code »
-- Le role `anon` ne peut donc PAS l'appeler. Le role `authenticated`, lui,
-- n'a PAS pu etre mesure : aucun JWT utilisateur n'est disponible ici et il
-- n'en a pas ete cree en production.
--
-- ============================================================
-- CE SCRIPT NE REDEFINIT PAS LA FONCTION, ET C'EST DELIBERE.
--
-- Sa definition vit uniquement en base : la reecrire de memoire, meme guidee
-- par le commentaire de `handlePaidCheckout.ts`, reviendrait a remplacer en
-- production une fonction qu'on ne peut pas relire. Une divergence subtile
-- casserait la consommation des codes promo -- exactement la migration
-- destructive a ne pas faire.
--
-- ETAPE 1 : EXTRAIRE (lecture seule). ETAPE 2 : DURCIR (additif, idempotent).
-- ETAPE 3, hors de ce fichier : coller la definition obtenue en 1 dans un
-- `supabase/sql/consume_promo_code.sql` propre, avec son patron REVOKE/GRANT.
-- ============================================================

-- ------------------------------------------------------------
-- 1/3 — EXTRACTION. Lecture seule. A executer et me renvoyer INTEGRALEMENT :
-- c'est cette sortie qui permettra de versionner la fonction pour de bon.
-- ------------------------------------------------------------
SELECT
  p.oid::regprocedure                         AS signature,
  pg_get_functiondef(p.oid)                   AS definition_complete,
  p.prosecdef                                 AS security_definer,
  pg_get_userbyid(p.proowner)                 AS proprietaire,
  p.proconfig                                 AS search_path_fige
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'consume_promo_code';

-- QUI PEUT L'APPELER AUJOURD'HUI ? C'est la question que la sonde REST n'a pu
-- trancher que pour `anon`. Attendu apres l'etape 2 : `service_role` seul.
SELECT
  r.rolname                                                   AS role,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE')         AS peut_appeler
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
WHERE n.nspname = 'public' AND p.proname = 'consume_promo_code';

-- ------------------------------------------------------------
-- 2/3 — DURCISSEMENT. Additif et idempotent : aucun DROP, aucune
-- redefinition, aucune donnee touchee. Applique le patron REVOKE/GRANT que
-- portent deja les 19 autres fonctions du depot.
--
-- SANS RISQUE POUR L'APPELANT LEGITIME : `handlePaidCheckout` s'execute sous
-- `supabaseAdmin`, donc sous `service_role`, qui conserve EXECUTE.
--
-- Auto-calcule sur la signature reelle : aucune liste d'arguments n'est
-- supposee ici, elle est lue depuis `pg_proc`.
-- ------------------------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'consume_promo_code'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    RAISE NOTICE 'durci : %', f.sig;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3/3 — VERIFICATION. A executer APRES l'etape 2 et me renvoyer.
-- Attendu : `anon` = false, `authenticated` = false, `service_role` = true.
-- ------------------------------------------------------------
SELECT
  r.rolname                                            AS role,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE')  AS peut_appeler
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
WHERE n.nspname = 'public' AND p.proname = 'consume_promo_code';
