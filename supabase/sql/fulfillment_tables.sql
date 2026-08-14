-- P0-3.7 / P0-3.8 — Fulfillment idempotence architecture (Printful/Gelato/CJ).
-- A executer manuellement dans l'editeur SQL Supabase (aucun outillage de
-- migration automatise n'existe dans ce repo).
--
-- Convention volontaire : pas de contrainte CHECK/enum sur les colonnes de
-- statut, coherent avec le reste du schema Woorri (aucune colonne de statut
-- existante n'est contrainte par un enum) — la validation vit cote
-- TypeScript (src/lib/fulfillment/types.ts). Voir P0-3.7Q Partie sur les
-- conventions de nommage.
--
-- Ne PAS executer en aval de shop_orders / shop_order_items si ces tables
-- n'existent pas encore dans l'environnement cible.

-- ============================================================
-- provider_submissions — un acte de soumission a UN fournisseur.
-- ============================================================
create table if not exists provider_submissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references shop_orders(id),
  provider text not null,
  idempotency_key text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_provider_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_submissions_provider_key_unique unique (provider, idempotency_key)
);
create index if not exists idx_provider_submissions_order on provider_submissions(order_id);

-- ============================================================
-- provider_submission_items — INTENTION : quels Fulfillment Units
-- cette submission visait, persiste au moment de la creation.
-- ============================================================
create table if not exists provider_submission_items (
  submission_id uuid not null references provider_submissions(id),
  fulfillment_unit_id uuid not null references shop_order_items(id),
  primary key (submission_id, fulfillment_unit_id)
);
create index if not exists idx_provider_submission_items_unit on provider_submission_items(fulfillment_unit_id);

-- ============================================================
-- provider_orders — commande reelle creee chez le fournisseur
-- (= un "connected order" Gelato quand elle a des soeurs).
-- ============================================================
create table if not exists provider_orders (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references provider_submissions(id),
  provider text not null,
  provider_order_id text not null,
  raw_provider_status text,
  normalized_status text not null default 'pending',
  last_provider_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_orders_provider_order_id_unique unique (provider, provider_order_id),
  -- Necessaire pour supporter la FK composite de provider_order_items ci-dessous.
  constraint provider_orders_id_submission_unique unique (id, submission_id)
);
create index if not exists idx_provider_orders_submission on provider_orders(submission_id);

-- ============================================================
-- provider_order_items — RESULTAT : quels Fulfillment Units sont
-- reellement associes a quel Provider Order.
--
-- Deux FK composites (P0-3.7V Partie 5) :
--  1. (submission_id, fulfillment_unit_id) doit avoir existe comme
--     INTENTION dans provider_submission_items — empeche un resultat
--     sans intention prealable.
--  2. (provider_order_id, submission_id) doit correspondre au
--     submission_id reel du provider_orders parent — empeche
--     l'incoherence G1->S1 (table) vs G1 item->S2 (P0-3.7V Partie 5-6).
--
-- UNIQUE(submission_id, fulfillment_unit_id) : empeche qu'un item
-- apparaisse deux fois au sein de la MEME submission (P0-3.7U Partie 14).
-- Consequence assumee et documentee (P0-3.7X Partie 5) : le split de
-- quantite d'un meme item entre plusieurs Provider Orders au sein d'une
-- submission N'EST PAS supporte par ce schema — NON DEMONTRE, non construit.
-- ============================================================
create table if not exists provider_order_items (
  provider_order_id uuid not null references provider_orders(id),
  submission_id uuid not null,
  fulfillment_unit_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (provider_order_id, fulfillment_unit_id),
  constraint provider_order_items_intent_fk
    foreign key (submission_id, fulfillment_unit_id)
    references provider_submission_items(submission_id, fulfillment_unit_id),
  constraint provider_order_items_order_submission_fk
    foreign key (provider_order_id, submission_id)
    references provider_orders(id, submission_id),
  constraint provider_order_items_submission_unit_unique unique (submission_id, fulfillment_unit_id)
);
create index if not exists idx_provider_order_items_unit on provider_order_items(fulfillment_unit_id);

-- ============================================================
-- fulfillment_unit_active_submission — pointeur : UNE SEULE
-- submission active par Fulfillment Unit (P0-3.7U/V/Z).
--
-- N'est JAMAIS supprime, seulement deplace (P0-3.7V Partie 1,
-- correction de la semantique initiale P0-3.7U).
-- ============================================================
create table if not exists fulfillment_unit_active_submission (
  fulfillment_unit_id uuid primary key references shop_order_items(id),
  active_submission_id uuid not null references provider_submissions(id),
  updated_at timestamptz not null default now()
);
create index if not exists idx_active_submission_submission on fulfillment_unit_active_submission(active_submission_id);

-- ============================================================
-- Reference de rang pour la progression monotone des statuts de
-- Provider Order (P0-3.7W/X — modele categoriel, pas un rang total :
-- ce rang ne s'applique QU'A la progression pending..delivered ; les
-- branches (failed, unrecognized) sont gerees explicitement dans la
-- fonction apply_provider_order_status, pas via ce rang seul).
-- ============================================================
create table if not exists fulfillment_status_rank (
  status text primary key,
  rank integer not null
);
insert into fulfillment_status_rank (status, rank) values
  ('pending', 1),
  ('processing', 2),
  ('shipped', 3),
  ('in_transit', 4),
  ('delivered', 5)
on conflict (status) do nothing;
