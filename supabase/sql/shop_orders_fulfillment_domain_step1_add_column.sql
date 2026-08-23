-- =============================================================
-- PHASE 2, ÉTAPE 1 — séparation Mode 2 / Mode 3
-- Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md
--
-- Ajoute `shop_orders.fulfillment_domain` : QUI exécute cette vente.
-- Deux valeurs, jamais davantage :
--     'merchant'  -- le marchand détient le stock, prépare et expédie
--     'supplier'  -- un fournisseur exécute (Nexiora avance le coût)
--
-- CE QUE CETTE COLONNE N'EST PAS.
-- Ce n'est pas une copie du mode du site, ni un sous-type. Le mode qualifie
-- un SITE ; cette colonne qualifie une COMMANDE. La nuance est opérante :
-- une commande d'un site fournisseur ne contenant que des produits du
-- marchand vaut quand même 'supplier' — le domaine décrit le CHEMIN
-- D'EXÉCUTION autorisé, pas la composition du panier.
--
-- POURQUOI SUR LA COMMANDE ET PAS DÉRIVÉE DU SITE.
-- 1. `shop_orders` capture DÉJÀ les termes commerciaux en vigueur au moment
--    de la vente : payment_account_id, supplier_cost, nexiora_commission,
--    merchant_profit, shipping_amount. Le domaine est de même nature — cette
--    colonne applique un motif que la table respecte déjà partout ailleurs.
-- 2. Une commande doit rester traitée selon le modèle en vigueur AU MOMENT
--    DE LA VENTE, quoi qu'il advienne de la configuration du site ensuite.
-- 3. Elle rend l'aiguillage aval un simple LOOKUP au lieu d'une DÉCISION.
--    Un aiguillage qui ne décide rien ne peut pas devenir un point de fusion
--    entre les deux domaines — c'est la propriété centrale du chantier.
--
-- SÉQUENCE EXPAND / CONTRACT — même patron que
-- sites_owner_id_step1_add_column.sql / step2_backfill.sql.
--   ÉTAPE 1 (ce fichier)  colonne NULLABLE + CHECK tolérant le NULL
--   ÉTAPE 2 (applicatif)  le checkout écrit la valeur à chaque création
--   ÉTAPE 3 (bloquée)     backfill des commandes historiques — CONDITIONNÉ
--                         à une mesure préalable ; aucune valeur ne doit
--                         être devinée (voir §12 du plan)
--   ÉTAPE 4 (plus tard)   SET NOT NULL + trigger d'immutabilité
--
-- ⚠️ ORDRE D'APPLICATION IMPÉRATIF : ce script doit être exécuté AVANT le
-- déploiement du code applicatif de l'étape 2. Dans le cas inverse, chaque
-- INSERT de commande échouerait (colonne inconnue) — donc chaque checkout.
-- L'échec serait immédiat et bruyant, jamais silencieux, mais total.
--
-- POURQUOI LE CHECK DÈS MAINTENANT, ALORS QUE LE PLAN LE PRÉVOYAIT EN
-- ÉTAPE 4 : il tolère le NULL (indispensable pendant la fenêtre de
-- migration) tout en rendant une valeur invalide impossible dès le premier
-- jour. Rien ne justifiait d'attendre. L'étape 4 n'aura qu'à ajouter
-- SET NOT NULL — la branche `is null` deviendra alors inatteignable, sans
-- qu'il soit nécessaire de reconstruire la contrainte.
--
-- IDEMPOTENT : `add column if not exists` + contrainte ajoutée seulement si
-- absente. Ce script peut être rejoué sans effet de bord.
-- =============================================================

alter table shop_orders
  add column if not exists fulfillment_domain text;

comment on column shop_orders.fulfillment_domain is
  'Qui exécute cette vente : ''merchant'' (le marchand détient le stock et expédie) ou ''supplier'' (un fournisseur exécute). Décidé UNE SEULE FOIS à la création de la commande, à partir du seul mode du site, et jamais recalculé ensuite — le fulfillment lit cette colonne, jamais sites.mode. NULL uniquement pour les commandes antérieures à la migration, tant que le backfill n''a pas eu lieu.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shop_orders_fulfillment_domain_valide'
      and conrelid = 'shop_orders'::regclass
  ) then
    alter table shop_orders
      add constraint shop_orders_fulfillment_domain_valide
      check (fulfillment_domain is null
             or fulfillment_domain in ('merchant', 'supplier'));
  end if;
end
$$;

-- -------------------------------------------------------------
-- VÉRIFICATION APRÈS APPLICATION (lecture seule, à exécuter à part) :
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'shop_orders' and column_name = 'fulfillment_domain';
--
-- Attendu : une ligne, text, YES.
-- -------------------------------------------------------------
