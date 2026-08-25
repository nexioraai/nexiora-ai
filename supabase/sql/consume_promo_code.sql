-- ============================================================
-- M2-09 — `consume_promo_code`, ENFIN VERSIONNEE.
--
-- POURQUOI CE FICHIER N'EXISTAIT PAS, ET CE QUE CELA COUTAIT. L'audit Mode 2
-- a mesure 12 RPC appelees par le code contre 19 fonctions definies ici, et
-- exactement UNE appelee sans definition versionnee : celle-ci, invoquee par
-- `handlePaidCheckout.ts` sur TOUTE commande Mode 2 ou Mode 3 comportant un
-- code promo. Une base recreee depuis ce depot ne l'aurait pas eue, et
-- personne ne pouvait relire ici ce qu'elle fait.
--
-- LA DEFINITION CI-DESSOUS N'EST PAS REECRITE DE MEMOIRE. Elle a ete extraite
-- de la production le 2026-08-25 par `pg_get_functiondef`, puis reportee a
-- l'identique -- seule la mise en forme (indentation, sauts de ligne) differe,
-- la semantique est mot pour mot celle qui tourne.
--
-- CORROBORATION INDEPENDANTE, obtenue AVANT d'avoir la definition : un appel
-- REST sous `service_role` avec un UUID nul (donc 0 ligne appariee) a rendu
--   {"success": false, "reason": "DEPLETED_OR_INACTIVE_OR_NOT_FOUND"}
-- soit exactement la branche `v_updated = 0` ci-dessous. La forme de retour
-- attendue par `handlePaidCheckout` (`consumed?.success`, `consumed?.reason`)
-- est donc bien celle-ci.
--
-- CE QU'ELLE GARANTIT, et pourquoi c'est une RPC plutot qu'un SELECT suivi
-- d'un UPDATE : la clause `WHERE` est reevaluee par Postgres APRES acquisition
-- du verrou de ligne. Deux paiements simultanes se serialisent donc reellement
-- et `max_uses` ne peut pas etre depasse.
--
-- ============================================================
-- UN ECART AU PATRON DU DEPOT, CONSTATE ET DELIBEREMENT NON CORRIGE.
--
-- Les autres fonctions d'ici figent `SET search_path = ''`. Celle-ci ne le
-- fait pas : `proconfig` vaut NULL en production (mesure). Le lui ajouter ICI
-- ferait de ce fichier autre chose que ce qui tourne -- or son objet est
-- precisement de le reproduire, et l'executer modifierait alors la fonction
-- au lieu de la versionner.
--
-- Le risque reel est faible : la fonction est SECURITY INVOKER
-- (`prosecdef = false`, mesure), sa seule table est pleinement qualifiee
-- `public.promo_codes`, et depuis le durcissement ci-dessous seul
-- `service_role` peut l'appeler. CONSIGNE, HORS PERIMETRE M2-09 : aligner
-- `search_path` serait une modification de la production, pas une mise en
-- version.
-- ============================================================

CREATE OR REPLACE FUNCTION public.consume_promo_code(p_promo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.promo_codes
     SET used_count = used_count + 1
   WHERE id = p_promo_id
     AND active = true
     AND (max_uses IS NULL OR used_count < max_uses);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'DEPLETED_OR_INACTIVE_OR_NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- ------------------------------------------------------------
-- PATRON REVOKE/GRANT DU DEPOT.
--
-- PostgreSQL accorde `EXECUTE` a `PUBLIC` par defaut a la creation de toute
-- fonction : sans ces deux lignes, un `CREATE OR REPLACE` futur rouvrirait la
-- fonction a `anon` et `authenticated`. C'est exactement le defaut que
-- `shop_stock_functions.sql` a documente apres l'avoir constate en direct sur
-- `decrement_shop_stock_batch`.
--
-- DEJA APPLIQUE EN PRODUCTION le 2026-08-25 (etape 2 de
-- `consume_promo_code_versioning.sql`). Verifie apres coup :
--   anon = false . authenticated = false . service_role = true
-- Et corrobore independamment par sonde REST : `anon` recoit 42501,
-- `service_role` recoit 200 -- l'appelant legitime n'a pas ete casse.
--
-- `handlePaidCheckout` s'execute sous `supabaseAdmin`, donc sous
-- `service_role` : c'est le seul role qui en a besoin.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.consume_promo_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_promo_code(uuid) TO service_role;

-- ------------------------------------------------------------
-- VERIFICATION (lecture seule). Attendu :
--   anon = false . authenticated = false . service_role = true
-- ------------------------------------------------------------
SELECT
  r.rolname                                           AS role,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS peut_appeler
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
WHERE n.nspname = 'public' AND p.proname = 'consume_promo_code';
