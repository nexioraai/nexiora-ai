-- =============================================================
-- PHASE 2, ÉTAPE 4 DU PLAN — rendre `fulfillment_domain` obligatoire
-- ET IMMUABLE
-- Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md
--
-- ⚠️ À EXÉCUTER APRÈS le backfill (step2), jamais avant : SET NOT NULL
-- échouerait sur toute ligne restée NULL.
--
-- CE QUE CETTE ÉTAPE APPORTE, ET POURQUOI ELLE EST LE CŒUR DU CHANTIER.
--
-- Une colonne renseignée ne suffit pas. Toute la séparation repose sur une
-- propriété plus forte :
--
--     UNE COMMANDE CONSERVE SON DOMAINE D'EXÉCUTION,
--     INDÉPENDAMMENT DE TOUTE MODIFICATION FUTURE DU SITE.
--
-- Sans immutabilité, cette propriété ne serait qu'une convention : n'importe
-- quel UPDATE — applicatif, script, SQL direct — pourrait faire basculer une
-- commande d'un domaine à l'autre, et donc autoriser après coup un
-- fulfillment fournisseur sur une vente qui n'en relevait pas.
--
-- POURQUOI UN TRIGGER, ET PAS UN GRANT NI UNE POLICY.
--   * RLS : `service_role` la contourne entièrement. Sans effet.
--   * REVOKE UPDATE (colonne) : sans effet sur le propriétaire de la table.
--   * TRIGGER : s'applique à TOUS les rôles, `service_role` compris.
--
-- Ce n'est pas une supposition : ce dépôt applique DÉJÀ exactement ce patron
-- à la même table (shop_order_status_machine.sql), dont l'en-tête énonce
-- « bloque toute création directe [...] y compris via service_role/SQL
-- direct », propriété vérifiée comportementalement sur cette base le
-- 2026-08-22.
--
-- LIMITE HONNÊTE, IDENTIQUE À CELLE DÉJÀ ACCEPTÉE POUR `status` :
-- un rôle SUPERUSER peut désactiver un trigger (ALTER TABLE ... DISABLE
-- TRIGGER, ou session_replication_role='replica'). PostgreSQL n'offre pas
-- mieux. La garantie porte sur tout usage normal, applicatif comme manuel.
--
-- ROUND-TRIP TOLÉRÉ. Réécrire la MÊME valeur n'est pas une modification :
-- c'est la convention déjà retenue pour la machine à états des commandes.
-- Cela protège d'un futur code qui inclurait la colonne dans un UPDATE sans
-- vouloir la changer. Vérification préalable du dépôt : aucun chemin
-- n'écrit cette colonne hors de l'INSERT du checkout — les 23 UPDATE sur
-- shop_orders portent tous des payloads explicites, et le seul payload
-- dynamique (shop/orders PATCH) est construit côté serveur avec exactement
-- deux clés possibles (status, tracking_number). Aucun spread {...order}
-- n'existe nulle part dans le dépôt.
--
-- `BEFORE UPDATE OF fulfillment_domain` : le trigger ne se déclenche que si
-- la colonne figure dans le SET. Un UPDATE de `status` seul ne le réveille
-- pas — coût nul sur les chemins existants.
--
-- IDEMPOTENT : `drop trigger if exists` + `create or replace function`.
-- SET NOT NULL est sans effet si déjà posé.
-- =============================================================

-- 1/3 — la valeur devient obligatoire.
-- La branche `is null` du CHECK posé à l'étape 1 devient inatteignable ;
-- inutile de reconstruire la contrainte.
alter table shop_orders
  alter column fulfillment_domain set not null;

-- 2/3 — la valeur devient immuable.
create or replace function enforce_fulfillment_domain_immutable()
returns trigger
language plpgsql
security invoker
as $$
begin
  -- Réécriture de la même valeur : ce n'est pas une transition.
  -- Même convention que enforce_shop_order_status_transition().
  if new.fulfillment_domain is not distinct from old.fulfillment_domain then
    return new;
  end if;

  raise exception
    'FULFILLMENT_DOMAIN_IMMUTABLE: % -> % (order_id=%). Le domaine d''execution est decide a la creation de la commande et ne peut plus changer : une vente doit rester traitee selon le modele en vigueur au moment ou elle a ete passee.',
    old.fulfillment_domain, new.fulfillment_domain, old.id
    using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_enforce_fulfillment_domain_immutable on shop_orders;
create trigger trg_enforce_fulfillment_domain_immutable
  before update of fulfillment_domain on shop_orders
  for each row
  execute function enforce_fulfillment_domain_immutable();

-- 3/3 — privilèges.
-- ORDRE IMPÉRATIF : ce REVOKE doit rester APRÈS le create trigger.
-- PostgreSQL exige EXECUTE sur la fonction au moment du CREATE TRIGGER,
-- mais PAS à son déclenchement — propriété prouvée comportementalement sur
-- cette base (voir shop_order_status_machine.sql, même patron).
revoke all on function enforce_fulfillment_domain_immutable() from public, anon, authenticated;
grant execute on function enforce_fulfillment_domain_immutable() to service_role;

-- -------------------------------------------------------------
-- VÉRIFICATIONS APRÈS APPLICATION (lecture seule, à exécuter séparément).
--
-- a) la colonne est bien NOT NULL :
--   select is_nullable from information_schema.columns
--   where table_name='shop_orders' and column_name='fulfillment_domain';
--   -- attendu : NO
--
-- b) le trigger existe :
--   select tgname from pg_trigger
--   where tgrelid='shop_orders'::regclass
--     and tgname='trg_enforce_fulfillment_domain_immutable';
--   -- attendu : 1 ligne
--
-- c) PREUVE COMPORTEMENTALE — l'immutabilité tient réellement.
--    Sans elle, on n'aurait qu'une intention. Rollback systematique :
--    aucune donnee n'est modifiee.
--   begin;
--     update shop_orders set fulfillment_domain = 'merchant'
--     where fulfillment_domain = 'supplier';
--   rollback;
--   -- attendu : ERREUR 'FULFILLMENT_DOMAIN_IMMUTABLE: supplier -> merchant'
--   -- Si cette commande REUSSIT, le trigger ne protege rien : STOP.
--
-- d) le round-trip reste autorisé (ne doit PAS lever) :
--   begin;
--     update shop_orders set fulfillment_domain = fulfillment_domain
--     where id = (select id from shop_orders limit 1);
--   rollback;
--   -- attendu : UPDATE 1, aucune erreur
-- -------------------------------------------------------------
